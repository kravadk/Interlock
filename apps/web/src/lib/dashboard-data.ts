import type { PreflightDecision } from "./preflight";
import type { IndexerAction, IndexerAgent, IndexerPolicy } from "./indexer";
import { explorerAddressUrl, explorerTxUrl, webContracts } from "./contracts";
import type { IconName } from "../app/icons";

export type SortState = { col: string; dir: "asc" | "desc" };

export type StatCard = {
  label: string;
  icon: IconName;
  value: string;
  delta: string;
  dir: "up" | "down" | "flat";
  color: string;
};

export type ReasonRow = { reason: string; count: number; color: string };

export type RecordRow = {
  rank: number;
  name: string;
  sym: string;
  meta: string;
  type: string;
  status: string;
  evidence: string;
  href: string;
  /** ActionAttestationV2 dispute-window status for action rows (undefined otherwise). */
  dispute?: "ACTIVE" | "CHALLENGED" | "FINALIZED";
};

export type EcosystemLink = { name: string; type: string; href: string; status: string };

export const mantleLinks: EcosystemLink[] = [
  { name: "Mantle Docs", type: "Docs", href: "https://docs.mantle.xyz/", status: "Open" },
  { name: "Mantle Sepolia", type: "Network", href: "https://sepolia.mantlescan.xyz/", status: "Explorer" },
  { name: "Sepolia Faucet", type: "Setup", href: "https://faucet.sepolia.mantle.xyz/", status: "Test MNT" },
  { name: "Mantle Bridge", type: "Setup", href: "https://app.mantle.xyz/", status: "Bridge" },
  { name: "Byreal", type: "Ecosystem", href: "https://www.byreal.io/", status: "Agentic DeFi" },
  { name: "mETH Protocol", type: "RWA/RealFi", href: "https://www.methprotocol.xyz/", status: "Yield" },
  { name: "Function FBTC", type: "Bitcoin DeFi", href: "https://www.fxn.xyz/", status: "Asset" },
  { name: "UR", type: "Consumer", href: "https://ur.app/", status: "Wallet" },
];

const REASON_COLORS = ["#34d39e", "#f06d6d", "#f59e0b", "#a855f7", "#3b82f6", "#46c2ff"];

export function buildStats(
  actions: IndexerAction[],
  agents: IndexerAgent[],
  policies: IndexerPolicy[],
  decision?: PreflightDecision,
): StatCard[] {
  const blocked = actions.filter((action) => action.decision === "BLOCK").length;
  return [
    {
      label: "Indexed Actions",
      icon: "scale",
      value: String(actions.length),
      delta: `${agents.length} agents`,
      dir: "up",
      color: "#34d39e",
    },
    {
      label: "Policies",
      icon: "handCoins",
      value: String(policies.length),
      delta: "from RPC / indexer",
      dir: "up",
      color: "#3b82f6",
    },
    {
      label: "Blocked Actions",
      icon: "shield",
      value: String(blocked),
      delta: actions.length ? `${Math.round((blocked / actions.length) * 100)}% block rate` : "risk controls",
      dir: blocked ? "down" : "flat",
      color: "#f06d6d",
    },
    {
      label: "Last Decision",
      icon: "bolt",
      value: decision?.decision ?? "None",
      delta: decision?.reason ?? "run preflight",
      dir: decision ? (decision.allowed ? "up" : "down") : "flat",
      color: "#a855f7",
    },
  ];
}

export function buildReasonRows(actions: IndexerAction[]): ReasonRow[] {
  const counts = actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.reasonCode] = (acc[action.reasonCode] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count], index) => ({ reason, count, color: REASON_COLORS[index % REASON_COLORS.length] }));
}

export function buildTableRows(
  actions: IndexerAction[],
  agents: IndexerAgent[],
  policies: IndexerPolicy[],
): RecordRow[] {
  const actionRows: RecordRow[] = actions.slice(0, 30).map((action, index) => ({
    rank: index + 1,
    name: `${action.decision} / ${action.reasonCode}`,
    sym: action.decision === "ALLOW" ? "OK" : action.decision === "REVIEW" ? "REV" : "BLK",
    meta: `agent ${action.agentId} · policy ${action.policyId}`,
    type: "Action",
    status: action.decision,
    evidence: short(action.transactionHash),
    href: explorerTxUrl(action.transactionHash),
    dispute: action.status,
  }));

  const agentRows: RecordRow[] = agents.map((agent, index) => ({
    rank: actionRows.length + index + 1,
    name: `Agent #${agent.agentId}`,
    sym: "AG",
    meta: `${agent.totalActions} actions`,
    type: "Agent",
    status: "ready",
    evidence: agent.latestAction ? short(agent.latestAction.transactionHash) : "registry",
    href: agent.latestAction ? explorerTxUrl(agent.latestAction.transactionHash) : explorerAddressUrl(webContracts.agentRegistry),
  }));

  const policyRows: RecordRow[] = policies.map((policy, index) => ({
    rank: actionRows.length + agentRows.length + index + 1,
    name: `Policy #${policy.policyId}`,
    sym: "PL",
    meta: `${policy.allowedTargets?.length ?? 0} targets`,
    type: "Policy",
    status: policy.active === false ? "inactive" : "active",
    evidence: policy.latestAction ? short(policy.latestAction.transactionHash) : "registry",
    href: policy.latestAction ? explorerTxUrl(policy.latestAction.transactionHash) : explorerAddressUrl(webContracts.policyRegistry),
  }));

  const linkRows: RecordRow[] = mantleLinks.map((link, index) => ({
    rank: actionRows.length + agentRows.length + policyRows.length + index + 1,
    name: link.name,
    sym: "M",
    meta: link.type,
    type: "Mantle",
    status: link.status,
    evidence: "ecosystem",
    href: link.href,
  }));

  return [...actionRows, ...agentRows, ...policyRows, ...linkRows];
}

export function compareRows(a: RecordRow, b: RecordRow, sort: SortState): number {
  const av = String(a[sort.col as keyof RecordRow] ?? "");
  const bv = String(b[sort.col as keyof RecordRow] ?? "");
  return av.localeCompare(bv, undefined, { numeric: true }) * (sort.dir === "asc" ? 1 : -1);
}

export function short(value?: string): string {
  if (!value) return "none";
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
