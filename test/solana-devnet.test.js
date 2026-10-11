import test from "node:test";
import assert from "node:assert/strict";
import { checkSolanaDevnet, parseTokenAmount } from "../src/solana-devnet.js";

test("Devnet check uses read-only health and slot RPC methods", async () => {
  const previous = process.env.SOLANA_RPC_URL;
  process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
  const methods = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    methods.push(body.method);
    return {
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: body.id, result: body.method === "getHealth" ? "ok" : 12345 })
    };
  };
  try {
    const result = await checkSolanaDevnet({ fetchImpl, timeoutMs: 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.cluster, "devnet");
    assert.equal(result.slot, 12345);
    assert.equal(result.readOnly, true);
    assert.equal(result.submitsTransactions, false);
    assert.deepEqual(methods.sort(), ["getHealth", "getSlot"]);
  } finally {
    if (previous === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previous;
  }
});

test("Devnet check refuses non-Devnet RPC endpoints", async () => {
  const previous = process.env.SOLANA_RPC_URL;
  process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
  try {
    await assert.rejects(() => checkSolanaDevnet({ fetchImpl: async () => { throw new Error("must not call fetch"); } }), /Only an HTTPS Solana Devnet RPC endpoint/);
  } finally {
    if (previous === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previous;
  }
});

test("token amount parser converts decimal strings to exact base units", () => {
  assert.equal(parseTokenAmount("1000", 6), 1_000_000_000n);
  assert.equal(parseTokenAmount("12.3456", 4), 123456n);
  assert.equal(parseTokenAmount("0.000001", 6), 1n);
});

test("token amount parser rejects zero, malformed amounts and excess decimals", () => {
  assert.throws(() => parseTokenAmount("0", 6), /supported token amount range/);
  assert.throws(() => parseTokenAmount("-1", 6), /positive decimal string/);
  assert.throws(() => parseTokenAmount("1.123", 2), /more than 2 decimal places/);
  assert.throws(() => parseTokenAmount("1e6", 6), /positive decimal string/);
});
