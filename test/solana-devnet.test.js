import test from "node:test";
import assert from "node:assert/strict";
import { checkSolanaDevnet } from "../src/solana-devnet.js";

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
