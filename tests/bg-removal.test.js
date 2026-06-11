import { describe, it, expect } from 'vitest';
import {
  colorDist2,
  toleranceToThreshold2,
  localStepThreshold2,
  clusterBorderColors,
  detectBackgroundMask,
  dilateMaskIntoSimilar,
  chromaKeyMask,
  localRegionGrow,
  featherMask,
  stampCircle,
  strokeSegment,
  applyMaskAlpha,
  maskKeepFraction,
  MaskHistory,
} from '../src/bg-removal.js';

/**
 * Build an RGBA buffer (w*h*4) filled with a background color, then paint
 * rectangles of other colors on top. Alpha defaults to opaque.
 */
function makeImage(w, h, bg, rects = []) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = bg[3] ?? 255;
  }
  for (const { x0, y0, x1, y1, color } of rects) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = (y * w + x) * 4;
        data[o] = color[0];
        data[o + 1] = color[1];
        data[o + 2] = color[2];
        data[o + 3] = color[3] ?? 255;
      }
    }
  }
  return data;
}

describe('colorDist2', () => {
  it('is zero for identical colors and grows with difference', () => {
    expect(colorDist2(10, 20, 30, 10, 20, 30)).toBe(0);
    expect(colorDist2(0, 0, 0, 255, 255, 255)).toBe(3 * 255 * 255);
    expect(colorDist2(10, 0, 0, 0, 0, 0)).toBe(100);
  });
});

describe('toleranceToThreshold2', () => {
  it('maps 0 to 0 and clamps out-of-range input', () => {
    expect(toleranceToThreshold2(0)).toBe(0);
    expect(toleranceToThreshold2(-5)).toBe(0);
    expect(toleranceToThreshold2(150)).toBe(toleranceToThreshold2(100));
  });

  it('is monotonic', () => {
    expect(toleranceToThreshold2(30)).toBeGreaterThan(toleranceToThreshold2(10));
    expect(toleranceToThreshold2(80)).toBeGreaterThan(toleranceToThreshold2(30));
  });
});

describe('clusterBorderColors', () => {
  it('merges a uniform border into one cluster', () => {
    const data = makeImage(8, 8, [200, 200, 200]);
    const clusters = clusterBorderColors(data, 8, 8, toleranceToThreshold2(10));
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map(Math.round)).toEqual([200, 200, 200]);
  });

  it('finds distinct clusters for a two-tone border', () => {
    // Top half border white, bottom half border black
    const data = makeImage(8, 8, [255, 255, 255], [
      { x0: 0, y0: 4, x1: 7, y1: 7, color: [0, 0, 0] },
    ]);
    const clusters = clusterBorderColors(data, 8, 8, toleranceToThreshold2(10));
    expect(clusters.length).toBe(2);
  });

  it('caps the number of clusters at 16', () => {
    // 24x1 strip of 24 wildly different colors
    const w = 24;
    const data = new Uint8ClampedArray(w * 4);
    for (let x = 0; x < w; x++) {
      data[x * 4] = (x * 16) % 256;
      data[x * 4 + 1] = (x * 67) % 256;
      data[x * 4 + 2] = (x * 131) % 256;
      data[x * 4 + 3] = 255;
    }
    const clusters = clusterBorderColors(data, w, 1, 0);
    expect(clusters.length).toBeLessThanOrEqual(16);
  });

  it('returns integer centers (no running-average drift)', () => {
    const data = makeImage(8, 8, [100, 100, 100], [
      { x0: 0, y0: 0, x1: 0, y1: 0, color: [101, 100, 100] },
    ]);
    const clusters = clusterBorderColors(data, 8, 8, toleranceToThreshold2(10));
    for (const [r, g, b] of clusters) {
      expect(Number.isInteger(r)).toBe(true);
      expect(Number.isInteger(g)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
    }
  });
});

