/* ============================================================
   Icons — Lucide-style monoline set + brand logo + glyph badge
   Ported 1:1 from the m2 (CR3PTOMK) reference, typed for React.
   ============================================================ */
import type { ReactNode, SVGProps } from "react";

type IconProps = { s?: number; sw?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, "ref">;

const Svg = ({ s = 18, sw = 1.7, children, ...rest }: IconProps & { children: ReactNode }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

export const Icon = {
  grid: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  calendar: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </Svg>
  ),
  pie: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 12A9 9 0 1 1 12 3v9z" />
      <path d="M12 3a9 9 0 0 1 9 9h-9z" />
    </Svg>
  ),
  exchange: (p: IconProps) => (
    <Svg {...p}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 6h18" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 18H3" />
    </Svg>
  ),
  gift: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="8.5" width="18" height="4" rx="1" />
      <path d="M5 12.5V21h14v-8.5M12 8.5V21" />
      <path d="M12 8.5C12 6 10.5 4 8.5 4S5 5 5 6.5 6.5 8.5 8.5 8.5H12zM12 8.5c0-2.5 1.5-4.5 3.5-4.5S19 5 19 6.5 17.5 8.5 15.5 8.5H12z" />
    </Svg>
  ),
  market: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  watchlist: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 9h2M8 13h2M8 17h2M13.5 8l1.5 1.5L18 6" />
    </Svg>
  ),
  card: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19M6 14.5h4" />
    </Svg>
  ),
  staking: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M18.5 4.2a6 6 0 0 1 0 9.6" />
    </Svg>
  ),
  settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 .9-1.4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.9z" />
    </Svg>
  ),
  help: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7.5 8a4.5 4.5 0 0 1 9 0c0 1.8-1.2 2.5-2.5 3.3-1 .6-1.5 1.2-1.5 2.2" />
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2" />
      <circle cx="12.5" cy="17.5" r="0.4" fill="currentColor" />
    </Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Svg>
  ),
  panel: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M14 4v16" />
    </Svg>
  ),
  wallet: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5" />
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M16 12.5h3" />
      <circle cx="16.5" cy="12.5" r="0.4" fill="currentColor" />
    </Svg>
  ),
  sun: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </Svg>
  ),
  filter: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Svg>
  ),
  trending: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M17 8h4v4" />
    </Svg>
  ),
  chevDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  refresh: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </Svg>
  ),
  eye: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  dots: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  ),
  candle: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 3v3M7 16v5" />
      <rect x="5" y="6" width="4" height="10" rx="1" />
      <rect x="15" y="9" width="4" height="8" rx="1" />
      <path d="M17 3v6M17 17v4" />
    </Svg>
  ),
  sort: (p: IconProps) => (
    <Svg s={14} {...p}>
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </Svg>
  ),
  arrowUp: (p: IconProps) => (
    <Svg s={13} {...p}>
      <path d="M7 17L17 7M7 7h10v10" />
    </Svg>
  ),
  arrowDown: (p: IconProps) => (
    <Svg s={13} {...p}>
      <path d="M7 7l10 10M17 7v10H7" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 6.5" />
    </Svg>
  ),
  x: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  bolt: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </Svg>
  ),
  code: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
    </Svg>
  ),
  scale: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v18M7 21h10" />
      <path d="M6 7l-3 6a3 3 0 0 0 6 0L6 7zM18 7l-3 6a3 3 0 0 0 6 0l-3-6zM4 7h16" />
    </Svg>
  ),
  handCoins: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="16" cy="6" r="3" />
      <path d="M3 14l3-1 6 2 5-2a1.5 1.5 0 0 1 1.5 2.5L13 19l-5-1-5 1" />
      <path d="M3 14v6" />
    </Svg>
  ),
  profit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 3 3 5-6" />
      <path d="M18 8h2v2" />
    </Svg>
  ),
  coins: (p: IconProps) => (
    <Svg {...p}>
      <ellipse cx="9" cy="6.5" rx="5.5" ry="2.5" />
      <path d="M3.5 6.5v5c0 1.4 2.5 2.5 5.5 2.5" />
      <path d="M3.5 11.5v5c0 1.4 2.5 2.5 5.5 2.5" />
      <ellipse cx="15" cy="13" rx="5.5" ry="2.5" />
      <path d="M9.5 13v5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-5" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="aoLogo" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#34d39e" />
          <stop offset=".4" stopColor="#3b82f6" />
          <stop offset=".7" stopColor="#a855f7" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M26 16a10 10 0 1 1-3.5-7.6" stroke="url(#aoLogo)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M22 16a6 6 0 1 1-2-4.5" stroke="url(#aoLogo)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="16" cy="16" r="2.4" fill="url(#aoLogo)" />
    </svg>
  );
}

/** Glyph badge used in record/agent/policy rows (replaces m2 coin glyphs). */
export function CoinGlyph({ sym, size = 30 }: { sym: string; size?: number }) {
  const map: Record<string, string> = {
    OK: "#34d39e",
    BLK: "#f06d6d",
    AG: "#3b82f6",
    PL: "#a855f7",
    M: "#f59e0b",
    REV: "#f59e0b",
  };
  const bg = map[sym] ?? "#3f3f46";
  return (
    <span
      className="coin-badge"
      style={{ background: bg, width: size, height: size, flex: `0 0 ${size}px`, fontSize: size * 0.42 }}
    >
      {sym.slice(0, 2)}
    </span>
  );
}
