// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const conf = json('../src-tauri/tauri.conf.json');
const caps = json('../src-tauri/capabilities/default.json');
const csp = conf.app.security.csp;

describe('tauri.conf.json', () => {
    it('has identity', () => {
        expect(conf.identifier).toBe('io.github.darktama.lazyimagen');
        expect(conf.productName).toBe('Lazy Imagen');
        expect(conf.version).toBe('../package.json');
    });
    it('has a hardened CSP', () => {
        expect(typeof csp).toBe('string');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain('wasm-unsafe-eval');
        expect(csp.replace(/wasm-unsafe-eval/g, '')).not.toMatch(/unsafe-eval/);
        const worker = csp.split(';').map(s => s.trim()).find(s => s.startsWith('worker-src'));
        expect(worker).toContain('blob:');
        expect(worker).toContain('data:');
        expect(csp).toContain('ipc:');
        expect(csp).not.toMatch(/object-src(?!.*'none')/);
    });
});

describe('capabilities/default.json', () => {
    it('grants only core:default and app commands', () => {
        expect([...caps.permissions].sort()).toEqual(
            ['core:default', 'allow-key-set', 'allow-key-has', 'allow-key-remove', 'allow-provider-fetch'].sort());
    });
});
