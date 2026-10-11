import test from "node:test";
import assert from "node:assert/strict";
import { calculateSellPlan, classifyExecution } from "../src/sell-engine.js";

test("R$200 position targets estimated R$195 proceeds and retains only the remainder", () => {
  const plan = calculateSellPlan({ positionValue: 200, targetProceeds: 195, slippageBps: 0, maxSlippageBps: 100 });
  assert.equal(plan.status, "target_estimable");
  assert.ok(Math.abs(plan.sellFraction - 0.975) < 1e-10);
  assert.ok(Math.abs(plan.retainedFraction - 0.025) < 1e-10);
  assert.ok(Math.abs(plan.estimatedProceeds - 195) < 1e-10);
  assert.equal(plan.submitsTransaction, false);
});

test("blocks when slippage exceeds configured limit", () => {
  const plan = calculateSellPlan({ positionValue: 200, targetProceeds: 195, slippageBps: 250, maxSlippageBps: 100 });
  assert.equal(plan.status, "blocked_slippage");
});

test("rejects invalid position values", () => {
  assert.throws(() => calculateSellPlan({ positionValue: 0, targetProceeds: 10 }), /greater than zero/);
  assert.throws(() => calculateSellPlan({ positionValue: -1, targetProceeds: 10 }), /non-negative/);
});

test("does not recognize proceeds until transaction is confirmed", () => {
  assert.equal(classifyExecution({ orderId: "order-1", signature: "sig", confirmed: false }).proceedsRecognized, false);
  assert.equal(classifyExecution({ orderId: "order-1", signature: "sig", confirmed: true }).proceedsRecognized, true);
});

test("failed or missing signatures never count as a sale", () => {
  assert.equal(classifyExecution({ orderId: "order-2", failed: true }).proceedsRecognized, false);
  assert.equal(classifyExecution({ orderId: "order-3" }).status, "pending");
});
