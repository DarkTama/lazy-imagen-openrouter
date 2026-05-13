/**
 * Imagen - Internal AI Image Generation Tool
 * Supports multiple models via OpenRouter API
 */

// ===== IndexedDB Storage =====
const ImagenDB = {
    dbName: 'ImagenDB',
    storeName: 'images',
    db: null,

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    },

    async saveImage(imageData) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(imageData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllImages() {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => {
                // Sort by createdAt descending (newest first)
                const images = request.result.sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                resolve(images);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteImage(id) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clearAll() {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async ensureOpen() {
        if (!this.db) {
            await this.open();
        }
    }
};

// ===== State Management =====
const ORCHESTRATOR_DEFAULTS = {
    enabled: false,
    sourceImage: null,       // base64 data URI
    referenceImage: null,    // base64 data URI
    transfers: {             // booleans, true => use Reference, false => use Source
        clothing: false, pose: false, background: false,
        expression: false, hair: false, lighting: false,
        palette: false, accessories: false, camera: false
    },
    artStyle: 'source',      // 'source' | 'reference' | 'blend'
    identityLock: 'high',    // 'low' | 'medium' | 'high' | 'max'
    creativity: 25,          // 0-100
    visionModel: 'google/gemini-2.5-flash',
    visionModelCustom: '',   // overrides visionModel if non-empty
    researchModel: 'perplexity/sonar',
    subjectContext: '',
    notes: '',
    lastAssembledPrompt: '',
    advancedOpen: false,         // <details> Advanced drawer state
    subjectContextOpen: false    // <details> Subject Context drawer state
};

// Human-readable labels for each transfer attribute (used in the toggle grid).
const ATTRIBUTE_LABELS = {
    clothing: 'Clothing',
    pose: 'Pose / Body',
    background: 'Background',
    expression: 'Facial Expression',
    hair: 'Hair',
    lighting: 'Lighting',
    palette: 'Color Palette',
    accessories: 'Accessories',
    camera: 'Camera / Framing'
};

function loadOrchestratorState() {
    try {
        const raw = localStorage.getItem('imagen_orchestrator');
        if (!raw) return { ...ORCHESTRATOR_DEFAULTS, transfers: { ...ORCHESTRATOR_DEFAULTS.transfers } };
        const parsed = JSON.parse(raw);
        return {
            ...ORCHESTRATOR_DEFAULTS,
            ...parsed,
            transfers: { ...ORCHESTRATOR_DEFAULTS.transfers, ...(parsed.transfers || {}) }
        };
    } catch (e) {
        console.warn('Failed to load orchestrator state:', e);
        return { ...ORCHESTRATOR_DEFAULTS, transfers: { ...ORCHESTRATOR_DEFAULTS.transfers } };
    }
}

const state = {
    apiKey: localStorage.getItem('imagen_api_key') || '',
    selectedModel: localStorage.getItem('imagen_model') || 'google/gemini-2.5-flash-image',
    imageSize: localStorage.getItem('imagen_size') || '1024x1024',
    imageQuality: localStorage.getItem('imagen_quality') || '1K',
    aspectRatio: localStorage.getItem('imagen_aspect_ratio') || '1:1',
    imageCount: parseInt(localStorage.getItem('imagen_count')) || 1,
    references: [], // Dynamic array - unlimited references
    images: [], // Will be loaded from IndexedDB
    currentImage: null,
    pendingBatches: [], // Track pending generation batches { id, prompt, count, completed, failed }
    modelPricing: {}, // { 'model/id': { prompt, completion, image, request } } — enriched from /api/v1/models
    orchestrator: loadOrchestratorState()
};

function saveOrchestratorState() {
    try {
        localStorage.setItem('imagen_orchestrator', JSON.stringify(state.orchestrator));
    } catch (e) {
        // Most likely quota exceeded — base64 images can blow past localStorage's ~5MB limit.
        console.warn('Failed to persist orchestrator state (quota?):', e);
        showToast('Could not save orchestrator state — uploaded images may be too large for browser storage.', 'warning');
    }
}

// ===== Model Configurations =====
// `bestFor`, `speed` ('fast'|'med'|'slow'), and `notes` are surfaced in the model
// info card. Pricing is enriched at runtime from /api/v1/models (see fetchModelPricing).
const MODEL_CONFIGS = {
    'google/gemini-2.5-flash-image': {
        name: 'Gemini 2.5 Flash Image',
        supportsImageSize: true,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 3,
        bestFor: 'Recommended default — fast generation and edits',
        speed: 'fast',
        notes: 'Strong all-rounder. Supports image-to-image with up to 3 references.'
    },
    'google/gemini-2.5-flash-image-preview': {
        name: 'Gemini 2.5 Flash Image (Preview)',
        supportsImageSize: true,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 3,
        bestFor: 'Preview build of Gemini 2.5 Flash Image',
        speed: 'fast',
        notes: 'May be cheaper or differently rate-limited than the stable release.'
    },
    'google/gemini-3.1-flash-image-preview': {
        name: 'Gemini 3.1 Flash Image (Preview)',
        supportsImageSize: true,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 3,
        bestFor: 'Newer Flash generation — improved detail and consistency',
        speed: 'fast',
        notes: 'Preview model; behavior may change between releases.'
    },
    'google/gemini-3-pro-image-preview': {
        name: 'Gemini 3 Pro Image (Preview)',
        supportsImageSize: true,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 14,
        bestFor: 'Best for complex compositions with many references',
        speed: 'med',
        notes: 'Supports up to 14 reference images — ideal for character sheets, mood boards.'
    },
    'openai/gpt-5-image': {
        name: 'GPT-5 Image',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 1,
        bestFor: 'Best for prompt adherence and text rendering',
        speed: 'med',
        notes: 'OpenAI image model. Strong at following detailed instructions.'
    },
    'openai/gpt-5-image-mini': {
        name: 'GPT-5 Image Mini',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 1,
        bestFor: 'Cheaper OpenAI option for quick iterations',
        speed: 'fast',
        notes: 'Smaller variant of GPT-5 Image — lower cost, slightly reduced quality.'
    },
    'black-forest-labs/flux.2-pro': {
        name: 'Flux 2 Pro',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Photorealism and artistic flexibility',
        speed: 'med',
        notes: 'Text-to-image only. No reference image support.'
    },
    'black-forest-labs/flux.2-max': {
        name: 'Flux 2 Max',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Highest fidelity Flux output',
        speed: 'slow',
        notes: 'Premium Flux tier — best for hero shots. Text-to-image only.'
    },
    'black-forest-labs/flux.2-flex': {
        name: 'Flux 2 Flex',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Balanced quality vs cost in the Flux family',
        speed: 'fast',
        notes: 'Mid-tier Flux. Text-to-image only.'
    },
    'black-forest-labs/flux.2-klein-4b': {
        name: 'Flux 2 Klein 4B',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Cheapest Flux option, fastest turnaround',
        speed: 'fast',
        notes: 'Small 4B-parameter Flux variant. Good for drafts.'
    },
    'bytedance-seed/seedream-4.5': {
        name: 'Seedream 4.5',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Stylized illustration and anime aesthetics',
        speed: 'med',
        notes: 'ByteDance model. Strong on East Asian art styles. Text-to-image only.'
    },
    'sourceful/riverflow-v2-fast-preview': {
        name: 'Riverflow V2 Fast',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Quick exploratory generations',
        speed: 'fast',
        notes: 'Fast tier of Riverflow V2. Text-to-image only.'
    },
    'sourceful/riverflow-v2-standard-preview': {
        name: 'Riverflow V2 Standard',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Balanced quality and speed',
        speed: 'med',
        notes: 'Standard tier of Riverflow V2. Text-to-image only.'
    },
    'sourceful/riverflow-v2-max-preview': {
        name: 'Riverflow V2 Max',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Highest quality Riverflow output',
        speed: 'slow',
        notes: 'Max tier of Riverflow V2. Text-to-image only.'
    }
};

// ===== Vision-capable models for the analyst step =====
// Used by Orchestrator Mode to extract structured metadata from Source + Reference images.
const VISION_MODELS = [
    { id: 'google/gemini-2.5-flash',                  name: 'Gemini 2.5 Flash',
      bestFor: 'Recommended — fast, cheap, accurate JSON', speed: 'fast', context: '1M tokens' },
    { id: 'google/gemini-2.0-flash-001',              name: 'Gemini 2.0 Flash',
      bestFor: 'Cheapest option',                          speed: 'fast', context: '1M tokens' },
    { id: 'google/gemini-2.5-pro',                    name: 'Gemini 2.5 Pro',
      bestFor: 'Highest detail extraction, slower',        speed: 'slow', context: '2M tokens' },
    { id: 'openai/gpt-4o-mini',                       name: 'GPT-4o Mini',
      bestFor: 'Fast OpenAI option, strong JSON adherence', speed: 'fast', context: '128K tokens' },
    { id: 'openai/gpt-4o',                            name: 'GPT-4o',
      bestFor: 'Best for nuanced scene description',       speed: 'med',  context: '128K tokens' },
    { id: 'openai/gpt-4.1-mini',                      name: 'GPT-4.1 Mini',
      bestFor: 'Newest small OpenAI vision model',         speed: 'fast', context: '1M tokens' },
    { id: 'anthropic/claude-3.5-sonnet',              name: 'Claude 3.5 Sonnet',
      bestFor: 'Excellent visual reasoning',               speed: 'med',  context: '200K tokens' },
    { id: 'anthropic/claude-sonnet-4',                name: 'Claude Sonnet 4',
      bestFor: 'Best for subtle style + composition',      speed: 'med',  context: '200K tokens' },
    { id: 'qwen/qwen2.5-vl-72b-instruct',             name: 'Qwen2.5-VL 72B',
      bestFor: 'Open-weights, strong on anime/art',        speed: 'med',  context: '32K tokens' },
    { id: 'meta-llama/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 90B Vision',
      bestFor: 'Open-weights, general purpose',            speed: 'med',  context: '128K tokens' },
];

// Lookup helper for vision models by id.
const VISION_MODELS_BY_ID = VISION_MODELS.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

// ===== Web-research models =====
// Used by the optional "Research subject" button in Orchestrator Mode.
const RESEARCH_MODELS = [
    { id: 'perplexity/sonar',           name: 'Perplexity Sonar',           bestFor: 'Fast web research, cheap' },
    { id: 'perplexity/sonar-pro',       name: 'Perplexity Sonar Pro',       bestFor: 'Deeper research, more sources' },
    { id: 'perplexity/sonar-reasoning', name: 'Perplexity Sonar Reasoning', bestFor: 'Complex/obscure subjects' },
];

// ===== Transformation attribute keys =====
// Each attribute has a corresponding `source_<key>` and `ref_<key>` field in the vision JSON.
const ATTRIBUTE_KEYS = [
    'clothing', 'pose', 'background', 'expression',
    'hair', 'lighting', 'palette', 'accessories', 'camera'
];

// ===== DOM Elements =====
const elements = {
    // Sidebar
    modelSelectContainer: document.getElementById('modelSelectContainer'),
    modelSelectTrigger: document.getElementById('modelSelectTrigger'),
    modelSelectValue: document.getElementById('modelSelectValue'),
    modelSelectOptions: document.getElementById('modelSelectOptions'),
    geminiOptions: document.getElementById('geminiOptions'),
    apiKey: document.getElementById('apiKey'),
    saveApiKey: document.getElementById('saveApiKey'),
    imageCount: document.getElementById('imageCount'),
    decreaseCount: document.getElementById('decreaseCount'),
    increaseCount: document.getElementById('increaseCount'),
    clearReferences: document.getElementById('clearReferences'),
    referenceSlots: document.getElementById('referenceSlots'),

    // Main Content
    promptInput: document.getElementById('promptInput'),
    charCount: document.getElementById('charCount'),
    generateBtn: document.getElementById('generateBtn'),
    gallery: document.getElementById('gallery'),
    galleryEmpty: document.getElementById('galleryEmpty'),
    clearGallery: document.getElementById('clearGallery'),

    // Modal
    imageModal: document.getElementById('imageModal'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalClose: document.getElementById('modalClose'),
    modalImage: document.getElementById('modalImage'),
    modalMetadata: document.getElementById('modalMetadata'),
    useAsReference: document.getElementById('useAsReference'),
    recreateImage: document.getElementById('recreateImage'),
    downloadImage: document.getElementById('downloadImage'),

    // Orchestrator
    orchestratorSection: document.getElementById('orchestratorSection'),
    orchestratorToggle: document.getElementById('orchestratorToggle'),
    orchestratorWorkspace: document.getElementById('orchestratorWorkspace'),
    orchestratorAssembleBtn: document.getElementById('orchestratorAssembleBtn'),
    orchestratorGenerateBtn: document.getElementById('orchestratorGenerateBtn'),
    generationModelInfo: document.getElementById('generationModelInfo'),
    sourceDropzone: document.getElementById('sourceDropzone'),
    sourceInput: document.getElementById('sourceInput'),
    sourceThumb: document.getElementById('sourceThumb'),
    sourceClear: document.getElementById('sourceClear'),
    referenceDropzone: document.getElementById('referenceDropzone'),
    referenceInput: document.getElementById('referenceInput'),
    referenceThumb: document.getElementById('referenceThumb'),
    referenceClear: document.getElementById('referenceClear'),
    owToggleGrid: document.getElementById('owToggleGrid'),
    identityLock: document.getElementById('identityLock'),
    creativitySlider: document.getElementById('creativitySlider'),
    creativityValue: document.getElementById('creativityValue'),
    visionModelContainer: document.getElementById('visionModelContainer'),
    visionModelTrigger: document.getElementById('visionModelTrigger'),
    visionModelValue: document.getElementById('visionModelValue'),
    visionModelOptions: document.getElementById('visionModelOptions'),
    visionModelCustom: document.getElementById('visionModelCustom'),
    visionModelChip: document.getElementById('visionModelChip'),
    owSubjectContextSection: document.getElementById('owSubjectContextSection'),
    owAdvancedSection: document.getElementById('owAdvancedSection'),
    subjectContext: document.getElementById('subjectContext'),
    researchSubjectBtn: document.getElementById('researchSubjectBtn'),
    researchModelSelect: document.getElementById('researchModelSelect'),
    orchestratorNotes: document.getElementById('orchestratorNotes'),
    assembledPromptPreview: document.getElementById('assembledPromptPreview')
};

// ===== Initialization =====
async function init() {
    // Load saved API key
    if (state.apiKey) {
        elements.apiKey.value = state.apiKey;
    }

    // Render reference slots
    renderReferenceSlots();

    // Restore saved model selection — only after we've extended each option with a "best for" subtitle
    enhanceGenerationModelDropdown();
    if (state.selectedModel) {
        const savedOption = document.querySelector(`#modelSelectOptions .custom-select-option[data-value="${state.selectedModel}"]`);
        if (savedOption) {
            document.querySelectorAll('#modelSelectOptions .custom-select-option').forEach(o => o.classList.remove('selected'));
            savedOption.classList.add('selected');
            const cfg = MODEL_CONFIGS[state.selectedModel];
            elements.modelSelectValue.textContent = cfg?.name || savedOption.dataset.value;
        }
    }

    // Restore saved image quality/size
    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.quality === state.imageQuality) {
            btn.classList.add('active');
        }
    });

    // Restore saved aspect ratio
    document.querySelectorAll('.btn-aspect').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.ratio === state.aspectRatio) {
            btn.classList.add('active');
        }
    });

    // Restore saved image count
    if (elements.imageCount) {
        elements.imageCount.value = state.imageCount;
    }

    // Set up orchestrator UI (must run before setupEventListeners since it populates dropdowns)
    setupOrchestrator();

    // Load images from IndexedDB
    try {
        state.images = await ImagenDB.getAllImages();
    } catch (error) {
        console.error('Failed to load images from IndexedDB:', error);
        state.images = [];
    }

    // Render gallery
    renderGallery();

    // Set up event listeners
    setupEventListeners();

    // Initialize UI state
    updateGeminiOptionsVisibility();

    // Render initial generation model info card (sidebar). Vision model uses a compact chip
    // rendered by setupOrchestrator() / renderVisionModelChip() instead of a full card.
    renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);

    // Fetch pricing in the background; re-render generation card and vision chip when it arrives.
    fetchModelPricing().then(() => {
        renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);
        renderVisionModelChip();
    });
}

