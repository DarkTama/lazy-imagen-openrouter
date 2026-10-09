import { describe, it, expect, beforeEach } from 'vitest';
import { applyAspectSupport } from '../src/ui.js';
import { state } from '../src/state.js';

describe('applyAspectSupport', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `<button class="btn-aspect active" data-ratio="1:1"></button><button class="btn-aspect" data-ratio="16:9"></button><small id="aspectRatioHint" hidden></small>`;
        state.aspectRatio = '16:9';
        localStorage.setItem('imagen_aspect_ratio', '16:9');
    });

    it('locks to 1:1 without overwriting saved ratio', () => {
        expect(applyAspectSupport({ supportsAspectRatio: false })).toBe(true);
        expect([...document.querySelectorAll('.btn-aspect')].every(b => b.disabled)).toBe(true);
        expect(state.aspectRatio).toBe('1:1');
        expect(localStorage.getItem('imagen_aspect_ratio')).toBe('16:9');
        expect(document.querySelector('.btn-aspect.active').dataset.ratio).toBe('1:1');
        expect(document.getElementById('aspectRatioHint').hidden).toBe(false);
    });

    it('restores saved ratio and active button on unlock', () => {
        applyAspectSupport({ supportsAspectRatio: false });
        applyAspectSupport({ supportsAspectRatio: true });
        expect([...document.querySelectorAll('.btn-aspect')].some(b => b.disabled)).toBe(false);
        expect(state.aspectRatio).toBe('16:9');
        expect(document.querySelector('.btn-aspect.active').dataset.ratio).toBe('16:9');
        expect(document.getElementById('aspectRatioHint').hidden).toBe(true);
    });

    it('defaults to 1:1 when nothing saved', () => {
        localStorage.clear();
        applyAspectSupport({ supportsAspectRatio: true });
        expect(state.aspectRatio).toBe('1:1');
    });
});
