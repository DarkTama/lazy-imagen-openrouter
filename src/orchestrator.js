/**
 * Orchestrator mode logic.
 */

import { state, saveOrchestratorState, ORCHESTRATOR_DEFAULTS, ATTRIBUTE_LABELS, ATTRIBUTE_PHRASING, ATTRIBUTE_KEYS, VISION_MODELS, VISION_MODELS_BY_ID, RESEARCH_MODELS, MODEL_CONFIGS, LARGE_IMAGE_THRESHOLD_BYTES } from './state.js';
import { elements } from './elements.js';
import ImagenDB from './db.js';
import { escapeHtml, sanitizeImageUrl, debounce, showToast, formatPrice, speedGlyph, readFileAsDataURI, compressDataUri, compressImageFile, approxKB } from './utils.js';
import { ApiError, runVisionAnalysis, researchSubject } from './api.js';
import { isMobileLayout, renderModelInfoCard } from './ui.js';

export function setupOrchestrator() {
    const o = state.orchestrator;

    renderToggleGrid();

    elements.visionModelOptions.innerHTML = '';
    VISION_MODELS.forEach(m => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = m.id;
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
}

export function applyOrchestratorMode(enabled) {
    const o = state.orchestrator;
    o.enabled = !!enabled;
    document.body.classList.toggle('orchestrator-active', o.enabled);
    elements.orchestratorWorkspace.hidden = !o.enabled;
    elements.promptInput.readOnly = o.enabled;
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
}

export function clearRoleThumb(role) {
    const thumb = role === 'source' ? elements.sourceThumb : elements.referenceThumb;
    const clear = role === 'source' ? elements.sourceClear : elements.referenceClear;
    const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
    thumb.src = '';
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
}

export async function setRoleImage(role, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const isLarge = file.size > LARGE_IMAGE_THRESHOLD_BYTES;
    let dataUri;

    if (isLarge && state.orchestrator.autoCompress) {
        try {
            dataUri = await compressImageFile(file);
            const beforeKB = Math.round(file.size / 1024);
            const afterKB = approxKB(dataUri);
            showToast('Compressed ' + role + ': ' + beforeKB + ' KB → ~' + afterKB + ' KB', 'success');
        } catch (err) {
            console.error('Compression failed:', err);
            dataUri = await readFileAsDataURI(file);
            showToast('Could not compress — using original (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)', 'warning');
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

    elements.owToggleGrid.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"][data-attr]');
        if (!cb) return;
        o.transfers[cb.dataset.attr] = cb.checked;
        updateToggleDiffs();
        saveOrchestratorState();
    });

    document.querySelectorAll('input[name="artStyle"]').forEach(r => {
        r.addEventListener('change', () => {
            if (r.checked) {
                o.artStyle = r.value;
                saveOrchestratorState();
            }
        });
    });

    elements.identityLock.addEventListener('change', () => {
        o.identityLock = elements.identityLock.value;
        saveOrchestratorState();
    });

    elements.creativitySlider.addEventListener('input', () => {
        o.creativity = parseInt(elements.creativitySlider.value, 10);
        elements.creativityValue.textContent = o.creativity + '%';
    });
    elements.creativitySlider.addEventListener('change', saveOrchestratorState);

    elements.visionModelTrigger.addEventListener('click', () => {
        elements.visionModelContainer.classList.toggle('open');
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
        renderVisionModelChip();
        saveOrchestratorState();
    });
    document.addEventListener('click', (e) => {
        if (!elements.visionModelContainer.contains(e.target)) {
            elements.visionModelContainer.classList.remove('open');
        }
    });

    elements.visionModelCustom.addEventListener('input', debounce(() => {
        o.visionModelCustom = elements.visionModelCustom.value;
        renderVisionModelChip();
        saveOrchestratorState();
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
    if (!state.apiKey) {
        showToast('Save your OpenRouter API key first', 'error');
        return null;
    }
    if (!o.sourceImage || !o.referenceImage) {
        showToast('Upload both Source and Reference images before assembling', 'error');
        return null;
    }
    hideOrchestratorPanel();
    const visionModel = (o.visionModelCustom && o.visionModelCustom.trim()) || o.visionModel;
    setAssembleButtonLoading(true);
    try {
        const vision = await runVisionAnalysis(o.sourceImage, o.referenceImage, visionModel);
        const assembled = assemblePrompt(vision, o);
        o.lastAssembledPrompt = assembled;
        if (elements.assembledPromptPreview) {
            elements.assembledPromptPreview.value = assembled;
        }
        saveOrchestratorState();
        showToast('Prompt assembled. Review or edit, then click Generate Image.', 'success');
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
