/**
 * Exponential backoff retry utility.
 */

export async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        baseDelay = 2000,
        retryableStatuses = [429, 500, 501, 502, 503],
        onRetry = null
    } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const status = err.status;
            if (status && !retryableStatuses.includes(status)) throw err;
            if (attempt === maxRetries) throw err;
            const delay = baseDelay * Math.pow(2, attempt);
            if (onRetry) onRetry(attempt + 1, delay, err);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}
