import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRecentTx, loadRecentTx, rememberTx } from "./pending-tx";

// Minimal sessionStorage shim for the node test environment.
function installSessionStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("sessionStorage", mock);
  return store;
}

describe("pending-tx recovery", () => {
  beforeEach(() => {
    installSessionStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-06T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("remembers and loads a recent tx", () => {
    rememberTx("0xabc", "Decision attestation");
    const recent = loadRecentTx();
    expect(recent?.hash).toBe("0xabc");
    expect(recent?.label).toBe("Decision attestation");
  });

  it("returns undefined when nothing is stored", () => {
    expect(loadRecentTx()).toBeUndefined();
  });

  it("expires a stale tx beyond maxAge and clears it", () => {
    rememberTx("0xold", "Enforced execution");
    vi.advanceTimersByTime(11 * 60 * 1000); // older than the 10-minute default window
    expect(loadRecentTx()).toBeUndefined();
    // confirm it was cleared, not just filtered
    expect(loadRecentTx(60 * 60 * 1000)).toBeUndefined();
  });

  it("clearRecentTx removes the stored tx", () => {
    rememberTx("0xdef", "Register agent");
    clearRecentTx();
    expect(loadRecentTx()).toBeUndefined();
  });

  it("never throws when storage is unavailable", () => {
    vi.unstubAllGlobals(); // no sessionStorage in scope
    expect(() => rememberTx("0x1", "x")).not.toThrow();
    expect(loadRecentTx()).toBeUndefined();
    expect(() => clearRecentTx()).not.toThrow();
  });
});
