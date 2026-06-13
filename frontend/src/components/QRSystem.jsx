import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import QRCode from "qrcode";
import "./QRSystem.css";

const NANO_ADDRESS_REGEX = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/i;
const SCAN_COOLDOWN = 2000;
const DUPLICATE_SCAN_WINDOW = 10000;
const CAMERA_PERMISSION_TIMEOUT = 15000;
const CAMERA_RESTART_DELAY = 3000;

export function useQRScanner({ onScan, onError }) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const scannerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const openingRef = useRef(false);
  const lastScanTimeRef = useRef(0);
  const lastScanTextRef = useRef(null);
  const permissionTimeoutRef = useRef(null);
  const cameraRestartRef = useRef(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  const stopAllMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const validateNanoAddress = useCallback((text) => {
    const cleaned = String(text || "").trim().replace(/^nano:/i, "").split("?")[0];
    if (NANO_ADDRESS_REGEX.test(cleaned)) {
      return { valid: true, address: cleaned, type: "nano_address" };
    }

    const uriMatch = String(text || "").match(/nano:([13][13456789abcdefghijkmnopqrstuwxyz]{59})/i);
    if (uriMatch) {
      return { valid: true, address: uriMatch[1], type: "nano_uri" };
    }

    try {
      const url = new URL(String(text || ""));
      if (url.protocol === "nano:" && url.pathname) {
        return { valid: true, address: url.pathname.replace(/^\/+/, ""), type: "nano_protocol" };
      }
    } catch {}

    try {
      const params = new URLSearchParams(String(text || "").split("?")[1] || "");
      const nanoParam = params.get("nano") || params.get("address") || params.get("to");
      if (nanoParam && NANO_ADDRESS_REGEX.test(nanoParam)) {
        return { valid: true, address: nanoParam, type: "url_param" };
      }
    } catch {}

    return { valid: false, address: null, type: null };
  }, []);

  const parsePaymentPayload = useCallback((text) => {
    const rawValue = String(text || "").trim();
    if (!rawValue) {
      return { valid: false, rawValue: "" };
    }

    const payload = {
      valid: false,
      rawValue,
      type: null,
      address: null,
      recipient: null,
      destination: null,
      amount: null,
      currency: "XNO",
      merchant: "",
      merchantName: "",
      merchantId: "",
      merchant_id: "",
      note: "",
      description: "",
      reference: "",
      paymentDestination: "",
      timestamp: null,
      expiryTimestamp: null,
      qrVersion: null,
      expired: false,
      metadata: {}
    };

    try {
      const jsonPayload = JSON.parse(rawValue);
      if (jsonPayload && typeof jsonPayload === "object") {
        payload.type = jsonPayload.type || jsonPayload.source || "json_payment";
        payload.address = jsonPayload.recipientWallet || jsonPayload.recipient || jsonPayload.address || jsonPayload.wallet || jsonPayload.destination;
        payload.recipient = payload.address;
        payload.destination = jsonPayload.paymentDestination || jsonPayload.destination || payload.address;
        payload.amount = jsonPayload.amount ?? jsonPayload.value ?? jsonPayload.total ?? null;
        payload.currency = jsonPayload.currency || jsonPayload.currency_code || jsonPayload.asset || payload.currency;
        payload.merchant = jsonPayload.merchantName || jsonPayload.merchant || jsonPayload.payee || jsonPayload.business || "";
        payload.merchantName = jsonPayload.merchantName || payload.merchant;
        payload.merchantId = jsonPayload.merchant_id || jsonPayload.merchantId || "";
        payload.note = jsonPayload.description || jsonPayload.note || jsonPayload.message || "";
        payload.description = jsonPayload.description || payload.note;
        payload.reference = jsonPayload.reference || jsonPayload.memo || "";
        payload.paymentDestination = jsonPayload.paymentDestination || jsonPayload.destination || payload.destination;
        payload.timestamp = jsonPayload.timestamp || null;
        payload.expiryTimestamp = jsonPayload.expiryTimestamp || null;
        payload.qrVersion = jsonPayload.qrVersion || null;
        payload.metadata = jsonPayload.metadata || {};

        if (payload.expiryTimestamp && Date.now() / 1000 > payload.expiryTimestamp) {
          payload.expired = true;
          payload.valid = false;
          return payload;
        }
      }
    } catch {
      // not JSON, continue
    }

    if (!payload.address) {
      try {
        let parseable = rawValue;
        if (/^[a-zA-Z0-9_]+:[^/]/.test(rawValue) && !rawValue.includes("//")) {
          parseable = rawValue.replace(/^([^:]+):/, "$1://");
        }
        const url = new URL(parseable);
        const params = url.searchParams;
        if (url.protocol === "nano:") {
          payload.address = url.pathname.replace(/^\/+/, "");
        }
        payload.destination = payload.destination || payload.address;
        payload.address = payload.address || params.get("address") || params.get("recipient") || params.get("wallet") || params.get("to") || params.get("destination");
        payload.amount = payload.amount ?? (params.get("amount") || params.get("value") || params.get("total"));
        payload.currency = params.get("currency") || params.get("asset") || payload.currency;
        payload.merchant = payload.merchant || params.get("merchant") || params.get("label") || params.get("payee") || "";
        payload.merchantId = payload.merchantId || params.get("merchant_id") || params.get("merchantId") || params.get("merchant-id") || "";
        payload.note = payload.note || params.get("note") || params.get("message") || params.get("description") || "";
        payload.reference = payload.reference || params.get("reference") || params.get("memo") || "";

        const metadata = {};
        params.forEach((value, key) => {
          if (!["address", "recipient", "wallet", "to", "destination", "amount", "value", "total", "currency", "asset", "merchant", "label", "payee", "merchant_id", "merchantId", "merchant-id", "note", "message", "description", "reference", "memo"].includes(key)) {
            metadata[key] = value;
          }
        });
        payload.metadata = { ...payload.metadata, ...metadata };
      } catch {
        // ignore invalid URL formats
      }
    }

    if (!payload.address) {
      const validation = validateNanoAddress(rawValue);
      if (validation.valid) {
        payload.address = validation.address;
        payload.recipient = validation.address;
        payload.destination = validation.address;
        payload.type = validation.type;
      }
    }

    if (payload.address) {
      payload.valid = true;
      payload.recipient = payload.recipient || payload.address;
      payload.destination = payload.destination || payload.address;
      payload.type = payload.type || "payment_payload";
    }

    return payload;
  }, [validateNanoAddress]);

  const handleScanSuccess = useCallback((decodedText) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < SCAN_COOLDOWN) {
      return;
    }
    const parsed = parsePaymentPayload(decodedText);
    if (decodedText === lastScanTextRef.current && now - lastScanTimeRef.current < DUPLICATE_SCAN_WINDOW) {
      return;
    }
    lastScanTimeRef.current = now;
    lastScanTextRef.current = decodedText;

    if (parsed.expired) {
      onErrorRef.current?.({
        message: "This payment request has expired.",
        rawValue: decodedText,
        expired: true
      });
      return;
    }

    if (!parsed.valid) {
      onErrorRef.current?.({
        message: "Invalid or unsupported QR payment payload.",
        rawValue: decodedText
      });
      return;
    }

    setLastScanned({
      ...parsed,
      timestamp: new Date().toISOString()
    });

    onScanRef.current?.({
      recipient: parsed.recipient,
      destination: parsed.destination || parsed.paymentDestination,
      amount: parsed.amount != null ? parseFloat(parsed.amount) : 0,
      currency: parsed.currency || "XNO",
      merchant: parsed.merchant,
      merchantName: parsed.merchantName,
      merchantId: parsed.merchantId,
      note: parsed.note,
      description: parsed.description,
      reference: parsed.reference,
      paymentDestination: parsed.paymentDestination,
      timestamp: parsed.timestamp,
      expiryTimestamp: parsed.expiryTimestamp,
      qrVersion: parsed.qrVersion,
      metadata: parsed.metadata,
      rawValue: parsed.rawValue,
      source: "qr",
      payloadType: parsed.type
    });
  }, [parsePaymentPayload]);

  const startScanning = useCallback(async (elementId) => {
    if (scannerRef.current || openingRef.current) return;
    openingRef.current = true;

    const element = document.getElementById(elementId);
    if (!element) {
      openingRef.current = false;
      throw new Error("Scanner element not found in DOM. Please try again.");
    }

    try {
      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
      }
      if (cameraRestartRef.current) {
        clearTimeout(cameraRestartRef.current);
      }

      setCameraError(null);
      setIsPermissionDenied(false);

      // STEP 1: Detect if any camera hardware exists
      let videoDevices;
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = allDevices.filter(d => d.kind === "videoinput");
      } catch {
        throw Object.assign(new Error("Failed to enumerate devices on this system."), { code: "ENUMERATE_FAILED" });
      }
      if (videoDevices.length === 0) {
        throw Object.assign(new Error("No camera detected on this device."), { code: "NO_CAMERA_DEVICE" });
      }

      // STEP 2: Trigger browser permission prompt while user gesture is active
      // Use video:true (no facingMode) to avoid OverconstrainedError on desktops
      // with a single front-facing camera that has no "environment" facing
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      mediaStreamRef.current = permissionStream;

      // Enumerate cameras (labels now available since we have permission)
      let cameras = [];
      try {
        cameras = await Promise.race([
          Html5Qrcode.getCameras(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Camera detection timeout")), CAMERA_PERMISSION_TIMEOUT)
          )
        ]);
      } catch (err) {
        throw new Error(`Failed to detect cameras: ${err.message}`);
      }

      if (!cameras || cameras.length === 0) {
        throw Object.assign(new Error("No camera found on this device"), { code: "NO_CAMERAS" });
      }

      // Release permission stream and let camera hardware settle
      stopAllMediaTracks();
      await new Promise(r => setTimeout(r, 350));

      const rearCamera = cameras.find(
        (c) => /back|rear|environment|camera\d|back-facing/i.test(c.label)
      );
      const selectedCamera = rearCamera || cameras[cameras.length - 1];

      const html5QrCode = new Html5Qrcode(elementId, { verbose: false });
      scannerRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1.0,
            disableFlip: false,
            showTorchButtonIfSupported: true,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
          },
          handleScanSuccess,
          () => {}
        );
      } catch (startErr) {
        scannerRef.current = null;
        if (cameras.length > 1 && rearCamera) {
          const frontCamera = cameras.find(c => !/back|rear|environment/i.test(c.label)) || cameras[0];
          try {
            const fallbackCode = new Html5Qrcode(elementId, { verbose: false });
            scannerRef.current = fallbackCode;
            await fallbackCode.start(
              frontCamera.id,
              {
                fps: 10,
                qrbox: { width: 280, height: 280 },
                aspectRatio: 1.0,
                disableFlip: false,
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
              },
              handleScanSuccess,
              () => {}
            );
          } catch (fallbackErr) {
            scannerRef.current = null;
            throw new Error(`All cameras failed: ${fallbackErr.message}`);
          }
        } else {
          throw new Error(`Failed to start camera: ${startErr.message}`);
        }
      }

      setIsScanning(true);
      setHasPermission(true);
      setIsPermissionDenied(false);
      setCameraError(null);
    } catch (err) {
      const errorName = err.name || "";
      const errorMessage = err.message || "";
      const errorCode = err.code || "";

      let mappedError;
      if (errorCode === "NO_CAMERA_DEVICE") {
        mappedError = "No camera detected on this device.";
        setHasPermission(false);
      } else if (errorCode === "PERMISSION_DENIED" || errorName === "NotAllowedError" || errorName === "PermissionDeniedError" || errorMessage.toLowerCase().includes("permission")) {
        mappedError = "Camera permission denied. Please allow camera access in your browser settings and try again.";
        setHasPermission(false);
        setIsPermissionDenied(true);
      } else if (errorCode === "NO_CAMERAS" || errorName === "NotFoundError" || errorMessage.includes("No camera") || errorMessage.includes("no camera")) {
        mappedError = "No camera found on this device. Please use a device with a camera.";
        setHasPermission(false);
      } else if (errorName === "NotReadableError" || errorMessage.includes("already in use")) {
        mappedError = "Camera is already in use by another application. Please close other apps using the camera.";
        setHasPermission(false);
      } else if (errorName === "OverconstrainedError" || errorMessage.includes("constraint")) {
        mappedError = "Camera does not support the required resolution. Please try a different camera.";
        setHasPermission(false);
      } else if (errorName === "SecurityError") {
        mappedError = "Camera access requires a secure connection (HTTPS).";
        setHasPermission(false);
      } else if (errorMessage.includes("Scanner element not found")) {
        mappedError = errorMessage;
      } else {
        mappedError = errorMessage || `Camera error: "${errorName}"${errorCode ? ` (code: ${errorCode})` : ""}`;
        setHasPermission(false);
      }

      setCameraError(mappedError);
      onErrorRef.current?.({ message: mappedError, error: err });
      scannerRef.current = null;
      setIsScanning(false);
    } finally {
      openingRef.current = false;
    }
  }, [handleScanSuccess, stopAllMediaTracks]);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.log("Scanner cleanup error:", err);
      }
      scannerRef.current = null;
    }
    stopAllMediaTracks();
    setIsScanning(false);
  }, [stopAllMediaTracks]);

  const toggleTorch = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const capabilities = scannerRef.current.getRunningTrackCameraCapabilities();
        if (capabilities && capabilities.torchFeature && capabilities.torchFeature().isSupported()) {
          const currentState = await capabilities.torchFeature().value();
          await capabilities.torchFeature().apply(!currentState);
        }
      } catch (err) {
        console.log("Torch error:", err);
      }
    }
  }, []);

  const requestPermissionRetry = useCallback(async (elementId) => {
    setIsPermissionDenied(false);
    openingRef.current = false;
    await stopScanning();
    stopAllMediaTracks();
    cameraRestartRef.current = setTimeout(() => {
      startScanning(elementId);
    }, CAMERA_RESTART_DELAY);
  }, [startScanning, stopScanning, stopAllMediaTracks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
      }
      if (cameraRestartRef.current) {
        clearTimeout(cameraRestartRef.current);
      }
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
      stopAllMediaTracks();
    };
  }, [stopAllMediaTracks]);

  return {
    isScanning,
    hasPermission,
    lastScanned,
    cameraError,
    isPermissionDenied,
    startScanning,
    stopScanning,
    toggleTorch,
    requestPermissionRetry,
    validateNanoAddress
  };
}

