import { describe, it, expect } from 'vitest';
import { classifyError } from '../src/orchestrator.js';
import { extractImageFromMessage } from '../src/api.js';

describe('extractImageFromMessage', () => {
  it('reads message.images with image_url shape', () => {
    expect(extractImageFromMessage({
      images: [{ image_url: { url: 'data:image/png;base64,AAA' } }],
    })).toBe('data:image/png;base64,AAA');
  });

  it('reads bare-string and b64_json image shapes', () => {
    expect(extractImageFromMessage({ images: ['https://x.test/i.png'] })).toBe('https://x.test/i.png');
    expect(extractImageFromMessage({ images: ['QUJD'] })).toBe('data:image/png;base64,QUJD');
    expect(extractImageFromMessage({ images: [{ b64_json: 'QUJD' }] })).toBe('data:image/png;base64,QUJD');
  });

  it('reads content-array shapes (image_url, inlineData, image)', () => {
    expect(extractImageFromMessage({
      content: [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,BBB' } }],
    })).toBe('data:image/png;base64,BBB');
    expect(extractImageFromMessage({
      content: [{ inlineData: { data: 'QUJD', mimeType: 'image/webp' } }],
    })).toBe('data:image/webp;base64,QUJD');
    expect(extractImageFromMessage({
      content: [{ type: 'image', image: 'QUJD' }],
    })).toBe('data:image/png;base64,QUJD');
  });

  it('reads a bare data-URI string content', () => {
    expect(extractImageFromMessage({ content: 'data:image/png;base64,CCC' })).toBe('data:image/png;base64,CCC');
  });

  it('returns null when there is no image', () => {
    expect(extractImageFromMessage(null)).toBeNull();
    expect(extractImageFromMessage({ content: 'just text' })).toBeNull();
    expect(extractImageFromMessage({ content: [{ type: 'text', text: 'nope' }] })).toBeNull();
  });
});

describe('classifyError', () => {
  it('classifies network errors', () => {
    const result = classifyError({ kind: 'network', stage: 'vision' });
    expect(result.title).toBe("Couldn't reach OpenRouter");
    expect(result.suggestion).toContain('internet connection');
  });

  it('classifies 401 as API key rejected', () => {
    const result = classifyError({ status: 401, stage: 'vision' });
    expect(result.title).toBe('API key rejected');
    expect(result.suggestion).toContain('key');
  });

  it('classifies 402 as insufficient credits', () => {
    const result = classifyError({ status: 402, stage: 'generation' });
    expect(result.title).toBe('Insufficient credits');
    expect(result.suggestion).toContain('credits');
  });

  it('classifies 404 as model not available', () => {
    const result = classifyError({ status: 404, modelId: 'test/model', stage: 'vision' });
    expect(result.title).toBe('Model not available');
    expect(result.body).toContain('"test/model"');
  });

  it('classifies 429 as rate limit', () => {
    const result = classifyError({ status: 429, stage: 'generation' });
    expect(result.title).toBe('Rate limit hit');
    expect(result.suggestion).toContain('Wait');
  });

  it('classifies refusal errors for vision stage', () => {
    const result = classifyError({ kind: 'refusal', stage: 'vision', modelId: 'gpt-4o' });
    expect(result.title).toBe('Vision model refused the image');
    expect(result.suggestion).toContain('Qwen2.5-VL');
  });

  it('classifies refusal errors for generation stage', () => {
    const result = classifyError({ kind: 'refusal', stage: 'generation', modelId: 'gemini' });
    expect(result.title).toBe('Generation model refused the prompt');
    expect(result.suggestion).toContain('GPT-5.4 Image 2');
  });

  it('classifies parse errors', () => {
    const result = classifyError({ kind: 'parse', stage: 'vision' });
    expect(result.title).toContain('valid JSON');
    expect(result.suggestion).toContain('Qwen2.5-VL');
  });

  it('classifies no-image errors', () => {
    const result = classifyError({ kind: 'no-image', stage: 'generation' });
    expect(result.title).toBe('Generation produced no image');
    expect(result.suggestion).toContain('different generation model');
  });

  it('classifies 5xx server errors', () => {
    const result = classifyError({ status: 502, stage: 'vision' });
    expect(result.title).toBe('OpenRouter server error');
    expect(result.body).toContain('502');
  });

  it('has fallback for unknown errors', () => {
    const result = classifyError({ message: 'Something weird', stage: 'vision' });
    expect(result.title).toBe('Something went wrong');
    expect(result.body).toContain('Something weird');
  });
});

describe('custom provider api execution & connection test', () => {
  it('testProviderConnection handles success and failure', async () => {
    const { testProviderConnection } = await import('../src/api.js');
    const { saveCustomProvider } = await import('../src/providers.js');

    const custom = saveCustomProvider({
      name: 'Mock Ollama',
      base: 'http://localhost:11434/v1',
      capabilities: { imageGen: true, chatVision: true }
    });

    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] })
      });
      const resOk = await testProviderConnection(custom.id);
      expect(resOk.ok).toBe(true);

      global.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      });
      const resErr = await testProviderConnection(custom.id);
      expect(resErr.ok).toBe(false);
      expect(resErr.error).toContain('401');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('generateSingleImage dispatches to custom images endpoint and reads b64_json or url', async () => {
    const { generateSingleImage } = await import('../src/api.js');
    const { saveCustomProvider } = await import('../src/providers.js');
    const { state } = await import('../src/state.js');

    const custom = saveCustomProvider({
      name: 'Custom Image Gen',
      base: 'https://api.custom.com/v1',
      capabilities: { imageGen: true, chatVision: false },
      imageStrategy: 'images-endpoint'
    });

    state.generationProvider = custom.id;
    state.selectedModel = 'model-xyz';
    state.autoRetryEnabled = false;

    const originalFetch = global.fetch;
    try {
      global.fetch = async (url, opts) => {
        expect(url).toBe('https://api.custom.com/v1/images/generations');
        const body = JSON.parse(opts.body);
        expect(body.model).toBe('model-xyz');
        return {
          ok: true,
          json: async () => ({ data: [{ b64_json: 'QUJDREVGRw==' }] })
        };
      };

      const resultB64 = await generateSingleImage('a cute puppy');
      expect(resultB64).toBe('data:image/png;base64,QUJDREVGRw==');

      global.fetch = async () => ({
        ok: true,
        json: async () => ({ data: [{ url: 'https://cdn.custom.com/img.png' }] })
      });

      const resultUrl = await generateSingleImage('a landscape');
      expect(resultUrl).toBe('https://cdn.custom.com/img.png');
    } finally {
      global.fetch = originalFetch;
      state.generationProvider = 'openrouter';
      state.selectedModel = 'google/gemini-2.5-flash-image';
    }
  });
});

