/**
 * Toast notifications, model info cards, sidebar, modal, prompt warnings.
 */

import { state, MODEL_CONFIGS, MODEL_PROMPT_CHAR_LIMITS, DEFAULT_PROMPT_CHAR_LIMIT, PROMPT_WARN_THRESHOLD, ATTRIBUTE_LABELS } from './state.js';
import { elements } from './elements.js';
import { escapeHtml, formatPrice, speedGlyph, sanitizeImageUrl } from './utils.js';

export function renderModelInfoCard(modelId, target, meta) {
    if (!target) return;

    if (!meta) {
        target.innerHTML = `<div class="model-info-card-inner">
            <div class="info-title">Custom model</div>
            <div class="info-row">Info unavailable for custom IDs.</div>
        </div>`;
        return;
    }

    const pricing = state.modelPricing[modelId];
    const priceLines = [];
    if (pricing) {
        const prompt = formatPrice(pricing.prompt);
        const completion = formatPrice(pricing.completion);
        const image = formatPrice(pricing.image);
        if (prompt) priceLines.push(`${prompt} / 1M prompt tokens`);
        if (completion) priceLines.push(`${completion} / 1M completion tokens`);
        if (image) priceLines.push(`${formatPrice(pricing.image)} / image`);
    }

    const capParts = [];
    if (meta.supportsImageInput !== undefined) {
        capParts.push(meta.supportsImageInput ? 'Image input: yes' : 'Image input: no');
    }
    if (meta.maxReferences !== undefined && meta.maxReferences > 0) {
        capParts.push(`max ${meta.maxReferences} reference${meta.maxReferences === 1 ? '' : 's'}`);
    }

    target.innerHTML = `<div class="model-info-card-inner">
        <div class="info-title">${escapeHtml(meta.name || modelId)}</div>
        ${meta.bestFor ? `<div class="info-row info-bestfor"><strong>Best for:</strong> ${escapeHtml(meta.bestFor)}</div>` : ''}
        <div class="info-row info-stats">
            ${meta.speed ? `<span>${escapeHtml(speedGlyph(meta.speed))}</span>` : ''}
            ${meta.context ? `<span>Context: ${escapeHtml(meta.context)}</span>` : ''}
        </div>
        ${priceLines.length > 0 ? `<div class="info-row info-pricing">${priceLines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}</div>` : ''}
        ${capParts.length > 0 ? `<div class="info-row info-caps">${escapeHtml(capParts.join(' \u00b7 '))}</div>` : ''}
        ${meta.notes ? `<div class="info-row info-notes">${escapeHtml(meta.notes)}</div>` : ''}
    </div>`;
}

export function updateGeminiOptionsVisibility() {
    const isGemini = state.selectedModel.includes('gemini');
    elements.geminiOptions.style.display = isGemini ? 'flex' : 'none';
}

export function getPromptCharLimit() {
    return MODEL_PROMPT_CHAR_LIMITS[state.selectedModel] || DEFAULT_PROMPT_CHAR_LIMIT;
}

export function updatePromptLengthWarning(len) {
    const limit = getPromptCharLimit();
    const warnAt = Math.floor(limit * PROMPT_WARN_THRESHOLD);

    if (len > limit) {
        elements.charCount.classList.add('char-count-over');
        elements.charCount.classList.remove('char-count-warn');
        elements.charCount.textContent = `${len} / ${limit} chars \u2014 may be truncated`;
    } else if (len > warnAt) {
        elements.charCount.classList.add('char-count-warn');
        elements.charCount.classList.remove('char-count-over');
        elements.charCount.textContent = `${len} / ${limit} chars`;
    } else {
        elements.charCount.classList.remove('char-count-warn', 'char-count-over');
        elements.charCount.textContent = `${len} chars`;
    }
}

// ===== Sidebar Drawer (Mobile/Tablet) =====
export function createSidebarOverlay() {
    const existing = document.querySelector('.sidebar-overlay');
    if (existing) {
        elements.sidebarOverlay = existing;
        return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.querySelector('.app-container').appendChild(overlay);
    elements.sidebarOverlay = overlay;
}

export function openSidebar() {
    elements.sidebar.classList.add('open');
    elements.sidebarOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
}

export function closeSidebar() {
    elements.sidebar.classList.remove('open');
    elements.sidebarOverlay.classList.remove('visible');
    document.body.style.overflow = '';
}

export function isMobileLayout() {
    return window.matchMedia('(max-width: 1024px)').matches;
}

// ===== Modal =====
export function openModal(image) {
    state.currentImage = image;
    elements.modalImage.src = sanitizeImageUrl(image.url);

    const isOrch = image.mode === 'orchestrator';
    let orchRows = '';
    if (isOrch && image.orchestratorSnapshot) {
        const snap = image.orchestratorSnapshot;
        const transferred = Object.entries(snap.transfers || {})
            .filter(([, v]) => v)
            .map(([k]) => ATTRIBUTE_LABELS[k] || k)
            .join(', ') || '(none \u2014 all from Source)';
        orchRows = `
            <p><strong>Transferred:</strong> ${escapeHtml(transferred)}</p>
            <p><strong>Art Style:</strong> ${escapeHtml(snap.artStyle || 'source')}</p>
            <p><strong>Identity Lock:</strong> ${escapeHtml(snap.identityLock || 'high')}</p>
        `;
    }

    elements.modalMetadata.innerHTML = `
        <p><strong>Mode:</strong> ${isOrch ? '\ud83e\udde9 Orchestrator' : '\ud83d\udd8a\ufe0f Manual'}</p>
        <p><strong>Prompt:</strong> ${escapeHtml(image.prompt)}</p>
        <p><strong>Model:</strong> ${escapeHtml(image.modelName || image.model)}</p>
        <p><strong>Size/Quality:</strong> ${escapeHtml(image.quality || image.size)}</p>
        <p><strong>Aspect Ratio:</strong> ${escapeHtml(image.aspectRatio)}</p>
        <p><strong>Created:</strong> ${escapeHtml(new Date(image.createdAt).toLocaleString())}</p>
        ${orchRows}
        ${image.references?.length > 0 ? `<p><strong>References Used:</strong> ${escapeHtml(image.references.length)}</p>` : ''}
    `;
    elements.imageModal.classList.add('active');
}

export function closeModal() {
    elements.imageModal.classList.remove('active');
    state.currentImage = null;
}
