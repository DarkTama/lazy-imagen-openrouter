/**
 * Orchestrator mode logic.
 */

import { state, saveOrchestratorState, ORCHESTRATOR_DEFAULTS, ATTRIBUTE_LABELS, ATTRIBUTE_PHRASING, ATTRIBUTE_KEYS, VISION_MODELS, VISION_MODELS_BY_ID, RESEARCH_MODELS, MODEL_CONFIGS, LARGE_IMAGE_THRESHOLD_BYTES } from './state.js';
import { elements } from './elements.js';
import ImagenDB from './db.js';
import { escapeHtml, sanitizeImageUrl, debounce, showToast, formatPrice, speedGlyph, readFileAsDataURI, compressDataUri, compressImageFile, approxKB, imageFingerprint } from './utils.js';
import { ApiError, runVisionAnalysis, researchSubject } from './api.js';
import { isMobileLayout, renderModelInfoCard } from './ui.js';

export function setupOrchestrator() {
    const o = state.orchestrator;

    renderToggleGrid();
    renderPresets();

    elements.visionModelOptions.innerHTML = '';
    VISION_MODELS.forEach(m => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = m.id;
        opt.setAttribute('role', 'option');
        if (m.id === o.visionModel) opt.classList.add('selected');
        const name = document.createElement('span');
        name.className = 'option-name';
        name.textContent = m.name;
        opt.appendChild(name);
        const sub = document.createElement('span');
        sub.className = 'option-bestfor';
        sub.textContent = m.bestFor;
        opt.appendChild(sub);
        elements.visionModelOptions.appendChild(opt);
    });
    const currentVision = VISION_MODELS_BY_ID[o.visionModel] || VISION_MODELS[0];
    elements.visionModelValue.textContent = currentVision.name;

    elements.researchModelSelect.innerHTML = '';
    RESEARCH_MODELS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name + ' — ' + m.bestFor;
        if (m.id === o.researchModel) opt.selected = true;
        elements.researchModelSelect.appendChild(opt);
    });

    applyOrchestratorMode(o.enabled);
    elements.orchestratorToggle.checked = o.enabled;

    if (o.sourceImage) renderRoleThumb('source', o.sourceImage);
    if (o.referenceImage) renderRoleThumb('reference', o.referenceImage);

    Object.entries(o.transfers).forEach(([attr, checked]) => {
        const cb = document.querySelector('.ow-toggle-cell input[data-attr="' + attr + '"]');
        if (cb) cb.checked = !!checked;
    });

    const radio = document.querySelector('input[name="artStyle"][value="' + o.artStyle + '"]');
    if (radio) radio.checked = true;

    elements.identityLock.value = o.identityLock;
    elements.creativitySlider.value = o.creativity;
    elements.creativityValue.textContent = o.creativity + '%';

    elements.visionModelCustom.value = o.visionModelCustom || '';
    elements.subjectContext.value = o.subjectContext || '';
    elements.orchestratorNotes.value = o.notes || '';
    elements.researchSubjectBtn.disabled = !(o.subjectContext || '').trim();
    if (o.subjectContext) elements.researchSubjectBtn.title = 'Research this subject via web search';

    if (elements.autoCompressToggle) {
        elements.autoCompressToggle.checked = o.autoCompress !== false;
    }

    elements.owSubjectContextSection.open = o.subjectContextOpen || !!(o.subjectContext || '').trim();
    elements.owAdvancedSection.open = !!o.advancedOpen;

    renderVisionModelChip();
    updateToggleDiffs();

    if (o.lastAssembledPrompt) {
        elements.assembledPromptPreview.value = o.lastAssembledPrompt;
    }
    updatePromptToolbar();
}

export function applyOrchestratorMode(enabled) {
    const o = state.orchestrator;
    o.enabled = !!enabled;
    document.body.classList.toggle('orchestrator-active', o.enabled);
    elements.orchestratorWorkspace.hidden = !o.enabled;
    elements.promptInput.readOnly = o.enabled;
    placeTokenSaverTip(o.enabled);
    renderOrchestratorReadiness();
}

/**
 * The token-saver tip lives under the manual prompt, which orchestrator mode
 * hides entirely. Relocate the single node (listeners travel with it) so the
 * tip — and its Copy button, which copies the assembled prompt in this mode —
 * sits right under the Assembled Prompt section.
 */
function placeTokenSaverTip(enabled) {
    const tip = elements.tokenSaverTip || document.getElementById('tokenSaverTip');
    if (!tip) return;
    const target = enabled
        ? document.querySelector('.ow-preview-section')
        : document.querySelector('.prompt-area');
    if (target && tip.parentElement !== target) {
        target.appendChild(tip);
    }
}

/**
 * Readiness chips in the workspace footer: answer "why won't Generate work"
 * before the click. Buttons stay enabled — their handlers already toast
 * precise errors.
 */
export function renderOrchestratorReadiness() {
    const strip = document.getElementById('owReadiness');
    if (!strip) return;
    const o = state.orchestrator;
    const modelConfig = MODEL_CONFIGS[state.selectedModel];
    const items = [
        { label: 'Source', ok: Boolean(o.sourceImage) },
        { label: 'Reference', ok: Boolean(o.referenceImage) },
        { label: 'API key', ok: Boolean(state.apiKey) },
        { label: 'Image-capable model', ok: Boolean(modelConfig?.supportsImageInput) }
    ];
    strip.innerHTML = items.map(item =>
        `<span class="ow-ready-chip ${item.ok ? 'ok' : 'missing'}">${item.ok ? '✓' : '✗'} ${escapeHtml(item.label)}</span>`
    ).join('');
}

// ===== Vision analysis cache (free re-assembly) =====
// The vision call is the expensive half of Assemble; the prompt-building step
// (assemblePrompt) is pure local code. Caching the analysis per image pair +
// model means settings-only changes re-assemble instantly and free.
const VISION_CACHE_KEY = 'imagen_vision_cache';
let _visionCache = loadVisionCache();

