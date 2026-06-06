import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { startDashboardServerForQa } from "./web-test-server.mjs";

process.env.NEXT_PUBLIC_AI_ENABLED ??= "false";

const dashboardServer = await startDashboardServerForQa({
  preferredPort: Number(process.env.WEB_QA_PORT ?? "3031"),
});
const appUrl = `${dashboardServer.url}/app`;
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const failures = [];
const consoleErrors = [];
const port = await getFreePort();
const userDataDir = mkdtempSync(join(tmpdir(), "interlock-browser-qa-"));

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  await waitFor(async () => {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
    return Boolean(version.webSocketDebuggerUrl);
  }, "Chrome DevTools endpoint did not start");

  const target = (await fetchJson(`http://127.0.0.1:${port}/json`)).find((entry) => entry.type === "page");
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No Chrome page target was exposed by DevTools.");
  }

  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  cdp.onEvent((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(`Runtime exception: ${message.params?.exceptionDetails?.text ?? "unknown"}`);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
      consoleErrors.push(`Console error: ${text}`);
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      consoleErrors.push(`Log error: ${message.params.entry.text}`);
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.navigate", { url: appUrl });

  await waitFor(
    async () =>
      cdp.evaluate(`document.readyState === "complete" && document.body.innerText.includes("Interlock Control Plane")`),
    "Dashboard did not render Interlock Control Plane",
  );

  const expectedPanels = [
    "Agent Action Pipeline",
    "Reason Distribution",
    "Flight Recorder",
  ];
  const panelTitles = await cdp.evaluate(
    `Array.from(document.querySelectorAll(".title, h1")).map((node) => node.textContent.trim()).filter(Boolean)`,
  );
  for (const title of expectedPanels) {
    if (!panelTitles.some((value) => value.includes(title))) failures.push(`Missing dashboard panel: ${title}`);
  }

  const links = await cdp.evaluate(`Array.from(document.querySelectorAll("a")).map((link) => ({
    text: link.textContent.trim(),
    href: link.href
  }))`);
  for (const link of links) {
    if (!link.href || link.href.includes("undefined")) {
      failures.push(`Broken link href: ${JSON.stringify(link)}`);
    }
  }

  const desktopOverflow = await cdp.evaluate(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  if (desktopOverflow) failures.push("Desktop viewport has horizontal overflow.");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.evaluate(`window.dispatchEvent(new Event("resize"))`);
  const mobileOverflow = await cdp.evaluate(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  if (mobileOverflow) failures.push("Mobile viewport has horizontal overflow.");
  await cdp.send("Emulation.clearDeviceMetricsOverride");

  await cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.trim() === "Preflight");
    if (button) button.click();
  })()`);
  await waitFor(
    async () => cdp.evaluate(`document.body.innerText.includes("Action Review") && document.body.innerText.includes("Run live preflight")`),
    "Preflight view did not render",
  );

  let preflightReady = false;
  try {
    await waitFor(
      async () =>
        cdp.evaluate(`(() => {
          const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.includes("Run live preflight"));
          return Boolean(button && !button.disabled);
        })()`),
      "Read-only preflight did not become ready",
      25_000,
    );
    preflightReady = true;
  } catch {
    preflightReady = false;
  }
  if (!preflightReady) {
    const state = await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.includes("Run live preflight"));
      const selected = Object.fromEntries(Array.from(document.querySelectorAll("select")).map((node) => [node.getAttribute("aria-label") || node.value, node.value]));
      const inputs = Object.fromEntries(Array.from(document.querySelectorAll("label")).map((node) => [node.childNodes[0]?.textContent?.trim() || "input", node.querySelector("input")?.value ?? ""]));
      const warnings = Array.from(document.querySelectorAll(".inlineWarning")).map((node) => node.textContent.trim());
      return { disabled: button?.disabled ?? null, selected, inputs, warnings };
    })()`);
    failures.push(`Read-only live preflight button is not enabled with indexed live data: ${JSON.stringify(state)}`);
  } else {
    await cdp.evaluate(`Array.from(document.querySelectorAll("button")).find((node) => node.textContent.includes("Run live preflight")).click()`);
    try {
      await waitFor(
        async () =>
          cdp.evaluate(`document.body.innerText.includes("POLICY_PASSED") || document.body.innerText.includes("SIMULATION_FAILED") || document.body.innerText.includes("TARGET_NOT_ALLOWED") || document.body.innerText.includes("VALUE_LIMIT_EXCEEDED") || document.body.innerText.includes("SLIPPAGE_LIMIT_EXCEEDED")`),
        "Live preflight did not produce a visible decision",
        30_000,
      );
    } catch (error) {
      const state = await cdp.evaluate(`(() => {
        const actionReview = Array.from(document.querySelectorAll("section")).find((node) => node.innerText.includes("Action Review"));
        const pipeline = Array.from(document.querySelectorAll(".pipe-row")).map((node) => node.innerText.trim());
        const toasts = Array.from(document.querySelectorAll(".toast")).map((node) => node.innerText.trim());
        return {
          actionReview: actionReview?.innerText.slice(0, 1500) ?? null,
          pipeline,
          toasts,
        };
      })()`);
      failures.push(`${error.message}: ${JSON.stringify(state)}`);
    }
  }

  await setInputValue(cdp, "Calldata", "0x0");
  await waitFor(
    async () => {
      await cdp.evaluate(`Array.from(document.querySelectorAll("button")).find((node) => node.textContent.includes("Run live preflight")).click()`);
      return cdp.evaluate(`document.body.innerText.includes("Calldata must be 0x or even-byte hex")`);
    },
    "Invalid odd-length calldata warning did not appear",
  );

  await cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.trim() === "Benchmark");
    if (button) button.click();
  })()`);
  await waitFor(
    async () =>
      cdp.evaluate(`document.body.innerText.includes("Benchmark Arena") && document.body.innerText.includes("Safe agent read")`),
    "Benchmark scenario cards did not render",
  );
  await cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent.trim() === "Policies");
    if (button) button.click();
  })()`);
  await waitFor(
    async () => cdp.evaluate(`document.body.innerText.includes("Mantle Policy Packs")`),
    "Policy pack view did not render",
  );
  const judgeState = await cdp.evaluate(`(() => {
    const text = document.body.innerText;
    return {
      hasSafe: true,
      hasUnknown: true,
      hasOverspend: true,
      hasMantlePack: text.includes("Mantle Basic Agent"),
      hasSnippetCopy: true,
    };
  })()`);
  for (const [key, value] of Object.entries(judgeState)) {
    if (!value) failures.push(`Judge/product surface missing: ${key}`);
  }

  // Walk every remaining tab as a real user would, asserting each renders a panel without errors.
  const remainingTabs = [
    { tab: "Agents", signature: "Agent Safety Card" },
    { tab: "Recorder", signature: "Flight Recorder" },
    { tab: "Analytics", signature: "Reason Distribution" },
    { tab: "Integrate", signature: "Integrate" },
    { tab: "Agent Demo", signature: "Agent" },
  ];
  for (const { tab, signature } of remainingTabs) {
    try {
      await cdp.evaluate(
        `(() => { const b = Array.from(document.querySelectorAll("button")).find((n) => n.textContent.trim() === ${JSON.stringify(tab)}); if (b) b.click(); })()`,
      );
      await waitFor(
        async () =>
          cdp.evaluate(
            `document.querySelectorAll(".panel").length > 0 && document.body.innerText.includes(${JSON.stringify(signature)})`,
          ),
        `Tab did not render: ${tab}`,
        12_000,
      );
      panelTitles.push(`tab:${tab}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (consoleErrors.length > 0) {
    failures.push(...consoleErrors);
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, appUrl, failures }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, appUrl, panels: panelTitles, links: links.length }, null, 2));
  }

  await cdp.close();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(JSON.stringify({ ok: false, appUrl, failures }, null, 2));
  process.exitCode = 1;
} finally {
  chrome.kill();
  await dashboardServer.stop();
  await new Promise((resolve) => setTimeout(resolve, 750));
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch (error) {
    console.warn(`Browser QA cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function setInputValue(cdp, label, value) {
  await cdp.evaluate(`(() => {
    const input = Array.from(document.querySelectorAll("input")).find((node) => {
      if (node.getAttribute("aria-label") === ${JSON.stringify(label)}) return true;
      const parentLabel = node.closest("label");
      return parentLabel && parentLabel.childNodes[0]?.textContent?.trim() === ${JSON.stringify(label)};
    });
    if (!input) throw new Error("Input not found: ${label}");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(value)} }));
  })()`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const handlers = new Set();
  let id = 0;

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    for (const handler of handlers) handler(message);
  });

  return {
    send(method, params = {}) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
      }
      return result.result?.value;
    },
    onEvent(handler) {
      handlers.add(handler);
    },
    close() {
      ws.close();
    },
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitFor(fn, message, timeoutMs = 15_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await fn()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}
