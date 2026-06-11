/**
 * Image Tools editor: client-side upscaler and background removal.
 * Everything runs locally in the browser — no AI calls, no tokens spent.
 *
 * Pure algorithms live in bg-removal.js / upscaler.js; this module is the
 * DOM controller (modal shell, tabs, brushes, save/download plumbing).
 *
 * Each tab owns its own image: opening from the gallery seeds both tabs with
 * that image, while uploads inside the editor only load into the active tab.
 */

import { elements } from './elements.js';
import { state, MODEL_CONFIGS } from './state.js';
import ImagenDB from './db.js';
import { showToast, approxKB, readFileAsDataURI } from './utils.js';
import { activateFocusTrap } from './ui.js';
import { prependImageCard } from './gallery.js';
import { runImageEdit } from './api.js';
import {
    detectBackgroundMask,
    featherMask,
    stampCircle,
    strokeSegment,
    localRegionGrow,
    applyMaskAlpha,
    maskKeepFraction,
    chromaKeyMask,
    dilateMaskIntoSimilar,
    toleranceToThreshold2,
    MaskHistory
} from './bg-removal.js';
import { isScaleAllowed, computeTargetDims, formatDims, upscaleCanvas, canvasToBlob } from './upscaler.js';

// Background-removal working copies are capped so masks, undo snapshots and
// per-frame compositing stay responsive. The upscale tab is never downscaled.
const BG_MAX_PIXELS = 16 * 1024 * 1024;
// Saving enormous data URIs into IndexedDB bloats browser storage.
const SAVE_WARN_KB = 25 * 1024;
// Auto-detect results that wipe almost the whole image are reverted. A real
// wipe (busy screenshots etc.) keeps ~0%; legitimate small subjects (logos,
// products) can be a few percent — so the bar sits low.
const MIN_KEEP_FRACTION = 0.02;

// AI assist: the model repaints the background a solid key color, which we
// then chroma-key away locally. Image models can't output transparency.
const AI_ASSIST_MODEL = 'google/gemini-2.5-flash-image';
const AI_KEY_COLOR = [255, 0, 255];
const AI_KEY_TOLERANCE = 28; // eats magenta-blend fringe, keeps hot-pink subjects
const AI_MAX_SIDE = 1536;
const AI_ASSIST_INSTRUCTION =
    'Redraw this exact image, identical in every detail — same subject, same pose, ' +
    'same colors, same line art, same framing — but replace the entire background ' +
    'with solid flat magenta (#FF00FF). Do not add, remove, or alter anything about ' +
    'the subject. Output only the image.';

const tools = {
    open: false,
    activeTab: 'upscale', // 'upscale' | 'bg'
    upscale: {
        sourceCanvas: null,
        sourceRecord: null, // gallery record, or null for uploads
        resultCanvas: null,
        compareOn: false,
        comparePct: 50,
        scale: 2
    },
    bg: {
        sourceCanvas: null,
        sourceRecord: null,
        bgCanvas: null, // working copy (possibly downscaled)
        bgData: null, // ImageData of bgCanvas
        initialized: false,
        mask: null,
        history: new MaskHistory(10)
    },
    brush: { mode: 'remove', size: 24, smart: false },
    tolerance: 30,
    feather: 1,
    stroking: false,
    comparing: false, // dragging the compare split on the canvas
    lastPoint: null,
    processing: false,
    cancelCurrent: null
};

let _releaseTrap = null;
let _renderQueued = false;
let _brushCursor = null;

export function isImageToolsOpen() {
    return tools.open;
}

function activeWorkspace() {
    return tools.activeTab === 'upscale' ? tools.upscale : tools.bg;
}

/** Load a dropped/picked file into the editor (used by the page-wide drop handler). */
export async function loadFileIntoImageTools(file) {
    if (!tools.open) return;
    await loadSourceFromFile(file);
}

export async function openImageTools(imageRecord = null) {
    if (tools.open) return;
    tools.open = true;
    elements.toolsModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    _releaseTrap = activateFocusTrap(elements.toolsModal.querySelector('.modal-content'));
    document.addEventListener('keydown', handleToolsKeydown);

    clearTabWorkspace('upscale');
    clearTabWorkspace('bg');
    setActiveTab('upscale');

    if (imageRecord) {
        // Seed BOTH tabs: "edit this image" should work in either tool. The
        // decoded canvas is read-only in both (bg makes its own working copy).
        const canvas = await decodeRecordToCanvas(imageRecord);
        if (canvas) {
            setTabSource('upscale', canvas, imageRecord);
            setTabSource('bg', canvas, imageRecord);
        }
    }
    refreshStage();
}

