/**
 * API calls for image generation, vision analysis, subject research, and model fetching.
 * All calls (generation, vision, research) use the active provider's endpoint and key.
 */

import { state, MODEL_CONFIGS, MODEL_PRICING_CACHE_KEY, MODEL_PRICING_TTL_MS, MODEL_LIST_CACHE_KEY_PREFIX, MODEL_LIST_TTL_MS, MAX_CONCURRENT_GENERATIONS, VISION_MODELS, loadApiKeyForProvider } from './state.js';
import { SUBSCRIPTION_IMAGE_ALLOWLIST, getProvider } from './providers.js';
import { looksLikeRefusal } from './utils.js';
import { retryWithBackoff } from './retry.js';

// Returns provider base URL and auth headers for a given or active provider.
export function providerFetchArgs(providerId = null) {
    const pId = providerId || state.generationProvider || state.provider || 'openrouter';
    const prov = getProvider(pId);
    if (!prov) {
        throw new Error(`Unknown provider: ${pId}`);
    }
    const key = (providerId && providerId !== state.generationProvider)
        ? loadApiKeyForProvider(pId)
        : (state.apiKey || loadApiKeyForProvider(pId));
    return {
        providerId: pId,
        provider: prov,
        base: prov.base,
        headers: prov.headers ? prov.headers(key) : { 'Content-Type': 'application/json' }
    };
}

// ===== Structured API Error =====
export class ApiError extends Error {
    constructor({ status, message, body, kind, stage, modelId, providerId, role }) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body || '';
        this.kind = kind;
        this.stage = stage;
        this.modelId = modelId;
        this.providerId = providerId;
        this.role = role || stage;
    }
}

// ===== Vision system prompt =====
export const VISION_SYSTEM_PROMPT = `You analyze two images for a prompt-composition pipeline. Image 1 is the SOURCE (character to preserve). Image 2 is the REFERENCE (style/pose/clothes donor).

Return ONLY a JSON object with these keys. Each value is a string that is SPECIFIC and CONCRETE \u2014 name actual colors, materials, garment types, hair details, and visual specifics rather than vague summaries. 1-2 sentences each. (Good: "oversized cream cable-knit sweater, pleated navy skirt, black thigh-high socks". Bad: "casual outfit".) No markdown, no code fences:
  source_char        \u2014 physical features of the character in Image 1
  source_clothing    \u2014 what they're wearing in Image 1
  source_pose        \u2014 pose / body language in Image 1
  source_background  \u2014 background / setting of Image 1
  source_style       \u2014 art style of Image 1
  source_expression  \u2014 facial expression in Image 1
  source_hair        \u2014 hair style + color in Image 1
  source_lighting    \u2014 lighting in Image 1
  source_palette     \u2014 color palette of Image 1
  source_accessories \u2014 accessories visible in Image 1
  source_camera      \u2014 camera framing / angle / shot type of Image 1
  ref_clothing       \u2014 what's worn in Image 2
  ref_pose           \u2014 pose in Image 2
  ref_background     \u2014 background / setting of Image 2
  ref_style          \u2014 art style of Image 2
  ref_expression     \u2014 facial expression in Image 2
  ref_hair           \u2014 hair in Image 2
  ref_lighting       \u2014 lighting in Image 2
  ref_palette        \u2014 color palette of Image 2
  ref_accessories    \u2014 accessories in Image 2
  ref_camera         \u2014 camera framing of Image 2

Output strictly valid JSON. No prose around it. No code fences.`;

