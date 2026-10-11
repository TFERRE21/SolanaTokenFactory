import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { calculateSellPlan } from "./sell-engine.js";
import { checkSolanaDevnet, createSplTokenOnDevnet, verifyTokenOnDevnet } from "./solana-devnet.js";
import { getBotState, startBot, stopBot, simulateRecovery } from "./bot-engine.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const json = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
};

const adminSessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const createLimits = new Map();
const CREATE_LIMIT = 3;
const CREATE_WINDOW_MS = 60 * 60 * 1000;
function canCreateFromRequest(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (createLimits.get(ip) || []).filter(t => now - t < CREATE_WINDOW_MS);
  if (recent.length >= CREATE_LIMIT) return false;
  recent.push(now);
  createLimits.set(ip, recent);
  return true;
}

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
      if (!config.adminPanelPassword || !adminTokenMatches(body.adminPassword, config.adminPanelPassword)) {
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

  if (req.method === "GET" && req.url === "/api/bot/prices") {
    try {
      const bot = await getBotState();
      const tokens = bot.tokens || [];
      const prices = await Promise.all(tokens.map(async token => {
        if (!token.mintAddress) return { mintAddress: null, name: token.name, symbol: token.symbol, status: "not_created_on_chain", message: "Token ainda não criado on-chain." };
        if (token.network !== "mainnet-beta") return {
          mintAddress: token.mintAddress, name: token.name, symbol: token.symbol,
          network: token.network || "devnet", status: "no_market_data",
          priceUsd: null, liquidityUsd: null, volume24hUsd: null, change24hPct: null,
          message: "Tokens Devnet não possuem cotação de mercado real. Dados de preço só serão consultados para tokens Mainnet com pares indexados."
        };
        try {
          const response = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(token.mintAddress), { signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error("DexScreener HTTP " + response.status);
          const payload = await response.json();
          const pairs = (payload.pairs || []).filter(pair => pair.chainId === "solana" && pair.priceUsd && Number.isFinite(Number(pair.priceUsd)));
          if (!pairs.length) return { mintAddress: token.mintAddress, name: token.name, symbol: token.symbol, network: token.network, status: "no_liquidity", priceUsd: null, liquidityUsd: null, volume24hUsd: null, change24hPct: null, message: "Nenhum mercado Solana com preço disponível." };
          pairs.sort((a,b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
          const pair = pairs[0];
          return {
            mintAddress: token.mintAddress, name: token.name, symbol: token.symbol, network: token.network,
            status: "market_data", priceUsd: Number(pair.priceUsd),
            liquidityUsd: Number(pair.liquidity?.usd || 0),
            volume24hUsd: Number(pair.volume?.h24 || 0),
            change24hPct: Number(pair.priceChange?.h24 || 0),
            pairUrl: pair.url || null, pairAddress: pair.pairAddress || null,
            updatedAt: new Date().toISOString()
          };
        } catch (error) {
          return { mintAddress: token.mintAddress, name: token.name, symbol: token.symbol, network: token.network, status: "lookup_error", message: error.message };
        }
      }));
      json(res, 200, { ok: true, checkedAt: new Date().toISOString(), prices });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message || "Falha ao consultar preços." });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/bot/verify") {
    try {
      const bot = await getBotState();
      const token = bot.activeToken;
      if (!token || !token.mintAddress || !token.signature || !token.metadataUri) {
        json(res, 409, { ok: false, error: "Não há token ativo com endereço, assinatura e metadados para verificar." });
        return;
      }
      const result = await verifyTokenOnDevnet({
        mintAddress: token.mintAddress,
        signature: token.signature,
        metadataUri: token.metadataUri
      });
      json(res, result.ok ? 200 : 409, result);
    } catch (error) {
      json(res, 400, { ok: false, error: error.message || "Falha na verificação Devnet." });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/bot") {
    json(res, 200, await getBotState());
    return;
  }

  if (req.method === "POST" && req.url === "/api/bot/start") {
    try {
      json(res, 200, await startBot());
    } catch (error) {
      json(res, 400, { error: error.message || "Não foi possível ligar o robô." });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/bot/stop") {
    try {
      json(res, 200, await stopBot());
    } catch (error) {
      json(res, 400, { error: error.message || "Não foi possível pausar o robô." });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/bot/simulate-recovery") {
    try {
      const body = await readJsonBody(req);
      json(res, 200, await simulateRecovery(Number(body.proceedsBrl)));
    } catch (error) {
      json(res, 400, { error: error.message || "Não foi possível registrar a simulação." });
    }
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
    // ADMIN_API_TOKEN remains exclusively server-side; never expose it to the browser.
    // Creation remains Devnet-only and is rate-limited because the public form has no login.
    if (!config.adminApiToken) {
      json(res, 503, { error: "ADMIN_API_TOKEN is not configured on the server" });
      return;
    }
    if (!canCreateFromRequest(req)) {
      json(res, 429, { error: "Limite atingido: máximo de 3 criações por hora por IP." });
      return;
    }
    try {
      const body = await readJsonBody(req, 4 * 1024 * 1024);
      const result = await createSplTokenOnDevnet({
        initialSupply: body.initialSupply,
        decimals: body.decimals === undefined ? 6 : body.decimals,
        name: body.name,
        symbol: body.symbol,
        description: body.description,
        imageUrl: body.imageUrl,
        imageDataUrl: body.imageDataUrl,
        imageFileName: body.imageFileName
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