export function closeImageTools() {
    if (!tools.open) return;
    if (tools.processing && !confirm('Processing is still running — close anyway?')) return;

    if (tools.cancelCurrent) tools.cancelCurrent();
    tools.open = false;
    elements.toolsModal.classList.remove('active');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleToolsKeydown);
    if (_releaseTrap) {
        _releaseTrap();
        _releaseTrap = null;
    }
    clearTabWorkspace('upscale');
    clearTabWorkspace('bg');
    // Drop the display canvas backing store so the GC can reclaim it
    if (elements.toolsCanvas) {
        elements.toolsCanvas.width = 0;
        elements.toolsCanvas.height = 0;
    }
    refreshStage();
}

export function initImageTools() {
    if (!elements.toolsModal) return;

    elements.toolsClose.addEventListener('click', closeImageTools);
    elements.toolsOverlay.addEventListener('click', closeImageTools);

    elements.toolsTabUpscale.addEventListener('click', () => setActiveTab('upscale'));
    elements.toolsTabBg.addEventListener('click', () => setActiveTab('bg'));

    // --- Source loading: file picker, drag-drop, paste (active tab only) ---
    elements.toolsUploadBtn.addEventListener('click', () => elements.toolsFileInput.click());
    elements.toolsFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadSourceFromFile(file);
        e.target.value = '';
    });

    elements.toolsChangeImage.addEventListener('click', () => {
        if (tools.processing) return;
        clearTabWorkspace(tools.activeTab);
        refreshStage();
    });

    const stageWrap = elements.toolsModal.querySelector('.tools-stage-wrap');
    ['dragenter', 'dragover'].forEach(evt =>
        stageWrap.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            stageWrap.classList.add('drag-over');
        })
    );
    ['dragleave', 'drop'].forEach(evt =>
        stageWrap.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            stageWrap.classList.remove('drag-over');
        })
    );
    stageWrap.addEventListener('drop', (e) => {
        const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
        if (file) loadSourceFromFile(file);
    });

    document.addEventListener('paste', (e) => {
        if (!tools.open) return;
        const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const file = item.getAsFile();
        if (file) loadSourceFromFile(file);
    }, true); // capture phase so the app-wide reference-paste handler never sees it

    // --- Upscale tab ---
    elements.upscaleScaleGroup.querySelectorAll('.tools-seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            elements.upscaleScaleGroup.querySelectorAll('.tools-seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tools.upscale.scale = Number(btn.dataset.scale);
            updateInfoLine();
        });
    });

    elements.upscaleRun.addEventListener('click', runUpscale);

    elements.upscaleCompareToggle.addEventListener('click', () => {
        const us = tools.upscale;
        if (!us.resultCanvas) return;
        us.compareOn = !us.compareOn;
        elements.upscaleCompareToggle.classList.toggle('active', us.compareOn);
        elements.upscaleCompareToggle.setAttribute('aria-pressed', String(us.compareOn));
        elements.compareSliderRow.hidden = !us.compareOn;
        requestRender();
    });

    elements.compareSlider.addEventListener('input', () => {
        tools.upscale.comparePct = Number(elements.compareSlider.value);
        requestRender();
    });

    elements.upscaleDownload.addEventListener('click', () => {
        if (!tools.upscale.resultCanvas) return;
        const fmt = getUpscaleFormat();
        downloadCanvas(tools.upscale.resultCanvas, fmt.type, fmt.quality, fmt.ext);
    });
    elements.upscaleSave.addEventListener('click', () => {
        const us = tools.upscale;
        if (!us.resultCanvas) return;
        const fmt = getUpscaleFormat();
        saveCanvasToGallery(us.resultCanvas, us.sourceRecord, `(upscaled ${us.scale}x)`, fmt.type, fmt.quality);
    });

    // --- Background removal tab ---
    elements.bgTolerance.addEventListener('input', () => {
        tools.tolerance = Number(elements.bgTolerance.value);
        elements.bgToleranceValue.textContent = String(tools.tolerance);
    });

    elements.bgAutoDetect.addEventListener('click', async () => {
        if (!tools.bg.bgData || tools.processing) return;
        if (tools.bg.history.canUndo &&
            !confirm('Auto-detect replaces your manual brush edits. Continue?')) {
            return;
        }
        await runAutoDetect();
    });

    if (elements.bgAiAssist) {
        elements.bgAiAssist.addEventListener('click', runAiAssist);
    }

    elements.bgBrushModeGroup.querySelectorAll('.tools-seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.bgBrushModeGroup.querySelectorAll('.tools-seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tools.brush.mode = btn.dataset.brush;
        });
    });

    elements.bgSmartBrush.addEventListener('change', () => {
        tools.brush.smart = elements.bgSmartBrush.checked;
    });

    elements.bgBrushSize.addEventListener('input', () => {
        setBrushSize(Number(elements.bgBrushSize.value));
    });

    elements.bgFeather.addEventListener('input', () => {
        tools.feather = Number(elements.bgFeather.value);
        elements.bgFeatherValue.textContent = String(tools.feather);
        requestRender();
    });

    elements.bgUndo.addEventListener('click', () => {
        const bg = tools.bg;
        const prev = bg.history.undo(bg.mask);
        if (prev) {
            bg.mask = prev;
            updateUndoRedoButtons();
            requestRender();
        }
    });
    elements.bgRedo.addEventListener('click', () => {
        const bg = tools.bg;
        const next = bg.history.redo(bg.mask);
        if (next) {
            bg.mask = next;
            updateUndoRedoButtons();
            requestRender();
        }
    });
    elements.bgReset.addEventListener('click', () => {
        const bg = tools.bg;
        if (!bg.mask) return;
        bg.history.push(bg.mask);
        bg.mask.fill(255);
        updateUndoRedoButtons();
        requestRender();
    });

    elements.bgDownload.addEventListener('click', () => {
        const result = buildBgResultCanvas();
        if (result) downloadCanvas(result, 'image/png', undefined, 'png');
    });
    elements.bgSave.addEventListener('click', () => {
        const result = buildBgResultCanvas();
        if (result) saveCanvasToGallery(result, tools.bg.sourceRecord, '(background removed)', 'image/png');
    });

    elements.toolsCancel.addEventListener('click', () => {
        if (tools.cancelCurrent) tools.cancelCurrent();
    });

    setupCanvasPointerEvents();
}

