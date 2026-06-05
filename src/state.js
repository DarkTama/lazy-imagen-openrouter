/**
 * All constants and application state.
 */

import ImagenDB from './db.js';
import { showToast } from './utils.js';

// ===== Orchestrator Defaults =====
export const ORCHESTRATOR_DEFAULTS = {
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
    subjectContextOpen: false,   // <details> Subject Context drawer state
    autoCompress: true           // auto-resize large Source/Reference uploads
};

// Human-readable labels for each transfer attribute (used in the toggle grid).
export const ATTRIBUTE_LABELS = {
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

// Prompt-friendly phrasing for each attribute (used in the assembled prompt text).
export const ATTRIBUTE_PHRASING = {
    clothing:    'clothing / outfit',
    pose:        'pose and body position',
    background:  'background / setting',
    expression:  'facial expression',
    hair:        'hairstyle and hair color',
    lighting:    'lighting',
    palette:     'color palette',
    accessories: 'accessories',
    camera:      'camera framing and shot type'
};

// ===== Transformation attribute keys =====
export const ATTRIBUTE_KEYS = [
    'clothing', 'pose', 'background', 'expression',
    'hair', 'lighting', 'palette', 'accessories', 'camera'
];

// ===== Model Configurations =====
export const MODEL_CONFIGS = {
    'google/gemini-2.5-flash-image': {
        name: 'Gemini 2.5 Flash Image',
        supportsImageSize: true,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 3,
        bestFor: 'Recommended default \u2014 fast generation and edits',
        speed: 'fast',
        notes: 'Strong all-rounder. Supports image-to-image with up to 3 references.'
    },
    'google/gemini-3.1-flash-image-preview': {
        name: 'Gemini 3.1 Flash Image (Preview)',
        supportsImageSize: true,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 3,
        bestFor: 'Newer Flash generation \u2014 improved detail and consistency',
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
        notes: 'Supports up to 14 reference images \u2014 ideal for character sheets, mood boards.'
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
        notes: 'Smaller variant of GPT-5 Image \u2014 lower cost, slightly reduced quality.'
    },
    'openai/gpt-5.4-image-2': {
        name: 'GPT-5.4 Image 2',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 1,
        bestFor: 'Newer OpenAI image model \u2014 try if Gemini refuses',
        speed: 'med',
        notes: "OpenAI's latest image model. Different content policy thresholds than Gemini."
    },
    'openrouter/auto': {
        name: 'Auto (OpenRouter chooses)',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 3,
        bestFor: "Lets OpenRouter pick \u2014 useful if you don't care which provider",
        speed: 'med',
        notes: 'Auto-routes across available image-gen models. Behavior depends on routing.'
    }
};

// ===== Vision-capable models for the analyst step =====
export const VISION_MODELS = [
    { id: 'google/gemini-2.5-flash',                  name: 'Gemini 2.5 Flash',
      bestFor: 'Recommended \u2014 fast, cheap, accurate JSON', speed: 'fast', context: '1M tokens' },
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

    // === Newer flagship picks (2026 vintage) ===
    { id: 'anthropic/claude-sonnet-4.5',              name: 'Claude Sonnet 4.5',
      bestFor: 'Newer mid-tier Claude — strong reasoning',  speed: 'med',  context: '200K tokens' },
    { id: 'anthropic/claude-haiku-4.5',               name: 'Claude Haiku 4.5',
      bestFor: 'Fast Claude tier — cheaper',                speed: 'fast', context: '200K tokens' },
    { id: 'google/gemini-3-flash-preview',            name: 'Gemini 3 Flash (Preview)',
      bestFor: 'Newest Gemini Flash — improved fidelity',   speed: 'fast', context: '1M tokens' },
    { id: 'qwen/qwen3-vl-235b-a22b-instruct',         name: 'Qwen3-VL 235B',
      bestFor: 'Newer/larger Qwen VL — strong on anime/art', speed: 'med', context: '128K tokens' },
    { id: 'mistralai/mistral-small-3.2-24b-instruct', name: 'Mistral Small 3.2 24B',
      bestFor: 'Cheap Mistral vision — good fallback',      speed: 'fast', context: '128K tokens' },
    { id: 'meta-llama/llama-4-maverick',              name: 'Llama 4 Maverick',
      bestFor: 'Newest open-weight Llama vision',           speed: 'med',  context: '256K tokens' },

    // === Free tier ===
    { id: 'google/gemma-4-31b-it:free',               name: 'Gemma 4 31B (free)',
      bestFor: 'Free \u2014 large open Gemma vision model',     speed: 'med',  context: '262K tokens' },
    { id: 'google/gemma-4-26b-a4b-it:free',           name: 'Gemma 4 26B (free)',
      bestFor: 'Free \u2014 smaller Gemma vision, faster',      speed: 'fast', context: '262K tokens' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl:free',      name: 'Nemotron Nano 12B VL (free)',
      bestFor: 'Free \u2014 smallest, fastest free option',     speed: 'fast', context: '128K tokens' },
    { id: 'openrouter/free',                           name: 'OpenRouter Free (auto-routed)',
      bestFor: 'Free \u2014 auto-picks an available free model', speed: 'med',  context: '200K tokens' },
    { id: 'moonshotai/kimi-k2.6:free',                 name: 'Kimi K2.6 (free)',
      bestFor: 'Free MoonshotAI option',                    speed: 'med',  context: '128K tokens' },
];

// Lookup helper for vision models by id.
export const VISION_MODELS_BY_ID = VISION_MODELS.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

// ===== Web-research models =====
export const RESEARCH_MODELS = [
    { id: 'perplexity/sonar',           name: 'Perplexity Sonar',           bestFor: 'Fast web research, cheap' },
    { id: 'perplexity/sonar-pro',       name: 'Perplexity Sonar Pro',       bestFor: 'Deeper research, more sources' },
    { id: 'perplexity/sonar-reasoning', name: 'Perplexity Sonar Reasoning', bestFor: 'Complex/obscure subjects' },
];

// ===== Prompt Length Warning =====
export const MODEL_PROMPT_CHAR_LIMITS = {
    'google/gemini-2.5-flash-image': 30000,
    'google/gemini-3.1-flash-image-preview': 30000,
    'google/gemini-3-pro-image-preview': 30000,
    'openai/gpt-5-image': 16000,
    'openai/gpt-5-image-mini': 16000,
    'openai/gpt-5.4-image-2': 16000,
    'openrouter/auto': 16000
};
export const DEFAULT_PROMPT_CHAR_LIMIT = 16000;
export const PROMPT_WARN_THRESHOLD = 0.85;

// ===== Concurrency & Thresholds =====
export const MAX_CONCURRENT_GENERATIONS = 3;
export const LARGE_IMAGE_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MB

// ===== Pricing Cache =====
export const MODEL_PRICING_CACHE_KEY = 'imagen_model_pricing';
export const MODEL_PRICING_TTL_MS = 24 * 60 * 60 * 1000;

// ===== Load orchestrator state from localStorage =====
export function loadOrchestratorState() {
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

// ===== Application State =====
export const state = {
    apiKey: localStorage.getItem('imagen_api_key') || sessionStorage.getItem('imagen_api_key') || '',
    rememberKey: localStorage.getItem('imagen_remember_key') === 'true',
    selectedModel: localStorage.getItem('imagen_model') || 'google/gemini-2.5-flash-image',
    imageSize: localStorage.getItem('imagen_size') || '1024x1024',
    imageQuality: localStorage.getItem('imagen_quality') || '1K',
    aspectRatio: localStorage.getItem('imagen_aspect_ratio') || '1:1',
    imageCount: parseInt(localStorage.getItem('imagen_count')) || 1,
    autoRetryEnabled: localStorage.getItem('imagen_auto_retry') !== 'false',
    references: [],
    referenceLabels: null,
    images: [],
    currentImage: null,
    pendingBatches: [],
    modelPricing: {},
    galleryPageSize: 20,
    galleryDisplayedCount: 20,
    orchestrator: loadOrchestratorState()
};

// ===== Persist orchestrator state =====
export function saveOrchestratorState() {
    try {
        const o = state.orchestrator;
        if (o.sourceImage) {
            ImagenDB.saveOrchestratorBlob('sourceImage', o.sourceImage).catch(e =>
                console.warn('Failed to save source image to IndexedDB:', e)
            );
        } else {
            ImagenDB.deleteOrchestratorBlob('sourceImage').catch(() => {});
        }
        if (o.referenceImage) {
            ImagenDB.saveOrchestratorBlob('referenceImage', o.referenceImage).catch(e =>
                console.warn('Failed to save reference image to IndexedDB:', e)
            );
        } else {
            ImagenDB.deleteOrchestratorBlob('referenceImage').catch(() => {});
        }

        const toSave = { ...o };
        delete toSave.sourceImage;
        delete toSave.referenceImage;
        localStorage.setItem('imagen_orchestrator', JSON.stringify(toSave));
    } catch (e) {
        console.warn('Failed to persist orchestrator state:', e);
        showToast('Could not save orchestrator state.', 'warning');
    }
}
