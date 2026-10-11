const numberFromEnv = (key, fallback) => {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key}`);
  return value;
};

export const config = Object.freeze({
  // Hosting platforms commonly inject PORT. APP_PORT remains a local fallback.
  port: Math.trunc(numberFromEnv("PORT", numberFromEnv("APP_PORT", 3000))),
  tradingMode: process.env.TRADING_MODE ?? "simulation",
  solanaCluster: process.env.SOLANA_CLUSTER ?? "devnet",
  targetMultiple: numberFromEnv("TARGET_MULTIPLE", 2),
  targetProceedsBrl: numberFromEnv("TARGET_PROCEEDS_BRL", 195),
  initialCapitalBrl: numberFromEnv("INITIAL_CAPITAL_BRL", 100),
  maxSlippageBps: numberFromEnv("MAX_SLIPPAGE_BPS", 100),
  autoLaunchEnabled: process.env.AUTO_LAUNCH_ENABLED === "true",
  autoSellEnabled: process.env.AUTO_SELL_ENABLED === "true",
  tokenCreationEnabled: process.env.TOKEN_CREATION_ENABLED === "true",
  adminApiToken: process.env.ADMIN_API_TOKEN ?? "",
  adminPanelPassword: process.env.ADMIN_PANEL_PASSWORD ?? ""
});

if (!["simulation", "devnet"].includes(config.tradingMode)) {
  throw new Error("This scaffold only supports simulation or devnet mode.");
}

// Never permit token creation unless explicitly enabled for Devnet.
if (config.tokenCreationEnabled && config.solanaCluster !== "devnet") {
  throw new Error("Token creation is restricted to SOLANA_CLUSTER=devnet.");
}