function loadVisionCache() {
    try {
        const raw = localStorage.getItem(VISION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.srcFp && parsed.refFp && parsed.model && parsed.analysis) {
            return parsed;
        }
    } catch (e) {
        console.warn('Failed to load vision cache:', e);
    }
    return null;
}

function saveVisionCache() {
    try {
        if (_visionCache) {
            localStorage.setItem(VISION_CACHE_KEY, JSON.stringify(_visionCache));
        } else {
            localStorage.removeItem(VISION_CACHE_KEY);
        }
    } catch (e) {
        console.warn('Failed to persist vision cache:', e);
    }
}

/** Pure validity check — exported for tests. */
export function isVisionCacheValid(cache, srcFp, refFp, model) {
    return Boolean(cache && cache.analysis && cache.srcFp === srcFp && cache.refFp === refFp && cache.model === model);
}

function getValidVisionCache() {
    const o = state.orchestrator;
    if (!o.sourceImage || !o.referenceImage) return null;
    const model = (o.visionModelCustom && o.visionModelCustom.trim()) || o.visionModel;
    return isVisionCacheValid(
        _visionCache,
        imageFingerprint(o.sourceImage),
        imageFingerprint(o.referenceImage),
        model
    ) ? _visionCache : null;
}

export function invalidateVisionCache() {
    _visionCache = null;
    saveVisionCache();
    updatePromptToolbar();
}

// ===== Assembled-prompt toolbar (char count, stale badge, re-analyze) =====
let _promptStale = false;

export function markPromptStale() {
    _promptStale = true;
    updatePromptToolbar();
}

function clearPromptStale() {
    _promptStale = false;
    updatePromptToolbar();
}

function updatePromptToolbar() {
    const text = elements.assembledPromptPreview?.value || '';
    if (elements.owPromptCount) {
        elements.owPromptCount.textContent = text ? text.length + ' chars' : '';
    }
    const cacheValid = Boolean(getValidVisionCache());
    if (elements.owStaleBadge) {
        elements.owStaleBadge.hidden = !_promptStale || !text.trim();
        elements.owStaleBadge.textContent = cacheValid
            ? 'Settings changed — re-assemble (free)'
            : 'Settings changed — re-assemble';
    }
    if (elements.owReanalyze) {
        elements.owReanalyze.hidden = !cacheValid;
    }
}

// ===== Role zone helpers =====
/** Sync a dropzone's thumb/clear/filled state from `state` without touching it. */
function refreshRoleZone(role) {
    const o = state.orchestrator;
    const img = role === 'source' ? o.sourceImage : o.referenceImage;
    if (img) {
        renderRoleThumb(role, img);
    } else {
        const thumb = role === 'source' ? elements.sourceThumb : elements.referenceThumb;
        const clear = role === 'source' ? elements.sourceClear : elements.referenceClear;
        const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
        thumb.removeAttribute('src');
        thumb.hidden = true;
        clear.hidden = true;
        zone.classList.remove('filled');
    }
}

/**
 * Assign an already-loaded image (gallery card, recents strip, iterate) to a
 * role. Single chokepoint shared by the role-picker popover, slot drags and
 * the modal Iterate button.
 */
export function setRoleImageFromUrl(role, dataUri) {
    if (!dataUri) return;
    if (role === 'source') {
        state.orchestrator.sourceImage = dataUri;
    } else {
        state.orchestrator.referenceImage = dataUri;
    }
    renderRoleThumb(role, dataUri);
    updateToggleDiffs();
    saveOrchestratorState();
    invalidateVisionCache();
    markPromptStale();
    rememberRecentRoleImage(dataUri);
    showToast(`Image set as ${role === 'source' ? 'Source' : 'Reference'}`, 'success');
}

// ===== Recently used role images =====
const ROLE_RECENTS_KEY = 'roleRecents';
const MAX_ROLE_RECENTS = 6;
let _roleRecents = [];

export async function hydrateRoleRecents() {
    try {
        const raw = await ImagenDB.getOrchestratorBlob(ROLE_RECENTS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                _roleRecents = parsed.filter(u => typeof u === 'string').slice(0, MAX_ROLE_RECENTS);
            }
        }
    } catch (e) {
        console.warn('Failed to load recent role images:', e);
    }
    renderRoleRecents();
}

function rememberRecentRoleImage(dataUri) {
    if (!dataUri || !sanitizeImageUrl(dataUri)) return;
    const fp = imageFingerprint(dataUri);
    _roleRecents = [dataUri, ..._roleRecents.filter(u => imageFingerprint(u) !== fp)]
        .slice(0, MAX_ROLE_RECENTS);
    ImagenDB.saveOrchestratorBlob(ROLE_RECENTS_KEY, JSON.stringify(_roleRecents)).catch(e =>
        console.warn('Failed to persist recent role images:', e)
    );
    renderRoleRecents();
}

function renderRoleRecents() {
    const strip = elements.owRecents;
    const thumbs = elements.owRecentsThumbs;
    if (!strip || !thumbs) return;
    strip.hidden = _roleRecents.length === 0;
    thumbs.innerHTML = '';
    _roleRecents.forEach(url => {
        const safe = sanitizeImageUrl(url);
        if (!safe) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ow-recent-thumb';
        btn.title = 'Click to use as Source or Reference';
        btn.style.backgroundImage = `url('${safe}')`;
        btn.addEventListener('click', () => {
            import('./gallery.js').then(({ showRolePickerPopover }) => {
                showRolePickerPopover(btn, url);
            });
        });
        thumbs.appendChild(btn);
    });
}

// ===== Workflow presets =====
const CUSTOM_PRESETS_KEY = 'imagen_orch_presets';
const MAX_CUSTOM_PRESETS = 8;