// ===== Tabs & stage visibility =====
function setActiveTab(tab) {
    tools.activeTab = tab;
    const isUpscale = tab === 'upscale';
    elements.toolsTabUpscale.classList.toggle('active', isUpscale);
    elements.toolsTabBg.classList.toggle('active', !isUpscale);
    elements.toolsTabUpscale.setAttribute('aria-selected', String(isUpscale));
    elements.toolsTabBg.setAttribute('aria-selected', String(!isUpscale));
    elements.upscalePanel.hidden = !isUpscale;
    elements.bgPanel.hidden = isUpscale;
    elements.toolsStage.classList.toggle('checkerboard', !isUpscale);
    if (_brushCursor) _brushCursor.hidden = isUpscale;

    if (!isUpscale && tools.bg.sourceCanvas && !tools.bg.initialized) {
        initBgWorkspace();
    }
    refreshStage();
}

/** Sync the stage/empty-state/buttons to the ACTIVE tab's workspace. */
function refreshStage() {
    const hasSource = Boolean(activeWorkspace().sourceCanvas);
    if (elements.toolsEmpty) elements.toolsEmpty.hidden = hasSource;
    if (elements.toolsStage) elements.toolsStage.hidden = !hasSource;
    if (elements.toolsChangeImage) elements.toolsChangeImage.hidden = !hasSource;
    updateScaleButtons();
    updateUpscaleActionState();
    updateBgActionState();
    updateUndoRedoButtons();
    updateInfoLine();
    requestRender();
}

// ===== Source loading =====
function decodeImage(url, crossOrigin = false) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.src = url;
    });
}

function canvasFromDrawable(drawable, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(drawable, 0, 0);
    return canvas;
}

async function loadSourceFromFile(file) {
    try {
        let canvas;
        if (typeof createImageBitmap === 'function') {
            const bmp = await createImageBitmap(file);
            canvas = canvasFromDrawable(bmp, bmp.width, bmp.height);
            bmp.close?.();
        } else {
            const dataUri = await readFileAsDataURI(file);
            const img = await decodeImage(dataUri);
            canvas = canvasFromDrawable(img, img.naturalWidth, img.naturalHeight);
        }
        setTabSource(tools.activeTab, canvas, null);
        refreshStage();
    } catch (e) {
        console.error('Image Tools: failed to load file', e);
        showToast('Could not load that file as an image', 'error');
    }
}