// Adds a "best for" subtitle line to each option in the existing generation model dropdown,
// turning it into a rich (two-line) dropdown without rewriting all the markup.
function enhanceGenerationModelDropdown() {
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

// ===== Orchestrator setup =====
function setupOrchestrator() {
    const o = state.orchestrator;

    // Render the 9-cell transfer toggle grid (with visual-diff thumbs per cell).
    renderToggleGrid();

    // Populate vision model dropdown
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

    // Populate research model dropdown
    elements.researchModelSelect.innerHTML = '';
    RESEARCH_MODELS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} — ${m.bestFor}`;
        if (m.id === o.researchModel) opt.selected = true;
        elements.researchModelSelect.appendChild(opt);
    });

    // Apply enabled state — shows/hides workspace + manual prompt area.
    applyOrchestratorMode(o.enabled);
    elements.orchestratorToggle.checked = o.enabled;

    // Restore image thumbnails
    if (o.sourceImage) renderRoleThumb('source', o.sourceImage);
    if (o.referenceImage) renderRoleThumb('reference', o.referenceImage);

    // Restore transfer checkboxes (in the dynamically-rendered grid)
    Object.entries(o.transfers).forEach(([attr, checked]) => {
        const cb = document.querySelector(`.ow-toggle-cell input[data-attr="${attr}"]`);
        if (cb) cb.checked = !!checked;
    });

    // Restore art style radio
    const radio = document.querySelector(`input[name="artStyle"][value="${o.artStyle}"]`);
    if (radio) radio.checked = true;

    // Restore identity lock + creativity
    elements.identityLock.value = o.identityLock;
    elements.creativitySlider.value = o.creativity;
    elements.creativityValue.textContent = `${o.creativity}%`;

    // Restore custom vision model + subject + notes
    elements.visionModelCustom.value = o.visionModelCustom || '';
    elements.subjectContext.value = o.subjectContext || '';
    elements.orchestratorNotes.value = o.notes || '';
    elements.researchSubjectBtn.disabled = !(o.subjectContext || '').trim();
    if (o.subjectContext) elements.researchSubjectBtn.title = 'Research this subject via web search';

    // Restore drawer open states
    // Subject Context auto-opens if there's saved text; otherwise honor explicit state.
    elements.owSubjectContextSection.open = o.subjectContextOpen || !!(o.subjectContext || '').trim();
    elements.owAdvancedSection.open = !!o.advancedOpen;

    // Render vision model chip
    renderVisionModelChip();
    // Initial diff thumbs render
    updateToggleDiffs();

    // Restore last assembled prompt preview
    if (o.lastAssembledPrompt) {
        elements.assembledPromptPreview.value = o.lastAssembledPrompt;
    }
}

// Apply orchestrator-mode visual state: show workspace, hide manual prompt area.
function applyOrchestratorMode(enabled) {
    const o = state.orchestrator;
    o.enabled = !!enabled;
    document.body.classList.toggle('orchestrator-active', o.enabled);
    elements.orchestratorWorkspace.hidden = !o.enabled;
    elements.promptInput.readOnly = o.enabled;
}

// Render the 9 transfer toggle cells with attached visual-diff thumbs.
function renderToggleGrid() {
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

// Update the two diff thumbs inside each toggle cell based on current Source/Reference
// images and the per-attribute checkbox state.
function updateToggleDiffs() {
    if (!elements.owToggleGrid) return;
    const o = state.orchestrator;
    const src = o.sourceImage;
    const ref = o.referenceImage;

    ATTRIBUTE_KEYS.forEach(attr => {
        const checked = !!o.transfers[attr];
        const cell = elements.owToggleGrid.querySelector(`.ow-toggle-cell[data-cell="${attr}"]`);
        if (!cell) return;
        cell.classList.toggle('checked', checked);

        const tag = cell.querySelector('.ow-toggle-cell-source');
        if (tag) tag.textContent = checked ? 'from REFERENCE' : 'from SOURCE';

        const diff = cell.querySelector('.ow-diff');
        if (!diff) return;

        const srcThumb = src
            ? `<div class="ow-diff-thumb ${checked ? 'dimmed' : 'chosen'}" style="background-image:url('${src}')" title="Source"></div>`
            : `<div class="ow-diff-thumb placeholder" title="No source uploaded"></div>`;
        const refThumb = ref
            ? `<div class="ow-diff-thumb ${checked ? 'chosen' : 'dimmed'}" style="background-image:url('${ref}')" title="Reference"></div>`
            : `<div class="ow-diff-thumb placeholder" title="No reference uploaded"></div>`;

        diff.innerHTML = `${srcThumb}<span class="ow-diff-arrow">→</span>${refThumb}`;
    });
}

// Compact one-line chip for the Vision Analyst model in the Advanced drawer.
function renderVisionModelChip() {
    if (!elements.visionModelChip) return;
    const o = state.orchestrator;
    const customId = (o.visionModelCustom || '').trim();
    if (customId) {
        elements.visionModelChip.textContent = `${customId} · custom`;
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
    if (promptPrice) parts.push(`${promptPrice} / 1M prompt`);
    elements.visionModelChip.textContent = parts.join(' · ');
}

function renderRoleThumb(role, dataUri) {
    const thumb = role === 'source' ? elements.sourceThumb : elements.referenceThumb;
    const clear = role === 'source' ? elements.sourceClear : elements.referenceClear;
    const zone = role === 'source' ? elements.sourceDropzone : elements.referenceDropzone;
    thumb.src = dataUri;
    thumb.hidden = false;
    clear.hidden = false;
    zone.classList.add('filled');
}

function clearRoleThumb(role) {
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

function readFileAsDataURI(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function setRoleImage(role, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUri = await readFileAsDataURI(file);
    if (role === 'source') {
        state.orchestrator.sourceImage = dataUri;
    } else {
        state.orchestrator.referenceImage = dataUri;
    }
    renderRoleThumb(role, dataUri);
    updateToggleDiffs();
    saveOrchestratorState();
}

function setupRoleDropzone(role) {
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

// Simple debounce — for input fields that persist state.
function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function setupOrchestratorEventListeners() {
    const o = state.orchestrator;

    // Enable/disable toggle — flips the whole layout via applyOrchestratorMode.
    elements.orchestratorToggle.addEventListener('change', () => {
        applyOrchestratorMode(elements.orchestratorToggle.checked);
        saveOrchestratorState();
    });

    // Role dropzones (Source + Reference)
    setupRoleDropzone('source');
    setupRoleDropzone('reference');

    // Transfer checkboxes (dynamically rendered in the workspace toggle grid).
    // Use event delegation so we don't depend on the rendering order.
    elements.owToggleGrid.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"][data-attr]');
        if (!cb) return;
        o.transfers[cb.dataset.attr] = cb.checked;
        updateToggleDiffs();
        saveOrchestratorState();
    });

    // Art style radios
    document.querySelectorAll('input[name="artStyle"]').forEach(r => {
        r.addEventListener('change', () => {
            if (r.checked) {
                o.artStyle = r.value;
                saveOrchestratorState();
            }
        });
    });

    // Identity lock
    elements.identityLock.addEventListener('change', () => {
        o.identityLock = elements.identityLock.value;
        saveOrchestratorState();
    });

    // Creativity slider
    elements.creativitySlider.addEventListener('input', () => {
        o.creativity = parseInt(elements.creativitySlider.value, 10);
        elements.creativityValue.textContent = `${o.creativity}%`;
    });
    elements.creativitySlider.addEventListener('change', saveOrchestratorState);

    // Vision model dropdown
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

    // Custom vision model ID
    elements.visionModelCustom.addEventListener('input', debounce(() => {
        o.visionModelCustom = elements.visionModelCustom.value;
        renderVisionModelChip();
        saveOrchestratorState();
    }, 250));

    // Subject Context drawer open/close persistence
    elements.owSubjectContextSection.addEventListener('toggle', () => {
        o.subjectContextOpen = elements.owSubjectContextSection.open;
        saveOrchestratorState();
    });

    // Advanced drawer open/close persistence
    elements.owAdvancedSection.addEventListener('toggle', () => {
        o.advancedOpen = elements.owAdvancedSection.open;
        saveOrchestratorState();
    });

    // Subject context textarea
    elements.subjectContext.addEventListener('input', debounce(() => {
        o.subjectContext = elements.subjectContext.value;
        const hasText = !!o.subjectContext.trim();
        elements.researchSubjectBtn.disabled = !hasText;
        elements.researchSubjectBtn.title = hasText
            ? 'Research this subject via web search'
            : 'Type a subject name first';
        saveOrchestratorState();
    }, 250));

    // Research model
    elements.researchModelSelect.addEventListener('change', () => {
        o.researchModel = elements.researchModelSelect.value;
        saveOrchestratorState();
    });

    // Research button — defensive: prevent the parent <details> from toggling.
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
            showToast(`Research failed: ${err.message}`, 'error');
        } finally {
            elements.researchSubjectBtn.classList.remove('loading');
            elements.researchSubjectBtn.disabled = false;
        }
    });

    // Notes
    elements.orchestratorNotes.addEventListener('input', debounce(() => {
        o.notes = elements.orchestratorNotes.value;
        saveOrchestratorState();
    }, 250));

    // Assemble button — runs vision + assemble only, fills the editable textarea.
    if (elements.orchestratorAssembleBtn) {
        elements.orchestratorAssembleBtn.addEventListener('click', assembleOrchestratorPrompt);
    }

    // Generate button inside the workspace — reuses the same generation pipeline.
    if (elements.orchestratorGenerateBtn) {
        elements.orchestratorGenerateBtn.addEventListener('click', generateImages);
    }

    // Persist edits to the assembled-prompt textarea (it's the source of truth).
    if (elements.assembledPromptPreview) {
        elements.assembledPromptPreview.addEventListener('input', debounce(() => {
            state.orchestrator.lastAssembledPrompt = elements.assembledPromptPreview.value;
            saveOrchestratorState();
        }, 300));
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Custom dropdown - toggle
    elements.modelSelectTrigger.addEventListener('click', () => {
        elements.modelSelectContainer.classList.toggle('open');
    });

    // Custom dropdown - option selection (generation model only — vision dropdown wired in setupOrchestratorEventListeners)
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
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.modelSelectContainer.contains(e.target)) {
            elements.modelSelectContainer.classList.remove('open');
        }
    });

    // Size toggle buttons
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

    // Aspect ratio buttons
    document.querySelectorAll('.btn-aspect').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-aspect').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.aspectRatio = btn.dataset.ratio;
            localStorage.setItem('imagen_aspect_ratio', state.aspectRatio);
        });
    });

    // Image count
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

    // API Key
    elements.saveApiKey.addEventListener('click', () => {
        state.apiKey = elements.apiKey.value.trim();
        localStorage.setItem('imagen_api_key', state.apiKey);
        showToast('API key saved!', 'success');
    });

    // Reference images are handled by renderReferenceSlots()
    elements.clearReferences.addEventListener('click', clearAllReferences);

    // Drag & Drop for reference images
    setupDragAndDrop();

    // Prompt input
    elements.promptInput.addEventListener('input', () => {
        elements.charCount.textContent = `${elements.promptInput.value.length} chars`;
    });

    // Generate button
    elements.generateBtn.addEventListener('click', generateImages);

    // Clear gallery
    elements.clearGallery.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all generated images?')) {
            state.images = [];
            try {
                await ImagenDB.clearAll();
            } catch (e) {
                console.warn('Could not clear IndexedDB:', e);
            }
            renderGallery();
            showToast('Gallery cleared', 'success');
        }
    });

    // Modal
    elements.modalOverlay.addEventListener('click', closeModal);
    elements.modalClose.addEventListener('click', closeModal);
    elements.useAsReference.addEventListener('click', useImageAsReference);
    elements.recreateImage.addEventListener('click', recreateImage);
    elements.downloadImage.addEventListener('click', downloadCurrentImage);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Enter' && e.ctrlKey) generateImages();
    });

    // Paste images from clipboard
    document.addEventListener('paste', handlePaste);

    // Orchestrator Mode listeners
    setupOrchestratorEventListeners();

    // Warn user before leaving if there are pending generations
    window.addEventListener('beforeunload', (e) => {
        if (state.pendingBatches.length > 0) {
            const pendingCount = state.pendingBatches.reduce((sum, batch) => {
                return sum + (batch.count - batch.completed - batch.failed);
            }, 0);
            if (pendingCount > 0) {
                e.preventDefault();
                // Modern browsers ignore custom messages, but we need to return something
                e.returnValue = `You have ${pendingCount} image(s) still generating. If you leave, they will be lost.`;
                return e.returnValue;
            }
        }
    });
}

// ===== Paste Handler =====
function handlePaste(e) {
    // Don't intercept paste if user is typing in an input field (except prompt)
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
        showToast(`${imageCount} image(s) pasted as reference`, 'success');
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
        showToast(`${files.length} image(s) added as reference`, 'success');
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

    // Reset the input so the same file can be selected again
    e.target.value = '';
}

function renderReferenceSlots() {
    const container = document.getElementById('referenceSlots');
    container.innerHTML = '';

    // Render existing references
    state.references.forEach((ref, index) => {
        const slot = document.createElement('div');
        slot.className = 'reference-slot filled';
        slot.dataset.slot = index;
        slot.innerHTML = `
            <img src="${ref}" alt="Reference ${index + 1}">
            <button class="remove-ref" data-index="${index}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        container.appendChild(slot);
    });

    // Add "Add new" slot
    const addSlot = document.createElement('div');
    addSlot.className = 'reference-slot empty add-new';
    addSlot.innerHTML = `
        <span class="slot-label">+ Add</span>
        <input type="file" accept="image/*" class="reference-input" id="addReferenceInput">
    `;
    container.appendChild(addSlot);

    // Attach event listeners
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

