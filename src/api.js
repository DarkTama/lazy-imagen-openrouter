/**
 * All fetch calls to OpenRouter.
 */

import { state, MODEL_PRICING_CACHE_KEY, MODEL_PRICING_TTL_MS, MAX_CONCURRENT_GENERATIONS } from './state.js';
import { looksLikeRefusal } from './utils.js';
import { retryWithBackoff } from './retry.js';

// ===== Structured API Error =====
export class ApiError extends Error {
    constructor({ status, message, body, kind, stage, modelId }) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body || '';
        this.kind = kind;
        this.stage = stage;
        this.modelId = modelId;
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

export async function runVisionAnalysis(sourceB64, referenceB64, modelId) {
    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    } catch (netErr) {
        throw new ApiError({
            kind: 'network', stage: 'vision', modelId,
            message: netErr.message || 'Network request failed',
            body: String(netErr)
        });
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsedMsg;
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) {}
        throw new ApiError({
            kind: 'http', stage: 'vision', modelId,
            status: response.status,
            message: parsedMsg || `HTTP ${response.status}`,
            body: bodyText
        });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new ApiError({
            kind: 'refusal', stage: 'vision', modelId,
            message: 'Vision model returned no text content',
            body: JSON.stringify(data, null, 2)
        });
    }

    if (looksLikeRefusal(raw)) {
        throw new ApiError({
            kind: 'refusal', stage: 'vision', modelId,
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
                kind: 'parse', stage: 'vision', modelId,
                message: 'Vision response was not valid JSON',
                body: raw
            });
        }
        try {
            return JSON.parse(match[0]);
        } catch (e) {
            throw new ApiError({
                kind: 'parse', stage: 'vision', modelId,
                message: 'Vision JSON block failed to parse',
                body: raw
            });
        }
    }
}

export async function researchSubject(subjectText, modelId) {
    let response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) {}
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

export async function generateSingleImage(prompt, modelConfig, { onRetry } = {}) {
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
        modalities: modelConfig.modalities
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
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Imagen Internal Tool'
            },
            body: JSON.stringify(requestBody)
        });
    } catch (netErr) {
        throw new ApiError({
            kind: 'network', stage: 'generation', modelId,
            message: netErr.message || 'Network request failed',
            body: String(netErr)
        });
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        let parsedMsg;
        try { parsedMsg = JSON.parse(bodyText).error?.message; } catch (_) {}
        throw new ApiError({
            kind: 'http', stage: 'generation', modelId,
            status: response.status,
            message: parsedMsg || `HTTP ${response.status}`,
            body: bodyText
        });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    if (!message) {
        throw new ApiError({
            kind: 'no-image', stage: 'generation', modelId,
            message: 'No message in API response',
            body: JSON.stringify(data, null, 2)
        });
    }

    console.log('API Response:', JSON.stringify(data, null, 2));

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

    throw new ApiError({
        kind: 'no-image', stage: 'generation', modelId,
        message: 'No image in response',
        body: JSON.stringify(data, null, 2)
    });
    };

    if (state.autoRetryEnabled) {
        return retryWithBackoff(doGenerate, { onRetry });
    }
    return doGenerate();
}

export async function fetchModelPricing() {
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
