// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import configFn from '../vite.config.js';

const run = () => configFn({ mode: 'development', command: 'serve' });

describe('vite config nineguard proxy', () => {
  afterEach(() => { delete process.env.NINEGUARD_TARGET; });

  it('adds /nineguard proxy when NINEGUARD_TARGET set', () => {
    process.env.NINEGUARD_TARGET = 'http://example.invalid:1';
    const cfg = run();
    const p = cfg.server.proxy['/nineguard'];
    expect(p.target).toBe('http://example.invalid:1');
    expect(p.rewrite('/nineguard/v1/models')).toBe('/v1/models');
    expect(cfg.preview.proxy['/nineguard']).toBe(p);
  });

  it('omits proxy without env var', () => {
    delete process.env.NINEGUARD_TARGET;
    const cfg = run();
    expect(cfg.server.proxy?.['/nineguard']).toBeUndefined();
    expect(cfg.preview?.proxy?.['/nineguard']).toBeUndefined();
  });
});
