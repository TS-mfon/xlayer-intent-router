import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, xLayerNetwork } from "../../../lib/xlayer";
import { vaultAbi, xLayerViemChain } from "../../../lib/vault";

export async function POST(request: NextRequest) {
  try {
    if (!addresses.vault) throw new Error("NEXT_PUBLIC_INTENT_ROUTER_VAULT is required");
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY as Hex | undefined;
    if (!adminPrivateKey) throw new Error("ADMIN_PRIVATE_KEY is required to allowlist routers");

    const body = await request.json();
    const router = getAddress(String(body.router));
    const allowed = body.allowed !== false;

    const account = privateKeyToAccount(adminPrivateKey);
    const client = createWalletClient({
      account,
      chain: xLayerViemChain,
      transport: http(xLayerNetwork.rpcUrl)
    });

    const transactionHash = await client.writeContract({
      address: addresses.vault as Hex,
      abi: vaultAbi,
      functionName: "setRouterAllowed",
      args: [router, allowed]
    });

    return NextResponse.json({
      status: "submitted",
      transactionHash,
      summary: `Router ${router} allowlist update submitted.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to allowlist router" },
      { status: 400 }
    );
  }
}
