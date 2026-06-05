import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  actionableError,
  InterlockFirewall,
  AgentToolInputError,
  assertValidCalldata,
  assertValidSlippageBps,
  createFirewallActionHandler,
  suggestedCalldataForPolicyAction,
  type GatewayMode,
} from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";
import { isAddress, type Hex } from "viem";

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
const port = Number(process.env.PORT ?? "8790");
const serve = process.argv.includes("--serve");

const firewall = new InterlockFirewall({
  chain: mantleSepolia,
  rpcUrl,
  privateKey,
  contracts: deployedAddresses.mantleSepolia,
});

if (!serve) {
  await runCliDemo();
} else {
  startServer();
}

async function runCliDemo() {
  if (agentId === undefined) {
    console.log("Preflight API handler is configured for Mantle Sepolia.");
    console.log({
      rpcUrl,
      agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
      policyRegistry: deployedAddresses.mantleSepolia.policyRegistry,
      actionTarget: deployedAddresses.mantleSepolia.agentRegistry,
      nextStep: "Set AGENT_ID and POLICY_ID to run a live policy check, or start the server to inspect /health.",
      serverCommand: "AGENT_ID=<id> POLICY_ID=<id> pnpm --filter @interlock/example-preflight-api serve",
    });
    return;
  }

  if (policyId === undefined) {
    console.log("Preflight API handler requires POLICY_ID for a live policy check.");
    console.log({
      agentId: agentId.toString(),
      policyRegistry: deployedAddresses.mantleSepolia.policyRegistry,
      actionTarget: deployedAddresses.mantleSepolia.agentRegistry,
      serverCommand: "POLICY_ID=<id> pnpm --filter @interlock/example-preflight-api serve",
    });
    return;
  }

  const handler = createFirewallActionHandler({
    firewall,
    agentId,
    policyId,
    recordDecision: false,
  });

  const response = await handler.handle({
    to: deployedAddresses.mantleSepolia.agentRegistry,
    value: "0",
    data: suggestedCalldataForPolicyAction({
      target: deployedAddresses.mantleSepolia.agentRegistry,
      selector: "0x2de5aaf7",
      agentId,
      agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
    }),
    intent: "API route checks an AgentRegistry read action before returning it to an agent.",
  });

  console.log(response);
}

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      const actionable = actionableError(error);
      json(res, 500, { ok: false, status: "error", ...actionable });
    }
  });

  server.listen(port, () => {
    console.log(`Interlock preflight API listening on http://127.0.0.1:${port}`);
    console.log(`Indexer URL: ${configuredIndexerUrl() ?? "not configured"}`);
  });
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    empty(res, 204);
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: policyId !== undefined,
      chainId: mantleSepolia.id,
      agentId: agentId?.toString(),
      policyId: policyId?.toString(),
      recordEnabled: Boolean(privateKey),
      action:
        agentId === undefined
          ? "Set AGENT_ID before calling /preflight or /record."
          : policyId === undefined
            ? "Set POLICY_ID before calling /preflight or /record."
            : "POST /gateway/action or /preflight/bundle with proposed transaction JSON.",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/preflight/bundle") {
    if (agentId === undefined) {
      json(res, 400, {
        ok: false,
        status: "error",
        code: "AGENT_ID_REQUIRED",
        message: "AGENT_ID is required for bundle preflight.",
        action: "Set AGENT_ID to a live agent id from the deployed AgentRegistry.",
      });
      return;
    }
    if (policyId === undefined) {
      json(res, 400, {
        ok: false,
        status: "error",
        code: "POLICY_ID_REQUIRED",
        message: "POLICY_ID is required for bundle preflight.",
        action: "Set POLICY_ID to a live policy id that belongs to the configured AGENT_ID.",
      });
      return;
    }
    const body = await readJson(req);
    const bundle = normalizeBundleBody(body);
    const report = await firewall.checkActionBundle({
      bundleId: bundle.bundleId,
      agentId,
      policyId,
      intent: bundle.intent,
      metadata: bundle.metadata,
      actions: bundle.actions.map((input) => ({
        agentId,
        policyId,
        tx: {
          to: input.to,
          value: BigInt(input.value),
          data: input.data,
        },
        metadata: {
          intent: input.intent,
          route: input.route,
          expectedSlippageBps: input.expectedSlippageBps,
        },
      })),
    });
    json(res, 200, { ok: true, status: report.decision, bundle: jsonSafe(report) });
    return;
  }

  if (req.method === "POST" && (url.pathname === "/preflight" || url.pathname === "/record" || url.pathname === "/gateway/action")) {
    if (agentId === undefined) {
      json(res, 400, {
        ok: false,
        status: "error",
        code: "AGENT_ID_REQUIRED",
        message: "AGENT_ID is required for the preflight API.",
        action: "Set AGENT_ID to a live agent id from the deployed AgentRegistry.",
      });
      return;
    }

    if (policyId === undefined) {
      json(res, 400, {
        ok: false,
        status: "error",
        code: "POLICY_ID_REQUIRED",
        message: "POLICY_ID is required for the preflight API.",
        action: "Set POLICY_ID to a live policy id that belongs to the configured AGENT_ID.",
      });
      return;
    }

    const body = await readJson(req);
    const input = normalizePreflightBody(body);

    if (url.pathname === "/gateway/action") {
      const mode = normalizeGatewayMode(body);
      const recordDecision = isRecord(body) && typeof body.recordDecision === "boolean" ? body.recordDecision : undefined;
      const recordTiming = normalizeRecordTiming(body);
      if ((mode === "record-only" || mode === "execute-if-allowed" || (mode === "block-and-alert" && recordDecision)) && !privateKey) {
        json(res, 400, {
          ok: false,
          status: "error",
          code: "PRIVATE_KEY_REQUIRED",
          message: `${mode} requires PRIVATE_KEY in the API server environment.`,
          action: "Use mode=dry-run for read-only checks or configure PRIVATE_KEY server-side.",
        });
        return;
      }
      const result = await firewall.runGatewayAction({
        agentId,
        policyId,
        tx: {
          to: input.to,
          value: BigInt(input.value),
          data: input.data,
        },
        metadata: {
          intent: input.intent,
          route: input.route,
          expectedSlippageBps: input.expectedSlippageBps,
        },
      }, {
        mode,
        recordDecision,
        recordTiming,
        throwOnBlock: false,
      });
      json(res, 200, { ok: true, status: result.status, gateway: jsonSafe(result) });
      return;
    }

    const handler = createFirewallActionHandler({
      firewall,
      agentId,
      policyId,
      recordDecision: url.pathname === "/record",
    });
    const result = await handler.handle(input);
    json(res, result.ok ? 200 : 400, result);
    return;
  }

  const agentActionsMatch = url.pathname.match(/^\/agents\/([^/]+)\/actions$/);
  if (req.method === "GET" && agentActionsMatch) {
    await proxyIndexer(res, `/agents/${agentActionsMatch[1]}/actions${url.search}`);
    return;
  }

  const policyMatch = url.pathname.match(/^\/policies\/([^/]+)$/);
  if (req.method === "GET" && policyMatch) {
    await proxyIndexer(res, `/policies/${policyMatch[1]}`);
    return;
  }

  json(res, 404, {
    ok: false,
    status: "error",
    code: "ROUTE_NOT_FOUND",
    message: "Supported routes are GET /health, POST /preflight, POST /preflight/bundle, POST /record, POST /gateway/action, GET /agents/:id/actions, and GET /policies/:id.",
    action: "Use one of the documented Interlock preflight API routes.",
  });
}

