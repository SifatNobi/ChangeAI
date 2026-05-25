// Simple in-memory cache for API responses
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function getCachedData(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

export function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// Retry logic for failed requests
export async function withRetry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const backoffDelay = delayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
  throw lastError;
}

// Abort controller timeout helper
export function createTimeoutAbortController(timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

export function clearAbortTimeout(timeoutId) {
  clearTimeout(timeoutId);
}
