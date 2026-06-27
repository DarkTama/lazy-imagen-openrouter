/**
 * Imagen - Internal AI Image Generation Tool
 * Entry point - imports all modules and wires everything together.
 */

import ImagenDB from './db.js';
import { elements, initElements } from './elements.js';
import { state, saveOrchestratorState, MODEL_CONFIGS, MAX_CONCURRENT_GENERATIONS, MODEL_LIST_CACHE_KEY_PREFIX, loadApiKeyForProvider, loadRememberKeyForProvider, loadSelectedModelForProvider } from './state.js';
import { SUBSCRIPTION_IMAGE_ALLOWLIST, getProvider } from './providers.js';
import { ApiError, generateSingleImage, fetchModelPricing, fetchImageModels, fetchChatModels, runWithConcurrency } from './api.js';
import { escapeHtml, sanitizeImageUrl, showToast, getImageExtension, copyImageToClipboard } from './utils.js';
import { renderModelInfoCard, updateGeminiOptionsVisibility, updatePromptLengthWarning, createSidebarOverlay, openSidebar, closeSidebar, isMobileLayout, openModal, closeModal, renderCostEstimate, navigateModal } from './ui.js';
import { renderGallery, addLoadingPlaceholders, removeOnePlaceholder, prependImageCard, updateGalleryCount, initGalleryFilters, toggleFavorite } from './gallery.js';
import { setupOrchestrator, setupOrchestratorEventListeners, applyOrchestratorMode, renderVisionModelChip, assembleOrchestratorPrompt, snapshotOrchestrator, restoreOrchestratorFromSnapshot, setGenerateButtonLoading, hideOrchestratorPanel, showOrchestratorError, hydrateOrchestratorImages, renderOrchestratorReadiness, setRoleImageFromUrl, rebuildOrchestratorModelPickers } from './orchestrator.js';
import { createModelPicker } from './model-picker.js';
import { initTheme, toggleTheme } from './theme.js';
import { initHistory } from './history.js';
import { initAccessibility } from './accessibility.js';
import { exportGallery, importGallery } from './export-import.js';
import { initNotifications } from './notifications.js';
import { initImageTools, openImageTools, closeImageTools, isImageToolsOpen } from './image-tools.js';
import { initHelp } from './help.js';

let _generationPicker = null;

/**
 * Keep the generation picker's img2img filter in sync with the orchestrator +
 * provider state: when NanoGPT + orchestrator are both active, only img2img
 * models are shown. Auto-switches away from a txt2img model if needed.
 */
function syncGenerationPickerConstraints() {
    if (!_generationPicker) return;
    const needsImg2img = state.orchestrator.enabled && state.provider === 'nanogpt';
    _generationPicker.setFilter('img2img', needsImg2img);
    if (needsImg2img) {
        const cfg = MODEL_CONFIGS[state.selectedModel];
        if (!cfg?.supportsImageInput) {
            const liveModels = state.fetchedModels?.[state.provider]?.image || [];
            const pool = liveModels.length ? liveModels : SUBSCRIPTION_IMAGE_ALLOWLIST;
            const first = pool.find(m => m.supportsImageInput);
            if (first) {
                state.selectedModel = first.id;
                localStorage.setItem(`imagen_model_${state.provider}`, first.id);
                if (elements.modelSelectValue) elements.modelSelectValue.textContent = first.name || first.id;
                _generationPicker.syncSelected();
                renderModelInfoCard(first.id, elements.generationModelInfo, MODEL_CONFIGS[first.id]);
                renderCostEstimate();
                renderOrchestratorReadiness();
            }
        }
    }
}

// ===== Provider helpers =====

/** Storage key names for a given provider. */
function providerKeyNames(providerId) {
    return {
        lsKey: `imagen_api_key_${providerId}`,
        ssKey: `imagen_api_key_session_${providerId}`,
        rememberKey: `imagen_remember_key_${providerId}`
    };
}

/**
 * Update sidebar UI to reflect the active provider:
 * active button highlight, key label, note text, input placeholder.
 */
function applyProviderUI(providerId) {
    document.querySelectorAll('#providerToggle .btn-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.provider === providerId);
    });
    const prov = getProvider(providerId);
    if (elements.apiKeyLabel) elements.apiKeyLabel.textContent = prov.keyLabel;
    if (elements.apiKeyNote)  elements.apiKeyNote.textContent  = prov.keyNote;
    if (elements.apiKey)      elements.apiKey.placeholder      = prov.keyPlaceholder;
}