async function decodeRecordToCanvas(record) {
    try {
        if (record.url.startsWith('data:')) {
            const img = await decodeImage(record.url);
            return canvasFromDrawable(img, img.naturalWidth, img.naturalHeight);
        }
        // Remote image: canvas readback requires CORS-clean pixels. Try fetch
        // first, then a crossOrigin-tagged <img>. If both fail there is no
        // client-side workaround (a tainted canvas throws on getImageData).
        try {
            const resp = await fetch(record.url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const bmp = await createImageBitmap(blob);
            const canvas = canvasFromDrawable(bmp, bmp.width, bmp.height);
            bmp.close?.();
            return canvas;
        } catch {
            const img = await decodeImage(record.url, true);
            const canvas = canvasFromDrawable(img, img.naturalWidth, img.naturalHeight);
            canvas.getContext('2d').getImageData(0, 0, 1, 1); // taint probe
            return canvas;
        }
    } catch (e) {
        console.error('Image Tools: failed to load gallery image', e);
        showToast('This image is hosted remotely and blocks browser editing. Download it, then upload it here as a file.', 'error');
        return null;
    }
}

function setTabSource(tab, canvas, record) {
    clearTabWorkspace(tab);
    const ws = tab === 'upscale' ? tools.upscale : tools.bg;
    ws.sourceCanvas = canvas;
    ws.sourceRecord = record;
    if (tab === 'bg' && tools.activeTab === 'bg') {
        initBgWorkspace();
    }
}

function clearTabWorkspace(tab) {
    if (tab === 'upscale') {
        const us = tools.upscale;
        us.sourceCanvas = null;
        us.sourceRecord = null;
        us.resultCanvas = null;
        us.compareOn = false;
        if (elements.upscaleCompareToggle) {
            elements.upscaleCompareToggle.classList.remove('active');
            elements.upscaleCompareToggle.setAttribute('aria-pressed', 'false');
        }
        if (elements.compareSliderRow) elements.compareSliderRow.hidden = true;
    } else {
        const bg = tools.bg;
        bg.sourceCanvas = null;
        bg.sourceRecord = null;
        bg.bgCanvas = null;
        bg.bgData = null;
        bg.initialized = false;
        bg.mask = null;
        bg.history.clear();
    }
}

// ===== Background workspace =====
/**
 * Build the working copy (bgCanvas/bgData/blank mask) from a source canvas.
 * Returns false when the pixels can't be read (CORS taint).
 */
function setupBgWorkingCopy(src) {
    const bg = tools.bg;
    let w = src.width;
    let h = src.height;
    if (w * h > BG_MAX_PIXELS) {
        const factor = Math.sqrt(BG_MAX_PIXELS / (w * h));
        w = Math.max(1, Math.floor(w * factor));
        h = Math.max(1, Math.floor(h * factor));
        showToast(`Working at ${w}×${h} for background removal (original is very large)`, 'info');
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);

    bg.bgCanvas = canvas;
    try {
        bg.bgData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
        console.error('Image Tools: canvas readback failed', e);
        showToast('Cannot edit this image — its pixels are blocked by the browser (CORS).', 'error');
        clearTabWorkspace('bg');
        refreshStage();
        return false;
    }
    bg.mask = new Uint8Array(w * h).fill(255);
    bg.initialized = true;
    updateBgActionState();
    return true;
}

async function initBgWorkspace() {
    const bg = tools.bg;
    if (!bg.sourceCanvas) return;
    if (!setupBgWorkingCopy(bg.sourceCanvas)) return;
    await runAutoDetect();
}

/**
 * AI-assisted removal: ask an image model to repaint the background a solid
 * key color, then chroma-key that color away locally. Charges the user's
 * OpenRouter account — always confirm with a cost estimate first, and never
 * retry automatically.
 */
async function runAiAssist() {
    const bg = tools.bg;
    if (!bg.initialized || tools.processing) return;
    if (!state.apiKey) {
        showToast('Save your OpenRouter API key first', 'error');
        return;
    }

    const modelName = MODEL_CONFIGS[AI_ASSIST_MODEL]?.name || AI_ASSIST_MODEL;
    const cost = MODEL_CONFIGS[AI_ASSIST_MODEL]?.approxImageCost;
    const costText = cost ? `≈ $${cost}` : 'a small amount';
    if (!confirm(
        `AI assist sends this image to ${modelName} via OpenRouter and will charge your account ${costText}. ` +
        `The AI's version of the image replaces your working copy. Continue?`
    )) {
        return;
    }

    // Keep the upload (and the model's work) modest
    const src = bg.bgCanvas;
    let w = src.width;
    let h = src.height;
    if (Math.max(w, h) > AI_MAX_SIDE) {
        const factor = AI_MAX_SIDE / Math.max(w, h);
        w = Math.round(w * factor);
        h = Math.round(h * factor);
    }
    const sendCanvas = document.createElement('canvas');
    sendCanvas.width = w;
    sendCanvas.height = h;
    sendCanvas.getContext('2d').drawImage(src, 0, 0, w, h);
    const dataUri = sendCanvas.toDataURL('image/png');

    const controller = new AbortController();
    tools.cancelCurrent = () => controller.abort();
    setProcessing(true, 'AI is repainting the background…');
    try {
        const resultUrl = await runImageEdit(dataUri, AI_ASSIST_INSTRUCTION, AI_ASSIST_MODEL, {
            signal: controller.signal
        });
        const img = await decodeImage(resultUrl);
        const aiCanvas = canvasFromDrawable(img, img.naturalWidth, img.naturalHeight);

        // Gate on the AI image BEFORE touching the user's workspace
        const aiCtx = aiCanvas.getContext('2d', { willReadFrequently: true });
        const aiData = aiCtx.getImageData(0, 0, aiCanvas.width, aiCanvas.height);
        const mask = chromaKeyMask(aiData.data, aiCanvas.width, aiCanvas.height, AI_KEY_COLOR, AI_KEY_TOLERANCE);
        const keep = maskKeepFraction(mask);
        const removedFrac = 1 - keep;
        if (removedFrac < 0.01) {
            showToast("The model didn't replace the background — your image is unchanged. (The attempt was still billed.)", 'warning');
            return;
        }
        if (keep < MIN_KEEP_FRACTION) {
            showToast('The model returned mostly key color — your image is unchanged. (The attempt was still billed.)', 'warning');
            return;
        }

        // Success: the AI output becomes the working image (sourceRecord is
        // kept so saved results still point at the original gallery entry)
        bg.sourceCanvas = aiCanvas;
        if (!setupBgWorkingCopy(aiCanvas)) return;
        // aiCanvas is ≤ AI_MAX_SIDE² « BG_MAX_PIXELS, so the working copy has
        // identical dimensions and the gate mask can be reused directly
        bg.mask = mask;
        const removedFlags = new Uint8Array(mask.length);
        for (let i = 0; i < mask.length; i++) removedFlags[i] = mask[i] === 0 ? 1 : 0;
        dilateMaskIntoSimilar(
            bg.mask, removedFlags, bg.bgData.data,
            bg.bgCanvas.width, bg.bgCanvas.height,
            [AI_KEY_COLOR], toleranceToThreshold2(AI_KEY_TOLERANCE) / 2
        );
        bg.history.clear();
        updateUndoRedoButtons();
        updateInfoLine();
        requestRender();
        showToast(`AI removed ~${Math.round(removedFrac * 100)}% as background — fix any leftovers with the brushes`, 'success');
    } catch (e) {
        if (controller.signal.aborted || e.name === 'AbortError') {
            showToast('AI assist cancelled', 'info');
        } else {
            console.error('AI assist failed:', e);
            showToast('AI assist failed: ' + (e.message || e), 'error');
        }
    } finally {
        tools.cancelCurrent = null;
        setProcessing(false);
    }
}

function setToleranceUi(value) {
    tools.tolerance = value;
    if (elements.bgTolerance) elements.bgTolerance.value = String(value);
    if (elements.bgToleranceValue) elements.bgToleranceValue.textContent = String(value);
}

async function runAutoDetect() {
    const bg = tools.bg;
    setProcessing(true, 'Detecting background…');
    try {
        // Let the progress UI paint before the synchronous fill work starts
        await new Promise(resolve => setTimeout(resolve, 30));
        const { width, height } = bg.bgCanvas;
        bg.history.clear();
        let mask = detectBackgroundMask(bg.bgData.data, width, height, tools.tolerance);
        let keep = maskKeepFraction(mask);
        let retriedAt = null;

        // A wiped result usually means the tolerance is too high for this
        // image — try once at half before giving up.
        if (keep < MIN_KEEP_FRACTION && tools.tolerance >= 10) {
            const lower = Math.round(tools.tolerance / 2);
            const retryMask = detectBackgroundMask(bg.bgData.data, width, height, lower);
            const retryKeep = maskKeepFraction(retryMask);
            if (retryKeep >= MIN_KEEP_FRACTION) {
                mask = retryMask;
                keep = retryKeep;
                retriedAt = lower;
                setToleranceUi(lower); // keep the slider (and the wand) in sync
            }
        }

        if (keep < MIN_KEEP_FRACTION) {
            // A busy image (e.g. a screenshot) can connect everything to the
            // border colors and the fill eats the whole picture. Showing a
            // blank checkerboard helps nobody — revert and explain.
            bg.mask = new Uint8Array(width * height).fill(255);
            showToast('Auto-detect removed almost everything — this background may be too complex. Lower the tolerance or use the brushes.', 'warning');
        } else {
            bg.mask = mask;
            const pct = Math.round((1 - keep) * 100);
            showToast(retriedAt !== null
                ? `Tolerance was too high — retried at ${retriedAt} and removed ~${pct}% as background`
                : `Removed ~${pct}% of the image as background`, 'success');
        }
        updateUndoRedoButtons();
        updateInfoLine();
        requestRender();
    } finally {
        setProcessing(false);
    }
}

/** Composite the full-quality cutout (with feather) into a fresh canvas. */
function buildBgResultCanvas() {
    const bg = tools.bg;
    if (!bg.bgCanvas || !bg.mask) return null;
    const { width, height } = bg.bgCanvas;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const mask = tools.feather > 0
        ? featherMask(bg.mask, width, height, tools.feather)
        : bg.mask;
    applyMaskAlpha(bg.bgData.data, mask, imageData.data);
    ctx.putImageData(imageData, 0, 0);
    return out;
}

// ===== Canvas pointer interaction (BG brushes + compare drag) =====
function setupCanvasPointerEvents() {
    const canvas = elements.toolsCanvas;
    if (!canvas) return;

    _brushCursor = document.createElement('div');
    _brushCursor.className = 'tools-brush-cursor';
    _brushCursor.hidden = true;
    elements.toolsStage.appendChild(_brushCursor);

    canvas.addEventListener('pointerdown', (e) => {
        if (tools.processing) return;
        if (tools.activeTab === 'upscale') {
            const us = tools.upscale;
            if (us.compareOn && us.resultCanvas) {
                e.preventDefault();
                canvas.setPointerCapture(e.pointerId);
                tools.comparing = true;
                setComparePctFromEvent(e);
            }
            return;
        }
        if (!tools.bg.mask) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        tools.stroking = true;
        tools.bg.history.push(tools.bg.mask);
        updateUndoRedoButtons();
        const pt = canvasPoint(e);
        applyBrush(pt, null);
        tools.lastPoint = pt;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (tools.comparing) {
            setComparePctFromEvent(e);
            return;
        }
        updateBrushCursor(e);
        if (!tools.stroking) return;
        const pt = canvasPoint(e);
        applyBrush(pt, tools.lastPoint);
        tools.lastPoint = pt;
    });

    const endStroke = () => {
        tools.comparing = false;
        if (!tools.stroking) return;
        tools.stroking = false;
        tools.lastPoint = null;
        requestRender(); // full-quality composite (with feather) after the stroke
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', () => {
        if (_brushCursor) _brushCursor.style.opacity = '0';
    });
    canvas.addEventListener('pointerenter', () => {
        if (_brushCursor) _brushCursor.style.opacity = '1';
    });
}

