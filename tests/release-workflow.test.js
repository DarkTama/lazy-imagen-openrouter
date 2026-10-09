// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

let yaml = null;
try { yaml = (await import('js-yaml')).default; } catch { /* text assertions only */ }

describe('release workflow (text)', () => {
    it('triggers on v* tags and manual dispatch', () => {
        expect(text).toMatch(/tags:\s*\n\s*-\s*'v\*'/);
        expect(text).toContain('workflow_dispatch');
    });
    it('has contents: write and non-cancelling concurrency', () => {
        expect(text).toMatch(/permissions:\s*\n\s*contents: write/);
        expect(text).toContain('group: release-${{ github.ref }}');
        expect(text).toContain('cancel-in-progress: false');
    });
    it('verifies tag against package.json version', () => {
        expect(text).toContain('verify-version:');
        expect(text).toContain("require('./package.json').version");
        expect(text).toContain('${GITHUB_REF_NAME#v}');
    });
    it('matrixes three platforms', () => {
        for (const p of ['windows-latest', 'macos-latest', 'ubuntu-22.04']) expect(text).toContain(p);
    });
    it('uses npm, node 22, rust, cache', () => {
        expect(text).toContain('npm ci');
        expect(text).toContain('actions/setup-node@v4');
        expect(text).toContain('node-version: 22');
        expect(text).toContain('dtolnay/rust-toolchain@stable');
        expect(text).toContain('swatinem/rust-cache@v2');
        expect(text).not.toMatch(/setup-bun|bun install/);
    });
    it('publishes a draft release via tauri-action', () => {
        expect(text).toContain('tauri-apps/tauri-action@v0');
        expect(text).toContain('tagName: ${{ github.ref_name }}');
        expect(text).toContain("releaseName: 'Lazy Imagen ${{ github.ref_name }}'");
        expect(text).toContain('releaseDraft: true');
        expect(text).toContain('prerelease: false');
    });
    it('has no updater signing', () => {
        expect(text).not.toContain('TAURI_SIGNING');
    });
});

describe.skipIf(!yaml)('release workflow (parsed)', () => {
    it('parses with expected structure', () => {
        const wf = yaml.load(text);
        expect(wf.permissions.contents).toBe('write');
        expect(wf.on.push.tags).toEqual(['v*']);
        expect(wf.jobs.build.needs).toBe('verify-version');
        const plats = wf.jobs.build.strategy.matrix.include.map(i => i.platform);
        expect(plats).toEqual(['windows-latest', 'macos-latest', 'ubuntu-22.04']);
    });
});
