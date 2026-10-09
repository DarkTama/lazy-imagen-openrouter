import { describe, it, expect, beforeEach } from 'vitest';
import {
    getAllProviders,
    getProvider,
    getProvidersByCapability,
    saveCustomProvider,
    deleteCustomProvider,
    CUSTOM_PROVIDERS_STORAGE_KEY
} from '../src/providers.js';

describe('providers registry', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns built-in providers by default', () => {
        const all = getAllProviders();
        expect(all.some(p => p.id === 'openrouter')).toBe(true);
        expect(all.some(p => p.id === 'nanogpt')).toBe(true);
    });

    it('saves and retrieves a custom OpenAI provider', () => {
        const custom = saveCustomProvider({
            name: 'Local Ollama',
            base: 'http://localhost:11434/v1',
            capabilities: { imageGen: false, chatVision: true },
            imageStrategy: 'images-endpoint'
        });
        expect(custom.id).toBeDefined();
        expect(custom.isBuiltIn).toBe(false);

        const found = getProvider(custom.id);
        expect(found.name).toBe('Local Ollama');
        expect(found.base).toBe('http://localhost:11434/v1');
    });

    it('filters providers by capability', () => {
        saveCustomProvider({
            name: 'Vision Only',
            base: 'https://vision.ai/v1',
            capabilities: { imageGen: false, chatVision: true }
        });
        saveCustomProvider({
            name: 'Image Only',
            base: 'https://img.ai/v1',
            capabilities: { imageGen: true, chatVision: false }
        });

        const imageProviders = getProvidersByCapability('imageGen');
        expect(imageProviders.some(p => p.name === 'Image Only')).toBe(true);
        expect(imageProviders.some(p => p.name === 'Vision Only')).toBe(false);

        const visionProviders = getProvidersByCapability('chatVision');
        expect(visionProviders.some(p => p.name === 'Vision Only')).toBe(true);
        expect(visionProviders.some(p => p.name === 'Image Only')).toBe(false);
    });

    it('deletes custom provider but prevents deleting built-ins', () => {
        const custom = saveCustomProvider({
            name: 'Temp Provider',
            base: 'https://temp.ai/v1',
            capabilities: { imageGen: true, chatVision: true }
        });
        expect(deleteCustomProvider(custom.id)).toBe(true);
        expect(getProvider(custom.id)).toBeNull();

        expect(deleteCustomProvider('openrouter')).toBe(false);
        expect(getProvider('openrouter')).not.toBeNull();
    });
});

describe('custom provider image capabilities', () => {
    beforeEach(() => { localStorage.clear(); });

    it('round-trips imageConfigStyle, supportsAspectRatio, knownModels', () => {
        const km = [{ id: 'img-1', name: 'Img', kind: 'image', supportsImageInput: true, notes: 'n' }];
        const c = saveCustomProvider({ name: 'X', base: 'http://h/v1', imageConfigStyle: 'gemini', supportsAspectRatio: false, knownModels: km });
        const f = getProvider(c.id);
        expect(f.imageConfigStyle).toBe('gemini');
        expect(f.supportsAspectRatio).toBe(false);
        expect(f.knownModels).toEqual(km);
    });

    it('defaults for legacy stored providers', () => {
        localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify([{ id: 'old', name: 'Old', base: 'http://h/v1' }]));
        const f = getProvider('old');
        expect(f.imageConfigStyle).toBe('flat');
        expect(f.supportsAspectRatio).toBe(true);
        expect(f.knownModels).toEqual([]);
    });
});