function setComparePctFromEvent(e) {
    const canvas = elements.toolsCanvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    tools.upscale.comparePct = pct;
    elements.compareSlider.value = String(Math.round(pct));
    requestRender();
}

function canvasPoint(e) {
    const canvas = elements.toolsCanvas;
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * canvas.width / rect.width,
        y: (e.clientY - rect.top) * canvas.height / rect.height
    };
}

function applyBrush(pt, last) {
    const bg = tools.bg;
    const { width, height } = bg.bgCanvas;
    const radius = tools.brush.size;
    const value = tools.brush.mode === 'keep' ? 255 : 0;
    if (tools.brush.smart) {
        // Magic-wand selection: grab the whole contiguous similar-color
        // region (no radius cap) and remove or restore it. Each pointer
        // sample fires a wand, so drags need no segment interpolation —
        // re-samples inside an already-converted region are O(1) no-ops.
        const sx = Math.round(pt.x);
        const sy = Math.round(pt.y);
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;
        if (bg.mask[sy * width + sx] === value) return;
        const { indices, count } = localRegionGrow(
            bg.bgData.data, width, height, pt.x, pt.y, tools.tolerance
        );
        for (let i = 0; i < count; i++) bg.mask[indices[i]] = value;
    } else if (last) {
        strokeSegment(bg.mask, width, height, last.x, last.y, pt.x, pt.y, radius, value);
    } else {
        stampCircle(bg.mask, width, height, pt.x, pt.y, radius, value);
    }
    requestRender();
}

