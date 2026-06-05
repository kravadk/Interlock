const webUrl = envOrDefault("WEB_URL", "http://127.0.0.1:3000");
const indexerUrl = envOrDefault("INDEXER_URL", "http://127.0.0.1:8787").replace(/\/$/, "");

const failures = [];

const web = await fetchJsonOrText(webUrl);
if (!web.ok) {
  failures.push(`web unavailable: ${web.status} ${web.error ?? ""}`.trim());
} else if (typeof web.body !== "string" || !web.body.includes("Interlock")) {
  failures.push("web returned 200 but did not render Interlock content");
}

const health = await fetchJsonOrText(`${indexerUrl}/health`);
if (!health.ok) {
  failures.push(`indexer health unavailable: ${health.status} ${health.error ?? ""}`.trim());
} else if (!health.body?.ok) {
  failures.push("indexer health returned ok=false");
}

const agents = await fetchJsonOrText(`${indexerUrl}/agents`);
if (!agents.ok) {
  failures.push(`indexer agents unavailable: ${agents.status} ${agents.error ?? ""}`.trim());
} else if (!Array.isArray(agents.body?.agents)) {
  failures.push("indexer /agents did not return an agents array");
}

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        webUrl,
        indexerUrl,
        failures,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        webUrl,
        indexerUrl,
        indexer: {
          nextFromBlock: health.body.nextFromBlock,
          syncIntervalMs: health.body.syncIntervalMs,
          lastSyncedCount: health.body.lastSyncedCount,
        },
        agents: agents.body.agents.length,
      },
      null,
      2,
    ),
  );
}

async function fetchJsonOrText(url) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function envOrDefault(name, fallback) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}