// ===== Orchestrator Mode =====
// Vision-driven prompt composition: extracts structured metadata from a Source + Reference
// image pair, then assembles a final prompt based on user toggle selections.

const VISION_SYSTEM_PROMPT = `You analyze two images for a prompt-composition pipeline. Image 1 is the SOURCE (character to preserve). Image 2 is the REFERENCE (style/pose/clothes donor).

Return ONLY a JSON object with these keys (strings, concise — 1 sentence each, no markdown):
  source_char        — physical features of the character in Image 1
  source_clothes     — what they're wearing in Image 1
  source_pose        — pose / body language in Image 1
  source_bg          — background of Image 1
  source_style       — art style of Image 1
  source_expression  — facial expression in Image 1
  source_hair        — hair style + color in Image 1
  source_lighting    — lighting in Image 1
  source_palette     — color palette of Image 1
  source_accessories — accessories visible in Image 1
  source_camera      — camera framing / angle / shot type of Image 1
  ref_clothes        — what's worn in Image 2
  ref_pose           — pose in Image 2
  ref_bg             — background of Image 2
  ref_style          — art style of Image 2
  ref_expression     — facial expression in Image 2
  ref_hair           — hair in Image 2
  ref_lighting       — lighting in Image 2
  ref_palette        — color palette of Image 2
  ref_accessories    — accessories in Image 2
  ref_camera         — camera framing of Image 2

Output strictly valid JSON. No prose around it. No code fences.`;

