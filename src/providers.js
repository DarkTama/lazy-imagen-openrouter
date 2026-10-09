/**
 * Provider registry — OpenRouter, NanoGPT, and custom OpenAI-compatible endpoints.
 * Holds base URLs, auth headers, storage key names, and routing constants.
 * No imports from other app modules to stay at the bottom of the dep tree.
 */

export const CUSTOM_PROVIDERS_STORAGE_KEY = 'imagen_custom_providers';

export const BUILTIN_PROVIDERS = {
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        label: 'OpenRouter',
        base: 'https://openrouter.ai/api/v1',
        keyPlaceholder: 'sk-or-...',
        keyLabel: 'OpenRouter API Key',
        keyNote: 'Your key is stored locally in this browser and never sent to any server other than OpenRouter.',
        defaultModel: 'google/gemini-2.5-flash-image',
        imageStrategy: 'chat-modalities',
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        isBuiltIn: true,
        capabilities: {
            imageGen: true,
            chatVision: true
        },
        headers(key) {
            const h = {
                'Content-Type': 'application/json',
                'HTTP-Referer': typeof window !== 'undefined' ? window.location?.origin || '' : '',
                'X-Title': 'Imagen Internal Tool'
            };
            if (key) h['Authorization'] = `Bearer ${key}`;
            return h;
        }
    },
    nanogpt: {
        id: 'nanogpt',
        name: 'NanoGPT',
        label: 'NanoGPT',
        base: 'https://nano-gpt.com/api/v1',
        keyPlaceholder: 'nano-...',
        keyLabel: 'NanoGPT API Key',
        keyNote: 'Your key is stored locally in this browser and never sent to any server other than NanoGPT.',
        defaultModel: 'step-image-edit-2',
        imageStrategy: 'images-endpoint',
        imagesUrl: 'https://nano-gpt.com/v1/images/generations',
        modelsUrl: 'https://nano-gpt.com/api/v1/models',
        imageModelsUrl: 'https://nano-gpt.com/api/v1/image-models',
        subscriptionModelsUrl: 'https://nano-gpt.com/api/subscription/v1/models',
        isBuiltIn: true,
        capabilities: {
            imageGen: true,
            chatVision: true
        },
        headers(key) {
            const h = { 'Content-Type': 'application/json' };
            if (key) h['Authorization'] = `Bearer ${key}`;
            return h;
        }
    }
};

// Backward-compatibility alias
export const PROVIDERS = BUILTIN_PROVIDERS;

/**
 * The 5 image models included free in the NanoGPT subscription (user-confirmed).
 * supportsImageInput = accepts reference images (img2img capable).
 * Used as the fallback allowlist when the subscription endpoint doesn't list image models.
 */
export const SUBSCRIPTION_IMAGE_ALLOWLIST = [
    {
        id: 'step-image-edit-2',
        name: 'Step Image Edit 2',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 1,
        bestFor: 'Subscription — img2img & txt2img editing',
        speed: 'med',
        notes: 'Included in NanoGPT subscription. Best pick for Orchestrator mode.',
        subscription: true,
        provider: 'nanogpt'
    },
    {
        id: 'z-image-turbo',
        name: 'Z Image Turbo',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Subscription — fast txt2img',
        speed: 'fast',
        notes: 'Included in NanoGPT subscription. Text-to-image only.',
        subscription: true,
        provider: 'nanogpt'
    },
    {
        id: 'qwen-image',
        name: 'Qwen Image',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: true,
        maxReferences: 1,
        bestFor: 'Subscription — img2img & txt2img, strong on anime/art',
        speed: 'med',
        notes: 'Included in NanoGPT subscription. Also suitable for Orchestrator mode.',
        subscription: true,
        provider: 'nanogpt'
    },
    {
        id: 'hidream',
        name: 'Hidream',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Subscription — high-quality txt2img',
        speed: 'slow',
        notes: 'Included in NanoGPT subscription. Text-to-image only.',
        subscription: true,
        provider: 'nanogpt'
    },
    {
        id: 'chroma',
        name: 'Chroma',
        supportsImageSize: false,
        supportsAspectRatio: true,
        supportsImageInput: false,
        maxReferences: 0,
        bestFor: 'Subscription — stylized txt2img',
        speed: 'med',
        notes: 'Included in NanoGPT subscription. Text-to-image only.',
        subscription: true,
        provider: 'nanogpt'
    }
];

function normalizeBaseUrl(url) {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
}

export function loadCustomProviders() {
    try {
        const raw = localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(p => ({
            ...p,
            imageConfigStyle: p.imageConfigStyle || 'flat',
            supportsAspectRatio: p.supportsAspectRatio !== false,
            knownModels: Array.isArray(p.knownModels) ? p.knownModels : [],
            base: normalizeBaseUrl(p.base),
            label: p.name,
            isBuiltIn: false,
            headers(key) {
                const h = { 'Content-Type': 'application/json' };
                if (key) h['Authorization'] = `Bearer ${key}`;
                return h;
            }
        }));
    } catch {
        return [];
    }
}

export function getAllProviders() {
    const builtins = Object.values(BUILTIN_PROVIDERS);
    const custom = loadCustomProviders();
    return [...builtins, ...custom];
}

export function getProvider(providerId) {
    if (!providerId) return BUILTIN_PROVIDERS.openrouter;
    if (BUILTIN_PROVIDERS[providerId]) {
        return BUILTIN_PROVIDERS[providerId];
    }
    const custom = loadCustomProviders();
    return custom.find(p => p.id === providerId) || null;
}

