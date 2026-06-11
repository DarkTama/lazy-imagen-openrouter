/**
 * Imagen - Internal AI Image Generation Tool
 * Entry point - imports all modules and wires everything together.
 */

import ImagenDB from './db.js';
import { elements, initElements } from './elements.js';
import { state, saveOrchestratorState, MODEL_CONFIGS, MAX_CONCURRENT_GENERATIONS } from './state.js';
import { ApiError, generateSingleImage, fetchModelPricing, runWithConcurrency } from './api.js';
import { escapeHtml, sanitizeImageUrl, showToast, getImageExtension, copyImageToClipboard } from './utils.js';
import { renderModelInfoCard, updateGeminiOptionsVisibility, updatePromptLengthWarning, createSidebarOverlay, openSidebar, closeSidebar, isMobileLayout, openModal, closeModal, renderCostEstimate, navigateModal } from './ui.js';
import { renderGallery, addLoadingPlaceholders, removeOnePlaceholder, prependImageCard, updateGalleryCount, initGalleryFilters, toggleFavorite } from './gallery.js';
import { setupOrchestrator, setupOrchestratorEventListeners, applyOrchestratorMode, renderVisionModelChip, assembleOrchestratorPrompt, snapshotOrchestrator, restoreOrchestratorFromSnapshot, setGenerateButtonLoading, hideOrchestratorPanel, showOrchestratorError, hydrateOrchestratorImages, enhanceGenerationModelDropdown, renderOrchestratorReadiness, setRoleImageFromUrl } from './orchestrator.js';
import { initTheme, toggleTheme } from './theme.js';
import { initHistory } from './history.js';
import { initAccessibility } from './accessibility.js';
import { exportGallery, importGallery } from './export-import.js';
import { initNotifications } from './notifications.js';
import { initImageTools, openImageTools, closeImageTools, isImageToolsOpen } from './image-tools.js';
import { initHelp } from './help.js';

// ===== Initialization =====
async function init() {
    initElements();
    initTheme();

    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    if (state.apiKey) {
        elements.apiKey.value = state.apiKey;
    }

    elements.rememberKeyToggle.checked = state.rememberKey;

    renderReferenceSlots();

    enhanceGenerationModelDropdown();
    if (state.selectedModel) {
        const savedOption = document.querySelector('#modelSelectOptions .custom-select-option[data-value="' + state.selectedModel + '"]');
        if (savedOption) {
            document.querySelectorAll('#modelSelectOptions .custom-select-option').forEach(o => o.classList.remove('selected'));
            savedOption.classList.add('selected');
            const cfg = MODEL_CONFIGS[state.selectedModel];
            elements.modelSelectValue.textContent = cfg?.name || savedOption.dataset.value;
        }
    }

    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.quality === state.imageQuality) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.btn-aspect').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.ratio === state.aspectRatio) {
            btn.classList.add('active');
        }
    });

    if (elements.imageCount) {
        elements.imageCount.value = state.imageCount;
    }

    setupOrchestrator();

    try {
        state.images = await ImagenDB.getAllImages();
    } catch (error) {
        console.error('Failed to load images from IndexedDB:', error);
        state.images = [];
    }

    await hydrateOrchestratorImages();

    await hydrateManualReferences();

    renderGallery();

    initGalleryFilters();

    setupEventListeners();

    initHistory();

    initAccessibility();

    initNotifications();

    initImageTools();

    initHelp();

    // Auto-retry toggle
    if (elements.autoRetryToggle) {
        elements.autoRetryToggle.checked = state.autoRetryEnabled;
        elements.autoRetryToggle.addEventListener('change', () => {
            state.autoRetryEnabled = elements.autoRetryToggle.checked;
            localStorage.setItem('imagen_auto_retry', state.autoRetryEnabled ? 'true' : 'false');
        });
    }

    updateGeminiOptionsVisibility();

    renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);

    renderCostEstimate();

    fetchModelPricing().then(() => {
        renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
        renderVisionModelChip();
        renderCostEstimate();
    });
}

