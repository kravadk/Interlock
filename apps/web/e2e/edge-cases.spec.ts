import { expect, test, type Page } from "@playwright/test";
import { installMockWallet, mockRpc } from "./helpers";

// Drives the mock wallet's live events from inside the browser context.
const setChain = (page: Page, id: string) =>
  page.evaluate((chainId) => (window as unknown as { __mockWallet: { setChain(id: string): void } }).__mockWallet.setChain(chainId), id);
const setAccounts = (page: Page, accounts: string[]) =>
  page.evaluate((a) => (window as unknown as { __mockWallet: { setAccounts(a: string[]): void } }).__mockWallet.setAccounts(a), accounts);

test.describe("edge cases", () => {
  test("opens with NO wallet — read-only, no crash, honest empty states", async ({ page }) => {
    await mockRpc(page, "empty");
    await page.goto("/app"); // no window.ethereum installed

    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
    await expect(page.getByText("Read-only").first()).toBeVisible();

    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(page.getByText(/No registered agents yet/i)).toBeVisible();
  });

  test("connect rejection surfaces an error, wallet stays disconnected (no silent fail)", async ({ page }) => {
    await mockRpc(page, "empty");
    await installMockWallet(page, { rejectConnect: true });
    await page.goto("/app");

    await page.getByRole("button", { name: /Connect Wallet/i }).click();
    await expect(page.getByText(/reject/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
  });

  test("switching to a wrong network shows Wrong chain + Switch live, then recovers", async ({ page }) => {
    await mockRpc(page, "empty");
    await installMockWallet(page, { connected: true }); // starts on Mantle Sepolia
    await page.goto("/app");

    await page.getByRole("button", { name: /Connect Wallet/i }).click();
    await expect(page.getByRole("button", { name: /0x1111/i })).toBeVisible();

    // The user switches to the wrong network in their wallet — banner must toggle without a refresh.
    await setChain(page, "0x1");
    await expect(page.getByText("Wrong chain").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Switch Mantle/i })).toBeVisible();

    // ...and recover live when they switch back.
    await setChain(page, "0x138b");
    await expect(page.getByRole("button", { name: /Switch Mantle/i })).toHaveCount(0);
    await expect(page.getByText("Wrong chain")).toHaveCount(0);
  });

  test("account disconnect in the extension clears the wallet live", async ({ page }) => {
    await mockRpc(page, "empty");
    await installMockWallet(page, { connected: true });
    await page.goto("/app");

    await page.getByRole("button", { name: /Connect Wallet/i }).click();
    await expect(page.getByRole("button", { name: /0x1111/i })).toBeVisible();

    await setAccounts(page, []);
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
  });

  test("RPC down shows an error with a Retry control (no infinite spinner)", async ({ page }) => {
    await mockRpc(page, "error");
    await page.goto("/app");

    await expect(page.getByText(/RPC \/ Recorder warning/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
  });

  test("preflight panel is reachable read-only and shows the Run control", async ({ page }) => {
    await mockRpc(page, "empty");
    await page.goto("/app");

    await page.getByRole("button", { name: "Preflight", exact: true }).click();
    await expect(page.getByText("Action Review").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Run live preflight/i })).toBeVisible();
  });
});
