/** Pure decision logic for the orchestrator img2img constraint (no DOM). */

/**
 * @returns {{ filter: boolean, switchTo: object|null, warnNoImg2img: boolean }}
 */
export function pickImg2imgModel({ orchestratorEnabled, providerId, selectedModelId, modelConfigs = {}, liveImageModels = [], knownModels = [], allowlist = [] }) {
    if (!orchestratorEnabled) return { filter: false, switchTo: null, warnNoImg2img: false };

    let pool = [...(liveImageModels || [])];
    if (!pool.length) {
        pool = (knownModels || []).filter(m => m.kind === 'image');
    }
    if (!pool.length && providerId === 'nanogpt') pool = [...(allowlist || [])];
    if (!pool.length && providerId === 'openrouter') {
        pool = Object.entries(modelConfigs)
            .filter(([, c]) => !c.provider || c.provider === 'openrouter')
            .map(([id, c]) => ({ id, ...c }));
    }

    const inPool = pool.find(m => m.id === selectedModelId);
    const cfg = modelConfigs[selectedModelId];
    const selectedOk = inPool ? !!inPool.supportsImageInput : !!cfg?.supportsImageInput;
    if (selectedOk) return { filter: true, switchTo: null, warnNoImg2img: false };

    const first = pool.find(m => m.supportsImageInput);
    if (first) return { filter: true, switchTo: first, warnNoImg2img: false };
    return { filter: true, switchTo: null, warnNoImg2img: true };
}
