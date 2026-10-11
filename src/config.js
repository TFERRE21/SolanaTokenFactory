const numberFromEnv = (key, fallback) => {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key}`);
  return value;
};

export const config = Object.freeze({
  port: Math.trunc(numberFromEnv("APP_PORT", 3000)),
  tradingMode: process.env.TRADING_MODE ?? "simulation",
  solanaCluster: process.env.SOLANA_CLUSTER ?? "devnet",
  targetMultiple: numberFromEnv("TARGET_MULTIPLE", 2),
  targetProceedsBrl: numberFromEnv("TARGET_PROCEEDS_BRL", 195),
  initialCapitalBrl: numberFromEnv("INITIAL_CAPITAL_BRL", 100),
  maxSlippageBps: numberFromEnv("MAX_SLIPPAGE_BPS", 100),
  autoLaunchEnabled: process.env.AUTO_LAUNCH_ENABLED === "true",
  autoSellEnabled: process.env.AUTO_SELL_ENABLED === "true"
});

if (!["simulation", "devnet"].includes(config.tradingMode)) {
  throw new Error("This scaffold only supports simulation or devnet mode.");
}