describe('detectBackgroundMask', () => {
  it('removes a solid background around a centered subject', () => {
    const data = makeImage(16, 16, [240, 240, 240], [
      { x0: 5, y0: 5, x1: 10, y1: 10, color: [10, 50, 90] },
    ]);
    const mask = detectBackgroundMask(data, 16, 16, 30);

    expect(mask[0]).toBe(0); // corner = background
    expect(mask[15]).toBe(0);
    expect(mask[8 * 16 + 8]).toBe(255); // subject center kept
    expect(mask[5 * 16 + 5]).toBe(255); // subject corner kept
  });

  it('preserves enclosed holes inside the subject (fill cannot jump)', () => {
    // A ring: background-colored pixels INSIDE the subject must stay kept
    const data = makeImage(16, 16, [240, 240, 240], [
      { x0: 3, y0: 3, x1: 12, y1: 12, color: [10, 50, 90] },
      { x0: 7, y0: 7, x1: 8, y1: 8, color: [240, 240, 240] }, // enclosed
    ]);
    const mask = detectBackgroundMask(data, 16, 16, 30);
    expect(mask[7 * 16 + 7]).toBe(255); // enclosed pixel preserved
    expect(mask[0]).toBe(0);
  });

  it('follows a gradient background via local continuity', () => {
    // Vertical gradient 200 → 232 (small per-row step), subject in middle
    const w = 16;
    const h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const v = 200 + y * 2;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    // Subject block, strongly different
    for (let y = 6; y <= 9; y++) {
      for (let x = 6; x <= 9; x++) {
        const o = (y * w + x) * 4;
        data[o] = 255;
        data[o + 1] = 0;
        data[o + 2] = 0;
      }
    }
    const mask = detectBackgroundMask(data, w, h, 25);
    expect(mask[0]).toBe(0);
    expect(mask[(h - 1) * w]).toBe(0);
    expect(mask[7 * w + 7]).toBe(255);
  });

  it('removes a perfectly uniform background at tolerance 0', () => {
    const data = makeImage(8, 8, [100, 100, 100]);
    const mask = detectBackgroundMask(data, 8, 8, 0);
    expect(mask[0]).toBe(0);
    expect(mask[4 * 8 + 4]).toBe(0);
  });

  it('keeps even slightly off-color pixels at tolerance 0', () => {
    const data = makeImage(8, 8, [100, 100, 100], [
      { x0: 0, y0: 0, x1: 0, y1: 0, color: [101, 100, 100] },
    ]);
    const mask = detectBackgroundMask(data, 8, 8, 0);
    // The off-by-one corner pixel survives exact-match flooding
    expect(mask[0]).toBe(255);
  });

  it('respects pre-existing alpha as the starting mask', () => {
    const data = makeImage(8, 8, [50, 50, 50], [
      { x0: 2, y0: 2, x1: 3, y1: 3, color: [50, 50, 50, 0] }, // already transparent
    ]);
    // Tolerance 0 keeps fill from spreading beyond uniform bg
    const mask = detectBackgroundMask(data, 8, 8, 0);
    expect(mask[2 * 8 + 2]).toBe(0);
  });

  it('still removes the background at tolerance 0 despite one off-color border pixel', () => {
    // Regression: running-average cluster drift used to make exact-match
    // seeding impossible (center 100.03 vs pixels at 100)
    const data = makeImage(8, 8, [100, 100, 100], [
      { x0: 0, y0: 0, x1: 0, y1: 0, color: [101, 100, 100] },
    ]);
    const mask = detectBackgroundMask(data, 8, 8, 0);
    expect(mask[4 * 8 + 4]).toBe(0); // uniform background actually removed
    expect(mask[0]).toBe(255); // the off-by-one pixel survives exact match
  });

  it('REGRESSION: pastel subject on a pastel gradient is not wiped (anti-aliased edges)', () => {
    // Models the user-reported failure: yellow→pink gradient background,
    // pale blue subject, 2px anti-aliased ring. The old algorithm walked
    // through the AA ramp and removed 100% of the image.
    const w = 32;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, r, g, b) => {
      const o = (y * w + x) * 4;
      data[o] = Math.round(r);
      data[o + 1] = Math.round(g);
      data[o + 2] = Math.round(b);
      data[o + 3] = 255;
    };
    const bgAt = (y) => {
      const t = y / (h - 1);
      return [250, 235 * (1 - t) + 180 * t, 170 * (1 - t) + 200 * t];
    };
    for (let y = 0; y < h; y++) {
      const [r, g, b] = bgAt(y);
      for (let x = 0; x < w; x++) set(x, y, r, g, b);
    }
    const subject = [170, 215, 240]; // pale blue
    for (let y = 9; y <= 22; y++) {
      for (let x = 9; x <= 22; x++) {
        const edge = Math.min(x - 9, 22 - x, y - 9, 22 - y);
        if (edge < 2) {
          // 2px AA ring: linear blend background → subject
          const [br, bgc, bb] = bgAt(y);
          const t = (edge + 1) / 3;
          set(x, y, br * (1 - t) + subject[0] * t, bgc * (1 - t) + subject[1] * t, bb * (1 - t) + subject[2] * t);
        } else {
          set(x, y, ...subject);
        }
      }
    }

    for (const tolerance of [26, 30]) {
      const mask = detectBackgroundMask(data, w, h, tolerance);
      expect(mask[0]).toBe(0); // corners removed
      expect(mask[(h - 1) * w + (w - 1)]).toBe(0);
      expect(mask[16 * w + 16]).toBe(255); // subject center kept
      // The solid 10x10 core must survive in full
      expect(maskKeepFraction(mask)).toBeGreaterThanOrEqual(100 / (w * h));
    }
  });

  it('REGRESSION: white background with outlined near-white subject is not wiped', () => {
    // Models the chibi failure: white bg, dark outline, near-white interior
    const w = 32;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, r, g, b) => {
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 255, 255, 255);
    for (let y = 8; y <= 23; y++) {
      for (let x = 8; x <= 23; x++) {
        const edge = Math.min(x - 8, 23 - x, y - 8, 23 - y);
        if (edge === 0) set(x, y, 147, 145, 150); // 1px AA blend white→outline
        else if (edge <= 2) set(x, y, 40, 35, 45); // dark outline
        else set(x, y, 248, 246, 250); // near-white interior
      }
    }
    const mask = detectBackgroundMask(data, w, h, 30);
    expect(mask[0]).toBe(0); // exterior removed
    expect(mask[16 * w + 16]).toBe(255); // near-white interior kept (outline blocks the fill)
    expect(mask[10 * w + 16]).toBe(255); // outline kept
  });

  it('dilation eats background-like halo pixels but keeps subject-like ones', () => {
    // Solid bg with a dark subject; AA pixels at 75% and 25% bg-blend
    const w = 16;
    const h = 16;
    const data = makeImage(w, h, [240, 240, 240], [
      { x0: 5, y0: 5, x1: 10, y1: 10, color: [10, 50, 90] },
      // Left column of the subject replaced by blends:
      { x0: 5, y0: 5, x1: 5, y1: 10, color: [183, 193, 203] }, // 75% bg
      { x0: 6, y0: 5, x1: 6, y1: 10, color: [68, 98, 128] }, // 25% bg
    ]);
    const mask = detectBackgroundMask(data, w, h, 30);
    expect(mask[7 * w + 5]).toBe(0); // 75% bg-blend removed by the halo pass
    expect(mask[7 * w + 6]).toBe(255); // 25% bg-blend kept (single pass, subject-like)
    expect(mask[7 * w + 8]).toBe(255); // subject core kept
  });
});

