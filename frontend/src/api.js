import { getCachedData, setCachedData, withRetry } from "./utils/apiCache";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://changeaipay.onrender.com";

const TOKEN_KEY = "changeaipay_token";
const REQUEST_TIMEOUT = 15000; // 15 seconds

export function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token") || "").trim();
}

export function setToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return clearToken();
  localStorage.setItem(TOKEN_KEY, normalizedToken);
  localStorage.setItem("token", normalizedToken);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
}

// Enhanced API request with timeout and better error handling
async function apiRequest(path, { method = "GET", token, body, timeout = REQUEST_TIMEOUT, useCache = false } = {}) {
  const requestToken = String(token || "").trim();
  const cacheKey = method === "GET" ? `${path}:${requestToken}` : null;

  // Check cache for GET requests
  if (useCache && cacheKey) {
    const cached = getCachedData(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {})
      },
      credentials: "include",
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

    // Cache successful GET responses
    if (useCache && cacheKey && method === "GET") {
      setCachedData(cacheKey, data);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    
    if (err.name === "AbortError") {
      throw new Error("Request timeout. Please check your connection and try again.");
    }
    throw err;
  }
}

export { apiRequest };

// ===== Auth APIs =====
export async function login({ email, password }) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: { email, password }
  });
}

export async function register({ name, email, password }) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: { name, email, password }
  });
}

// ===== User APIs (with caching) =====
export async function getUserProfile(token) {
  return apiRequest("/user/profile", { token, useCache: true });
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
  return apiRequest("/billing/verify-payment", {
    method: "POST",
    token,
    body: { paymentSessionId, transactionHash }
  });
}

export async function cancelPaymentSession(token) {
  return apiRequest("/billing/cancel-payment", {
    method: "POST",
    token
  });
}

export async function activateFreeTrial(token) {
  return apiRequest("/billing/activate-free-trial", {
    method: "POST",
    token
  });
}

export async function completeFirstTransaction(token) {
  return apiRequest("/billing/complete-first-transaction", {
    method: "POST",
    token
  });
}

// ===== Waitlist APIs =====
export async function joinWaitlist({ email, phone }) {
  return apiRequest("/waitlist", {
    method: "POST",
    body: { email: String(email || "").trim(), phone: phone || "" }
  });
}
