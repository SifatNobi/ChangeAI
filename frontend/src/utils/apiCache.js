// Simple in-memory cache for API responses
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let currentTokenHash = "";

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

// Invalidate specific cache patterns (e.g., all subscription caches)
export function clearCachePattern(pattern) {
  const keysToDelete = [];
  cache.forEach((_, key) => {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => cache.delete(key));
}

// Invalidate subscription-related caches
export function invalidateSubscriptionCache(token) {
  // Clear all subscription and user-related caches
  const patterns = [
    '/subscription/current',
    '/subscription/usage',
    '/user/profile',
    '/merchant-subscription/'
  ];
  patterns.forEach(pattern => {
    clearCachePattern(pattern);
  });
}

// Invalidate auth-related caches (for login/logout)
export function invalidateAuthCache(token) {
  clearCachePattern('/user/profile');
  clearCachePattern('/subscription/');
}

// Invalidate cache when auth token changes
export function updateAuthToken(token) {
  const newHash = token ? token.slice(-20) : "";
  if (newHash !== currentTokenHash) {
    cache.clear();
    currentTokenHash = newHash;
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