async function runVisionAnalysis(sourceB64, referenceB64, modelId) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Imagen Internal Tool'
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: 'system', content: VISION_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: sourceB64, detail: 'high' } },
                        { type: 'image_url', image_url: { url: referenceB64, detail: 'high' } },
                        { type: 'text', text: 'Analyze both images and return the JSON described in the system prompt.' }
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Vision API error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('Vision model returned no text content.');
    }

    // Try direct parse first; otherwise extract the first {...} block.
    try {
        return JSON.parse(raw);
    } catch (_) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Vision response was not valid JSON.');
        return JSON.parse(match[0]);
    }
}

async function researchSubject(subjectText, modelId) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Imagen Internal Tool'
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                {
                    role: 'system',
                    content: `You are a research assistant for an image-generation prompt. The user wants to generate an image of the following subject. Briefly research and describe the subject's distinctive visual features in 3-6 sentences. Focus on: physical appearance, signature clothing/accessories, color scheme, and any visual motifs. Keep it factual and concise. No citations, no markdown headings — just plain prose.`
                },
                { role: 'user', content: `Subject: ${subjectText}` }
            ]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Research API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Research model returned no content.');
    }
    return text.trim();
}

// Pure function — composes the final prompt from vision JSON + user preferences.
function assemblePrompt(v, p) {
    const pick = (attr) => p.transfers[attr] ? v[`ref_${attr}`] : v[`source_${attr}`];

    const style =
        p.artStyle === 'source'    ? v.source_style :
        p.artStyle === 'reference' ? v.ref_style :
        /* blend */                  `${v.source_style}, blended with ${v.ref_style}`;

    const lockClause = {
        low:    'preserve general likeness of the character',
        medium: "preserve the character's facial identity",
        high:   'maintain strong facial consistency with Image 1',
        max:    'maintain 100% facial identity from Image 1 — same eyes, nose, mouth, jawline, skin tone'
    }[p.identityLock] || '';

    const creativityClause = p.creativity > 60
        ? 'allow creative reinterpretation of secondary details.'
        : p.creativity < 20
            ? 'stay faithful to the source composition.'
            : '';

    const parts = [
        p.subjectContext ? `Subject context: ${p.subjectContext}.` : '',
        `${style} of ${v.source_char},`,
        `wearing ${pick('clothing')},`,
        `${pick('pose')},`,
        `${pick('expression')} expression,`,
        `with ${pick('hair')},`,
        `${pick('accessories')},`,
        `in ${pick('background')},`,
        `${pick('lighting')} lighting,`,
        `${pick('palette')} color palette,`,
        `${pick('camera')} framing.`,
        lockClause ? lockClause + '.' : '',
        creativityClause,
        p.notes ? `Additional notes: ${p.notes}` : ''
    ];

    return parts.filter(s => s && s.trim()).join(' ');
}

