"use client";

import { useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, decodeEventLog, getAddress, http, parseAbi, parseAbiItem, type Hex } from "viem";
import { xLayerViemChain } from "./lib/vault";

type IntentDraft = {
  action: "swap";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  maxSlippageBps: number;
  deadlineMinutes: number;
};

type QuoteResult = {
  status: "quoted" | "mock";
  route: string;
  expectedAmountOut: string;
  minAmountOut: string;
  quoteHash: string;
  router: string;
  calldata: string;
  warnings: string[];
  amountInRaw?: string;
  minAmountOutRaw?: string;
  tokenInAddress?: string;
  tokenOutAddress?: string;
};

type SimulationResult = {
  status: "passed" | "blocked" | "not_configured";
  summary: string;
  tenderlyUrl?: string;
};

type ConfigResult = {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  vaultAddress: string | null;
  agentWalletAddress: string | null;
};

const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export default function Home() {
  const [prompt, setPrompt] = useState("swap 5 OKB to USDT if slippage is under 0.8%");
  const [draft, setDraft] = useState<IntentDraft | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [config, setConfig] = useState<ConfigResult | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const canExecute = useMemo(
    () => Boolean(draft && quote && simulation?.status === "passed" && intentId),
    [draft, quote, simulation, intentId]
  );

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? `Request failed: ${url}`);
    }
    return data;
  }

  async function runFlow() {
    setBusy(true);
    setLog([]);
    setDraft(null);
    setQuote(null);
    setSimulation(null);
    try {
      const nextConfig = await fetch("/api/config").then((res) => res.json());
      setConfig(nextConfig);
      setLog((items) => [...items, "Loaded X Layer mainnet config."]);

      const nextDraft = await postJson<IntentDraft>("/api/intent/parse", { prompt });
      setDraft(nextDraft);
      setLog((items) => [...items, `Parsed ${nextDraft.amountIn} ${nextDraft.tokenIn} -> ${nextDraft.tokenOut}.`]);

      const nextQuote = await postJson<QuoteResult>("/api/quote", { intent: nextDraft });
      setQuote(nextQuote);
      setLog((items) => [...items, `Quote ready: ${nextQuote.route}.`]);

      const nextSimulation = await postJson<SimulationResult>("/api/simulate", {
        intent: nextDraft,
        quote: nextQuote
      });
      setSimulation(nextSimulation);
      setLog((items) => [...items, nextSimulation.summary]);
    } catch (error) {
      setLog((items) => [...items, error instanceof Error ? error.message : "Unexpected error"]);
    } finally {
      setBusy(false);
    }
  }

  async function executeDryRun() {
    if (!draft || !quote) return;
    setBusy(true);
    try {
      const result = await postJson<{ status: string; summary: string; transactionHash?: string }>("/api/execute", {
        intent: draft,
        quote,
        intentId
      });
      setLog((items) => [...items, result.summary]);
    } catch (error) {
      setLog((items) => [...items, error instanceof Error ? error.message : "Execution failed"]);
    } finally {
      setBusy(false);
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setLog((items) => [...items, "Install a browser wallet that supports X Layer mainnet."]);
      return;
    }
    const [address] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    setAccount(address);
    setLog((items) => [...items, `Connected ${address}.`]);
  }

  async function createOnchainIntent() {
    if (!window.ethereum || !draft || !quote || !config?.vaultAddress) return;
    if (quote.status !== "quoted" || !quote.amountInRaw || !quote.minAmountOutRaw || !quote.tokenInAddress || !quote.tokenOutAddress) {
      setLog((items) => [...items, "A real OKX quote is required before creating an onchain intent."]);
      return;
    }

    setBusy(true);
    try {
      await postJson("/api/admin/allow-router", { router: quote.router, allowed: true });
      setLog((items) => [...items, `Router allowlist submitted for ${quote.router}.`]);

      const [address] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(address);

      const walletClient = createWalletClient({
        account: getAddress(address),
        chain: xLayerViemChain,
        transport: custom(window.ethereum)
      });

      await walletClient.switchChain({ id: xLayerViemChain.id });

      const isNativeIn = quote.tokenInAddress.toLowerCase() === NATIVE_TOKEN;
      if (!isNativeIn) {
        const approveHash = await walletClient.writeContract({
          address: quote.tokenInAddress as Hex,
          abi: erc20Abi,
          functionName: "approve",
          args: [config.vaultAddress as Hex, BigInt(quote.amountInRaw)]
        });
        setLog((items) => [...items, `Token approval submitted: ${approveHash}`]);
      } else {
        setLog((items) => [...items, "Native OKB deposit does not need token approval."]);
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + draft.deadlineMinutes * 60);
      const intentHash = await walletClient.writeContract({
        address: config.vaultAddress as Hex,
        abi: vaultUiAbi,
        functionName: "createIntent",
        args: [
          quote.tokenInAddress as Hex,
          quote.tokenOutAddress as Hex,
          quote.router as Hex,
          BigInt(quote.amountInRaw),
          BigInt(quote.minAmountOutRaw),
          deadline,
          quote.quoteHash as Hex
        ],
        ...(isNativeIn ? { value: BigInt(quote.amountInRaw) } : {})
      });

      const publicClient = createPublicClient({
        chain: xLayerViemChain,
        transport: http(xLayerViemChain.rpcUrls.default.http[0])
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: intentHash });
      const created = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({ abi: [intentCreatedEvent], data: log.data, topics: log.topics });
          } catch {
            return null;
          }
        })
        .find((event) => event?.eventName === "IntentCreated");

      if (created?.eventName === "IntentCreated") {
        setIntentId(created.args.intentId.toString());
      }

      setLog((items) => [
        ...items,
        `Intent creation submitted: ${intentHash}`,
        created?.eventName === "IntentCreated"
          ? `Intent ID ${created.args.intentId.toString()} is ready for agent execution.`
          : "Intent created, but the ID was not decoded. Check the vault event in the explorer."
      ]);
    } catch (error) {
      setLog((items) => [...items, error instanceof Error ? error.message : "Intent creation failed"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">X Layer mainnet</p>
          <h1>Intent Router</h1>
          <p>
            Tell the agent the trade, review the route and simulation, then approve the onchain
            intent for the Agentic Wallet to execute.
          </p>
        </div>

        <div className="intentBox">
          <label htmlFor="prompt">Intent</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
          />
          <div className="actions">
            <button onClick={runFlow} disabled={busy}>
              {busy ? "Working" : "Quote and simulate"}
            </button>
            <button className="secondary" onClick={connectWallet} disabled={busy}>
              {account ? "Wallet connected" : "Connect wallet"}
            </button>
            <button className="secondary" onClick={createOnchainIntent} disabled={busy || !quote || quote.status !== "quoted"}>
              Create onchain intent
            </button>
            <button className="secondary" onClick={executeDryRun} disabled={busy || !canExecute}>
              Prepare execution
            </button>
          </div>
          <input
            className="intentId"
            placeholder="Intent ID after creation"
            value={intentId ?? ""}
            onChange={(event) => setIntentId(event.target.value)}
          />
        </div>

        <section className="grid">
          <Panel title="Parsed Intent">
            {draft ? (
              <dl>
                <dt>Pair</dt>
                <dd>{draft.tokenIn} to {draft.tokenOut}</dd>
                <dt>Amount</dt>
                <dd>{draft.amountIn}</dd>
                <dt>Max slippage</dt>
                <dd>{draft.maxSlippageBps / 100}%</dd>
              </dl>
            ) : (
              <p>Waiting for an intent.</p>
            )}
          </Panel>

          <Panel title="Route">
            {quote ? (
              <>
                <p>{quote.route}</p>
                <dl>
                  <dt>Expected out</dt>
                  <dd>{quote.expectedAmountOut}</dd>
                  <dt>Minimum out</dt>
                  <dd>{quote.minAmountOut}</dd>
                  <dt>Quote hash</dt>
                  <dd className="mono">{quote.quoteHash}</dd>
                </dl>
              </>
            ) : (
              <p>Quote not requested.</p>
            )}
          </Panel>

          <Panel title="Simulation">
            {simulation ? (
              <>
                <p>{simulation.summary}</p>
                {simulation.tenderlyUrl ? <a href={simulation.tenderlyUrl}>Tenderly trace</a> : null}
              </>
            ) : (
              <p>Simulation pending.</p>
            )}
          </Panel>

          <Panel title="Deployment">
            {config ? (
              <dl>
                <dt>Chain</dt>
                <dd>{config.chainId}</dd>
                <dt>Vault</dt>
                <dd className="mono">{config.vaultAddress ?? "not deployed"}</dd>
                <dt>Agentic Wallet</dt>
                <dd className="mono">{config.agentWalletAddress ?? "not configured"}</dd>
              </dl>
            ) : (
              <p>Config loads with the first run.</p>
            )}
          </Panel>
        </section>

        <section className="log">
          <h2>Agent Log</h2>
          {log.length === 0 ? <p>No agent activity yet.</p> : log.map((item) => <p key={item}>{item}</p>)}
        </section>
      </section>
    </main>
  );
}

const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

const vaultUiAbi = parseAbi([
  "function createIntent(address tokenIn,address tokenOut,address router,uint256 amountIn,uint256 minAmountOut,uint256 deadline,bytes32 quoteHash) payable returns (uint256)"
]);

const intentCreatedEvent = parseAbiItem(
  "event IntentCreated(uint256 indexed intentId,address indexed owner,address indexed tokenIn,address tokenOut,address router,uint256 amountIn,uint256 minAmountOut,uint256 deadline,bytes32 quoteHash)"
);

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
    };
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {children}
    </article>
  );
}
