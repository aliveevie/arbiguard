import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  FileSignature,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

interface EngineParity {
  replay: string;
  expected: number;
  onChain: number;
  match: boolean;
}
interface PoolStatus {
  label: string;
  address: string;
  state: "NORMAL" | "ELEVATED" | "TRIPPED" | "COOLDOWN" | string;
  highBlockCount: number;
  tripScore: number;
  tripSignature: string;
  shieldedFromRadiantSignature: boolean;
  policy: {
    flagThreshold: number;
    blockThreshold: number;
    sustainBlocks: number;
    cooldownBlocks: number;
  };
}
interface ThreatRecord {
  signature: string;
  score: number;
  reporter: string;
  blockNumber: number;
  publishedAt: number;
}
interface ChainStatus {
  chainId: number;
  name: string;
  explorer?: string;
  error?: string;
  contracts?: Record<string, string>;
  engineParity?: EngineParity[];
  agent?: { address: string; agentId: number; reputation: number; minReputation: number };
  pools?: PoolStatus[];
  threatCount?: number;
  threats?: ThreatRecord[];
}
interface FirewallResponse {
  updatedAt: string;
  chains: ChainStatus[];
}

const short = (a: string, n = 6) => `${a.slice(0, n + 2)}…${a.slice(-4)}`;

const STATE_STYLE: Record<string, string> = {
  NORMAL: "bg-success/15 text-success border-success/30",
  ELEVATED: "bg-warning/15 text-warning border-warning/30",
  TRIPPED: "bg-destructive/15 text-destructive border-destructive/30",
  COOLDOWN: "bg-info/15 text-info border-info/30",
};

function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        STATE_STYLE[state] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />
      {state}
    </span>
  );
}

function AddressLink({ explorer, address, label }: { explorer?: string; address: string; label?: string }) {
  const text = label ?? short(address);
  if (!explorer) return <code className="text-xs">{text}</code>;
  return (
    <a
      href={`${explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-info hover:underline"
    >
      {text}
    </a>
  );
}

function ChainCard({ chain }: { chain: ChainStatus }) {
  if (chain.error) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4" /> {chain.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          RPC unreachable right now: {chain.error}
        </CardContent>
      </Card>
    );
  }

  const parityAll = chain.engineParity?.every((p) => p.match);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-info" /> {chain.name}
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[11px]">
            chain {chain.chainId}
          </Badge>
        </div>
        {chain.contracts && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3 w-3" /> engine:{" "}
              <AddressLink explorer={chain.explorer} address={chain.contracts.riskEngine} />
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {chain.contracts.riskEngineKind}
              </Badge>
            </span>
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3 w-3" /> firewall:{" "}
              <AddressLink explorer={chain.explorer} address={chain.contracts.firewall} />
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Engine parity */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> On-chain scorer parity
            {parityAll && (
              <span className="inline-flex items-center gap-1 text-success normal-case">
                <CheckCircle2 className="h-3.5 w-3.5" /> exact match
              </span>
            )}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {chain.engineParity?.map((p) => (
              <div key={p.replay} className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                <div className="text-lg font-bold leading-none">
                  {p.onChain}
                  <span className="text-xs font-normal text-muted-foreground">/{p.expected}</span>
                </div>
                <div className="mt-1 truncate text-[10px] text-muted-foreground" title={p.replay}>
                  {p.replay.replace(/_/g, " ")}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pools */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Protected pools
          </h3>
          <div className="flex flex-col gap-2">
            {chain.pools?.map((pool) => (
              <div key={pool.address} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{pool.label}</div>
                    <AddressLink explorer={chain.explorer} address={pool.address} />
                  </div>
                  <StateBadge state={pool.state} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    policy: flag ≥ {pool.policy.flagThreshold} · block ≥ {pool.policy.blockThreshold} · sustain{" "}
                    {pool.policy.sustainBlocks} blocks
                  </span>
                  {pool.state === "TRIPPED" && <span>trip score: {pool.tripScore}</span>}
                  {pool.shieldedFromRadiantSignature && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <ShieldAlert className="h-3 w-3" /> shielded from Radiant signature
                      {pool.state === "NORMAL" && " (no action of its own)"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Threat registry */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileSignature className="h-3.5 w-3.5" /> Shared threat registry ({chain.threatCount})
          </h3>
          {chain.threats?.length ? (
            <div className="flex flex-col gap-1.5">
              {chain.threats.map((t) => (
                <div
                  key={t.signature}
                  className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
                >
                  <code className="truncate text-xs text-destructive" title={t.signature}>
                    {short(t.signature, 10)}
                  </code>
                  <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                    score {t.score} · block {t.blockNumber}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No threat signatures published.</p>
          )}
        </section>

        {/* Agent */}
        {chain.agent && (
          <section className="mt-auto border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> agent #{chain.agent.agentId}{" "}
                <AddressLink explorer={chain.explorer} address={chain.agent.address} />
              </span>
              <span>
                reputation {chain.agent.reputation} / min {chain.agent.minReputation}{" "}
                {chain.agent.reputation >= chain.agent.minReputation ? "✓ authorized" : "✗ gated"}
              </span>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

const Firewall = () => {
  const { data, isLoading, error } = useQuery<FirewallResponse>({
    queryKey: ["firewall"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/firewall`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-5 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary to-accent">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">ArbiGuard Live Firewall</h1>
              <span className="text-[11px] text-muted-foreground">
                On-chain breaker state · Arbitrum Sepolia + Robinhood Chain
              </span>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Chat agent
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        {error ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Could not reach the firewall API: {String(error)}
            </CardContent>
          </Card>
        ) : isLoading || !data ? (
          <div className="grid gap-5 md:grid-cols-2">
            <Skeleton className="h-[480px] rounded-xl" />
            <Skeleton className="h-[480px] rounded-xl" />
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              {data.chains.map((chain) => (
                <ChainCard key={chain.chainId} chain={chain} />
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Reading live contract state every 15s · last update {new Date(data.updatedAt).toLocaleTimeString()} ·
              same Rust risk engine, bit-identical scores, on both chains
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default Firewall;
