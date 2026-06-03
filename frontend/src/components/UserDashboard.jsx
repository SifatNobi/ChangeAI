import React, { useState, useEffect, useMemo, useCallback } from "react";
import { getToken } from "../api";
import { getPaymentHistory, getCurrentSubscription, getSubscriptionUsage } from "../api";
import { FINA_AI_IMAGE, COMPANY_LOGO, COMPANY_NAME } from "../constants/branding";
import { RealtimeChart, RealtimeFeed, StatCard, AIInsightCard, GoalProgress, SubscriptionStatus } from "./RealtimeDashboard";
import QRCode from "qrcode";
import { buildNanoUri } from "../stitch/utils/format";
import "./UserDashboard.css";

const GOALS_STORAGE_KEY = "changeaipay_goals";

function loadGoals() {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals) {
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch (e) {
    console.error("Failed to save goals:", e);
  }
}

const UserDashboard = React.memo(function UserDashboard({ profile, token, onNavigate }) {
  const [stats, setStats] = useState({
    balance: "0",
    totalReceived: "0",
    totalSent: "0",
    transactionCount: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState(loadGoals);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({ name: "", target: "" });
  const [qrAmount, setQrAmount] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  const sessionId = useMemo(() => {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  const walletAddress =
    profile?.walletAddress ||
    profile?.user?.walletAddress ||
    profile?.balance?.walletAddress ||
    "";

  const receiveUri = useMemo(
    () => buildNanoUri(walletAddress, qrAmount, sessionId),
    [walletAddress, qrAmount, sessionId]
  );

  useEffect(() => {
    if (!receiveUri) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(receiveUri, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [receiveUri]);

  const handleCopyAddress = useCallback(() => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [walletAddress]);

  const handleDownloadQR = useCallback(() => {
    if (qrDataUrl) {
      const link = document.createElement("a");
      link.download = `changeaipay-qr-${Date.now()}.png`;
      link.href = qrDataUrl;
      link.click();
    }
  }, [qrDataUrl]);

  const loadDashboardData = useCallback(async () => {
    try {
      const authToken = token || getToken();
      if (!authToken) return;

      const [historyData, subData, usageData] = await Promise.all([
        getPaymentHistory(authToken, { limit: 20 }),
        getCurrentSubscription(authToken),
        getSubscriptionUsage(authToken).catch(() => ({}))
      ]);

      if (historyData?.transactions) {
        setTransactions(historyData.transactions);
        
        const summary = historyData.summary || {};
        setStats({
          balance: profile?.balance?.balanceNano || "0",
          totalReceived: summary.received || "0",
          totalSent: summary.sent || "0",
          totalTransactions: historyData.total || 0
        });
      }

      if (subData?.subscription) {
        setSubscription(subData.subscription);
      }

      if (usageData?.usage) {
        setUsage(usageData.usage);
      }

      const newNotifications = [];
      if (!historyData?.transactions?.length) {
        newNotifications.push({ id: 1, type: "info", title: "Welcome to ChangeAIPay!", message: "Start sending and receiving crypto instantly." });
      }
      setNotifications(newNotifications);

    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [token, profile?.balance?.balanceNano]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Refresh subscription when returning to dashboard (handles subscription state changes from other screens)
  useEffect(() => {
    const handleWindowFocus = async () => {
      const token = localStorage.getItem("changeaipay_token");
      if (token) {
        try {
          const sub = await getCurrentSubscription(token);
          if (sub) {
            setSubscription(sub);
          }
        } catch (err) {
          console.error("Failed to refresh subscription on focus:", err);
        }
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, []);

  useEffect(() => {
    saveGoals(goals);
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

  const currentBalance = useMemo(() => parseFloat(stats.balance || 0), [stats.balance]);

  const goalsWithProgress = useMemo(() => goals.map(goal => ({
    ...goal,
    current: Math.min(currentBalance, goal.target)
  })), [goals, currentBalance]);

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

  const balanceChartData = useMemo(() => transactions.slice(0, 7).reverse().map((t, i) => ({
    value: parseFloat(t.amount || 0),
    label: new Date(t.createdAt).toLocaleDateString("en", { weekday: "short" })
  })), [transactions]);

  const transactionFeed = useMemo(() => transactions.slice(0, 8).map(t => ({
    id: t._id || t.hash,
    title: t.direction === "incoming" ? `Received ${t.amount} XNO` : `Sent ${t.amount} XNO`,
    subtitle: t.toAddress?.substring(0, 12) + "..." || t.fromAddress?.substring(0, 12) + "...",
    direction: t.direction,
    time: getRelativeTime(t.createdAt),
    isNew: false
  })), [transactions]);

  const aiInsights = useMemo(() => transactions.length > 5 ? [
    {
      icon: "📊",
      title: "Activity Summary",
      description: `You've made ${transactions.length} transactions recently.`
    }
  ] : [], [transactions.length]);

  if (loading) {
    return (
      <div className="user-dashboard-loading">
        <div className="loading-spinner"></div>
        <span>Loading your dashboard...</span>
      </div>
    );
  }

  return (
    <div className="user-dashboard">
      <div className="dashboard-header">
        <div className="header-brand">
          <img src={COMPANY_LOGO} alt={COMPANY_NAME} className="header-logo" />
          <div className="header-greeting">
            <h1>Welcome back, {profile?.user?.name || "User"}</h1>
            <p>Here's your financial overview</p>
          </div>
        </div>
        <div className="header-fina" onClick={() => window.dispatchEvent(new CustomEvent("open-ai-assistant"))} style={{ cursor: "pointer" }}>
          <img src={FINA_AI_IMAGE} alt="Fina" className="fina-avatar" />
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          title="Balance"
          value={`${parseFloat(stats.balance || 0).toFixed(4)} XNO`}
          icon="💰"
        />
        <StatCard
          title="Received"
          value={`${parseFloat(stats.totalReceived || 0).toFixed(4)} XNO`}
          icon="↓"
        />
        <StatCard
          title="Sent"
          value={`${parseFloat(stats.totalSent || 0).toFixed(4)} XNO`}
          icon="↑"
        />
        <StatCard
          title="Transactions"
          value={stats.totalTransactions || 0}
          icon="📊"
        />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="dashboard-section balance-section">
            <RealtimeChart
              title="Balance History"
              subtitle="Last 7 days"
              data={balanceChartData}
              type="line"
              height={220}
            />
          </section>

          <section className="dashboard-section activity-section">
            <div className="section-header">
              <h3>Recent Activity</h3>
              <button className="view-all-btn" onClick={() => onNavigate?.("/history")}>
                View All
              </button>
            </div>
            <RealtimeFeed 
              items={transactionFeed} 
              type="transactions" 
              maxItems={6}
            />
          </section>
        </div>

        <div className="dashboard-sidebar">
          <AIInsightCard 
            insights={aiInsights}
            finaImage={FINA_AI_IMAGE}
            transactions={transactions}
            profile={profile}
            onNavigate={onNavigate}
          />

          <div className="sidebar-section subscription-section">
            <SubscriptionStatus 
              plan={subscription?.plan || "free_trial"}
              status={subscription?.status}
              usage={usage}
              onUpgrade={() => onNavigate?.("/pricing")}
            />
          </div>

          <div className="sidebar-section goals-section">
            <div className="goals-header">
              <h4>Your Goals</h4>
              <button className="set-goal-btn" onClick={handleOpenCreateGoal}>
                Set Goal
              </button>
            </div>
            <GoalProgress 
              goals={goalsWithProgress} 
              onEdit={handleOpenEditGoal}
              onDelete={handleDeleteGoal}
            />
          </div>

          <div className="sidebar-section qr-widget-section">
            <h4>Quick QR Generator</h4>
            <div className="qr-widget">
              <div className="qr-input-group">
                <label htmlFor="qr-amount">Amount (XNO)</label>
                <input
                  id="qr-amount"
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="0.0000"
                  value={qrAmount}
                  onChange={e => setQrAmount(e.target.value)}
                />
              </div>
              {qrDataUrl ? (
                <img alt="Payment QR" src={qrDataUrl} className="qr-image" />
              ) : (
                <div className="qr-placeholder">
                  <span>Enter amount to generate QR</span>
                </div>
              )}
              <div className="qr-address-row">
                <code className="qr-address" title={walletAddress}>
                  {walletAddress ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-6)}` : "No address"}
                </code>
                <button className="qr-copy-btn" onClick={handleCopyAddress} title="Copy address">
                  {copySuccess ? "✓" : "📋"}
                </button>
              </div>
              <button
                className="qr-download-btn"
                onClick={handleDownloadQR}
                disabled={!qrDataUrl}
              >
                Download QR
              </button>
            </div>
          </div>
        </div>
      </div>

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

      {notifications.length > 0 && (
        <div className="dashboard-notifications">
          {notifications.map(notif => (
            <div key={notif.id} className={`dashboard-notif ${notif.type}`}>
              <span>{notif.title}</span>
              <button onClick={() => setNotifications(n => n.filter(x => x.id !== notif.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default UserDashboard;

function getRelativeTime(date) {
  if (!date) return "just now";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}