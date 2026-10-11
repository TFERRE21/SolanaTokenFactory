# SolanaTokenFactory

Automated Solana token ecosystem — **simulation-first**.

## Current milestone
- Sell-plan calculation and execution-state tests.
- Read-only Devnet connectivity check (`getHealth` and `getSlot`).
- Protected Devnet-only SPL mint endpoint that creates a mint, creates the operator's associated token account, and mints the requested initial supply in one confirmed transaction.
- Exact decimal-string parsing for token amounts; no floating-point conversion for base units.

## Devnet token creation (opt-in only)
Token creation is disabled by default. To deliberately enable it for testing, configure these as hosting secrets/environment variables:

- `TRADING_MODE=devnet`
- `SOLANA_CLUSTER=devnet`
- `TOKEN_CREATION_ENABLED=true`
- `ADMIN_API_TOKEN` set to a long random secret
- `SOLANA_DEVNET_SECRET_KEY` set to a JSON array of byte values for a **dedicated Devnet-only wallet**
- Optional `SOLANA_RPC_URL` set to an HTTPS Devnet RPC URL

Fund the dedicated wallet with **test SOL only**. Never use a mainnet wallet or reuse its secret key. Never commit secrets, put them in frontend code, or send them in chat.

Send a POST request to `/api/devnet/tokens` with header `X-Admin-Token: <your secret>` and JSON body such as `{"initialSupply":"1000","decimals":6}`. This creates a real SPL mint on Devnet, mints 1,000 tokens to the configured wallet, and returns the mint address and confirmed transaction link. Name/symbol/logo metadata is not yet included in this first token-mint milestone.

The endpoint rejects requests unless both the Devnet cluster and mode are selected and the feature flag is explicitly enabled. The RPC URL is validated as HTTPS with a Devnet hostname. Do not expose the admin token publicly.

## Initial sell rule
The intended example is: starting capital R$100; at a position value of R$200, target R$195 proceeds and leave approximately R$5 in tokens. This is **not** the same as selling 95% of token quantity. Actual proceeds depend on liquidity, slippage, fees and price impact. Never report a target as a guaranteed result.

## Safety
- Default mode is simulation and token creation is off.
- The token endpoint is limited to Devnet and protected by an admin token.
- Mainnet trading, automated sales and liquidity provisioning are not implemented/enabled.
- No private keys or seed phrases belong in source control or frontend code.
- Never enable real trading without separate security review and end-to-end testing.

## Setup
Requires Node.js 20+.

```bash
npm install
npm test
npm run check
npm run dev
```

Open http://localhost:3000. The dashboard checks Devnet using `/api/devnet/health`.

## Roadmap
1. SPL mint creation on Devnet with confirmed transaction signature.
2. Token metadata/logo generation and token registry.
3. Automated free static token pages.
4. Organic content scheduling and monitoring.
5. Devnet trade simulation and transaction confirmation tests.
6. Mainnet support only after explicit configuration, security review, and end-to-end testing.

This project does not promise profit, buyers, liquidity or token longevity.