function setBrushSize(size) {
    tools.brush.size = Math.max(4, Math.min(128, size));
    elements.bgBrushSize.value = String(tools.brush.size);
    elements.bgBrushSizeValue.textContent = String(tools.brush.size);
}

function updateBrushCursor(e) {
    if (!_brushCursor || tools.activeTab !== 'bg' || !tools.bg.bgCanvas) return;
    const canvas = elements.toolsCanvas;
    const rect = canvas.getBoundingClientRect();
    const stageRect = elements.toolsStage.getBoundingClientRect();
    const displayScale = rect.width / canvas.width;
    // The wand selects whole regions — brush size is irrelevant, show a
    // small fixed seed indicator instead
    const d = tools.brush.smart ? 14 : tools.brush.size * 2 * displayScale;
    _brushCursor.hidden = false;
    _brushCursor.style.width = `${d}px`;
    _brushCursor.style.height = `${d}px`;
    _brushCursor.style.left = `${e.clientX - stageRect.left - d / 2}px`;
    _brushCursor.style.top = `${e.clientY - stageRect.top - d / 2}px`;
}

// ===== Keyboard =====
function handleToolsKeydown(e) {
    if (!tools.open) return;
    if (e.key === '[') {
        setBrushSize(tools.brush.size - 4);
    } else if (e.key === ']') {
        setBrushSize(tools.brush.size + 4);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        elements.bgUndo.click();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        elements.bgRedo.click();
    }
}

// ===== Upscale =====
function getUpscaleFormat() {
    const value = elements.toolsModal.querySelector('input[name="upscaleFormat"]:checked')?.value || 'png';
    return value === 'jpeg'
        ? { type: 'image/jpeg', quality: 0.92, ext: 'jpg' }
        : { type: 'image/png', quality: undefined, ext: 'png' };
}