// Loading state helpers for the two workspace footer buttons.
function setAssembleButtonLoading(on) {
    if (!elements.orchestratorAssembleBtn) return;
    elements.orchestratorAssembleBtn.disabled = on;
    elements.orchestratorAssembleBtn.classList.toggle('loading', on);
    const label = elements.orchestratorAssembleBtn.querySelector('.ow-btn-label');
    if (label) label.textContent = on ? 'Analyzing images…' : 'Assemble Prompt';
}

function setGenerateButtonLoading(on) {
    if (!elements.orchestratorGenerateBtn) return;
    elements.orchestratorGenerateBtn.disabled = on;
    elements.orchestratorGenerateBtn.classList.toggle('loading', on);
    const label = elements.orchestratorGenerateBtn.querySelector('.ow-btn-label');
    if (label) label.textContent = on ? 'Generating…' : 'Generate Image →';
}

// Runs the vision call + assembles the prompt; fills the editable textarea.
// Returns the assembled prompt string on success, or null on failure.
// Does NOT trigger image generation.
async function assembleOrchestratorPrompt() {
    const o = state.orchestrator;
    if (!state.apiKey) {
        showToast('Save your OpenRouter API key first', 'error');
        return null;
    }
    if (!o.sourceImage || !o.referenceImage) {
        showToast('Upload both Source and Reference images before assembling', 'error');
        return null;
    }
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
        showToast(`Assemble failed: ${err.message}`, 'error');
        return null;
    } finally {
        setAssembleButtonLoading(false);
    }
}

// Returns a plain-data copy of state.orchestrator for embedding in image metadata.
// Drops fields that are runtime/UI-only.
function snapshotOrchestrator() {
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
        lastAssembledPrompt: o.lastAssembledPrompt
    };
}