const BUILTIN_PRESETS = [
    { name: 'Outfit swap', transfers: { clothing: true, accessories: true }, artStyle: 'source' },
    { name: 'Pose copy', transfers: { pose: true, camera: true }, artStyle: 'source' },
    { name: 'Full style transfer', transfers: { background: true, lighting: true, palette: true }, artStyle: 'reference' },
    { name: 'Scene swap', transfers: { background: true, lighting: true }, artStyle: 'source' }
];

function loadCustomPresets() {
    try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveCustomPresets(presets) {
    try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
        console.warn('Failed to persist presets:', e);
    }
}

function applyPreset(preset) {
    const o = state.orchestrator;
    ATTRIBUTE_KEYS.forEach(attr => {
        const on = Boolean(preset.transfers?.[attr]);
        o.transfers[attr] = on;
        const cb = elements.owToggleGrid?.querySelector('input[data-attr="' + attr + '"]');
        if (cb) cb.checked = on;
    });
    if (preset.artStyle) {
        o.artStyle = preset.artStyle;
        const radio = document.querySelector('input[name="artStyle"][value="' + preset.artStyle + '"]');
        if (radio) radio.checked = true;
    }
    if (preset.identityLock) {
        o.identityLock = preset.identityLock;
        if (elements.identityLock) elements.identityLock.value = preset.identityLock;
    }
    if (typeof preset.creativity === 'number') {
        o.creativity = preset.creativity;
        if (elements.creativitySlider) elements.creativitySlider.value = preset.creativity;
        if (elements.creativityValue) elements.creativityValue.textContent = preset.creativity + '%';
    }
    updateToggleDiffs();
    saveOrchestratorState();
    markPromptStale();
    showToast(`Preset applied: ${preset.name}`, 'success');
}

export function renderPresets() {
    const row = elements.owPresets;
    if (!row) return;
    row.innerHTML = '';

    const all = [
        ...BUILTIN_PRESETS.map(p => ({ ...p, builtin: true })),
        ...loadCustomPresets()
    ];
    all.forEach(preset => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ow-preset-chip';
        chip.textContent = preset.name;
        chip.title = 'Apply this preset';
        chip.addEventListener('click', () => applyPreset(preset));
        if (!preset.builtin) {
            const del = document.createElement('span');
            del.className = 'ow-preset-del';
            del.textContent = '×';
            del.title = 'Delete this preset';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                saveCustomPresets(loadCustomPresets().filter(p => p.name !== preset.name));
                renderPresets();
                showToast(`Preset deleted: ${preset.name}`, 'success');
            });
            chip.appendChild(del);
        }
        row.appendChild(chip);
    });

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'ow-preset-chip ow-preset-save';
    save.textContent = '+ Save current…';
    save.title = 'Save the current toggles, style, identity lock and creativity as a preset';
    save.addEventListener('click', () => {
        const name = (prompt('Preset name:') || '').trim();
        if (!name) return;
        const customs = loadCustomPresets().filter(p => p.name !== name);
        if (customs.length >= MAX_CUSTOM_PRESETS) {
            showToast(`Preset limit reached (${MAX_CUSTOM_PRESETS}) — delete one first`, 'warning');
            return;
        }
        const o = state.orchestrator;
        customs.push({
            name,
            transfers: { ...o.transfers },
            artStyle: o.artStyle,
            identityLock: o.identityLock,
            creativity: o.creativity
        });
        saveCustomPresets(customs);
        renderPresets();
        showToast(`Preset saved: ${name}`, 'success');
    });
    row.appendChild(save);
}

export function renderToggleGrid() {
    elements.owToggleGrid.innerHTML = '';
    ATTRIBUTE_KEYS.forEach(attr => {
        const cell = document.createElement('label');
        cell.className = 'ow-toggle-cell';
        cell.dataset.cell = attr;
        cell.innerHTML = `
            <div class="ow-toggle-cell-row">
                <input type="checkbox" data-attr="${attr}">
                <span class="ow-toggle-cell-label">${escapeHtml(ATTRIBUTE_LABELS[attr])}</span>
                <span class="ow-toggle-cell-source">from SOURCE</span>
            </div>
            <div class="ow-diff" data-diff="${attr}"></div>
        `;
        elements.owToggleGrid.appendChild(cell);
    });
}

export function updateToggleDiffs() {
    if (!elements.owToggleGrid) return;
    const o = state.orchestrator;
    const src = o.sourceImage;
    const ref = o.referenceImage;

    if (elements.owTransferCount) {
        const n = ATTRIBUTE_KEYS.filter(attr => o.transfers[attr]).length;
        elements.owTransferCount.textContent = `(${n}/${ATTRIBUTE_KEYS.length})`;
    }

    ATTRIBUTE_KEYS.forEach(attr => {
        const checked = !!o.transfers[attr];
        const cell = elements.owToggleGrid.querySelector('.ow-toggle-cell[data-cell="' + attr + '"]');
        if (!cell) return;
        cell.classList.toggle('checked', checked);

        const tag = cell.querySelector('.ow-toggle-cell-source');
        if (tag) tag.textContent = checked ? 'from REFERENCE' : 'from SOURCE';

        const diff = cell.querySelector('.ow-diff');
        if (!diff) return;

        diff.textContent = '';

        const srcEl = document.createElement('div');
        srcEl.title = 'Source';
        if (src && sanitizeImageUrl(src)) {
            srcEl.className = 'ow-diff-thumb ' + (checked ? 'dimmed' : 'chosen');
            srcEl.style.backgroundImage = "url('" + sanitizeImageUrl(src) + "')";
        } else {
            srcEl.className = 'ow-diff-thumb placeholder';
            srcEl.title = 'No source uploaded';
        }

        const arrow = document.createElement('span');
        arrow.className = 'ow-diff-arrow';
        arrow.textContent = '→';

        const refEl = document.createElement('div');
        refEl.title = 'Reference';
        if (ref && sanitizeImageUrl(ref)) {
            refEl.className = 'ow-diff-thumb ' + (checked ? 'chosen' : 'dimmed');
            refEl.style.backgroundImage = "url('" + sanitizeImageUrl(ref) + "')";
        } else {
            refEl.className = 'ow-diff-thumb placeholder';
            refEl.title = 'No reference uploaded';
        }

        diff.appendChild(srcEl);
        diff.appendChild(arrow);
        diff.appendChild(refEl);
    });
}

