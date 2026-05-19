import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressDataUri } from '../src/utils.js';

describe('compressDataUri', () => {
  let mockCanvas;
  let mockCtx;
  let mockImage;

  beforeEach(() => {
    mockCtx = {
      drawImage: vi.fn(),
    };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,compressed'),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas;
      // For div elements (used by escapeHtml), return a real div
      return document._createElement
        ? document._createElement(tag)
        : Object.create(HTMLElement.prototype);
    });

    // Mock Image constructor
    mockImage = {};
    vi.stubGlobal(
      'Image',
      vi.fn().mockImplementation(() => {
        setTimeout(() => {
          mockImage.naturalWidth = 4000;
          mockImage.naturalHeight = 3000;
          if (mockImage.onload) mockImage.onload();
        }, 0);
        return mockImage;
      })
    );
  });

  it('resolves with compressed data URI', async () => {
    vi.useRealTimers();
    const result = await compressDataUri('data:image/png;base64,original');
    expect(result).toBe('data:image/jpeg;base64,compressed');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('scales down images larger than maxDim', async () => {
    vi.useRealTimers();
    // Image is 4000x3000, maxDim is 2048 (default)
    await compressDataUri('data:image/png;base64,large');
    // Width should be scaled to 2048, height proportionally: round(3000 * 2048/4000) = 1536
    expect(mockCanvas.width).toBe(2048);
    expect(mockCanvas.height).toBe(1536);
  });

  it('keeps dimensions for images within maxDim', async () => {
    vi.useRealTimers();
    vi.mocked(Image).mockImplementation(() => {
      const img = {};
      setTimeout(() => {
        img.naturalWidth = 800;
        img.naturalHeight = 600;
        if (img.onload) img.onload();
      }, 0);
      return img;
    });

    await compressDataUri('data:image/png;base64,small', 2048);
    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(600);
  });

  it('rejects on image load error', async () => {
    vi.useRealTimers();
    vi.mocked(Image).mockImplementation(() => {
      const img = {};
      setTimeout(() => {
        if (img.onerror) img.onerror();
      }, 0);
      return img;
    });

    await expect(compressDataUri('data:image/png;base64,bad')).rejects.toThrow(
      'Failed to decode image for compression'
    );
  });
});
