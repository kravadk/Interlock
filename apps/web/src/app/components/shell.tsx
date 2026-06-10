"use client";

import { useState } from "react";
import { mantleSepolia } from "@interlock/shared";
import type { MantleEcosystemPolicyPack } from "@interlock/firewall-sdk";
import { Icon, Logo, type IconName } from "../icons";
import { StatCardsSkeleton } from "./primitives";
import { explorerAddressUrl, mantleRpcUrl, webContracts } from "../../lib/contracts";
import type { StatCard } from "../../lib/dashboard-data";
import type { ConnectedWallet } from "../../lib/wallet";

export type ActiveView =
  | "dashboard"
  | "agents"
  | "policies"
  | "preflight"
  | "benchmark"
  | "agent-demo"
  | "strategy-agent"
  | "recorder"
  | "analytics"
  | "integrate";

export type NavEntry = { id: ActiveView; label: string; icon: IconName; section: string; sub: string };

export const NAV: NavEntry[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid", section: "Mission Control", sub: "Live Interlock state across agents, policies, and recorded decisions on Mantle Sepolia." },
  { id: "agents", label: "Agents", icon: "calendar", section: "Agent Profile", sub: "Identity and safety counters derived from real ActionChecked events." },
  { id: "policies", label: "Policies", icon: "pie", section: "Policy Builder", sub: "On-chain policy facts plus Mantle ecosystem policy-pack templates." },
  { id: "preflight", label: "Preflight", icon: "exchange", section: "Action Review", sub: "Agent proposes a transaction, Interlock checks it, then returns allow or block." },
  { id: "benchmark", label: "Benchmark", icon: "gift", section: "Benchmark Arena", sub: "Repeatable, judge-friendly safety scenarios run against the live firewall." },
  { id: "agent-demo", label: "Agent Demo", icon: "bolt", section: "Live Agent Demo", sub: "Run an autonomous agent through the firewall live — decisions are recorded on-chain in real time." },
  { id: "strategy-agent", label: "Strategy Agent", icon: "watchlist", section: "AI Yield-Strategy Agent", sub: "An AI strategy agent reads live Mantle yields, picks a risk-adjusted allocation, and trades through the firewall — every decision recorded on-chain." },
  { id: "recorder", label: "Recorder", icon: "market", section: "Flight Recorder", sub: "Every indexed action, agent, policy, and ecosystem link in one searchable table." },
  { id: "analytics", label: "Analytics", icon: "watchlist", section: "Reason Analytics", sub: "Why agent actions passed or were blocked, by reason code." },
  { id: "integrate", label: "Integrate", icon: "card", section: "Developer Integration", sub: "SDK snippets, environment, and deployed Interlock contracts for Mantle developers." },
];

/* ============================================================
   SIDEBAR
   ============================================================ */
