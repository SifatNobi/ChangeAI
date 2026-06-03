const API_BASE_URL =
  (window.CHANGEAIPAY_API_BASE_URL || "https://changeaipay.onrender.com").replace(/\/+$/, "");
const TOKEN_KEY = "changeaipay_token";
const VIDEO_VOLUME = 1;
const ROUTES = new Set(["dashboard", "send", "receive", "history"]);

const ui = {};

const appState = {
  token: "",
  authMode: "login",
  user: null,
  balanceNano: "0",
  transactions: [],
  currentRoute: "dashboard",
  qrRequestId: 0,
  scanner: null,
  pollTimer: null,
  pollStartedAt: 0,
  pollTxId: "",
  pollTxHash: "",
  unauthorizedHandled: false
};

function byId(id) {
  return document.getElementById(id);
}

function cacheElements() {
  ui.authSection = byId("auth-section");
  ui.dashboardSection = byId("dashboard-section");

  ui.authTitle = byId("auth-title");
  ui.authForm = byId("auth-form");
  ui.authError = byId("auth-error");
  ui.authSubmit = byId("auth-submit");
  ui.switchAuth = byId("switch-auth");
  ui.registerFields = byId("register-fields");
  ui.nameInput = ui.authForm?.elements?.namedItem("name");
  ui.emailInput = ui.authForm?.elements?.namedItem("email");
  ui.passwordInput = ui.authForm?.elements?.namedItem("password");

  ui.waitlistForm = byId("waitlist-form");
  ui.waitlistEmail = byId("waitlist-email");
  ui.waitlistStatus = byId("waitlist-status");

  ui.merchantName = byId("merchant-name");
  ui.walletAddress = byId("wallet-address");
  ui.receiveWalletAddress = byId("receive-wallet-address");
  ui.balanceAmount = byId("balance-amount");
  ui.transactionCount = byId("transaction-count");
  ui.transactionList = byId("transaction-list");

  ui.dashboardContent = byId("dashboard-content");
  ui.sendContent = byId("send-content");
  ui.receiveSection = byId("receive-section");
  ui.historySection = byId("history-section");
  ui.receiveAmountInput = byId("receive-amount");
  ui.qrContainer = byId("qr-container");

  ui.sendForm = byId("send-form");
  ui.sendRecipientInput = byId("send-recipient");
  ui.sendAmountInput = byId("send-amount");
  ui.sendStatus = byId("send-status");
  ui.sendSubmit = byId("send-submit");
  ui.scanQrBtn = byId("scan-qr-btn");
  ui.stopScannerBtn = byId("stop-scanner-btn");
  ui.scanError = byId("scan-error");
  ui.qrScannerContainer = byId("qr-scanner-container");

  ui.logoutBtn = byId("logout-btn");
  ui.mobileLogoutBtn = byId("mobile-logout-btn");
  ui.hamburgerBtn = byId("hamburger-btn");
  ui.mobileMenu = byId("mobile-menu");
  ui.routeLinks = Array.from(document.querySelectorAll("[data-route]"));

  ui.demoVideo = byId("demo-video");
  ui.muteBtn = byId("mute-btn");
  ui.soundBtn = byId("sound-btn");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(6).replace(/\.?0+$/, "") : "0";
}

function formatDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function buildNanoUri(address, amount) {
  const safeAddress = String(address || "").trim();
  const safeAmount = String(amount || "").trim();
  if (!safeAddress) return "";
  return safeAmount
    ? `nano:${safeAddress}?amount=${encodeURIComponent(safeAmount)}`
    : `nano:${safeAddress}`;
}