// ===== Event Listeners =====
function setupEventListeners() {
    createSidebarOverlay();
    if (elements.sidebarToggle) {
        elements.sidebarToggle.addEventListener('click', () => {
            if (elements.sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });
    }
    if (elements.sidebarOverlay) {
        elements.sidebarOverlay.addEventListener('click', closeSidebar);
    }

    const desktopQuery = window.matchMedia('(min-width: 1025px)');
    desktopQuery.addEventListener('change', (e) => {
        if (e.matches) {
            closeSidebar();
        }
    });

    elements.modelSelectTrigger.addEventListener('click', () => {
        elements.modelSelectContainer.classList.toggle('open');
        const isOpen = elements.modelSelectContainer.classList.contains('open');
        elements.modelSelectTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    document.querySelectorAll('#modelSelectOptions .custom-select-option').forEach(option => {
        option.addEventListener('click', () => {
            state.selectedModel = option.dataset.value;
            localStorage.setItem('imagen_model', state.selectedModel);
            const cfg = MODEL_CONFIGS[state.selectedModel];
            elements.modelSelectValue.textContent = cfg?.name || option.dataset.value;
            document.querySelectorAll('#modelSelectOptions .custom-select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            elements.modelSelectContainer.classList.remove('open');
            elements.modelSelectTrigger.setAttribute('aria-expanded', 'false');
            updateGeminiOptionsVisibility();
            renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
            renderCostEstimate();
            renderOrchestratorReadiness();
            if (isMobileLayout()) closeSidebar();
        });
    });

    document.addEventListener('click', (e) => {
        if (!elements.modelSelectContainer.contains(e.target)) {
            elements.modelSelectContainer.classList.remove('open');
            elements.modelSelectTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.imageSize = btn.dataset.size;
            state.imageQuality = btn.dataset.quality;
            localStorage.setItem('imagen_size', state.imageSize);
            localStorage.setItem('imagen_quality', state.imageQuality);
        });
    });

    document.querySelectorAll('.btn-aspect').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-aspect').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.aspectRatio = btn.dataset.ratio;
            localStorage.setItem('imagen_aspect_ratio', state.aspectRatio);
        });
    });

    if (elements.decreaseCount) {
        elements.decreaseCount.addEventListener('click', () => {
            if (state.imageCount > 1) {
                state.imageCount--;
                elements.imageCount.value = state.imageCount;
                localStorage.setItem('imagen_count', state.imageCount);
                renderCostEstimate();
            }
        });
    }

    if (elements.increaseCount) {
        elements.increaseCount.addEventListener('click', () => {
            if (state.imageCount < 8) {
                state.imageCount++;
                elements.imageCount.value = state.imageCount;
                localStorage.setItem('imagen_count', state.imageCount);
                renderCostEstimate();
            }
        });
    }

    if (elements.imageCount) {
        elements.imageCount.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 1) val = 1;
            if (val > 8) val = 8;
            state.imageCount = val;
            elements.imageCount.value = val;
            localStorage.setItem('imagen_count', state.imageCount);
            renderCostEstimate();
        });
    }

    elements.saveApiKey.addEventListener('click', () => {
        state.apiKey = elements.apiKey.value.trim();
        if (state.rememberKey) {
            localStorage.setItem('imagen_api_key', state.apiKey);
            sessionStorage.removeItem('imagen_api_key');
        } else {
            sessionStorage.setItem('imagen_api_key', state.apiKey);
            localStorage.removeItem('imagen_api_key');
        }
        showToast('API key saved!', 'success');
        renderOrchestratorReadiness();
        if (isMobileLayout()) closeSidebar();
    });

    elements.rememberKeyToggle.addEventListener('change', () => {
        state.rememberKey = elements.rememberKeyToggle.checked;
        localStorage.setItem('imagen_remember_key', state.rememberKey ? 'true' : 'false');
        if (state.apiKey) {
            if (state.rememberKey) {
                localStorage.setItem('imagen_api_key', state.apiKey);
                sessionStorage.removeItem('imagen_api_key');
            } else {
                sessionStorage.setItem('imagen_api_key', state.apiKey);
                localStorage.removeItem('imagen_api_key');
            }
        }
    });

    elements.clearApiKey.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your API key?')) {
            localStorage.removeItem('imagen_api_key');
            sessionStorage.removeItem('imagen_api_key');
            state.apiKey = '';
            elements.apiKey.value = '';
            showToast('API key cleared', 'success');
            renderOrchestratorReadiness();
        }
    });

    elements.clearReferences.addEventListener('click', clearAllReferences);

    setupDragAndDrop();

    elements.promptInput.addEventListener('input', () => {
        const len = elements.promptInput.value.length;
        elements.charCount.textContent = len + ' chars';
        updatePromptLengthWarning(len);
    });

    elements.generateBtn.addEventListener('click', generateImages);

    elements.clearGallery.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all generated images?')) {
            state.images = [];
            state.galleryDisplayedCount = state.galleryPageSize;
            try {
                await ImagenDB.clearAll();
            } catch (e) {
                console.warn('Could not clear IndexedDB:', e);
            }
            renderGallery();
            showToast('Gallery cleared', 'success');
        }
    });

    if (elements.exportGallery) {
        elements.exportGallery.addEventListener('click', exportGallery);
    }

    if (elements.importGalleryInput) {
        elements.importGalleryInput.addEventListener('change', (e) => {
            if (e.target.files[0]) importGallery(e.target.files[0]);
            e.target.value = '';
        });
    }

    elements.modalOverlay.addEventListener('click', closeModal);
    elements.modalClose.addEventListener('click', closeModal);
    elements.useAsReference.addEventListener('click', useImageAsReference);
    elements.recreateImage.addEventListener('click', recreateImage);
    elements.downloadImage.addEventListener('click', downloadCurrentImage);

    if (elements.imageToolsBtn) {
        elements.imageToolsBtn.addEventListener('click', () => openImageTools(null));
    }
    if (elements.editImage) {
        elements.editImage.addEventListener('click', () => {
            const image = state.currentImage; // closeModal() nulls it
            closeModal();
            if (image) openImageTools(image);
        });
    }

    const modalPrev = document.getElementById('modalPrev');
    const modalNext = document.getElementById('modalNext');
    if (modalPrev) modalPrev.addEventListener('click', () => navigateModal(-1));
    if (modalNext) modalNext.addEventListener('click', () => navigateModal(1));

    if (elements.iterateAsSource) {
        elements.iterateAsSource.addEventListener('click', () => {
            const image = state.currentImage; // closeModal() nulls it
            if (!image) return;
            closeModal();
            setRoleImageFromUrl('source', sanitizeImageUrl(image.url));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    const favoriteImageBtn = document.getElementById('favoriteImage');
    if (favoriteImageBtn) {
        favoriteImageBtn.addEventListener('click', async () => {
            if (!state.currentImage) return;
            const isFavorite = await toggleFavorite(state.currentImage.id);
            favoriteImageBtn.classList.toggle('active', Boolean(isFavorite));
        });
    }

    const copyImageBtn = document.getElementById('copyImage');
    if (copyImageBtn) {
        copyImageBtn.addEventListener('click', async () => {
            if (!state.currentImage) return;
            try {
                await copyImageToClipboard(state.currentImage.url);
                showToast('Image copied to clipboard', 'success');
            } catch (err) {
                console.warn('Copy image failed:', err);
                showToast(err.message || 'Could not copy image', 'error');
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isImageToolsOpen()) {
                closeImageTools();
                return;
            }
            closeSidebar();
            closeModal();
        }
        if (elements.imageModal.classList.contains('active') && !isImageToolsOpen()) {
            if (e.key === 'ArrowLeft') navigateModal(-1);
            if (e.key === 'ArrowRight') navigateModal(1);
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generateImages();
    });

    setupTokenSaverTip();

    document.addEventListener('paste', handlePaste);

    setupOrchestratorEventListeners(generateImages);

    window.addEventListener('beforeunload', (e) => {
        if (state.pendingBatches.length > 0) {
            const pendingCount = state.pendingBatches.reduce((sum, batch) => {
                return sum + (batch.count - batch.completed - batch.failed);
            }, 0);
            if (pendingCount > 0) {
                e.preventDefault();
                e.returnValue = 'You have ' + pendingCount + ' image(s) still generating. If you leave, they will be lost.';
                return e.returnValue;
            }
        }
    });
}

// ===== Token-saver tip =====
function setupTokenSaverTip() {
    const tip = document.getElementById('tokenSaverTip');
    if (!tip) return;

    let dismissed = false;
    try {
        dismissed = localStorage.getItem('imagen_tip_dismissed') === 'true';
    } catch (e) { /* storage unavailable — just show the tip */ }
    tip.hidden = dismissed;

    document.getElementById('tipCopyPrompt')?.addEventListener('click', async () => {
        const prompt = state.orchestrator.enabled
            ? (elements.assembledPromptPreview?.value || '').trim()
            : elements.promptInput.value.trim();
        if (!prompt) {
            showToast('Nothing to copy yet — write or assemble a prompt first', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(prompt);
            showToast('Prompt copied — paste it into your favorite free image tool', 'success');
        } catch (err) {
            console.warn('Copy prompt failed:', err);
            showToast('Could not copy the prompt', 'error');
        }
    });

    document.getElementById('tipDismiss')?.addEventListener('click', () => {
        tip.hidden = true;
        try {
            localStorage.setItem('imagen_tip_dismissed', 'true');
        } catch (e) { /* non-fatal */ }
    });
}

// ===== Paste Handler =====
function handlePaste(e) {
    // The Image Tools editor handles its own paste (loads the image to edit)
    if (isImageToolsOpen()) return;

    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type !== 'text') {
        return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    let imageCount = 0;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    state.references.push(event.target.result);
                    renderReferenceSlots();
                };
                reader.readAsDataURL(file);
                imageCount++;
            }
        }
    }

    if (imageCount > 0) {
        showToast(imageCount + ' image(s) pasted as reference', 'success');
    }
}