async function runUpscale() {
    const us = tools.upscale;
    if (!us.sourceCanvas || tools.processing) return;

    let cancelReject;
    const cancelToken = new Promise((_, reject) => { cancelReject = reject; });
    tools.cancelCurrent = () => cancelReject(new Error('cancelled'));

    setProcessing(true, 'Resampling…');
    try {
        const result = await upscaleCanvas(us.sourceCanvas, us.scale, {
            sharpen: elements.upscaleSharpen.checked,
            cancelToken,
            onStage: (label) => { elements.toolsProgressLabel.textContent = label; }
        });
        us.resultCanvas = result;
        us.compareOn = false;
        elements.upscaleCompareToggle.classList.remove('active');
        elements.upscaleCompareToggle.setAttribute('aria-pressed', 'false');
        elements.compareSliderRow.hidden = true;
        updateUpscaleActionState();
        updateInfoLine();
        requestRender();
        showToast(`Upscaled to ${result.width}×${result.height}`, 'success');
    } catch (e) {
        if (String(e.message).includes('cancelled')) {
            showToast('Upscale cancelled', 'info');
        } else {
            console.error('Upscale failed:', e);
            showToast(e.message || 'Upscale failed', 'error');
        }
    } finally {
        tools.cancelCurrent = null;
        setProcessing(false);
    }
}

function updateScaleButtons() {
    if (!elements.upscaleScaleGroup) return;
    const src = tools.upscale.sourceCanvas;
    elements.upscaleScaleGroup.querySelectorAll('.tools-seg-btn').forEach(btn => {
        const scale = Number(btn.dataset.scale);
        if (!src) {
            btn.disabled = true;
            btn.title = '';
            return;
        }
        const check = isScaleAllowed(src.width, src.height, scale);
        btn.disabled = !check.allowed;
        btn.title = check.allowed
            ? `${computeTargetDims(src.width, src.height, scale).w}×${computeTargetDims(src.width, src.height, scale).h}`
            : check.reason;
        if (btn.disabled && btn.classList.contains('active')) {
            btn.classList.remove('active');
            const fallback = elements.upscaleScaleGroup.querySelector('.tools-seg-btn:not([disabled])');
            if (fallback) {
                fallback.classList.add('active');
                tools.upscale.scale = Number(fallback.dataset.scale);
            }
        }
    });
}

function updateUpscaleActionState() {
    const us = tools.upscale;
    const hasSource = Boolean(us.sourceCanvas);
    const hasResult = Boolean(us.resultCanvas);
    elements.upscaleRun.disabled = !hasSource || tools.processing;
    elements.upscaleCompareToggle.disabled = !hasResult;
    elements.upscaleDownload.disabled = !hasResult;
    elements.upscaleSave.disabled = !hasResult;
    if (!hasResult && elements.compareSliderRow) {
        elements.compareSliderRow.hidden = true;
    }
}

function updateBgActionState() {
    if (!elements.bgDownload) return;
    const ready = Boolean(tools.bg.initialized);
    elements.bgDownload.disabled = !ready;
    elements.bgSave.disabled = !ready;
    elements.bgAutoDetect.disabled = !ready || tools.processing;
}

function updateUndoRedoButtons() {
    if (!elements.bgUndo) return;
    elements.bgUndo.disabled = !tools.bg.history.canUndo;
    elements.bgRedo.disabled = !tools.bg.history.canRedo;
}

// ===== Stage rendering =====
function requestRender() {
    if (_renderQueued) return;
    _renderQueued = true;
    const run = () => {
        _renderQueued = false;
        renderStage();
    };
    // rAF is paused in hidden/backgrounded tabs — fall back to a timer so
    // the composite still happens (e.g. processing finishes off-screen).
    if (document.hidden) {
        setTimeout(run, 16);
    } else {
        requestAnimationFrame(run);
    }
}

