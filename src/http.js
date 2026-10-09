/**
 * Single network seam. All fetches go through providerRequest so the desktop
 * build can later route them via Rust, which injects the key from the keyring.
 */
import { keyStore } from './key-store.js';

export function providerRequest(providerId, url, init = {}, { keyOverride } = {}) {
    const headers = {};
    for (const [k, v] of Object.entries({ ...(init.headers || {}) })) {
        if (k.toLowerCase() !== 'authorization') headers[k] = v;
    }
    const key = keyOverride || (providerId ? keyStore.getSync(providerId) : '');
    if (key) headers.Authorization = `Bearer ${key}`;
    return fetch(url, { ...init, headers });
}
