import { NextResponse } from "next/server";
import { addresses, xLayerTestnet } from "../../lib/xlayer";

export async function GET() {
  return NextResponse.json({
    chainId: xLayerTestnet.chainId,
    rpcUrl: xLayerTestnet.rpcUrl,
    explorerUrl: xLayerTestnet.explorerUrl,
    vaultAddress: addresses.vault,
    agentWalletAddress: addresses.agentWallet
  });
}
