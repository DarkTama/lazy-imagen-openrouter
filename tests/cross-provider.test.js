import { describe, it, expect, beforeEach } from 'vitest';
import { saveCustomProvider } from '../src/providers.js';
import { state } from '../src/state.js';
import { runVisionAnalysis, generateSingleImage } from '../src/api.js';

describe('Cross-provider pipeline integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('runs vision analysis and image generation on separate custom providers', async () => {
    const visionProv = saveCustomProvider({
      id: 'custom_vision',
      name: 'Custom Vision API',
      base: 'https://vision.ai/v1',
      capabilities: { imageGen: false, chatVision: true }
    });

    const imgProv = saveCustomProvider({
      id: 'custom_img',
      name: 'Custom Image API',
      base: 'https://image.ai/v1',
      capabilities: { imageGen: true, chatVision: false },
      imageStrategy: 'images-endpoint'
    });

    state.orchestrator.visionProvider = visionProv.id;
    state.generationProvider = imgProv.id;
    state.selectedModel = 'sdxl-turbo';
    state.autoRetryEnabled = false;

    const originalFetch = global.fetch;
    const calls = [];

    try {
      global.fetch = async (url, opts) => {
        calls.push({ url, method: opts?.method, body: opts?.body ? JSON.parse(opts.body) : null });
        if (url.includes('vision.ai')) {
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      source_char: 'samurai warrior',
                      ref_clothing: 'cyberpunk armor'
                    })
                  }
                }
              ]
            })
          };
        }
        if (url.includes('image.ai')) {
          return {
            ok: true,
            json: async () => ({
              data: [{ b64_json: 'aW1hZ2VkYXRh' }]
            })
          };
        }
        return { ok: false, status: 404 };
      };

      const analysis = await runVisionAnalysis(
        'data:image/png;base64,src',
        'data:image/png;base64,ref',
        'llava-1.6',
        state.orchestrator.visionProvider
      );

      expect(analysis.source_char).toBe('samurai warrior');
      expect(calls[0].url).toBe('https://vision.ai/v1/chat/completions');
      expect(calls[0].body.model).toBe('llava-1.6');

      const imgResult = await generateSingleImage('samurai in cyberpunk armor');
      expect(imgResult).toBe('data:image/png;base64,aW1hZ2VkYXRh');
      expect(calls[1].url).toBe('https://image.ai/v1/images/generations');
      expect(calls[1].body.model).toBe('sdxl-turbo');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
