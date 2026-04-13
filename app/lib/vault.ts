import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, xLayerNetwork } from "./xlayer";

export const vaultAbi = parseAbi([
  "function executeIntent(uint256 intentId, bytes routerCalldata) returns (uint256)",
  "function setRouterAllowed(address router, bool allowed)",
  "function allowedRouters(address router) view returns (bool)",
  "function agentWallet() view returns (address)",
  "function owner() view returns (address)"
]);

export const xLayerViemChain = {
  id: xLayerNetwork.chainId,
  name: xLayerNetwork.name,
  nativeCurrency: xLayerNetwork.nativeCurrency,
  rpcUrls: {
    default: { http: [xLayerNetwork.rpcUrl] }
  }
};

export async function executeVaultIntent(intentId: bigint, routerCalldata: Hex) {
  if (!addresses.vault) throw new Error("NEXT_PUBLIC_INTENT_ROUTER_VAULT is required");
  const privateKey = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY is required for backend execution");

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: xLayerViemChain,
    transport: http(xLayerNetwork.rpcUrl)
  });
  const client = createWalletClient({
    account,
    chain: xLayerViemChain,
    transport: http(xLayerNetwork.rpcUrl)
  });

  await publicClient.simulateContract({
    account,
    address: addresses.vault as Hex,
    abi: vaultAbi,
    functionName: "executeIntent",
    args: [intentId, routerCalldata]
  });

  return client.writeContract({
    address: addresses.vault as Hex,
    abi: vaultAbi,
    functionName: "executeIntent",
    args: [intentId, routerCalldata]
  });
}
