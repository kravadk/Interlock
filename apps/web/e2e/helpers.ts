import type { Page } from "@playwright/test";

export const MANTLE_SEPOLIA_HEX = "0x138b"; // 5003
export const TEST_ACCOUNT = "0x1111111111111111111111111111111111111111";

export type MockWalletOptions = {
  account?: string;
  chainId?: string;
  connected?: boolean;
  rejectConnect?: boolean;
};

/**
 * Installs a controllable mock `window.ethereum` BEFORE app scripts run. Exposes
 * `window.__mockWallet` so a test can drive live events:
 *   await page.evaluate(() => window.__mockWallet.setAccounts([]))        // disconnect
 *   await page.evaluate((id) => window.__mockWallet.setChain(id), "0x1") // wrong network
 *   await page.evaluate(() => window.__mockWallet.setRejectConnect(true))
 */
export async function installMockWallet(page: Page, opts: MockWalletOptions = {}): Promise<void> {
  await page.addInitScript((options: Required<MockWalletOptions>) => {
    const state = {
      accounts: options.connected ? [options.account] : [],
      chainId: options.chainId,
      rejectConnect: options.rejectConnect,
    };
    const listeners: Record<string, Array<(payload: unknown) => void>> = {};
    const emit = (event: string, payload: unknown) => (listeners[event] ?? []).forEach((cb) => cb(payload));

    (window as unknown as { __mockWallet: unknown }).__mockWallet = {
      setAccounts(accounts: string[]) {
        state.accounts = accounts;
        emit("accountsChanged", accounts);
      },
      setChain(chainId: string) {
        state.chainId = chainId;
        emit("chainChanged", chainId);
      },
      setRejectConnect(value: boolean) {
        state.rejectConnect = value;
      },
    };

    const provider = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") {
          if (state.rejectConnect) {
            const error = new Error("User rejected the request.") as Error & { code: number };
            error.code = 4001;
            throw error;
          }
          state.accounts = [options.account];
          return state.accounts;
        }
        if (method === "eth_accounts") return state.accounts;
        if (method === "eth_chainId") return state.chainId;
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        return null;
      },
      on: (event: string, cb: (payload: unknown) => void) => {
        (listeners[event] ??= []).push(cb);
      },
      removeListener: (event: string, cb: (payload: unknown) => void) => {
        listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
      },
    };
    (window as unknown as { ethereum: unknown }).ethereum = provider;
  }, {
    account: opts.account ?? TEST_ACCOUNT,
    chainId: opts.chainId ?? MANTLE_SEPOLIA_HEX,
    connected: opts.connected ?? false,
    rejectConnect: opts.rejectConnect ?? false,
  });
}

type RpcMode = "empty" | "error";

/**
 * Deterministically controls all dashboard on-chain reads by intercepting the `/api/rpc` proxy
 * (the browser RPC transport posts there; e2e runs with the indexer disabled, so this is the only
 * data source). "empty" → valid empty responses (empty history / empty states); "error" → HTTP 500.
 */
export async function mockRpc(page: Page, mode: RpcMode = "empty"): Promise<void> {
  await page.route("**/api/rpc", async (route) => {
    if (mode === "error") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "RPC unavailable" }) });
      return;
    }
    const raw = route.request().postData() ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const respond = (req: { id?: unknown; method?: string }) => {
      const method = req.method;
      let result: unknown = null;
      if (method === "eth_chainId") result = MANTLE_SEPOLIA_HEX;
      else if (method === "eth_blockNumber") result = "0x1";
      else if (method === "eth_getLogs") result = [];
      else if (method === "eth_call") result = "0x";
      else if (method === "eth_getBalance") result = "0x0";
      else if (method === "net_version") result = "5003";
      return { jsonrpc: "2.0", id: (req as { id?: unknown }).id ?? null, result };
    };
    const body = Array.isArray(parsed) ? (parsed as Array<{ method?: string }>).map(respond) : respond(parsed as { method?: string });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}