export function renderVisionModelChip() {
    if (!elements.visionModelChip) return;
    const o = state.orchestrator;
    const customId = (o.visionModelCustom || '').trim();
    if (customId) {
        elements.visionModelChip.textContent = customId + ' · custom';
        return;
    }
    const meta = VISION_MODELS_BY_ID[o.visionModel];
    if (!meta) {
        elements.visionModelChip.textContent = '';
        return;
    }
    const pricing = state.modelPricing[o.visionModel];
    const promptPrice = pricing ? formatPrice(pricing.prompt) : null;
    const parts = [
        meta.name,
        speedGlyph(meta.speed)
    ];
    if (promptPrice) parts.push(promptPrice + ' / 1M prompt');
    elements.visionModelChip.textContent = parts.join(' · ');
}

export function renderRoleThumb(role, dataUri) {
    const thumb = role === 'source' ? elements.sourceThumb : elements.referenceThumb;
    const clear = role === 'source' ? elements.sourceClear : elements.referenceClear;
    const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
    thumb.src = dataUri;
    thumb.hidden = false;
    clear.hidden = false;
    zone.classList.add('filled');
    renderOrchestratorReadiness();
}

export function clearRoleThumb(role) {
    const thumb = role === 'source' ? elements.sourceThumb : elements.referenceThumb;
    const clear = role === 'source' ? elements.sourceClear : elements.referenceClear;
    const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
    thumb.removeAttribute('src');
    thumb.hidden = true;
    clear.hidden = true;
    zone.classList.remove('filled');
    if (role === 'source') {
        state.orchestrator.sourceImage = null;
        elements.sourceInput.value = '';
    } else {
        state.orchestrator.referenceImage = null;
        elements.referenceInput.value = '';
    }
    updateToggleDiffs();
    saveOrchestratorState();
    invalidateVisionCache();
    markPromptStale();
    renderOrchestratorReadiness();
}

export async function setRoleImage(role, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const isLarge = file.size > LARGE_IMAGE_THRESHOLD_BYTES;
    const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
    let dataUri;

    if (isLarge && state.orchestrator.autoCompress) {
        // Show compression overlay
        zone.classList.add('compressing');
        const overlay = document.createElement('div');
        overlay.className = 'compress-overlay';
        overlay.innerHTML = '<div class="compress-spinner"></div><span>Compressing...</span>';
        zone.appendChild(overlay);
        try {
            dataUri = await compressImageFile(file);
            const beforeKB = Math.round(file.size / 1024);
            const afterKB = approxKB(dataUri);
            showToast('Compressed ' + role + ': ' + beforeKB + ' KB → ~' + afterKB + ' KB', 'success');
        } catch (err) {
            console.error('Compression failed:', err);
            dataUri = await readFileAsDataURI(file);
            showToast('Could not compress — using original (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)', 'warning');
        } finally {
            zone.classList.remove('compressing');
            const existingOverlay = zone.querySelector('.compress-overlay');
            if (existingOverlay) existingOverlay.remove();
        }
    } else {
        dataUri = await readFileAsDataURI(file);
    }

    if (role === 'source') {
        state.orchestrator.sourceImage = dataUri;
    } else {
        state.orchestrator.referenceImage = dataUri;
    }
    renderRoleThumb(role, dataUri);
    updateToggleDiffs();
    saveOrchestratorState();
    invalidateVisionCache();
    markPromptStale();
    rememberRecentRoleImage(dataUri);

    if (isLarge && !state.orchestrator.autoCompress) {
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        const stateKey = role === 'source' ? 'sourceImage' : 'referenceImage';
        showOrchestratorWarning({
            title: 'Large image uploaded',
            body: roleLabel + ' is ' + (file.size / 1024 / 1024).toFixed(1) + ' MB. This may exceed browser storage (~5 MB total) and increases vision-API token cost.',
            suggestion: 'Compress to ~2048px JPEG to fit storage and reduce token cost. Existing image is kept until you click below.',
            action: {
                label: 'Compress now',
                handler: async () => {
                    try {
                        const compressed = await compressDataUri(state.orchestrator[stateKey]);
                        state.orchestrator[stateKey] = compressed;
                        renderRoleThumb(role, compressed);
                        updateToggleDiffs();
                        saveOrchestratorState();
                        hideOrchestratorPanel();
                        showToast('Compressed to ~' + approxKB(compressed) + ' KB', 'success');
                    } catch (err) {
                        console.error('On-demand compression failed:', err);
                        showToast('Compression failed: ' + err.message, 'error');
                    }
                }
            }
        }, `File: ${file.name}\nSize: ${(file.size / 1024 / 1024).toFixed(2)} MB\nType: ${file.type}`);
    }
}

export function setupRoleDropzone(role) {
    const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
    const input = role === 'source' ? elements.sourceInput : elements.referenceInput;
    const clear = role === 'source' ? elements.sourceClear : elements.referenceClear;

    input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) setRoleImage(role, file);
    });

    clear.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearRoleThumb(role);
    });

    ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });
    });
    zone.addEventListener('drop', (e) => {
        // Gallery cards advertise their image via a custom type so they can
        // be dropped straight onto a slot (no OS file involved)
        const galleryUrl = e.dataTransfer?.getData('text/x-imagen-image');
        if (galleryUrl) {
            setRoleImageFromUrl(role, galleryUrl);
            return;
        }
        const file = e.dataTransfer?.files?.[0];
        if (file) setRoleImage(role, file);
    });
}

