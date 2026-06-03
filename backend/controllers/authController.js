import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { createWalletAndAccount } from "../services/nano.js";
import bcrypt from "bcryptjs";
import config from "../config/index.js";

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwt.secret, { expiresIn: config.jwt.expiry });
}

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role || "user",
    walletAddress: user.walletAddress,
    walletStatus: user.walletStatus,
    walletId: user.walletId,
    walletCreatedAt: user.walletCreatedAt,
    createdAt: user.createdAt
  };
}

function serializeAuthUser(user) {
  return {
    id: user._id,
    email: user.email,
    walletAddress: user.walletAddress
  };
}

async function register(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "user").toLowerCase();

    const validRoles = ["user", "merchant"];
    const userRole = validRoles.includes(role) ? role : "user";

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email required" });
    }
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const existing = await User.findOne({ email }).lean();
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const user = await User.create({ 
      name, 
      email, 
      password, 
      role: userRole,
      walletStatus: "pending" 
    });

    try {
      const { privateKey, address } = await createWalletAndAccount();
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            privateKey,
            walletAddress: address,
            walletStatus: "active",
            walletCreatedAt: new Date()
          }
        }
      );
      user.walletAddress = address;
      user.walletStatus = "active";
      user.walletCreatedAt = new Date();
    } catch (err) {
      await User.updateOne(
        { _id: user._id },
        { $set: { walletStatus: "failed" } }
      ).catch(() => {});
      user.walletStatus = "failed";
    }

    res.status(201).json({
      success: true,
      token: signToken(user._id),
      user: {
        ...serializeUser(user),
        ...serializeAuthUser(user)
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}

async function login(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    if (user.status === "suspended") {
      return res.status(403).json({ error: "Account suspended. Contact support." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    // Update login metadata without triggering password re-hash
    user.security = user.security || {};
    user.security.lastLoginAt = new Date();
    user.security.loginHistory = user.security.loginHistory || [];
    user.security.loginHistory.unshift({
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get("user-agent"),
      timestamp: new Date()
    });
    if (user.security.loginHistory.length > 10) {
      user.security.loginHistory = user.security.loginHistory.slice(0, 10);
    }
    // Use updateOne to bypass model hooks entirely, preventing password re-hash
    await User.updateOne(
      { _id: user._id },
      { $set: { security: user.security } }
    ).catch(() => {});

    const token = signToken(user._id);
    return res.json({
      success: true,
      token,
      user: {
        ...serializeUser(user),
        ...serializeAuthUser(user)
      },
      role: user.role || "user"
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}

async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id || req.user.sub).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}

export { register, login, getMe, serializeUser };
export default { register, login, getMe, serializeUser };
