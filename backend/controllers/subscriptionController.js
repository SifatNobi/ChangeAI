import SubscriptionPlan from "../models/SubscriptionPlan.js";
import UserSubscription from "../models/UserSubscription.js";
import User from "../models/User.js";

const PLANS_CONFIG = {
  free_trial: {
    name: "Free Trial",
    description: "Basic AI finance chat, send/request money, fraud alerts",
    price: 0,
    features: {
      aiAssistant: true,
      fraudProtection: false,
      smartRouting: false,
      predictiveReminders: false,
      spendingAlerts: false,
      aiFinancialAutopilot: false,
      smartUndoPayments: false,
      smartSocialPaymentsBrain: false,
      advancedFraudDetection: false,
      dynamicBudgetOptimization: false,
      aiNegotiator: false,
      lifeEventMode: false,
      prioritySmartRouting: false,
      bookingPayWorkflows: false,
      smartTranscripts: true,
      lowBalanceAlerts: true,
      spendingCoach: false,
      goalBasedAI: false
    },
    limits: {
      fxFreeAmount: 0,
      fxFeeAfterLimit: 1.45,
      monthlyCap: 400,
      aiChatLimit: 50
    }
  },
  edge: {
    name: "Edge",
    description: "Full AI assistant, fraud protection, smart routing",
    price: 19.99,
    features: {
      aiAssistant: true,
      fraudProtection: true,
      smartRouting: true,
      predictiveReminders: true,
      spendingAlerts: true,
      aiFinancialAutopilot: false,
      smartUndoPayments: false,
      smartSocialPaymentsBrain: false,
      advancedFraudDetection: false,
      dynamicBudgetOptimization: false,
      aiNegotiator: false,
      lifeEventMode: false,
      prioritySmartRouting: false,
      bookingPayWorkflows: false,
      smartTranscripts: true,
      lowBalanceAlerts: true,
      spendingCoach: true,
      goalBasedAI: false
    },
    limits: {
      fxFreeAmount: 800,
      fxFeeAfterLimit: 0.95,
      monthlyCap: null,
      aiChatLimit: 500
    }
  },
  prime: {
    name: "Prime",
    description: "AI Financial Autopilot, smart undo, social payments",
    price: 29.99,
    features: {
      aiAssistant: true,
      fraudProtection: true,
      smartRouting: true,
      predictiveReminders: true,
      spendingAlerts: true,
      aiFinancialAutopilot: true,
      smartUndoPayments: true,
      smartSocialPaymentsBrain: true,
      advancedFraudDetection: true,
      dynamicBudgetOptimization: true,
      aiNegotiator: false,
      lifeEventMode: true,
      prioritySmartRouting: false,
      bookingPayWorkflows: false,
      smartTranscripts: true,
      lowBalanceAlerts: true,
      spendingCoach: true,
      goalBasedAI: true
    },
    limits: {
      fxFreeAmount: 2400,
      fxFeeAfterLimit: 0.72,
      monthlyCap: null,
      aiChatLimit: 2000
    }
  },
  apex: {
    name: "Apex",
    description: "Autonomous AI payments, AI negotiator, life events",
    price: 49.99,
    features: {
      aiAssistant: true,
      fraudProtection: true,
      smartRouting: true,
      predictiveReminders: true,
      spendingAlerts: true,
      aiFinancialAutopilot: true,
      smartUndoPayments: true,
      smartSocialPaymentsBrain: true,
      advancedFraudDetection: true,
      dynamicBudgetOptimization: true,
      aiNegotiator: true,
      lifeEventMode: true,
      prioritySmartRouting: true,
      bookingPayWorkflows: true,
      smartTranscripts: true,
      lowBalanceAlerts: true,
      spendingCoach: true,
      goalBasedAI: true
    },
    limits: {
      fxFreeAmount: 4800,
      fxFeeAfterLimit: 0.58,
      monthlyCap: null,
      aiChatLimit: -1
    }
  }
};

