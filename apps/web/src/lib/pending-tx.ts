// Remembers the last submitted on-chain write across a page reload so a user who refreshes
// mid-flow can still find their transaction (the tx itself is on-chain; only the in-memory
// explorer link would otherwise be lost). sessionStorage-scoped, best-effort, never throws.

const KEY = "interlock:recent-tx";
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

export type RecentTx = { hash: string; label: string; at: number };

export function rememberTx(hash: string, label: string): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(KEY, JSON.stringify({ hash, label, at: Date.now() } satisfies RecentTx));
  } catch {
    /* storage unavailable (private mode / SSR) — non-fatal */
  }
}

export function loadRecentTx(maxAgeMs = DEFAULT_MAX_AGE_MS): RecentTx | undefined {
  try {
    if (typeof sessionStorage === "undefined") return undefined;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const tx = JSON.parse(raw) as RecentTx;
    if (!tx?.hash || typeof tx.at !== "number" || Date.now() - tx.at > maxAgeMs) {
      clearRecentTx();
      return undefined;
    }
    return tx;
  } catch {
    return undefined;
  }
}

export function clearRecentTx(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
