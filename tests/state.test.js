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
