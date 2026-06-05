"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../icons";
import type { SortState } from "../../lib/dashboard-data";
import type { AiExplanation } from "../../lib/ai-types";
import { useToast } from "./Toast";

/* ------------------------------------------------------------------
   Panel - m2 card with header (title + subtitle + tools slot)
------------------------------------------------------------------ */
export function Panel({
  title,
  subtitle,
  badge,
  tools,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        {badge}
        <div>
          <div className="title">{title}</div>
          {subtitle ? <div className="ptitle-sub">{subtitle}</div> : null}
        </div>
        {tools ? <div className="tools">{tools}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------
   Dropdown - m2 mini-btn with menu
------------------------------------------------------------------ */
export function Dropdown({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon?: IconName;
  options: string[];
  value?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const Lead = icon ? Icon[icon] : null;
  return (
    <div className="dd" ref={ref}>
      <button className="mini-btn" type="button" onClick={() => setOpen((o) => !o)}>
        {Lead ? <Lead s={15} /> : null}
        <span>{value || label}</span>
        <Icon.chevDown s={14} />
      </button>
      {open ? (
        <div className="dd-menu">
          {options.map((option) => (
            <div
              key={option}
              className={`opt${option === value ? " sel" : ""}`}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------
   SortTh - sortable table header cell
------------------------------------------------------------------ */
export function SortTh({
  label,
  col,
  sort,
  setSort,
  num,
}: {
  label: string;
  col: string;
  sort: SortState;
  setSort: (sort: SortState) => void;
  num?: boolean;
}) {
  const active = sort.col === col;
  return (
    <th
      className={`sortable${num ? " num" : ""}`}
      onClick={() => setSort({ col, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
    >
      <span className="th-in">
        {num ? <span style={{ flex: 1 }} /> : null}
        <span style={{ color: active ? "var(--tx-2)" : undefined }}>{label}</span>
        <Icon.sort s={13} style={{ color: active ? "var(--tx-2)" : undefined }} />
      </span>
    </th>
  );
}

/* ------------------------------------------------------------------
   Metric - small label/value box
------------------------------------------------------------------ */
export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/* ------------------------------------------------------------------
   Switch - compact control for read/write toggles and read-only status
------------------------------------------------------------------ */
export function Switch({
  checked,
  disabled,
  readOnly,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  label: ReactNode;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      className={`switch${checked ? " checked" : ""}${readOnly ? " readonly" : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-readonly={readOnly || undefined}
      disabled={disabled}
      onClick={() => {
        if (!disabled && !readOnly && onChange) onChange(!checked);
      }}
    >
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------
   DecisionCard - allow/block result block
------------------------------------------------------------------ */
export function DecisionCard({
  allowed,
  decision,
  reason,
  explanation,
  ai,
  aiLoading,
}: {
  allowed: boolean;
  decision: string;
  reason: string;
  explanation?: string;
  ai?: AiExplanation;
  aiLoading?: boolean;
}) {
  return (
    <div className={`decision-card ${allowed ? "allow" : "block"}`}>
      <strong>{decision}</strong>
      <span>{reason}</span>
      {explanation ? <p>{explanation}</p> : null}
      {aiLoading && !ai ? (
        <div className="ai-explain loading">
          <div className="ai-explain-head">
            <span className="ai-tag"><Icon.bolt s={12} /> AI risk</span>
            <span className="ai-skeleton chip" />
          </div>
          <span className="ai-skeleton line" />
          <span className="ai-skeleton line short" />
        </div>
      ) : null}
      {ai ? (
        <div className={`ai-explain sev-${ai.severity}`}>
          <div className="ai-explain-head">
            <span className="ai-tag"><Icon.bolt s={12} /> AI risk</span>
            <span className="ai-score">{ai.riskScore}/100</span>
            <span className="ai-sev">{ai.severity}</span>
          </div>
          <strong className="ai-headline">{ai.headline}</strong>
          <p className="ai-plain">{ai.plain}</p>
          <p className="ai-reco"><span>Recommendation:</span> {ai.recommendation}</p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------
   CheckPipeline - preflight checks as pass/fail/idle rows
------------------------------------------------------------------ */
export type PipelineCheck = { name: string; sub: string; state: "pass" | "fail" | "idle" };

export function CheckPipeline({ checks }: { checks: PipelineCheck[] }) {
  return (
    <div className="pipeline">
      {checks.map((check) => (
        <div key={check.name} className={`pipe-row ${check.state}`}>
          <span className="pdot">
            {check.state === "pass" ? <Icon.check s={15} /> : check.state === "fail" ? <Icon.x s={15} /> : <Icon.dots s={15} />}
          </span>
          <div>
            <div className="pname">{check.name}</div>
            <div className="psub">{check.sub}</div>
          </div>
          <span className="ptag">
            <span>{check.state === "pass" ? "PASS" : check.state === "fail" ? "FAIL" : "-"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   EmptyState - optional call-to-action button
------------------------------------------------------------------ */
export function EmptyState({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div>{children}</div>
      {actionLabel && onAction ? (
        <button className="btn btn-wallet" type="button" onClick={onAction} style={{ marginTop: 12 }}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------
   TxButton - primary on-chain write button with pending/disabled state
------------------------------------------------------------------ */
export function TxButton({
  label,
  pendingLabel,
  onClick,
  pending,
  disabled,
  icon,
  className,
  title,
}: {
  label: string;
  pendingLabel?: string;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  icon?: IconName;
  className?: string;
  title?: string;
}) {
  const Lead = icon ? Icon[icon] : null;
  return (
    <button
      type="button"
      className={`btn btn-wallet${pending ? " is-loading" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={pending || disabled}
      title={title}
    >
      {Lead ? <Lead s={16} /> : null}
      <span>{pending ? pendingLabel ?? "Confirming..." : label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------
   TxResult - success (tx hash + explorer) or error feedback
------------------------------------------------------------------ */
export function TxResult({
  status,
  explorerUrl,
  txHash,
  error,
  successLabel,
}: {
  status: "idle" | "pending" | "success" | "error";
  explorerUrl?: string;
  txHash?: string;
  error?: string;
  successLabel?: string;
}) {
  if (status === "success" && explorerUrl) {
    return (
      <a className="tx-result ok" href={explorerUrl} target="_blank" rel="noreferrer">
        <Icon.check s={15} />
        <span>{successLabel ?? "Confirmed on-chain"}</span>
        <code>{txHash ? `${txHash.slice(0, 8)}...${txHash.slice(-6)}` : "view"}</code>
      </a>
    );
  }
  if (status === "error" && error) {
    return <div className="error-box">{error}</div>;
  }
  if (status === "pending") {
    return (
      <div className="tx-result pending">
        <Icon.refresh s={15} />
        <span>Waiting for on-chain confirmation...</span>
      </div>
    );
  }
  return null;
}

/* ------------------------------------------------------------------
   Skeleton - shimmer placeholder while async data loads
------------------------------------------------------------------ */
export function Skeleton({ w, h = 12, radius = 6 }: { w?: number | string; h?: number; radius?: number }) {
  return <span className="skeleton" style={{ width: w ?? "100%", height: h, borderRadius: radius }} />;
}

/** 4 stat-card placeholders matching the StatCards grid (no layout shift). */
export function StatCardsSkeleton() {
  return (
    <div className="stat-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="stat-card">
          <div className="stat-head">
            <Skeleton w={26} h={26} radius={8} />
            <Skeleton w={90} h={11} />
          </div>
          <div className="stat-body">
            <Skeleton w={70} h={22} />
            <div style={{ marginTop: 12 }}>
              <Skeleton w="55%" h={10} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** N table-row placeholders for RecordsTable / charts panels. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton w={28} h={28} radius={8} />
          <Skeleton w="40%" h={12} />
          <Skeleton w="18%" h={12} />
          <Skeleton w="14%" h={12} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   CopyButton - copy text to clipboard with a transient "Copied" tick
------------------------------------------------------------------ */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { push } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      push({ variant: "success", title: "Copied", message: `${label} copied to clipboard.` });
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setCopied(false);
      push({
        variant: "warning",
        title: "Clipboard unavailable",
        message: error instanceof Error ? error.message : "Browser blocked clipboard access. Select and copy manually.",
      });
    }
  }
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={copied ? "Copied" : label}>
      {copied ? <Icon.check s={13} /> : <Icon.code s={13} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
