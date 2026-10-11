# SolanaTokenFactory

Automated Solana token ecosystem — **simulation-first**.

## Current milestone
The first release focuses on validating sell logic before any mainnet funds are used:
- Calculate target and sell quantity.
- Require confirmed execution before recording proceeds.
- Handle slippage, insufficient liquidity, rejected transactions and retries.
- Prevent duplicate sells with idempotency keys.
- Keep token monitoring separate from trading and launch automation.

## Initial sell rule
The intended example is: starting capital R$100; at a position value of R$200, sell enough to target R$195 proceeds and leave approximately R$5 in tokens. This is **not** the same as selling 95% of token quantity. Actual proceeds depend on liquidity, slippage, fees and price impact. Never report a target as a guaranteed result.

## Safety
- Default mode is simulation.
- No private keys or seed phrases belong in source control or frontend code.
- Mainnet trading, token creation and liquidity provisioning are not enabled in this scaffold.
- Do not enable real trading until the test suite passes and a separate security review is completed.

## Setup
Requires Node.js 20+.

```bash
npm install
npm test
npm run dev
```

Open http://localhost:3000.

## Roadmap
1. Unit tests for sell calculations and failure cases.
2. Solana devnet integration and transaction confirmation checks.
3. Token metadata/logo generation and token registry.
4. Free static token pages on a supported hosting platform.
5. Organic content scheduling and monitoring.
6. Mainnet support only after explicit configuration, security review, and end-to-end testing.

This project does not promise profit, buyers, liquidity or token longevity.