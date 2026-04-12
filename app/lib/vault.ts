import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, xLayerTestnet } from "./xlayer";

export const vaultAbi = parseAbi([
  "function executeIntent(uint256 intentId, bytes routerCalldata) returns (uint256)",
  "function setRouterAllowed(address router, bool allowed)",
  "function allowedRouters(address router) view returns (bool)",
  "function agentWallet() view returns (address)",
  "function owner() view returns (address)"
]);

export const xLayerViemChain = {
  id: xLayerTestnet.chainId,
  name: xLayerTestnet.name,
  nativeCurrency: xLayerTestnet.nativeCurrency,
  rpcUrls: {
    default: { http: [xLayerTestnet.rpcUrl] }
  }
};

export async function executeVaultIntent(intentId: bigint, routerCalldata: Hex) {
  if (!addresses.vault) throw new Error("NEXT_PUBLIC_INTENT_ROUTER_VAULT is required");
  const privateKey = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY is required for backend execution");

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: xLayerViemChain,
    transport: http(xLayerTestnet.rpcUrl)
  });
  const client = createWalletClient({
    account,
    chain: xLayerViemChain,
    transport: http(xLayerTestnet.rpcUrl)
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
