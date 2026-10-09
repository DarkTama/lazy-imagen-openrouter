/**
 * keyStore: single seam for provider API keys.
 * Web: localStorage (remember) / sessionStorage (session-only).
 * Desktop (Tauri): keys live in the OS keyring and never reach JS (Task 4).
 */

import { invoke } from '@tauri-apps/api/core';

export function isDesktop() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const lsName = (id) => `imagen_api_key_${id}`;
const ssName = (id) => `imagen_api_key_session_${id}`;

function readWeb(id) {
    return localStorage.getItem(lsName(id)) || sessionStorage.getItem(ssName(id)) || '';
}

const WEB_KEY_RE = /^imagen_api_key_(?:session_)?(.+)$/;

/**
 * Desktop only: move any web-stored keys into the OS keyring, then delete them.
 * A web key is only deleted after key_set succeeds.
 */
export async function migrateWebKeysToKeyring() {
    if (!isDesktop()) return;
    for (const storage of [localStorage, sessionStorage]) {
        const names = [];
        for (let i = 0; i < storage.length; i++) names.push(storage.key(i));
        for (const name of names) {
            const m = WEB_KEY_RE.exec(name);
            if (!m) continue;
            const value = storage.getItem(name);
            try {
                if (value) await invoke('key_set', { providerId: m[1], key: value });
                storage.removeItem(name);
            } catch (e) {
                console.warn('key migration failed for', m[1], e);
            }
        }
    }
}

export const keyStore = {
    /**
     * Synchronous web-only read. Exists solely for the initial `state.apiKey`
     * computed at module load and `providerFetchArgs`, until Task 2 moves
     * requests behind Rust. Returns null on desktop. Prefer async get/has.
     */
    getSync(providerId) {
        if (isDesktop()) return null;
        return readWeb(providerId);
    },

    /** Web: key string ('' if none). Desktop: always null. */
    async get(providerId) {
        if (isDesktop()) return null;
        return readWeb(providerId);
    },

    async has(providerId) {
        if (isDesktop()) return Boolean(await invoke('key_has', { providerId }));
        return Boolean(readWeb(providerId));
    },

    async set(providerId, key, { remember = false } = {}) {
        if (isDesktop()) {
            if (!key) return invoke('key_remove', { providerId });
            return invoke('key_set', { providerId, key });
        }
        if (remember) {
            localStorage.setItem(lsName(providerId), key);
            sessionStorage.removeItem(ssName(providerId));
        } else {
            sessionStorage.setItem(ssName(providerId), key);
            localStorage.removeItem(lsName(providerId));
        }
    },

    async remove(providerId) {
        if (isDesktop()) return invoke('key_remove', { providerId });
        localStorage.removeItem(lsName(providerId));
        sessionStorage.removeItem(ssName(providerId));
    },
};
