import { type Address, type Hex } from "viem";
import { mantleSepolia } from "@interlock/shared";
import { InterlockFirewall, buildEvidenceReport, type GatewayMode } from "@interlock/firewall-sdk";
import { mantleRpcUrl, webContracts } from "../../../lib/contracts";
import { rateLimit } from "../../../lib/rate-limit";

/**
 * Interlock Agent Gateway over REST. A single entry point an agent can POST a proposed action
 * to; Interlock runs the pre-flight and (depending on mode) records evidence and/or executes.
 *
 * Modes:
 *  - "dry-run"            check only (no key required)
 *  - "record-only"       check + on-chain attestation
 *  - "execute-if-allowed" check + record + send if allowed
 *  - "block-and-alert"   check + alert payload on block
 *
 * Record/execute modes need a server-side PRIVATE_KEY (and ATTESTOR_PRIVATE_KEY for signing);
 * keys never reach the browser. The response always includes the portable evidence object.
 */
const MODES: GatewayMode[] = ["dry-run", "record-only", "execute-if-allowed", "block-and-alert"];

export async function POST(request: Request) {
  const limited = rateLimit(request, "attest");
  if (limited) return limited;

  let body: GatewayRequestJson;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = (body.mode ?? "dry-run") as GatewayMode;
  if (!MODES.includes(mode)) {
    return Response.json({ error: `Invalid mode. Use one of: ${MODES.join(", ")}.` }, { status: 400 });
  }
  if (body.agentId === undefined || body.policyId === undefined || !body.to) {
    return Response.json({ error: "Missing agentId, policyId, or to." }, { status: 400 });
  }

  const recordDecision = body.recordDecision;
  const needsKey = mode === "record-only" || mode === "execute-if-allowed" || (mode === "block-and-alert" && recordDecision === true);
  const privateKey = process.env.PRIVATE_KEY?.trim();
  const attestorKey = process.env.ATTESTOR_PRIVATE_KEY?.trim();
  if (needsKey && (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey))) {
    return Response.json(
      { error: `Mode "${mode}" requires a server-side PRIVATE_KEY. Use mode "dry-run" for read-only checks.` },
      { status: 503 },
    );
  }

  try {
    const firewall = new InterlockFirewall({
      chain: mantleSepolia,
      rpcUrl: mantleRpcUrl(),
      contracts: webContracts,
      ...(privateKey ? { privateKey: privateKey as Hex } : {}),
      ...(attestorKey ? { attestorPrivateKey: attestorKey as Hex } : {}),
    });

    const result = await firewall.runGatewayAction(
      {
        agentId: BigInt(body.agentId),
        policyId: BigInt(body.policyId),
        tx: {
          to: body.to as Address,
          value: BigInt(body.value ?? "0"),
          data: (body.data ?? "0x") as Hex,
        },
        ...(body.intent || body.expectedSlippageBps !== undefined
          ? { metadata: { intent: body.intent, expectedSlippageBps: body.expectedSlippageBps } }
          : {}),
      },
      { mode, recordDecision, recordTiming: body.recordTiming, throwOnBlock: false },
    );

    const evidence = buildEvidenceReport(result.decision, {
      intent: body.intent,
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      ok: result.status !== "blocked" && result.status !== "alert",
      gateway: jsonSafe(result),
      evidence: evidence.evidence,
      evidenceHash: evidence.evidenceHash,
      note: "Pre-flight evidence. Dev Alpha — not an audited production trust score.",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// GatewayActionResult carries bigints inside the decision — serialize them for JSON.
function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

type GatewayRequestJson = {
  agentId?: string | number;
  policyId?: string | number;
  to?: string;
  value?: string;
  data?: string;
  mode?: string;
  intent?: string;
  expectedSlippageBps?: number;
  recordDecision?: boolean;
  recordTiming?: "before-send" | "after-send";
};
