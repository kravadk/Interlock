"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "framer-motion";
import { Logo } from "../../icons";
import { explorerAddressUrl, webContracts } from "../../../lib/contracts";

const TICKER = [
  { t: "Agent #1 · profile read", v: "ALLOW", k: "alw" },
  { t: "Unknown target", v: "BLOCK · TARGET_NOT_ALLOWED", k: "blk" },
  { t: "Vault deposit · 0.01 MNT", v: "ALLOW", k: "alw" },
  { t: "Overspend +1 wei", v: "BLOCK · VALUE_LIMIT_EXCEEDED", k: "blk" },
  { t: "Unlimited approve", v: "BLOCK · UNKNOWN_SELECTOR", k: "blk" },
  { t: "RWA rebalance", v: "BLOCK · RWA_OVEREXPOSURE", k: "blk" },
  { t: "Quote read", v: "ALLOW", k: "alw" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const row = (key: string) =>
    TICKER.map((item) => (
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
            <span className="az-ticker-tag"><span className="d" /> Now examining</span>
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
            <a className="az-ulink" href="#examination">The examination</a>
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