// ===== Drag & Drop =====
function setupDragAndDrop() {
    const dropZone = elements.referenceSlots;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    setupPageWideDrop();
}

/**
 * Page-wide drop target: dragging an image file anywhere over the page shows
 * a full-screen overlay; dropping adds it as a reference (manual mode), asks
 * Source/Reference (orchestrator mode), or loads it into the Image Tools
 * editor when that is open.
 */
function setupPageWideDrop() {
    const overlay = document.createElement('div');
    overlay.className = 'page-drop-overlay';
    overlay.innerHTML = `
        <div class="page-drop-overlay-inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p class="page-drop-label">Drop image to add as reference</p>
        </div>
    `;
    document.body.appendChild(overlay);

    // Counter-based tracking: dragenter/dragleave fire on every element the
    // cursor crosses, so a plain toggle would flicker. Listeners live on
    // document.body because the existing preventDefaults handler there stops
    // propagation — document-level listeners would never fire.
    let dragDepth = 0;
    const dragHasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

    document.body.addEventListener('dragenter', (e) => {
        if (!dragHasFiles(e)) return;
        dragDepth++;
        const label = overlay.querySelector('.page-drop-label');
        if (isImageToolsOpen()) {
            label.textContent = 'Drop image to edit it';
        } else if (state.orchestrator.enabled) {
            label.textContent = 'Drop image — you’ll pick Source or Reference';
        } else {
            label.textContent = 'Drop image to add as reference';
        }
        overlay.classList.add('visible');
    });

    document.body.addEventListener('dragleave', () => {
        if (dragDepth > 0) dragDepth--;
        if (dragDepth === 0) overlay.classList.remove('visible');
    });

    document.body.addEventListener('drop', (e) => {
        dragDepth = 0;
        overlay.classList.remove('visible');
        handlePageDrop(e);
    });
}