export function Sidebar({
  active,
  setActive,
  packs,
}: {
  active: ActiveView;
  setActive: (active: ActiveView) => void;
  packs: MantleEcosystemPolicyPack[];
}) {
  const [packsOpen, setPacksOpen] = useState(true);
  const shown = packs.slice(0, 5);

  return (
    <aside className="sidebar">
      <div className="sb-head">
        <span className="sb-logo">
          <Logo />
        </span>
        <span className="sb-brand">INTERLOCK</span>
        <button className="sb-collapse" type="button" title="Mantle Control Plane">
          <Icon.panel s={18} />
        </button>
      </div>

      <nav className="sb-nav scroll">
        {NAV.map((item) => {
          const Ic = Icon[item.icon];
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active === item.id ? " active" : ""}`}
              onClick={() => setActive(item.id)}
            >
              <Ic s={18} />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="sb-sep" />

        <div className={`sb-group${packsOpen ? "" : " collapsed"}`}>
          <button className="sb-group-head" type="button" onClick={() => setPacksOpen((open) => !open)}>
            <Icon.staking className="lead" s={18} />
            <span>Mantle Packs</span>
            <Icon.chevDown className="chev" s={16} />
          </button>
          <div className="staking-list" style={{ maxHeight: packsOpen ? shown.length * 38 : 0 }}>
            {shown.map((pack) => (
              <button key={pack.id} type="button" className="stake-item" onClick={() => setActive("policies")}>
                <span className="coin" style={{ background: pack.mode === "ready" ? "#34d39e" : "#a855f7" }} />
                <span className="nm">{pack.name}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="sb-foot">
        <button className="nav-item" type="button" onClick={() => setActive("dashboard")}>
          <Icon.settings s={18} />
          <span>Status</span>
        </button>
        <button className="nav-item" type="button" onClick={() => setActive("integrate")}>
          <Icon.help s={18} />
          <span>Docs &amp; SDK</span>
        </button>
        <a className="nav-item danger" href="https://sepolia.mantlescan.xyz/" target="_blank" rel="noreferrer">
          <Icon.logout s={18} />
          <span>Mantlescan</span>
        </a>
        <div className="sb-copy">Mantle Sepolia · Dev Alpha</div>
      </div>
    </aside>
  );
}

/* ============================================================
   TOPBAR
   ============================================================ */
export function TopBar({
  title,
  wallet,
  walletError,
  loading,
  onConnect,
  onSwitch,
  onRefresh,
  source,
}: {
  title: string;
  wallet?: ConnectedWallet;
  walletError: string;
  loading: boolean;
  onConnect: () => void;
  onSwitch: () => void;
  onRefresh: () => void;
  source?: "indexer" | "rpc";
}) {
  const wrongChain = wallet && wallet.chainId !== mantleSepolia.id;
  const walletMode = !wallet ? "Read-only" : wrongChain ? "Wrong chain" : "Mantle Sepolia";
  return (
    <header className="topbar">
      <div className="tb-title">
        <Icon.grid s={20} />
        <span>{title}</span>
      </div>
      <div className="tb-right">
        {source ? (
          <span className={`live-badge ${source}`} title={source === "indexer" ? "Live via indexer" : "Live via RPC fallback"}>
            <span className="live-dot" />
            {source === "indexer" ? "Indexer" : "RPC"}
          </span>
        ) : null}
        <span
          className={`live-badge ${walletError ? "error" : !wallet ? "readonly" : wrongChain ? "error" : "indexer"}`}
          title={walletError || (!wallet ? "Read-only mode: preflight and docs work, writes require wallet." : wrongChain ? "Wrong network: switch to Mantle Sepolia before writes." : "Wallet is on Mantle Sepolia.")}
        >
          <span className="live-dot" />
          {walletMode}
        </span>
        <button className={`btn${loading ? " is-loading" : ""}`} type="button" onClick={onRefresh}>
          <Icon.refresh s={16} />
          <span>{loading ? "Syncing" : "Refresh"}</span>
        </button>
        {wrongChain ? (
          <button className="btn" type="button" onClick={onSwitch}>
            <span>Switch Mantle</span>
          </button>
        ) : null}
        <button className="btn btn-wallet" type="button" onClick={onConnect}>
          <Icon.wallet s={16} />
          <span>{wallet ? shortAddress(wallet.address) : "Connect Wallet"}</span>
        </button>
        <button
          className="avatar"
          type="button"
          title={wallet ? `Copy wallet address ${wallet.address}` : "Connect a wallet"}
          onClick={() => {
            if (wallet) void navigator.clipboard?.writeText(wallet.address);
            else onConnect();
          }}
        >
          {wallet ? wallet.address.slice(2, 3).toUpperCase() : "·"}
        </button>
      </div>
    </header>
  );
}

/* ============================================================
   PAGE HEAD
   ============================================================ */
export function PageHead({ entry }: { entry: NavEntry }) {
  return (
    <div className="page-head">
      <div>
        <h1>{entry.section}</h1>
        <p className="sub">{entry.sub}</p>
      </div>
      <div className="head-actions">
        <a className="btn" href={explorerAddressUrl(webContracts.actionAttestation)} target="_blank" rel="noreferrer">
          <Icon.eye s={16} />
          <span>ActionAttestation</span>
        </a>
        <a className="btn" href={mantleRpcUrl()} target="_blank" rel="noreferrer">
          <Icon.market s={16} />
          <span>RPC {mantleSepolia.id}</span>
        </a>
      </div>
    </div>
  );
}

/* ============================================================
   STAT CARDS  (card-in-card m2)
   ============================================================ */
const MINI_BARS = [14, 22, 18, 26];

export function StatCards({ stats, loading }: { stats: StatCard[]; loading?: boolean }) {
  if (loading) return <StatCardsSkeleton />;
  return (
    <div className="stat-grid">
      {stats.map((item) => {
        const Ic = Icon[item.icon];
        const ArrowIcon = item.dir === "down" ? Icon.arrowDown : Icon.arrowUp;
        return (
          <div key={item.label} className="stat-card">
            <div className="stat-head">
              <span className="ic">
                <Ic s={15} />
              </span>
              <span className="nm">{item.label}</span>
            </div>
            <div className="stat-body">
              <div className="stat-top">
                <span className="stat-val">{item.value}</span>
                <span className="mini-bars">
                  {MINI_BARS.map((height, index) => (
                    <i key={index} style={{ height, background: item.color, opacity: 0.55 + index * 0.15 }} />
                  ))}
                </span>
              </div>
              <div className="stat-foot">
                <span className={`delta ${item.dir}`}>
                  {item.dir !== "flat" ? <ArrowIcon s={12} /> : null}
                  {item.delta}
                </span>
                <span className="vs">live Mantle state</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
