export const xLayerTestnet = {
  chainId: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrl: process.env.XLAYER_TESTNET_RPC_URL ?? "https://testrpc.xlayer.tech/terigon",
  explorerUrl: "https://www.okx.com/web3/explorer/xlayer-test"
};

export const addresses = {
  vault: process.env.NEXT_PUBLIC_INTENT_ROUTER_VAULT || null,
  agentWallet: process.env.AGENT_WALLET_ADDRESS || null
};
