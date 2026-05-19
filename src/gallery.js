/**
 * Gallery rendering and image management.
 */

import { state, MODEL_CONFIGS } from './state.js';
import { elements } from './elements.js';
import ImagenDB from './db.js';
import { escapeHtml, sanitizeImageUrl, modeTagHtml, getImageExtension, showToast } from './utils.js';
import { openModal } from './ui.js';

export function renderGallery() {
    const hasPending = state.pendingBatches.length > 0;
    const hasImages = state.images.length > 0;

    if (!hasImages && !hasPending) {
        elements.galleryEmpty.style.display = 'flex';
        elements.gallery.innerHTML = '';
        elements.gallery.appendChild(elements.galleryEmpty);
        return;
    }

    elements.gallery.innerHTML = '';

    // Render loading placeholders for pending batches at the top
    state.pendingBatches.forEach((batch) => {
        const pendingCount = batch.count - batch.completed - batch.failed;
        for (let i = 0; i < pendingCount; i++) {
            const placeholder = document.createElement('div');
            placeholder.className = 'image-card loading-placeholder';
            const truncatedPrompt = batch.prompt.length > 60 ? batch.prompt.substring(0, 60) + '...' : batch.prompt;
            placeholder.innerHTML = `
                <div class="loading-placeholder-content">
                    <div class="loading-spinner"></div>
                    <span class="loading-placeholder-text">Generating...</span>
                </div>
                <div class="image-card-overlay" style="opacity: 1;">
                    <p class="image-card-prompt">${escapeHtml(truncatedPrompt)}</p>
                    <div class="image-card-meta">
                        <span class="meta-tag">${escapeHtml(batch.modelName)}</span>
                        <span class="meta-tag loading-tag">
                            <svg class="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="2" x2="12" y2="6"></line>
                                <line x1="12" y1="18" x2="12" y2="22"></line>
                                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                                <line x1="2" y1="12" x2="6" y2="12"></line>
                                <line x1="18" y1="12" x2="22" y2="12"></line>
                                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                            </svg>
                            Pending
                        </span>
                    </div>
                </div>
            `;
            elements.gallery.appendChild(placeholder);
        }
    });

    // Render existing images (paginated)
    const imagesToShow = state.images.slice(0, state.galleryDisplayedCount);
    imagesToShow.forEach((image, index) => {
        const card = createImageCardElement(image, index);
        elements.gallery.appendChild(card);
    });

    // Add "Load more" button if there are more images to show
    if (state.images.length > state.galleryDisplayedCount) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'gallery-load-more';
        loadMoreBtn.textContent = 'Load more';
        loadMoreBtn.addEventListener('click', loadMoreGallery);
        elements.gallery.appendChild(loadMoreBtn);
    }

    updateGalleryCount();
}

export function loadMoreGallery() {
    const prevCount = state.galleryDisplayedCount;
    state.galleryDisplayedCount += state.galleryPageSize;

    const existingBtn = elements.gallery.querySelector('.gallery-load-more');
    if (existingBtn) existingBtn.remove();

    const nextPage = state.images.slice(prevCount, state.galleryDisplayedCount);
    nextPage.forEach((image) => {
        const card = createImageCardElement(image, state.images.indexOf(image));
        elements.gallery.appendChild(card);
    });

    if (state.images.length > state.galleryDisplayedCount) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'gallery-load-more';
        loadMoreBtn.textContent = 'Load more';
        loadMoreBtn.addEventListener('click', loadMoreGallery);
        elements.gallery.appendChild(loadMoreBtn);
    }

    updateGalleryCount();
}

export function updateGalleryCount() {
    const countEl = document.getElementById('galleryCount');
    if (!countEl) return;
    const total = state.images.length;
    if (total === 0) {
        countEl.textContent = '';
        return;
    }
    const showing = Math.min(state.galleryDisplayedCount, total);
    countEl.textContent = `Showing ${showing} of ${total}`;
}

export function addLoadingPlaceholders(batch, count) {
    elements.galleryEmpty.style.display = 'none';
    for (let i = 0; i < count; i++) {
        const placeholder = createPlaceholderElement(batch);
        elements.gallery.insertBefore(placeholder, elements.gallery.firstChild);
    }
}

export function createPlaceholderElement(batch) {
    const placeholder = document.createElement('div');
    placeholder.className = 'image-card loading-placeholder';
    placeholder.dataset.batchId = batch.id;
    const truncatedPrompt = batch.prompt.length > 60 ? batch.prompt.substring(0, 60) + '...' : batch.prompt;
    placeholder.innerHTML = `
        <div class="loading-placeholder-content">
            <div class="loading-spinner"></div>
            <span class="loading-placeholder-text">Generating...</span>
        </div>
        <div class="image-card-overlay" style="opacity: 1;">
            <p class="image-card-prompt">${escapeHtml(truncatedPrompt)}</p>
            <div class="image-card-meta">
                <span class="meta-tag">${escapeHtml(batch.modelName)}</span>
                <span class="meta-tag loading-tag">
                    <svg class="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="2" x2="12" y2="6"></line>
                        <line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line>
                        <line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                    Pending
                </span>
            </div>
        </div>
    `;
    return placeholder;
}