export function QRReceiveQR({ walletAddress, amount, note, merchantName, currency, paymentDestination, reference }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [generating, setGenerating] = useState(false);

  const buildPaymentPayload = useCallback(() => {
    const payload = {
      merchantName: merchantName || "",
      recipientWallet: walletAddress.trim(),
      amount: String(amount || "0").trim(),
      currency: currency || "XNO",
      paymentDestination: paymentDestination || "",
      description: note || "",
      reference: reference || "",
      timestamp: Math.floor(Date.now() / 1000),
      expiryTimestamp: Math.floor(Date.now() / 1000) + 300,
      qrVersion: "1.0"
    };
    return JSON.stringify(payload);
  }, [walletAddress, amount, note, merchantName, currency, paymentDestination, reference]);

  useEffect(() => {
    if (!walletAddress) {
      setQrDataUrl("");
      return;
    }

    setGenerating(true);
    const payload = buildPaymentPayload();

    QRCode.toDataURL(payload, {
      margin: 1,
      width: 300,
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    })
      .then((url) => {
        setQrDataUrl(url);
        setGenerating(false);
      })
      .catch(() => {
        setQrDataUrl("");
        setGenerating(false);
      });
  }, [walletAddress, amount, note, merchantName, currency, paymentDestination, reference, buildPaymentPayload]);

  if (!walletAddress) {
    return (
      <div className="receive-qr-empty">
        <p>Enter your Nano wallet address to generate a QR code</p>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="receive-qr-loading">
        <p>Generating QR code...</p>
      </div>
    );
  }

  if (!qrDataUrl) {
    return (
      <div className="receive-qr-error">
        <p>Failed to generate QR code</p>
      </div>
    );
  }

  return (
    <div className="receive-qr-container">
      <img
        src={qrDataUrl}
        alt={`Payment QR for ${walletAddress.slice(0, 16)}...`}
        className="receive-qr-image"
      />
      <div className="receive-qr-address">
        <code>{walletAddress}</code>
        <button
          type="button"
          className="copy-address-btn"
          onClick={() => navigator.clipboard.writeText(walletAddress)}
        >
          Copy
        </button>
      </div>
      {amount && (
        <div className="receive-qr-amount">
          Amount: {amount} XNO
        </div>
      )}
    </div>
  );
}

