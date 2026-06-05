"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { explorerAddressUrl, webContracts } from "../../../lib/contracts";
import { LiveFirewallDemo } from "./LiveFirewallDemo";

export function Hero() {
  return (
    <section className="az-hero">
      <div className="az-container az-hero-grid">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="az-eyebrow">Pre-flight firewall · Mantle Sepolia</span>
          <h1 className="az-display">
            Every action an agent takes,<br />
            <em>examined</em> before it is signed.
          </h1>
          <p className="az-lead">
            Interlock is the chancellery for autonomous agents — it weighs each transaction against an
            on-chain policy, a live simulation, and an advisory AI, then <strong>seals the verdict
            on-chain</strong> as disputable evidence.
          </p>
          <div className="az-cta-row">
            <Link href="/app" className="az-btn acid lg">Enter the control plane</Link>
            <a className="az-btn ghost lg" href={explorerAddressUrl(webContracts.actionAttestation)} target="_blank" rel="noreferrer">
              Read the seal ↗
            </a>
          </div>
          <div className="az-hero-meta">
            <span>Deterministic ALLOW / BLOCK</span>
            <span>EIP-712 · dispute window</span>
            <span>SDK · REST · MCP · CLI</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
        >
          <LiveFirewallDemo />
        </motion.div>
      </div>
    </section>
  );
}
