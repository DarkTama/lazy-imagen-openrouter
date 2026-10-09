import { describe, it, expect } from 'vitest';
import { pickImg2imgModel } from '../src/generation-constraints.js';

const known = [
    { id: 'txt', name: 'Txt', kind: 'image', supportsImageInput: false },
    { id: 'img', name: 'Img', kind: 'image', supportsImageInput: true },
    { id: 'vis', name: 'Vis', kind: 'vision', supportsImageInput: true },
];

describe('pickImg2imgModel', () => {
    it('no-op when orchestrator disabled', () => {
        expect(pickImg2imgModel({ orchestratorEnabled: false, providerId: 'c', selectedModelId: 'txt', knownModels: known }))
            .toEqual({ filter: false, switchTo: null, warnNoImg2img: false });
    });
    it('switches custom provider to first img2img model', () => {
        const r = pickImg2imgModel({ orchestratorEnabled: true, providerId: 'c', selectedModelId: 'txt', modelConfigs: { txt: { supportsImageInput: false } }, knownModels: known });
        expect(r.filter).toBe(true);
        expect(r.switchTo.id).toBe('img');
        expect(r.warnNoImg2img).toBe(false);
    });
    it('keeps selection when it supports image input', () => {
        const r = pickImg2imgModel({ orchestratorEnabled: true, providerId: 'c', selectedModelId: 'img', knownModels: known });
        expect(r).toEqual({ filter: true, switchTo: null, warnNoImg2img: false });
    });
    it('warns when no img2img model exists', () => {
        const r = pickImg2imgModel({ orchestratorEnabled: true, providerId: 'c', selectedModelId: 'txt', knownModels: [known[0]] });
        expect(r).toEqual({ filter: true, switchTo: null, warnNoImg2img: true });
    });
    it('prefers live models over known', () => {
        const r = pickImg2imgModel({ orchestratorEnabled: true, providerId: 'c', selectedModelId: 'x', liveImageModels: [{ id: 'live', supportsImageInput: true }], knownModels: known });
        expect(r.switchTo.id).toBe('live');
    });
    it('uses allowlist only for nanogpt', () => {
        const al = [{ id: 'al', supportsImageInput: true }];
        expect(pickImg2imgModel({ orchestratorEnabled: true, providerId: 'nanogpt', selectedModelId: 'x', allowlist: al }).switchTo.id).toBe('al');
        expect(pickImg2imgModel({ orchestratorEnabled: true, providerId: 'c', selectedModelId: 'x', allowlist: al }).warnNoImg2img).toBe(true);
    });
});