export function QRPaymentScanner({ onPaymentReady, onCancel, walletAddress }) {
  const [mode, setMode] = useState("receive");
  const [qrType, setQrType] = useState("dynamic");
  const [recipient, setRecipient] = useState(walletAddress || "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("XNO");
  const [merchant, setMerchant] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [scannedData, setScannedData] = useState(null);
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const onPaymentReadyRef = useRef(onPaymentReady);
  onPaymentReadyRef.current = onPaymentReady;

  useEffect(() => {
    if (walletAddress && mode === "receive") {
      setRecipient(walletAddress);
    }
  }, [walletAddress, mode]);

  const { 
    startScanning, 
    stopScanning, 
    validateNanoAddress, 
    hasPermission,
    isPermissionDenied,
    cameraError,
    requestPermissionRetry
  } = useQRScanner({
    onScan: async (data) => {
      setScannedData(data);
      setRecipient(data.recipient || data.destination || "");
      setAmount(data.amount != null ? String(data.amount) : "");
      setCurrency(data.currency || "XNO");
      setMerchant(data.merchant || data.merchantName || "");
      setMerchantId(data.merchantId || "");
      setDestination(data.paymentDestination || data.destination || data.recipient || "");
      setNote(data.description || data.note || "");
      setReference(data.reference || "");
      setIsScanning(false);
      await stopScanning();
      setError(null);

      onPaymentReadyRef.current?.({
        recipient: data.recipient,
        amount: data.amount,
        currency: data.currency,
        merchant: data.merchant || data.merchantName,
        merchantName: data.merchantName,
        merchantId: data.merchantId,
        destination: data.paymentDestination || data.destination,
        note: data.description || data.note,
        description: data.description,
        reference: data.reference,
        paymentDestination: data.paymentDestination,
        timestamp: data.timestamp,
        expiryTimestamp: data.expiryTimestamp,
        qrVersion: data.qrVersion,
        metadata: data.metadata,
        rawValue: data.rawValue,
        source: data.source,
        scannedFromQR: true
      });
    },
    onError: (err) => {
      if (err.expired) {
        setError("This payment request has expired.");
      } else {
        setError(err.message || "Unable to scan QR code.");
      }
    }
  });

  const handleStartScan = async () => {
    setError(null);
    setIsScanning(true);
    await startScanning("qr-reader-container");
  };

  const handleStopScan = async () => {
    await stopScanning();
    setIsScanning(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validation = validateNanoAddress(recipient);
    if (!validation.valid) {
      setError("Invalid Nano address");
      return;
    }

    onPaymentReady?.({
      recipient: validation.address,
      amount: parseFloat(amount) || 0,
      currency,
      merchant,
      destination: destination || validation.address,
      note,
      reference,
      metadata: {},
      rawValue: recipient,
      source: "manual",
      scannedFromQR: false
    });
  };

  return (
    <div className="qr-payment-scanner">
      <div className="qr-mode-tabs">
        <button
          className={mode === "receive" ? "active" : ""}
          onClick={() => setMode("receive")}
        >
          Receive
        </button>
        <button
          className={mode === "send" ? "active" : ""}
          onClick={() => setMode("send")}
        >
          Send
        </button>
      </div>

      {mode === "receive" && (
        <div className="receive-mode">
          <h3>Receive Payment</h3>
          <p className="muted">Generate a QR code to receive payments</p>

          <div className="qr-type-tabs">
            {["static", "dynamic", "merchant", "personal"].map(type => (
              <button
                key={type}
                className={`qr-type-btn ${qrType === type ? "active" : ""}`}
                onClick={() => setQrType(type)}
              >
                {type === "static" && "📌 Static"}
                {type === "dynamic" && "⚡ Dynamic"}
                {type === "merchant" && "🏪 Merchant"}
                {type === "personal" && "👤 Personal"}
              </button>
            ))}
          </div>

          <form className="receive-form">
            {qrType !== "personal" && (
              <input
                type="text"
                placeholder="Your Nano Wallet Address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="address-input"
              />
            )}
            {qrType === "personal" && (
              <input
                type="text"
                placeholder="Your Nano Wallet Address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="address-input"
              />
            )}
            {qrType === "personal" && (
              <input
                type="text"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            )}
            {qrType === "personal" && (
              <input
                type="text"
                placeholder="Optional Note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
            {qrType === "dynamic" && (
              <>
                <input
                  type="number"
                  placeholder="Amount (XNO)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.000001"
                  min="0"
                />
                <input
                  type="text"
                  placeholder="Merchant Name"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Payment Destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </>
            )}
            {qrType === "merchant" && (
              <>
                <input
                  type="text"
                  placeholder="Merchant Name"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Payment Destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </>
            )}
            {qrType === "static" && (
              <p className="muted" style={{ textAlign: "center", padding: "8px" }}>
                Static QR encodes wallet address only. No amount or details.
              </p>
            )}
          </form>

          <div className="receive-qr-wrapper">
            {qrType === "static" ? (
              <QRReceiveQR walletAddress={recipient} amount="" note="" merchantName="" currency="" paymentDestination="" reference="" />
            ) : qrType === "personal" ? (
              <QRReceiveQR walletAddress={recipient} amount="" note={displayName ? `Pay to ${displayName}` : note} merchantName={displayName} currency="" paymentDestination="" reference="" />
            ) : qrType === "merchant" ? (
              <QRReceiveQR walletAddress={recipient} amount="" note="" merchantName={merchant} currency="" paymentDestination={destination} reference="" />
            ) : (
              <QRReceiveQR
                walletAddress={recipient}
                amount={amount}
                note={note}
                merchantName={merchant}
                currency={currency}
                paymentDestination={destination}
                reference={reference}
              />
            )}
          </div>
        </div>
      )}

      {mode === "send" && (
        <>
          {!isScanning ? (
            <button className="primary-button scan-btn" onClick={handleStartScan}>
              Scan QR Code
            </button>
          ) : null}
          {/* Always render container in DOM for reliable scanner init */}
          <div className="scanner-view" style={{ display: isScanning ? '' : 'none' }}>
            <div id="qr-reader-container" className="qr-reader"></div>
            <button className="ghost-button" onClick={handleStopScan}>
              Cancel
            </button>
          </div>

          {error && (
            <div className="qr-error">
              {error}
              {hasPermission === false && (
                <div className="manual-fallback-actions">
                  <button className="ghost-button" onClick={handleStartScan}>
                    Try Camera Again
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setError(null);
                      setIsScanning(false);
                    }}
                  >
                    Enter Manually
                  </button>
                </div>
              )}
            </div>
          )}

          {(scannedData || recipient) && (
            <div className="scanned-info">
              <div className="address-preview">
                {scannedData?.recipient || scannedData?.destination || recipient}
              </div>
              {scannedData?.merchant && <div className="merchant-preview">Merchant: {scannedData.merchant}</div>}
              {scannedData?.amount != null && <div className="amount-preview">Amount: {scannedData.amount} {scannedData.currency || "XNO"}</div>}
            </div>
          )}

          <form onSubmit={handleSubmit} className="payment-form">
            <input
              type="text"
              placeholder="Nano Address"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                setScannedData(null);
              }}
              className="address-input"
            />
            <input
              type="number"
              placeholder="Amount (XNO)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.000001"
              min="0"
            />
            <input
              type="text"
              placeholder="Merchant (optional)"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
            <input
              type="text"
              placeholder="Destination (optional)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <input
              type="text"
              placeholder="Reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={!recipient || !amount}
            >
              Send {amount || "0"} XNO
            </button>
          </form>
        </>
      )}

      {mode === "send" && onCancel && (
        <div className="qr-navigation-actions">
          <button className="ghost-button" onClick={onCancel}>Back to dashboard</button>
        </div>
      )}
    </div>
  );
}

export default useQRScanner;
