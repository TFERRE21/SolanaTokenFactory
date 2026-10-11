const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";

function getDevnetRpcUrl() {
  const raw = process.env.SOLANA_RPC_URL || DEFAULT_DEVNET_RPC;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError("SOLANA_RPC_URL must be a valid URL");
  }
  if (url.protocol !== "https:" || !/devnet/i.test(url.hostname)) {
    throw new Error("Only an HTTPS Solana Devnet RPC endpoint is allowed in this milestone");
  }
  return url.toString();
}

/**
 * Read-only Devnet connectivity check. This function cannot sign or submit transactions.
 */
export async function checkSolanaDevnet({ fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const endpoint = getDevnetRpcUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const callRpc = async (method, params = []) => {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || "Solana RPC error");
      return payload.result;
    };

    const [health, slot] = await Promise.all([
      callRpc("getHealth"),
      callRpc("getSlot", [{ commitment: "confirmed" }])
    ]);
    return {
      ok: health === "ok" && Number.isSafeInteger(slot),
      cluster: "devnet",
      health,
      slot,
      readOnly: true,
      submitsTransactions: false
    };
  } catch (error) {
    return {
      ok: false,
      cluster: "devnet",
      readOnly: true,
      submitsTransactions: false,
      error: error.name === "AbortError" ? "Devnet RPC timed out" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}
