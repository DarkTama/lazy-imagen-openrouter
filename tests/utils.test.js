import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  sanitizeImageUrl,
  getImageExtension,
  approxKB,
  looksLikeRefusal,
  debounce,
} from '../src/utils.js';

describe('escapeHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes HTML entities', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toContain("'");
  });

  it('handles normal text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('simple text 123')).toBe('simple text 123');
  });

  it('prevents XSS injection', () => {
    const xss = "<script>alert('xss')</script>";
    const result = escapeHtml(xss);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('sanitizeImageUrl', () => {
  it('allows data:image URIs', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizeImageUrl(dataUri)).toBe(dataUri);
  });

  it('allows https URLs', () => {
    const url = 'https://example.com/image.png';
    expect(sanitizeImageUrl(url)).toBe(url);
  });

  it('blocks http URLs', () => {
    expect(sanitizeImageUrl('http://example.com/img.png')).toBe('');
  });

  it('blocks javascript: URLs', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBe('');
  });

  it('returns empty for empty/null', () => {
    expect(sanitizeImageUrl('')).toBe('');
    expect(sanitizeImageUrl(null)).toBe('');
    expect(sanitizeImageUrl(undefined)).toBe('');
  });

  it('escapes quotes in URLs', () => {
    const url = 'https://example.com/img"test.png';
    const result = sanitizeImageUrl(url);
    expect(result).not.toContain('"');
    expect(result).toContain('%22');
  });
});

describe('getImageExtension', () => {
  it('extracts from data URI mime type', () => {
    expect(getImageExtension('data:image/png;base64,abc')).toBe('png');
    expect(getImageExtension('data:image/webp;base64,abc')).toBe('webp');
    expect(getImageExtension('data:image/gif;base64,abc')).toBe('gif');
  });

  it('maps jpeg to jpg', () => {
    expect(getImageExtension('data:image/jpeg;base64,abc')).toBe('jpg');
  });

  it('extracts from URL path', () => {
    expect(getImageExtension('https://example.com/photo.png')).toBe('png');
    expect(getImageExtension('https://example.com/photo.webp?size=large')).toBe('webp');
    expect(getImageExtension('https://example.com/image.jpeg')).toBe('jpg');
  });

  it('defaults to png for unknown', () => {
    expect(getImageExtension('')).toBe('png');
    expect(getImageExtension(null)).toBe('png');
    expect(getImageExtension('https://example.com/file.xyz')).toBe('png');
  });
});

describe('approxKB', () => {
  it('calculates approximate KB from base64 string length', () => {
    // A 1024 character base64 string encodes ~768 bytes = ~0.75 KB
    const str = 'A'.repeat(1024);
    expect(approxKB(str)).toBe(1); // Math.round(1024 * 0.75 / 1024) = 1
  });

  it('handles larger strings', () => {
    // 10000 chars => Math.round(10000 * 0.75 / 1024) = Math.round(7.32) = 7
    const str = 'B'.repeat(10000);
    expect(approxKB(str)).toBe(7);
  });
});

describe('looksLikeRefusal', () => {
  it('detects "I cannot" opener', () => {
    expect(looksLikeRefusal("I cannot generate that image")).toBe(true);
    expect(looksLikeRefusal("I can't help with that")).toBe(true);
  });

  it('detects "content policy" phrase', () => {
    expect(looksLikeRefusal('This request violates our content policy guidelines')).toBe(true);
  });

  it('returns false for normal text', () => {
    expect(looksLikeRefusal('Here is your generated image description')).toBe(false);
    expect(looksLikeRefusal('The character has blue eyes and long hair')).toBe(false);
  });

  it('returns false for null/empty', () => {
    expect(looksLikeRefusal(null)).toBe(false);
    expect(looksLikeRefusal('')).toBe(false);
    expect(looksLikeRefusal(undefined)).toBe(false);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // reset
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
