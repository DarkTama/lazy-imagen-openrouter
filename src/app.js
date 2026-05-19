/**
 * Imagen - Internal AI Image Generation Tool
 * Entry point - imports all modules and wires everything together.
 */

import ImagenDB from './db.js';
import { elements, initElements } from './elements.js';
import { state, saveOrchestratorState, MODEL_CONFIGS, MAX_CONCURRENT_GENERATIONS } from './state.js';
import { ApiError, generateSingleImage, fetchModelPricing, runWithConcurrency } from './api.js';
import { escapeHtml, sanitizeImageUrl, showToast, getImageExtension } from './utils.js';
import { renderModelInfoCard, updateGeminiOptionsVisibility, updatePromptLengthWarning, createSidebarOverlay, openSidebar, closeSidebar, isMobileLayout, openModal, closeModal } from './ui.js';
import { renderGallery, addLoadingPlaceholders, removeOnePlaceholder, prependImageCard, updateGalleryCount } from './gallery.js';
import { setupOrchestrator, setupOrchestratorEventListeners, applyOrchestratorMode, renderVisionModelChip, assembleOrchestratorPrompt, snapshotOrchestrator, restoreOrchestratorFromSnapshot, setGenerateButtonLoading, hideOrchestratorPanel, showOrchestratorError, hydrateOrchestratorImages, enhanceGenerationModelDropdown } from './orchestrator.js';

// ===== Initialization =====
async function init() {
    initElements();

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

    renderGallery();

    setupEventListeners();

    updateGeminiOptionsVisibility();

    renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);

    fetchModelPricing().then(() => {
        renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
        renderVisionModelChip();
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
            updateGeminiOptionsVisibility();
            renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
            if (isMobileLayout()) closeSidebar();
        });
    });

    document.addEventListener('click', (e) => {
        if (!elements.modelSelectContainer.contains(e.target)) {
            elements.modelSelectContainer.classList.remove('open');
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
            }
        });
    }

    if (elements.increaseCount) {
        elements.increaseCount.addEventListener('click', () => {
            if (state.imageCount < 8) {
                state.imageCount++;
                elements.imageCount.value = state.imageCount;
                localStorage.setItem('imagen_count', state.imageCount);
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

    elements.modalOverlay.addEventListener('click', closeModal);
    elements.modalClose.addEventListener('click', closeModal);
    elements.useAsReference.addEventListener('click', useImageAsReference);
    elements.recreateImage.addEventListener('click', recreateImage);
    elements.downloadImage.addEventListener('click', downloadCurrentImage);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSidebar();
            closeModal();
        }
        if (e.key === 'Enter' && e.ctrlKey) generateImages();
    });

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

// ===== Paste Handler =====
function handlePaste(e) {
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
            const result = await generateSingleImage(prompt, modelConfig);
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

// ===== Global functions for inline handlers =====
window.removeReference = removeReference;
// Expose renderReferenceSlots for gallery.js to call
window._renderReferenceSlots = renderReferenceSlots;

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', init);
