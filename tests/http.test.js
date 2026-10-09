import { describe, it, expect, beforeEach, vi } from 'vitest';
import { providerRequest } from '../src/http.js';
import { keyStore } from '../src/key-store.js';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe('providerRequest (web)', () => {
    it('adds Bearer from keyStore', async () => {
        await keyStore.set('openrouter', 'sk-1', { remember: true });
        await providerRequest('openrouter', 'https://x/y', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://x/y');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer sk-1');
        expect(init.headers['Content-Type']).toBe('application/json');
    });
    it('null provider sends no auth', async () => {
        await keyStore.set('openrouter', 'sk-1', { remember: true });
        await providerRequest(null, 'https://x/y', { headers: { Authorization: 'Bearer leak' } });
        expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });
    it('strips caller Authorization, keyOverride wins', async () => {
        await keyStore.set('p', 'saved', { remember: true });
        await providerRequest('p', 'u', { headers: { authorization: 'Bearer bad' } }, { keyOverride: 'typed' });
        const h = global.fetch.mock.calls[0][1].headers;
        expect(h.Authorization).toBe('Bearer typed');
        expect(h.authorization).toBeUndefined();
    });
    it('no key -> no Authorization', async () => {
        await providerRequest('p', 'u');
        expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });
    it('propagates fetch errors', async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError('net down'));
        await expect(providerRequest('p', 'u')).rejects.toThrow('net down');
    });
});
