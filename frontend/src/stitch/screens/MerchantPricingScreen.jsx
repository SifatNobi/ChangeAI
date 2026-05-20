import React, { useState, useEffect } from "react";
import { FINA_AI_IMAGE, COMPANY_LOGO, COMPANY_NAME } from "../../constants/branding";
import { apiRequest } from "../../api";
import "./MerchantPricingScreen.css";

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
    cta: "Auto-activates at €0",
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
    cta: "Auto-activates at €10K+",
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
    cta: "Auto-activates at €50K+",
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
    cta: "Auto-activates at €100K+",
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
    cta: "Auto-activates at €400K+",
    popular: false
  },
  {
    id: "enterprise",
    name: "Enterprise",
    revenue: "€500K+/year",
    price: "2.20% enterprise cap",
    fx: "0.45%",
    description: "AI call handling, Custom workflows, API customization",
    tagline: "Legendary Choice",
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
    cta: "Auto-activates at €500K+",
    popular: false,
    legendary: true
  }
];

export default function MerchantPricingScreen({ currentTier = "startup", onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [clickedPlan, setClickedPlan] = useState(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const token = localStorage.getItem("changeaipay_token") || localStorage.getItem("token");
      if (token) {
        const data = await apiRequest("/merchant-subscription/current", { token });
        if (data?.subscription) {
          setSubscription(data.subscription);
        }
      }
    } catch (err) {
      console.log("No merchant subscription");
    }
  };

  const getPlanState = (planId) => {
    if (planId === subscription?.tier) return "current";
    return "available";
  };

  return (
    <div className="merchant-pricing-page stitch-bg">
      <header className="merchant-pricing-header">
        <img src={COMPANY_LOGO} alt={COMPANY_NAME} className="pricing-logo" />
        <h1>Merchant Plans</h1>
        <p>Tiers activate automatically based on your annual transaction volume</p>
      </header>

      <div className="merchant-pricing-fina">
        <img src={FINA_AI_IMAGE} alt="Fina" className="fina-avatar" onClick={() => window.dispatchEvent(new CustomEvent("open-ai-assistant"))} style={{ cursor: "pointer" }} />
        <p>Fina AI helps merchants maximize revenue!</p>
      </div>

      <div className="merchant-plans-grid">
        {MERCHANT_PLANS.map((plan) => {
          const state = getPlanState(plan.id);
          
          return (
            <div 
              key={plan.id} 
              className={`merchant-plan-card glass-card ${plan.popular ? "popular" : ""} ${plan.legendary ? "enterprise" : ""} ${state} ${clickedPlan === plan.id ? "clicked" : ""}`}
            >
              {plan.popular && <div className="popular-badge">Most Popular</div>}
              {plan.legendary && <div className="legendary-badge">Legendary Choice</div>}
              
              <div className="merchant-plan-header">
                <h2>{plan.name}</h2>
                <div className="merchant-revenue-badge">{plan.revenue}</div>
              </div>

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

              <p className="plan-desc">{plan.description}</p>

              <ul className="merchant-plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className={feature.included ? "included" : "not-included"}>
                    <span className="merchant-feature-icon">
                      {feature.included ? "✓" : "×"}
                    </span>
                    {feature.text}
                  </li>
                ))}
              </ul>

              <div className={`merchant-plan-status ${state}`}>
                {state === "current" ? (
                  <span className="status-current">✓ Your Current Tier</span>
                ) : (
                  <span className="status-available">Auto-activates at revenue threshold</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="merchant-pricing-footer">
        <div className="feature-legend">
          <span className="legend-item">
            <span className="legend-icon">✓</span>
            Included
          </span>
          <span className="legend-item">
            <span className="legend-icon">×</span>
            Not included
          </span>
        </div>
        <p>All plans include instant payment processing and 24/7 support</p>
        <p className="auto-tier-note">Merchant tiers activate automatically based on your annual transaction volume. No manual upgrades required.</p>
      </div>
    </div>
  );
}