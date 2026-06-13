import { getCachedData, setCachedData, withRetry, updateAuthToken, invalidateSubscriptionCache, invalidateAuthCache, clearCachePattern } from "./utils/apiCache";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://changeaipay.onrender.com";

const TOKEN_KEY = "changeaipay_token";
const REQUEST_TIMEOUT = 15000;

let authConfigCache = null;

export function getCachedAuthConfig() {
  return authConfigCache;
}

export function setCachedAuthConfig(config) {
  authConfigCache = config;
}

export function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || "").trim();
}

export function setToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return clearToken();
  localStorage.setItem(TOKEN_KEY, normalizedToken);
  updateAuthToken(normalizedToken);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
  updateAuthToken("");
}

// Enhanced API request with timeout and better error handling
async function apiRequest(path, { method = "GET", token, body, timeout = REQUEST_TIMEOUT, useCache = false, retries = 0 } = {}) {
  const requestToken = String(token || "").trim();
  const cacheKey = method === "GET" ? `${path}:${requestToken}` : null;

  if (useCache && cacheKey) {
    const cached = getCachedData(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const execute = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data;
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        const error = new Error(data?.error || data?.message || `HTTP ${response.status}`);
        error.details = data?.details || null;
        error.status = response.status;
        throw error;
      }

      if (useCache && cacheKey && method === "GET") {
        setCachedData(cacheKey, data);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  if (retries > 0 && method === "POST" && !requestToken) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await execute();
      } catch (err) {
        lastError = err;
        if (err.status && err.status < 500) throw err;
        if (attempt < retries) {
          const delay = attempt === 1 ? 0 : attempt === 2 ? 1000 : 2000;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  try {
    return await execute();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Connection is taking longer than expected. Retrying...");
    }
    if (err.message && err.message.includes("fetch")) {
      throw new Error("Unable to connect. Please check your internet connection.");
    }
    throw err;
  }
}

export { apiRequest };

// ===== Auth APIs =====
export async function login({ email, password }) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: { email, password },
    timeout: 10000,
    retries: 3
  });
}

export async function register({ name, email, password }) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: { name, email, password },
    timeout: 10000,
    retries: 3
  });
}

// ===== Feature Request APIs =====
export async function getFeatureRequests(token, { sort = "votes", type = null, page = 1 } = {}) {
  const qs = new URLSearchParams();
  if (sort) qs.set("sort", sort);
  if (type) qs.set("type", type);
  qs.set("page", String(page));
  return apiRequest(`/feature-requests?${qs.toString()}`, { token, useCache: true });
}

export async function createFeatureRequest(token, { type, title, description }) {
  return apiRequest("/feature-requests", {
    method: "POST",
    token,
    body: { type, title, description }
  });
}

export async function voteFeatureRequest(token, requestId, value) {
  return apiRequest(`/feature-requests/${requestId}/vote`, {
    method: "POST",
    token,
    body: { value }
  });
}

export async function respondToFeatureRequest(token, requestId, { status, adminResponse }) {
  return apiRequest(`/feature-requests/${requestId}/respond`, {
    method: "POST",
    token,
    body: { status, adminResponse }
  });
}

export async function deleteFeatureRequest(token, requestId) {
  return apiRequest(`/feature-requests/${requestId}/delete`, {
    method: "POST",
    token
  });
}

export async function restoreFeatureRequest(token, requestId) {
  return apiRequest(`/feature-requests/${requestId}/restore`, {
    method: "POST",
    token
  });
}

export async function getFeatureRequestCount(token) {
  return apiRequest("/feature-requests/count", { token, useCache: true });
}

// ===== Recent Payments =====
export async function getRecentPayments(token) {
  return apiRequest("/payments/recent", { token, useCache: true });
}

// ===== Favorite Merchants =====
export async function getFavoriteMerchants(token) {
  return apiRequest("/payments/favorites", { token, useCache: true });
}

export async function addFavoriteMerchant(token, merchant) {
  return apiRequest("/payments/favorites", {
    method: "POST",
    token,
    body: merchant
  });
}

export async function removeFavoriteMerchant(token, merchantId) {
  return apiRequest(`/payments/favorites/${merchantId}`, {
    method: "DELETE",
    token
  });
}

