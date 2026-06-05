"use client";

import type { IndexerAction } from "../../lib/indexer";
import type { ReasonRow } from "../../lib/dashboard-data";
import { EmptyState } from "./primitives";

/* ============================================================
   ActionPipelineChart — m2 candlestick aesthetic, real actions.
   Each indexed action becomes a candle: ALLOW = green and high,
   BLOCK = red and low, SIMULATION_FAILED = amber and mid.
   ============================================================ */
export function ActionPipelineChart({ actions }: { actions: IndexerAction[] }) {
  const series = actions.slice(0, 30).reverse();
  const W = 760;
  const H = 300;
  const padL = 44;
  const padR = 16;
  const padT = 12;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yTicks = [100, 75, 50, 25, 0];
  const y = (value: number) => padT + ((100 - value) / 100) * plotH;
  const step = series.length ? plotW / series.length : plotW;
  const bw = Math.min(11, step * 0.5);

  const laneFor = (action: IndexerAction) => {
    if (action.decision === "ALLOW") return { mid: 80, color: "#34d39e" };
    if (action.reasonCode === "SIMULATION_FAILED") return { mid: 48, color: "#f59e0b" };
    return { mid: 22, color: "#f06d6d" };
  };

  if (!series.length) {
    return (
      <div className="chart-wrap">
        <EmptyState>No indexed ActionChecked events were returned by the configured contracts/RPC snapshot.</EmptyState>
      </div>
    );
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={W - padR} y1={y(tick)} y2={y(tick)} stroke="#1d1d21" strokeWidth="1" />
            <text x={padL - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#5a5a61" fontFamily="var(--font)">
              {tick}
            </text>
          </g>
        ))}
        <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#242428" />
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#242428" />

        {series.map((action, index) => {
          const lane = laneFor(action);
          const cx = padL + step * index + step / 2;
          const top = y(lane.mid + 9);
          const bottom = y(lane.mid - 9);
          return (
            <g key={action.actionCheckId}>
              <line x1={cx} x2={cx} y1={y(lane.mid + 16)} y2={y(lane.mid - 16)} stroke={lane.color} strokeWidth="1.4" />
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(2, bottom - top)} rx="1.5" fill={lane.color} />
            </g>
          );
        })}

        <text x={padL} y={H - 8} fontSize="11" fill="#7d7d85" fontFamily="var(--font)">
          oldest
        </text>
        <text x={W - padR} y={H - 8} fontSize="11" fill="#7d7d85" textAnchor="end" fontFamily="var(--font)">
          latest
        </text>
      </svg>

      <div className="chart-tip" style={{ left: "8%", top: "10%" }}>
        <div className="d">Decision lanes</div>
        <div className="r">
          <span className="dot" style={{ background: "#34d39e" }} />
          <span>Allowed</span>
          <span className="g">{series.filter((a) => a.decision === "ALLOW").length}</span>
        </div>
        <div className="r" style={{ marginTop: 6 }}>
          <span className="dot" style={{ background: "#f06d6d" }} />
          <span>Blocked</span>
          <span className="g" style={{ color: "#f06d6d" }}>
            {series.filter((a) => a.decision === "BLOCK").length}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ReasonDistribution — m2 distribution panel body.
   Green bar histogram + segmented bar + reason rows.
   ============================================================ */
export function ReasonDistribution({ rows }: { rows: ReasonRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (!total) {
    return (
      <div className="dist-body">
        <EmptyState>No reason-code data yet. Recorded actions will break down here by reason.</EmptyState>
      </div>
    );
  }

  const bars = rows.length >= 4 ? rows.map((row) => row.count) : padBars(rows.map((row) => row.count));
  const barMax = Math.max(1, ...bars);

  return (
    <div className="dist-body">
      <svg viewBox="0 0 320 96" width="100%" height="96" style={{ display: "block" }}>
        {bars.map((value, index) => {
          const barWidth = 320 / bars.length;
          const height = (value / barMax) * 86;
          return (
            <rect
              key={index}
              x={index * barWidth + 1}
              y={92 - height}
              width={barWidth - 2.5}
              height={Math.max(2, height)}
              rx="1.5"
              fill="#22c55e"
              opacity={0.35 + (value / barMax) * 0.6}
            />
          );
        })}
      </svg>

      <div className="seg-bar">
        {rows.map((row) => (
          <i key={row.reason} style={{ background: row.color, width: `${(row.count / total) * 100}%` }} />
        ))}
      </div>

      {rows.map((row) => (
        <div key={row.reason} className="dist-row">
          <span className="bar" style={{ background: row.color }} />
          <span className="nm">{prettyReason(row.reason)}</span>
          <span className="tk">{row.reason}</span>
          <span className="pct">{Math.round((row.count / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function padBars(values: number[]): number[] {
  if (!values.length) return [1, 1, 1, 1];
  const out = [...values];
  let cursor = 0;
  while (out.length < 16) {
    out.push(Math.max(1, Math.round(values[cursor % values.length] * (0.4 + ((cursor * 37) % 60) / 100))));
    cursor += 1;
  }
  return out;
}

function prettyReason(reason: string): string {
  return reason
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