export function removeOnePlaceholder(batchId) {
    const placeholder = elements.gallery.querySelector(`.loading-placeholder[data-batch-id="${batchId}"]`);
    if (placeholder) {
        placeholder.remove();
    }

    if (elements.gallery.children.length === 0 ||
        (elements.gallery.children.length === 1 && elements.gallery.contains(elements.galleryEmpty))) {
        elements.galleryEmpty.style.display = 'flex';
        if (!elements.gallery.contains(elements.galleryEmpty)) {
            elements.gallery.appendChild(elements.galleryEmpty);
        }
    }
}

export function prependImageCard(image, index) {
    const card = createImageCardElement(image, index);

    const firstNonPlaceholder = elements.gallery.querySelector('.image-card:not(.loading-placeholder)');
    if (firstNonPlaceholder) {
        elements.gallery.insertBefore(card, firstNonPlaceholder);
    } else {
        elements.gallery.appendChild(card);
    }

    updateCardIndices();
    updateGalleryCount();
}

export function createImageCardElement(image, index) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.imageId = image.id;

    const safeUrl = sanitizeImageUrl(image.url);
    const safePrompt = escapeHtml(image.prompt);

    card.innerHTML = `
        <div class="image-card-actions image-card-actions-top">
            <button class="image-card-btn image-card-download" title="Download image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </button>
            <button class="image-card-btn image-card-delete" title="Delete image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>
        <div class="image-card-actions image-card-actions-bottom">
            <button class="image-card-btn image-card-reference" title="Use as reference">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
            </button>
            <button class="image-card-btn image-card-recreate" title="Recreate with same settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
            </button>
        </div>
        <img src="${safeUrl}" alt="${safePrompt}" loading="lazy">
        <div class="image-card-overlay">
            <p class="image-card-prompt">${safePrompt}</p>
            <div class="image-card-meta">
                <span class="meta-tag">${escapeHtml(image.modelName || image.model)}</span>
                <span class="meta-tag">${escapeHtml(image.quality || image.size)}</span>
                <span class="meta-tag">${escapeHtml(image.aspectRatio)}</span>
                ${modeTagHtml(image)}
            </div>
        </div>
    `;

    attachImageCardHandlers(card, image);
    return card;
}

export function attachImageCardHandlers(card, image) {
    const imageId = image.id;

    card.querySelector('.image-card-download').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = state.images.findIndex(img => img.id === imageId);
        if (idx !== -1) downloadImageByIndex(idx);
    });

    card.querySelector('.image-card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = state.images.findIndex(img => img.id === imageId);
        if (idx !== -1) deleteImage(idx);
    });

    card.querySelector('.image-card-reference').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = state.images.findIndex(img => img.id === imageId);
        if (idx !== -1) addImageAsReference(idx);
    });

    card.querySelector('.image-card-recreate').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = state.images.findIndex(img => img.id === imageId);
        if (idx !== -1) recreateImageByIndex(idx);
    });

    card.addEventListener('click', () => {
        const idx = state.images.findIndex(img => img.id === imageId);
        if (idx !== -1) openModal(state.images[idx]);
    });
}

export function updateCardIndices() {
    // No longer needed since we use image IDs instead of indices
}

export async function deleteImage(index) {
    const imageToDelete = state.images[index];
    state.images.splice(index, 1);

    try {
        await ImagenDB.deleteImage(imageToDelete.id);
    } catch (e) {
        console.warn('Could not delete from IndexedDB:', e);
    }

    const card = elements.gallery.querySelector(`.image-card[data-image-id="${imageToDelete.id}"]`);
    if (card) {
        card.remove();
    }

    if (state.images.length === 0 && state.pendingBatches.length === 0) {
        elements.galleryEmpty.style.display = 'flex';
        if (!elements.gallery.contains(elements.galleryEmpty)) {
            elements.gallery.appendChild(elements.galleryEmpty);
        }
    }

    updateGalleryCount();
    showToast('Image deleted', 'success');
}

