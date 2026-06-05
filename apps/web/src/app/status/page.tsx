import Link from "next/link";
import { zeroAddress } from "viem";
import { mantleRpcUrl, webContracts } from "../../lib/contracts";

/**
 * Public read-only status page. Mirrors /api/health (config + key-presence booleans, never values)
 * and parses the indexer's Prometheus /metrics into a human panel. Degrade-safe: an unreachable
 * indexer renders an "unreachable" state, never escalating to the error boundary.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Status · Interlock",
  description: "Live configuration and indexer health for the Interlock firewall.",
};

type IndexerMetrics = {
  reachable: boolean;
  up?: boolean;
  lastSyncedBlock?: number;
  actionsIndexed?: number;
  syncErrors?: number;
  syncing?: boolean;
};

async function loadIndexerMetrics(baseUrl: string | undefined): Promise<IndexerMetrics> {
  if (!baseUrl) return { reachable: false };
  const url = `${baseUrl.replace(/\/$/, "")}/metrics`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return { reachable: false };
    const text = await res.text();
    return { reachable: true, ...parsePrometheus(text) };
  } catch {
    return { reachable: false };
  } finally {
    clearTimeout(timeout);
  }
}

function parsePrometheus(text: string): Partial<IndexerMetrics> {
  const read = (metric: string): number | undefined => {
    const line = text.split("\n").find((l) => l.startsWith(metric) && !l.startsWith("#"));
    if (!line) return undefined;
    const value = Number(line.trim().split(/\s+/).pop());
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    up: read("interlock_up") === 1,
    lastSyncedBlock: read("interlock_last_synced_block"),
    actionsIndexed: read("interlock_actions_indexed_total"),
    syncErrors: read("interlock_sync_errors_total"),
    syncing: read("interlock_syncing") === 1,
  };
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: 9,
        marginRight: 8,
        background: ok ? "#34d39e" : "#f06d6d",
      }}
    />
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="metric">
      <span>
        <StatusDot ok={ok} />
        {label}
      </span>
      <strong>{detail ?? (ok ? "OK" : "—")}</strong>
    </div>
  );
}

export default async function StatusPage() {
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL?.trim();
  const metrics = await loadIndexerMetrics(indexerUrl);

  const contracts = {
    agentRegistry: webContracts.agentRegistry !== zeroAddress,
    policyRegistry: webContracts.policyRegistry !== zeroAddress,
    actionAttestation: webContracts.actionAttestation !== zeroAddress,
  };
  const keys = {
    ai: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    attestor: Boolean(process.env.ATTESTOR_PRIVATE_KEY?.trim()),
    demo: Boolean(process.env.PRIVATE_KEY?.trim()),
    errorSink: Boolean(process.env.SENTRY_DSN?.trim()),
  };

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mantle Sepolia · System Status</p>
          <h1>Interlock Status</h1>
          <p className="subtitle">
            Live configuration and indexer health. Presence booleans only — secret values are never shown.
          </p>
        </div>
      </section>

      <section className="grid">
        <section className="panel">
          <header>
            <div>
              <h2>Contracts configured</h2>
              <p>Core on-chain addresses wired into the web app.</p>
            </div>
          </header>
          <Row label="Agent Registry" ok={contracts.agentRegistry} />
          <Row label="Policy Registry" ok={contracts.policyRegistry} />
          <Row label="Action Attestation" ok={contracts.actionAttestation} />
          <div className="metric">
            <span>Chain RPC</span>
            <strong style={{ fontSize: 12, opacity: 0.8 }}>{mantleRpcUrl()}</strong>
          </div>
        </section>

        <section className="panel">
          <header>
            <div>
              <h2>Server keys</h2>
              <p>Whether each server-only capability is enabled. Never the values.</p>
            </div>
          </header>
          <Row label="AI layer (Anthropic)" ok={keys.ai} detail={keys.ai ? "Enabled" : "Disabled"} />
          <Row label="Attestor signing" ok={keys.attestor} detail={keys.attestor ? "Enabled" : "Disabled"} />
          <Row label="Demo loop" ok={keys.demo} detail={keys.demo ? "Enabled" : "Disabled"} />
          <Row label="Error sink (Sentry)" ok={keys.errorSink} detail={keys.errorSink ? "Configured" : "Log-only"} />
        </section>

        <section className="panel">
          <header>
            <div>
              <h2>Indexer</h2>
              <p>{indexerUrl ? indexerUrl : "No indexer configured — dashboard reads directly from RPC."}</p>
            </div>
          </header>
          {!indexerUrl ? (
            <div className="emptyState">Indexer URL not set (NEXT_PUBLIC_INDEXER_URL).</div>
          ) : !metrics.reachable ? (
            <div className="emptyState">Indexer unreachable. The dashboard falls back to RPC reads.</div>
          ) : (
            <>
              <Row label="Service up" ok={Boolean(metrics.up)} />
              <Row label="Syncing now" ok detail={metrics.syncing ? "Yes" : "Idle"} />
              <div className="metric">
                <span>Last synced block</span>
                <strong>{metrics.lastSyncedBlock?.toLocaleString() ?? "—"}</strong>
              </div>
              <div className="metric">
                <span>Actions indexed</span>
                <strong>{metrics.actionsIndexed?.toLocaleString() ?? "—"}</strong>
              </div>
              <Row
                label="Sync errors"
                ok={(metrics.syncErrors ?? 0) === 0}
                detail={String(metrics.syncErrors ?? 0)}
              />
            </>
          )}
        </section>
      </section>

      <section className="grid">
        <section className="panel wide">
          <div className="emptyState" style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <Link className="primaryAction" href="/app">
              Launch app
            </Link>
            <Link href="/">Back to home</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
