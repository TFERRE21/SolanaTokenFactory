import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { calculateSellPlan } from "./sell-engine.js";
import { checkSolanaDevnet } from "./solana-devnet.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      project: "SolanaTokenFactory",
      mode: config.tradingMode,
      cluster: config.solanaCluster,
      realTradingEnabled: false,
      tokenCreationEnabled: false,
      autoLaunchEnabled: config.autoLaunchEnabled,
      autoSellEnabled: config.autoSellEnabled,
      sellPlanExample: calculateSellPlan({
        positionValue: 200,
        targetProceeds: config.targetProceedsBrl,
        slippageBps: 0,
        maxSlippageBps: config.maxSlippageBps
      })
    }));
    return;
  }
  if (req.url === "/api/devnet/health") {
    if (config.solanaCluster !== "devnet") {
      res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Devnet health check is disabled because SOLANA_CLUSTER is not devnet" }));
      return;
    }
    const result = await checkSolanaDevnet();
    res.writeHead(result.ok ? 200 : 503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(result));
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
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
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Bind to all container interfaces so the platform's reverse proxy can reach Node.
server.listen(config.port, "0.0.0.0", () => {
  console.log(`SolanaTokenFactory dashboard listening on 0.0.0.0:${config.port} (mode=${config.tradingMode})`);
});
