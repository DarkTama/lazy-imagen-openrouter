import { describe, it, expect, beforeEach } from 'vitest';
import { keyStore, isDesktop } from '../src/key-store.js';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('keyStore (web)', () => {
    it('isDesktop false in web', () => expect(isDesktop()).toBe(false));
    it('set remember:true -> localStorage', async () => {
        sessionStorage.setItem('imagen_api_key_session_p', 'old');
        await keyStore.set('p', 'k1', { remember: true });
        expect(localStorage.getItem('imagen_api_key_p')).toBe('k1');
        expect(sessionStorage.getItem('imagen_api_key_session_p')).toBeNull();
    });
    it('set remember:false -> sessionStorage', async () => {
        localStorage.setItem('imagen_api_key_p', 'old');
        await keyStore.set('p', 'k2', { remember: false });
        expect(sessionStorage.getItem('imagen_api_key_session_p')).toBe('k2');
        expect(localStorage.getItem('imagen_api_key_p')).toBeNull();
    });
    it('get/has mirror storage', async () => {
        expect(await keyStore.get('p')).toBe('');
        expect(await keyStore.has('p')).toBe(false);
        await keyStore.set('p', 'k', { remember: false });
        expect(await keyStore.get('p')).toBe('k');
        expect(keyStore.getSync('p')).toBe('k');
        expect(await keyStore.has('p')).toBe(true);
    });
    it('remove clears both', async () => {
        localStorage.setItem('imagen_api_key_p', 'a');
        sessionStorage.setItem('imagen_api_key_session_p', 'b');
        await keyStore.remove('p');
        expect(await keyStore.has('p')).toBe(false);
    });
    it('desktop: get null, getSync null', async () => {
        window.__TAURI_INTERNALS__ = {};
        try {
            localStorage.setItem('imagen_api_key_p', 'a');
            expect(await keyStore.get('p')).toBeNull();
            expect(keyStore.getSync('p')).toBeNull();
        } finally { delete window.__TAURI_INTERNALS__; }
    });
});