function getToken() {
  return (localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token") || "").trim();
}

function setToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    clearToken();
    return;
  }
  localStorage.setItem(TOKEN_KEY, normalizedToken);
  localStorage.setItem("token", normalizedToken);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isExpiredToken(token) {
  const payload = parseJwtPayload(token);
  if (!payload) return true;
  if (typeof payload.exp !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + 5;
}

function setAuthError(message) {
  if (!ui.authError) return;
  const value = String(message || "").trim();
  ui.authError.textContent = value;
  ui.authError.style.display = value ? "block" : "none";
}

function setAuthLoading(isLoading) {
  if (!ui.authSubmit) return;
  ui.authSubmit.disabled = isLoading;

  if (isLoading) {
    ui.authSubmit.dataset.defaultText = ui.authSubmit.dataset.defaultText || ui.authSubmit.textContent;
    ui.authSubmit.textContent = "Please wait...";
    return;
  }

  ui.authSubmit.textContent =
    ui.authSubmit.dataset.defaultText ||
    (appState.authMode === "register" ? "Create account" : "Login");
}

function setWaitlistStatus(message, isError = false) {
  if (!ui.waitlistStatus) return;
  const value = String(message || "").trim();
  ui.waitlistStatus.textContent = value;
  ui.waitlistStatus.style.display = value ? "block" : "none";
  ui.waitlistStatus.classList.toggle("error", Boolean(value && isError));
}

function setSendStatus(type, message, txHash = "") {
  if (!ui.sendStatus) return;
  const kind = String(type || "pending");
  const text = String(message || "").trim();
  const hash = String(txHash || "").trim();

  if (!text && !hash) {
    ui.sendStatus.style.display = "none";
    ui.sendStatus.className = "status";
    ui.sendStatus.innerHTML = "";
    return;
  }

  const safeText = escapeHtml(text);
  const safeHash = escapeHtml(hash);
  const title =
    kind === "success" ? "Payment Success" :
    kind === "error" ? "Payment Failed" :
    kind === "pending" ? "Processing" :
    "Status";

  ui.sendStatus.className = `status ${kind === "action_required" ? "error" : kind}`;
  ui.sendStatus.style.display = "block";
  ui.sendStatus.innerHTML = hash
    ? `<strong>${title}</strong><p>${safeText}</p><p class="tx-hash">Hash: ${safeHash}</p>`
    : `<strong>${title}</strong><p>${safeText}</p>`;
}

function setScanError(message) {
  if (!ui.scanError) return;
  const value = String(message || "").trim();
  ui.scanError.textContent = value;
  ui.scanError.style.display = value ? "block" : "none";
}

function setSendLoading(isLoading) {
  if (ui.sendSubmit) {
    ui.sendSubmit.disabled = isLoading;
    ui.sendSubmit.textContent = isLoading ? "Sending..." : "Send";
  }
  if (ui.sendRecipientInput) ui.sendRecipientInput.disabled = isLoading;
  if (ui.sendAmountInput) ui.sendAmountInput.disabled = isLoading;
  if (ui.scanQrBtn) ui.scanQrBtn.disabled = isLoading;
}

function setAuthMode(mode) {
  appState.authMode = mode === "register" ? "register" : "login";
  const isRegister = appState.authMode === "register";

  if (ui.registerFields) {
    ui.registerFields.style.display = isRegister ? "block" : "none";
  }
  if (ui.nameInput) {
    ui.nameInput.required = isRegister;
    if (!isRegister) ui.nameInput.value = "";
  }
  if (ui.authTitle) ui.authTitle.textContent = isRegister ? "Register" : "Login";
  if (ui.authSubmit) {
    ui.authSubmit.textContent = isRegister ? "Create account" : "Login";
    ui.authSubmit.dataset.defaultText = ui.authSubmit.textContent;
  }
  if (ui.switchAuth) {
    ui.switchAuth.textContent = isRegister
      ? "Already have an account? Login"
      : "Need an account? Register";
  }
  setAuthError("");
}

function showAuthView() {
  if (ui.authSection) ui.authSection.style.display = "";
  if (ui.dashboardSection) ui.dashboardSection.style.display = "none";
  closeMobileMenu();
  stopScanner().catch(() => {});
  stopPolling();
}

function showDashboardView() {
  if (ui.authSection) ui.authSection.style.display = "none";
  if (ui.dashboardSection) ui.dashboardSection.style.display = "";
}

function closeMobileMenu() {
  if (ui.mobileMenu) ui.mobileMenu.style.display = "none";
  if (ui.hamburgerBtn) ui.hamburgerBtn.classList.remove("active");
}

function handleUnauthorized(message = "Session expired. Please login again.") {
  if (appState.unauthorizedHandled) return;
  appState.unauthorizedHandled = true;

  clearToken();
  appState.token = "";
  appState.user = null;
  appState.balanceNano = "0";
  appState.transactions = [];
  renderTransactions([]);
  updateProfileUi(null);
  updateBalanceUi("0");
  showAuthView();
  setAuthError(message);

  setTimeout(() => {
    appState.unauthorizedHandled = false;
  }, 0);
}

async function apiRequest(path, { method = "GET", token = "", body, timeoutMs = 15000 } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const requestToken = String(token || "").trim();

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {})
      },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
      ...(controller ? { signal: controller.signal } : {})
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const error = new Error(data?.error || data?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      if (response.status === 401 && requestToken) {
        handleUnauthorized();
      }
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Request timed out");
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function updateProfileUi(user) {
  appState.user = user || appState.user || null;
  const name = appState.user?.name || "ChangeAIPay User";
  const address = appState.user?.walletAddress || "Wallet not available";

  if (ui.merchantName) ui.merchantName.textContent = name;
  if (ui.walletAddress) ui.walletAddress.textContent = address;
  if (ui.receiveWalletAddress) ui.receiveWalletAddress.textContent = address;
  renderQr();
}

function updateBalanceUi(balanceNano) {
  appState.balanceNano = String(balanceNano ?? appState.balanceNano ?? "0");
  if (ui.balanceAmount) ui.balanceAmount.textContent = `${formatAmount(appState.balanceNano)} XNO`;
}

function renderTransactions(items) {
  const list = Array.isArray(items) ? items : [];
  appState.transactions = list;

  if (ui.transactionCount) {
    ui.transactionCount.textContent = `${list.length} ${list.length === 1 ? "entry" : "entries"}`;
  }

  if (!ui.transactionList) return;
  if (list.length === 0) {
    ui.transactionList.innerHTML = '<div class="empty-state">No transactions yet - your payments will appear here.</div>';
    return;
  }

  const rows = list.map((tx) => {
    const direction = tx?.direction === "incoming" ? "incoming" : "outgoing";
    const symbol = direction === "incoming" ? "+" : "-";
    const amount = `${symbol}${formatAmount(tx?.amountNano)} XNO`;
    const counterparty = tx?.counterpart?.email || tx?.counterpart?.walletAddress || "Unknown";
    const timestamp = formatDate(tx?.timestamp);
    const state = String(tx?.status || "pending").toUpperCase();
    return `
      <article class="transaction-card ${direction}">
        <div class="tx-icon">${direction === "incoming" ? "IN" : "OUT"}</div>
        <div class="tx-main">
          <p class="tx-amount">${escapeHtml(amount)}</p>
          <p class="tx-meta">${escapeHtml(counterparty)} ${timestamp ? `- ${escapeHtml(timestamp)}` : ""}</p>
        </div>
        <span class="tx-state">${escapeHtml(state)}</span>
      </article>
    `;
  });

  ui.transactionList.innerHTML = rows.join("");
}

function renderEmptyQr(message) {
  if (!ui.qrContainer) return;
  ui.qrContainer.innerHTML = `<div class="empty-qr"><p class="muted">${escapeHtml(message)}</p></div>`;
}

function renderQr() {
  if (!ui.qrContainer) return;
  const address = String(appState.user?.walletAddress || "").trim();
  const amount = String(ui.receiveAmountInput?.value || "").trim();

  if (!address) {
    renderEmptyQr("Wallet not available");
    return;
  }

  if (!amount) {
    renderEmptyQr("Add amount to generate QR");
    return;
  }

  const uri = buildNanoUri(address, amount);
  if (!uri) {
    renderEmptyQr("Invalid payment data");
    return;
  }

  const currentRequest = ++appState.qrRequestId;
  if (!window.QRCode || typeof window.QRCode.toDataURL !== "function") {
    renderEmptyQr("QR generator unavailable");
    return;
  }

  Promise.resolve(window.QRCode.toDataURL(uri, { margin: 1, width: 320 }))
    .then((dataUrl) => {
      if (currentRequest !== appState.qrRequestId) return;
      const img = document.createElement("img");
      img.alt = "Payment QR code";
      img.src = dataUrl;
      ui.qrContainer.innerHTML = "";
      ui.qrContainer.appendChild(img);
    })
    .catch(() => {
      if (currentRequest !== appState.qrRequestId) return;
      renderEmptyQr("Failed to generate QR");
    });
}

function normalizeScannedText(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const nativeUri = text.replace(/^nano:/i, "").split("?")[0].trim();
  const walletMatch = nativeUri.match(/nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}/i);
  if (walletMatch) return walletMatch[0];

  const fallbackMatch = text.match(/nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}/i);
  if (fallbackMatch) return fallbackMatch[0];
  return text;
}

