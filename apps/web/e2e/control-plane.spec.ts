import { expect, test } from "@playwright/test";

test("landing page renders and links into the control plane", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Pre-flight firewall").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Enter the control plane/i }).first()).toBeVisible();

  await page.getByRole("link", { name: /Enter the control plane/i }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
});

test("control plane opens without wallet and exposes preflight", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
  await page.getByRole("button", { name: "Preflight", exact: true }).click();
  await expect(page.getByText("Action Review").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Run live preflight/i })).toBeVisible();
});

test("mocked injected wallet can connect without a real extension", async ({ page }) => {
  await page.addInitScript(() => {
    const account = "0x1111111111111111111111111111111111111111";
    (window as Window & { ethereum?: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
        if (method === "eth_chainId") return "0x138b";
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        return null;
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  });

  await page.goto("/app");
  await page.getByRole("button", { name: /Connect Wallet/i }).click();

  await expect(page.getByRole("button", { name: /0x1111/i })).toBeVisible();
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/");

  expect(response.headers()["content-security-policy-report-only"]).toContain("default-src 'self'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("AI route returns 429 after configured quota", async ({ request }) => {
  const first = await request.post("/api/ai", { data: { task: "summary", payload: {} } });
  const second = await request.post("/api/ai", { data: { task: "summary", payload: {} } });
  const third = await request.post("/api/ai", { data: { task: "summary", payload: {} } });

  expect(first.status()).toBe(503);
  expect(second.status()).toBe(503);
  expect(third.status()).toBe(429);
  expect(third.headers()["retry-after"]).toBeTruthy();
});
