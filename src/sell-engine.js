/**
 * Sell planning only. This module does not submit blockchain transactions.
 * All values are in the same quote currency and are illustrative estimates.
 */
export function calculateSellPlan({
  positionValue,
  targetProceeds,
  slippageBps = 100,
  maxSlippageBps = 100
}) {
  for (const [key, value] of Object.entries({ positionValue, targetProceeds, slippageBps, maxSlippageBps })) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${key} must be a non-negative number`);
  }
  if (positionValue <= 0) throw new RangeError("positionValue must be greater than zero");
  if (targetProceeds <= 0) throw new RangeError("targetProceeds must be greater than zero");
  if (slippageBps > maxSlippageBps) {
    return { status: "blocked_slippage", estimatedProceeds: 0, sellFraction: 0, retainedFraction: 1 };
  }

  // Estimate proceeds after configured slippage. This is not a live quote.
  const sellFraction = Math.min(1, targetProceeds / (positionValue * (1 - slippageBps / 10_000)));
  const estimatedProceeds = positionValue * sellFraction * (1 - slippageBps / 10_000);

  return {
    status: estimatedProceeds >= targetProceeds ? "target_estimable" : "insufficient_position_value",
    sellFraction,
    retainedFraction: 1 - sellFraction,
    estimatedProceeds,
    estimatedRetainedValue: positionValue * (1 - sellFraction),
    requiresLiveQuote: true,
    submitsTransaction: false
  };
}

/** Idempotency guard: never treat an unconfirmed transaction as sold. */
export function classifyExecution({ signature, confirmed, failed, orderId }) {
  if (!orderId) throw new TypeError("orderId is required for idempotency");
  if (failed) return { orderId, status: "failed", proceedsRecognized: false };
  if (!signature) return { orderId, status: "pending", proceedsRecognized: false };
  if (!confirmed) return { orderId, status: "pending_confirmation", signature, proceedsRecognized: false };
  return { orderId, status: "confirmed", signature, proceedsRecognized: true };
}
