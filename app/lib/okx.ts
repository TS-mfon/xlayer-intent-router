import { createHmac } from "crypto";
import { IntentDraft, QuoteResult } from "./schema";
import { addresses, xLayerTestnet } from "./xlayer";

type OkxTokenConfig = Record<string, { address: `0x${string}`; decimals: number }>;

type OkxSwapResponse = {
  code: string;
  msg: string;
  data?: Array<{
    routerResult: {
      fromTokenAmount: string;
      toTokenAmount: string;
      tradeFee?: string;
      priceImpactPercent?: string;
      dexRouterList?: Array<{ dexProtocol?: { dexName?: string; percent?: string } }>;
    };
    tx: {
      to: `0x${string}`;
      data: `0x${string}`;
      value: string;
      gas?: string;
      gasPrice?: string;
      minReceiveAmount: string;
      slippagePercent: string;
    };
  }>;
};

type OkxTokenListResponse = {
  code: string;
  msg: string;
  data?: Array<{
    tokenSymbol: string;
    tokenContractAddress: `0x${string}`;
    decimals?: string;
    decimal?: string;
  }>;
};

export function okxRuntimeReady() {
  return Boolean(
    process.env.OKX_API_KEY &&
      process.env.OKX_SECRET_KEY &&
      process.env.OKX_PASSPHRASE &&
      addresses.vault
  );
}

export async function getOkxSwapQuote(intent: IntentDraft): Promise<QuoteResult> {
  const tokens = await getTokenMap();
  const fromToken = tokens[intent.tokenIn.toUpperCase()];
  const toToken = tokens[intent.tokenOut.toUpperCase()];
  if (!fromToken || !toToken) {
    throw new Error(
      `Missing token config for ${intent.tokenIn}/${intent.tokenOut}. Set OKX_TOKEN_MAP_JSON with X Layer token addresses.`
    );
  }
  if (!addresses.vault) {
    throw new Error("NEXT_PUBLIC_INTENT_ROUTER_VAULT is required before requesting executable OKX routes.");
  }

  const amount = toBaseUnits(intent.amountIn, fromToken.decimals);
  const params = new URLSearchParams({
    chainIndex: String(xLayerTestnet.chainId),
    amount,
    fromTokenAddress: fromToken.address,
    toTokenAddress: toToken.address,
    slippagePercent: String(intent.maxSlippageBps / 100),
    userWalletAddress: addresses.vault,
    approveAmount: amount,
    approveTransaction: "true",
    priceImpactProtectionPercent: "25"
  });

  const path = `/api/v6/dex/aggregator/swap?${params.toString()}`;
  const response = await okxRequest<OkxSwapResponse>("GET", path);
  if (response.code !== "0" || !response.data?.[0]) {
    throw new Error(`OKX swap quote failed: ${response.msg || response.code}`);
  }

  const route = response.data[0];
  const protocols = route.routerResult.dexRouterList
    ?.map((item) => item.dexProtocol?.dexName)
    .filter(Boolean)
    .join(" + ");

  return {
    status: "quoted",
    route: protocols || "OKX DEX aggregator route",
    expectedAmountOut: fromBaseUnits(route.routerResult.toTokenAmount, toToken.decimals),
    minAmountOut: fromBaseUnits(route.tx.minReceiveAmount, toToken.decimals),
    quoteHash: quoteHash({ intent, route }),
    router: route.tx.to,
    calldata: route.tx.data,
    amountInRaw: route.routerResult.fromTokenAmount,
    minAmountOutRaw: route.tx.minReceiveAmount,
    tokenInAddress: fromToken.address,
    tokenOutAddress: toToken.address,
    warnings: [
      `Price impact: ${route.routerResult.priceImpactPercent ?? "unknown"}%`,
      `Estimated gas: ${route.tx.gas ?? "unknown"}`
    ]
  };
}

async function okxRequest<T>(method: "GET" | "POST", path: string, body = ""): Promise<T> {
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", requireEnv("OKX_SECRET_KEY"))
    .update(`${timestamp}${method}${path}${body}`)
    .digest("base64");

  const response = await fetch(`https://web3.okx.com${path}`, {
    method,
    headers: {
      "OK-ACCESS-KEY": requireEnv("OKX_API_KEY"),
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": requireEnv("OKX_PASSPHRASE"),
      ...(process.env.OKX_PROJECT_ID ? { "OK-ACCESS-PROJECT": process.env.OKX_PROJECT_ID } : {})
    },
    body: body || undefined
  });

  return (await response.json()) as T;
}

async function getTokenMap(): Promise<OkxTokenConfig> {
  if (process.env.OKX_TOKEN_MAP_JSON) return parseTokenMap(process.env.OKX_TOKEN_MAP_JSON);

  const response = await okxRequest<OkxTokenListResponse>(
    "GET",
    `/api/v6/dex/aggregator/all-tokens?chainIndex=${xLayerTestnet.chainId}`
  );
  if (response.code !== "0" || !response.data) {
    throw new Error(`OKX token discovery failed: ${response.msg || response.code}`);
  }

  return response.data.reduce<OkxTokenConfig>((tokens, token) => {
    const decimals = Number(token.decimals ?? token.decimal ?? "18");
    tokens[token.tokenSymbol.toUpperCase()] = {
      address: token.tokenContractAddress,
      decimals
    };
    return tokens;
  }, {});
}

function parseTokenMap(raw: string): OkxTokenConfig {
  return JSON.parse(raw) as OkxTokenConfig;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function toBaseUnits(amount: string, decimals: number): string {
  const [whole, fraction = ""] = amount.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return (BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

function fromBaseUnits(amount: string, decimals: number): string {
  const value = BigInt(amount);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function quoteHash(payload: unknown): `0x${string}` {
  const digest = createHmac("sha256", "xlayer-intent-router").update(JSON.stringify(payload)).digest("hex");
  return `0x${digest}`;
}