export function setupOrchestratorEventListeners(generateImages) {
    const o = state.orchestrator;

    elements.orchestratorToggle.addEventListener('change', () => {
        applyOrchestratorMode(elements.orchestratorToggle.checked);
        saveOrchestratorState();
    });

    setupRoleDropzone('source');
    setupRoleDropzone('reference');

    if (elements.owSwapBtn) {
        elements.owSwapBtn.addEventListener('click', () => {
            if (!o.sourceImage && !o.referenceImage) {
                showToast('Nothing to swap yet — upload an image first', 'info');
                return;
            }
            [o.sourceImage, o.referenceImage] = [o.referenceImage, o.sourceImage];
            refreshRoleZone('source');
            refreshRoleZone('reference');
            updateToggleDiffs();
            saveOrchestratorState();
            invalidateVisionCache(); // the analysis labels are role-specific
            markPromptStale();
            renderOrchestratorReadiness();
            showToast('Source and Reference swapped', 'success');
        });
    }

    const setAllTransfers = (value) => {
        ATTRIBUTE_KEYS.forEach(attr => {
            o.transfers[attr] = value;
            const cb = elements.owToggleGrid.querySelector('input[data-attr="' + attr + '"]');
            if (cb) cb.checked = value;
        });
        updateToggleDiffs();
        saveOrchestratorState();
        markPromptStale();
    };
    if (elements.owTransferAll) {
        elements.owTransferAll.addEventListener('click', () => setAllTransfers(true));
    }
    if (elements.owTransferNone) {
        elements.owTransferNone.addEventListener('click', () => setAllTransfers(false));
    }

    if (elements.owCopyPrompt) {
        elements.owCopyPrompt.addEventListener('click', async () => {
            const text = (elements.assembledPromptPreview?.value || '').trim();
            if (!text) {
                showToast('Nothing to copy yet — assemble a prompt first', 'warning');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                showToast('Prompt copied', 'success');
            } catch (err) {
                console.warn('Copy prompt failed:', err);
                showToast('Could not copy the prompt', 'error');
            }
        });
    }

    if (elements.owReanalyze) {
        elements.owReanalyze.addEventListener('click', () => {
            invalidateVisionCache();
            assembleOrchestratorPrompt();
        });
    }

    elements.owToggleGrid.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"][data-attr]');
        if (!cb) return;
        o.transfers[cb.dataset.attr] = cb.checked;
        updateToggleDiffs();
        saveOrchestratorState();
        markPromptStale();
    });

    document.querySelectorAll('input[name="artStyle"]').forEach(r => {
        r.addEventListener('change', () => {
            if (r.checked) {
                o.artStyle = r.value;
                saveOrchestratorState();
                markPromptStale();
            }
        });
    });

    elements.identityLock.addEventListener('change', () => {
        o.identityLock = elements.identityLock.value;
        saveOrchestratorState();
        markPromptStale();
    });

    elements.creativitySlider.addEventListener('input', () => {
        o.creativity = parseInt(elements.creativitySlider.value, 10);
        elements.creativityValue.textContent = o.creativity + '%';
    });
    elements.creativitySlider.addEventListener('change', () => {
        saveOrchestratorState();
        markPromptStale();
    });

    elements.visionModelTrigger.addEventListener('click', () => {
        elements.visionModelContainer.classList.toggle('open');
        const isOpen = elements.visionModelContainer.classList.contains('open');
        elements.visionModelTrigger.setAttribute('aria-expanded', String(isOpen));
    });
    elements.visionModelOptions.addEventListener('click', (e) => {
        const opt = e.target.closest('.custom-select-option');
        if (!opt) return;
        const id = opt.dataset.value;
        o.visionModel = id;
        elements.visionModelOptions.querySelectorAll('.custom-select-option').forEach(o2 => o2.classList.remove('selected'));
        opt.classList.add('selected');
        const meta = VISION_MODELS_BY_ID[id];
        elements.visionModelValue.textContent = meta?.name || id;
        elements.visionModelContainer.classList.remove('open');
        elements.visionModelTrigger.setAttribute('aria-expanded', 'false');
        renderVisionModelChip();
        saveOrchestratorState();
        markPromptStale();
        updatePromptToolbar(); // cache validity depends on the vision model
    });
    document.addEventListener('click', (e) => {
        if (!elements.visionModelContainer.contains(e.target)) {
            elements.visionModelContainer.classList.remove('open');
            elements.visionModelTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    elements.visionModelCustom.addEventListener('input', debounce(() => {
        o.visionModelCustom = elements.visionModelCustom.value;
        renderVisionModelChip();
        saveOrchestratorState();
        markPromptStale();
        updatePromptToolbar();
    }, 250));

    elements.owSubjectContextSection.addEventListener('toggle', () => {
        o.subjectContextOpen = elements.owSubjectContextSection.open;
        saveOrchestratorState();
    });

    elements.owAdvancedSection.addEventListener('toggle', () => {
        o.advancedOpen = elements.owAdvancedSection.open;
        saveOrchestratorState();
    });

    elements.subjectContext.addEventListener('input', debounce(() => {
        o.subjectContext = elements.subjectContext.value;
        const hasText = !!o.subjectContext.trim();
        elements.researchSubjectBtn.disabled = !hasText;
        elements.researchSubjectBtn.title = hasText
            ? 'Research this subject via web search'
            : 'Type a subject name first';
        saveOrchestratorState();
        markPromptStale();
    }, 250));

    elements.researchModelSelect.addEventListener('change', () => {
        o.researchModel = elements.researchModelSelect.value;
        saveOrchestratorState();
    });

    elements.researchSubjectBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!state.apiKey) {
            showToast('Save your OpenRouter API key first', 'error');
            return;
        }
        const current = elements.subjectContext.value.trim();
        if (!current) return;

        if (current.length > 80 && !confirm('Replace existing subject context with web research result?')) {
            return;
        }

        elements.researchSubjectBtn.classList.add('loading');
        elements.researchSubjectBtn.disabled = true;
        try {
            const result = await researchSubject(current, o.researchModel);
            o.subjectContext = result;
            elements.subjectContext.value = result;
            saveOrchestratorState();
            showToast('Subject research complete', 'success');
        } catch (err) {
            console.error('Research failed:', err);
            showToast('Research failed: ' + err.message, 'error');
        } finally {
            elements.researchSubjectBtn.classList.remove('loading');
            elements.researchSubjectBtn.disabled = false;
        }
    });

    elements.orchestratorNotes.addEventListener('input', debounce(() => {
        o.notes = elements.orchestratorNotes.value;
        saveOrchestratorState();
        markPromptStale();
    }, 250));

    if (elements.orchestratorAssembleBtn) {
        elements.orchestratorAssembleBtn.addEventListener('click', assembleOrchestratorPrompt);
    }

    if (elements.orchestratorGenerateBtn) {
        elements.orchestratorGenerateBtn.addEventListener('click', generateImages);
    }

    if (elements.assembledPromptPreview) {
        elements.assembledPromptPreview.addEventListener('input', debounce(() => {
            state.orchestrator.lastAssembledPrompt = elements.assembledPromptPreview.value;
            saveOrchestratorState();
            // The user owns the prompt once they edit it by hand
            clearPromptStale();
        }, 300));
    }

    if (elements.owErrorClose) {
        elements.owErrorClose.addEventListener('click', hideOrchestratorPanel);
    }

    if (elements.autoCompressToggle) {
        elements.autoCompressToggle.addEventListener('change', () => {
            state.orchestrator.autoCompress = elements.autoCompressToggle.checked;
            saveOrchestratorState();
        });
    }
}