// ===== Saved Recipients =====
export async function getSavedRecipients(token) {
  return apiRequest("/payments/recipients", { token, useCache: true });
}

export async function saveRecipient(token, recipient) {
  return apiRequest("/payments/recipients", {
    method: "POST",
    token,
    body: recipient
  });
}

// ===== Payment Templates =====
export async function getPaymentTemplates(token) {
  return apiRequest("/payments/templates", { token, useCache: true });
}

export async function createPaymentTemplate(token, template) {
  return apiRequest("/payments/templates", {
    method: "POST",
    token,
    body: template
  });
}

// ===== Payment Search =====
export async function searchPayments(token, query) {
  const qs = new URLSearchParams();
  if (query) qs.set("q", query);
  return apiRequest(`/payments/search?${qs.toString()}`, { token });
}

// ===== Export Payments =====
export async function exportPayments(token, format = "csv") {
  return apiRequest(`/payments/export?format=${format}`, { token });
}

// ===== User APIs =====
export async function getUserProfile(token) {
  return apiRequest("/user/profile", { token, useCache: false });
}

// ===== Transaction APIs =====
export async function sendTransaction(token, payload) {
  return apiRequest("/transaction/send", {
    method: "POST",
    token,
    body: payload
  });
}

export async function getTransactionHistory(token, { limit = 50 } = {}) {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  return apiRequest(`/transaction/history?${qs.toString()}`, { token, useCache: true });
}

// Backward compatibility alias
export async function getPaymentHistory(token, { limit = 20 } = {}) {
  return getTransactionHistory(token, { limit });
}

// ===== Subscription APIs (with caching) =====
export async function getCurrentSubscription(token) {
  return apiRequest("/subscription/current", { token, useCache: true });
}

export async function getSubscriptionUsage(token) {
  return apiRequest("/subscription/usage", { token, useCache: true });
}

export async function getMerchantSubscription(token) {
  return apiRequest("/merchant-subscription/current", { token, useCache: true });
}

export async function getMerchantAnalytics(token) {
  return apiRequest("/merchant-subscription/analytics", { token, useCache: true });
}

export async function getCashFlowPrediction(token) {
  return apiRequest("/merchant-subscription/cashflow", { token, useCache: true });
}

export async function getLifetimeValueData(token) {
  return apiRequest("/merchant-subscription/ltv", { token, useCache: true });
}

// ===== AI APIs =====
export async function sendAIChat(token, message, context = {}) {
  return apiRequest("/ai/chat", {
    method: "POST",
    token,
    body: { message, context }
  });
}

export async function getAIHistory(token) {
  return apiRequest("/ai/history", { token, useCache: true });
}

// ===== Billing APIs =====
export async function verifyPayment(token, { paymentSessionId, transactionHash }) {
  const result = await apiRequest("/billing/verify-payment", {
    method: "POST",
    token,
    body: { paymentSessionId, transactionHash }
  });
  
  // Invalidate subscription cache after successful payment verification
  if (result?.success) {
    invalidateSubscriptionCache(token);
  }
  
  return result;
}

export async function cancelPaymentSession(token) {
  const result = await apiRequest("/billing/cancel-payment", {
    method: "POST",
    token
  });
  
  // Invalidate subscription cache after cancelling payment
  if (result?.success) {
    invalidateSubscriptionCache(token);
  }
  
  return result;
}

export async function activateFreeTrial(token) {
  const result = await apiRequest("/billing/activate-free-trial", {
    method: "POST",
    token
  });
  
  // Invalidate subscription cache after successful activation
  if (result?.success) {
    invalidateSubscriptionCache(token);
  }
  
  return result;
}

export async function completeFirstTransaction(token) {
  const result = await apiRequest("/billing/complete-first-transaction", {
    method: "POST",
    token
  });
  
  // Invalidate subscription cache after completing first transaction
  if (result?.success) {
    invalidateSubscriptionCache(token);
  }
  
  return result;
}

// ===== Waitlist APIs =====
export async function joinWaitlist({ email, phone }) {
  return apiRequest("/waitlist", {
    method: "POST",
    body: { email: String(email || "").trim(), phone: phone || "" }
  });
}
