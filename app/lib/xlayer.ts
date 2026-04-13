const chainId = Number(process.env.XLAYER_CHAIN_ID ?? "1952");
const isMainnet = chainId === 196;

export const xLayerTestnet = {
  chainId,
  name: isMainnet ? "X Layer Mainnet" : "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrl:
    process.env.XLAYER_RPC_URL ??
    process.env.XLAYER_TESTNET_RPC_URL ??
    (isMainnet ? "https://rpc.xlayer.tech" : "https://testrpc.xlayer.tech/terigon"),
  explorerUrl: isMainnet ? "https://www.okx.com/web3/explorer/xlayer" : "https://www.okx.com/web3/explorer/xlayer-test"
};

export const addresses = {
  vault: process.env.NEXT_PUBLIC_INTENT_ROUTER_VAULT || null,
  agentWallet: process.env.AGENT_WALLET_ADDRESS || null
};
