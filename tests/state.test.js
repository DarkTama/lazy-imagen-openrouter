import { describe, it, expect, beforeEach } from 'vitest';
import { state, ORCHESTRATOR_DEFAULTS, loadApiKeyForProvider, getEffectiveGenerationModel, getGenerationModelConfig, loadCustomGenerationModel, saveCustomGenerationModel, MODEL_CONFIGS, resolveReuseModel } from '../src/state.js';

describe('state role-based provider decoupling', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('has independent provider fields in state and orchestrator defaults', () => {
        expect(state.generationProvider).toBeDefined();
        expect(ORCHESTRATOR_DEFAULTS.visionProvider).toBe('openrouter');
        expect(ORCHESTRATOR_DEFAULTS.researchProvider).toBe('openrouter');
    });

    it('loads per-provider api key correctly', () => {
        localStorage.setItem('imagen_api_key_custom_1', 'custom-key-123');
        expect(loadApiKeyForProvider('custom_1')).toBe('custom-key-123');
    });
});


describe('custom generation model', () => {
    beforeEach(() => { localStorage.clear(); state.generationModelCustom = ''; });

    it('returns picker value when custom empty, trimmed custom otherwise', () => {
        state.selectedModel = 'picker/x';
        expect(getEffectiveGenerationModel()).toBe('picker/x');
        state.generationModelCustom = '  my/custom ';
        expect(getEffectiveGenerationModel()).toBe('my/custom');
    });

    it('falls back config for unknown ids without mutating MODEL_CONFIGS', () => {
        state.generationModelCustom = 'zzz/unknown';
        expect(getGenerationModelConfig()).toEqual({ name: 'zzz/unknown', supportsImageInput: false, supportsAspectRatio: true });
        expect(MODEL_CONFIGS['zzz/unknown']).toBeUndefined();
    });

    it('persists per provider', () => {
        saveCustomGenerationModel('a', ' m1 ');
        saveCustomGenerationModel('b', 'm2');
        expect(loadCustomGenerationModel('a')).toBe('m1');
        expect(loadCustomGenerationModel('b')).toBe('m2');
        saveCustomGenerationModel('a', '');
        expect(loadCustomGenerationModel('a')).toBe('');
        expect(localStorage.getItem('imagen_model_custom_a')).toBeNull();
    });
});

describe('resolveReuseModel', () => {
    it('known model selects it and clears custom', () => {
        const id = Object.keys(MODEL_CONFIGS)[0];
        expect(resolveReuseModel(id, MODEL_CONFIGS)).toEqual({ selectedModel: id, custom: '' });
    });
    it('unknown model becomes custom ID', () => {
        expect(resolveReuseModel('foo/bar-xyz', MODEL_CONFIGS)).toEqual({ selectedModel: null, custom: 'foo/bar-xyz' });
    });
});

describe('loadSelectedModelForProvider custom known models', () => {
    beforeEach(() => { localStorage.clear(); });
    it('defaults to first known image model for a custom provider', async () => {
        const { saveCustomProvider } = await import('../src/providers.js');
        const { loadSelectedModelForProvider } = await import('../src/state.js');
        const c = saveCustomProvider({
            name: 'KD', base: 'https://kd.example/v1',
            knownModels: [{ id: 'v1', kind: 'vision' }, { id: 'img-a', kind: 'image' }, { id: 'img-b', kind: 'image' }]
        });
        expect(loadSelectedModelForProvider(c.id)).toBe('img-a');
        expect(loadSelectedModelForProvider('openrouter')).toBe('google/gemini-2.5-flash-image');
    });
});