export async function runVisionAnalysis(sourceB64, referenceB64, modelId, providerId = null) {
    const targetProviderId = providerId || state.orchestrator?.visionProvider || 'openrouter';
    let response;
    try {
        const { base, headers } = providerFetchArgs(targetProviderId);
        response = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers,
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
    } catch (netErr) {
        throw new ApiError({
            kind: 'network', stage: 'vision', role: 'vision', modelId, providerId: targetProviderId,
            message: netErr.message || 'Network request failed',
            body: String(netErr)
        });
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsedMsg;
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) { /* not JSON */ }
        throw new ApiError({
            kind: 'http', stage: 'vision', role: 'vision', modelId, providerId: targetProviderId,
            status: response.status,
            message: parsedMsg || `HTTP ${response.status}`,
            body: bodyText
        });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new ApiError({
            kind: 'refusal', stage: 'vision', role: 'vision', modelId, providerId: targetProviderId,
            message: 'Vision model returned no text content',
            body: JSON.stringify(data, null, 2)
        });
    }

    if (looksLikeRefusal(raw)) {
        throw new ApiError({
            kind: 'refusal', stage: 'vision', role: 'vision', modelId, providerId: targetProviderId,
            message: 'Vision model refused to describe the image',
            body: raw
        });
    }

    try {
        return JSON.parse(raw);
    } catch (_) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new ApiError({
                kind: 'parse', stage: 'vision', role: 'vision', modelId, providerId: targetProviderId,
                message: 'Vision response was not valid JSON',
                body: raw
            });
        }
        try {
            return JSON.parse(match[0]);
        } catch (e) {
            throw new ApiError({
                kind: 'parse', stage: 'vision', role: 'vision', modelId, providerId: targetProviderId,
                message: 'Vision JSON block failed to parse',
                body: raw
            });
        }
    }
}

export async function researchSubject(subjectText, modelId, providerId = null) {
    const targetProviderId = providerId || state.orchestrator?.researchProvider || 'openrouter';
    let response;
    try {
        const { base, headers } = providerFetchArgs(targetProviderId);
        response = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: modelId,
                messages: [
                    {
                        role: 'system',
                        content: `You are a research assistant for an image-generation prompt. The user wants to generate an image of the following subject. Briefly research and describe the subject's distinctive visual features in 3-6 sentences. Focus on: physical appearance, signature clothing/accessories, color scheme, and any visual motifs. Keep it factual and concise. No citations, no markdown headings \u2014 just plain prose.`
                    },
                    { role: 'user', content: `Subject: ${subjectText}` }
                ]
            })
        });
    } catch (netErr) {
        throw new ApiError({
            kind: 'network', stage: 'research', modelId,
            message: netErr.message || 'Network request failed',
            body: String(netErr)
        });
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsedMsg;
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) { /* not JSON */ }
        throw new ApiError({
            kind: 'http', stage: 'research', modelId,
            status: response.status,
            message: parsedMsg || `HTTP ${response.status}`,
            body: bodyText
        });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
        throw new ApiError({
            kind: 'refusal', stage: 'research', modelId,
            message: 'Research model returned no content',
            body: JSON.stringify(data, null, 2)
        });
    }
    return text.trim();
}

/**
 * Pull an image (data URI or URL) out of a chat-completions message,
 * covering the response shapes the various image providers use.
 * Returns null when the message contains no image.
 */
export function extractImageFromMessage(message) {
    if (!message) return null;

    if (message.images && message.images.length > 0) {
        const img = message.images[0];
        if (img.image_url?.url) {
            return img.image_url.url;
        }
        if (typeof img === 'string') {
            if (img.startsWith('data:') || img.startsWith('http')) {
                return img;
            }
            return `data:image/png;base64,${img}`;
        }
        if (img.url) return img.url;
        if (img.b64_json) return `data:image/png;base64,${img.b64_json}`;
    }

    if (Array.isArray(message.content)) {
        for (const part of message.content) {
            if (part.type === 'image_url' && part.image_url?.url) {
                return part.image_url.url;
            }
            if (part.inlineData?.data) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                return `data:${mimeType};base64,${part.inlineData.data}`;
            }
            if (part.type === 'image' && part.image) {
                if (part.image.startsWith('data:')) {
                    return part.image;
                }
                return `data:image/png;base64,${part.image}`;
            }
        }
    }

    if (typeof message.content === 'string' && message.content.startsWith('data:image')) {
        return message.content;
    }

    return null;
}

/**
 * One-shot image edit: send an image plus an instruction, get an image back.
 * Used by the Image Tools AI assist. Deliberately NOT wrapped in the retry
 * helper — every attempt charges the user's OpenRouter account.
 */