export async function getPlans(req, res) {
  try {
    const plans = Object.entries(PLANS_CONFIG).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      monthlyPrice: plan.price,
      features: plan.features,
      limits: plan.limits,
      isPopular: key === "prime"
    }));

    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch plans" });
  }
}

export async function getCurrentSubscription(req, res) {
  try {
    const userId = req.user._id;
    
    let subscription = await UserSubscription.findOne({ userId });

    if (subscription) {
      // Check and reset expired free trial without turning it into a stale expired plan.
      if (subscription.freeTrial && subscription.freeTrial.activated && !subscription.freeTrial.firstTransactionCompleted) {
        if (subscription.freeTrial.expiresAt && new Date() > subscription.freeTrial.expiresAt) {
          subscription.freeTrial.activated = false;
          subscription.freeTrial.clickedActivation = false;
          subscription.freeTrial.activatedAt = null;
          subscription.freeTrial.firstTransactionCompleted = false;
          subscription.freeTrial.expiresAt = null;
          subscription.plan = "free_trial";
          subscription.status = "active";
          await subscription.save();
        }
      }
    } else {
      return res.json({
        success: true,
        subscription: {
          plan: "free_trial",
          status: "inactive",
          startedAt: null,
          currentPeriodEnd: null,
          features: PLANS_CONFIG.free_trial.features,
          usage: null,
          planDetails: PLANS_CONFIG.free_trial,
          freeTrial: {
            activated: false,
            clickedActivation: false,
            firstTransactionCompleted: false,
            expiresAt: null,
            activatedAt: null
          }
        }
      });
    }

    const planConfig = PLANS_CONFIG[subscription.plan];

    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        startedAt: subscription.startedAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
        features: subscription.features,
        usage: subscription.usage,
        planDetails: planConfig,
        freeTrial: subscription.freeTrial ? {
          activated: subscription.freeTrial.activated,
          clickedActivation: subscription.freeTrial.clickedActivation,
          firstTransactionCompleted: subscription.freeTrial.firstTransactionCompleted,
          expiresAt: subscription.freeTrial.expiresAt,
          activatedAt: subscription.freeTrial.activatedAt
        } : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch subscription" });
  }
}

