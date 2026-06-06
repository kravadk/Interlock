"use client";

import { useEffect, useState } from "react";
import { createPublicClient, isAddress, type Address } from "viem";
import { mantleSepolia } from "@interlock/shared";
import { getErc8004Agent, getErc8004ReputationSummary, type Erc8004Agent } from "@interlock/firewall-sdk";
import { browserRpcTransport } from "../../lib/rpc-transport";
import { explorerAddressUrl, hasErc8004Configured, mantleRpcUrl, webContracts } from "../../lib/contracts";
import { registerErc8004FromWallet } from "../../lib/wallet";
import { actionableTxError } from "../../lib/tx-error";
import { short } from "../../lib/dashboard-data";
import { Icon } from "../icons";
import { Metric, TxButton, TxResult } from "./primitives";
import { useToast } from "./Toast";

type Reputation = { count: string; summaryValue: string; summaryValueDecimals: number };

/**
 * Reads an agent's REAL identity + reputation from the official ERC-8004 registries (verified on
 * Mantle Sepolia) and, when the agent is not yet registered, offers an on-chain "Register in
 * ERC-8004" CTA. Read-only path needs no wallet; the register write is approval-gated.
 */
export function Erc8004Identity({ agentId, account, wrongChain }: { agentId: string; account?: Address; wrongChain?: boolean }) {
  const [identity, setIdentity] = useState<Erc8004Agent>();
  const [reputation, setReputation] = useState<Reputation>();
  const [state, setState] = useState<"idle" | "loading" | "registered" | "unregistered">("idle");
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<string>();
  const [error, setError] = useState<string>();
  const { push } = useToast();

  const configured = hasErc8004Configured();
  const validId = /^[1-9]\d*$/.test(agentId);

  useEffect(() => {
    if (!configured || !validId) {
      setState("idle");
      setIdentity(undefined);
      setReputation(undefined);
      return;
    }
    let active = true;
    setState("loading");
    const publicClient = createPublicClient({ chain: mantleSepolia, transport: browserRpcTransport(mantleRpcUrl()) });
    getErc8004Agent({ publicClient, identityRegistry: webContracts.erc8004IdentityRegistry, agentId: BigInt(agentId) })
      .then(async (agent) => {
        if (!active) return;
        setIdentity(agent);
        setState("registered");
        // Reputation is best-effort; an empty client list returns the global summary.
        const clients = account && isAddress(account) ? [account] : [];
        const summary = await getErc8004ReputationSummary({
          publicClient,
          reputationRegistry: webContracts.erc8004ReputationRegistry,
          agentId: BigInt(agentId),
          clientAddresses: clients,
        }).catch(() => undefined);
        if (active && summary) setReputation(summary);
      })
      .catch(() => {
        // ownerOf reverts for an unminted tokenId -> the agent isn't ERC-8004-registered yet.
        if (active) {
          setIdentity(undefined);
          setReputation(undefined);
          setState("unregistered");
        }
      });
    return () => {
      active = false;
    };
  }, [agentId, account, configured, validId]);

  if (!configured) {
    return (
      <div className="inlineWarning">
        ERC-8004 identity registry is not configured. It defaults to the official Mantle Sepolia registry; set
        NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY to override.
      </div>
    );
  }

  async function register() {
    if (!account) {
      push({ variant: "warning", title: "Connect a wallet", message: "Connect a wallet to register this agent in ERC-8004." });
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const agentURI = `${typeof window !== "undefined" ? window.location.origin : "https://mantle-nine-beta.vercel.app"}/agent/${agentId}`;
      const { txHash: hash } = await registerErc8004FromWallet({
        account,
        identityRegistry: webContracts.erc8004IdentityRegistry,
        agentURI,
      });
      setTxHash(hash);
      push({ variant: "success", title: "Registered in ERC-8004", message: "Official IdentityRegistry minted an agent NFT." });
    } catch (err) {
      const actionable = actionableTxError(err, "register-erc8004");
      setError(actionable.message);
      push({ variant: "error", title: actionable.title, message: actionable.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <a className="btn" href={explorerAddressUrl(webContracts.erc8004IdentityRegistry)} target="_blank" rel="noreferrer">
        <Icon.eye s={16} />
        <span>Official ERC-8004 registry | {short(webContracts.erc8004IdentityRegistry)}</span>
      </a>

      {state === "loading" ? <div className="ptitle-sub">Reading official ERC-8004 identity…</div> : null}

      {state === "registered" && identity ? (
        <div className="form-grid">
          <Metric label="ERC-8004 owner" value={short(identity.owner)} />
          <Metric label="Agent wallet" value={identity.agentWallet ? short(identity.agentWallet) : "—"} />
          <Metric label="tokenURI" value={identity.tokenURI ? short(identity.tokenURI) : "—"} />
          {reputation ? (
            <Metric label="ERC-8004 feedback" value={`${reputation.count} signals`} />
          ) : null}
        </div>
      ) : null}

      {state === "unregistered" ? (
        <>
          <div className="inlineWarning">
            Agent #{agentId} is not registered in the official ERC-8004 IdentityRegistry yet. Interlock can register it as
            a standard Trustless Agent so other ERC-8004 consumers can discover and trust it.
          </div>
          <TxButton
            label="Register in ERC-8004"
            pendingLabel="Registering…"
            icon="shield"
            onClick={register}
            pending={pending}
            disabled={!account || wrongChain}
            title={!account ? "Connect a wallet first" : wrongChain ? "Switch to Mantle Sepolia" : undefined}
          />
          <TxResult
            status={error ? "error" : txHash ? "success" : pending ? "pending" : "idle"}
            explorerUrl={txHash ? `https://sepolia.mantlescan.xyz/tx/${txHash}` : undefined}
            txHash={txHash}
            error={error}
            successLabel="Registered in official ERC-8004"
          />
        </>
      ) : null}
    </div>
  );
}
