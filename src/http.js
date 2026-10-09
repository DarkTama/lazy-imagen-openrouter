/**
 * Single network seam. All fetches go through providerRequest. On desktop,
 * provider calls go through the Rust `provider_fetch` command, which injects
 * the key from the OS keyring (JS never holds it; no CORS / mixed-content limits).
 */
import { invoke } from '@tauri-apps/api/core';
import { keyStore, isDesktop } from './key-store.js';

function normalizeHeaders(h) {
    const out = {};
    if (!h) return out;
    if (typeof h.forEach === 'function' && !Array.isArray(h)) {
        h.forEach((v, k) => { out[k] = v; });
    } else if (Array.isArray(h)) {
        for (const [k, v] of h) out[k] = v;
    } else {
        Object.assign(out, h);
    }
    return out;
}

function abortError() {
    return new DOMException('The operation was aborted.', 'AbortError');
}

async function desktopRequest(providerId, url, init, keyOverride) {
    const signal = init.signal;
    if (signal?.aborted) throw abortError();

    const headers = {};
    for (const [k, v] of Object.entries(normalizeHeaders(init.headers))) {
        if (k.toLowerCase() !== 'authorization') headers[k] = String(v);
    }
    const call = invoke('provider_fetch', {
        providerId: providerId || null,
        url: String(url),
        method: (init.method || 'GET').toUpperCase(),
        headers,
        body: init.body == null ? null : init.body,
        keyOverride: keyOverride || null,
    });

    let onAbort;
    const racers = [call];
    if (signal) {
        racers.push(new Promise((_, reject) => {
            onAbort = () => reject(abortError());
            signal.addEventListener('abort', onAbort, { once: true });
        }));
    }
    let result;
    try {
        result = await Promise.race(racers);
    } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        const msg = typeof e === 'string' ? e : (e && e.message) || String(e);
        throw new TypeError(msg.startsWith('network: ') ? msg : 'network: ' + msg);
    } finally {
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    }
    const { status, body } = result;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(result.headers || {}),
        text: async () => body,
        json: async () => JSON.parse(body),
        blob: async () => { throw new Error('binary bodies not supported over provider_fetch'); },
    };
}

export function providerRequest(providerId, url, init = {}, { keyOverride } = {}) {
    if (isDesktop() && (providerId || keyOverride)) {
        return desktopRequest(providerId, url, init, keyOverride);
    }
    const headers = {};
    for (const [k, v] of Object.entries(normalizeHeaders(init.headers))) {
        if (k.toLowerCase() !== 'authorization') headers[k] = v;
    }
    const key = keyOverride || (providerId ? keyStore.getSync(providerId) : '');
    if (key) headers.Authorization = `Bearer ${key}`;
    return fetch(url, { ...init, headers });
}
