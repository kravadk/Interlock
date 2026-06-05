import { zeroAddress } from "viem";
import { createLogger, requestId } from "@interlock/shared";
import { mantleRpcUrl, webContracts } from "../../../lib/contracts";

/**
 * Web health/status endpoint. Reports configuration readiness without ever exposing secret values —
 * only presence booleans for the server-side keys, the configured contract addresses, and whether
 * the indexer is reachable. Used by ops/monitoring and scripts/live-services-smoke.mjs.
 */

const log = createLogger("web:health");

export async function GET() {
  const id = requestId();
  const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL?.trim();

  let indexerReachable: boolean | null = null;
  if (indexerUrl) {
    indexerReachable = await probe(`${indexerUrl.replace(/\/$/, "")}/health`);
  }

  const body = {
    ok: true,
    service: "interlock-web",
    time: new Date().toISOString(),
    chainRpc: mantleRpcUrl(),
    contracts: {
      agentRegistry: webContracts.agentRegistry !== zeroAddress,
      policyRegistry: webContracts.policyRegistry !== zeroAddress,
      actionAttestation: webContracts.actionAttestation !== zeroAddress,
    },
    // Presence only — never the values.
    keys: {
      ai: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      attestor: Boolean(process.env.ATTESTOR_PRIVATE_KEY?.trim()),
      demo: Boolean(process.env.PRIVATE_KEY?.trim()),
    },
    // Presence only — whether an external error sink (Sentry) is configured.
    errorSink: Boolean(process.env.SENTRY_DSN?.trim()),
    indexer: { url: indexerUrl ?? null, reachable: indexerReachable },
  };

  log.info("health", { requestId: id, indexer: indexerReachable });
  return Response.json(body, { headers: { "x-request-id": id } });
}

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