export function isBuiltInProvider(id) {
    return Boolean(BUILTIN_PROVIDERS[id]);
}

export function getProvidersByCapability(capability) {
    const all = getAllProviders();
    return all.filter(p => p.capabilities && p.capabilities[capability] === true);
}

const NINEGUARD_TEMPLATE = {
    name: 'NineGuard',
    imageStrategy: 'chat-modalities',
    capabilities: { imageGen: true, chatVision: true },
    imageConfigStyle: 'none',
    supportsAspectRatio: false,
    defaultVisionModel: '9router/ag/gemini-3.8-flash-low',
    knownModels: [
        { id: '9router/ag/gemini-3.8-flash-low', name: 'Gemini 3.8 Flash Low', kind: 'vision' },
        { id: '9router/ag/gemini-3.7-flash-low', name: 'Gemini 3.7 Flash Low', kind: 'vision' },
        { id: '9router/ag/gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image (text-to-image, 1:1)', kind: 'image',
            supportsImageInput: false, notes: 'NineGuard currently drops input images; output fixed 1024×1024.' }
    ],
    notice: 'Browser builds need the Vite proxy (/nineguard) or a NineGuard with CORS + https. Desktop build connects directly.'
};

/** One-click presets for the Add Custom Provider form. Base is computed at access time. */
export const PROVIDER_TEMPLATES = {
    get nineguard() {
        return {
            ...NINEGUARD_TEMPLATE,
            // Absolute: #providerFormBase is <input type="url">, relative paths fail validation.
            base: import.meta.env?.DEV ? `${location.origin}/nineguard/v1` : '',
            capabilities: { ...NINEGUARD_TEMPLATE.capabilities },
            knownModels: NINEGUARD_TEMPLATE.knownModels.map(m => ({ ...m }))
        };
    }
};

export function getProviderTemplate(key) {
    return PROVIDER_TEMPLATES[key] || null;
}

export function saveCustomProvider(config) {
    const customList = loadCustomProviders();
    const id = config.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const base = normalizeBaseUrl(config.base);
    const name = (config.name || 'Custom OpenAI').trim();

    const providerObj = {
        id,
        name,
        label: name,
        base,
        keyPlaceholder: config.keyPlaceholder || 'sk-...',
        keyLabel: `${name} API Key`,
        keyNote: 'Your key is stored locally in this browser.',
        defaultModel: config.defaultModel || '',
        ...(config.defaultVisionModel ? { defaultVisionModel: String(config.defaultVisionModel) } : {}),
        imageStrategy: config.imageStrategy || 'images-endpoint',
        imagesUrl: config.imagesUrl || `${base}/images/generations`,
        modelsUrl: config.modelsUrl || `${base}/models`,
        isBuiltIn: false,
        imageConfigStyle: ['gemini', 'flat', 'none'].includes(config.imageConfigStyle) ? config.imageConfigStyle : 'flat',
        supportsAspectRatio: config.supportsAspectRatio !== false,
        knownModels: Array.isArray(config.knownModels) ? config.knownModels : [],
        capabilities: {
            imageGen: config.capabilities?.imageGen ?? false,
            chatVision: config.capabilities?.chatVision ?? true
        }
    };

    const existingIdx = customList.findIndex(p => p.id === id);
    if (existingIdx >= 0) {
        customList[existingIdx] = providerObj;
    } else {
        customList.push(providerObj);
    }

    // Persist serializable object (omit functions)
    const toStore = customList.map(({ headers, ...rest }) => rest);
    localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(toStore));

    return {
        ...providerObj,
        headers(key) {
            const h = { 'Content-Type': 'application/json' };
            if (key) h['Authorization'] = `Bearer ${key}`;
            return h;
        }
    };
}

export function deleteCustomProvider(id) {
    if (BUILTIN_PROVIDERS[id]) return false;
    const customList = loadCustomProviders();
    const filtered = customList.filter(p => p.id !== id);
    if (filtered.length === customList.length) return false;

    const toStore = filtered.map(({ headers, ...rest }) => rest);
    localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(toStore));
    return true;
}

/** Pure: form field values for a clicked template. Key is always empty. */
export function templateFormValues(templateId) {
    const t = getProviderTemplate(templateId);
    if (!t) return null;
    return {
        name: t.name,
        base: t.base,
        imageStrategy: t.imageStrategy,
        capImage: !!t.capabilities?.imageGen,
        capChat: !!t.capabilities?.chatVision,
        key: '',
        notice: t.notice || ''
    };
}

/** Pure: config for saveCustomProvider. Form fields win; extras from template (create) or existing provider (edit). */
export function mergeTemplateIntoSave(formValues, pendingTemplate, existingProvider) {
    const src = pendingTemplate || existingProvider || null;
    const extras = src ? {
        imageConfigStyle: src.imageConfigStyle,
        supportsAspectRatio: src.supportsAspectRatio,
        knownModels: src.knownModels,
        defaultVisionModel: src.defaultVisionModel,
        defaultModel: src.defaultModel
    } : {};
    return {
        ...extras,
        id: formValues.id,
        name: formValues.name,
        base: formValues.base,
        capabilities: { imageGen: !!formValues.capImage, chatVision: !!formValues.capChat },
        imageStrategy: formValues.imageStrategy
    };
}