describe('dilateMaskIntoSimilar', () => {
  it('only removes kept pixels adjacent to removed ones and similar to a center', () => {
    const w = 4;
    const h = 1;
    // colors: [bg, bg-like, subject, subject]
    const data = Uint8ClampedArray.from([
      240, 240, 240, 255,
      230, 230, 230, 255,
      10, 10, 10, 255,
      10, 10, 10, 255,
    ]);
    const mask = Uint8Array.from([0, 255, 255, 255]);
    const removed = Uint8Array.from([1, 0, 0, 0]);
    const count = dilateMaskIntoSimilar(mask, removed, data, w, h, [[240, 240, 240]], toleranceToThreshold2(20));
    expect(count).toBe(1);
    expect(Array.from(mask)).toEqual([0, 0, 255, 255]); // single pass: no cascade
  });
});

describe('chromaKeyMask', () => {
  it('removes all key-colored pixels globally, including enclosed holes', () => {
    const w = 8;
    const h = 8;
    const data = makeImage(w, h, [30, 30, 30], [
      { x0: 0, y0: 0, x1: 7, y1: 0, color: [255, 0, 255] }, // magenta border row
      { x0: 3, y0: 3, x1: 4, y1: 4, color: [255, 0, 255] }, // ENCLOSED magenta hole
    ]);
    const mask = chromaKeyMask(data, w, h, [255, 0, 255], 28);
    expect(mask[0]).toBe(0); // border magenta removed
    expect(mask[3 * w + 3]).toBe(0); // enclosed hole removed too (no flood needed)
    expect(mask[6 * w + 6]).toBe(255); // subject kept
  });

  it('keeps colors outside tolerance (hot pink survives the magenta key)', () => {
    const data = makeImage(4, 4, [255, 105, 180]); // hot pink
    const mask = chromaKeyMask(data, 4, 4, [255, 0, 255], 28);
    expect(mask[0]).toBe(255);
  });

  it('is exact at tolerance 0 and respects existing alpha', () => {
    const data = makeImage(4, 4, [255, 0, 255], [
      { x0: 0, y0: 0, x1: 0, y1: 0, color: [254, 0, 255] },
      { x0: 1, y0: 0, x1: 1, y1: 0, color: [10, 10, 10, 77] },
    ]);
    const mask = chromaKeyMask(data, 4, 4, [255, 0, 255], 0);
    expect(mask[0]).toBe(255); // off-by-one survives exact match
    expect(mask[1]).toBe(77); // non-key pixel keeps its alpha
    expect(mask[5]).toBe(0); // exact magenta removed
  });
});