export function assemblePrompt(v, p) {
    const keep = [];
    const change = [];
    for (const attr of ATTRIBUTE_KEYS) {
        const phrase = ATTRIBUTE_PHRASING[attr] || attr;
        if (p.transfers[attr]) {
            change.push('- ' + phrase + ': ' + (v['ref_' + attr] || '(match Image 2)'));
        } else {
            keep.push('- ' + phrase + ': ' + (v['source_' + attr] || '(match Image 1)'));
        }
    }

    const style =
        p.artStyle === 'source'    ? (v.source_style || 'the art style of Image 1') :
        p.artStyle === 'reference' ? (v.ref_style || 'the art style of Image 2') :
        `a blend of Image 1's style (${v.source_style || 'unknown'}) and Image 2's style (${v.ref_style || 'unknown'})`;

    const lockClause = {
        low:    'preserve the general likeness of the character',
        medium: "preserve the character's facial identity",
        high:   'maintain strong facial consistency with the character in Image 1',
        max:    'maintain 100% facial identity from Image 1 — identical eyes, nose, mouth, jawline, and skin tone'
    }[p.identityLock] || "preserve the character's facial identity";

    const creativityClause = p.creativity > 60
        ? 'You may creatively reinterpret secondary details not specified above.'
        : p.creativity < 20
            ? 'Stay strictly faithful to the descriptions above; do not improvise.'
            : '';

    const lines = [
        'Composite a new image from the two reference images provided above.',
        'IMAGE 1 = SOURCE: the character whose identity and likeness must be preserved.',
        'IMAGE 2 = REFERENCE: a donor image — use it ONLY for the attributes listed under CHANGE.',
        ''
    ];
    if (p.subjectContext && p.subjectContext.trim()) {
        lines.push('Subject context: ' + p.subjectContext.trim(), '');
    }
    lines.push('Generate one image of the character from IMAGE 1: ' + (v.source_char || '(see Image 1)') + '.', '');
    if (keep.length) {
        lines.push('KEEP these unchanged from IMAGE 1 (the source):', ...keep, '');
    }
    if (change.length) {
        lines.push('CHANGE these to match IMAGE 2 (the reference):', ...change, '');
    }
    lines.push('Art style: ' + style + '.');
    lines.push('Identity: ' + lockClause + '.');
    if (creativityClause) lines.push(creativityClause);
    lines.push(change.length
        ? 'Do not copy any attribute from IMAGE 2 that is not listed under CHANGE above.'
        : 'Do not copy anything from IMAGE 2 — reproduce IMAGE 1 faithfully in the chosen art style.');
    if (p.notes && p.notes.trim()) {
        lines.push('', 'Additional notes: ' + p.notes.trim());
    }
    return lines.join('\n');
}

export function setAssembleButtonLoading(on) {
    if (!elements.orchestratorAssembleBtn) return;
    elements.orchestratorAssembleBtn.disabled = on;
    elements.orchestratorAssembleBtn.classList.toggle('loading', on);
    const label = elements.orchestratorAssembleBtn.querySelector('.ow-btn-label');
    if (label) label.textContent = on ? 'Analyzing images…' : 'Assemble Prompt';
}

export function setGenerateButtonLoading(on) {
    if (!elements.orchestratorGenerateBtn) return;
    elements.orchestratorGenerateBtn.disabled = on;
    elements.orchestratorGenerateBtn.classList.toggle('loading', on);
    const label = elements.orchestratorGenerateBtn.querySelector('.ow-btn-label');
    if (label) label.textContent = on ? 'Generating…' : 'Generate Image →';
}

