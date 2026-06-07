import User from "../models/User.js";
import UserSubscription from "../models/UserSubscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import { convertFiatToNano, lockConversion, calculateFee, calculateSavings, getCurrentRates } from "../services/conversionService.js";
import logger from "../services/logger.js";
import Stripe from "stripe";
import { 
  pauseSubscription as pauseSubscriptionService, 
  resumeSubscription as resumeSubscriptionService, 
  calculateProration as calculateProrationService, 
  upgradePlan as upgradePlanService, 
  downgradePlan as downgradePlanService,
  getSubscriptionAnalytics as getSubscriptionAnalyticsService 
} from "../services/subscriptionAutomation.js";
import { 
  getRecommendations, 
  getPlanComparison as getPlanComparisonFromAI, 
  getRenewalReminder as getRenewalReminderService, 
  generateFinaMessage,
  PLANS_CONFIG 
} from "../services/recommendationEngine.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2025-04-30.basil"
});

export async function getPricingPlans(req, res) {
  try {
    const currency = req.query.currency || "EUR";
    const rates = await getCurrentRates();
    const nanoPrice = rates[currency];

    const plans = [
      {
        id: "free_trial",
        name: "Free Trial",
        description: "Basic AI finance chat payments",
        fiatPrice: 0,
        nanoPrice: 0,
        currency,
        features: ["Basic AI chat", "Send/request money", "Basic fraud alerts", "Smart transcripts"]
      },
      {
        id: "edge",
        name: "Edge",
        description: "Full AI assistant with fraud protection",
        fiatPrice: 19.99,
        nanoPrice: Math.round((19.99 / nanoPrice) * 1e6) / 1e6,
        currency,
        fxFee: "0.95%",
        fxFreeLimit: 800,
        features: ["Full AI Assistant", "Fraud Protection", "Smart Routing", "Predictive Reminders", "Spending Alerts"]
      },
      {
        id: "prime",
        name: "Prime",
        description: "AI Financial Autopilot",
        fiatPrice: 29.99,
        nanoPrice: Math.round((29.99 / nanoPrice) * 1e6) / 1e6,
        currency,
        fxFee: "0.72%",
        fxFreeLimit: 2400,
        features: ["AI Financial Autopilot", "Smart Undo Payments", "Social Payments Brain", "Advanced Fraud Detection", "Dynamic Budget"]
      },
      {
        id: "apex",
        name: "Apex",
        description: "Autonomous AI Payments",
        fiatPrice: 49.99,
        nanoPrice: Math.round((49.99 / nanoPrice) * 1e6) / 1e6,
        currency,
        fxFee: "0.58%",
        fxFreeLimit: 4800,
        features: ["Autonomous AI Payments", "AI Negotiator", "Life Event Mode", "Priority Routing", "Booking Workflows"]
      }
    ];

    res.json({ 
      success: true, 
      plans,
      rates,
      paymentOptions: {
        fiat: ["EUR", "USD"],
        crypto: ["XNO"],
        preferred: "fiat"
      }
    });
  } catch (err) {
    logger.error("Pricing fetch error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch pricing" });
  }
}

