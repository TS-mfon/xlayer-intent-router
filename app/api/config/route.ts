import { NextResponse } from "next/server";
import { addresses, xLayerNetwork } from "../../lib/xlayer";

export async function GET() {
  return NextResponse.json({
    chainId: xLayerNetwork.chainId,
    rpcUrl: xLayerNetwork.rpcUrl,
    explorerUrl: xLayerNetwork.explorerUrl,
    vaultAddress: addresses.vault,
    agentWalletAddress: addresses.agentWallet
  });
}