/**
 * Build or refresh the generation model picker for the given provider.
 * First call creates the searchable picker; subsequent calls update its model list.
 */
function rebuildGenerationModelOptions(providerId) {
    const container = elements.modelSelectOptions;
    if (!container) return;

    const liveModels = state.fetchedModels?.[providerId]?.image || [];
    const models = liveModels.length > 0
        ? liveModels
        : (providerId === 'nanogpt'
            ? SUBSCRIPTION_IMAGE_ALLOWLIST
            : Object.entries(MODEL_CONFIGS)
                .filter(([, cfg]) => !cfg.provider || cfg.provider === 'openrouter')
                .map(([id, cfg]) => ({ id, ...cfg })));

    if (!_generationPicker) {
        _generationPicker = createModelPicker({
            container,
            trigger: elements.modelSelectTrigger,
            valueDisplay: elements.modelSelectValue,
            getModels: () => models,
            getSelected: () => state.selectedModel,
            onSelect(id) {
                state.selectedModel = id;
                localStorage.setItem(`imagen_model_${state.provider}`, id);
                updateGeminiOptionsVisibility();
                renderModelInfoCard(id, elements.generationModelInfo, MODEL_CONFIGS[id]);
                renderCostEstimate();
                renderOrchestratorReadiness();
                if (isMobileLayout()) closeSidebar();
            },
            kind: 'image',
            onRefresh: () => fetchImageModels(state.provider),
            searchPlaceholder: 'Search image models…',
        });
    } else {
        _generationPicker.refresh(models);
    }

    // Ensure the trigger display text matches the current selection
    const selectedInList = models.find(m => m.id === state.selectedModel);
    if (selectedInList) {
        if (elements.modelSelectValue) elements.modelSelectValue.textContent = selectedInList.name || selectedInList.id;
    } else if (models.length) {
        // Fall back to first model if saved selection not in list
        state.selectedModel = models[0].id;
        localStorage.setItem(`imagen_model_${providerId}`, state.selectedModel);
        if (elements.modelSelectValue) elements.modelSelectValue.textContent = models[0].name || models[0].id;
        _generationPicker.syncSelected();
    }
}

/**
 * Switch the active provider: persist the change, reload the key/model,
 * rebuild the picker, and update all UI that depends on the provider.
 */
function switchProvider(newProviderId) {
    if (newProviderId === state.provider) return;

    // Save current model under the old provider before switching
    localStorage.setItem(`imagen_model_${state.provider}`, state.selectedModel);

    state.provider = newProviderId;
    localStorage.setItem('imagen_provider', newProviderId);

    state.apiKey      = loadApiKeyForProvider(newProviderId);
    state.rememberKey = loadRememberKeyForProvider(newProviderId);
    state.selectedModel = loadSelectedModelForProvider(newProviderId);

    elements.apiKey.value = state.apiKey;
    elements.rememberKeyToggle.checked = state.rememberKey;

    applyProviderUI(newProviderId);
    rebuildGenerationModelOptions(newProviderId);
    updateGeminiOptionsVisibility();
    renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
    renderCostEstimate();
    renderOrchestratorReadiness();

    showToast(`Switched to ${getProvider(newProviderId).label}`, 'success');

    syncGenerationPickerConstraints();

    // Rebuild vision/research pickers immediately with whatever is cached, then fetch fresh
    rebuildOrchestratorModelPickers(newProviderId);
    fetchChatModels(newProviderId).then(models => {
        state.fetchedModels[newProviderId].vision = models;
        rebuildOrchestratorModelPickers(newProviderId);
    });

    // If we haven't fetched live image models for this provider yet, do it now
    if (!state.fetchedModels[newProviderId].image.length) {
        fetchImageModels(newProviderId).then(models => {
            state.fetchedModels[newProviderId].image = models;
            rebuildGenerationModelOptions(newProviderId);
            syncGenerationPickerConstraints();
            renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
            renderCostEstimate();
        });
    }
}