async function openScanner() {
  if (appState.scanner || !ui.qrScannerContainer) return;
  if (typeof window.Html5Qrcode !== "function") {
    setScanError("QR scanner library is unavailable.");
    return;
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    setScanError("Camera API is not available in this browser.");
    return;
  }

  setScanError("");
  ui.qrScannerContainer.style.display = "block";

  let permissionStream = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });

    const cameras = await window.Html5Qrcode.getCameras().catch((err) => {
      console.warn("QR scanner camera detection failed:", err);
      return [];
    });

    const selectedCamera = (cameras || []).find((c) => /back|rear|environment|camera\d|back-facing/i.test(c.label)) || cameras?.[0];
    const cameraSource = selectedCamera?.id ? selectedCamera.id : { facingMode: "environment" };

    appState.scanner = new window.Html5Qrcode("qr-scanner");
    await appState.scanner.start(
      cameraSource,
      { fps: 10, qrbox: { width: 260, height: 260 }, rememberLastUsedCamera: true, showTorchButtonIfSupported: true },
      (decodedText) => {
        const recipient = normalizeScannedText(decodedText);
        if (!recipient) {
          setScanError("Scanned QR is not valid.");
          return;
        }
        if (ui.sendRecipientInput) ui.sendRecipientInput.value = recipient;
        setSendStatus("success", "QR scanned and recipient filled.");
        stopScanner().catch(() => {});
      },
      () => {}
    );
  } catch (error) {
    console.warn("QR scanner startup error:", error);
    setScanError(String(error?.message || "Could not start QR scanner."));
    await stopScanner();
  } finally {
    if (permissionStream) {
      permissionStream.getTracks().forEach((track) => track.stop());
    }
  }
}

