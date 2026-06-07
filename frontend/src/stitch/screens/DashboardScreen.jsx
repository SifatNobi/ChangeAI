import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import TransactionItem from "../components/TransactionItem";
import { buildMerchantQrPayload, formatAmount } from "../utils/format";

export default function DashboardScreen({ profile, token, loadHistory }) {
  const [transactions, setTransactions] = useState([]);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const sessionId = useMemo(() => {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  useEffect(() => {
    if (!token) return;
    loadHistory({ limit: 5 })
      .then((d) => setTransactions(d?.transactions || []))
      .catch(() => setTransactions([]));
  }, [token, loadHistory]);

  const balance = profile?.balance?.balanceNano || "0";
  const walletAddress =
    profile?.walletAddress ||
    profile?.user?.walletAddress ||
    profile?.balance?.walletAddress ||
    "";

  const receiveUri = useMemo(
    () => buildMerchantQrPayload(
      walletAddress,
      receiveAmount,
      profile?.user?.id || profile?.id,
      profile?.user?.name || profile?.name
    ),
    [walletAddress, receiveAmount, profile]
  );

  useEffect(() => {
    if (!receiveUri) {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(receiveUri, { margin: 1, width: 320 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [receiveUri]);

  return (
    <div className="stack-lg stitch-bg stitch-dashboard-screen">
      <header className="merchant-header card glass-card stitch-dashboard-header">
        <div>
          <span className="eyebrow">Merchant HQ</span>
          <h1 className="merchant-name">{profile?.user?.name || "CyberNexus Systems"}</h1>
          <div className="wallet-chip">
            <span>wallet</span>
            <span className="mono">{walletAddress || "nano_3x...7u8"}</span>
          </div>
        </div>
        <div className="pill confirmed">Network: Live</div>
      </header>

      <section className="card hero-panel glass-card neon-sheen stitch-balance-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Current Treasury</span>
            <h1>Dashboard</h1>
          </div>
          <div className="pill confirmed">Live</div>
        </div>

        <p className="muted">Balance and recent activity for your ChangeAIPay wallet. Scan QR to pay instantly.</p>
        <div className="summary-card">
          <span className="eyebrow">Current Treasury</span>
          <strong>{formatAmount(balance)} XNO</strong>
        </div>
        <div className="hero-actions">
          <a className="primary-button action-pill" href="#receive">
            Generate QR
          </a>
          <a className="ghost-button action-pill" href="#history">
            History
          </a>
        </div>
      </section>

      <section className="receive-grid stitch-dual-grid">
        <article className="card qr-card glass-card stitch-receive-card" id="receive">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Receive</span>
              <h2>Payment QR</h2>
            </div>
          </div>

          <label className="field-label stitch-qr-label" htmlFor="receive-amount">
            Enter Amount (XNO)
          </label>
          <input
            id="receive-amount"
            name="receive-amount"
            value={receiveAmount}
            onChange={(e) => setReceiveAmount(e.target.value)}
            placeholder="0.00"
          />

          {qrDataUrl ? (
            <img alt="Payment QR code" src={qrDataUrl} />
          ) : (
            <div className="empty-qr">
              <p className="muted">Add amount to generate QR</p>
            </div>
          )}

          <div className="wallet-panel">
            <span className="wallet-label">Wallet Address</span>
            <code>{walletAddress || "Wallet not available in profile"}</code>
          </div>
        </article>

        <article className="card glass-card market-card stitch-market-card">
          <span className="eyebrow">History</span>
          <h2>Recent Flux</h2>
          <p className="muted">Ledger activity from your account.</p>
          <div className="market-bars">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="pill">{transactions.length} entries</div>
        </article>
      </section>

      <section className="card glass-card stitch-history-card" id="history">
        <div className="section-heading">
          <div>
            <span className="eyebrow">History</span>
            <h2>Transactions</h2>
          </div>
        </div>

        <div className="list-grid">
          {transactions.length === 0 && (
            <div className="empty-state">
              No transactions yet — your payments will appear here.
            </div>
          )}

          {transactions.map((t, i) => (
            <TransactionItem key={t?.id || t?.txHash || i} transaction={t} />
          ))}
        </div>
      </section>

      <section className="card glass-card stitch-about-card">
        <span className="eyebrow">Why choose ChangeAIPay</span>
        <h2>Instant, zero-fee payments using Nano</h2>
        <p className="muted">
          Merchants can save up to 2–5% per transaction. Consumers avoid hidden fees. Savings may vary based on usage.
        </p>
        <div className="compare-grid">
          <div className="compare-card">
            <strong>Traditional payments</strong>
            <p>2–5% fees</p>
          </div>
          <div className="compare-card highlight">
            <strong>Our system</strong>
            <p>0% fees</p>
          </div>
        </div>
        <div className="trust-list">
          <p>Powered by Nano network</p>
          <p>Instant settlement</p>
          <p>Transparent, no hidden fees</p>
        </div>
      </section>
    </div>
  );
}

