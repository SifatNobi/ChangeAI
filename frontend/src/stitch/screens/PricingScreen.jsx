import React, { useState, useEffect, useCallback } from "react";
import { FINA_AI_IMAGE, COMPANY_LOGO, COMPANY_NAME } from "../../constants/branding";
import { apiRequest, getToken, activateFreeTrial, getCurrentSubscription } from "../../api";
import { GoalProgress } from "../../components/RealtimeDashboard";
import "./PricingScreen.css";

const GOALS_STORAGE_KEY = "changeaipay_goals";

function loadGoals() {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

const CONSUMER_PLANS = [
  {
    id: "free_trial",
    name: "Free Trial",
    price: 0,
    period: "one-time",
    description: "Basic AI finance chat, send/request money, fraud alerts",
    features: [
      { text: "Basic AI finance chat", included: true },
      { text: "Send & request money", included: true },
      { text: "Basic fraud alerts", included: true },
      { text: "Smart transcripts", included: true },
      { text: "Low balance alerts", included: true },
      { text: "Full AI Assistant", included: false },
      { text: "Smart routing", included: false },
      { text: "AI Financial Autopilot", included: false },
      { text: "AI Negotiator", included: false }
    ],
    limits: { fxFee: "1.45%", monthlyCap: "€400", fxFree: "€0" },
    cta: "Current Plan",
    popular: false
  },
  {
    id: "edge",
    name: "Edge",
    price: 19.99,
    period: "month",
    description: "Full AI assistant, fraud protection, smart routing",
    features: [
      { text: "Full AI Assistant", included: true },
      { text: "Fraud protection", included: true },
      { text: "Smart routing", included: true },
      { text: "Predictive reminders", included: true },
      { text: "Spending alerts", included: true },
      { text: "Spending coach", included: true },
      { text: "AI Financial Autopilot", included: false },
      { text: "Smart Social Payments Brain", included: false },
      { text: "AI Negotiator", included: false }
    ],
    limits: { fxFee: "0.95%", monthlyCap: "Unlimited", fxFree: "£800/mo" },
    cta: "Upgrade to Edge",
    popular: false
  },
  {
    id: "prime",
    name: "Prime",
    price: 29.99,
    period: "month",
    description: "AI Financial Autopilot, smart undo, social payments",
    features: [
      { text: "Full AI Assistant", included: true },
      { text: "AI Financial Autopilot", included: true },
      { text: "Smart Undo Payments", included: true },
      { text: "Smart Social Payments Brain", included: true },
      { text: "Advanced fraud detection", included: true },
      { text: "Dynamic budget optimization", included: true },
      { text: "Spending coach", included: true },
      { text: "Goal-based AI system", included: true },
      { text: "AI Negotiator", included: false }
    ],
    limits: { fxFee: "0.72%", monthlyCap: "Unlimited", fxFree: "£2,400/mo" },
    cta: "Upgrade to Prime",
    popular: true
  },
  {
    id: "apex",
    name: "Apex",
    price: 49.99,
    period: "month",
    description: "Autonomous AI payments, AI negotiator, life events",
    tagline: "Ultimate AI Automation",
    features: [
      { text: "Autonomous AI Payments", included: true },
      { text: "AI Negotiator", included: true },
      { text: "Life Event Mode", included: true },
      { text: "Priority smart routing", included: true },
      { text: "Booking + pay workflows", included: true },
      { text: "Everything in Prime", included: true },
      { text: "AI Financial Autopilot", included: true },
      { text: "Smart Social Payments Brain", included: true },
      { text: "Unlimited AI chats", included: true }
    ],
    limits: { fxFee: "0.58%", monthlyCap: "Unlimited", fxFree: "£4,800/mo" },
    cta: "Upgrade to Apex",
    popular: false,
    legendary: true,
    legendaryTitle: "Legendary Choice"
  }
];

const MERCHANT_PLANS = [
  {
    id: "startup",
    name: "Startup",
    revenue: "Up to €10K/year",
    price: "1.25%",
    fx: "1.00%",
    description: "AI Revenue Booster, Basic Cash Flow Predictor",
    features: [
      { text: "AI Revenue Booster", included: true },
      { text: "Basic Cash Flow Predictor", included: true },
      { text: "Smart transcripts", included: true },
      { text: "Money monitoring", included: true },
      { text: "Entry analytics dashboard", included: true },
      { text: "Auto-Personalized Marketing", included: false },
      { text: "AI Upsell Assistant", included: false },
      { text: "Pricing suggestions", included: false },
      { text: "Smart Pricing Engine", included: false },
      { text: "Customer Lifetime Value", included: false },
      { text: "AI Customer Recovery", included: false },
      { text: "Enterprise features", included: false }
    ],
    cta: "Current Plan",
    popular: false
  },
  {
    id: "growth",
    name: "Growth",
    revenue: "€10K–€50K/year",
    price: "1.75%",
    fx: "0.85%",
    description: "Auto-Personalized Marketing, AI Upsell Assistant",
    features: [
      { text: "Everything in Startup", included: true },
      { text: "Auto-Personalized Marketing", included: true },
      { text: "AI Upsell Assistant", included: true },
      { text: "Pricing suggestions", included: true },
      { text: "Customer re-engagement tools", included: true },
      { text: "Smart Pricing Engine", included: false },
      { text: "Customer Lifetime Value", included: false },
      { text: "Business Health Dashboard", included: false },
      { text: "AI Customer Recovery", included: false },
      { text: "Enterprise features", included: false }
    ],
    cta: "Unlock by reaching transaction threshold",
    popular: false
  },
  {
    id: "scale",
    name: "Scale",
    revenue: "€50K–€100K/year",
    price: "2.25%",
    fx: "0.70%",
    description: "Smart Pricing Engine, Customer Lifetime Value",
    features: [
      { text: "Everything in Growth", included: true },
      { text: "Smart Pricing Engine", included: true },
      { text: "Customer Lifetime Value Predictor", included: true },
      { text: "Full Business Health Dashboard", included: true },
      { text: "Stronger Cash Flow Predictor", included: true },
      { text: "AI Customer Recovery", included: false },
      { text: "Dynamic demand pricing", included: false },
      { text: "Enterprise features", included: false }
    ],
    cta: "Unlock by reaching merchant volume threshold",
    popular: true
  },
  {
    id: "premium",
    name: "Premium",
    revenue: "€100K+/year",
    price: "2.75% capped",
    fx: "0.60%",
    description: "AI Customer Recovery, Dynamic demand pricing",
    features: [
      { text: "Everything in Scale", included: true },
      { text: "AI Customer Recovery System", included: true },
      { text: "Dynamic demand pricing", included: true },
      { text: "Advanced churn prevention", included: true },
      { text: "Priority support", included: true },
      { text: "Premium analytics", included: true },
      { text: "Enterprise features", included: false }
    ],
    cta: "Unlock by reaching processing threshold",
    popular: false
  },
  {
    id: "retention",
    name: "Retention",
    revenue: "€400K+/year",
    price: "2.35%",
    fx: "0.50%",
    description: "Retention-focused AI campaigns, Profitability optimization",
    features: [
      { text: "Everything in Premium", included: true },
      { text: "Retention-focused AI campaigns", included: true },
      { text: "Profitability optimization models", included: true },
      { text: "Lower FX pricing", included: true },
      { text: "Enterprise features", included: false }
    ],
    cta: "Unlock by reaching retention threshold",
    popular: false
  },
  {
    id: "enterprise",
    name: "Enterprise",
    revenue: "€500K+/year",
    price: "2.20% enterprise cap",
    fx: "0.45%",
    description: "AI call handling, Custom workflows, API customization",
    features: [
      { text: "Everything in Retention", included: true },
      { text: "AI call handling and messaging", included: true },
      { text: "Custom AI workflow automation", included: true },
      { text: "Enterprise infrastructure licensing", included: true },
      { text: "Dedicated fraud intelligence models", included: true },
      { text: "API customization", included: true },
      { text: "Private routing logic", included: true },
      { text: "Strategic account management", included: true }
    ],
    cta: "Unlock by reaching enterprise threshold",
    popular: false,
    legendary: true,
    legendaryTitle: "Legendary Choice"
  }
];

export default function PricingScreen({ currentPlan = "free_trial", onSelectPlan, onNavigate, userRole = "user" }) {
  const [loading, setLoading] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [clickedPlan, setClickedPlan] = useState(null);
  const [activeTab, setActiveTab] = useState(userRole === "merchant" ? "merchants" : "consumers");
  const [goals, setGoals] = useState(loadGoals);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({ name: "", target: "" });

  useEffect(() => {
    loadCurrentSubscription();
  }, []);

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

  const loadCurrentSubscription = async () => {
    try {
      const token = localStorage.getItem("changeaipay_token") || localStorage.getItem("token");
      if (token) {
        const data = await apiRequest("/subscription/current", { token });
        if (data?.subscription) {
          setCurrentSubscription(data.subscription);
        }
      }
    } catch (err) {
      console.log("No subscription found");
    }
  };

  const handleSelectPlan = async (planId) => {
    if (planId === "free_trial") {
      setClickedPlan(planId);
      setTimeout(() => setClickedPlan(null), 600);
      setLoading(true);
      try {
        const token = getToken();
        const result = await activateFreeTrial(token);
        if (result?.success) {
          alert("Free Trial activated! Complete your first transaction within 24 hours to keep your 7-day trial benefits.");
          
          // Wait a brief moment for backend to fully process, then reload subscription data
          // This ensures we get the fresh state from the server
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Force a fresh fetch of subscription data (bypasses any stale cache)
          const freshSubscription = await getCurrentSubscription(token);
          if (freshSubscription?.subscription) {
            setCurrentSubscription(freshSubscription.subscription);
          } else {
            // Fallback to local state if fetch fails
            setCurrentSubscription(prev => ({
              ...prev,
              plan: "free_trial",
              status: "active",
              freeTrial: {
                activated: true,
                clickedActivation: true,
                firstTransactionCompleted: false,
                expiresAt: result.trial?.expiresAt
              }
            }));
          }
        } else {
          alert(result?.error || "Failed to activate Free Trial");
        }
      } catch (err) {
        console.error("Free trial activation error:", err);
        alert("Failed to activate Free Trial. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }
    
    setClickedPlan(planId);
    setTimeout(() => setClickedPlan(null), 600);
    
    setLoading(true);
    try {
      onNavigate?.(`/checkout/${planId}`);
    } catch (err) {
      console.error("Failed to navigate to checkout:", err);
    } finally {
      setLoading(false);
    }
  };

  const CONSUMER_PLAN_ORDER = ["free_trial", "edge", "prime", "apex"];
  const effectivePlan = currentSubscription?.plan || currentPlan || "free_trial";
  const currentPlanIndex = CONSUMER_PLAN_ORDER.indexOf(effectivePlan);
  const isActiveFreeTrial = currentSubscription?.plan === "free_trial" && currentSubscription?.freeTrial?.activated;

  const displayPlans = activeTab === "consumers" ? CONSUMER_PLANS : MERCHANT_PLANS;

  const getPlanState = (planId) => {
    const isCurrentPlan = planId === currentSubscription?.plan && (planId !== "free_trial" || isActiveFreeTrial);
    if (isCurrentPlan) return "current";

    if (activeTab === "consumers" && planId === "free_trial") {
      if (currentPlanIndex > 0) return "downgrade-locked";
      return "available";
    }

    if (activeTab === "consumers") {
      const planIndex = CONSUMER_PLAN_ORDER.indexOf(planId);
      if (planIndex < currentPlanIndex) return "downgrade-locked";
    }

    return "upgrade";
  };

  return (
    <div className="pricing-page stitch-bg">
      <header className="pricing-header">
        <img src={COMPANY_LOGO} alt={COMPANY_NAME} className="pricing-logo" />
        <h1>Choose Your Plan</h1>
        <p>Unlock premium AI features and supercharge your payments</p>
      </header>

      <div className="pricing-tabs">
        <button
          className={`pricing-tab ${activeTab === "consumers" ? "active" : ""}`}
          onClick={() => setActiveTab("consumers")}
        >
          Consumers
        </button>
        <button
          className={`pricing-tab ${activeTab === "merchants" ? "active" : ""}`}
          onClick={() => setActiveTab("merchants")}
        >
          Merchants
        </button>
      </div>

      <div className="pricing-fina">
        <img src={FINA_AI_IMAGE} alt="Fina" className="fina-avatar" onClick={() => window.dispatchEvent(new CustomEvent("open-ai-assistant"))} style={{ cursor: "pointer" }} />
        <p>{activeTab === "consumers" ? "Upgrade your experience with Fina AI!" : "Fina AI helps merchants maximize revenue!"}</p>
      </div>

      {activeTab === "consumers" && (
        <div className="pricing-goals-section">
          <div className="pricing-goals-header">
            <h3>Your Goals</h3>
            <button className="set-goal-btn" onClick={handleOpenCreateGoal}>
              Set Goal
            </button>
          </div>
          <GoalProgress goals={goals} onEdit={handleOpenEditGoal} onDelete={handleDeleteGoal} />
        </div>
      )}

      <div className="pricing-grid">
        {displayPlans.map((plan) => {
          const state = getPlanState(plan.id);
          const isDowngradeLocked = state === "downgrade-locked";
          
          return (
            <div 
              key={plan.id} 
              className={`pricing-card glass-card ${plan.popular ? "popular" : ""} ${plan.legendary ? "legendary" : ""} ${state} ${clickedPlan === plan.id ? "clicked" : ""}`}
            >
              {plan.popular && <div className="popular-badge">Most Popular</div>}
              {plan.legendary && <div className="legendary-badge">{plan.legendaryTitle || "Legendary Choice"}</div>}
              
              <div className="plan-header">
                {plan.legendary && plan.tagline && (
                  <p className="legendary-tagline">{plan.tagline}</p>
                )}
                {plan.revenue && (
                  <div className="revenue-badge">{plan.revenue}</div>
                )}
                <h2>{plan.name}</h2>
                {activeTab === "merchants" ? (
                  <div className="merchant-pricing-row">
                    <div className="merchant-price-box">
                      <span className="merchant-price-label">Platform Fee</span>
                      <span className="merchant-price-value">{plan.price}</span>
                    </div>
                    <div className="merchant-price-box">
                      <span className="merchant-price-label">FX Spread</span>
                      <span className="merchant-price-value">{plan.fx}</span>
                    </div>
                  </div>
                ) : (
                  <div className="plan-price">
                    <span className="currency">€</span>
                    <span className="amount">{plan.price}</span>
                    <span className="period">/{plan.period}</span>
                  </div>
                )}
                <p className="plan-description">{plan.description}</p>
              </div>

              {activeTab === "consumers" && (
                <div className="plan-limits">
                  <div className="limit-item">
                    <span className="limit-label">FX Fee</span>
                    <span className="limit-value">{plan.limits.fxFee}</span>
                  </div>
                  <div className="limit-item">
                    <span className="limit-label">FX Free</span>
                    <span className="limit-value">{plan.limits.fxFree}</span>
                  </div>
                  <div className="limit-item">
                    <span className="limit-label">Monthly Cap</span>
                    <span className="limit-value">{plan.limits.monthlyCap}</span>
                  </div>
                </div>
              )}

              <ul className="plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className={feature.included ? "included" : "not-included"}>
                    <span className="feature-icon">
                      {feature.included ? "✓" : "×"}
                    </span>
                    {feature.text}
                  </li>
                ))}
              </ul>

              <button 
                className={`plan-cta primary-button ${state}`}
                onClick={() => {
                  if (isDowngradeLocked || state === "current") return;
                  activeTab === "consumers" ? handleSelectPlan(plan.id) : null;
                }}
                disabled={activeTab === "merchants" || state === "current" || isDowngradeLocked || loading}
              >
                {state === "current" 
                  ? "Current Plan" 
                  : state === "downgrade-locked"
                    ? "Higher Tier Active"
                    : state === "active"
                      ? "Active – 7 days free"
                      : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      <div className="pricing-footer">
        <p>{activeTab === "consumers" ? "All plans include instant, fee-less Nano transactions" : "All plans include instant payment processing and 24/7 support"}</p>
        <div className="pricing-trust">
          <span>🔒 Secure</span>
          <span>⚡ Instant</span>
          <span>🌍 Global</span>
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
    </div>
  );
}