function normalizeGatewayMode(body: unknown): GatewayMode {
  if (!isRecord(body) || body.mode === undefined) return "dry-run" as const;
  const mode = String(body.mode);
  if (mode === "dry-run" || mode === "record-only" || mode === "execute-if-allowed" || mode === "block-and-alert") return mode;
  throw new AgentToolInputError("Body field `mode` must be dry-run, record-only, execute-if-allowed, or block-and-alert.");
}

function normalizeRecordTiming(body: unknown) {
  if (!isRecord(body) || body.recordTiming === undefined) return undefined;
  const value = String(body.recordTiming);
  if (value === "before-send" || value === "after-send") return value;
  throw new AgentToolInputError("Body field `recordTiming` must be before-send or after-send.");
}

function normalizePreflightBody(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const to = String(body.to ?? "");
  if (!isAddress(to)) {
    throw new AgentToolInputError("Body field `to` must be an EVM address.");
  }

  const data = String(body.data ?? "0x");
  try {
    assertValidCalldata(data, "data");
  } catch {
    throw new AgentToolInputError("Body field `data` must be full 0x-prefixed calldata with complete bytes.");
  }

  const value = body.value === undefined ? "0" : String(body.value);
  if (!/^\d+$/.test(value)) {
    throw new AgentToolInputError("Body field `value` must be a non-negative integer string in wei.");
  }

  const expectedSlippageBps = body.expectedSlippageBps;
  if (expectedSlippageBps !== undefined && typeof expectedSlippageBps !== "number") {
    throw new AgentToolInputError("Body field `expectedSlippageBps` must be an integer between 0 and 10000.");
  }
  try {
    assertValidSlippageBps(expectedSlippageBps, "expectedSlippageBps");
  } catch {
    throw new AgentToolInputError("Body field `expectedSlippageBps` must be an integer between 0 and 10000.");
  }

  return {
    to,
    value,
    data,
    intent: typeof body.intent === "string" ? body.intent : undefined,
    route: typeof body.route === "string" ? body.route : undefined,
    expectedSlippageBps: typeof expectedSlippageBps === "number" ? expectedSlippageBps : undefined,
  };
}

