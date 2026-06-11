import { describe, it, expect } from 'vitest';
import { assemblePrompt, isVisionCacheValid } from '../src/orchestrator.js';

describe('isVisionCacheValid', () => {
  const cache = { srcFp: 'src1', refFp: 'ref1', model: 'google/gemini-2.5-flash', analysis: { source_char: 'x' } };

  it('matches when fingerprints and model agree', () => {
    expect(isVisionCacheValid(cache, 'src1', 'ref1', 'google/gemini-2.5-flash')).toBe(true);
  });

  it('rejects when either image changed', () => {
    expect(isVisionCacheValid(cache, 'src2', 'ref1', 'google/gemini-2.5-flash')).toBe(false);
    expect(isVisionCacheValid(cache, 'src1', 'ref2', 'google/gemini-2.5-flash')).toBe(false);
  });

  it('rejects when the vision model changed', () => {
    expect(isVisionCacheValid(cache, 'src1', 'ref1', 'openai/gpt-4o')).toBe(false);
  });

  it('rejects missing or analysis-less caches', () => {
    expect(isVisionCacheValid(null, 'src1', 'ref1', 'm')).toBe(false);
    expect(isVisionCacheValid({ srcFp: 'src1', refFp: 'ref1', model: 'm' }, 'src1', 'ref1', 'm')).toBe(false);
  });
});

describe('assemblePrompt', () => {
  const mockVision = {
    source_char: 'young woman with blue eyes',
    source_clothing: 'white t-shirt and jeans',
    source_pose: 'standing, arms crossed',
    source_background: 'city street',
    source_style: 'photorealistic',
    source_expression: 'smiling',
    source_hair: 'long blonde hair',
    source_lighting: 'natural daylight',
    source_palette: 'warm tones',
    source_accessories: 'silver necklace',
    source_camera: 'medium shot, eye level',
    ref_clothing: 'red evening gown',
    ref_pose: 'sitting on chair',
    ref_background: 'elegant ballroom',
    ref_style: 'oil painting',
    ref_expression: 'serious',
    ref_hair: 'short black hair',
    ref_lighting: 'dramatic side light',
    ref_palette: 'dark moody tones',
    ref_accessories: 'diamond earrings',
    ref_camera: 'close-up portrait',
  };

  const baseParams = {
    transfers: {
      clothing: false,
      pose: false,
      background: false,
      expression: false,
      hair: false,
      lighting: false,
      palette: false,
      accessories: false,
      camera: false,
    },
    artStyle: 'source',
    identityLock: 'high',
    creativity: 30,
    subjectContext: '',
    notes: '',
  };

  it('keeps all from source when no transfers', () => {
    const result = assemblePrompt(mockVision, baseParams);
    expect(result).toContain('KEEP these unchanged from IMAGE 1');
    expect(result).toContain('white t-shirt and jeans');
    expect(result).toContain('standing, arms crossed');
    expect(result).toContain('city street');
    expect(result).not.toContain('CHANGE these to match IMAGE 2');
  });

  it('changes selected attributes to reference', () => {
    const params = {
      ...baseParams,
      transfers: { ...baseParams.transfers, clothing: true, background: true },
    };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('CHANGE these to match IMAGE 2');
    expect(result).toContain('red evening gown');
    expect(result).toContain('elegant ballroom');
    // Source attributes remain in KEEP
    expect(result).toContain('standing, arms crossed');
  });

  it('uses reference art style when selected', () => {
    const params = { ...baseParams, artStyle: 'reference' };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('Art style: oil painting');
  });

  it('uses blend art style', () => {
    const params = { ...baseParams, artStyle: 'blend' };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain("a blend of Image 1's style (photorealistic) and Image 2's style (oil painting)");
  });

  it('includes identity lock clause', () => {
    const params = { ...baseParams, identityLock: 'max' };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('maintain 100% facial identity from Image 1');
  });

  it('adds creativity clause for high creativity', () => {
    const params = { ...baseParams, creativity: 75 };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('creatively reinterpret');
  });

  it('adds strict clause for low creativity', () => {
    const params = { ...baseParams, creativity: 10 };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('Stay strictly faithful');
  });

  it('includes subject context when provided', () => {
    const params = { ...baseParams, subjectContext: 'Character from anime series X' };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('Subject context: Character from anime series X');
  });

  it('includes notes when provided', () => {
    const params = { ...baseParams, notes: 'Make the lighting more dramatic' };
    const result = assemblePrompt(mockVision, params);
    expect(result).toContain('Additional notes: Make the lighting more dramatic');
  });
});