export async function changePlan(req, res) {
  try {
    const userId = req.user._id;
    const { planId } = req.body;

    if (!PLANS_CONFIG[planId]) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    if (planId === "free_trial") {
      return res.status(400).json({ 
        success: false, 
        error: "Cannot switch to Free Trial. Contact support." 
      });
    }

    const planConfig = PLANS_CONFIG[planId];
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let subscription = await UserSubscription.findOne({ userId });

    if (subscription) {
      subscription.plan = planId;
      subscription.status = "active";
      subscription.features = planConfig.features;
      subscription.currentPeriodStart = now;
      subscription.currentPeriodEnd = periodEnd;
      subscription.usage = {
        fxUsedThisMonth: 0,
        aiChatsThisMonth: 0,
        transactionsThisMonth: 0,
        amountSentThisMonth: 0
      };
      subscription.freeTrial = {
        activated: false,
        clickedActivation: false,
        firstTransactionCompleted: false,
        activatedAt: null,
        expiresAt: null
      };
      await subscription.save();
    } else {
      subscription = await UserSubscription.create({
        userId,
        plan: planId,
        status: "active",
        features: planConfig.features,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        freeTrial: {
          activated: false,
          clickedActivation: false,
          firstTransactionCompleted: false,
          activatedAt: null,
          expiresAt: null
        }
      });
    }

    await User.findByIdAndUpdate(userId, {
      subscriptionPlan: planId,
      plan_type: req.user.role === "merchant" ? "merchant" : "pro",
      is_free_active: false,
      free_trial_activated_at: null,
      free_trial_expiry: null
    });

    res.json({
      success: true,
      message: `Successfully subscribed to ${planConfig.name}`,
      subscription: {
        plan: planId,
        status: "active",
        currentPeriodEnd: periodEnd,
        features: planConfig.features
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to change plan" });
  }
}

export async function getUsage(req, res) {
  try {
    const userId = req.user._id;
    const subscription = await UserSubscription.findOne({ userId });

    if (!subscription) {
      return res.json({
        success: true,
        usage: {
          fxUsed: 0,
          fxLimit: 0,
          aiChats: 0,
          aiChatLimit: 50,
          transactions: 0,
          amountSent: 0,
          monthlyCap: 400
        },
        limits: PLANS_CONFIG.free_trial.limits
      });
    }

    const planConfig = PLANS_CONFIG[subscription.plan];

    res.json({
      success: true,
      usage: {
        fxUsed: subscription.usage.fxUsedThisMonth,
        fxLimit: planConfig.limits.fxFreeAmount,
        aiChats: subscription.usage.aiChatsThisMonth,
        aiChatLimit: planConfig.limits.aiChatLimit,
        transactions: subscription.usage.transactionsThisMonth,
        amountSent: subscription.usage.amountSentThisMonth,
        monthlyCap: planConfig.limits.monthlyCap
      },
      limits: planConfig.limits,
      plan: subscription.plan
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch usage" });
  }
}

export async function recordUsage(req, res) {
  try {
    const userId = req.user._id;
    const { fxAmount, isAIChat, isTransaction, amount } = req.body;

    const subscription = await UserSubscription.findOne({ userId });
    
    if (subscription) {
      if (fxAmount) {
        subscription.usage.fxUsedThisMonth += fxAmount;
      }
      if (isAIChat) {
        subscription.usage.aiChatsThisMonth += 1;
      }
      if (isTransaction) {
        subscription.usage.transactionsThisMonth += 1;
      }
      if (amount) {
        subscription.usage.amountSentThisMonth += amount;
      }
      await subscription.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to record usage" });
  }
}

export async function cancelSubscription(req, res) {
  try {
    const userId = req.user._id;
    
    const subscription = await UserSubscription.findOne({ userId });
    
    if (!subscription) {
      return res.status(404).json({ success: false, error: "No subscription found" });
    }

    subscription.status = "cancelled";
    subscription.cancelledAt = new Date();
    subscription.willCancelAt = subscription.currentPeriodEnd;
    await subscription.save();

    res.json({
      success: true,
      message: "Subscription will be cancelled at period end",
      cancelledAt: subscription.currentPeriodEnd
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to cancel subscription" });
  }
}

export function hasFeature(user, feature) {
  const featureMap = {
    aiAssistant: "aiAssistant",
    fraudProtection: "fraudProtection",
    smartRouting: "smartRouting",
    predictiveReminders: "predictiveReminders",
    spendingAlerts: "spendingAlerts",
    aiFinancialAutopilot: "aiFinancialAutopilot",
    smartUndoPayments: "smartUndoPayments",
    smartSocialPaymentsBrain: "smartSocialPaymentsBrain",
    advancedFraudDetection: "advancedFraudDetection",
    dynamicBudgetOptimization: "dynamicBudgetOptimization",
    aiNegotiator: "aiNegotiator",
    lifeEventMode: "lifeEventMode",
    prioritySmartRouting: "prioritySmartRouting",
    bookingPayWorkflows: "bookingPayWorkflows"
  };

  const configKey = featureMap[feature];
  if (!configKey) return false;

  const plan = user.subscriptionPlan || "free_trial";
  return PLANS_CONFIG[plan]?.features[configKey] || false;
}

export function getFXFee(user, fxAmount = 0) {
  const plan = user.subscriptionPlan || "free_trial";
  const planConfig = PLANS_CONFIG[plan];
  
  if (!planConfig) return 1.45;
  
  const { fxFreeAmount, fxFeeAfterLimit } = planConfig.limits;
  
  if (fxAmount <= fxFreeAmount) {
    return 0;
  }
  
  return fxFeeAfterLimit;
}

export default {
  getPlans,
  getCurrentSubscription,
  changePlan,
  getUsage,
  recordUsage,
  cancelSubscription,
  hasFeature,
  getFXFee
};