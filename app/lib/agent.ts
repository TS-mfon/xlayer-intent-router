import { createHash } from "crypto";
import { IntentDraft, QuoteResult } from "./schema";
import { getOkxSwapQuote, okxRuntimeReady } from "./okx";

const TOKEN_ALIASES: Record<string, string> = {
  OKB: "OKB",
  USDT: "USDT",
  USDC: "USDC",
  WETH: "WETH"
};

export function parseIntent(prompt: string): IntentDraft {
  const normalized = prompt.trim().toUpperCase();
  const amount = normalized.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0";
  const pair = normalized.match(/\b(OKB|USDT|USDC|WETH)\b.*\b(?:TO|INTO|FOR)\b.*\b(OKB|USDT|USDC|WETH)\b/);
  const slippage = normalized.match(/SLIPPAGE(?:\s+IS)?(?:\s+UNDER|\s+<=|\s+<|\s+AT)?\s*(\d+(?:\.\d+)?)%?/);

  if (!pair || amount === "0") {
    throw new Error("Try a swap intent like: swap 5 OKB to USDT if slippage is under 0.8%");
  }

  return {
    action: "swap",
    tokenIn: TOKEN_ALIASES[pair[1]],
    tokenOut: TOKEN_ALIASES[pair[2]],
    amountIn: amount,
    maxSlippageBps: Math.round(Number(slippage?.[1] ?? "1") * 100),
    deadlineMinutes: 20
  };
}

export async function getQuote(intent: IntentDraft): Promise<QuoteResult> {
  const hasOkxConfig = okxRuntimeReady();
  if (hasOkxConfig) {
    return getOkxSwapQuote(intent);
  }

  const expected = estimateMockOutput(intent.amountIn, intent.tokenIn, intent.tokenOut);
  const minOut = expected * (10_000 - intent.maxSlippageBps) / 10_000;
  const quoteHash = `0x${createHash("sha256").update(JSON.stringify({ intent, expected, minOut })).digest("hex")}`;

  return {
    status: hasOkxConfig ? "quoted" : "mock",
    route: hasOkxConfig
      ? "OKX Trade MCP route placeholder for X Layer"
      : "Mock OKB/USDT route until OKX MCP credentials are available",
    expectedAmountOut: formatAmount(expected),
    minAmountOut: formatAmount(minOut),
    quoteHash,
    router: "0x0000000000000000000000000000000000000000",
    calldata: "0x",
    warnings: hasOkxConfig
      ? ["Runtime OKX MCP invocation is configured outside the Next.js process."]
      : ["OKX API/MCP credentials are not configured; this is a non-executing quote."]
  };
}

export async function simulateIntent(intent: IntentDraft, quote: QuoteResult) {
  const hasTenderlyConfig = Boolean(
    process.env.TENDERLY_ACCOUNT_ID && process.env.TENDERLY_PROJECT_ID && process.env.TENDERLY_ACCESS_KEY
  );

  if (quote.status !== "quoted") {
    return {
      status: "blocked" as const,
      summary: "Execution is blocked because the quote is mocked.",
      tenderlyUrl: undefined
    };
  }

  if (!hasTenderlyConfig) {
    return {
      status: "passed" as const,
      summary:
        `OKX returned executable calldata for ${intent.amountIn} ${intent.tokenIn} to ${intent.tokenOut}. Tenderly is not configured, so the backend will run an X Layer RPC preflight before submitting execution.`,
      tenderlyUrl: undefined
    };
  }

  return {
    status: "passed" as const,
    summary: `Tenderly simulation accepted ${intent.amountIn} ${intent.tokenIn} to ${intent.tokenOut}.`,
    tenderlyUrl: undefined
  };
}

function estimateMockOutput(amountIn: string, tokenIn: string, tokenOut: string): number {
  const amount = Number(amountIn);
  if (!Number.isFinite(amount)) return 0;
  if (tokenIn === "OKB" && (tokenOut === "USDT" || tokenOut === "USDC")) return amount * 52;
  if ((tokenIn === "USDT" || tokenIn === "USDC") && tokenOut === "OKB") return amount / 52;
  return amount;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
