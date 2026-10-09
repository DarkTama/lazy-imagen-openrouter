import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { providerRequest } from '../src/http.js';

describe('providerRequest (desktop)', () => {
    beforeEach(() => {
        window.__TAURI_INTERNALS__ = {};
        invoke.mockReset();
        globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    });
    afterEach(() => {
        delete window.__TAURI_INTERNALS__;
        vi.restoreAllMocks();
        delete globalThis.fetch;
    });

    it('invokes provider_fetch without Authorization from JS', async () => {
        invoke.mockResolvedValue({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
        const headers = new Headers({ Authorization: 'Bearer leak', 'Content-Type': 'application/json' });
        const res = await providerRequest('p1', 'https://x/y', { method: 'POST', headers, body: '{}' });
        expect(invoke).toHaveBeenCalledTimes(1);
        const [cmd, args] = invoke.mock.calls[0];
        expect(cmd).toBe('provider_fetch');
        expect(args.providerId).toBe('p1');
        expect(args.method).toBe('POST');
        expect(args.body).toBe('{}');
        expect(Object.keys(args.headers).map(k => k.toLowerCase())).not.toContain('authorization');
        expect(args.headers['content-type']).toBe('application/json');
        expect(JSON.stringify(args)).not.toContain('leak');
        expect(res.ok).toBe(true);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('application/json');
        expect(await res.json()).toEqual({ a: 1 });
        expect(await res.text()).toBe('{"a":1}');
        await expect(res.blob()).rejects.toThrow('binary bodies not supported over provider_fetch');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('passes keyOverride and ok=false on 4xx', async () => {
        invoke.mockResolvedValue({ status: 401, headers: {}, body: 'no' });
        const res = await providerRequest(null, 'https://x', {}, { keyOverride: 'k' });
        expect(invoke.mock.calls[0][1].keyOverride).toBe('k');
        expect(invoke.mock.calls[0][1].method).toBe('GET');
        expect(res.ok).toBe(false);
    });

    it('rejection becomes TypeError network', async () => {
        invoke.mockRejectedValue('network: boom');
        await expect(providerRequest('p', 'https://x')).rejects.toThrow(TypeError);
        await expect(providerRequest('p', 'https://x')).rejects.toThrow(/^network: /);
    });

    it('already aborted throws AbortError', async () => {
        const ac = new AbortController(); ac.abort();
        await expect(providerRequest('p', 'https://x', { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(invoke).not.toHaveBeenCalled();
    });

    it('abort mid-flight rejects', async () => {
        invoke.mockReturnValue(new Promise(() => {}));
        const ac = new AbortController();
        const p = providerRequest('p', 'https://x', { signal: ac.signal });
        ac.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('null providerId without override uses native fetch', async () => {
        await providerRequest(null, 'https://pub/x');
        expect(invoke).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalled();
    });
});