async function stopScanner() {
  if (!appState.scanner) {
    if (ui.qrScannerContainer) ui.qrScannerContainer.style.display = "none";
    return;
  }

  try {
    await appState.scanner.stop();
  } catch {}
  try {
    await appState.scanner.clear();
  } catch {}

  appState.scanner = null;
  if (ui.qrScannerContainer) ui.qrScannerContainer.style.display = "none";
}

function stopPolling() {
  if (appState.pollTimer) {
    clearInterval(appState.pollTimer);
    appState.pollTimer = null;
  }
  appState.pollStartedAt = 0;
  appState.pollTxId = "";
  appState.pollTxHash = "";
}

async function pollTransactionStatus() {
  if (!appState.pollTxId || !appState.token) {
    stopPolling();
    return;
  }

  const elapsedSec = Math.floor((Date.now() - appState.pollStartedAt) / 1000);
  if (elapsedSec > 120) {
    setSendStatus("pending", "Payment submitted. Confirmation is taking longer than usual.", appState.pollTxHash);
    stopPolling();
    return;
  }

  try {
    const result = await apiRequest(`/transaction/${appState.pollTxId}/status`, {
      token: appState.token,
      timeoutMs: 10000
    });

    if (!result?.success) return;

    if (result.confirmed) {
      setSendStatus("success", `Payment confirmed in ${elapsedSec}s.`, result.tx_hash || appState.pollTxHash);
      stopPolling();
      void loadHistory(appState.token);
      void loadProfile(appState.token);
      return;
    }

    if (result.status === "failed") {
      setSendStatus("error", result.message || "Payment failed.");
      stopPolling();
      return;
    }

    setSendStatus("pending", `Confirming on network (${elapsedSec}s)...`, result.tx_hash || appState.pollTxHash);
  } catch (error) {
    if (error?.status === 401) {
      stopPolling();
      return;
    }
  }
}

