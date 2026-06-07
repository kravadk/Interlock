import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia } from "@interlock/shared";
import { signActionDecision, type SignableDecision } from "@interlock/firewall-sdk";
import { mantleRpcUrl, webContracts } from "../../../lib/contracts";
import { rateLimit } from "../../../lib/rate-limit";

/**
 * Server-side attestor signing. The off-chain firewall identity (ATTESTOR_PRIVATE_KEY)
 * signs the EIP-712 decision so ActionAttestationV2.recordAction can prove the recorded
 * decision is the evaluated one. The key never reaches the browser.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "attest");
  if (limited) return limited;

  const key = process.env.ATTESTOR_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return Response.json(
      { error: "Attestor signing is not configured. Set ATTESTOR_PRIVATE_KEY (server-side)." },
      { status: 503 },
    );
  }

  let body: {
    decision?: SignableDecisionJson;
    nonce?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const d = body.decision;
  if (!d || body.nonce === undefined) {
    return Response.json({ error: "Missing decision or nonce." }, { status: 400 });
  }

  try {
    const attestor = privateKeyToAccount(key as Hex);
    const walletClient = createWalletClient({ account: attestor, chain: mantleSepolia, transport: http(mantleRpcUrl()) });
    const decision: SignableDecision = {
      agentId: BigInt(d.agentId),
      policyId: BigInt(d.policyId),
      target: d.target as Address,
      value: BigInt(d.value),
      calldataHash: d.calldataHash as Hex,
      selector: d.selector as Hex,
      simulationHash: d.simulationHash as Hex,
      evidenceHash: d.evidenceHash as Hex,
      decision: d.decision,
      reasonCode: d.reasonCode,
    };
    const { signature, deadline } = await signActionDecision({
      walletClient,
      attestor,
      decision,
      chainId: mantleSepolia.id,
      verifyingContract: webContracts.actionAttestation, // ActionAttestationV4
      nonce: BigInt(body.nonce),
      version: "4", // committee-verified recording; attestor must be a committee member
    });
    return Response.json({ signature, deadline: deadline.toString(), attestor: attestor.address });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

type SignableDecisionJson = {
  agentId: string;
  policyId: string;
  target: string;
  value: string;
  calldataHash: string;
  selector: string;
  simulationHash: string;
  evidenceHash: string;
  decision: SignableDecision["decision"];
  reasonCode: SignableDecision["reasonCode"];
};
