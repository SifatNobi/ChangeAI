import User from "../models/User.js";
import UserSubscription from "../models/UserSubscription.js";
import authController from "../controllers/authController.js";
import { getAccountBalance } from "../services/nano.js";

const cache = new Map();

function setCache(key, data, ttl = 5000) {
  cache.set(key, { data, expiry: Date.now() + ttl });
}

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

async function profile(req, res) {
  try {
    const cacheKey = `profile_${req.user.id}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const user = await User.findById(req.user.id).maxTimeMS(5000).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let subscription = await UserSubscription.findOne({ userId: req.user.id });
    if (subscription) {
      const now = new Date();
      if (subscription.freeTrial && subscription.freeTrial.activated && !subscription.freeTrial.firstTransactionCompleted) {
        if (subscription.freeTrial.expiresAt && now > subscription.freeTrial.expiresAt) {
          subscription.freeTrial.activated = false;
          subscription.freeTrial.clickedActivation = false;
          subscription.freeTrial.activatedAt = null;
          subscription.freeTrial.firstTransactionCompleted = false;
          subscription.freeTrial.expiresAt = null;
          subscription.status = "active";
          await subscription.save().catch(() => {});
        }
      }
    }

    let balance = null;
    if (user.walletAddress) {
      try {
        balance = await getAccountBalance(user.walletAddress);
      } catch (error) {
        balance = {
          balanceRaw: "0",
          pendingRaw: "0",
          balanceNano: "0",
          pendingNano: "0",
          error: String(error?.message || error)
        };
      }
    }

    const planType = user.role === "merchant"
      ? "merchant"
      : subscription?.plan && subscription.plan !== "free_trial"
        ? "pro"
        : "free";

    const updatedUserFields = {
      plan_type: planType,
      is_free_active: Boolean(subscription?.freeTrial?.activated),
      free_trial_activated_at: subscription?.freeTrial?.activatedAt || null,
      free_trial_expiry: subscription?.freeTrial?.expiresAt || null
    };

    if (
      user.plan_type !== updatedUserFields.plan_type ||
      Boolean(user.is_free_active) !== updatedUserFields.is_free_active ||
      String(user.free_trial_activated_at || "") !== String(updatedUserFields.free_trial_activated_at || "") ||
      String(user.free_trial_expiry || "") !== String(updatedUserFields.free_trial_expiry || "")
    ) {
      await User.updateOne({ _id: user._id }, { $set: updatedUserFields }).catch(() => {});
      Object.assign(user, updatedUserFields);
    }

    const data = {
      user: authController.serializeUser(user),
      balance,
      subscription: subscription ? await UserSubscription.findById(subscription._id).lean() : null
    };
    setCache(cacheKey, data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}

export default { profile };
