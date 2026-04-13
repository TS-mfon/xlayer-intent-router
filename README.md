# X Layer Intent Router

Chat-first swap intents for X Layer. The app turns a plain-language trade request into a structured intent, asks OKX Onchain OS / Trade routing for a quote, blocks unsafe routes with Tenderly simulation, then executes through an X Layer vault contract controlled by the project Agentic Wallet.

## Hackathon Positioning

X Layer Intent Router is built for the X Layer Arena. It uses X Layer as the settlement and policy layer for agentic swaps, while OKX Onchain OS skills provide the agent-facing quote and trade route. The product focus is a safer flow for users who want agent help without giving an agent unlimited wallet control.

Team member: `sudodave`

## Architecture

- **Next.js app**: intent input, quote review, simulation state, execution readiness, and X Layer deployment config.
- **Agent backend routes**: parse the user prompt, request a route, simulate the route, and gate execution readiness.
- **`IntentRouterVault` contract**: stores funded swap intents, supports native OKB and ERC-20 deposits, enforces router allowlists, restricts execution to the Agentic Wallet, checks deadlines, prevents replay, and enforces `minAmountOut`.
- **Agentic Wallet**: configured as `AGENT_WALLET_ADDRESS`; this is the project onchain identity and the only executor allowed to call `executeIntent`.

## X Layer Deployment

- App: `https://xlayer-intent-router.vercel.app`
- Network: X Layer mainnet
- Chain ID: `196`
- RPC: `https://rpc.xlayer.tech`
- Explorer: `https://www.okx.com/web3/explorer/xlayer`
- Vault deployment address: `0x6f20e728a36c710ba7ECe9b3378Cb14A69eE0b1B`
- Deployment transaction: `0xdffc407f047967f535448276093ec418d42d7ca6e51460c2c9fa7e24baaa6fac`
- Agentic Wallet address: `0x23c9EE4568A8ed6364183393D41D243F2f5A2AC6`
- Agentic Wallet funding transaction: `0x20aeff95fa409258711cec9fa8e70e7112dd1bc4e3edf8dd14a18ed380e56281`
- Contract owner/admin: `0xEd9EDd8586b20524CafA4F568413C504C9B03172`

## Onchain OS / Uniswap Skill Usage

This repo is wired for the OKX MCPs requested by the hackathon flow:

```bash
codex mcp add okx-skills -- npx -y @okx/onchainos-mcp
codex mcp add okx-trade -- npx -y okx-trade-mcp
codex mcp add tenderly --url https://mcp.tenderly.co/mcp
```

`okx-skills` is the Onchain OS skills surface for agent wallet and onchain actions. `okx-trade` is the trade routing surface used for swap quotes and calldata. Tenderly is used as the simulation gate before a route can be executed.

The current app blocks live execution unless a real OKX route and Tenderly simulation are configured. Without credentials it returns a mock quote so the product flow is demoable without risking a fake transaction.

## Working Mechanics

1. User enters an intent such as `swap 5 OKB to USDT if slippage is under 0.8%`.
2. `/api/intent/parse` extracts token pair, amount, slippage, and deadline.
3. `/api/quote` prepares the quote payload. With OKX credentials/MCP available, this becomes the OKX Trade route. Without credentials, it returns a non-executing mock quote.
4. `/api/simulate` gates mock quotes and marks real OKX quotes as executable. If Tenderly credentials are configured, this is the Tenderly gate; otherwise `/api/execute` runs an X Layer RPC preflight before submitting the agent transaction.
5. User creates an onchain intent in `IntentRouterVault` by depositing `tokenIn`.
6. Agentic Wallet executes the approved intent through `executeIntent`, and the vault enforces router allowlist, deadline, replay protection, and `minAmountOut`.

## Runtime Credentials

Real execution requires these local environment variables:

```bash
XLAYER_CHAIN_ID=196
XLAYER_RPC_URL=https://rpc.xlayer.tech
OKX_API_KEY=...
OKX_SECRET_KEY=...
OKX_PASSPHRASE=...
OKX_PROJECT_ID=... # optional, only if your OKX project requires it
AGENT_PRIVATE_KEY=...
ADMIN_PRIVATE_KEY=...
NEXT_PUBLIC_INTENT_ROUTER_VAULT=0x6f20e728a36c710ba7ECe9b3378Cb14A69eE0b1B
```

The backend uses the OKX DEX API to request swap calldata for the vault address, then uses `AGENT_PRIVATE_KEY` to submit `executeIntent`. Native OKB intents are deposited with `msg.value`; ERC-20 intents use token approval and vault deposit. `ADMIN_PRIVATE_KEY` is only used to allowlist the OKX router returned by the quote. `.env.local` is gitignored and should not be committed.

If OKX token discovery does not return a token symbol on X Layer mainnet, set `OKX_TOKEN_MAP_JSON` manually:

```bash
OKX_TOKEN_MAP_JSON={"USDT":{"address":"0x...","decimals":6},"USDC":{"address":"0x...","decimals":6}}
```

## Local Development

```bash
npm install
npm run dev
```

Contract checks:

```bash
npm run contracts:build
npm run contracts:test
```

Deploy to X Layer mainnet after funding the deployer and setting env vars:

```bash
export XLAYER_RPC_URL=https://rpc.xlayer.tech
export AGENT_WALLET_ADDRESS=0x...
export PRIVATE_KEY=0x...
npm run contracts:deploy:xlayer
```

After deployment, set `NEXT_PUBLIC_INTENT_ROUTER_VAULT` and update the deployment address above.