function handlePageDrop(e) {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    if (isImageToolsOpen()) {
        import('./image-tools.js').then(({ loadFileIntoImageTools }) => loadFileIntoImageTools(files[0]));
        return;
    }

    if (state.orchestrator.enabled) {
        if (files.length > 1) showToast('Orchestrator mode: using the first dropped image', 'info');
        const reader = new FileReader();
        reader.onload = (event) => {
            import('./gallery.js').then(({ showRolePickerPopover }) => {
                showRolePickerPopover(null, event.target.result);
            });
        };
        reader.readAsDataURL(files[0]);
        return;
    }

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            state.references.push(event.target.result);
            renderReferenceSlots();
        };
        reader.readAsDataURL(file);
    });
    showToast(files.length + ' image(s) added as reference', 'success');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    [...files].forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                state.references.push(event.target.result);
                renderReferenceSlots();
            };
            reader.readAsDataURL(file);
        }
    });

    if (files.length > 0) {
        showToast(files.length + ' image(s) added as reference', 'success');
    }
}

// ===== Reference Image Handling =====
/**
 * Manual reference images survive reloads the same way orchestrator images
 * do — in the IndexedDB blob store (too large for localStorage). The value
 * is the JSON-serialized references array under one key.
 *
 * Writes are blocked until hydration finishes: init() renders the (empty)
 * slots before hydrating, and that render must not clobber the saved refs.
 */
let _manualRefsHydrated = false;

