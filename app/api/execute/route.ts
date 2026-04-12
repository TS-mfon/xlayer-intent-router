import { NextRequest, NextResponse } from "next/server";
import { intentSchema, quoteSchema } from "../../lib/schema";
import { addresses, xLayerTestnet } from "../../lib/xlayer";
import { executeVaultIntent } from "../../lib/vault";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const intent = intentSchema.parse(body.intent);
    const quote = quoteSchema.parse(body.quote);
    const intentId = body.intentId ? BigInt(String(body.intentId)) : null;

    if (!addresses.vault || !addresses.agentWallet) {
      return NextResponse.json(
        {
          status: "blocked",
          summary: "Execution is blocked until NEXT_PUBLIC_INTENT_ROUTER_VAULT and AGENT_WALLET_ADDRESS are configured."
        },
        { status: 409 }
      );
    }

    if (quote.status !== "quoted" || quote.router === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json(
        {
          status: "blocked",
          summary: "Execution is blocked until OKX Trade MCP returns a real X Layer router target and calldata."
        },
        { status: 409 }
      );
    }

    if (!intentId) {
      return NextResponse.json(
        {
          status: "ready",
          summary:
            "Quote is executable, but the user must first create an onchain intent. Send intentId to execute."
        },
        { status: 202 }
      );
    }

    const transactionHash = await executeVaultIntent(intentId, quote.calldata as `0x${string}`);

    return NextResponse.json({
      status: "submitted",
      transactionHash,
      summary: `Submitted execution for ${intent.amountIn} ${intent.tokenIn} to ${intent.tokenOut} on chain ${xLayerTestnet.chainId}.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare execution" },
      { status: 400 }
    );
  }
}