export async function runImageEdit(imageDataUri, instruction, modelId, { signal } = {}) {
    let response;
    try {
        const { base, headers } = providerFetchArgs();
        response = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            signal,
            headers,
            body: JSON.stringify({
                model: modelId,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: imageDataUri, detail: 'high' } },
                            { type: 'text', text: instruction }
                        ]
                    }
                ],
                modalities: ['image', 'text']
            })
        });
    } catch (netErr) {
        if (netErr.name === 'AbortError') throw netErr;
        throw new ApiError({
            kind: 'network', stage: 'image-edit', modelId,
            message: netErr.message || 'Network request failed',
            body: String(netErr)
        });
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsedMsg;
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) { /* not JSON */ }
        throw new ApiError({
            kind: 'http', stage: 'image-edit', modelId,
            status: response.status,
            message: parsedMsg || `HTTP ${response.status}`,
            body: bodyText
        });
    }

    const data = await response.json();
    const imageUrl = extractImageFromMessage(data.choices?.[0]?.message);
    if (!imageUrl) {
        throw new ApiError({
            kind: 'no-image', stage: 'image-edit', modelId,
            message: 'The model returned no image',
            body: JSON.stringify(data, null, 2)
        });
    }
    return imageUrl;
}

function nanoSizeFor(st) {
    const RATIO_MAP = {
        '1:1':  '1024x1024',
        '16:9': '1344x768',
        '9:16': '768x1344',
        '4:3':  '1152x896',
        '3:4':  '896x1152',
        '3:2':  '1216x832',
        '2:3':  '832x1216',
    };
    const base = RATIO_MAP[st.aspectRatio] || '1024x1024';
    if (st.imageQuality === '2K') {
        const [w, h] = base.split('x').map(Number);
        return `${Math.round(w * 1.5)}x${Math.round(h * 1.5)}`;
    }
    if (st.imageQuality === '4K') {
        const [w, h] = base.split('x').map(Number);
        return `${Math.round(w * 2)}x${Math.round(h * 2)}`;
    }
    return base;
}

