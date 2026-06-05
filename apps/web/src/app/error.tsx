"use client";

import { useEffect } from "react";
import { reportError } from "../lib/error-reporting";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: "dashboard", digest: error.digest });
  }, [error]);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mantle Sepolia - Agent Security Layer</p>
          <h1>Interlock Firewall</h1>
          <p className="subtitle">
            The dashboard hit an unexpected client error before it could render live chain or indexer data.
          </p>
        </div>
      </section>

      <section className="grid">
        <section className="panel wide">
          <header>
            <div>
              <h2>Unexpected dashboard error</h2>
              <p>No cached or synthetic data is shown while the UI is in an error state.</p>
            </div>
          </header>
          <div className="emptyState">
            {error.message || "Unknown dashboard error."}
            {error.digest ? ` Digest: ${error.digest}` : ""}
          </div>
          <button className="primaryAction" onClick={reset}>
            Reload dashboard
          </button>
        </section>
      </section>
    </main>
  );
}