// ===== Initialization =====
async function init() {
    initElements();
    initTheme();

    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Init provider toggle active state + key field label/placeholder
    applyProviderUI(state.provider);

    elements.apiKey.value = state.apiKey;
    elements.rememberKeyToggle.checked = state.rememberKey;

    renderReferenceSlots();

    // Rebuild model picker for the active provider (populates options, attaches listeners, enhances)
    rebuildGenerationModelOptions(state.provider);

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

    fetchImageModels(state.provider).then(models => {
        state.fetchedModels[state.provider].image = models;
        rebuildGenerationModelOptions(state.provider);
        renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
        renderCostEstimate();
    });

    fetchChatModels(state.provider).then(models => {
        state.fetchedModels[state.provider].vision = models;
        rebuildOrchestratorModelPickers(state.provider);
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

    // Provider toggle
    document.querySelectorAll('#providerToggle .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => switchProvider(btn.dataset.provider));
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
        const { lsKey, ssKey } = providerKeyNames(state.provider);
        state.apiKey = elements.apiKey.value.trim();
        if (state.rememberKey) {
            localStorage.setItem(lsKey, state.apiKey);
            sessionStorage.removeItem(ssKey);
        } else {
            sessionStorage.setItem(ssKey, state.apiKey);
            localStorage.removeItem(lsKey);
        }
        showToast('API key saved!', 'success');
        renderOrchestratorReadiness();
        if (isMobileLayout()) closeSidebar();
    });

    elements.rememberKeyToggle.addEventListener('change', () => {
        const { lsKey, ssKey, rememberKey } = providerKeyNames(state.provider);
        state.rememberKey = elements.rememberKeyToggle.checked;
        localStorage.setItem(rememberKey, state.rememberKey ? 'true' : 'false');
        if (state.apiKey) {
            if (state.rememberKey) {
                localStorage.setItem(lsKey, state.apiKey);
                sessionStorage.removeItem(ssKey);
            } else {
                sessionStorage.setItem(ssKey, state.apiKey);
                localStorage.removeItem(lsKey);
            }
        }
    });

    elements.clearApiKey.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your API key?')) {
            const { lsKey, ssKey } = providerKeyNames(state.provider);
            localStorage.removeItem(lsKey);
            sessionStorage.removeItem(ssKey);
            state.apiKey = '';
            elements.apiKey.value = '';
            showToast('API key cleared', 'success');
            renderOrchestratorReadiness();
        }
    });

    elements.testApiKey.addEventListener('click', async () => {
        const key = elements.apiKey.value.trim() || state.apiKey;
        if (!key) { showToast('Enter an API key to test', 'error'); return; }
        const btn = elements.testApiKey;
        btn.disabled = true;
        btn.textContent = 'Testing…';
        try {
            const prov = getProvider(state.provider);
            const testUrl = prov.modelsUrl || prov.imageModelsUrl;
            const res = await fetch(testUrl, { headers: prov.headers(key) });
            if (res.ok) {
                showToast(`${prov.label} connection successful — API key is valid`, 'success');
            } else {
                const body = await res.text().catch(() => '');
                let msg = '';
                try { msg = JSON.parse(body).error?.message || ''; } catch (_) {}
                showToast(`${prov.label} key rejected (HTTP ${res.status})${msg ? ': ' + msg : ''}`, 'error');
            }
        } catch (e) {
            showToast(`${getProvider(state.provider).label} connection failed: ` + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Test Connection';
        }
    });

    elements.refreshModels.addEventListener('click', async () => {
        const btn = elements.refreshModels;
        btn.disabled = true;
        btn.textContent = 'Refreshing…';
        try {
            // Clear cached model list so fetchImageModels re-fetches from network
            sessionStorage.removeItem(`${MODEL_LIST_CACHE_KEY_PREFIX}${state.provider}_image`);
            const models = await fetchImageModels(state.provider);
            if (_generationPicker) _generationPicker.refresh(models);
            showToast(`Model list refreshed (${models.length} models)`, 'success');
        } catch (e) {
            showToast('Failed to refresh models: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Refresh model list';
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

    document.addEventListener('imagen:orchestrator-mode', () => syncGenerationPickerConstraints());

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
        showToast(`Please enter your ${getProvider(state.provider).label} API key`, 'error');
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
            showToast((modelConfig?.name || state.selectedModel) + " doesn't support image input — pick a model that supports img2img for Orchestrator Mode.", 'error');
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