// Restores an orchestrator snapshot from a saved image. Switches the app into
// orchestrator mode and pushes every field to the DOM.
function restoreOrchestratorFromSnapshot(snap) {
    if (!snap) return;
    Object.assign(state.orchestrator, {
        ...ORCHESTRATOR_DEFAULTS,
        ...snap,
        transfers: { ...ORCHESTRATOR_DEFAULTS.transfers, ...(snap.transfers || {}) },
        enabled: true
    });

    applyOrchestratorMode(true);
    if (elements.orchestratorToggle) elements.orchestratorToggle.checked = true;

    // Source / Reference thumbnails
    if (snap.sourceImage) renderRoleThumb('source', snap.sourceImage); else clearRoleThumb('source');
    if (snap.referenceImage) renderRoleThumb('reference', snap.referenceImage); else clearRoleThumb('reference');

    // Transfer checkboxes
    ATTRIBUTE_KEYS.forEach(attr => {
        const cb = elements.owToggleGrid?.querySelector(`input[data-attr="${attr}"]`);
        if (cb) cb.checked = !!snap.transfers?.[attr];
    });

    // Art style radio
    const radio = document.querySelector(`input[name="artStyle"][value="${snap.artStyle || 'source'}"]`);
    if (radio) radio.checked = true;

    // Sliders
    if (elements.identityLock) elements.identityLock.value = snap.identityLock || 'high';
    const cr = snap.creativity ?? 25;
    if (elements.creativitySlider) elements.creativitySlider.value = cr;
    if (elements.creativityValue) elements.creativityValue.textContent = `${cr}%`;

    // Models
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

    // Context, notes, assembled prompt
    if (elements.subjectContext) elements.subjectContext.value = snap.subjectContext || '';
    if (elements.orchestratorNotes) elements.orchestratorNotes.value = snap.notes || '';
    if (elements.assembledPromptPreview) elements.assembledPromptPreview.value = snap.lastAssembledPrompt || '';

    // Open the Subject Context drawer if there's text to show
    if (elements.owSubjectContextSection) {
        elements.owSubjectContextSection.open = !!(snap.subjectContext || '').trim();
    }

    updateToggleDiffs();
    saveOrchestratorState();
}

// ===== Model Metadata =====
// Fetches pricing from OpenRouter's public /models endpoint and caches it for 24h
// in sessionStorage. Failures are non-fatal — the info card just omits price rows.
const MODEL_PRICING_CACHE_KEY = 'imagen_model_pricing';
const MODEL_PRICING_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchModelPricing() {
    // Try cache first.
    try {
        const cached = sessionStorage.getItem(MODEL_PRICING_CACHE_KEY);
        if (cached) {
            const { pricing, ts } = JSON.parse(cached);
            if (Date.now() - ts < MODEL_PRICING_TTL_MS) {
                state.modelPricing = pricing;
                return pricing;
            }
        }
    } catch (e) {
        console.warn('Pricing cache read failed:', e);
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) throw new Error(`/models returned ${response.status}`);
        const json = await response.json();
        const list = Array.isArray(json.data) ? json.data : [];
        const pricing = {};
        for (const m of list) {
            if (!m.id || !m.pricing) continue;
            const p = m.pricing;
            pricing[m.id] = {
                prompt: parseFloat(p.prompt) || 0,
                completion: parseFloat(p.completion) || 0,
                image: parseFloat(p.image) || 0,
                request: parseFloat(p.request) || 0
            };
        }
        state.modelPricing = pricing;
        try {
            sessionStorage.setItem(MODEL_PRICING_CACHE_KEY, JSON.stringify({ pricing, ts: Date.now() }));
        } catch (e) {
            console.warn('Pricing cache write failed:', e);
        }
        return pricing;
    } catch (e) {
        console.warn('Failed to fetch model pricing:', e);
        state.modelPricing = {};
        return {};
    }
}

function speedGlyph(speed) {
    if (speed === 'fast') return '⚡ fast';
    if (speed === 'slow') return '🐢 slow';
    return '◐ medium';
}

function formatPrice(perToken) {
    // OpenRouter prices are in $ per token. Convert to per-1M for display.
    if (!perToken || perToken <= 0) return null;
    const perMillion = perToken * 1_000_000;
    if (perMillion >= 1) return `$${perMillion.toFixed(2)}`;
    return `$${perMillion.toFixed(3)}`;
}

// Renders a small info card under a model dropdown.
// `meta` shape: { name, bestFor?, speed?, context?, notes?, supportsImageInput?, maxReferences? }
function renderModelInfoCard(modelId, target, meta) {
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
        ${capParts.length > 0 ? `<div class="info-row info-caps">${escapeHtml(capParts.join(' · '))}</div>` : ''}
        ${meta.notes ? `<div class="info-row info-notes">${escapeHtml(meta.notes)}</div>` : ''}
    </div>`;
}

// ===== Image Generation =====
async function generateImages() {
    if (!state.apiKey) {
        showToast('Please enter your OpenRouter API key', 'error');
        return;
    }

    // === Orchestrator pre-step ===
    // Source-of-truth for the prompt is the editable textarea. If it's empty,
    // auto-run Assemble first; otherwise use what's there verbatim.
    if (state.orchestrator.enabled) {
        const o = state.orchestrator;
        if (!o.sourceImage || !o.referenceImage) {
            showToast('Upload both Source and Reference images before generating', 'error');
            return;
        }
        const modelConfig = MODEL_CONFIGS[state.selectedModel];
        if (!modelConfig?.supportsImageInput) {
            showToast(`${modelConfig?.name || state.selectedModel} doesn't support image input. Pick a Gemini or GPT-5 Image model for Orchestrator Mode.`, 'error');
            return;
        }

        let prompt = (elements.assembledPromptPreview?.value || '').trim();
        if (!prompt) {
            // Auto-assemble if the textarea is empty.
            setGenerateButtonLoading(true);
            try {
                prompt = await assembleOrchestratorPrompt();
            } finally {
                setGenerateButtonLoading(false);
            }
            if (!prompt) return; // assembleOrchestratorPrompt already toasted
        }

        // Sync the textarea + manual textarea so downstream flow reads same value.
        elements.assembledPromptPreview.value = prompt;
        elements.promptInput.value = prompt;
        elements.charCount.textContent = `${prompt.length} chars`;

        // Inject Source + Reference into state.references for the generation call.
        state.references = [o.sourceImage, o.referenceImage];
        renderReferenceSlots();
    }

    // Read the prompt — manual mode uses #promptInput, orchestrator wrote into both.
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

    // Snapshot orchestrator mode + state at the start, so each image saved in
    // this batch carries its mode/snapshot even if the user flips the toggle
    // mid-generation.
    const orchestratorActiveAtStart = state.orchestrator.enabled;
    const orchestratorSnapshotAtStart = orchestratorActiveAtStart
        ? snapshotOrchestrator()
        : null;

    // Create a batch to track this generation request
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
    
    // Add loading placeholders without full re-render
    addLoadingPlaceholders(batch, imageCount);
    
    showToast(`Queued ${imageCount} image(s) for generation`, 'success');

    // Generate images and display each one as it completes
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
                
                // Remove one placeholder and add the new image
                removeOnePlaceholder(batchId);
                prependImageCard(imageData, 0);
                
                // Save to IndexedDB in background
                ImagenDB.saveImage(imageData).catch(e => console.error('Failed to save to IndexedDB:', e));
            } else {
                batch.failed++;
                removeOnePlaceholder(batchId);
            }
        } catch (error) {
            console.error('Failed to generate image:', error);
            batch.failed++;
            removeOnePlaceholder(batchId);
        }
    };

    // Start all generations in parallel, each will render when done
    if (orchestratorActiveAtStart) setGenerateButtonLoading(true);
    const promises = [];
    for (let i = 0; i < imageCount; i++) {
        promises.push(generateAndDisplay(i));
    }

    // Wait for all to complete to update final UI state
    await Promise.allSettled(promises);
    if (orchestratorActiveAtStart) setGenerateButtonLoading(false);

    // Remove this batch from pending
    const batchIndex = state.pendingBatches.findIndex(b => b.id === batchId);
    if (batchIndex !== -1) {
        state.pendingBatches.splice(batchIndex, 1);
    }

    if (batch.completed > 0) {
        showToast(`${batch.completed} image(s) generated!`, 'success');
    } else {
        showToast('Failed to generate images. Check console for details.', 'error');
    }
}

