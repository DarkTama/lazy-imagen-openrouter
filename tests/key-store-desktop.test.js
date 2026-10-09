import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { keyStore, isDesktop, migrateWebKeysToKeyring } from '../src/key-store.js';

beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    invoke.mockReset(); invoke.mockResolvedValue(undefined);
    window.__TAURI_INTERNALS__ = {};
});
afterEach(() => { delete window.__TAURI_INTERNALS__; });

describe('keyStore (desktop)', () => {
    it('isDesktop true', () => expect(isDesktop()).toBe(true));
    it('set invokes key_set, ignores remember', async () => {
        await keyStore.set('p', 'k', { remember: false });
        expect(invoke).toHaveBeenCalledWith('key_set', { providerId: 'p', key: 'k' });
        expect(localStorage.length + sessionStorage.length).toBe(0);
    });
    it('has invokes key_has', async () => {
        invoke.mockResolvedValue(true);
        expect(await keyStore.has('p')).toBe(true);
        expect(invoke).toHaveBeenCalledWith('key_has', { providerId: 'p' });
    });
    it('remove invokes key_remove', async () => {
        await keyStore.remove('p');
        expect(invoke).toHaveBeenCalledWith('key_remove', { providerId: 'p' });
    });
    it('get/getSync return null, no invoke', async () => {
        expect(await keyStore.get('p')).toBeNull();
        expect(keyStore.getSync('p')).toBeNull();
        expect(invoke).not.toHaveBeenCalled();
    });
});

describe('migrateWebKeysToKeyring', () => {
    it('moves local+session keys to keyring and deletes them', async () => {
        localStorage.setItem('imagen_api_key_openrouter', 'a');
        localStorage.setItem('imagen_api_key_custom_1_x', 'b');
        sessionStorage.setItem('imagen_api_key_session_gemini', 'c');
        localStorage.setItem('other', 'z');
        await migrateWebKeysToKeyring();
        expect(invoke).toHaveBeenCalledWith('key_set', { providerId: 'openrouter', key: 'a' });
        expect(invoke).toHaveBeenCalledWith('key_set', { providerId: 'custom_1_x', key: 'b' });
        expect(invoke).toHaveBeenCalledWith('key_set', { providerId: 'gemini', key: 'c' });
        expect(localStorage.getItem('imagen_api_key_openrouter')).toBeNull();
        expect(localStorage.getItem('imagen_api_key_custom_1_x')).toBeNull();
        expect(sessionStorage.getItem('imagen_api_key_session_gemini')).toBeNull();
        expect(localStorage.getItem('other')).toBe('z');
    });
    it('keeps web key if key_set fails', async () => {
        localStorage.setItem('imagen_api_key_p', 'a');
        invoke.mockRejectedValue(new Error('x'));
        await migrateWebKeysToKeyring();
        expect(localStorage.getItem('imagen_api_key_p')).toBe('a');
    });
    it('no-op on web', async () => {
        delete window.__TAURI_INTERNALS__;
        localStorage.setItem('imagen_api_key_p', 'a');
        await migrateWebKeysToKeyring();
        expect(invoke).not.toHaveBeenCalled();
        expect(localStorage.getItem('imagen_api_key_p')).toBe('a');
    });
});
