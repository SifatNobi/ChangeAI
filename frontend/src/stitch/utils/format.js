export function formatAmount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(6).replace(/\.?0+$/, "") : "0";
}

export function buildNanoUri(address, amount, sessionId) {
  const safeAddress = String(address || "").trim();
  if (!safeAddress) return "";

  const params = [];
  const safeAmount = String(amount || "").trim();
  if (safeAmount) {
    params.push(`amount=${encodeURIComponent(safeAmount)}`);
  }
  if (sessionId) {
    params.push(`timestamp=${Date.now()}`);
    params.push(`session=${encodeURIComponent(sessionId)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `nano:${safeAddress}${queryString}`;
}

export function buildMerchantQrPayload(address, amount, merchantId, merchantName) {
  const safeAddress = String(address || "").trim();
  if (!safeAddress) return "";

  const safeAmount = String(amount || "").trim();
  const payload = {
    merchantId: String(merchantId || "").trim() || null,
    merchantName: String(merchantName || "").trim() || null,
    paymentDestination: safeAddress,
    amount: safeAmount || null,
    timestamp: Date.now()
  };

  return JSON.stringify(payload);
}

