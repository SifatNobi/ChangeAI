import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";

import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";

import config from "./config/index.js";
import authRoutes from "./routes/auth.routes.js";
import transactionRoutes from "./routes/transaction.js";
import userRoutes from "./routes/user.js";
import waitlistRoutes from "./routes/waitlist.js";
import walletRoutes from "./routes/wallet.js";
import adminRoutes from "./routes/admin.js";
import aiRoutes from "./routes/ai.js";
import subscriptionRoutes from "./routes/subscription.js";
import merchantSubscriptionRoutes from "./routes/merchantSubscription.js";
import paymentsRoutes from "./routes/payments.js";
import billingRoutes from "./routes/billing.js";
import webhookRoutes from "./routes/webhook.js";
import featureRequestRoutes from "./routes/featureRequests.js";
import { startSubscriptionAutomation } from "./services/subscriptionAutomation.js";
import { callRpc, getNodeHealth, RPC_NODES, testRpcNodes } from "./services/rpcClient.js";
import walletQueue from "./services/walletQueue.js";
import { confirmTransaction, getBalance } from "./services/nanoWallet.js";
import { requestLogger, errorLogger } from "./services/logger.js";
import { securityHeaders, inputSanitization } from "./middleware/security.js";
import wsManager from "./services/websocket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ||
    "https://changeaipay.netlify.app,http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const allowedOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.netlify\.app$/i,
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(securityHeaders);
app.use(inputSanitization);
app.use(requestLogger);

app.use((req, res, next) => {
  res.setTimeout(10000, () => {
    if (res.headersSent) return;
    console.error("Request timed out:", req.originalUrl);
    res.status(408).json({ error: "Request timeout" });
  });
  next();
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "ChangeAIPay backend",
    routes: {
      auth: "/auth",
      user: "/user",
      transaction: "/transaction",
      waitlist: "/waitlist",
      wallet: "/wallet",
      health: "/health"
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mongoState: mongoose.connection.readyState,
    uptime: process.uptime()
  });
});

app.get("/test", (_req, res) => {
  res.send("Server is alive");
});

app.use(
  "/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/transaction", transactionRoutes);
app.use("/waitlist", waitlistRoutes);
app.use("/wallet", walletRoutes);
app.use("/admin", adminRoutes);
app.use("/ai", aiRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/merchant-subscription", merchantSubscriptionRoutes);
app.use("/payments", paymentsRoutes);
app.use("/billing", billingRoutes);
app.use("/webhook", webhookRoutes);
app.use("/feature-requests", featureRequestRoutes);

walletQueue.startWorker();

app.get("/test-rpc", async (_req, res) => {
  try {
    const result = await callRpc({ action: "version" });

    return res.json({
      status: result.success ? "ONLINE" : "OFFLINE",
      success: result.success,
      workingNode: result.source || null,
      message: result.success ? "RPC connection successful" : "All RPC nodes failed",
      version: result.data?.node_vendor || null,
      network: result.data?.network || null,
      error: result.error || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(502).json({
      status: "ERROR",
      success: false,
      error: String(err?.message || err)
    });
  }
});

app.get("/rpc-debug", async (_req, res) => {
  try {
    const result = await callRpc({ action: "version" });

    return res.json({
      success: result.success,
      workingNode: result.source || null,
      data: result.data || null,
      error: result.error || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: String(err?.message || err)
    });
  }
});

app.get("/health-full", async (_req, res) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];
    const rpcTest = await callRpc({ action: "version" });
    const nodeHealth = getNodeHealth();
    const healthyNodes = nodeHealth.filter((node) => node.healthy).length;

    return res.json({
      status: mongoState === 1 && rpcTest.success ? "PRODUCTION READY" : "DEGRADED",
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: mongoState === 1,
        state: mongoStates[mongoState],
        ready: mongoState === 1
      },
      rpc: {
        status: rpcTest.success ? "HEALTHY" : "UNHEALTHY",
        workingNode: rpcTest.source || "none",
        healthyNodes: `${healthyNodes}/${RPC_NODES.length}`,
        nodes: nodeHealth,
        network: rpcTest.data?.network || "unknown"
      },
      message: "ChangeAIPay backend status"
    });
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      error: String(err?.message || err)
    });
  }
});

app.get("/rpc-health", async (_req, res) => {
  try {
    const nodeHealth = getNodeHealth();
    const testResults = await testRpcNodes();
    const onlineCount = testResults.filter((result) => result.online).length;

    return res.json({
      status: onlineCount > 0 ? "HEALTHY" : "CRITICAL",
      onlineNodes: `${onlineCount}/${RPC_NODES.length}`,
      nodes: testResults,
      nodeHealth,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      error: String(err?.message || err)
    });
  }
});

app.get("/demo-payment-flow", async (_req, res) => {
  try {
    return res.json({
      status: "READY FOR DEMO",
      supportedOperations: [
        "POST /api/transaction/send - Send Nano to recipient",
        "GET /api/transaction/history - View payment history",
        "GET /balance/:account - Check account balance"
      ],
      paymentFlow: {
        step1: "User initiates payment with recipient and amount",
        step2: "Backend validates sender balance",
        step3: "Backend builds and signs Nano block",
        step4: "Broadcast via RPC with automatic failover",
        step5: "Poll for confirmation (max 10-20 seconds)",
        step6: "Return tx_hash and status to frontend"
      },
      demoReady: true
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get("/balance/:account", async (req, res) => {
  try {
    const result = await getBalance(req.params.account);
    return res.json(result);
  } catch {
    return res.json({ success: false, data: null, error: "RPC failure", source: null });
  }
});

app.get("/confirm/:hash", async (req, res) => {
  try {
    const result = await confirmTransaction(req.params.hash);
    return res.json(result);
  } catch {
    return res.json({ success: false, data: null, error: "RPC failure", source: null });
  }
});

app.use(errorLogger);

app.use((err, req, res, _next) => {
  console.error("Server error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl
  });
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

async function start() {
  if (!process.env.RPC_NODES) {
    console.warn("RPC_NODES not configured. Falling back to default public nodes.");
  }

  // Retry MongoDB connection
  let mongoConnected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await mongoose.connect(config.mongodb.uri, config.mongodb.options);
      console.log("MongoDB connected");
      mongoConnected = true;
      break;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, err);
      if (attempt < 5) {
        console.log(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  if (!mongoConnected) {
    console.error("Failed to connect to MongoDB after 5 attempts. Exiting.");
    process.exit(1);
  }

  const server = createServer(app);
  
  if (config.websocket.enabled) {
    wsManager.initialize(server);
  }

  startSubscriptionAutomation();
  
  const { default: webhookService } = await import("./services/webhookService.js");
  webhookService.initialize();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
