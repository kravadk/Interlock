"use client";

import { useEffect } from "react";
import { reportError } from "../lib/error-reporting";

/**
 * Root-level error boundary. Renders when the root layout itself throws (where `error.tsx` can't),
 * so a catastrophic render error still shows a branded recovery screen instead of a blank page.
 * Must include <html>/<body>; uses inline styles since the global stylesheet may not have loaded.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b0d",
          color: "#e3e3e6",
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
        }}
      >
        <main style={{ maxWidth: 520, padding: 32, textAlign: "center" }}>
          <p style={{ color: "#7d7d85", fontSize: 12, letterSpacing: "0.04em", margin: 0 }}>
            INTERLOCK · MANTLE SEPOLIA
          </p>
          <h1 style={{ fontSize: 22, margin: "12px 0" }}>The dashboard crashed</h1>
          <p style={{ color: "#b6b6bb", fontSize: 14, lineHeight: 1.5 }}>
            A fatal error stopped the app from rendering. No cached or synthetic data is shown while in this state.
          </p>
          <pre
            style={{
              textAlign: "left",
              background: "#131316",
              border: "1px solid #242428",
              borderRadius: 9,
              padding: 12,
              fontSize: 12,
              color: "#f06d6d",
              overflowX: "auto",
            }}
          >
            {error.message || "Unknown error."}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
          </pre>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              borderRadius: 9,
              border: "1px solid transparent",
              background: "#34d39e",
              color: "#06281d",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload dashboard
          </button>
        </main>
      </body>
    </html>
  );
}
