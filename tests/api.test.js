import { describe, it, expect } from 'vitest';
import { classifyError } from '../src/orchestrator.js';
import { extractImageFromMessage, runVisionAnalysis } from '../src/api.js';

describe('extractImageFromMessage', () => {
  it('reads a markdown data-URI image in string content', () => {
    const m = { content: '\n![image](data:image/jpeg;base64,/9j/AAA=)' };
    expect(extractImageFromMessage(m)).toBe('data:image/jpeg;base64,/9j/AAA=');
  });
  it('reads a markdown https image in string content', () => {
    expect(extractImageFromMessage({ content: 'Here: ![x](https://cdn.example/a.png) done' })).toBe('https://cdn.example/a.png');
  });
  it('reads markdown image inside a text part of array content', () => {
    expect(extractImageFromMessage({ content: [{ type: 'text', text: '![i](data:image/png;base64,QQ==)' }] })).toBe('data:image/png;base64,QQ==');
  });
  it('ignores non-image markdown links', () => {
    expect(extractImageFromMessage({ content: '[docs](https://x.y)' })).toBeNull();
  });
  it('handles multi-MB base64 quickly', () => {
    const big = 'A'.repeat(5000000);
    const t0 = Date.now();
    expect(extractImageFromMessage({ content: `![image](data:image/png;base64,${big})` })).toContain(big.slice(0, 10));
    expect(Date.now() - t0).toBeLessThan(1000);
  });
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


describe('VISION_SYSTEM_PROMPT (garment description)', () => {
  it('asks for garment-centric clothing descriptions', async () => {
    const { VISION_SYSTEM_PROMPT } = await import('../src/api.js');
    expect(VISION_SYSTEM_PROMPT).toMatch(/garment/i);
    expect(VISION_SYSTEM_PROMPT).toMatch(/neckline/i);
  });
  it('no longer uses body-part wording in its example', async () => {
    const { VISION_SYSTEM_PROMPT } = await import('../src/api.js');
    expect(VISION_SYSTEM_PROMPT).not.toMatch(/thigh/i);
  });
  it('caps field length at 25 words', async () => {
    const { VISION_SYSTEM_PROMPT } = await import('../src/api.js');
    expect(VISION_SYSTEM_PROMPT).toMatch(/25 words/);
  });
  it('still lists all 21 keys', async () => {
    const { VISION_SYSTEM_PROMPT } = await import('../src/api.js');
    expect(VISION_SYSTEM_PROMPT.match(/^\s{2}(source|ref)_\w+/gm)).toHaveLength(21);
  });
});

describe('ANALYSIS_VERSION', () => {
  it('is exported as a non-empty string', async () => {
    const { ANALYSIS_VERSION } = await import('../src/state.js');
    expect(typeof ANALYSIS_VERSION).toBe('string');
    expect(ANALYSIS_VERSION.length).toBeGreaterThan(0);
  });
});

describe('runVisionAnalysis compression', () => {
  const okJson = (x) => ({ ok: true, json: async () => x });
  const run = async (compress) => {
    let body;
    const originalFetch = global.fetch;
    try {
      global.fetch = async (_u, init) => { body = JSON.parse(init.body); return okJson({ choices: [{ message: { content: '{}' } }] }); };
      await runVisionAnalysis('data:image/png;base64,A', 'data:image/png;base64,B', 'm', 'openrouter', { compress }).catch(() => {});
    } finally {
      global.fetch = originalFetch;
    }
    return body;
  };

  it('downscales both images before sending to vision', async () => {
    const calls = [];
    const compress = async (uri, max, q) => { calls.push([max, q]); return 'data:image/jpeg;base64,SMALL'; };
    const body = await run(compress);
    expect(calls).toEqual([[1024, 0.8], [1024, 0.8]]);
    const imgs = body.messages[1].content.filter(p => p.type === 'image_url');
    expect(imgs.every(p => p.image_url.url.endsWith('SMALL') && p.image_url.detail === 'auto')).toBe(true);
    expect(body.stream).toBe(false);
  });

  it('falls back to original image if compression throws', async () => {
    const compress = async () => { throw new Error('no canvas'); };
    const body = await run(compress);
    const urls = body.messages[1].content.filter(p => p.type === 'image_url').map(p => p.image_url.url);
    expect(urls).toEqual(['data:image/png;base64,A', 'data:image/png;base64,B']);
  });
});

describe('provider image capabilities', () => {
  async function runChat(provCfg, modelId, modelConfig, providerId) {
    const { generateSingleImage } = await import('../src/api.js');
    const { saveCustomProvider } = await import('../src/providers.js');
    const { state } = await import('../src/state.js');
    if (provCfg) providerId = saveCustomProvider({ name: 'Chat P', base: 'https://c.example/v1', imageStrategy: 'chat-modalities', ...provCfg }).id;
    state.generationProvider = providerId;
    state.selectedModel = modelId;
    state.aspectRatio = '16:9';
    state.imageQuality = '2K';
    state.autoRetryEnabled = false;
    state.references = [];
    let body;
    const originalFetch = global.fetch;
    try {
      global.fetch = async (url, opts) => {
        body = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,QUJD' } }] } }] }) };
      };
      await generateSingleImage('p', modelConfig);
    } finally {
      global.fetch = originalFetch;
    }
    return body;
  }

  it('custom gemini style sets image_config.aspect_ratio', async () => {
    const b = await runChat({ imageConfigStyle: 'gemini' }, 'foo/bar', { supportsImageSize: false });
    expect(b.image_config).toEqual({ aspect_ratio: '16:9' });
    expect(b.aspect_ratio).toBeUndefined();
  });
  it('custom flat style sets top-level aspect_ratio', async () => {
    const b = await runChat({ imageConfigStyle: 'flat' }, 'foo/bar', {});
    expect(b.aspect_ratio).toBe('16:9');
    expect(b.image_config).toBeUndefined();
  });
  it('custom supportsAspectRatio false sends neither', async () => {
    const b = await runChat({ imageConfigStyle: 'gemini', supportsAspectRatio: false }, 'foo/bar', {});
    expect(b.aspect_ratio).toBeUndefined();
    expect(b.image_config).toBeUndefined();
  });
  it('openrouter gemini unchanged', async () => {
    const b = await runChat(null, 'google/gemini-2.5-flash-image', { supportsImageSize: true }, 'openrouter');
    expect(b.image_config).toEqual({ image_size: '2k', aspect_ratio: '16:9' });
    expect(b.aspect_ratio).toBeUndefined();
  });
  it('openrouter non-gemini uses top-level aspect_ratio', async () => {
    const b = await runChat(null, 'openai/gpt-x', { supportsAspectRatio: true }, 'openrouter');
    expect(b.aspect_ratio).toBe('16:9');
  });

  it('fetchProviderModels merges knownModels and writes MODEL_CONFIGS', async () => {
    const { fetchProviderModels } = await import('../src/api.js');
    const { saveCustomProvider } = await import('../src/providers.js');
    const { MODEL_CONFIGS } = await import('../src/state.js');
    const c = saveCustomProvider({
      name: 'Known', base: 'https://k.example/v1',
      knownModels: [{ id: 'm-img', name: 'Known Img', kind: 'image', supportsImageInput: false }, { id: 'm-live', kind: 'vision', supportsImageInput: false }]
    });
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 'm-live' }, { id: 'other' }] }) });
      const list = await fetchProviderModels(c.id, { force: true });
      expect(list.map(m => m.id).sort()).toEqual(['m-img', 'm-live', 'other']);
      expect(list.find(m => m.id === 'm-live').supportsImageInput).toBe(false);
      expect(list.find(m => m.id === 'other').supportsImageInput).toBe(true);
      expect(MODEL_CONFIGS['m-img'].supportsImageInput).toBe(false);
      expect(MODEL_CONFIGS['m-img'].provider).toBe(c.id);

      global.fetch = async () => { throw new Error('down'); };
      const list2 = await fetchProviderModels(c.id, { force: true });
      expect(list2.map(m => m.id).sort()).toEqual(['m-img', 'm-live']);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
