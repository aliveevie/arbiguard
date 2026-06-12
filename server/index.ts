import { getOpenAIModelName, isOpenAIConfigured } from "./loadEnv.js";
import { existsSync } from "fs";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import monitorRouter from "./routes/monitor.js";
import assessRouter from "./routes/assess.js";
import breakerRouter from "./routes/breaker.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import firewallRouter from "./routes/firewall.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ── Middleware ──────────────────────────────────────────────────────────
app.use(express.json());

// CORS — allow all origins for hackathon demo
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Request logging
app.use((req, _res, next) => {
  console.log(`[ArbiGuard] ${req.method} ${req.path}`);
  next();
});

// ── Static files (Chat UI) ────────────────────────────────────────────
// Dev (tsx): server/../public. Prod: dist/server/../../public
const publicOne = join(__dirname, "..", "public");
const publicTwo = join(__dirname, "..", "..", "public");
const publicPath = existsSync(join(publicOne, "index.html"))
  ? publicOne
  : existsSync(join(publicTwo, "index.html"))
    ? publicTwo
    : publicOne;
app.use(express.static(publicPath));

// ── Routes ─────────────────────────────────────────────────────────────
app.use("/api/chat", chatRouter);
app.use("/api/monitor", monitorRouter);
app.use("/api/assess", assessRouter);
app.use("/api/breaker", breakerRouter);
app.use("/api/health", healthRouter);
app.use("/api/firewall", firewallRouter);

// ── Status endpoint ────────────────────────────────────────────────────
app.get("/api/status", (_req, res) => {
  res.json({
    service: "ArbiGuard",
    version: "1.0.0",
    description:
      "AI-Agent Skill for Real-Time DeFi Threat Detection on Arbitrum",
    status: "healthy",
    timestamp: Date.now(),
    contracts: {
      arbitrumSepolia: {
        chainId: 421614,
        firewall: "0xad5230b558b8083f4b313f77c83d2765a78645b6",
        riskEngineStylus: "0x47f6e2dbb2dd913baef535b7aa744ee16d337e99",
      },
      robinhoodChainTestnet: {
        chainId: 46630,
        firewall: "0x4ad001282938b6b8cfb8850f69d80c8d9bbbeb75",
        riskEngineStylus: "0x4177bf2196151a05a51f7928988afd3fe7b6e949",
      },
    },
    agent: {
      address: "0xcDBd2FbFc371649D11AaEee0C53b6624Ab3cdD33",
      agentId: 1,
    },
    openai: {
      configured: isOpenAIConfigured(),
      model: getOpenAIModelName(),
    },
    endpoints: [
      { method: "POST", path: "/api/chat", description: "Chat with ArbiGuard agent" },
      { method: "POST", path: "/api/monitor", description: "Start pool monitoring session" },
      { method: "DELETE", path: "/api/monitor/:sessionId", description: "Stop monitoring session" },
      { method: "POST", path: "/api/assess", description: "Assess transaction threat level" },
      { method: "POST", path: "/api/breaker", description: "Trigger circuit breaker" },
      { method: "GET", path: "/api/health/:protocol", description: "Get protocol health report" },
      { method: "GET", path: "/api/status", description: "Server status" },
      { method: "GET", path: "/api/firewall", description: "Live firewall state on Arbitrum Sepolia + Robinhood Chain" },
    ],
    supportedProtocols: ["gmx_v2", "camelot", "aave_v3"],
    supportedNetworks: ["arbitrum_one", "arbitrum_sepolia"],
  });
});

// ── SPA fallback (React app) — after API routes, before 404 ─────────────
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(join(publicPath, "index.html"), (err) => {
    if (err) next(err);
  });
});

// ── 404 ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({
      error: "Not found",
      message: "Endpoint not found. GET /api/status for available endpoints.",
    });
    return;
  }
  res.status(404).send("Not found");
});

// ── Global error handler (must be last) ───────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[ArbiGuard] Unhandled error:", err.message);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
);

app.listen(PORT, () => {
  console.log(`[ArbiGuard] Server running on http://localhost:${PORT}`);
  console.log(`[ArbiGuard] Status: http://localhost:${PORT}/api/status`);
  console.log(`[ArbiGuard] Circuit Breaker: 0xE827C2eF74F67e21c637d3164b3af3bC394cA52F`);
  console.log(`[ArbiGuard] Agent ID: 156 on Arbitrum Sepolia Registry`);
});

export default app;