describe('localRegionGrow', () => {
  it('collects contiguous similar pixels within the radius', () => {
    const data = makeImage(16, 16, [0, 0, 0], [
      { x0: 0, y0: 0, x1: 15, y1: 3, color: [200, 200, 200] }, // band at top
    ]);
    const { indices, count } = localRegionGrow(data, 16, 16, 8, 1, 20, 3);
    expect(count).toBeGreaterThan(0);
    // All collected pixels lie within radius 3 of the seed
    for (const idx of indices) {
      const x = idx % 16;
      const y = Math.floor(idx / 16);
      expect((x - 8) ** 2 + (y - 1) ** 2).toBeLessThanOrEqual(9);
    }
  });

  it('does not cross into dissimilar colors', () => {
    const data = makeImage(16, 16, [0, 0, 0], [
      { x0: 0, y0: 0, x1: 15, y1: 3, color: [200, 200, 200] },
    ]);
    const { indices } = localRegionGrow(data, 16, 16, 8, 1, 20, 6);
    for (const idx of indices) {
      expect(Math.floor(idx / 16)).toBeLessThanOrEqual(3); // never into black rows
    }
  });

  it('returns empty for out-of-bounds seeds', () => {
    const data = makeImage(4, 4, [0, 0, 0]);
    expect(localRegionGrow(data, 4, 4, -1, 0, 50, 5).count).toBe(0);
    expect(localRegionGrow(data, 4, 4, 0, 99, 50, 5).count).toBe(0);
  });

  it('selects the whole contiguous region when no radius is given (magic wand)', () => {
    const data = makeImage(32, 32, [0, 0, 0], [
      { x0: 0, y0: 0, x1: 31, y1: 7, color: [200, 200, 200] }, // full-width band
    ]);
    const { count } = localRegionGrow(data, 32, 32, 16, 3, 20);
    expect(count).toBe(32 * 8); // entire band, no radius cap
  });

  it('does not bleed through a 2px anti-aliased ramp into a pastel subject', () => {
    // Pastel bg, pastel subject, AA ring — wand seeded on the background
    const w = 24;
    const h = 24;
    const data = makeImage(w, h, [250, 180, 200], [
      { x0: 8, y0: 8, x1: 17, y1: 17, color: [223, 192, 213] }, // blend 1/3
      { x0: 9, y0: 9, x1: 16, y1: 16, color: [197, 203, 227] }, // blend 2/3
      { x0: 10, y0: 10, x1: 15, y1: 15, color: [170, 215, 240] }, // pale blue subject
    ]);
    const { indices } = localRegionGrow(data, w, h, 1, 1, 30);
    const selected = new Set(indices);
    expect(selected.has(12 * w + 12)).toBe(false); // subject core not selected
    expect(selected.has(0)).toBe(true); // background is
  });
});

