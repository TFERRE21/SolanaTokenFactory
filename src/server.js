import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { calculateSellPlan } from "./sell-engine.js";
import { checkSolanaDevnet, createSplTokenOnDevnet } from "./solana-devnet.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const json = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
};

const adminSessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function readCookie(req, name) {
  const cookie = req.headers.cookie || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}
function validAdminSession(req) {
  const id = readCookie(req, "stf_admin");
  const expires = adminSessions.get(id);
  if (!id || !expires || expires < Date.now()) {
    if (id) adminSessions.delete(id);
    return false;
  }
  return true;
}

function adminTokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJsonBody(req, maxBytes = 8192) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Object.assign(new Error("Body must be valid JSON"), { statusCode: 400 });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "POST" && req.url === "/api/admin/login") {
    try {
      const body = await readJsonBody(req);
      if (!adminTokenMatches(body.adminToken, config.adminApiToken)) {
        json(res, 401, { error: "Token administrativo inválido" });
        return;
      }
      const session = randomBytes(32).toString("hex");
      adminSessions.set(session, Date.now() + SESSION_TTL_MS);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": `stf_admin=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure`
      });
      res.end(JSON.stringify({ ok: true, expiresInSeconds: 28800 }));
    } catch (error) {
      json(res, error.statusCode || 400, { error: error.message || "Falha na autenticação" });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/logout") {
    const id = readCookie(req, "stf_admin");
    if (id) adminSessions.delete(id);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "stf_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/admin/session") {
    json(res, 200, { authenticated: validAdminSession(req) });
    return;
  }

  if (req.method === "GET" && req.url === "/api/status") {
    json(res, 200, {
      project: "SolanaTokenFactory",
      mode: config.tradingMode,
      cluster: config.solanaCluster,
      realTradingEnabled: false,
      tokenCreationEnabled: config.tokenCreationEnabled && config.solanaCluster === "devnet" && config.tradingMode === "devnet",
      autoLaunchEnabled: config.autoLaunchEnabled,
      autoSellEnabled: config.autoSellEnabled,
      sellPlanExample: calculateSellPlan({
        positionValue: 200,
        targetProceeds: config.targetProceedsBrl,
        slippageBps: 0,
        maxSlippageBps: config.maxSlippageBps
      })
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/devnet/health") {
    if (config.solanaCluster !== "devnet") {
      json(res, 409, { ok: false, error: "Devnet health check is disabled because SOLANA_CLUSTER is not devnet" });
      return;
    }
    const result = await checkSolanaDevnet();
    json(res, result.ok ? 200 : 503, result);
    return;
  }

  if (req.method === "POST" && req.url === "/api/devnet/tokens") {
    if (config.solanaCluster !== "devnet" || config.tradingMode !== "devnet" || !config.tokenCreationEnabled) {
      json(res, 403, { error: "Token creation is disabled. Explicitly enable Devnet mode and TOKEN_CREATION_ENABLED." });
      return;
    }
    if (!validAdminSession(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const result = await createSplTokenOnDevnet({
        initialSupply: body.initialSupply,
        decimals: body.decimals === undefined ? 6 : body.decimals
      });
      json(res, 201, result);
    } catch (error) {
      json(res, error.statusCode || 400, { error: error.message || "Token creation failed" });
    }
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    try {
      const html = await readFile(path.join(root, "../public/index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("Dashboard file unavailable");
    }
    return;
  }

  json(res, 404, { error: "Not found" });
});

// Bind to all container interfaces so the platform's reverse proxy can reach Node.
server.listen(config.port, "0.0.0.0", () => {
  console.log(`SolanaTokenFactory dashboard listening on 0.0.0.0:${config.port} (mode=${config.tradingMode})`);
});