export async function createCheckoutSession(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { planId, currency = "EUR", paymentMethod = "fiat" } = req.body;

    if (!planId) {
      return res.status(400).json({ success: false, error: "Missing planId" });
    }

    const planConfig = {
      edge: { fiatPrice: 19.99, name: "Edge" },
      prime: { fiatPrice: 29.99, name: "Prime" },
      apex: { fiatPrice: 49.99, name: "Apex" }
    };

    const plan = planConfig[planId];
    if (!plan) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const nanoBalance = parseFloat(user?.balance?.balanceNano || "0");

    let conversion;
    try {
      conversion = await lockConversion(plan.fiatPrice, currency, 600000);
    } catch (convErr) {
      logger.error("Conversion lock failed", { error: convErr.message });
      conversion = {
        nanoAmount: plan.fiatPrice / 0.0075,
        rate: 1 / 0.0075,
        expiresAt: new Date(Date.now() + 600000).toISOString()
      };
    }

    const savings = calculateSavings(plan.fiatPrice);

    if (paymentMethod === "fiat") {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey || stripeKey === "sk_test_placeholder") {
        return res.status(503).json({
          success: false,
          error: "Card payments not yet configured",
          fallback: "Please pay with Nano (XNO) instead"
        });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                  name: `${plan.name} Subscription`,
                  description: `Monthly subscription to ${plan.name} plan`,
                },
                unit_amount: Math.round(plan.fiatPrice * 100),
              },
              quantity: 1,
            },
          ],
          mode: "subscription",
          success_url: `${process.env.FRONTEND_URL || "https://changeaipay.netlify.app"}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.FRONTEND_URL || "https://changeaipay.netlify.app"}/pricing?canceled=true`,
          metadata: {
            userId: userId.toString(),
            planId,
            paymentMethod: "stripe"
          },
          customer_email: user.email,
        });

        res.json({
          success: true,
          session: {
            id: session.id,
            url: session.url,
            paymentMethod: "stripe"
          }
        });
      } catch (stripeErr) {
        logger.error("Stripe session creation error", { error: stripeErr.message });
        return res.status(500).json({
          success: false,
          error: "Card checkout unavailable",
          fallback: "Please pay with Nano (XNO) instead"
        });
      }
    } else {
      const checkoutSession = {
        id: `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        plan: planId,
        planName: plan.name,
        currency,
        paymentMethod,
        pricing: {
          fiatAmount: plan.fiatPrice,
          nanoAmount: conversion.nanoAmount,
          conversionRate: conversion.rate,
          lockedUntil: conversion.expiresAt
        },
        userBalance: {
          nanoBalance,
          canPayWithNano: nanoBalance >= conversion.nanoAmount
        },
        savings: paymentMethod === "xno" ? savings : null,
        fees: calculateFee(plan.fiatPrice, paymentMethod === "xno"),
        status: "pending",
        createdAt: new Date().toISOString()
      };

      logger.info("Checkout session created", { userId, planId, paymentMethod });

      res.json({
        success: true,
        session: checkoutSession,
        recommendations: {
          suggestNano: nanoBalance >= conversion.nanoAmount && nanoBalance > 0,
          nanoSavings: savings.savings,
          reason: nanoBalance >= conversion.nanoAmount 
            ? "You have enough Nano to pay and save card fees"
            : "Add Nano to your wallet to enable fee-less payments"
        }
      });
    }
  } catch (err) {
    logger.error("Checkout creation error", { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: "Failed to create checkout" });
  }
}

export async function processPayment(req, res) {
  try {
    const userId = req.user._id;
    const { sessionId, paymentMethod, paymentData } = req.body;

    const user = await User.findById(userId).lean();
    const nanoBalance = parseFloat(user?.balance?.balanceNano || "0");

    const planId = sessionId.split("_")[1] || "edge";
    const planConfig = {
      edge: { fiatPrice: 19.99, name: "Edge" },
      prime: { fiatPrice: 29.99, name: "Prime" },
      apex: { fiatPrice: 49.99, name: "Apex" }
    };
    const plan = planConfig[planId];

    if (!plan) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    if (paymentMethod === "xno") {
      const conversion = await convertFiatToNano(plan.fiatPrice, "EUR");

      if (nanoBalance < conversion.nanoAmount) {
        return res.status(400).json({
          success: false,
          error: "Insufficient Nano balance",
          required: conversion.nanoAmount,
          available: nanoBalance
        });
      }

      const paymentSessionId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      let subscription = await UserSubscription.findOne({ userId });

      if (!subscription) {
        subscription = await UserSubscription.create({
          userId,
          plan: "free_trial",
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paymentSession: {
            sessionId: paymentSessionId,
            status: "pending",
            planId,
            createdAt: new Date()
          }
        });
      } else {
        subscription.paymentSession = {
          sessionId: paymentSessionId,
          status: "pending",
          planId,
          createdAt: new Date()
        };
        await subscription.save();
      }

      logger.info("Nano payment session created - awaiting verification", { userId, planId, paymentSessionId });

      res.json({
        success: true,
        paymentSession: {
          id: paymentSessionId,
          status: "pending",
          method: "nano",
          amount: conversion.nanoAmount,
          currency: "XNO",
          message: "Payment session created. Subscription will activate upon blockchain confirmation."
        },
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          note: "Premium features unlock only after payment verification"
        }
      });
    } else {
      res.json({
        success: true,
        payment: {
          method: "fiat",
          amount: plan.fiatPrice,
          currency: "EUR",
          status: "pending",
          instructions: "Payment gateway integration required"
        }
      });
    }
  } catch (err) {
    logger.error("Payment processing error", { error: err.message });
    res.status(500).json({ success: false, error: "Payment failed" });
  }
}

export async function getPaymentMethods(req, res) {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).lean();

    const nanoBalance = parseFloat(user?.balance?.balanceNano || "0");
    const rates = await getCurrentRates();

    res.json({
      success: true,
      paymentMethods: [
        {
          id: "fiat",
          name: "Credit/Debit Card",
          icon: "💳",
          fees: "2.9% + €0.25",
          estimatedFee: 0.029,
          available: true
        },
        {
          id: "xno",
          name: "Nano (XNO)",
          icon: "⚡",
          fees: "0%",
          estimatedFee: 0,
          balance: nanoBalance,
          conversionRate: rates.EUR,
          available: true,
          recommended: nanoBalance > 0
        },
        {
          id: "bank",
          name: "Bank Transfer",
          icon: "🏦",
          fees: "€1.50",
          estimatedFee: 1.50,
          available: false,
          comingSoon: true
        }
      ],
      rates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch payment methods" });
  }
}

export async function getBillingHistory(req, res) {
  try {
    const userId = req.user._id;
    const subscriptions = await UserSubscription.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();

    res.json({
      success: true,
      billingHistory: subscriptions.map(sub => ({
        id: sub._id,
        plan: sub.plan,
        status: sub.status,
        amount: "Subscription payment",
        paymentMethod: "nano",
        date: sub.createdAt,
        nextBilling: sub.currentPeriodEnd
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch billing history" });
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
      message: "Subscription cancelled",
      activeUntil: subscription.currentPeriodEnd
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to cancel subscription" });
  }
}

export async function getPaymentAnalytics(req, res) {
  try {
    const userId = req.user._id;
    
    const subscriptions = await UserSubscription.find({ userId }).lean();
    
    const totalSpent = subscriptions.reduce((sum, sub) => {
      const planPrices = { edge: 19.99, prime: 29.99, apex: 49.99 };
      return sum + (planPrices[sub.plan] || 0);
    }, 0);
    
    const nanoPayments = subscriptions.filter(sub => sub.metadata?.paymentMethod === "nano").length;
    
    const stats = {
      totalSpent,
      paymentsWithNano: nanoPayments,
      savingsFromNano: nanoPayments * 0.72,
      lastPayment: subscriptions[0]?.createdAt,
      nextPayment: subscriptions[0]?.currentPeriodEnd
    };

    const rates = await getCurrentRates();

    res.json({
      success: true,
      analytics: {
        ...stats,
        conversionRates: rates,
        savingsPercentage: 2.9
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
}

export async function pauseSubscription(req, res) {
  try {
    const userId = req.user._id;
    const { reason = "user_request" } = req.body;

    const subscription = await pauseSubscriptionService(userId, reason);

    res.json({
      success: true,
      message: "Subscription paused",
      pausedAt: subscription.pausedAt,
      resumeAt: subscription.currentPeriodEnd
    });
  } catch (err) {
    logger.error("Pause subscription error", { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function resumeSubscription(req, res) {
  try {
    const userId = req.user._id;

    const subscription = await resumeSubscriptionService(userId);

    res.json({
      success: true,
      message: "Subscription resumed",
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  } catch (err) {
    logger.error("Resume subscription error", { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function changePlanWithProration(req, res) {
  try {
    const userId = req.user._id;
    const { newPlanId, paymentMethod = "nano" } = req.body;

    if (!PLANS_CONFIG[newPlanId]) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    const subscription = await UserSubscription.findOne({ userId });
    const currentPlan = subscription?.plan || "free_trial";

    const isUpgrade = PLANS_CONFIG[newPlanId].price > (PLANS_CONFIG[currentPlan]?.price || 0);

    let result;
    if (isUpgrade) {
      result = await upgradePlanService(userId, newPlanId, paymentMethod);
    } else {
      result = await downgradePlanService(userId, newPlanId);
    }

    res.json({
      success: true,
      message: isUpgrade ? `Upgraded to ${PLANS_CONFIG[newPlanId].name}` : `Downgraded to ${PLANS_CONFIG[newPlanId].name}`,
      proration: result.proration,
      newPlan: newPlanId
    });
  } catch (err) {
    logger.error("Plan change with proration error", { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function getSubscriptionAnalytics(req, res) {
  try {
    const userId = req.user._id;
    const analytics = await getSubscriptionAnalyticsService(userId);

    res.json({ success: true, analytics });
  } catch (err) {
    logger.error("Subscription analytics error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
}

export async function getAIRecommendations(req, res) {
  try {
    const userId = req.user._id;
    const recommendations = await getRecommendations(userId);

    const enrichedRecommendations = recommendations.recommendations.map(rec => ({
      ...rec,
      finaMessage: generateFinaMessage(rec)
    }));

    res.json({
      success: true,
      recommendations: enrichedRecommendations,
      currentPlan: recommendations.currentPlan,
      behavior: {
        transactionCount: recommendations.behavior.transactionCount,
        fxVolume: recommendations.behavior.fxVolume,
        aiChatCount: recommendations.behavior.aiChatCount,
        growthRate: recommendations.behavior.growthRate
      }
    });
  } catch (err) {
    logger.error("AI recommendations error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to generate recommendations" });
  }
}

export async function getPlanComparison(req, res) {
  try {
    const userId = req.user._id;
    const { plans = "edge,prime,apex" } = req.query;
    const planIds = plans.split(",");

    const comparison = await getPlanComparisonFromAI(userId, planIds);

    res.json({ success: true, comparison });
  } catch (err) {
    logger.error("Plan comparison error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get plan comparison" });
  }
}

export async function getRenewalReminder(req, res) {
  try {
    const userId = req.user._id;
    const reminder = await getRenewalReminderService(userId);

    res.json({ success: true, reminder });
  } catch (err) {
    logger.error("Renewal reminder error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get reminder" });
  }
}

export async function verifyPaymentAndActivate(req, res) {
  try {
    const userId = req.user._id;
    const { paymentSessionId, transactionHash } = req.body;

    if (!paymentSessionId) {
      return res.status(400).json({ success: false, error: "Missing payment session ID" });
    }

    const subscription = await UserSubscription.findOne({ userId });
    if (!subscription) {
      return res.status(404).json({ success: false, error: "No subscription found" });
    }

    if (subscription.paymentSession.sessionId !== paymentSessionId) {
      return res.status(400).json({ success: false, error: "Payment session mismatch" });
    }

    if (subscription.paymentSession.status === "verified") {
      return res.status(400).json({ success: false, error: "Payment already verified" });
    }

    if (subscription.paymentSession.status === "cancelled") {
      return res.status(400).json({ success: false, error: "Payment was cancelled" });
    }

    const planId = subscription.paymentSession.planId;
    const planConfig = {
      edge: { fiatPrice: 19.99, name: "Edge" },
      prime: { fiatPrice: 29.99, name: "Prime" },
      apex: { fiatPrice: 49.99, name: "Apex" }
    };
    const plan = planConfig[planId];

    if (!plan) {
      return res.status(400).json({ success: false, error: "Invalid plan in payment session" });
    }

    const user = await User.findById(userId).lean();
    const nanoBalance = parseFloat(user?.balance?.balanceNano || "0");
    const conversion = await convertFiatToNano(plan.fiatPrice, "EUR");

    if (nanoBalance < conversion.nanoAmount) {
      subscription.paymentSession.status = "failed";
      await subscription.save();
      return res.status(400).json({
        success: false,
        error: "Insufficient balance at verification time",
        required: conversion.nanoAmount,
        available: nanoBalance
      });
    }

    subscription.plan = planId;
    subscription.status = "active";
    subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    subscription.paymentSession.status = "verified";
    subscription.paymentSession.verifiedAt = new Date();
    await subscription.save();

    await User.findByIdAndUpdate(userId, {
      subscriptionPlan: planId,
      "balance.balanceNano": Math.max(0, nanoBalance - conversion.nanoAmount)
    });

    logger.info("Payment verified and subscription activated", { userId, planId, paymentSessionId, transactionHash });

    res.json({
      success: true,
      subscription: {
        plan: planId,
        status: "active",
        nextBilling: subscription.currentPeriodEnd.toISOString()
      }
    });
  } catch (err) {
    logger.error("Payment verification error", { error: err.message });
    res.status(500).json({ success: false, error: "Payment verification failed" });
  }
}

export async function cancelPaymentSession(req, res) {
  try {
    const userId = req.user._id;

    const subscription = await UserSubscription.findOne({ userId });
    if (!subscription) {
      return res.status(404).json({ success: false, error: "No subscription found" });
    }

    if (subscription.paymentSession.status === "verified") {
      return res.status(400).json({ success: false, error: "Cannot cancel verified payment" });
    }

    subscription.paymentSession.status = "cancelled";
    await subscription.save();

    logger.info("Payment session cancelled", { userId, sessionId: subscription.paymentSession.sessionId });

    res.json({ success: true, message: "Payment session cancelled" });
  } catch (err) {
    logger.error("Cancel payment session error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to cancel payment session" });
  }
}

export async function activateFreeTrial(req, res) {
  try {
    const userId = req.user._id;

    let subscription = await UserSubscription.findOne({ userId });

    if (!subscription) {
      subscription = await UserSubscription.create({
        userId,
        plan: "free_trial",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        freeTrial: {
          activated: true,
          activatedAt: new Date(),
          clickedActivation: true,
          firstTransactionCompleted: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
    } else {
      if (subscription.freeTrial?.activated) {
        return res.status(400).json({ success: false, error: "Free trial already activated" });
      }

      if (subscription.plan !== "free_trial" && subscription.status === "active") {
        return res.status(400).json({ success: false, error: "Already on a paid plan" });
      }

      subscription.freeTrial.clickedActivation = true;
      subscription.freeTrial.activated = true;
      subscription.freeTrial.activatedAt = new Date();
      subscription.freeTrial.firstTransactionCompleted = false;
      subscription.freeTrial.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      subscription.plan = "free_trial";
      subscription.status = "active";
      subscription.currentPeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await subscription.save();
    }

    await User.findByIdAndUpdate(userId, {
      plan_type: req.user.role === "merchant" ? "merchant" : "free",
      is_free_active: true,
      free_trial_activated_at: subscription.freeTrial.activatedAt,
      free_trial_expiry: subscription.freeTrial.expiresAt
    });

    logger.info("Free trial activation clicked", { userId });

    res.json({
      success: true,
      message: "Free trial activated. Complete your first transaction within 24 hours to keep benefits.",
      trial: {
        activated: true,
        expiresAt: subscription.freeTrial.expiresAt,
        requiresTransaction: true
      }
    });
  } catch (err) {
    logger.error("Free trial activation error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to activate free trial" });
  }
}

export async function completeFirstTransaction(req, res) {
  try {
    const userId = req.user._id;

    const subscription = await UserSubscription.findOne({ userId });
    if (!subscription) {
      return res.status(404).json({ success: false, error: "No subscription found" });
    }

    if (!subscription.freeTrial?.activated) {
      return res.status(400).json({ success: false, error: "Free trial not activated" });
    }

    if (subscription.freeTrial.firstTransactionCompleted) {
      return res.status(400).json({ success: false, error: "First transaction already completed" });
    }

    if (subscription.freeTrial.expiresAt && new Date() > subscription.freeTrial.expiresAt) {
      subscription.freeTrial.activated = false;
      subscription.freeTrial.clickedActivation = false;
      subscription.freeTrial.activatedAt = null;
      subscription.freeTrial.firstTransactionCompleted = false;
      subscription.freeTrial.expiresAt = null;
      subscription.plan = "free_trial";
      subscription.status = "active";
      await subscription.save();
      await User.findByIdAndUpdate(userId, {
        is_free_active: false,
        free_trial_activated_at: null,
        free_trial_expiry: null
      });
      return res.status(400).json({ success: false, error: "Free trial window expired (24h)" });
    }

    subscription.freeTrial.firstTransactionCompleted = true;
    await subscription.save();
    await User.findByIdAndUpdate(userId, {
      is_free_active: true,
      free_trial_activated_at: subscription.freeTrial.activatedAt,
      free_trial_expiry: subscription.freeTrial.expiresAt
    });

    logger.info("First transaction completed for free trial", { userId });

    res.json({
      success: true,
      message: "Free trial benefits confirmed. Valid for 7 days.",
      trial: {
        activated: true,
        firstTransactionCompleted: true,
        expiresAt: subscription.currentPeriodEnd
      }
    });
  } catch (err) {
    logger.error("First transaction completion error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to record transaction" });
  }
}

export default {
  getPricingPlans,
  createCheckoutSession,
  processPayment,
  getPaymentMethods,
  getBillingHistory,
  cancelSubscription,
  getPaymentAnalytics,
  pauseSubscription,
  resumeSubscription,
  changePlanWithProration,
  getSubscriptionAnalytics,
  getAIRecommendations,
  getPlanComparison,
  getRenewalReminder,
  verifyPaymentAndActivate,
  cancelPaymentSession,
  activateFreeTrial,
  completeFirstTransaction
};