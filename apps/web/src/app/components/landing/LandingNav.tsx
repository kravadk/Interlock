"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "framer-motion";
import { Logo } from "../../icons";
import { explorerAddressUrl, webContracts } from "../../../lib/contracts";
import { fetchSnapshot } from "../../../lib/snapshot";
import { short } from "../../../lib/dashboard-data";

type TickerRow = { t: string; v: string; k: "alw" | "blk" };

// Illustrative fallback shown only while the live snapshot is still loading (or if the indexer/RPC
// is unreachable). Replaced by real recent on-chain decisions as soon as they arrive.
const FALLBACK: TickerRow[] = [
  { t: "Agent profile read", v: "ALLOW", k: "alw" },
  { t: "Unknown target", v: "BLOCK · TARGET_NOT_ALLOWED", k: "blk" },
  { t: "Overspend", v: "BLOCK · VALUE_LIMIT_EXCEEDED", k: "blk" },
  { t: "Selector not allowed", v: "BLOCK · SELECTOR_NOT_ALLOWED", k: "blk" },
  { t: "Quote read", v: "ALLOW", k: "alw" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [rows, setRows] = useState<TickerRow[]>();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Real recent decisions, read live from Mantle Sepolia (indexer snapshot, RPC fallback).
  useEffect(() => {
    let active = true;
    fetchSnapshot("", { force: false })
      .then((snapshot) => {
        if (!active) return;
        const live = snapshot.actions.slice(0, 8).map<TickerRow>((action) => ({
          t: `Agent #${action.agentId} · ${short(action.target)}`,
          v: action.decision === "ALLOW" ? "ALLOW" : `BLOCK · ${action.reasonCode}`,
          k: action.decision === "ALLOW" ? "alw" : "blk",
        }));
        if (live.length >= 3) setRows(live);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const live = Boolean(rows);
  const ticker = rows ?? FALLBACK;

  const row = (key: string) =>
    ticker.map((item) => (
      <span key={key + item.t}>
        {item.t} — <b className={item.k}>{item.v}</b>
      </span>
    ));

  return (
    <>
      <motion.div className="az-progress" style={{ scaleX: progress, width: "100%" }} />
      <div className="az-ticker">
        <div className="az-container">
          <div className="az-ticker-inner">
            <span className="az-ticker-tag">
              {live ? <span className="d" /> : null} {live ? "Recently examined · live" : "Example checks"}
            </span>
            <div className="az-marquee">
              <div className="az-marquee-track">
                {row("a")}
                {row("b")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <header className={`az-nav${scrolled ? " scrolled" : ""}`}>
        <div className="az-container az-nav-inner">
          <Link href="/" className="az-brand">
            <Logo />
            <span>Interlock</span>
          </Link>
          <nav className="az-nav-links">
            <a className="az-ulink" href="#examination">How it works</a>
            <a className="az-ulink" href="#builders">For builders</a>
            <a className="az-ulink" href={explorerAddressUrl(webContracts.actionAttestation)} target="_blank" rel="noreferrer">
              The seal
            </a>
            <Link href="/app" className="az-btn">Enter the app</Link>
          </nav>
        </div>
      </header>
    </>
  );
}
