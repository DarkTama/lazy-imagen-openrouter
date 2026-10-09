/**
 * keyStore: single seam for provider API keys.
 * Web: localStorage (remember) / sessionStorage (session-only).
 * Desktop (Tauri): keys live in the OS keyring and never reach JS (Task 4).
 */

export function isDesktop() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const lsName = (id) => `imagen_api_key_${id}`;
const ssName = (id) => `imagen_api_key_session_${id}`;

function readWeb(id) {
    return localStorage.getItem(lsName(id)) || sessionStorage.getItem(ssName(id)) || '';
}

function notImplemented() {
    throw new Error('keyStore: desktop keyring not implemented');
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
        if (isDesktop()) return notImplemented();
        return Boolean(readWeb(providerId));
    },

    async set(providerId, key, { remember = false } = {}) {
        if (isDesktop()) return notImplemented();
        if (remember) {
            localStorage.setItem(lsName(providerId), key);
            sessionStorage.removeItem(ssName(providerId));
        } else {
            sessionStorage.setItem(ssName(providerId), key);
            localStorage.removeItem(lsName(providerId));
        }
    },

    async remove(providerId) {
        if (isDesktop()) return notImplemented();
        localStorage.removeItem(lsName(providerId));
        sessionStorage.removeItem(ssName(providerId));
    },
};