describe('featherMask', () => {
  it('radius 0 returns an identical copy', () => {
    const mask = Uint8Array.from([0, 255, 255, 0]);
    const out = featherMask(mask, 2, 2, 0);
    expect(Array.from(out)).toEqual([0, 255, 255, 0]);
    expect(out).not.toBe(mask);
  });

  it('softens edges but keeps deep interior and exterior untouched', () => {
    const w = 16;
    const h = 16;
    const mask = new Uint8Array(w * h);
    for (let y = 4; y <= 11; y++) {
      for (let x = 4; x <= 11; x++) mask[y * w + x] = 255;
    }
    const out = featherMask(mask, w, h, 2);
    expect(out[8 * w + 8]).toBe(255); // deep inside
    expect(out[0]).toBe(0); // far outside
    const edge = out[4 * w + 4]; // corner of the square
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('does not mutate the input mask', () => {
    const mask = new Uint8Array(64).fill(255);
    mask[0] = 0;
    const before = Uint8Array.from(mask);
    featherMask(mask, 8, 8, 3);
    expect(Array.from(mask)).toEqual(Array.from(before));
  });
});

describe('stampCircle', () => {
  it('paints a filled circle', () => {
    const mask = new Uint8Array(16 * 16).fill(255);
    stampCircle(mask, 16, 16, 8, 8, 3, 0);
    expect(mask[8 * 16 + 8]).toBe(0); // center
    expect(mask[8 * 16 + 5]).toBe(0); // radius edge
    expect(mask[0]).toBe(255); // far corner untouched
  });

  it('clamps at image borders without throwing', () => {
    const mask = new Uint8Array(8 * 8).fill(255);
    stampCircle(mask, 8, 8, 0, 0, 5, 0);
    stampCircle(mask, 8, 8, 7, 7, 5, 0);
    expect(mask[0]).toBe(0);
    expect(mask[63]).toBe(0);
  });
});

describe('strokeSegment', () => {
  it('leaves no gaps between distant points', () => {
    const w = 64;
    const mask = new Uint8Array(w * w).fill(255);
    strokeSegment(mask, w, w, 2, 2, 60, 60, 2, 0);
    // Every point along the diagonal should be painted
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = Math.round(2 + 58 * t);
      const y = Math.round(2 + 58 * t);
      expect(mask[y * w + x]).toBe(0);
    }
  });

  it('handles zero-length strokes (a click)', () => {
    const mask = new Uint8Array(8 * 8).fill(255);
    strokeSegment(mask, 8, 8, 4, 4, 4, 4, 1, 0);
    expect(mask[4 * 8 + 4]).toBe(0);
  });
});

describe('applyMaskAlpha', () => {
  it('copies RGB and writes mask into alpha', () => {
    const src = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255]);
    const mask = Uint8Array.from([0, 128]);
    const out = new Uint8ClampedArray(8);
    applyMaskAlpha(src, mask, out);
    expect(Array.from(out)).toEqual([10, 20, 30, 0, 40, 50, 60, 128]);
  });
});

describe('maskKeepFraction', () => {
  it('returns 1 for an all-keep mask and 0 for an all-removed mask', () => {
    expect(maskKeepFraction(new Uint8Array(16).fill(255))).toBe(1);
    expect(maskKeepFraction(new Uint8Array(16).fill(0))).toBe(0);
  });

  it('counts feathered values >= 128 as kept', () => {
    const mask = Uint8Array.from([255, 200, 128, 127, 50, 0, 0, 0]);
    expect(maskKeepFraction(mask)).toBe(3 / 8);
  });

  it('treats empty/missing masks as fully kept', () => {
    expect(maskKeepFraction(new Uint8Array(0))).toBe(1);
    expect(maskKeepFraction(null)).toBe(1);
  });
});

describe('MaskHistory', () => {
  it('round-trips undo and redo', () => {
    const h = new MaskHistory();
    const v1 = Uint8Array.from([1, 1]);
    const v2 = Uint8Array.from([2, 2]);

    h.push(v1); // about to change v1 → v2
    expect(h.canUndo).toBe(true);

    const undone = h.undo(v2);
    expect(Array.from(undone)).toEqual([1, 1]);
    expect(h.canRedo).toBe(true);

    const redone = h.redo(undone);
    expect(Array.from(redone)).toEqual([2, 2]);
  });

  it('push clears the redo branch', () => {
    const h = new MaskHistory();
    h.push(Uint8Array.from([1]));
    h.undo(Uint8Array.from([2]));
    expect(h.canRedo).toBe(true);
    h.push(Uint8Array.from([3]));
    expect(h.canRedo).toBe(false);
  });

  it('caps stored snapshots', () => {
    const h = new MaskHistory(3);
    for (let i = 0; i < 10; i++) h.push(Uint8Array.from([i]));
    let count = 0;
    let current = Uint8Array.from([99]);
    while (h.canUndo) {
      current = h.undo(current);
      count++;
    }
    expect(count).toBe(3);
    expect(Array.from(current)).toEqual([7]); // oldest kept snapshot
  });

  it('stores copies, not references', () => {
    const h = new MaskHistory();
    const mask = Uint8Array.from([5]);
    h.push(mask);
    mask[0] = 42;
    expect(Array.from(h.undo(mask))).toEqual([5]);
  });
});
