import { describe, it, expect, beforeEach } from 'vitest';
import { state, ORCHESTRATOR_DEFAULTS, loadApiKeyForProvider } from '../src/state.js';

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

import { getEffectiveGenerationModel, getGenerationModelConfig, loadCustomGenerationModel, saveCustomGenerationModel, MODEL_CONFIGS } from '../src/state.js';

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
