import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";

const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MINT_SIZE = 82;

export function getDevnetRpcUrl() {
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

function loadDevnetWallet() {
  const raw = process.env.SOLANA_DEVNET_SECRET_KEY;
  if (!raw) throw new Error("SOLANA_DEVNET_SECRET_KEY is not configured");
  let bytes;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
      throw new Error("expected a JSON array of byte values");
    }
    bytes = Uint8Array.from(parsed);
  } catch {
    throw new Error("SOLANA_DEVNET_SECRET_KEY must be a JSON byte array; never put it in source control");
  }
  try {
    return Keypair.fromSecretKey(bytes);
  } catch {
    throw new Error("SOLANA_DEVNET_SECRET_KEY is not a valid Solana keypair");
  }
}

export function parseTokenAmount(value, decimals) {
  if (typeof value !== "string" || !/^(0|[1-9]\\d*)(\\.\\d+)?$/.test(value)) {
    throw new TypeError('initialSupply must be a positive decimal string, such as "1000"');
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new RangeError(`initialSupply has more than ${decimals} decimal places`);
  }
  const units = BigInt(whole) * (10n ** BigInt(decimals)) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n || units > 0xffffffffffffffffn) {
    throw new RangeError("initialSupply is outside the supported token amount range");
  }
  return units;
}

export function deriveAssociatedTokenAddress(owner, mint) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

export function buildInitializeMintInstruction(mint, decimals, authority) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new RangeError("decimals must be an integer from 0 to 9");
  }
  const data = Buffer.alloc(35);
  data[0] = 0; // InitializeMint
  data[1] = decimals;
  authority.toBuffer().copy(data, 2);
  data[34] = 0; // no freeze authority
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data
  });
}

export function buildCreateAssociatedTokenAccountInstruction(payer, address, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.alloc(0)
  });
}

export function buildMintToInstruction(mint, destination, authority, amount) {
  if (typeof amount !== "bigint" || amount <= 0n || amount > 0xffffffffffffffffn) {
    throw new RangeError("amount must be a positive unsigned 64-bit integer");
  }
  const data = Buffer.alloc(9);
  data[0] = 7; // MintTo
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false }
    ],
    data
  });
}

/**
 * Creates an SPL mint and initial supply only on Solana Devnet.
 * Requires a dedicated Devnet wallet funded with test SOL.
 * SPL instruction layouts are defined here to avoid the vulnerable
 * bigint-buffer dependency pulled in by @solana/spl-token.
 */
export async function createSplTokenOnDevnet({ initialSupply, decimals = 6 }) {
  const endpoint = getDevnetRpcUrl();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new RangeError("decimals must be an integer from 0 to 9");
  }
  const amount = parseTokenAmount(initialSupply, decimals);
  const payer = loadDevnetWallet();
  const connection = new Connection(endpoint, { commitment: "confirmed" });
  const mint = Keypair.generate();
  const associatedTokenAccount = deriveAssociatedTokenAddress(payer.publicKey, mint.publicKey);
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID
    }),
    buildInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey),
    buildCreateAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedTokenAccount,
      payer.publicKey,
      mint.publicKey
    ),
    buildMintToInstruction(mint.publicKey, associatedTokenAccount, payer.publicKey, amount)
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer, mint], {
    commitment: "confirmed",
    preflightCommitment: "confirmed"
  });
  const confirmed = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  if (!confirmed.value[0] || confirmed.value[0].err) {
    throw new Error("Devnet transaction failed confirmation");
  }

  return {
    cluster: "devnet",
    mintAddress: mint.publicKey.toBase58(),
    tokenAccount: associatedTokenAccount.toBase58(),
    ownerAddress: payer.publicKey.toBase58(),
    decimals,
    initialSupply,
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    confirmed: true
  };
}
