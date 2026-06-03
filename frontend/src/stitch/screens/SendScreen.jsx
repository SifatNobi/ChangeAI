import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../../api";
import { AIInsightCard, GoalProgress } from "../../components/RealtimeDashboard";
import { FINA_AI_IMAGE } from "../../constants/branding";
import "../../components/SendStyles.css";

const PAYMENT_STORAGE_KEY = "changeaipay_payment_context";
const GOALS_STORAGE_KEY = "changeaipay_goals";

function loadSavedPaymentContext() {
  try {
    return JSON.parse(localStorage.getItem(PAYMENT_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function savePaymentContext(context) {
  try {
    localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(context));
  } catch {}
}

function clearSavedPaymentContext() {
  try {
    localStorage.removeItem(PAYMENT_STORAGE_KEY);
  } catch {}
}

function loadGoals() {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function SendScreen({ sendTransaction, paymentContext: appPaymentContext, onClearContext }) {
  const location = useLocation();
  const [form, setForm] = useState({
    recipient: "",
    amount: "",
    currency: "XNO",
    merchant: "",
    destination: "",
    note: "",
    reference: ""
  });
  const [status, setStatus] = useState({ type: "idle", message: "", txHash: null });
  const [loading, setLoading] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const [permissionState, setPermissionState] = useState("idle");
  const [scannerLoading, setScannerLoading] = useState(false);
  const [paymentContext, setPaymentContext] = useState(null);
  const [smartWarnings, setSmartWarnings] = useState([]);
  const [goals, setGoals] = useState(loadGoals);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({ name: "", target: "" });
  const scannerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scannerContainerRef = useRef(null);
  const openingRef = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const hasAutoSubmittedRef = useRef(false);
  
  const [txId, setTxId] = useState(null);
  const [confirmationTime, setConfirmationTime] = useState(0);
  const pollIntervalRef = useRef(null);
  const pollStartTimeRef = useRef(null);
  const pollAttemptsRef = useRef(0);
  const pollErrorCountRef = useRef(0);
  const maxPollErrors = 5;

  const stopAllMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const destroyScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (e) {
        console.warn("Scanner cleanup:", e);
      }
      scannerRef.current = null;
    }
    stopAllMediaTracks();
  }, [stopAllMediaTracks]);

  useEffect(() => {
    return () => {
      destroyScanner();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [destroyScanner]);

  useEffect(() => {
    try {
      localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
    } catch (e) {
      console.error("Failed to save goals:", e);
    }
  }, [goals]);

  useEffect(() => {
    const handleOpenGoals = () => {
      setEditingGoal(null);
      setGoalForm({ name: "", target: "" });
      setShowGoalModal(true);
    };
    window.addEventListener("open-goals", handleOpenGoals);
    return () => window.removeEventListener("open-goals", handleOpenGoals);
  }, []);

  const handleOpenCreateGoal = useCallback(() => {
    setEditingGoal(null);
    setGoalForm({ name: "", target: "" });
    setShowGoalModal(true);
  }, []);

  const handleOpenEditGoal = useCallback((goal) => {
    setEditingGoal(goal);
    setGoalForm({ name: goal.name, target: goal.target.toString() });
    setShowGoalModal(true);
  }, []);

  const handleDeleteGoal = useCallback((goalId) => {
    setGoals(prev => prev.filter(g => g.id !== goalId));
  }, []);

  const handleSaveGoal = useCallback((e) => {
    e.preventDefault();
    const name = goalForm.name.trim();
    const target = parseFloat(goalForm.target);
    if (!name || isNaN(target) || target <= 0) return;

    if (editingGoal) {
      setGoals(prev => prev.map(g => g.id === editingGoal.id ? { ...g, name, target } : g));
    } else {
      const newGoal = { id: Date.now().toString(), name, target, createdAt: new Date().toISOString() };
      setGoals(prev => [...prev, newGoal]);
    }
    setShowGoalModal(false);
    setEditingGoal(null);
    setGoalForm({ name: "", target: "" });
  }, [goalForm.name, goalForm.target, editingGoal]);

  const locationStateRef = useRef(null);

  useEffect(() => {
    const saved = loadSavedPaymentContext();
    const incoming = location.state && Object.keys(location.state).length ? location.state : saved || appPaymentContext;
    if (!incoming) return;

    // Skip if same context already applied
    const incomingKey = JSON.stringify(incoming);
    if (locationStateRef.current === incomingKey) return;
    locationStateRef.current = incomingKey;

    const normalized = {
      recipient: incoming.recipient || incoming.destination || "",
      amount: incoming.amount != null ? String(incoming.amount) : "",
      currency: incoming.currency || "XNO",
      merchant: incoming.merchant || "",
      destination: incoming.destination || incoming.recipient || "",
      note: incoming.note || "",
      reference: incoming.reference || ""
    };

    setPaymentContext({ ...incoming, ...normalized });
    setForm((prev) => ({
      ...prev,
      ...normalized
    }));
  }, [location.state, appPaymentContext]);

  useEffect(() => {
    const payload = {
      ...paymentContext,
      recipient: form.recipient,
      amount: form.amount,
      currency: form.currency,
      merchant: form.merchant,
      destination: form.destination,
      note: form.note,
      reference: form.reference,
      metadata: paymentContext?.metadata || {}
    };

    if (payload.recipient || payload.amount || payload.destination) {
      savePaymentContext(payload);
    } else {
      clearSavedPaymentContext();
    }
  }, [form, paymentContext]);

  useEffect(() => {
    const warnings = [];
    const amountValue = parseFloat(form.amount || "0");
    if (amountValue > 100) {
      warnings.push("High-value transfer detected. Confirm merchant identity before sending.");
    }
    if (form.currency && form.currency !== "XNO") {
      warnings.push("This payment uses a non-XNO currency. FX conversion may apply.");
    }
    if (form.recipient && !form.merchant) {
      warnings.push("Merchant name missing. Please verify the recipient carefully.");
    }
    setSmartWarnings(warnings);
  }, [form.amount, form.currency, form.merchant, form.recipient]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollAttemptsRef.current = 0;
    pollErrorCountRef.current = 0;
  }, []);

  const pollTransactionStatus = useCallback(async (id) => {
    const elapsed = Math.floor((Date.now() - pollStartTimeRef.current) / 1000);
    pollAttemptsRef.current += 1;

    if (elapsed > 120) {
      stopPolling();
      return;
    }

    try {
      const token = localStorage.getItem("changeaipay_token") || localStorage.getItem("token");
      if (!token) {
        stopPolling();
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${API_BASE_URL}/transaction/${id}/status`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        pollErrorCountRef.current += 1;
        if (response.status === 404) {
          setStatus({
            type: "error",
            message: "Transaction record not found. Please contact support.",
            txHash: null
          });
          stopPolling();
          return;
        }

        if (response.status === 401 || response.status === 403) {
          stopPolling();
          return;
        }

        if (pollErrorCountRef.current >= maxPollErrors) {
          setStatus({
            type: "pending",
            message: `Unable to reach confirmation server. Your payment may still be processing. Check again in a moment. (${elapsed}s)`,
            txHash: statusRef.current.txHash
          });
          stopPolling();
          return;
        }

        return;
      }

      pollErrorCountRef.current = 0;
      const data = await response.json();

      if (!data.success) {
        return;
      }

      setConfirmationTime(elapsed);

      if (data.confirmed) {
        setStatus({
          type: "success",
          message: `Payment Confirmed (${elapsed}s)`,
          txHash: data.tx_hash,
          confirmed: true
        });
        stopPolling();
        return;
      }

      if (data.status === "failed") {
        setStatus({
          type: "error",
          message: data.message || "Payment failed",
          txHash: null
        });
        stopPolling();
        return;
      }

      setStatus({
        type: "pending",
        message: `Confirming on network (${elapsed}s)...`,
        txHash: data.tx_hash
      });
    } catch (err) {
      if (err.name === "AbortError") {
        pollErrorCountRef.current += 1;
        if (pollErrorCountRef.current >= maxPollErrors) {
          setStatus({
            type: "pending",
            message: `Network slow. Your payment is processing. Try refreshing in 30 seconds.`,
            txHash: statusRef.current.txHash
          });
          stopPolling();
        }
      } else {
        pollErrorCountRef.current += 1;
        if (pollErrorCountRef.current >= maxPollErrors) {
          setStatus({
            type: "pending",
            message: `Network connection lost. Waiting for reconnection...`,
            txHash: statusRef.current.txHash
          });
          stopPolling();
        }
      }
    }
  }, [stopPolling]);

  useEffect(() => {
    if (!txId || status.type !== "pending") return;

    pollStartTimeRef.current = Date.now();
    pollAttemptsRef.current = 0;
    pollErrorCountRef.current = 0;
    pollTransactionStatus(txId);
    pollIntervalRef.current = setInterval(() => {
      pollTransactionStatus(txId);
    }, 3000);

    return () => {
      stopPolling();
    };
  }, [txId, status.type, pollTransactionStatus, stopPolling]);

  const submit = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: "idle", message: "", txHash: null });
    setTxId(null);
    setConfirmationTime(0);

    try {
      const result = await sendTransaction({
        recipient: form.recipient,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency,
        merchant: form.merchant,
        destination: form.destination,
        note: form.note,
        reference: form.reference,
        metadata: paymentContext?.metadata || {}
      });

      const hasSuccessStatus = result?.status === "success";
      const hasTxHash = Boolean(result?.tx_hash);
      const isFailureStatus = result?.status === "failed";
      const isPendingStatus = result?.status === "pending";

      if (hasTxHash && (hasSuccessStatus || !isFailureStatus)) {
        const txIdFromResponse = result?.transaction?.id || result?.transaction_id;
        if (txIdFromResponse) {
          setTxId(txIdFromResponse);
        }

        setStatus({
          type: "success",
          message: "Payment submitted successfully",
          txHash: result.tx_hash
        });
        setForm({ recipient: "", amount: "", currency: "XNO", merchant: "", destination: "", note: "", reference: "" });
        setScanError("");
        clearSavedPaymentContext();
        setPaymentContext(null);
        onClearContext?.();

        if (txIdFromResponse) {
          setStatus({
            type: "pending",
            message: "Confirming on network (0s)...",
            txHash: result.tx_hash
          });
        }
      } else if (isPendingStatus) {
        setStatus({
          type: "pending",
          message: result?.message || "Payment processing... Check back in a moment.",
          txHash: result?.tx_hash || null
        });
      } else {
        setStatus({
          type: "error",
          message: result?.error || "Payment failed. Please try again.",
          txHash: null
        });
      }
    } catch (err) {
      const rawMessage = String(err?.message || "Payment failed. Please try again.");
      const needsFunding = /fund|receive|activate|activated|wallet/i.test(rawMessage);
      setStatus({
        type: needsFunding ? "action_required" : "error",
        message: rawMessage,
        txHash: null
      });
    } finally {
      setLoading(false);
    }
  }, [form, paymentContext, sendTransaction, onClearContext]);

  function normalizeScannedText(value) {
    const text = String(value || "").trim();
    if (!text) return { recipient: "", amount: "", note: "", merchant: "" };

    let recipient = "";
    let amount = "";
    let note = "";
    let merchant = "";

    try {
      if (text.startsWith("nano:")) {
        const uri = new URL(text);
        recipient = uri.pathname.replace(/^\/+/, "");
        amount = uri.searchParams.get("amount") || "";
        note = uri.searchParams.get("note") || uri.searchParams.get("message") || "";
        merchant = uri.searchParams.get("merchant") || uri.searchParams.get("label") || "";
        if (recipient) return { recipient, amount, note, merchant };
      }
    } catch {}

    try {
      const jsonPayload = JSON.parse(text);
      if (jsonPayload && typeof jsonPayload === "object") {
        recipient = jsonPayload.recipient || jsonPayload.address || jsonPayload.wallet || jsonPayload.destination || "";
        amount = jsonPayload.amount != null ? String(jsonPayload.amount) : "";
        note = jsonPayload.note || jsonPayload.message || jsonPayload.description || "";
        merchant = jsonPayload.merchant || jsonPayload.merchantName || jsonPayload.payee || jsonPayload.business || "";
        if (recipient) return { recipient, amount, note, merchant };
      }
    } catch {}

    try {
      if (text.includes("?")) {
        const [base, query] = text.split("?");
        const params = new URLSearchParams(query);
        recipient = params.get("address") || params.get("recipient") || params.get("wallet") || params.get("to") || base;
        amount = params.get("amount") || params.get("value") || "";
        note = params.get("note") || params.get("message") || "";
        merchant = params.get("merchant") || params.get("label") || "";
        if (recipient) return { recipient, amount, note, merchant };
      }
    } catch {}

    const walletMatch = text.match(/(nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59})/i);
    if (walletMatch) return { recipient: walletMatch[1], amount: "", note: "", merchant: "" };

    return { recipient: text, amount: "", note: "", merchant: "" };
  }

  const sendTxRef = useRef(sendTransaction);
  sendTxRef.current = sendTransaction;
  const onClearContextRef = useRef(onClearContext);
  onClearContextRef.current = onClearContext;

  const startScanWithCamera = useCallback(async (Html5Qrcode, Html5QrcodeSupportedFormats, cameraId) => {
    setPermissionState("starting");

    // Ensure DOM element exists before creating scanner
    const element = document.getElementById("qr-scanner");
    if (!element) {
      throw new Error("Scanner element not available");
    }

    const html5QrCode = new Html5Qrcode("qr-scanner", { verbose: false });
    scannerRef.current = html5QrCode;

    try {
      await html5QrCode.start(
      cameraId,
      {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
        disableFlip: false,
        showTorchButtonIfSupported: true,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      },
      async (decodedText) => {
        if (hasAutoSubmittedRef.current) return;
        hasAutoSubmittedRef.current = true;

        const { recipient, amount, note, merchant } = normalizeScannedText(decodedText);
        if (!recipient) {
          setScanError("Scanned QR is not a valid Nano address or payment payload.");
          hasAutoSubmittedRef.current = false;
          return;
        }

        setForm((state) => ({
          ...state,
          recipient,
          amount: amount || state.amount,
          note: note || state.note,
          merchant: merchant || state.merchant
        }));
        setStatus({ type: "success", message: "QR scanned. Processing payment...", txHash: null });
        await stopScanner();

        try {
          setLoading(true);
          const result = await sendTxRef.current({
            recipient,
            amount: parseFloat(amount) || 0,
            currency: "XNO",
            merchant: merchant || "",
            destination: recipient,
            note: note || "",
            reference: "",
            metadata: {}
          });

          const hasSuccessStatus = result?.status === "success";
          const hasTxHash = Boolean(result?.tx_hash);
          const isFailureStatus = result?.status === "failed";

          if (hasTxHash && (hasSuccessStatus || !isFailureStatus)) {
            const txIdFromResponse = result?.transaction?.id || result?.transaction_id;
            if (txIdFromResponse) {
              setTxId(txIdFromResponse);
            }

            setStatus({
              type: "success",
              message: "Payment submitted successfully",
              txHash: result.tx_hash
            });
            setForm({ recipient: "", amount: "", currency: "XNO", merchant: "", destination: "", note: "", reference: "" });
            clearSavedPaymentContext();
            setPaymentContext(null);
            onClearContextRef.current?.();

            if (txIdFromResponse) {
              setStatus({
                type: "pending",
                message: "Confirming on network (0s)...",
                txHash: result.tx_hash
              });
            }
          } else if (result?.status === "pending") {
            setStatus({
              type: "pending",
              message: result?.message || "Payment processing... Check back in a moment.",
              txHash: result?.tx_hash || null
            });
          } else {
            setStatus({
              type: "error",
              message: result?.error || "Payment failed. Please try again.",
              txHash: null
            });
            hasAutoSubmittedRef.current = false;
          }
        } catch (err) {
          const rawMessage = String(err?.message || "Payment failed. Please try again.");
          const needsFunding = /fund|receive|activate|activated|wallet/i.test(rawMessage);
          setStatus({
            type: needsFunding ? "action_required" : "error",
            message: rawMessage,
            txHash: null
          });
          hasAutoSubmittedRef.current = false;
        } finally {
          setLoading(false);
        }
      },
      () => {}
    );
    } catch (startErr) {
      scannerRef.current = null;
      throw startErr;
    }

    setPermissionState("granted");
    setScannerLoading(false);
  }, []);

  const stopScanner = useCallback(async () => {
    await destroyScanner();
    setScanActive(false);
    setPermissionState("idle");
    setScannerLoading(false);
  }, [destroyScanner]);

  const openScanner = useCallback(async () => {
    if (scanActive || scannerRef.current || openingRef.current) return;
    openingRef.current = true;
    if (typeof window !== "undefined" && window.location && !window.location.protocol.includes("https") && !window.location.hostname.includes("localhost") && !window.location.hostname.includes("127.0.0.1")) {
      setScanError("Camera access requires HTTPS. Please use a secure connection.");
      openingRef.current = false;
      return;
    }

    setScanActive(true);
    setScanError("");
    setScannerLoading(true);
    setPermissionState("requesting");
    hasAutoSubmittedRef.current = false;

    try {
      // STEP 1: Detect if any camera hardware exists BEFORE anything else
      let videoDevices;
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = allDevices.filter(d => d.kind === "videoinput");
      } catch {
        throw new Error("Failed to enumerate devices on this system.");
      }
      if (videoDevices.length === 0) {
        throw Object.assign(new Error("No camera detected on this device."), { code: "NO_CAMERA_DEVICE" });
      }

      // STEP 2: Trigger browser permission prompt while user gesture is still active
      // Use video:true (no facingMode) to avoid OverconstrainedError on desktops
      // with a single front-facing camera that has no "environment" facing
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      mediaStreamRef.current = permissionStream;
      setPermissionState("granted");

      // STEP 3 + 4: Import library, enumerate cameras (labels now available)
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      let cameras;
      try {
        cameras = await Html5Qrcode.getCameras();
      } catch (err) {
        throw new Error(`Failed to detect cameras: ${err.message}`);
      }

      if (!cameras || cameras.length === 0) {
        throw new Error("NoCameras");
      }

      // Release permission stream and let camera hardware settle
      stopAllMediaTracks();
      await new Promise(r => setTimeout(r, 350));

      const rearCamera = cameras.find(
        (c) => /back|rear|environment|camera\d|back-facing/i.test(c.label)
      );

      try {
        if (rearCamera) {
          await startScanWithCamera(Html5Qrcode, Html5QrcodeSupportedFormats, rearCamera.id);
        } else {
          const fallbackCam = cameras[cameras.length - 1];
          await startScanWithCamera(Html5Qrcode, Html5QrcodeSupportedFormats, fallbackCam.id);
        }
      } catch (err) {
        if (cameras.length > 1 && rearCamera) {
          const frontCamera = cameras.find(c => !/back|rear|environment/i.test(c.label)) || cameras[0];
          try {
            await startScanWithCamera(Html5Qrcode, Html5QrcodeSupportedFormats, frontCamera.id);
          } catch (fallbackErr) {
            throw new Error(`All cameras failed: ${fallbackErr.message}`);
          }
        } else {
          throw err;
        }
      }
    } catch (err) {
      const errName = err?.name || "";
      const errMsg = String(err?.message || "");
      const errCode = err?.code || "";

      let reason;
      if (errCode === "NO_CAMERA_DEVICE") {
        reason = "No camera detected on this device.";
      } else if (errName === "NotAllowedError" || errName === "PermissionDeniedError" || errMsg.includes("Permission denied") || errMsg.includes("permission")) {
        reason = "Camera permission denied. Please allow camera access in your browser settings and try again.";
        setPermissionState("denied");
      } else if (errName === "NotFoundError" || errMsg === "NoCameras" || errMsg.includes("No camera") || errMsg.includes("no camera")) {
        reason = "No camera found on this device. Please use a device with a camera.";
      } else if (errName === "NotReadableError" || errMsg.includes("already in use")) {
        reason = "Camera is already in use by another application. Please close other apps using the camera.";
      } else if (errName === "OverconstrainedError" || errMsg.includes("constraint")) {
        reason = "Camera does not support the required resolution. Please try a different camera.";
      } else if (errName === "SecurityError" || errMsg.includes("secure context") || errMsg.includes("HTTPS")) {
        reason = "Camera access requires a secure connection (HTTPS).";
      } else if (errMsg.includes("NotAllowedError") || errMsg.includes("The request is not allowed")) {
        reason = "Camera permission was denied. Please reset camera permissions in your browser settings.";
        setPermissionState("denied");
      } else {
        reason = errMsg || `Camera error: "${errName}"${errCode ? ` (code: ${errCode})` : ""}`;
      }

      setScanError(reason);
      setScanActive(false);
      setScannerLoading(false);
      await destroyScanner();
    } finally {
      openingRef.current = false;
    }
  }, [scanActive, stopAllMediaTracks, startScanWithCamera, destroyScanner]);

  const handleClearPaymentContext = useCallback(() => {
    setPaymentContext(null);
    clearSavedPaymentContext();
    onClearContext?.();
    setForm({ recipient: "", amount: "", currency: "XNO", merchant: "", destination: "", note: "", reference: "" });
    setStatus({ type: "idle", message: "", txHash: null });
  }, [onClearContext]);

  return (
    <div className="stack-lg stitch-bg stitch-send-screen">
      <section className="card form-card glass-card send-surface stitch-send-card">
        <span className="eyebrow">Quick Transfer</span>
        <h1>Send Payment</h1>
        <p className="muted">Smart payment flow with QR-backed autofill, secure routing, and Fina assistant guidance.</p>

        <div className="send-ai-sections">
          <AIInsightCard transactions={[]} finaImage={FINA_AI_IMAGE} onNavigate={null} />
          <div className="sidebar-section goals-section">
            <div className="goals-header">
              <h4>Your Goals</h4>
              <button className="set-goal-btn" onClick={handleOpenCreateGoal}>
                Set Goal
              </button>
            </div>
            <GoalProgress goals={goals} onEdit={handleOpenEditGoal} onDelete={handleDeleteGoal} />
          </div>
        </div>

        {paymentContext && (
          <div className="payment-preview glass-card">
            <div className="preview-heading">Scanned Payment Preview</div>
            <div className="preview-row">
              <span>Merchant</span>
              <strong>{paymentContext.merchant || "Unknown merchant"}</strong>
            </div>
            <div className="preview-row">
              <span>Recipient</span>
              <strong>{paymentContext.recipient || paymentContext.destination || "Unknown"}</strong>
            </div>
            <div className="preview-row">
              <span>Amount</span>
              <strong>{paymentContext.amount || form.amount || "TBD"} {paymentContext.currency || form.currency}</strong>
            </div>
            {paymentContext.note && (
              <div className="preview-row">
                <span>Note</span>
                <strong>{paymentContext.note}</strong>
              </div>
            )}
            {paymentContext.reference && (
              <div className="preview-row">
                <span>Reference</span>
                <strong>{paymentContext.reference}</strong>
              </div>
            )}
            <div className="preview-row preview-raw">
              <span>Source</span>
              <strong>{paymentContext.source === "qr" ? "QR Scan" : "Manual"}</strong>
            </div>
            <button type="button" className="ghost-button" onClick={handleClearPaymentContext}>
              Clear scanned payment
            </button>
          </div>
        )}

        {smartWarnings.length > 0 && (
          <div className="status warning">
            <strong>Smart Review</strong>
            <p>{smartWarnings.join(" ")}</p>
          </div>
        )}

        <form onSubmit={submit}>
          <div className="payment-field-group">
            <input
              name="recipient"
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              placeholder="Recipient (email or Nano address)"
              value={form.recipient}
              required
              disabled={loading}
            />
            <input
              name="amount"
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Amount"
              value={form.amount}
              required
              disabled={loading}
            />
          </div>

          <div className="payment-field-group">
            <input
              name="currency"
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              placeholder="Currency"
              value={form.currency}
              disabled={loading}
            />
            <input
              name="merchant"
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              placeholder="Merchant"
              value={form.merchant}
              disabled={loading}
            />
          </div>

          <input
            name="destination"
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            placeholder="Payment destination"
            value={form.destination}
            disabled={loading}
          />
          <input
            name="note"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Note / description"
            value={form.note}
            disabled={loading}
          />
          <input
            name="reference"
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            placeholder="Reference"
            value={form.reference}
            disabled={loading}
          />

          <div className="qr-scan-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={openScanner}
              disabled={loading}
            >
              Scan QR
            </button>
            <span className="muted">Use your camera to autofill and preserve payment context.</span>
          </div>

          <div className="qr-scanner-container" style={{ display: scanActive ? '' : 'none' }}>
            {scannerLoading && (
              <div className="scanner-loading-overlay">
                <div className="loading-spinner"></div>
                <span>Initializing camera...</span>
              </div>
            )}
            <div id="qr-scanner" ref={scannerContainerRef} />
            <div className="scanner-caption">
              {permissionState === "requesting" ? "Requesting camera permission..." : permissionState === "starting" ? "Starting camera..." : "Point your camera at a QR code to scan."}
            </div>
            <button type="button" className="ghost-button" onClick={stopScanner}>
              Stop scanner
            </button>
          </div>

          {scanError && (
            <div className="status error">
              <p>{scanError}</p>
              {permissionState === "denied" && (
                <div className="manual-fallback-actions">
                  <button type="button" className="ghost-button" onClick={openScanner}>
                    Try Camera Again
                  </button>
                  <button type="button" className="primary-button" onClick={() => { setScanError(""); setScanActive(false); setPermissionState("idle"); }}>
                    Enter Address Manually
                  </button>
                </div>
              )}
            </div>
          )}

          {status.type === "error" && (
            <div className="status error">
              <strong>Payment Failed</strong>
              <p>{status.message}</p>
            </div>
          )}

          {status.type === "action_required" && (
            <div className="status action-required">
              <strong>Action Required</strong>
              <p>{status.message}</p>
              <p className="muted">To continue, receive Nano to your wallet address first. This app does not sell Nano directly.</p>
            </div>
          )}

          {status.type === "pending" && (
            <div className="status pending">
              <strong>Processing Payment</strong>
              <p>{status.message}</p>
            </div>
          )}

          {status.type === "success" && (
            <div className="status success">
              <strong>Payment Successful</strong>
              <p>{status.message}</p>
              {status.txHash && (
                <p className="tx-hash">
                  Hash: {status.txHash.slice(0, 16)}...
                  <button type="button" className="copy-button" onClick={() => navigator.clipboard.writeText(status.txHash)}>
                    Copy
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="trust-note">Powered by Nano network - Instant settlement</div>

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Payment"}
          </button>
        </form>
      </section>

      {showGoalModal && (
        <div className="goal-modal-overlay" onClick={() => setShowGoalModal(false)}>
          <div className="goal-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingGoal ? "Edit Goal" : "Set New Goal"}</h3>
              <button className="modal-close" onClick={() => setShowGoalModal(false)}>×</button>
            </div>
            <form className="goal-form" onSubmit={handleSaveGoal}>
              <div className="form-group">
                <label htmlFor="goal-name">Goal Name</label>
                <input
                  id="goal-name"
                  type="text"
                  placeholder="e.g., New Laptop, Vacation"
                  value={goalForm.name}
                  onChange={e => setGoalForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="goal-target">Target Amount (XNO)</label>
                <input
                  id="goal-target"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder="0.0000"
                  value={goalForm.target}
                  onChange={e => setGoalForm(prev => ({ ...prev, target: e.target.value }))}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowGoalModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-save">
                  {editingGoal ? "Update Goal" : "Create Goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