export async function assembleOrchestratorPrompt() {
    const o = state.orchestrator;
    if (!o.sourceImage || !o.referenceImage) {
        showToast('Upload both Source and Reference images before assembling', 'error');
        return null;
    }

    // Free path: the expensive part of Assemble is the vision call; building
    // the prompt from its analysis is pure local code. If the cached analysis
    // still matches this image pair + model, skip the API entirely.
    const cached = getValidVisionCache();

    if (!cached && !state.apiKey) {
        showToast('Save your OpenRouter API key first', 'error');
        return null;
    }
    hideOrchestratorPanel();
    const visionModel = (o.visionModelCustom && o.visionModelCustom.trim()) || o.visionModel;
    setAssembleButtonLoading(true);
    try {
        let vision;
        if (cached) {
            vision = cached.analysis;
        } else {
            vision = await runVisionAnalysis(o.sourceImage, o.referenceImage, visionModel);
            _visionCache = {
                srcFp: imageFingerprint(o.sourceImage),
                refFp: imageFingerprint(o.referenceImage),
                model: visionModel,
                analysis: vision
            };
            saveVisionCache();
        }
        const assembled = assemblePrompt(vision, o);
        o.lastAssembledPrompt = assembled;
        if (elements.assembledPromptPreview) {
            elements.assembledPromptPreview.value = assembled;
        }
        saveOrchestratorState();
        clearPromptStale();
        showToast(
            cached
                ? 'Re-assembled from cached analysis — no tokens spent'
                : 'Prompt assembled. Review or edit, then click Generate Image.',
            'success'
        );
        return assembled;
    } catch (err) {
        console.error('Assemble failed:', err);
        if (err instanceof ApiError) {
            showOrchestratorError(err);
        } else {
            showOrchestratorError(new ApiError({
                kind: 'http', stage: 'vision', modelId: visionModel,
                message: err.message || 'Unknown error', body: String(err)
            }));
        }
        return null;
    } finally {
        setAssembleButtonLoading(false);
    }
}

export function snapshotOrchestrator() {
    const o = state.orchestrator;
    return {
        sourceImage: o.sourceImage,
        referenceImage: o.referenceImage,
        transfers: { ...o.transfers },
        artStyle: o.artStyle,
        identityLock: o.identityLock,
        creativity: o.creativity,
        visionModel: o.visionModel,
        visionModelCustom: o.visionModelCustom,
        researchModel: o.researchModel,
        subjectContext: o.subjectContext,
        notes: o.notes,
        lastAssembledPrompt: o.lastAssembledPrompt,
        autoCompress: o.autoCompress
    };
}

export function restoreOrchestratorFromSnapshot(snap) {
    if (!snap) return;
    Object.assign(state.orchestrator, {
        ...ORCHESTRATOR_DEFAULTS,
        ...snap,
        transfers: { ...ORCHESTRATOR_DEFAULTS.transfers, ...(snap.transfers || {}) },
        enabled: true
    });

    applyOrchestratorMode(true);
    if (elements.orchestratorToggle) elements.orchestratorToggle.checked = true;

    if (snap.sourceImage) renderRoleThumb('source', snap.sourceImage); else clearRoleThumb('source');
    if (snap.referenceImage) renderRoleThumb('reference', snap.referenceImage); else clearRoleThumb('reference');

    ATTRIBUTE_KEYS.forEach(attr => {
        const cb = elements.owToggleGrid?.querySelector('input[data-attr="' + attr + '"]');
        if (cb) cb.checked = !!snap.transfers?.[attr];
    });

    const radio = document.querySelector('input[name="artStyle"][value="' + (snap.artStyle || 'source') + '"]');
    if (radio) radio.checked = true;

    if (elements.identityLock) elements.identityLock.value = snap.identityLock || 'high';
    const cr = snap.creativity ?? 25;
    if (elements.creativitySlider) elements.creativitySlider.value = cr;
    if (elements.creativityValue) elements.creativityValue.textContent = cr + '%';

    if (elements.visionModelCustom) elements.visionModelCustom.value = snap.visionModelCustom || '';
    const visionId = snap.visionModel || 'google/gemini-2.5-flash';
    if (elements.visionModelOptions) {
        elements.visionModelOptions.querySelectorAll('.custom-select-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.value === visionId);
        });
    }
    if (elements.visionModelValue) {
        elements.visionModelValue.textContent = (VISION_MODELS_BY_ID[visionId] || {}).name || visionId;
    }
    renderVisionModelChip();
    if (elements.researchModelSelect) elements.researchModelSelect.value = snap.researchModel || 'perplexity/sonar';

    if (elements.subjectContext) elements.subjectContext.value = snap.subjectContext || '';
    if (elements.orchestratorNotes) elements.orchestratorNotes.value = snap.notes || '';
    if (elements.assembledPromptPreview) elements.assembledPromptPreview.value = snap.lastAssembledPrompt || '';

    if (elements.owSubjectContextSection) {
        elements.owSubjectContextSection.open = !!(snap.subjectContext || '').trim();
    }

    if (elements.autoCompressToggle && snap.autoCompress !== undefined) {
        elements.autoCompressToggle.checked = !!snap.autoCompress;
    }

    updateToggleDiffs();
    saveOrchestratorState();
    // The restored prompt matches the restored settings — not stale
    clearPromptStale();
    renderOrchestratorReadiness();
}