function persistManualReferences() {
    if (!_manualRefsHydrated) return;
    ImagenDB.saveOrchestratorBlob('manualRefs', JSON.stringify(state.references)).catch(e =>
        console.warn('Could not persist reference images:', e)
    );
}

async function hydrateManualReferences() {
    try {
        const raw = await ImagenDB.getOrchestratorBlob('manualRefs');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                state.references = parsed.filter(r => typeof r === 'string');
            }
        }
    } catch (e) {
        console.warn('Could not restore reference images:', e);
    } finally {
        _manualRefsHydrated = true;
    }
    renderReferenceSlots();
}

function handleReferenceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        state.references.push(event.target.result);
        renderReferenceSlots();
    };
    reader.readAsDataURL(file);

    e.target.value = '';
}

export function renderReferenceSlots() {
    const container = document.getElementById('referenceSlots');
    container.innerHTML = '';

    state.references.forEach((ref, index) => {
        const slot = document.createElement('div');
        slot.className = 'reference-slot filled';
        slot.dataset.slot = index;

        const img = document.createElement('img');
        img.src = sanitizeImageUrl(ref);
        img.alt = 'Reference ' + (index + 1);
        slot.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-ref';
        removeBtn.dataset.index = index;
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        slot.appendChild(removeBtn);
        container.appendChild(slot);
    });

    const addSlot = document.createElement('div');
    addSlot.className = 'reference-slot empty add-new';
    addSlot.innerHTML = '<span class="slot-label">+ Add</span><input type="file" accept="image/*" class="reference-input" id="addReferenceInput">';
    container.appendChild(addSlot);

    container.querySelectorAll('.remove-ref').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            removeReference(index);
        });
    });

    const addInput = container.querySelector('#addReferenceInput');
    if (addInput) {
        addInput.addEventListener('change', handleReferenceUpload);
    }

    persistManualReferences();
}

function removeReference(index) {
    state.references.splice(index, 1);
    renderReferenceSlots();
}

function clearAllReferences() {
    state.references = [];
    renderReferenceSlots();
    showToast('References cleared', 'success');
}

