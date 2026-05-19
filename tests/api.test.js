import { describe, it, expect } from 'vitest';
import { classifyError } from '../src/orchestrator.js';

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
