const NANO_ADDRESS_REGEX = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/i;

const LEGACY_FIELD_MAP = {
  merchant: "merchantName",
  memo: "description",
  note: "description",
  recipient: "recipientWallet",
  destination: "paymentDestination",
  merchant_name: "merchantName",
  wallet: "recipientWallet",
  referenceId: "reference",
  payee: "merchantName",
  business: "merchantName",
  message: "description",
  value: "amount",
  total: "amount",
  currency_code: "currency",
  asset: "currency",
  label: "merchantName",
  to: "recipientWallet",
};

export function parsePaymentQR(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return createEmptyResult("No QR data provided");
  }

  const parsed = createDefaultPayload();

  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object") {
      mapJsonToPayload(json, parsed);
    }
  } catch {
    tryNanoUri(text, parsed);
  }

  if (!parsed.recipientWallet && !parsed.merchantName && !parsed.amount) {
    tryNanoUri(text, parsed);
  }

  if (!parsed.recipientWallet) {
    const match = text.match(NANO_ADDRESS_REGEX);
    if (match) {
      parsed.recipientWallet = match[1];
    }
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.expiryTimestamp > 0 && now > parsed.expiryTimestamp) {
    parsed.expired = true;
    parsed.errors.push("This payment request has expired.");
    return parsed;
  }

  parsed.valid = validateParsedPayload(parsed);
  return parsed;
}

function createDefaultPayload() {
  return {
    merchantName: "",
    recipientWallet: "",
    amount: "",
    currency: "XNO",
    paymentDestination: "",
    description: "",
    reference: "",
    timestamp: 0,
    expiryTimestamp: 0,
    qrVersion: "1.0",
    valid: false,
    expired: false,
    errors: [],
    missingFields: [],
    rawText: "",
  };
}

function createEmptyResult(errorMsg) {
  const p = createDefaultPayload();
  p.errors.push(errorMsg);
  return p;
}

function mapJsonToPayload(json, parsed) {
  const directFields = {
    merchantName: 1,
    recipientWallet: 1,
    amount: 1,
    currency: 1,
    paymentDestination: 1,
    description: 1,
    reference: 1,
    timestamp: 1,
    expiryTimestamp: 1,
    qrVersion: 1,
  };

  for (const key of Object.keys(directFields)) {
    if (json[key] !== undefined && json[key] !== null) {
      parsed[key] = String(json[key]);
    }
  }

  for (const [legacy, modern] of Object.entries(LEGACY_FIELD_MAP)) {
    if (!parsed[modern] && json[legacy] !== undefined && json[legacy] !== null) {
      parsed[modern] = String(json[legacy]);
    }
  }

  if (json.timestamp !== undefined && json.timestamp !== null) {
    parsed.timestamp = Number(json.timestamp);
  }
  if (parsed.timestamp === 0 && json.createdAt) {
    parsed.timestamp = Math.floor(new Date(json.createdAt).getTime() / 1000);
  }

  if (json.expiryTimestamp !== undefined && json.expiryTimestamp !== null) {
    parsed.expiryTimestamp = Number(json.expiryTimestamp);
  }
  if (parsed.expiryTimestamp === 0 && parsed.timestamp > 0) {
    parsed.expiryTimestamp = parsed.timestamp + 3600;
  }

  if (json.amount !== undefined && json.amount !== null) {
    parsed.amount = String(json.amount);
  }
  if (json.value !== undefined && json.value !== null && !parsed.amount) {
    parsed.amount = String(json.value);
  }
}

function tryNanoUri(text, parsed) {
  try {
    let parseable = text;
    if (/^[a-zA-Z0-9_]+:[^/]/.test(text) && !text.includes("//")) {
      parseable = text.replace(/^([^:]+):/, "$1://");
    }
    const url = new URL(parseable);
    const params = url.searchParams;

    if (url.protocol === "nano:") {
      parsed.recipientWallet = parsed.recipientWallet || url.pathname.replace(/^\/+/, "");
    }

    parsed.recipientWallet = parsed.recipientWallet ||
      params.get("recipient") || params.get("address") ||
      params.get("wallet") || params.get("to") || params.get("destination") || "";

    parsed.amount = parsed.amount ||
      params.get("amount") || params.get("value") || params.get("total") || "";

    parsed.currency = params.get("currency") || params.get("asset") || parsed.currency;

    const merchantFromParams = params.get("merchant") || params.get("label") || params.get("payee") || "";
    if (merchantFromParams) {
      parsed.merchantName = parsed.merchantName || merchantFromParams;
    }

    const descFromParams = params.get("description") || params.get("note") || params.get("message") || "";
    if (descFromParams) {
      parsed.description = parsed.description || descFromParams;
    }

    parsed.reference = parsed.reference ||
      params.get("reference") || params.get("memo") || params.get("referenceId") || "";

    parsed.paymentDestination = parsed.paymentDestination ||
      params.get("paymentDestination") || params.get("destination") || "";
  } catch {
    // Not a URI format
  }
}

function validateParsedPayload(parsed) {
  const required = [
    "merchantName",
    "recipientWallet",
    "amount",
    "currency",
    "paymentDestination",
    "description",
    "reference",
  ];

  parsed.missingFields = [];

  for (const field of required) {
    if (!parsed[field] || String(parsed[field]).trim() === "") {
      parsed.missingFields.push(field);
    }
  }

  if (parsed.missingFields.length > 0) {
    parsed.errors.push(
      "Incomplete QR payment request. Some payment details are missing."
    );
    return false;
  }

  return true;
}

export function formatParsedQR(parsed) {
  if (!parsed) return null;
  return {
    merchantName: parsed.merchantName || "",
    recipientWallet: parsed.recipientWallet || "",
    amount: parsed.amount || "",
    currency: parsed.currency || "XNO",
    paymentDestination: parsed.paymentDestination || "",
    description: parsed.description || "",
    reference: parsed.reference || "",
    timestamp: parsed.timestamp || 0,
    expiryTimestamp: parsed.expiryTimestamp || 0,
    qrVersion: parsed.qrVersion || "1.0",
  };
}