async function generateSingleImage(prompt, modelConfig) {
    // Build message content
    const content = [];

    // Add reference images if supported
    if (modelConfig.supportsImageInput) {
        state.references.forEach((ref, index) => {
            if (ref) {
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: ref,
                        detail: 'high'
                    }
                });
            }
        });
    }

    // Add text prompt
    content.push({
        type: 'text',
        text: prompt
    });

    // Build request body
    const requestBody = {
        model: state.selectedModel,
        messages: [
            {
                role: 'user',
                content: content.length === 1 ? prompt : content
            }
        ],
        modalities: modelConfig.modalities
    };

    // Add Gemini-specific options
    if (modelConfig.supportsImageSize && state.selectedModel.includes('gemini')) {
        requestBody.image_config = {
            image_size: state.imageQuality.toLowerCase(),
            aspect_ratio: state.aspectRatio
        };
    }

    // Add aspect ratio for other models
    if (modelConfig.supportsAspectRatio && !state.selectedModel.includes('gemini')) {
        requestBody.aspect_ratio = state.aspectRatio;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Imagen Internal Tool'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract image from response
    // OpenRouter returns images in different formats depending on the model
    const message = data.choices?.[0]?.message;

    if (!message) {
        throw new Error('No response from model');
    }

    // Log full response for debugging
    console.log('API Response:', JSON.stringify(data, null, 2));

    // Check for images array in message (OpenRouter SDK format)
    // According to OpenRouter docs: message.images[].image_url.url
    if (message.images && message.images.length > 0) {
        const img = message.images[0];
        // OpenRouter SDK format: { image_url: { url: "data:image/..." } }
        if (img.image_url?.url) {
            return img.image_url.url;
        }
        // Alternative formats
        if (typeof img === 'string') {
            if (img.startsWith('data:') || img.startsWith('http')) {
                return img;
            }
            return `data:image/png;base64,${img}`;
        }
        if (img.url) return img.url;
        if (img.b64_json) return `data:image/png;base64,${img.b64_json}`;
    }

    // Check for image in content parts (different models may use this format)
    if (Array.isArray(message.content)) {
        for (const part of message.content) {
            // OpenAI-style image_url part
            if (part.type === 'image_url' && part.image_url?.url) {
                return part.image_url.url;
            }
            // Gemini-style inlineData part
            if (part.inlineData?.data) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                return `data:${mimeType};base64,${part.inlineData.data}`;
            }
            // Generic image part
            if (part.type === 'image' && part.image) {
                if (part.image.startsWith('data:')) {
                    return part.image;
                }
                return `data:image/png;base64,${part.image}`;
            }
        }
    }

    // Check if content itself is the image data (some models return this way)
    if (typeof message.content === 'string' && message.content.startsWith('data:image')) {
        return message.content;
    }

    throw new Error('No image in response. Check console for full API response.');
}

