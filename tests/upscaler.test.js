import { describe, it, expect } from 'vitest';
import {
  computeTargetDims,
  isScaleAllowed,
  formatDims,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
} from '../src/upscaler.js';

describe('computeTargetDims', () => {
  it('multiplies and rounds dimensions', () => {
    expect(computeTargetDims(1024, 1024, 2)).toEqual({ w: 2048, h: 2048, mp: 4.194304 });
    expect(computeTargetDims(333, 500, 3).w).toBe(999);
  });

  it('rounds non-integer results', () => {
    const { w, h } = computeTargetDims(101, 101, 2.5);
    expect(w).toBe(253);
    expect(h).toBe(253);
  });
});

describe('isScaleAllowed', () => {
  it('allows 2x of a 2048px image', () => {
    expect(isScaleAllowed(2048, 2048, 2).allowed).toBe(true);
  });

  it('blocks 4x of a 2048px image (exceeds per-side limit)', () => {
    const result = isScaleAllowed(2048, 2048, 4);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(String(MAX_OUTPUT_SIDE));
  });

  it('blocks outputs above the megapixel cap', () => {
    // 6000x5000 → 2x = 12000x10000: per-side limit triggers first,
    // so use a wide flat image: 8000x4200 → 2x = 16000x8400 (side), and
    // 8000x4200 at 1x... craft a pure-MP violation: 8192x4100 → 1x fits sides
    // Use 5000x7000 → 1.1x: 5500x7700 = 42.3 MP > 32 MP, sides under 8192.
    const result = isScaleAllowed(5000, 7000, 1.1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('MP');
  });

  it('reports per-side violations with the offending dimensions', () => {
    const result = isScaleAllowed(4097, 100, 2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('8194');
  });

  it('exposes consistent caps', () => {
    expect(MAX_OUTPUT_PIXELS).toBe(33554432);
    expect(MAX_OUTPUT_SIDE).toBe(8192);
  });
});

describe('formatDims', () => {
  it('formats megapixels with one decimal below 10 MP', () => {
    expect(formatDims(1024, 1024)).toBe('1024×1024 · 1.0 MP');
  });

  it('rounds megapixels at 10 MP and above', () => {
    expect(formatDims(4096, 4096)).toBe('4096×4096 · 17 MP');
  });
});
