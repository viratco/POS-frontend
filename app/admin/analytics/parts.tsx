// Server-safe chart pieces and formatters (no hooks). Shared by the server-rendered
// dashboard and the client charts in charts.tsx.

import type { ReactNode } from "react";

/* Chart palette — café brand hues, validated for colour-blind separation.
   Text never wears these; values and labels stay in stone ink. */
export const C = {
  series: "#2f7d4f", // leaf
  second: "#c4583e", // terracotta
  third: "#d99a1e", // amber (below 3:1 on white: always shipped with a visible label)
  grid: "#ece7df",
  axis: "#d6cfc4",
  // Sequential leaf ramp, light → dark, for magnitude (heatmap)
  ramp: ["#f3f0ea", "#dcebe0", "#b9d8c3", "#8cbf9d", "#5fa276", "#3a8458", "#24613f", "#173f29"],
};

/* ───────────────────────── number formatting ───────────────────────── */

/** ₹ in Indian compact form for axes and tight labels: ₹850, ₹12.4K, ₹3.2L. */
export function inrCompact(paise: number): string {
  const r = paise / 100;
  if (r >= 1e5) return `₹${trim(r / 1e5)}L`;
  if (r >= 1e3) return `₹${trim(r / 1e3)}K`;
  return `₹${Math.round(r)}`;
}
const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

export function minutes(m: number | null): string {
  if (m == null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
}


export const QUADRANTS = {
  star: { title: "Stars", hint: "Popular and premium — keep them prominent." },
  workhorse: { title: "Workhorses", hint: "Popular but cheaper — try a small price rise or a combo." },
  puzzle: { title: "Puzzles", hint: "Premium but rarely ordered — better photo, badge, or staff push." },
  dog: { title: "Slow movers", hint: "Cheap and rarely ordered — rework or drop." },
} as const;

/* ───────────────────────── horizontal bar list ───────────────────────── */

export function BarList({
  rows,
  format,
  color = C.series,
  empty = "Nothing yet",
}: {
  rows: { label: string; value: number; note?: string }[];
  format: (v: number) => string;
  color?: string;
  empty?: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-stone-700" title={r.label}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-stone-100">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold text-stone-900">{format(r.value)}</span>
            {r.note && <span className="ml-1.5 text-xs text-stone-400">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── split bar (parts of a whole) ───────────────────────── */

export function SplitBar({ parts }: { parts: { label: string; value: number; color: string; detail: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <Empty>No paid bills yet</Empty>;
  return (
    <div>
      <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="text-stone-700">{p.label}</span>
            <span className="ml-auto text-stone-400 tabular-nums">{p.detail}</span>
            <span className="w-11 text-right font-semibold text-stone-900 tabular-nums">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── busy-hours heatmap ───────────────────────── */

/* ───────────────────────── misc ───────────────────────── */

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-stone-200 text-sm text-stone-400">{children}</div>;
}