export async function testProviderConnection(providerId) {
    try {
        const prov = getProvider(providerId);
        if (!prov) return { ok: false, error: 'Provider not found' };
        const key = loadApiKeyForProvider(providerId);
        const headers = prov.headers ? prov.headers(key) : { 'Content-Type': 'application/json' };
        const testUrl = prov.modelsUrl || `${prov.base}/models`;
        const resp = await fetch(testUrl, { method: 'GET', headers });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            return { ok: false, error: `HTTP ${resp.status}: ${txt.slice(0, 150)}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || 'Connection failed' };
    }
}

export async function fetchProviderModels(providerId, { force = false } = {}) {
    const prov = getProvider(providerId);
    if (!prov) return [];
    if (providerId === 'openrouter') {
        return fetchImageModels('openrouter');
    }
    if (providerId === 'nanogpt') {
        return fetchImageModels('nanogpt');
    }

    if (force) sessionStorage.removeItem(modelListCacheKey(providerId, 'all'));
    const cached = readModelListCache(providerId, 'all');
    if (cached) return cached;

    try {
        const key = loadApiKeyForProvider(providerId);
        const headers = prov.headers ? prov.headers(key) : { 'Content-Type': 'application/json' };
        const url = prov.modelsUrl || `${prov.base}/models`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        const models = list.map(m => {
            const id = typeof m === 'string' ? m : m.id;
            const name = typeof m === 'object' && m.name ? m.name : id;
            return {
                id,
                name,
                provider: providerId,
                supportsImageInput: true,
                maxReferences: 1
            };
        }).filter(m => m.id);

        writeModelListCache(providerId, 'all', models);
        return models;
    } catch (e) {
        console.warn(`Failed to fetch models for ${providerId}:`, e);
        return [];
    }
}

export async function generateSingleImage(prompt, modelConfig = {}, { onRetry } = {}) {
    const providerId = state.generationProvider || state.provider || 'openrouter';
    const prov = getProvider(providerId);
    const strategy = prov.imageStrategy || 'images-endpoint';

    const doGenerate = async () => {
    const content = [];

    if (modelConfig.supportsImageInput) {
        state.references.forEach((ref, index) => {
            if (!ref) return;
            const label = state.referenceLabels && state.referenceLabels[index];
            if (label) {
                content.push({ type: 'text', text: label });
            }
            content.push({
                type: 'image_url',
                image_url: {
                    url: ref,
                    detail: 'high'
                }
            });
        });
    }

    content.push({
        type: 'text',
        text: prompt
    });

    const requestBody = {
        model: state.selectedModel,
        messages: [
            {
                role: 'user',
                content: content.length === 1 ? prompt : content
            }
        ],
        modalities: modelConfig.modalities || ['image', 'text']
    };

    if (modelConfig.supportsImageSize && state.selectedModel.includes('gemini')) {
        requestBody.image_config = {
            image_size: state.imageQuality.toLowerCase(),
            aspect_ratio: state.aspectRatio
        };
    }

    if (modelConfig.supportsAspectRatio && !state.selectedModel.includes('gemini')) {
        requestBody.aspect_ratio = state.aspectRatio;
    }

    const modelId = state.selectedModel;
    let response;
    try {
        const { base, headers } = providerFetchArgs(providerId);
        response = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });
    } catch (netErr) {
        throw new ApiError({
            kind: 'network', stage: 'generation', role: 'generation', modelId, providerId,
            message: netErr.message || 'Network request failed',
            body: String(netErr)
        });
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsedMsg;
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) { /* not JSON */ }
        throw new ApiError({
            kind: 'http', stage: 'generation', role: 'generation', modelId, providerId,
            status: response.status,
            message: parsedMsg || `HTTP ${response.status}`,
            body: bodyText
        });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
        throw new ApiError({
            kind: 'no-image', stage: 'generation', role: 'generation', modelId, providerId,
            message: 'No message in API response',
            body: JSON.stringify(data, null, 2)
        });
    }

    console.log('API Response:', JSON.stringify(data, null, 2));

    const imageUrl = extractImageFromMessage(message);
    if (imageUrl) return imageUrl;

    throw new ApiError({
        kind: 'no-image', stage: 'generation', role: 'generation', modelId, providerId,
        message: 'No image in response',
        body: JSON.stringify(data, null, 2)
    });
    };

    const doGenerateImagesEndpoint = async () => {
        const { headers } = providerFetchArgs(providerId);
        const modelId = state.selectedModel;
        const endpointUrl = prov.imagesUrl || `${prov.base}/images/generations`;
        const body = {
            model: modelId,
            prompt,
            n: 1,
            size: (typeof nanoSizeFor === 'function' && providerId === 'nanogpt') ? nanoSizeFor(state) : state.imageSize,
            response_format: 'b64_json'
        };
        if (modelConfig.supportsImageInput && state.references.length) {
            let refs = state.references.filter(Boolean);
            if (modelConfig.maxReferences === 1) refs = refs.slice(0, 1);
            if (refs.length) body.imageDataUrls = refs;
        }
        let response;
        try {
            response = await fetch(endpointUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        } catch (netErr) {
            throw new ApiError({
                kind: 'network', stage: 'generation', role: 'generation', modelId, providerId,
                message: netErr.message || 'Network request failed',
                body: String(netErr)
            });
        }
        if (!response.ok) {
            const bodyText = await response.text().catch(() => '');
            let parsedMsg;
            try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) { /* not JSON */ }
            throw new ApiError({
                kind: 'http', stage: 'generation', role: 'generation', modelId, providerId,
                status: response.status,
                message: parsedMsg || `HTTP ${response.status}`,
                body: bodyText
            });
        }
        const data = await response.json();
        const first = data?.data?.[0];
        if (first?.b64_json) {
            return `data:image/png;base64,${first.b64_json}`;
        }
        if (first?.url) {
            return first.url;
        }
        throw new ApiError({
            kind: 'no-image', stage: 'generation', role: 'generation', modelId, providerId,
            message: `No image returned from ${prov.name || providerId}`,
            body: JSON.stringify(data, null, 2)
        });
    };

    const fn = strategy === 'images-endpoint' ? doGenerateImagesEndpoint : doGenerate;

    if (state.autoRetryEnabled) {
        return retryWithBackoff(fn, { onRetry });
    }
    return fn();
}

export async function fetchModelPricing() {
    if (state.provider !== 'openrouter') return {};
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

// ===== Live Model Fetchers =====

function modelListCacheKey(providerId, kind) {
    return `${MODEL_LIST_CACHE_KEY_PREFIX}${providerId}_${kind}`;
}

function readModelListCache(providerId, kind) {
    try {
        const raw = sessionStorage.getItem(modelListCacheKey(providerId, kind));
        if (!raw) return null;
        const { models, ts } = JSON.parse(raw);
        if (Date.now() - ts < MODEL_LIST_TTL_MS) return models;
    } catch (e) { /* ignore */ }
    return null;
}

function writeModelListCache(providerId, kind, models) {
    try {
        sessionStorage.setItem(modelListCacheKey(providerId, kind), JSON.stringify({ models, ts: Date.now() }));
    } catch (e) { console.warn('Model list cache write failed:', e); }
}

async function fetchNanoSubscriptionIds() {
    try {
        const prov = getProvider('nanogpt');
        const resp = await fetch(prov.subscriptionModelsUrl, { headers: prov.headers(state.apiKey) });
        if (!resp.ok) return new Set();
        const data = await resp.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
        return new Set(list.map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean));
    } catch (e) {
        return new Set();
    }
}

function isSubscriptionId(id, subscriptionSet) {
    return subscriptionSet.has(id) || SUBSCRIPTION_IMAGE_ALLOWLIST.some(a => a.id === id);
}

function normalizeOpenRouterModel(m) {
    const p = m.pricing || {};
    return {
        id: m.id,
        name: m.name || m.id,
        kind: 'image',
        provider: 'openrouter',
        price: {
            prompt: parseFloat(p.prompt) || 0,
            completion: parseFloat(p.completion) || 0,
            perImage: parseFloat(p.image) || 0,
            request: parseFloat(p.request) || 0
        },
        supportsImageInput: Boolean(m.architecture?.modality?.startsWith('text+image')),
        maxReferences: 0,
        subscription: false
    };
}

function normalizeNanoImageModel(m, subscriptionSet) {
    const curated = SUBSCRIPTION_IMAGE_ALLOWLIST.find(a => a.id === m.id);
    const sub = isSubscriptionId(m.id, subscriptionSet);
    const p = m.pricing || {};
    const sp = m.supported_parameters || {};
    return {
        id: m.id,
        name: m.name || m.id,
        kind: 'image',
        provider: 'nanogpt',
        price: sub ? null : { perImage: parseFloat(p.image || p.cost || p.price_per_image) || null },
        supportsImageInput: curated
            ? curated.supportsImageInput
            : Boolean(m.supportsImageInput || m.supports_image_input || sp.image_input),
        maxReferences: curated
            ? curated.maxReferences
            : (parseInt(sp.max_images) || 0),
        subscription: sub
    };
}

/**
 * Fetch chat/vision models for the active provider.
 * OpenRouter: returns the hardcoded VISION_MODELS (no network call needed).
 * NanoGPT: fetches from /api/v1/models, filters out image-only models.
 * Pass force:true to bypass the 24h sessionStorage cache.
 */
export async function fetchChatModels(providerId, { force = false } = {}) {
    if (providerId === 'openrouter') {
        return VISION_MODELS;
    }

    if (force) sessionStorage.removeItem(modelListCacheKey(providerId, 'chat'));

    const cached = readModelListCache(providerId, 'chat');
    if (cached) return cached;

    const prov = getProvider(providerId);
    if (!prov) return [];

    try {
        const key = loadApiKeyForProvider(providerId);
        const headers = prov.headers ? prov.headers(key) : { 'Content-Type': 'application/json' };
        const url = prov.modelsUrl || `${prov.base}/models`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        const imageIds = providerId === 'nanogpt' ? new Set(SUBSCRIPTION_IMAGE_ALLOWLIST.map(m => m.id)) : new Set();
        const models = list
            .filter(m => {
                const id = typeof m === 'string' ? m : m?.id;
                return id && !imageIds.has(id);
            })
            .map(m => {
                const id = typeof m === 'string' ? m : m.id;
                const name = typeof m === 'object' && m.name ? m.name : id;
                return {
                    id,
                    name,
                    kind: 'vision',
                    provider: providerId,
                    bestFor: 'Chat & vision',
                    speed: 'fast',
                    price: null
                };
            });
        if (models.length > 0) writeModelListCache(providerId, 'chat', models);
        return models;
    } catch (e) {
        console.warn(`fetchChatModels failed for ${providerId}:`, e);
        return [];
    }
}

/**
 * Fetch live image-generation models for the given provider.
 * Returns a normalized array usable by the picker.
 * Falls back to the curated list on any fetch failure.
 */
export async function fetchImageModels(providerId) {
    const cached = readModelListCache(providerId, 'image');
    if (cached) return cached;

    const prov = getProvider(providerId);
    if (!prov) return [];
    let models;

    try {
        if (providerId === 'nanogpt') {
            const [subscriptionSet, rawResp] = await Promise.all([
                fetchNanoSubscriptionIds(),
                fetch(`${prov.imageModelsUrl}?detailed=true`, { headers: prov.headers(state.apiKey) })
            ]);
            if (!rawResp.ok) throw new Error(`image-models ${rawResp.status}`);
            const data = await rawResp.json();
            const list = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
            models = list.filter(m => m?.id).map(m => normalizeNanoImageModel(m, subscriptionSet));

            // Guarantee all allowlist models appear even if absent from the live list
            const liveIds = new Set(models.map(m => m.id));
            for (const a of SUBSCRIPTION_IMAGE_ALLOWLIST) {
                if (!liveIds.has(a.id)) {
                    models.push({
                        id: a.id, name: a.name, kind: 'image', provider: 'nanogpt',
                        price: null, supportsImageInput: a.supportsImageInput,
                        maxReferences: a.maxReferences, subscription: true
                    });
                }
            }
        } else if (providerId === 'openrouter') {
            const resp = await fetch(prov.modelsUrl);
            if (!resp.ok) throw new Error(`models ${resp.status}`);
            const data = await resp.json();
            const list = Array.isArray(data.data) ? data.data : [];
            models = list
                .filter(m => m?.id && m.architecture?.modality?.includes('->image'))
                .map(normalizeOpenRouterModel);
        } else {
            // Custom provider with /models
            return fetchProviderModels(providerId);
        }

        // Merge live-only models into MODEL_CONFIGS so existing lookups (cost, readiness, info card) work
        for (const m of models) {
            if (!MODEL_CONFIGS[m.id]) {
                MODEL_CONFIGS[m.id] = {
                    name: m.name, provider: m.provider, subscription: m.subscription,
                    supportsImageInput: m.supportsImageInput, maxReferences: m.maxReferences,
                    supportsImageSize: false, supportsAspectRatio: true
                };
            }
        }

        writeModelListCache(providerId, 'image', models);
        return models;
    } catch (e) {
        console.warn(`Failed to fetch image models for ${providerId}:`, e);
        if (providerId === 'nanogpt') {
            return SUBSCRIPTION_IMAGE_ALLOWLIST.map(a => ({
                id: a.id, name: a.name, kind: 'image', provider: 'nanogpt',
                price: null, supportsImageInput: a.supportsImageInput,
                maxReferences: a.maxReferences, subscription: true
            }));
        }
        if (providerId === 'openrouter') {
            return Object.entries(MODEL_CONFIGS)
                .filter(([, cfg]) => !cfg.provider || cfg.provider === 'openrouter')
                .map(([id, cfg]) => ({
                    id, name: cfg.name || id, kind: 'image', provider: 'openrouter',
                    price: cfg.approxImageCost ? { perImage: cfg.approxImageCost } : null,
                    supportsImageInput: cfg.supportsImageInput || false,
                    maxReferences: cfg.maxReferences || 0, subscription: false
                }));
        }
        return [];
    }
}

export function runWithConcurrency(tasks, limit = MAX_CONCURRENT_GENERATIONS) {
    const results = [];
    let index = 0;
    let active = 0;

    return new Promise(resolve => {
        function next() {
            if (index >= tasks.length && active === 0) {
                resolve(results);
                return;
            }
            while (active < limit && index < tasks.length) {
                const i = index++;
                active++;
                tasks[i]().then(val => {
                    results[i] = { status: 'fulfilled', value: val };
                }).catch(err => {
                    results[i] = { status: 'rejected', reason: err };
                }).finally(() => {
                    active--;
                    next();
                });
            }
        }
        next();
    });
}