export function classifyError(err) {
    const status = err.status;
    const stage = err.stage;
    const isVision = stage === 'vision';
    const modelLabel = err.modelId ? '"' + err.modelId + '"' : 'this model';

    if (err.kind === 'network') {
        return {
            title: "Couldn't reach OpenRouter",
            body: 'The request failed before reaching the server.',
            suggestion: 'Check your internet connection, then try again.',
            action: null
        };
    }
    if (status === 401) return {
        title: 'API key rejected',
        body: 'OpenRouter rejected the API key currently saved.',
        suggestion: 'Re-paste your key into the sidebar and click "Save Key".',
        action: { label: 'Focus API key field', handler: () => { elements.apiKey?.focus(); elements.apiKey?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
    };
    if (status === 402) return {
        title: 'Insufficient credits',
        body: "Your OpenRouter account doesn't have enough credits for this call.",
        suggestion: 'Top up your balance at openrouter.ai/credits and try again.',
        action: { label: 'Open OpenRouter credits', handler: () => window.open('https://openrouter.ai/credits', '_blank', 'noopener') }
    };
    if (status === 404) return {
        title: 'Model not available',
        body: modelLabel + " isn't in OpenRouter's catalog right now.",
        suggestion: 'Pick a different model from the dropdown.',
        action: null
    };
    if (status === 429) return {
        title: 'Rate limit hit',
        body: 'OpenRouter is throttling requests for this model.',
        suggestion: 'Wait a minute, or switch to a different model to keep working.',
        action: null
    };
    if (err.kind === 'refusal' || (status === 400 && /content|policy|safety|unsafe/i.test(err.body || ''))) {
        return isVision ? {
            title: 'Vision model refused the image',
            body: modelLabel + ' declined to describe the uploaded images — usually a content-policy refusal on character/anime content.',
            suggestion: 'Open Advanced and switch the Vision Analyst to Qwen2.5-VL 72B or Llama 3.2 90B Vision — both open-weight and noticeably more permissive.',
            action: {
                label: 'Open Advanced',
                handler: () => {
                    if (elements.owAdvancedSection) elements.owAdvancedSection.open = true;
                    setTimeout(() => {
                        elements.visionModelTrigger?.click();
                        elements.visionModelContainer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 50);
                }
            }
        } : {
            title: 'Generation model refused the prompt',
            body: 'The image-generation model declined this request, usually due to content policy.',
            suggestion: 'Try GPT-5.4 Image 2 (different policy thresholds), or edit the assembled prompt to soften it.',
            action: null
        };
    }
    if (err.kind === 'parse') return {
        title: "Vision response wasn't valid JSON",
        body: 'The vision model responded but its output could not be parsed as JSON.',
        suggestion: 'Switch to Qwen2.5-VL or Gemini 2.5 Flash — they are more reliable at strict JSON output.',
        action: null
    };
    if (err.kind === 'no-image') return {
        title: 'Generation produced no image',
        body: 'The model responded successfully but no image was found in the response.',
        suggestion: 'Try a different generation model or click Generate again (occasionally transient).',
        action: null
    };
    if (typeof status === 'number' && status >= 500) return {
        title: 'OpenRouter server error',
        body: 'OpenRouter returned HTTP ' + status + '.',
        suggestion: 'Wait a moment and try again. If it persists, check openrouter.ai/status.',
        action: null
    };
    return {
        title: 'Something went wrong',
        body: err.message || ('HTTP ' + (status || 'unknown')),
        suggestion: 'Check the technical details below for the raw response.',
        action: null
    };
}

export function showOrchestratorPanel(info, level, technical) {
    level = level || 'error';
    technical = technical || '';
    const panel = elements.owErrorPanel;
    if (!panel) return;
    panel.classList.remove('level-error', 'level-warning');
    panel.classList.add('level-' + level);
    document.getElementById('owErrorTitle').textContent = info.title || '';
    document.getElementById('owErrorBody').textContent = info.body || '';
    document.getElementById('owErrorSuggestion').textContent = info.suggestion || '';
    const actions = document.getElementById('owErrorActions');
    actions.innerHTML = '';
    if (info.action && info.action.label && info.action.handler) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-ghost-sm';
        btn.textContent = info.action.label;
        btn.addEventListener('click', info.action.handler);
        actions.appendChild(btn);
    }
    const tech = document.getElementById('owErrorTechnical');
    if (tech) tech.textContent = technical;
    const techWrap = panel.querySelector('.ow-error-technical');
    if (techWrap) techWrap.hidden = !technical;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function showOrchestratorError(err) {
    const info = classifyError(err);
    const tech = [
        err.status ? 'HTTP ' + err.status : null,
        err.modelId ? 'Model: ' + err.modelId : null,
        err.stage ? 'Stage: ' + err.stage : null,
        err.kind ? 'Kind: ' + err.kind : null,
        '',
        err.body || err.message || ''
    ].filter(s => s !== null).join('\n');
    showOrchestratorPanel(info, 'error', tech);
}

export function showOrchestratorWarning(info, technical) {
    showOrchestratorPanel(info, 'warning', technical || '');
}

export function hideOrchestratorPanel() {
    if (elements.owErrorPanel) elements.owErrorPanel.hidden = true;
}

export async function hydrateOrchestratorImages() {
    const o = state.orchestrator;

    try {
        const raw = localStorage.getItem('imagen_orchestrator');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.sourceImage) {
                await ImagenDB.saveOrchestratorBlob('sourceImage', parsed.sourceImage);
                o.sourceImage = parsed.sourceImage;
            }
            if (parsed.referenceImage) {
                await ImagenDB.saveOrchestratorBlob('referenceImage', parsed.referenceImage);
                o.referenceImage = parsed.referenceImage;
            }
            if (parsed.sourceImage || parsed.referenceImage) {
                const cleaned = { ...parsed };
                delete cleaned.sourceImage;
                delete cleaned.referenceImage;
                localStorage.setItem('imagen_orchestrator', JSON.stringify(cleaned));
            }
        }
    } catch (e) {
        console.warn('Migration from localStorage failed:', e);
    }

    try {
        if (!o.sourceImage) {
            o.sourceImage = await ImagenDB.getOrchestratorBlob('sourceImage');
        }
        if (!o.referenceImage) {
            o.referenceImage = await ImagenDB.getOrchestratorBlob('referenceImage');
        }
    } catch (e) {
        console.warn('Failed to load orchestrator images from IndexedDB:', e);
    }

    if (o.sourceImage) renderRoleThumb('source', o.sourceImage);
    if (o.referenceImage) renderRoleThumb('reference', o.referenceImage);
    updateToggleDiffs();
    renderOrchestratorReadiness();
    updatePromptToolbar();
    await hydrateRoleRecents();
}

export function enhanceGenerationModelDropdown() {
    const container = elements.modelSelectContainer;
    if (!container) return;
    container.classList.add('rich');

    container.querySelectorAll('.custom-select-option').forEach(opt => {
        const id = opt.dataset.value;
        const cfg = MODEL_CONFIGS[id];
        if (!cfg || opt.querySelector('.option-bestfor')) return;
        const labelText = (cfg.name || opt.textContent).trim();
        opt.textContent = '';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'option-name';
        nameSpan.textContent = labelText;
        opt.appendChild(nameSpan);
        if (cfg.bestFor) {
            const sub = document.createElement('span');
            sub.className = 'option-bestfor';
            sub.textContent = cfg.bestFor;
            opt.appendChild(sub);
        }
    });
}
