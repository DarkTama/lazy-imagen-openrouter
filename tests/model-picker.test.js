import { describe, it, expect } from 'vitest';
import { filterModels, sortModels } from '../src/model-picker.js';

// Minimal fixture models
const MODELS = [
    { id: 'flux-1.1-pro',        name: 'FLUX 1.1 Pro',       subscription: false, supportsImageInput: false, price: { perImage: 0.04 } },
    { id: 'step-image-edit-2',   name: 'Step Image Edit 2',  subscription: true,  supportsImageInput: true,  price: null },
    { id: 'chroma',              name: 'Chroma',              subscription: true,  supportsImageInput: false, price: null },
    { id: 'qwen-image',          name: 'Qwen Image',         subscription: true,  supportsImageInput: true,  price: null },
    { id: 'imagen-3',            name: 'Imagen 3',           subscription: false, supportsImageInput: false, price: { perImage: 0.02 } },
    { id: 'z-image-turbo',       name: 'Z Image Turbo',      subscription: true,  supportsImageInput: false, price: null },
];

// ─── filterModels ─────────────────────────────────────────────────────────────

describe('filterModels', () => {
    it('returns all models when no filters are set', () => {
        expect(filterModels(MODELS)).toHaveLength(MODELS.length);
    });

    it('ilike search on model id', () => {
        const result = filterModels(MODELS, { query: 'step' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('step-image-edit-2');
    });

    it('ilike search on model name (case-insensitive)', () => {
        const result = filterModels(MODELS, { query: 'IMAGEN' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('imagen-3');
    });

    it('ilike search matches both id and name (union)', () => {
        const result = filterModels(MODELS, { query: 'image' });
        // matches: step-image-edit-2 (id), Step Image Edit 2 (name), qwen-image (id), Qwen Image (name), Imagen 3 (name), Z Image Turbo (name)
        expect(result.length).toBeGreaterThanOrEqual(4);
        const ids = result.map(m => m.id);
        expect(ids).toContain('step-image-edit-2');
        expect(ids).toContain('qwen-image');
        expect(ids).toContain('imagen-3');
    });

    it('returns empty array when nothing matches', () => {
        expect(filterModels(MODELS, { query: 'xyznothing' })).toHaveLength(0);
    });

    it('filterSubs keeps only subscription models', () => {
        const result = filterModels(MODELS, { filterSubs: true });
        expect(result.every(m => m.subscription)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });

    it('filterImg2img keeps only models with supportsImageInput', () => {
        const result = filterModels(MODELS, { filterImg2img: true });
        expect(result.every(m => m.supportsImageInput)).toBe(true);
        expect(result.map(m => m.id)).toContain('step-image-edit-2');
        expect(result.map(m => m.id)).toContain('qwen-image');
    });

    it('combines query + filterSubs', () => {
        const result = filterModels(MODELS, { query: 'step', filterSubs: true });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('step-image-edit-2');
    });

    it('returns empty when query matches but filterImg2img excludes', () => {
        const result = filterModels(MODELS, { query: 'chroma', filterImg2img: true });
        expect(result).toHaveLength(0);
    });
});

// ─── sortModels ───────────────────────────────────────────────────────────────

describe('sortModels', () => {
    it('sorts by name alphabetically (default)', () => {
        const sorted = sortModels(MODELS);
        const names = sorted.map(m => m.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('sort=name is stable and consistent with default', () => {
        const a = sortModels(MODELS, 'name');
        const b = sortModels(MODELS);
        expect(a.map(m => m.id)).toEqual(b.map(m => m.id));
    });

    it('sort=price orders by ascending perImage cost, subscription models first (price 0)', () => {
        const sorted = sortModels(MODELS, 'price');
        const prices = sorted.map(m => (m.subscription ? 0 : (m.price?.perImage ?? Infinity)));
        for (let i = 0; i < prices.length - 1; i++) {
            expect(prices[i]).toBeLessThanOrEqual(prices[i + 1]);
        }
    });

    it('sort=subscription puts subscription models before non-subscription', () => {
        const sorted = sortModels(MODELS, 'subscription');
        const firstNonSubIdx = sorted.findIndex(m => !m.subscription);
        const lastSubIdx = sorted.map(m => m.subscription).lastIndexOf(true);
        if (firstNonSubIdx !== -1 && lastSubIdx !== -1) {
            expect(lastSubIdx).toBeLessThan(firstNonSubIdx);
        }
    });

    it('does not mutate the input array', () => {
        const original = [...MODELS];
        sortModels(MODELS, 'price');
        expect(MODELS.map(m => m.id)).toEqual(original.map(m => m.id));
    });

    it('handles empty array', () => {
        expect(sortModels([], 'name')).toEqual([]);
        expect(sortModels([], 'price')).toEqual([]);
        expect(sortModels([], 'subscription')).toEqual([]);
    });

    it('handles single model', () => {
        const single = [MODELS[0]];
        expect(sortModels(single, 'subscription')).toEqual(single);
    });
});