function renderStage() {
    const canvas = elements.toolsCanvas;
    if (!canvas) return;
    const ws = activeWorkspace();
    if (!ws.sourceCanvas) return;
    const ctx = canvas.getContext('2d');

    if (tools.activeTab === 'upscale') {
        const us = tools.upscale;
        const base = us.resultCanvas || us.sourceCanvas;
        if (canvas.width !== base.width || canvas.height !== base.height) {
            canvas.width = base.width;
            canvas.height = base.height;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (us.compareOn && us.resultCanvas) {
            // Split view: left = original (naive browser scaling — the
            // "without pica" baseline), right = the resampled result.
            ctx.drawImage(us.resultCanvas, 0, 0);
            const splitX = Math.round(canvas.width * us.comparePct / 100);
            if (splitX > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, splitX, canvas.height);
                ctx.clip();
                ctx.drawImage(us.sourceCanvas, 0, 0, canvas.width, canvas.height);
                ctx.restore();
            }
            const dividerW = Math.max(2, Math.round(canvas.width / 400));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fillRect(splitX - Math.floor(dividerW / 2), 0, dividerW, canvas.height);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(splitX + Math.ceil(dividerW / 2), 0, 1, canvas.height);
        } else {
            ctx.drawImage(base, 0, 0);
        }
    } else if (tools.bg.bgCanvas && tools.bg.mask) {
        const bg = tools.bg;
        const { width, height } = bg.bgCanvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const out = ctx.createImageData(width, height);
        // Feathering a 16 MP mask every frame is too slow for live brushing —
        // strokes render crisp, the final composite re-applies the feather.
        const mask = (tools.feather > 0 && !tools.stroking)
            ? featherMask(bg.mask, width, height, tools.feather)
            : bg.mask;
        applyMaskAlpha(bg.bgData.data, mask, out.data);
        ctx.putImageData(out, 0, 0);
    }
}

function updateInfoLine() {
    if (!elements.toolsInfo) return;
    const ws = activeWorkspace();
    if (!ws.sourceCanvas) {
        elements.toolsInfo.textContent = '';
        return;
    }
    if (tools.activeTab === 'upscale') {
        const us = tools.upscale;
        const src = us.sourceCanvas;
        if (us.resultCanvas) {
            elements.toolsInfo.textContent =
                `${formatDims(src.width, src.height)} → ${formatDims(us.resultCanvas.width, us.resultCanvas.height)}`;
        } else {
            const target = computeTargetDims(src.width, src.height, us.scale);
            elements.toolsInfo.textContent =
                `${formatDims(src.width, src.height)} → ${formatDims(target.w, target.h)} at ${us.scale}×`;
        }
    } else if (tools.bg.bgCanvas) {
        elements.toolsInfo.textContent = formatDims(tools.bg.bgCanvas.width, tools.bg.bgCanvas.height);
    }
}

function setProcessing(on, label = 'Working…') {
    tools.processing = on;
    elements.toolsProgress.hidden = !on;
    elements.toolsProgressLabel.textContent = label;
    elements.toolsCancel.hidden = !tools.cancelCurrent;
    updateUpscaleActionState();
    updateBgActionState();
}

// ===== Output =====
async function downloadCanvas(canvas, type, quality, ext) {
    try {
        const blob = await canvasToBlob(canvas, type, quality);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `imagen-tools-${timestamp}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Download started', 'success');
    } catch (e) {
        console.error('Download failed:', e);
        showToast('Could not encode the image for download', 'error');
    }
}

async function saveCanvasToGallery(canvas, sourceRecord, suffix, type, quality) {
    try {
        const dataUri = canvas.toDataURL(type, quality);
        const sizeKB = approxKB(dataUri);
        if (sizeKB > SAVE_WARN_KB &&
            !confirm(`This image is ~${Math.round(sizeKB / 1024)} MB and will bloat browser storage. Save anyway? (Consider downloading instead.)`)) {
            return;
        }
        const record = buildDerivedRecord(sourceRecord, {
            width: canvas.width,
            height: canvas.height,
            dataUri
        }, suffix);

        state.images.unshift(record);
        elements.galleryEmpty.style.display = 'none';
        prependImageCard(record, 0);
        await ImagenDB.saveImage(record);
        showToast('Saved to gallery', 'success');
    } catch (e) {
        console.error('Save to gallery failed:', e);
        showToast('Could not save to gallery: ' + e.message, 'error');
    }
}

/**
 * Build a gallery record for a locally processed image. Same shape as
 * generated images so export/import and all card actions work unchanged.
 * Exported for tests.
 */
export function buildDerivedRecord(orig, { width, height, dataUri }, suffix) {
    return {
        id: Date.now() + Math.random(),
        url: dataUri,
        prompt: orig ? `${orig.prompt} ${suffix}` : `Uploaded image ${suffix}`,
        model: 'local/image-tools',
        modelName: 'Image Tools',
        size: `${width}x${height}`,
        quality: orig?.quality ?? 'N/A',
        aspectRatio: reduceRatio(width, height),
        references: [],
        mode: 'manual',
        orchestratorSnapshot: null,
        derivedFrom: orig?.id ?? null,
        createdAt: new Date().toISOString()
    };
}

/**
 * Reduce W:H to a readable aspect ratio. Falls back to a decimal form when
 * the exact reduction would be unreadable (e.g. 1023:683). Exported for tests.
 */
export function reduceRatio(width, height) {
    if (!width || !height) return '1:1';
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const d = gcd(width, height);
    const rw = width / d;
    const rh = height / d;
    if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
    return width >= height
        ? `${(width / height).toFixed(2)}:1`
        : `1:${(height / width).toFixed(2)}`;
}