export function downloadImageByIndex(index) {
    const image = state.images[index];
    if (!image) return;

    const link = document.createElement('a');
    link.href = image.url;
    const timestamp = new Date(image.createdAt).toISOString().replace(/[:.]/g, '-');
    const ext = getImageExtension(image.url);
    link.download = `imagen-${timestamp}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Image downloaded', 'success');
}

export function closeAnyRolePicker() {
    document.querySelectorAll('.role-picker-popover').forEach(p => p.remove());
}

export function showRolePickerPopover(triggerEl, imageUrl) {
    // Lazy import to avoid circular deps - orchestrator functions are needed here
    closeAnyRolePicker();
    const pop = document.createElement('div');
    pop.className = 'role-picker-popover';
    pop.innerHTML = `
        <button type="button" data-role="source">Use as Source</button>
        <button type="button" data-role="reference">Use as Reference</button>
    `;

    const r = (triggerEl && triggerEl.getBoundingClientRect)
        ? triggerEl.getBoundingClientRect()
        : { left: window.innerWidth / 2 - 90, bottom: window.innerHeight / 2 };
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    pop.style.left = `${r.left + window.scrollX}px`;

    document.body.appendChild(pop);

    pop.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-role]');
        if (!btn) return;
        e.stopPropagation();
        const role = btn.dataset.role;
        // Import dynamically to avoid circular dependency
        import('./orchestrator.js').then(({ renderRoleThumb, updateToggleDiffs }) => {
            import('./state.js').then(({ saveOrchestratorState }) => {
                if (role === 'source') {
                    state.orchestrator.sourceImage = imageUrl;
                } else {
                    state.orchestrator.referenceImage = imageUrl;
                }
                renderRoleThumb(role, imageUrl);
                updateToggleDiffs();
                saveOrchestratorState();
                showToast(`Image set as ${role === 'source' ? 'Source' : 'Reference'}`, 'success');
                pop.remove();
            });
        });
    });

    setTimeout(() => {
        const outside = (e) => {
            if (!pop.contains(e.target)) {
                pop.remove();
                document.removeEventListener('click', outside);
            }
        };
        document.addEventListener('click', outside);
    }, 0);
}

export async function addImageAsReference(index) {
    const image = state.images[index];
    if (!image) return;

    if (state.orchestrator.enabled) {
        const card = elements.gallery.querySelector(`.image-card[data-image-id="${image.id}"]`);
        const trigger = card?.querySelector('.image-card-reference');
        showRolePickerPopover(trigger, sanitizeImageUrl(image.url));
        return;
    }

    state.references.push(image.url);
    // Dynamic import to avoid circular dep with app.js
    const { renderReferenceSlots } = await import('./app.js');
    renderReferenceSlots();
    showToast('Image added as reference', 'success');
}

export function recreateImageByIndex(index) {
    recreateFromImage(state.images[index]);
}

export function recreateFromImage(image) {
    if (!image) return;

    // Import dynamically to avoid circular dep with orchestrator
    import('./orchestrator.js').then(({ restoreOrchestratorFromSnapshot, applyOrchestratorMode }) => {
        restoreGenerationSettings(image);

        if (image.mode === 'orchestrator' && image.orchestratorSnapshot) {
            restoreOrchestratorFromSnapshot(image.orchestratorSnapshot);
            showToast('Orchestrator settings restored. Review the prompt and click Generate Image.', 'success');
        } else {
            applyOrchestratorMode(false);
            if (elements.orchestratorToggle) elements.orchestratorToggle.checked = false;
            import('./state.js').then(({ saveOrchestratorState }) => saveOrchestratorState());

            elements.promptInput.value = image.prompt;
            elements.charCount.textContent = `${image.prompt.length} chars`;
            state.references = image.references?.length ? [...image.references] : [];
            import('./app.js').then(({ renderReferenceSlots }) => renderReferenceSlots());
            showToast('Settings restored. Click Generate to recreate.', 'success');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function restoreGenerationSettings(image) {
    state.selectedModel = image.model;
    localStorage.setItem('imagen_model', state.selectedModel);
    const modelOption = document.querySelector(`#modelSelectOptions .custom-select-option[data-value="${image.model}"]`);
    if (modelOption) {
        document.querySelectorAll('#modelSelectOptions .custom-select-option').forEach(o => o.classList.remove('selected'));
        modelOption.classList.add('selected');
        const cfg = MODEL_CONFIGS[image.model];
        elements.modelSelectValue.textContent = cfg?.name || image.model;
    }

    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.quality === image.quality) {
            btn.classList.add('active');
            state.imageSize = btn.dataset.size;
            state.imageQuality = btn.dataset.quality;
        }
    });

    document.querySelectorAll('.btn-aspect').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.ratio === image.aspectRatio) {
            btn.classList.add('active');
            state.aspectRatio = image.aspectRatio;
        }
    });

    // Update UI after state changes
    import('./ui.js').then(({ renderModelInfoCard, updateGeminiOptionsVisibility }) => {
        updateGeminiOptionsVisibility();
        renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
    });
}
