"use client";

import { Icon, CoinGlyph } from "../icons";
import { SortTh, Switch, Skeleton } from "./primitives";
import type { RecordRow, SortState } from "../../lib/dashboard-data";

/* ============================================================
   RecordsTable — m2 market table. Shared by Dashboard + Recorder.
   ============================================================ */
export function RecordsTable({
  title,
  subtitle,
  rows,
  query,
  setQuery,
  sort,
  setSort,
  trend,
  setTrend,
  loading,
}: {
  title: string;
  subtitle: string;
  rows: RecordRow[];
  query: string;
  setQuery: (query: string) => void;
  sort: SortState;
  setSort: (sort: SortState) => void;
  trend?: string;
  setTrend?: (trend: string) => void;
  loading?: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="title">{title}</div>
          <div className="ptitle-sub">{subtitle}</div>
        </div>
        <div className="market-tools">
          <div className="search">
            <Icon.search s={16} />
            <input placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {setTrend ? (
            <Switch
              checked={trend === "Actions"}
              label={trend === "Actions" ? "Actions only" : "All records"}
              onChange={(checked) => setTrend(checked ? "Actions" : "All")}
            />
          ) : null}
        </div>
      </div>

      <table className="market">
        <thead>
          <tr>
            <SortTh label="#" col="rank" sort={sort} setSort={setSort} />
            <th>Record</th>
            <SortTh label="Type" col="type" sort={sort} setSort={setSort} num />
            <SortTh label="Status" col="status" sort={sort} setSort={setSort} num />
            <th className="num">Evidence</th>
            <th className="num">Link</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td className="rank"><Skeleton w={16} h={12} /></td>
                  <td>
                    <span className="cc">
                      <Skeleton w={28} h={28} radius={8} />
                      <Skeleton w={120} h={12} />
                    </span>
                  </td>
                  <td className="num"><Skeleton w={50} h={12} /></td>
                  <td className="num"><Skeleton w={60} h={12} /></td>
                  <td className="num"><Skeleton w={40} h={12} /></td>
                  <td className="num"><Skeleton w={36} h={12} /></td>
                </tr>
              ))
            : null}
          {!loading && rows.map((row) => {
            const positive = row.status === "ALLOW" || row.status === "ready";
            const neutral = row.status === "REVIEW" || row.status === "inactive";
            return (
              <tr key={`${row.type}-${row.rank}-${row.name}`}>
                <td className="rank">{row.rank}</td>
                <td>
                  <span className="cc">
                    <CoinGlyph sym={row.sym} size={28} />
                    <span className="nm">{row.name}</span>
                    <span className="tk">{row.meta}</span>
                  </span>
                </td>
                <td className="num">{row.type}</td>
                <td className="num">
                  <span className={`chg ${positive ? "up" : neutral ? "flat" : "down"}`}>
                    <span className="box">
                      {positive ? <Icon.arrowUp s={11} /> : neutral ? <Icon.dots s={11} /> : <Icon.arrowDown s={11} />}
                    </span>
                    {row.status}
                  </span>
                  {row.dispute ? (
                    <span className={`dispute-chip ${row.dispute.toLowerCase()}`} title="Dispute window status">
                      {row.dispute === "ACTIVE" ? "● window" : row.dispute === "CHALLENGED" ? "⚑ challenged" : "✓ final"}
                    </span>
                  ) : null}
                </td>
                <td className="num">{row.evidence}</td>
                <td className="num">
                  <a href={row.href} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            );
          })}
          {!loading && !rows.length ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--tx-3)", padding: 32 }}>
                No on-chain records matched the current filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
