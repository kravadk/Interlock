import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { startDashboardServerForQa } from "./web-test-server.mjs";

const dashboardServer = await startDashboardServerForQa({
  preferredPort: Number(process.env.WEB_QA_PORT ?? "3032"),
});
const appUrl = `${dashboardServer.url}/app`;
const outputDir = resolve("docs/screenshots");
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

mkdirSync(outputDir, { recursive: true });

const port = await getFreePort();
const userDataDir = mkdtempPath();
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
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
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await captureViewport(cdp, {
    width: 1440,
    height: 1200,
    mobile: false,
    output: "dashboard-desktop-qa.png",
  });

  await captureViewport(cdp, {
    width: 390,
    height: 1100,
    mobile: true,
    output: "dashboard-mobile-qa.png",
  });

  const judgeUrl = new URL(appUrl);
  judgeUrl.searchParams.set("mode", "judge");
  await captureViewport(cdp, {
    width: 1440,
    height: 1200,
    mobile: false,
    output: "dashboard-judge-qa.png",
    url: judgeUrl.toString(),
  });

  await cdp.close();
  const files = [
    "docs/screenshots/dashboard-desktop-qa.png",
    "docs/screenshots/dashboard-mobile-qa.png",
    "docs/screenshots/dashboard-judge-qa.png",
  ];
  console.log(
    JSON.stringify(
      {
        ok: true,
        appUrl,
        files,
      },
      null,
      2,
    ),
  );
} finally {
  chrome.kill();
  await dashboardServer.stop();
  await new Promise((resolve) => setTimeout(resolve, 750));
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch {
    // Ignore temporary Chrome profile cleanup races on Windows.
  }
}

async function captureViewport(cdp, { width, height, mobile, output, url = appUrl }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
  await cdp.send("Page.navigate", { url });
  await waitFor(
    async () =>
      cdp.evaluate(`document.readyState === "complete" && document.body.innerText.includes("Interlock Control Plane")`),
    "Dashboard did not render Interlock Control Plane",
  );
  await waitFor(
    async () => cdp.evaluate(`document.body.innerText.includes("Flight Recorder")`),
    "Flight Recorder panel did not render",
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
  });
  writeFileSync(resolve(outputDir, output), Buffer.from(screenshot.data, "base64"));
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
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

function mkdtempPath() {
  const suffix = Math.random().toString(16).slice(2);
  return join(tmpdir(), `interlock-screenshots-${suffix}`);
}
