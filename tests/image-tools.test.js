import { describe, it, expect } from 'vitest';
import { buildDerivedRecord, reduceRatio } from '../src/image-tools.js';
import { isValidImageRecord } from '../src/export-import.js';

const PNG_URI = 'data:image/png;base64,iVBORw0KGgo=';

describe('reduceRatio', () => {
  it('reduces clean ratios', () => {
    expect(reduceRatio(1024, 1024)).toBe('1:1');
    expect(reduceRatio(1920, 1080)).toBe('16:9');
    expect(reduceRatio(1080, 1920)).toBe('9:16');
    expect(reduceRatio(1536, 1024)).toBe('3:2');
  });

  it('falls back to decimal form for ugly reductions', () => {
    expect(reduceRatio(1023, 683)).toBe('1.50:1');
    expect(reduceRatio(683, 1023)).toBe('1:1.50');
  });

  it('handles degenerate input', () => {
    expect(reduceRatio(0, 100)).toBe('1:1');
    expect(reduceRatio(100, 0)).toBe('1:1');
  });
});

describe('buildDerivedRecord', () => {
  const orig = {
    id: 12345,
    url: PNG_URI,
    prompt: 'a red fox',
    model: 'google/gemini-2.5-flash-image',
    modelName: 'Gemini 2.5 Flash Image',
    size: '1024x1024',
    quality: '1K',
    aspectRatio: '1:1',
    references: [],
    mode: 'manual',
    orchestratorSnapshot: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('derives from a gallery record with a prompt suffix', () => {
    const record = buildDerivedRecord(orig, { width: 2048, height: 2048, dataUri: PNG_URI }, '(upscaled 2x)');
    expect(record.prompt).toBe('a red fox (upscaled 2x)');
    expect(record.model).toBe('local/image-tools');
    expect(record.modelName).toBe('Image Tools');
    expect(record.size).toBe('2048x2048');
    expect(record.quality).toBe('1K');
    expect(record.aspectRatio).toBe('1:1');
    expect(record.derivedFrom).toBe(12345);
    expect(record.mode).toBe('manual');
    expect(record.references).toEqual([]);
  });

  it('builds standalone records for uploaded images', () => {
    const record = buildDerivedRecord(null, { width: 800, height: 600, dataUri: PNG_URI }, '(background removed)');
    expect(record.prompt).toBe('Uploaded image (background removed)');
    expect(record.quality).toBe('N/A');
    expect(record.aspectRatio).toBe('4:3');
    expect(record.derivedFrom).toBeNull();
  });

  it('produces records that pass export/import validation', () => {
    const derived = buildDerivedRecord(orig, { width: 2048, height: 2048, dataUri: PNG_URI }, '(upscaled 2x)');
    const standalone = buildDerivedRecord(null, { width: 64, height: 64, dataUri: PNG_URI }, '(background removed)');
    expect(isValidImageRecord(derived)).toBe(true);
    expect(isValidImageRecord(standalone)).toBe(true);
  });

  it('generates unique ids and fresh timestamps', () => {
    const a = buildDerivedRecord(null, { width: 1, height: 1, dataUri: PNG_URI }, 'x');
    const b = buildDerivedRecord(null, { width: 1, height: 1, dataUri: PNG_URI }, 'x');
    expect(a.id).not.toBe(b.id);
    expect(new Date(a.createdAt).getTime()).toBeGreaterThan(0);
  });
});