// ===== Gallery =====
function renderGallery() {
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
            const safePrompt = escapeHtml(batch.prompt);
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

    // Render existing images
    state.images.forEach((image, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';

        // Sanitize URL - only allow data URIs and https URLs
        const safeUrl = sanitizeImageUrl(image.url);
        const safePrompt = escapeHtml(image.prompt);

        card.innerHTML = `
            <div class="image-card-actions image-card-actions-top">
                <button class="image-card-btn image-card-download" data-index="${index}" title="Download image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </button>
                <button class="image-card-btn image-card-delete" data-index="${index}" title="Delete image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
            <div class="image-card-actions image-card-actions-bottom">
                <button class="image-card-btn image-card-reference" data-index="${index}" title="Use as reference">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </button>
                <button class="image-card-btn image-card-recreate" data-index="${index}" title="Recreate with same settings">
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

        // Download button handler
        const downloadBtn = card.querySelector('.image-card-download');
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadImageByIndex(index);
        });

        // Delete button handler
        const deleteBtn = card.querySelector('.image-card-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImage(index);
        });

        // Reference button handler
        const referenceBtn = card.querySelector('.image-card-reference');
        referenceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addImageAsReference(index);
        });

        // Recreate button handler
        const recreateBtn = card.querySelector('.image-card-recreate');
        recreateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            recreateImageByIndex(index);
        });

        // Open modal on card click
        card.addEventListener('click', () => openModal(image));
        elements.gallery.appendChild(card);
    });
}

// ===== Incremental Gallery Updates =====
function addLoadingPlaceholders(batch, count) {
    // Hide empty state if showing
    elements.galleryEmpty.style.display = 'none';
    
    for (let i = 0; i < count; i++) {
        const placeholder = createPlaceholderElement(batch);
        elements.gallery.insertBefore(placeholder, elements.gallery.firstChild);
    }
}

function createPlaceholderElement(batch) {
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

function removeOnePlaceholder(batchId) {
    const placeholder = elements.gallery.querySelector(`.loading-placeholder[data-batch-id="${batchId}"]`);
    if (placeholder) {
        placeholder.remove();
    }
    
    // Show empty state if gallery is now empty
    if (elements.gallery.children.length === 0 || 
        (elements.gallery.children.length === 1 && elements.gallery.contains(elements.galleryEmpty))) {
        elements.galleryEmpty.style.display = 'flex';
        if (!elements.gallery.contains(elements.galleryEmpty)) {
            elements.gallery.appendChild(elements.galleryEmpty);
        }
    }
}

function prependImageCard(image, index) {
    const card = createImageCardElement(image, index);
    
    // Insert after any remaining placeholders
    const firstNonPlaceholder = elements.gallery.querySelector('.image-card:not(.loading-placeholder)');
    if (firstNonPlaceholder) {
        elements.gallery.insertBefore(card, firstNonPlaceholder);
    } else {
        elements.gallery.appendChild(card);
    }
    
    // Update indices on existing cards since we prepended
    updateCardIndices();
}

function createImageCardElement(image, index) {
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

    // Attach event handlers
    attachImageCardHandlers(card, image);
    
    return card;
}

function attachImageCardHandlers(card, image) {
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

function updateCardIndices() {
    // No longer needed since we use image IDs instead of indices
}

async function deleteImage(index) {
    const imageToDelete = state.images[index];
    state.images.splice(index, 1);

    try {
        await ImagenDB.deleteImage(imageToDelete.id);
    } catch (e) {
        console.warn('Could not delete from IndexedDB:', e);
    }

    // Remove card from DOM without full re-render
    const card = elements.gallery.querySelector(`.image-card[data-image-id="${imageToDelete.id}"]`);
    if (card) {
        card.remove();
    }
    
    // Show empty state if gallery is now empty
    if (state.images.length === 0 && state.pendingBatches.length === 0) {
        elements.galleryEmpty.style.display = 'flex';
        if (!elements.gallery.contains(elements.galleryEmpty)) {
            elements.gallery.appendChild(elements.galleryEmpty);
        }
    }
    
    showToast('Image deleted', 'success');
}

function downloadImageByIndex(index) {
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

// Small floating popover for picking a Source / Reference slot when in
// orchestrator mode. Anchored to the clicked trigger element.
function closeAnyRolePicker() {
    document.querySelectorAll('.role-picker-popover').forEach(p => p.remove());
}

function showRolePickerPopover(triggerEl, imageUrl) {
    closeAnyRolePicker();
    const pop = document.createElement('div');
    pop.className = 'role-picker-popover';
    pop.innerHTML = `
        <button type="button" data-role="source">Use as Source</button>
        <button type="button" data-role="reference">Use as Reference</button>
    `;

    // Position relative to the trigger element, falling back to viewport center.
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

    // Close on outside click — defer to next tick so we don't capture the click that opened us.
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

function addImageAsReference(index) {
    const image = state.images[index];
    if (!image) return;

    if (state.orchestrator.enabled) {
        // Anchor the popover to the reference button on this card (if findable).
        const card = elements.gallery.querySelector(`.image-card[data-image-id="${image.id}"]`);
        const trigger = card?.querySelector('.image-card-reference');
        showRolePickerPopover(trigger, sanitizeImageUrl(image.url));
        return;
    }

    state.references.push(image.url);
    renderReferenceSlots();
    showToast('Image added as reference', 'success');
}

// Restore the generation-model side of the settings (model, size, aspect).
// Common to both manual and orchestrator restore paths.
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
    updateGeminiOptionsVisibility();
    renderModelInfoCard(state.selectedModel, elements.generationModelInfo, MODEL_CONFIGS[state.selectedModel]);

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
}

function recreateFromImage(image) {
    if (!image) return;

    restoreGenerationSettings(image);

    if (image.mode === 'orchestrator' && image.orchestratorSnapshot) {
        // Switch to orchestrator mode and restore every field from the snapshot.
        restoreOrchestratorFromSnapshot(image.orchestratorSnapshot);
        showToast('Orchestrator settings restored. Review the prompt and click Generate Image.', 'success');
    } else {
        // Manual (or legacy image with no mode field) — turn orchestrator off
        // and populate the manual prompt + references.
        applyOrchestratorMode(false);
        if (elements.orchestratorToggle) elements.orchestratorToggle.checked = false;
        saveOrchestratorState();

        elements.promptInput.value = image.prompt;
        elements.charCount.textContent = `${image.prompt.length} chars`;
        state.references = image.references?.length ? [...image.references] : [];
        renderReferenceSlots();
        showToast('Settings restored. Click Generate to recreate.', 'success');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function recreateImageByIndex(index) {
    recreateFromImage(state.images[index]);
}

// ===== Modal =====
function openModal(image) {
    state.currentImage = image;
    elements.modalImage.src = sanitizeImageUrl(image.url);

    const isOrch = image.mode === 'orchestrator';
    let orchRows = '';
    if (isOrch && image.orchestratorSnapshot) {
        const snap = image.orchestratorSnapshot;
        const transferred = Object.entries(snap.transfers || {})
            .filter(([, v]) => v)
            .map(([k]) => ATTRIBUTE_LABELS[k] || k)
            .join(', ') || '(none — all from Source)';
        orchRows = `
            <p><strong>Transferred:</strong> ${escapeHtml(transferred)}</p>
            <p><strong>Art Style:</strong> ${escapeHtml(snap.artStyle || 'source')}</p>
            <p><strong>Identity Lock:</strong> ${escapeHtml(snap.identityLock || 'high')}</p>
        `;
    }

    elements.modalMetadata.innerHTML = `
        <p><strong>Mode:</strong> ${isOrch ? '🧩 Orchestrator' : '🖊️ Manual'}</p>
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

function closeModal() {
    elements.imageModal.classList.remove('active');
    state.currentImage = null;
}

function useImageAsReference() {
    if (!state.currentImage) return;

    if (state.orchestrator.enabled) {
        showRolePickerPopover(elements.useAsReference, sanitizeImageUrl(state.currentImage.url));
        return;
    }

    state.references.push(state.currentImage.url);
    renderReferenceSlots();
    closeModal();
    showToast('Image added as reference', 'success');
}

function recreateImage() {
    if (!state.currentImage) return;
    recreateFromImage(state.currentImage);
    closeModal();
}

function downloadCurrentImage() {
    if (!state.currentImage) return;

    const link = document.createElement('a');
    link.href = state.currentImage.url;
    const ext = getImageExtension(state.currentImage.url);
    link.download = `imagen_${state.currentImage.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Download started', 'success');
}

// ===== UI Helpers =====
function updateGeminiOptionsVisibility() {
    const isGemini = state.selectedModel.includes('gemini');
    elements.geminiOptions.style.display = isGemini ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Renders the small "mode" badge for an image card / modal.
// Defaults to manual when image has no mode field (legacy images).
function modeTagHtml(image) {
    const isOrch = image?.mode === 'orchestrator';
    return `<span class="meta-tag mode-tag ${isOrch ? 'mode-orchestrator' : 'mode-manual'}">${isOrch ? '🧩 Orchestrator' : '🖊️ Manual'}</span>`;
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getImageExtension(url) {
    if (!url) return 'png';
    
    // Check for data URL with mime type
    if (url.startsWith('data:image/')) {
        const mimeMatch = url.match(/^data:image\/(\w+)/);
        if (mimeMatch) {
            const mime = mimeMatch[1].toLowerCase();
            // Map common mime types to extensions
            if (mime === 'jpeg') return 'jpg';
            if (mime === 'png') return 'png';
            if (mime === 'gif') return 'gif';
            if (mime === 'webp') return 'webp';
            if (mime === 'svg+xml') return 'svg';
            return mime;
        }
    }
    
    // Check URL extension
    if (url.startsWith('http')) {
        const urlPath = url.split('?')[0];
        const ext = urlPath.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return ext === 'jpeg' ? 'jpg' : ext;
        }
    }
    
    // Default to png
    return 'png';
}

function sanitizeImageUrl(url) {
    if (!url) return '';
    // Only allow data URIs and HTTPS URLs
    if (url.startsWith('data:image/')) {
        return url;
    }
    if (url.startsWith('https://')) {
        // Escape any potential attribute-breaking characters
        return url.replace(/"/g, '%22').replace(/'/g, '%27');
    }
    // Block everything else (http, javascript:, etc.)
    console.warn('Blocked unsafe image URL:', url);
    return '';
}

// ===== Global functions for inline handlers =====
window.removeReference = removeReference;

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', init);
