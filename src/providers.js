/**
 * Provider registry — OpenRouter and NanoGPT.
 * Holds base URLs, auth headers, storage key names, and routing constants.
 * No imports from other app modules to stay at the bottom of the dep tree.
 */

export const PROVIDERS = {
    openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        base: 'https://openrouter.ai/api/v1',
        keyPlaceholder: 'sk-or-...',
        keyLabel: 'OpenRouter API Key',
        keyNote: 'Your key is stored locally in this browser and never sent to any server other than OpenRouter.',
        defaultModel: 'google/gemini-2.5-flash-image',
        imageStrategy: 'chat-modalities',
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        headers(key) {
            return {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Imagen Internal Tool'
            };
        }
    },
    nanogpt: {
        id: 'nanogpt',
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
        headers(key) {
            return {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            };
        }
    }
};

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

export function getProvider(providerId) {
    return PROVIDERS[providerId] || PROVIDERS.openrouter;
}