function normalizeBundleBody(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }
  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    throw new AgentToolInputError("Body field `actions` must be a non-empty array of proposed transaction objects.");
  }
  if (body.actions.length > 10) {
    throw new AgentToolInputError("Body field `actions` can include at most 10 actions for this reference API.");
  }
  const actions = body.actions.map((item) => normalizePreflightBody(item));
  const intent = typeof body.intent === "string" && body.intent.trim()
    ? body.intent.trim()
    : "Review a multi-step agent action bundle before execution.";
  const bundleId = typeof body.bundleId === "string" && body.bundleId.trim() ? body.bundleId.trim() : undefined;
  const routeProvider = normalizeRouteProvider(body.routeProvider);
  return {
    bundleId,
    intent,
    actions,
    metadata: {
      source: "manual" as const,
      routeProvider,
      expectedSlippageBps: actions.find((action) => action.expectedSlippageBps !== undefined)?.expectedSlippageBps,
    },
  };
}

function normalizeRouteProvider(value: unknown): "1inch" | "odos" | "axelar" | "manual" | undefined {
  if (value === undefined) return undefined;
  if (value === "1inch" || value === "odos" || value === "axelar" || value === "manual") return value;
  throw new AgentToolInputError("Body field `routeProvider` must be 1inch, odos, axelar, or manual when provided.");
}

async function proxyIndexer(res: ServerResponse, path: string) {
  try {
    const indexerUrl = configuredIndexerUrl();
    if (!indexerUrl) {
      throw new Error("INDEXER_URL is not configured.");
    }
    const response = await fetch(`${indexerUrl}${path}`);
    const text = await response.text();
    res.writeHead(response.status, {
      "access-control-allow-origin": "*",
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
    });
    res.end(text);
  } catch (error) {
    json(res, 503, {
      ok: false,
      status: "error",
      code: "INDEXER_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error),
      action: "Start the Interlock indexer and set INDEXER_URL to its base URL.",
    });
  }
}

async function readJson(req: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_key, current) => (typeof current === "bigint" ? current.toString() : current)));
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body, null, 2));
}

function empty(res: ServerResponse, status: number) {
  res.writeHead(status, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
  });
  res.end();
}

function configuredIndexerUrl() {
  const value = process.env.INDEXER_URL ?? process.env.NEXT_PUBLIC_INDEXER_URL;
  return value ? value.replace(/\/$/, "") : undefined;
}

function readOptionalBigIntEnv(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be set to a positive id from the deployed Interlock contracts.`);
  }
  return BigInt(value);
}
