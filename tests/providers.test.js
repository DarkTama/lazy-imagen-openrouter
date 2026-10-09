import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getAllProviders,
    getProvider,
    getProvidersByCapability,
    saveCustomProvider,
    deleteCustomProvider,
    CUSTOM_PROVIDERS_STORAGE_KEY,
    PROVIDER_TEMPLATES,
    getProviderTemplate,
    templateFormValues,
    mergeTemplateIntoSave
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

describe('NineGuard template', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.unstubAllEnvs());

    it('has expected static fields and no key/host', () => {
        const t = PROVIDER_TEMPLATES.nineguard;
        expect(t.name).toBe('NineGuard');
        expect(t.imageStrategy).toBe('chat-modalities');
        expect(t.imageConfigStyle).toBe('none');
        expect(t.supportsAspectRatio).toBe(false);
        expect(t.defaultVisionModel).toBe('9router/ag/gemini-3.8-flash-low');
        expect(t.knownModels).toHaveLength(3);
        expect(t.notice).toContain('Vite proxy');
    });

    it('base is absolute in DEV and empty otherwise', () => {
        vi.stubEnv('DEV', true);
        expect(getProviderTemplate('nineguard').base).toBe(`${location.origin}/nineguard/v1`);
        vi.stubEnv('DEV', false);
        expect(getProviderTemplate('nineguard').base).toBe('');
    });

    it('save round-trip persists knownModels, supportsAspectRatio, defaultVisionModel', () => {
        const t = getProviderTemplate('nineguard');
        const saved = saveCustomProvider({ ...t, base: 'https://example.invalid/v1' });
        const loaded = getProvider(saved.id);
        expect(loaded.supportsAspectRatio).toBe(false);
        expect(loaded.imageConfigStyle).toBe('none');
        expect(loaded.knownModels).toHaveLength(3);
        expect(loaded.knownModels[2].supportsImageInput).toBe(false);
        expect(loaded.defaultVisionModel).toBe(t.defaultVisionModel);
    });
});

describe('template form flow', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('templateFormValues(nineguard): fields, empty key, notice', () => {
        vi.stubEnv('DEV', true);
        const v = templateFormValues('nineguard');
        expect(v).toEqual({
            name: 'NineGuard', base: `${location.origin}/nineguard/v1`, imageStrategy: 'chat-modalities',
            capImage: true, capChat: true, key: '', notice: PROVIDER_TEMPLATES.nineguard.notice
        });
        expect(templateFormValues('nope')).toBeNull();
    });

    it('non-DEV base is empty and HTML input is required', async () => {
        vi.stubEnv('DEV', false);
        expect(templateFormValues('nineguard').base).toBe('');
        const fs = await import('node:fs');
        const html = fs.readFileSync('index.html', 'utf-8');
        expect(html).toMatch(/<input[^>]*id="providerFormBase"[^>]*\brequired\b/);
    });

    const form = { id: undefined, name: 'My NG', base: 'https://x.invalid/v1', imageStrategy: 'images-endpoint', capImage: false, capChat: true };

    it('merge on create takes extras from template; form fields win', () => {
        const t = getProviderTemplate('nineguard');
        const c = mergeTemplateIntoSave(form, t, null);
        expect(c.knownModels).toEqual(t.knownModels);
        expect(c.supportsAspectRatio).toBe(false);
        expect(c.imageConfigStyle).toBe('none');
        expect(c.defaultVisionModel).toBe(t.defaultVisionModel);
        expect(c.name).toBe('My NG');
        expect(c.base).toBe('https://x.invalid/v1');
        expect(c.imageStrategy).toBe('images-endpoint');
        expect(c.capabilities).toEqual({ imageGen: false, chatVision: true });
    });

    it('merge on edit takes extras from existing provider', () => {
        const existing = { knownModels: [{ id: 'm', kind: 'vision' }], supportsAspectRatio: false, imageConfigStyle: 'none', defaultVisionModel: 'm' };
        const c = mergeTemplateIntoSave({ ...form, id: 'p1' }, null, existing);
        expect(c.id).toBe('p1');
        expect(c.knownModels).toEqual(existing.knownModels);
        expect(c.supportsAspectRatio).toBe(false);
        expect(c.imageConfigStyle).toBe('none');
        expect(c.defaultVisionModel).toBe('m');
        expect(c.name).toBe('My NG');
    });

    it('merge with no source yields no extras', () => {
        expect(mergeTemplateIntoSave(form, null, null).knownModels).toBeUndefined();
    });
});