function startPolling(transactionId, txHash) {
  stopPolling();
  appState.pollTxId = String(transactionId || "");
  appState.pollTxHash = String(txHash || "");
  if (!appState.pollTxId) return;
  appState.pollStartedAt = Date.now();
  void pollTransactionStatus();
  appState.pollTimer = setInterval(() => {
    void pollTransactionStatus();
  }, 2500);
}

function getRouteFromHash() {
  const route = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  return ROUTES.has(route) ? route : "dashboard";
}

function updateActiveNav(route) {
  if (!ui.routeLinks?.length) return;
  ui.routeLinks.forEach((link) => {
    const linkRoute = String(link.getAttribute("data-route") || "").toLowerCase();
    const active = route === linkRoute;
    link.classList.toggle("active", active);
  });
}

function renderRoute(route, { scroll = true } = {}) {
  appState.currentRoute = ROUTES.has(route) ? route : "dashboard";
  const isSend = appState.currentRoute === "send";

  if (ui.dashboardContent) ui.dashboardContent.style.display = isSend ? "none" : "";
  if (ui.sendContent) ui.sendContent.style.display = isSend ? "" : "none";
  updateActiveNav(appState.currentRoute);

  if (appState.currentRoute === "receive") {
    renderQr();
  }
  if (appState.currentRoute === "history") {
    renderTransactions(appState.transactions);
  }

  if (!scroll) return;

  if (appState.currentRoute === "receive" && ui.receiveSection) {
    setTimeout(() => {
      ui.receiveSection.scrollIntoView({ behavior: "smooth", block: "start" });
      ui.receiveAmountInput?.focus();
    }, 40);
  } else if (appState.currentRoute === "history" && ui.historySection) {
    setTimeout(() => {
      ui.historySection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  } else if (appState.currentRoute === "dashboard" && ui.dashboardContent) {
    setTimeout(() => {
      ui.dashboardContent.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  } else if (appState.currentRoute === "send" && ui.sendContent) {
    setTimeout(() => {
      ui.sendContent.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }
}

function setupRoutes() {
  if (ui.routeLinks?.length) {
    ui.routeLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const route = String(link.getAttribute("data-route") || "").toLowerCase();
        if (ROUTES.has(route)) {
          window.location.hash = route;
          renderRoute(route, { scroll: true });
        }
        closeMobileMenu();
      });
    });
  }

  window.addEventListener("hashchange", () => {
    renderRoute(getRouteFromHash(), { scroll: true });
  });

  renderRoute(getRouteFromHash(), { scroll: false });
}

async function loadProfile(token, { silent = true } = {}) {
  try {
    const result = await apiRequest("/user/profile", { token, timeoutMs: 12000 });
    if (result?.user) updateProfileUi(result.user);
    if (result?.balance?.balanceNano !== undefined) updateBalanceUi(result.balance.balanceNano);
  } catch (error) {
    if (!silent && error?.status !== 401) {
      console.warn("Profile refresh failed:", error?.message || error);
    }
  }
}

async function loadHistory(token, { silent = true } = {}) {
  try {
    const result = await apiRequest("/transaction/history?limit=15", { token, timeoutMs: 12000 });
    renderTransactions(result?.transactions || []);
  } catch (error) {
    if (!silent && error?.status !== 401) {
      console.warn("History refresh failed:", error?.message || error);
    }
  }
}

function loadDashboardData(token) {
  if (!token) return;
  void loadProfile(token, { silent: false });
  void loadHistory(token, { silent: false });
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!ui.authForm) return;

  const name = String(ui.nameInput?.value || "").trim();
  const email = String(ui.emailInput?.value || "").trim().toLowerCase();
  const password = String(ui.passwordInput?.value || "");

  if (!email || !password) {
    setAuthError("Email and password are required.");
    return;
  }
  if (appState.authMode === "register" && !name) {
    setAuthError("Name is required.");
    return;
  }

  setAuthError("");
  setAuthLoading(true);

  try {
    const endpoint = appState.authMode === "register" ? "/auth/register" : "/auth/login";
    const payload =
      appState.authMode === "register" ? { name, email, password } : { email, password };

    const authData = await apiRequest(endpoint, {
      method: "POST",
      body: payload,
      timeoutMs: 15000
    });

    const token = String(authData?.token || "");
    if (!token) throw new Error("Login succeeded but no token was returned.");

    appState.token = token;
    setToken(token);
    updateProfileUi(authData?.user || null);
    updateBalanceUi("0");
    showDashboardView();
    renderRoute(getRouteFromHash(), { scroll: false });
    ui.authForm.reset();
    setAuthMode("login");
    setSendStatus("", "");

    // Keep login fast: load full profile/history in the background.
    loadDashboardData(token);
  } catch (error) {
    setAuthError(error?.message || "Authentication failed.");
  } finally {
    setAuthLoading(false);
  }
}

async function handleWaitlistSubmit(event) {
  event.preventDefault();
  const email = String(ui.waitlistEmail?.value || "").trim().toLowerCase();
  if (!email) {
    setWaitlistStatus("Email is required.", true);
    return;
  }

  setWaitlistStatus("");
  try {
    await apiRequest("/waitlist", {
      method: "POST",
      body: { email },
      timeoutMs: 10000
    });
    setWaitlistStatus("You are on the waitlist.");
    ui.waitlistForm?.reset();
  } catch (error) {
    setWaitlistStatus(error?.message || "Failed to join waitlist.", true);
  }
}

function handleLogout() {
  clearToken();
  appState.token = "";
  appState.user = null;
  appState.balanceNano = "0";
  renderTransactions([]);
  updateProfileUi(null);
  updateBalanceUi("0");
  showAuthView();
}

async function handleSendSubmit(event) {
  event.preventDefault();
  if (!appState.token) {
    handleUnauthorized();
    return;
  }

  const recipient = String(ui.sendRecipientInput?.value || "").trim();
  const amount = String(ui.sendAmountInput?.value || "").trim();
  if (!recipient || !amount) {
    setSendStatus("error", "Recipient and amount are required.");
    return;
  }

  setSendLoading(true);
  setSendStatus("pending", "Submitting payment...");

  try {
    const result = await apiRequest("/transaction/send", {
      method: "POST",
      token: appState.token,
      body: { recipient, amount },
      timeoutMs: 20000
    });

    const txHash = result?.tx_hash || "";
    const txId = result?.transaction?.id || result?.transaction_id || "";

    if (txHash) {
      setSendStatus("pending", "Payment submitted. Confirming...", txHash);
      if (ui.sendForm) ui.sendForm.reset();
      if (txId) {
        startPolling(txId, txHash);
      } else {
        void loadHistory(appState.token);
      }
      return;
    }

    if (result?.success) {
      setSendStatus("success", result?.message || "Payment completed.");
      if (ui.sendForm) ui.sendForm.reset();
      void loadHistory(appState.token);
      return;
    }

    setSendStatus("error", result?.error || result?.message || "Payment failed.");
  } catch (error) {
    const message = String(error?.message || "Payment failed.");
    const needsFunding = /fund|receive|activate|wallet/i.test(message);
    setSendStatus(needsFunding ? "action_required" : "error", message);
  } finally {
    setSendLoading(false);
  }
}

function setupAuthEvents() {
  if (ui.authForm) ui.authForm.addEventListener("submit", handleAuthSubmit);
  if (ui.waitlistForm) ui.waitlistForm.addEventListener("submit", handleWaitlistSubmit);
  if (ui.switchAuth) {
    ui.switchAuth.addEventListener("click", (event) => {
      event.preventDefault();
      setAuthMode(appState.authMode === "register" ? "login" : "register");
    });
  }
  if (ui.logoutBtn) ui.logoutBtn.addEventListener("click", handleLogout);
  if (ui.mobileLogoutBtn) ui.mobileLogoutBtn.addEventListener("click", handleLogout);
}

function setupDashboardEvents() {
  if (ui.receiveAmountInput) ui.receiveAmountInput.addEventListener("input", renderQr);
  if (ui.sendForm) ui.sendForm.addEventListener("submit", handleSendSubmit);
  if (ui.scanQrBtn) ui.scanQrBtn.addEventListener("click", () => {
    void openScanner();
  });
  if (ui.stopScannerBtn) ui.stopScannerBtn.addEventListener("click", () => {
    void stopScanner();
  });
}

function setupMobileMenu() {
  if (!ui.hamburgerBtn || !ui.mobileMenu) return;
  ui.hamburgerBtn.addEventListener("click", () => {
    const open = ui.mobileMenu.style.display === "flex";
    ui.mobileMenu.style.display = open ? "none" : "flex";
    ui.hamburgerBtn.classList.toggle("active", !open);
  });
}

function initializeVideoState() {
  if (!ui.demoVideo) return;

  ui.demoVideo.muted = true;
  ui.demoVideo.volume = VIDEO_VOLUME;
  ui.demoVideo.addEventListener("error", (event) => {
    console.error("Demo video error:", event.target?.error);
  });

  document.addEventListener("click", handleUserInteraction, { once: true });
  document.addEventListener("touchstart", handleUserInteraction, { once: true });
}

async function handleUserInteraction() {
  if (!ui.demoVideo) return;
  try {
    await ui.demoVideo.play();
  } catch (error) {
    console.warn("User interaction did not unlock video immediately:", error);
  }
}

function tryManualAudioUnlock() {
  try {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return;
    const context = new AudioContextImpl();
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch (error) {
    console.warn("Web Audio manual unlock failed:", error);
  }
}

function syncVideoButtonState() {
  if (!ui.demoVideo) return;
  if (ui.muteBtn) ui.muteBtn.textContent = ui.demoVideo.muted ? "Unmute" : "Mute";
  if (ui.soundBtn && !ui.demoVideo.muted) ui.soundBtn.textContent = "Sound On";
}

async function unlockVideoAudio() {
  if (!ui.demoVideo) return false;
  ui.demoVideo.muted = false;
  ui.demoVideo.volume = VIDEO_VOLUME;

  try {
    await ui.demoVideo.play();
  } catch (firstError) {
    console.warn("unlockVideoAudio attempt failed:", firstError);
    try {
      await ui.demoVideo.play();
    } catch (retryError) {
      console.warn("unlockVideoAudio retry failed:", retryError);
    }
  }

  setTimeout(() => {
    if (!ui.demoVideo) return;
    if (ui.demoVideo.muted) ui.demoVideo.muted = false;
    if (ui.demoVideo.volume < VIDEO_VOLUME) ui.demoVideo.volume = VIDEO_VOLUME;
    syncVideoButtonState();
  }, 100);

  return !ui.demoVideo.muted;
}

async function toggleVideoMute(event) {
  if (event?.cancelable) event.preventDefault();
  if (!ui.demoVideo) return;

  ui.demoVideo.muted = !ui.demoVideo.muted;
  if (!ui.demoVideo.muted) await unlockVideoAudio();
  syncVideoButtonState();
}

async function toggleVideoSound(event) {
  if (event?.cancelable) event.preventDefault();
  if (!ui.demoVideo) return;

  const enabled = await unlockVideoAudio();
  if (enabled) {
    if (ui.soundBtn) ui.soundBtn.textContent = "Sound On";
    if (ui.muteBtn) ui.muteBtn.textContent = "Mute";
    return;
  }

  if (ui.soundBtn) ui.soundBtn.textContent = "Sound Failed";
  tryManualAudioUnlock();
}

function setupVideoEvents() {
  if (ui.muteBtn) ui.muteBtn.addEventListener("click", toggleVideoMute);
  if (ui.soundBtn) ui.soundBtn.addEventListener("click", toggleVideoSound);
}

function restoreSession() {
  const token = getToken();
  if (!token || isExpiredToken(token)) {
    clearToken();
    showAuthView();
    return;
  }

  appState.token = token;
  showDashboardView();
  renderRoute(getRouteFromHash(), { scroll: false });
  loadDashboardData(token);
}

function initPage() {
  cacheElements();
  setAuthMode("login");
  setupAuthEvents();
  setupDashboardEvents();
  setupMobileMenu();
  setupRoutes();
  initializeVideoState();
  setupVideoEvents();
  renderTransactions([]);
  renderQr();
  restoreSession();
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    initPage();
  } catch (error) {
    console.error("Initialization error:", error);
    showAuthView();
  }
});
