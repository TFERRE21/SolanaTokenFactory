# SolanaTokenFactory

Automated Solana token ecosystem — **simulation-first**.

## Current milestone
- Sell-plan calculation and execution-state unit tests.
- Read-only Solana Devnet connectivity check (`getHealth` and `getSlot`).
- Dashboard endpoint at `/api/devnet/health` displays Devnet connectivity without signing or submitting transactions.

## Initial sell rule
The intended example is: starting capital R$100; at a position value of R$200, target R$195 proceeds and leave approximately R$5 in tokens. This is **not** the same as selling 95% of token quantity. Actual proceeds depend on liquidity, slippage, fees and price impact. Never report a target as a guaranteed result.

## Safety
- Default mode is simulation.
- The Devnet health check is read-only. It cannot create tokens or submit transactions.
- Only HTTPS RPC endpoints whose hostname contains `devnet` are accepted by this milestone.
- No private keys or seed phrases belong in source control or frontend code.
- Mainnet trading, token creation and liquidity provisioning remain disabled.
- Do not enable real trading until transaction flows are tested on Devnet and a separate security review is completed.

## Setup
Requires Node.js 20+.

```bash
npm test
npm run check
npm run dev
```

Open http://localhost:3000. The dashboard checks Devnet using `/api/devnet/health`.

Optional RPC override: set `SOLANA_RPC_URL` to an HTTPS Solana Devnet RPC URL. Do not put private keys or seed phrases in this setting.

## Roadmap
1. Unit tests for sell calculations, failure cases and Devnet health checks.
2. Devnet transaction construction, confirmation and duplicate/retry tests without mainnet funds.
3. Token metadata/logo generation and token registry.
4. Free static token pages on a supported hosting platform.
5. Organic content scheduling and monitoring.
6. Mainnet support only after explicit configuration, security review, and end-to-end testing.

This project does not promise profit, buyers, liquidity or token longevity.
