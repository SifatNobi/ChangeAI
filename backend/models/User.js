import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ["user", "merchant", "admin"],
    default: "user"
  },
  walletAddress: {
    type: String,
    sparse: true,
    unique: true
  },
  walletPrivateKey: {
    type: String,
    select: false
  },
  profile: {
    avatar: String,
    phone: String,
    country: String,
    timezone: String
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    currency: { type: String, default: "XNO" },
    language: { type: String, default: "en" },
    theme: { type: String, enum: ["light", "dark", "system"], default: "dark" }
  },
  verification: {
    emailVerified: { type: Boolean, default: false },
    identityVerified: { type: Boolean, default: false },
    kycLevel: { type: Number, default: 0, min: 0, max: 3 }
  },
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    lastLoginAt: Date,
    loginHistory: [{
      ip: String,
      userAgent: String,
      timestamp: { type: Date, default: Date.now }
    }]
  },
  subscriptionPlan: {
    type: String,
    enum: ["free_trial", "edge", "prime", "apex"],
    default: "free_trial"
  },
  plan_type: {
    type: String,
    enum: ["free", "pro", "merchant"],
    default: "free"
  },
  free_trial_activated_at: Date,
  free_trial_expiry: Date,
  is_free_active: {
    type: Boolean,
    default: false
  },
  limits: {
    daily: { type: Number, default: 1000 },
    monthly: { type: Number, default: 10000 }
  },
  status: {
    type: String,
    enum: ["active", "suspended", "banned"],
    default: "active"
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, status: 1 });

userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    walletAddress: this.walletAddress,
    profile: this.profile,
    subscriptionPlan: this.subscriptionPlan,
    plan_type: this.plan_type,
    free_trial_activated_at: this.free_trial_activated_at || null,
    free_trial_expiry: this.free_trial_expiry || null,
    is_free_active: Boolean(this.is_free_active),
    preferences: this.preferences,
    verification: {
      emailVerified: this.verification?.emailVerified,
      identityVerified: this.verification?.identityVerified,
      kycLevel: this.verification?.kycLevel
    },
    status: this.status,
    createdAt: this.createdAt
  };
};

export default mongoose.model("User", userSchema);