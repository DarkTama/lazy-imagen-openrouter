// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Provider modal DOM and style structure', () => {
  let html;
  let css;

  beforeEach(() => {
    html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf-8');
  });

  it('contains modal-content and standard modal-close inside providerModal', () => {
    expect(html).toContain('id="providerModal"');
    expect(html).toContain('class="modal-content provider-modal-dialog"');
    expect(html).toContain('class="modal-close" id="providerModalClose"');
  });

  it('defines styles for provider-modal-dialog with background and z-index', () => {
    expect(css).toMatch(/\.provider-modal-dialog\s*\{[^}]*background:\s*var\(--bg-secondary\)/);
    expect(css).toMatch(/\.provider-modal-dialog\s*\{[^}]*z-index:\s*10/);
  });
});

describe('NineGuard template markup', () => {
  it('has template button, notice and aspect hint', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    expect(html).toContain('id="providerTemplateNineguard"');
    expect(html).toContain('id="providerTemplateNotice"');
    expect(html).toContain('id="aspectRatioHint"');
    expect(html).toContain('1:1 only for this provider');
  });
});
