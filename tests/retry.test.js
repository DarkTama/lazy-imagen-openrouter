import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from '../src/retry.js';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable status codes', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, { baseDelay: 1000 });
    // First call fails with 429, waits 1000ms (baseDelay * 2^0)
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately for non-retryable status', async () => {
    const error = { status: 401, message: 'Unauthorized' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    const error = { status: 500 };
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelay: 1000 });

    // attempt 0 fails, wait 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // attempt 1 fails, wait 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    // attempt 2 (final) fails, should throw

    await expect(promise).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('calls onRetry callback with attempt and delay', async () => {
    const error = { status: 500 };
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('done');
    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, { baseDelay: 2000, onRetry });
    // Wait for first retry delay: 2000 * 2^0 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toBe('done');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, 2000, error);
  });

  it('uses exponential backoff delays', async () => {
    const error = { status: 503 };
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('finally');
    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, { baseDelay: 1000, maxRetries: 3, onRetry });

    // First retry: 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(onRetry).toHaveBeenCalledWith(1, 1000, error);

    // Second retry: 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(onRetry).toHaveBeenCalledWith(2, 2000, error);

    const result = await promise;
    expect(result).toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
