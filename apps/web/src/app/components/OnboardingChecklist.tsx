"use client";

import { useEffect, useState } from "react";
import { createPublicClient, formatEther, http, type Address } from "viem";
import { mantleSepolia } from "@interlock/shared";
import { Icon } from "../icons";
import { mantleRpcUrl } from "../../lib/contracts";
import type { ActiveView } from "./shell";

const FAUCET_URL = "https://faucet.sepolia.mantle.xyz/";

type Step = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  cta?: { label: string; onClick: () => void };
  href?: string;
};

/**
 * Live getting-started checklist. Each step is driven by real app state and
 * ticks off as the user progresses Connect -> Get MNT -> Register -> Policy ->
 * Preflight -> Record. Hidden once everything is done.
 */
export function OnboardingChecklist({
  wallet,
  agentsCount,
  policiesCount,
  hasDecision,
  hasRecorded,
  setActive,
  onConnect,
}: {
  wallet?: { address: Address };
  agentsCount: number;
  policiesCount: number;
  hasDecision: boolean;
  hasRecorded: boolean;
  setActive: (view: ActiveView) => void;
  onConnect: () => void;
}) {
  const [balance, setBalance] = useState<bigint | undefined>();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!wallet?.address) {
      setBalance(undefined);
      return;
    }
    let active = true;
    const address = wallet.address;
    const client = createPublicClient({ chain: mantleSepolia, transport: http(mantleRpcUrl()) });
    let interval: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      const value = await client.getBalance({ address }).catch(() => undefined);
      if (!active || value === undefined) return;
      setBalance(value);
      // Faucet funds often arrive after the page is already open; stop re-checking once funded.
      if (value > 0n && interval) {
        clearInterval(interval);
        interval = undefined;
      }
    };
    void load();
    interval = setInterval(() => void load(), 15000);
    const onVisible = () => void load();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (interval) clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [wallet?.address]);

  const hasGas = balance !== undefined && balance > 0n;

  const steps: Step[] = [
    {
      key: "connect",
      label: "Connect a wallet",
      hint: "MetaMask or Rabby on Mantle Sepolia.",
      done: Boolean(wallet),
      cta: wallet ? undefined : { label: "Connect", onClick: onConnect },
    },
    {
      key: "fund",
      label: "Get test MNT",
      hint: hasGas ? `Balance: ${formatEther(balance!).slice(0, 8)} MNT` : "You need gas to send transactions.",
      done: hasGas,
      href: FAUCET_URL,
    },
    {
      key: "agent",
      label: "Register an agent",
      hint: "Create an on-chain agent identity.",
      done: agentsCount > 0,
      cta: { label: "Go to Agents", onClick: () => setActive("agents") },
    },
    {
      key: "policy",
      label: "Create a policy",
      hint: "Define the guardrails for that agent.",
      done: policiesCount > 0,
      cta: { label: "Go to Policies", onClick: () => setActive("policies") },
    },
    {
      key: "preflight",
      label: "Run a preflight",
      hint: "Check an action before it hits the chain.",
      done: hasDecision,
      cta: { label: "Go to Preflight", onClick: () => setActive("preflight") },
    },
    {
      key: "record",
      label: "Record the decision",
      hint: "Write the attestation on-chain.",
      done: hasRecorded,
      cta: { label: "Go to Preflight", onClick: () => setActive("preflight") },
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (dismissed || completed === steps.length) return null;

  return (
    <section className="panel onboarding">
      <div className="panel-head">
        <span className="coin-badge" style={{ background: "#3b82f6" }}>
          <Icon.shield s={16} />
        </span>
        <div>
          <div className="title">Getting started</div>
          <div className="ptitle-sub">
            {completed}/{steps.length} done — go from zero to a gated, recorded action without the CLI.
          </div>
        </div>
        <div className="tools">
          <button className="mini-btn" type="button" onClick={() => setDismissed(true)}>
            <Icon.x s={14} />
            <span>Dismiss</span>
          </button>
        </div>
      </div>
      <div className="checklist">
        {steps.map((step, index) => (
          <div key={step.key} className={`check-step${step.done ? " done" : ""}`}>
            <span className="check-dot">{step.done ? <Icon.check s={14} /> : index + 1}</span>
            <div className="check-body">
              <strong>{step.label}</strong>
              <span>{step.hint}</span>
            </div>
            {!step.done && step.cta ? (
              <button className="mini-btn" type="button" onClick={step.cta.onClick}>
                <span>{step.cta.label}</span>
              </button>
            ) : null}
            {!step.done && step.href ? (
              <a className="mini-btn" href={step.href} target="_blank" rel="noreferrer">
                <Icon.wallet s={14} />
                <span>Get MNT</span>
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