// ===== Image Generation =====
async function generateImages() {
    if (!state.apiKey) {
        showToast('Please enter your OpenRouter API key', 'error');
        return;
    }

    state.referenceLabels = null;

    if (state.orchestrator.enabled) {
        hideOrchestratorPanel();
        const o = state.orchestrator;
        if (!o.sourceImage || !o.referenceImage) {
            showToast('Upload both Source and Reference images before generating', 'error');
            return;
        }
        const modelConfig = MODEL_CONFIGS[state.selectedModel];
        if (!modelConfig?.supportsImageInput) {
            showToast((modelConfig?.name || state.selectedModel) + " doesn't support image input. Pick a Gemini or GPT-5 Image model for Orchestrator Mode.", 'error');
            return;
        }

        let prompt = (elements.assembledPromptPreview?.value || '').trim();
        if (!prompt) {
            setGenerateButtonLoading(true);
            try {
                prompt = await assembleOrchestratorPrompt();
            } finally {
                setGenerateButtonLoading(false);
            }
            if (!prompt) return;
        }

        elements.assembledPromptPreview.value = prompt;
        elements.promptInput.value = prompt;
        elements.charCount.textContent = prompt.length + ' chars';

        state.references = [o.sourceImage, o.referenceImage];
        state.referenceLabels = [
            "IMAGE 1 — SOURCE (preserve this character's identity):",
            'IMAGE 2 — REFERENCE (attribute / style donor):'
        ];
        renderReferenceSlots();
    }

    const prompt = state.orchestrator.enabled
        ? (elements.assembledPromptPreview?.value || '').trim()
        : elements.promptInput.value.trim();

    if (!prompt) {
        showToast('Please enter a prompt', 'warning');
        return;
    }

    const modelConfig = MODEL_CONFIGS[state.selectedModel];
    const currentReferences = state.references.length > 0 ? [...state.references] : [];
    const currentModel = state.selectedModel;
    const currentSize = state.imageSize;
    const currentQuality = state.imageQuality;
    const currentAspectRatio = state.aspectRatio;
    const imageCount = state.imageCount;

    const orchestratorActiveAtStart = state.orchestrator.enabled;
    const orchestratorSnapshotAtStart = orchestratorActiveAtStart
        ? snapshotOrchestrator()
        : null;

    const batchId = Date.now() + Math.random();
    const batch = {
        id: batchId,
        prompt: prompt,
        model: currentModel,
        modelName: modelConfig.name,
        count: imageCount,
        completed: 0,
        failed: 0
    };
    state.pendingBatches.push(batch);

    addLoadingPlaceholders(batch, imageCount);

    showToast('Queued ' + imageCount + ' image(s) for generation', 'success');

    let firstGenError = null;

    const generateAndDisplay = async (index) => {
        try {
            const onRetry = (attempt, delay, err) => {
                const placeholders = document.querySelectorAll('.image-card.loading-placeholder[data-batch-id="' + batchId + '"]');
                for (const ph of placeholders) {
                    const textEl = ph.querySelector('.loading-placeholder-text');
                    if (textEl) {
                        const seconds = Math.round(delay / 1000);
                        textEl.textContent = 'Retrying in ' + seconds + 's...';
                        break;
                    }
                }
            };
            const result = await generateSingleImage(prompt, modelConfig, { onRetry });
            if (result) {
                const imageData = {
                    id: Date.now() + index + Math.random(),
                    url: result,
                    prompt: prompt,
                    model: currentModel,
                    modelName: modelConfig.name,
                    size: currentSize,
                    quality: currentQuality,
                    aspectRatio: currentAspectRatio,
                    references: currentReferences,
                    mode: orchestratorActiveAtStart ? 'orchestrator' : 'manual',
                    orchestratorSnapshot: orchestratorSnapshotAtStart,
                    createdAt: new Date().toISOString()
                };
                state.images.unshift(imageData);
                batch.completed++;

                removeOnePlaceholder(batchId);
                prependImageCard(imageData, 0);

                ImagenDB.saveImage(imageData).catch(e => console.error('Failed to save to IndexedDB:', e));
            } else {
                batch.failed++;
                removeOnePlaceholder(batchId);
            }
        } catch (error) {
            console.error('Failed to generate image:', error);
            batch.failed++;
            removeOnePlaceholder(batchId);
            if (!firstGenError) firstGenError = error;
        }
    };

    if (orchestratorActiveAtStart) setGenerateButtonLoading(true);
    const tasks = [];
    for (let i = 0; i < imageCount; i++) {
        tasks.push(() => generateAndDisplay(i));
    }

    await runWithConcurrency(tasks, MAX_CONCURRENT_GENERATIONS);
    if (orchestratorActiveAtStart) setGenerateButtonLoading(false);

    const batchIndex = state.pendingBatches.findIndex(b => b.id === batchId);
    if (batchIndex !== -1) {
        state.pendingBatches.splice(batchIndex, 1);
    }

    if (batch.completed > 0) {
        showToast(batch.completed + ' image(s) generated!', 'success');
        ImagenDB.savePrompt(prompt, orchestratorActiveAtStart ? 'orchestrator' : 'manual').catch(e =>
            console.error('Failed to save prompt to history:', e)
        );
    } else if (orchestratorActiveAtStart && firstGenError) {
        if (firstGenError instanceof ApiError) {
            showOrchestratorError(firstGenError);
        } else {
            showOrchestratorError(new ApiError({
                kind: 'http', stage: 'generation', modelId: currentModel,
                message: firstGenError.message || 'Unknown error', body: String(firstGenError)
            }));
        }
    } else {
        showToast('Failed to generate images. Check console for details.', 'error');
    }
}

// ===== Modal actions =====
function useImageAsReference() {
    if (!state.currentImage) return;

    if (state.orchestrator.enabled) {
        import('./gallery.js').then(({ showRolePickerPopover }) => {
            showRolePickerPopover(elements.useAsReference, sanitizeImageUrl(state.currentImage.url));
        });
        return;
    }

    state.references.push(state.currentImage.url);
    renderReferenceSlots();
    closeModal();
    showToast('Image added as reference', 'success');
}

function recreateImage() {
    if (!state.currentImage) return;
    import('./gallery.js').then(({ recreateFromImage }) => {
        recreateFromImage(state.currentImage);
    });
    closeModal();
}

function downloadCurrentImage() {
    if (!state.currentImage) return;

    const link = document.createElement('a');
    link.href = state.currentImage.url;
    const ext = getImageExtension(state.currentImage.url);
    link.download = 'imagen_' + state.currentImage.id + '.' + ext;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Download started', 'success');
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', init);
