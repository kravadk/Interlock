"use client";

import { useCallback, useMemo, useState } from "react";
import { isAddress, parseEther, type Address, type Hex } from "viem";
import type { MantleEcosystemPolicyPack } from "@interlock/firewall-sdk";
import { Panel, TxButton, TxResult } from "./primitives";
import { Icon } from "../icons";
import { useWriteAction } from "../hooks/useWriteAction";
import { createPolicyFromWallet } from "../../lib/wallet";
import { webContracts } from "../../lib/contracts";
import { aiEnabled, synthesizePolicy, type AiPolicyDraft } from "../../lib/ai";
import { buildCapabilitySummary } from "../../lib/capabilities";

/**
 * In-UI policy creation. Replaces the CLI-only `policy-create` / `policy-create-preset`.
 * A pack template can pre-fill selectors + limits with one click.
 */
export function CreatePolicyForm({
  account,
  wrongChain,
  agentId,
  packs,
  onCreated,
}: {
  account?: Address;
  wrongChain?: boolean;
  agentId: string;
  packs: MantleEcosystemPolicyPack[];
  onCreated: (policyId: string) => void;
}) {
  const [policyAgentId, setPolicyAgentId] = useState(agentId);
  const [maxNativeValue, setMaxNativeValue] = useState("0.01");
  const [maxSlippageBps, setMaxSlippageBps] = useState(100);
  const [targetsText, setTargetsText] = useState("");
  const [selectorsText, setSelectorsText] = useState("");
  const [formError, setFormError] = useState("");

  const [nlIntent, setNlIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<AiPolicyDraft>();
  const [draftError, setDraftError] = useState("");

  const targets = useMemo(() => splitList(targetsText), [targetsText]);
  const selectors = useMemo(() => splitList(selectorsText), [selectorsText]);

  async function draftWithAi() {
    setDraftError("");
    if (!nlIntent.trim()) {
      setDraftError("Describe what the agent should be allowed to do.");
      return;
    }
    setDrafting(true);
    try {
      const result = await synthesizePolicy({
        intent: nlIntent,
        packs: packs.map((pack) => ({
          id: pack.id,
          name: pack.name,
          selectors: pack.supportedSelectors.map((s) => ({ selector: s.selector, label: s.label })),
          maxNativeValue: pack.maxNativeValue,
          maxSlippageBps: pack.maxSlippageBps,
        })),
      });
      if (!result.ok) {
        setDraftError(result.reason);
        return;
      }
      const d = result.data;
      setDraft(d);
      const numeric = d.maxNativeValue.match(/[\d.]+/)?.[0];
      if (numeric) setMaxNativeValue(numeric);
      setMaxSlippageBps(d.maxSlippageBps);
      setTargetsText(d.targets.join(", "));
      setSelectorsText(d.selectors.join(", "));
      setFormError("");
    } finally {
      setDrafting(false);
    }
  }

  function applyPack(pack: MantleEcosystemPolicyPack) {
    setSelectorsText(pack.supportedSelectors.map((s) => s.selector).join(", "));
    const numeric = pack.maxNativeValue.match(/[\d.]+/)?.[0];
    if (numeric) setMaxNativeValue(numeric);
    setMaxSlippageBps(pack.maxSlippageBps);
    setFormError("");
  }

  const runner = useCallback(() => {
    return createPolicyFromWallet({
      account: account as Address,
      policyRegistry: webContracts.policyRegistry,
      agentId: BigInt(policyAgentId),
      maxNativeValue: parseEther(maxNativeValue || "0"),
      maxSlippageBps,
      targets: targets as Address[],
      selectors: selectors as Hex[],
    });
  }, [account, policyAgentId, maxNativeValue, maxSlippageBps, targets, selectors]);

  const { state, run, isPending } = useWriteAction(runner, (result) => {
    if (result.policyId !== undefined) onCreated(result.policyId.toString());
  });

  function validateAndRun() {
    setFormError("");
    if (!policyAgentId.match(/^[1-9]\d*$/)) return setFormError("Agent id must be a positive integer.");
    if (maxSlippageBps < 0 || maxSlippageBps > 10_000) return setFormError("Slippage must be 0–10000 bps.");
    const badTarget = targets.find((t) => !isAddress(t));
    if (badTarget) return setFormError(`Invalid target address: ${badTarget}`);
    const badSelector = selectors.find((s) => !/^0x[0-9a-fA-F]{8}$/.test(s));
    if (badSelector) return setFormError(`Invalid selector (need 0x + 8 hex): ${badSelector}`);
    void run();
  }

  const disabledReason = !account
    ? "Connect a wallet to create a policy."
    : wrongChain
      ? "Switch to Mantle Sepolia to create a policy."
      : undefined;

  return (
    <Panel title="Create Policy" subtitle="Define guardrails for an agent. Start from a pack or fill in manually.">
      {aiEnabled() ? (
        <div className="ai-draft">
          <label className="ai-draft-label">
            <span className="ai-tag"><Icon.bolt s={12} /> Describe in plain English</span>
            <textarea
              value={nlIntent}
              onChange={(event) => setNlIntent(event.target.value)}
              placeholder="e.g. Let it swap on Merchant Moe up to 2 MNT with 1% max slippage"
              rows={2}
            />
          </label>
          <button type="button" className="mini-btn" onClick={draftWithAi} disabled={drafting}>
            <Icon.bolt s={15} />
            <span>{drafting ? "Drafting…" : "Draft with AI"}</span>
          </button>
          {draftError ? <div className="form-hint">{draftError}</div> : null}
          {draft ? (
            <div className="ai-draft-note">
              <p>{draft.rationale}</p>
              {draft.assumptions.length ? (
                <ul>
                  {draft.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}
              <span className="form-hint">Review the fields below, then create the policy.</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="preset-row">
        {packs.slice(0, 4).map((pack) => (
          <button key={pack.id} type="button" className="mini-btn" onClick={() => applyPack(pack)}>
            <Icon.shield s={15} />
            <span>{pack.name}</span>
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label>
          Agent ID
          <input value={policyAgentId} onChange={(event) => setPolicyAgentId(event.target.value)} />
        </label>
        <label>
          Max value (MNT)
          <input value={maxNativeValue} onChange={(event) => setMaxNativeValue(event.target.value)} />
        </label>
        <label>
          Max slippage (bps)
          <input
            type="number"
            value={maxSlippageBps}
            onChange={(event) => setMaxSlippageBps(Number(event.target.value))}
          />
        </label>
        <label className="wide-input">
          Allowed targets (comma-separated addresses)
          <input
            value={targetsText}
            onChange={(event) => setTargetsText(event.target.value)}
            placeholder="0xabc…, 0xdef…"
          />
        </label>
        <label className="wide-input">
          Allowed selectors (comma-separated 0x + 8 hex)
          <input
            value={selectorsText}
            onChange={(event) => setSelectorsText(event.target.value)}
            placeholder="0x2de5aaf7, 0x…"
          />
        </label>
      </div>
      <CapabilityPreview
        targetsText={targetsText}
        selectorsText={selectorsText}
        maxNativeValue={maxNativeValue}
        maxSlippageBps={maxSlippageBps}
      />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
        <TxButton
          label="Create policy"
          pendingLabel="Creating…"
          icon="pie"
          onClick={validateAndRun}
          pending={isPending}
          disabled={Boolean(disabledReason)}
        />
        {disabledReason ? <span className="form-hint">{disabledReason}</span> : null}
        {formError ? <div className="error-box">{formError}</div> : null}
        <TxResult
          status={state.status}
          explorerUrl={state.explorerUrl}
          txHash={state.txHash}
          error={state.error}
          successLabel="Policy created"
        />
      </div>
    </Panel>
  );
}

function CapabilityPreview({
  targetsText,
  selectorsText,
  maxNativeValue,
  maxSlippageBps,
}: {
  targetsText: string;
  selectorsText: string;
  maxNativeValue: string;
  maxSlippageBps: number;
}) {
  const summary = useMemo(
    () =>
      buildCapabilitySummary({
        targets: splitList(targetsText),
        selectors: splitList(selectorsText),
        maxNativeValue: maxNativeValue || "0",
        maxSlippageBps: Number.isFinite(maxSlippageBps) ? maxSlippageBps : 0,
      }),
    [targetsText, selectorsText, maxNativeValue, maxSlippageBps],
  );

  return (
    <div style={{ padding: "0 16px 16px", display: "grid", gap: 8 }}>
      <span className="eyebrow">Capabilities (preview)</span>
      <div className="form-grid">
        <div>
          <strong style={{ color: "var(--accent, #7fd1b9)" }}>Agent can</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {summary.can.length > 0 ? (
              summary.can.map((line) => <li key={line}>{line}</li>)
            ) : (
              <li>nothing yet — add targets and selectors</li>
            )}
          </ul>
        </div>
        <div>
          <strong style={{ color: "var(--danger, #e08f8f)" }}>Agent cannot</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {summary.cannot.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      {summary.approveWarning ? <div className="error-box">⚠ {summary.approveWarning}</div> : null}
    </div>
  );
}

function splitList(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
