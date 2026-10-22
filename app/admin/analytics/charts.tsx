"use client";

import { useRef, useState, type ReactNode } from "react";
import { C, Empty, inrCompact, QUADRANTS } from "./parts";

/** Clean axis ticks: 0 and about `count` round steps covering `max`. */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/* ───────────────────────── tooltip ───────────────────────── */

type Tip = { x: number; y: number; w: number; content: ReactNode } | null;

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.PointerEvent | React.FocusEvent, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    const target = (e.currentTarget as Element).getBoundingClientRect();
    if (!box) return;
    const x = "clientX" in e ? e.clientX : target.left + target.width / 2;
    const y = "clientY" in e ? e.clientY : target.top;
    setTip({ x: x - box.left, y: y - box.top, w: box.width, content });
  };
  const layer = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl bg-stone-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg"
      // Keep the bubble inside the card horizontally.
      style={{ left: Math.max(70, Math.min(tip.x, tip.w - 70)), top: tip.y }}
    >
      {tip.content}
    </div>
  );
  return { ref, show, hide: () => setTip(null), layer };
}

const TipRow = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-4">
    <span className="text-stone-400">{k}</span>
    <span className="font-semibold tabular-nums">{v}</span>
  </div>
);

/* ───────────────────────── columns (time series) ───────────────────────── */

export function Columns({
  data,
  valueLabel = "Net sales",
  height = 220,
}: {
  data: { key: string | number; label: string; value: number; sub?: string }[];
  valueLabel?: string;
  height?: number;
}) {
  const { ref, show, hide, layer } = useTip();
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const peak = data.reduce((best, d) => (d.value > (best?.value ?? 0) ? d : best), null as (typeof data)[number] | null);
  const labelEvery = Math.ceil(data.length / 8);

  if (asTable) {
    return (
      <div>
        <ToggleTable on={asTable} set={setAsTable} />
        <div className="max-h-64 overflow-auto rounded-xl ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-b border-stone-100 last:border-0">
                  <td className="px-3 py-2 text-stone-500">{d.label}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{inrCompact(d.value)}</td>
                  <td className="px-3 py-2 text-right text-stone-400 tabular-nums">{d.sub}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ToggleTable on={asTable} set={setAsTable} />
      <div ref={ref} className="relative flex" onPointerLeave={hide}>
        {/* y axis */}
        <div className="relative w-12 shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute right-2 -translate-y-1/2 text-[11px] text-stone-400 tabular-nums" style={{ bottom: `${(t / top) * 100}%` }}>
              {inrCompact(t)}
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px" style={{ bottom: `${(t / top) * 100}%`, background: t === 0 ? C.axis : C.grid }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {data.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  aria-label={`${d.label}: ${inrCompact(d.value)}`}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  onPointerMove={(e) => show(e, <><div className="mb-1 font-semibold">{d.label}</div><TipRow k={valueLabel} v={inrCompact(d.value)} />{d.sub && <TipRow k="Bills" v={d.sub} />}</>)}
                  onFocus={(e) => show(e, <><div className="mb-1 font-semibold">{d.label}</div><TipRow k={valueLabel} v={inrCompact(d.value)} /></>)}
                  onBlur={hide}
                >
                  <span className="absolute inset-0 rounded-md transition group-hover:bg-stone-900/[0.04] group-focus-visible:bg-stone-900/[0.06]" />
                  <span
                    className="relative w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{ height: `${(d.value / top) * 100}%`, background: C.series, minHeight: d.value > 0 ? 2 : 0 }}
                  />
                  {peak && d.key === peak.key && d.value > 0 && (
                    <span className="absolute text-[11px] font-semibold text-stone-700 tabular-nums" style={{ bottom: `calc(${(d.value / top) * 100}% + 4px)` }}>
                      {inrCompact(d.value)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex h-4 gap-[2px]">
            {data.map((d, i) => (
              <div key={d.key} className="relative flex-1">
                {i % labelEvery === 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-stone-400">{d.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        {layer}
      </div>
    </div>
  );
}

function ToggleTable({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="-mt-9 mb-3 flex justify-end">
      <button type="button" onClick={() => set(!on)} className="rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800">
        {on ? "Show chart" : "Show table"}
      </button>
    </div>
  );
}


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;

export function Heatmap({ counts, max }: { counts: number[][]; max: number }) {
  const { ref, show, hide, layer } = useTip();
  // Show only the hours the café actually trades (with one hour of padding), default 10am–11pm.
  const used = counts[0].map((_, h) => counts.some((row) => row[h] > 0));
  let first = used.indexOf(true);
  let last = used.lastIndexOf(true);
  if (first === -1) [first, last] = [10, 22];
  first = Math.max(0, first - 1);
  last = Math.min(23, last + 1);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const shade = (n: number) => (n === 0 ? C.ramp[0] : C.ramp[Math.min(C.ramp.length - 1, 1 + Math.floor((n / (max || 1)) * (C.ramp.length - 2)))]);

  return (
    <div ref={ref} className="relative" onPointerLeave={hide}>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }}>
          <div />
          {hours.map((h) => (
            <div key={h} className="pb-1 text-center text-[11px] text-stone-400">{h % 2 === first % 2 ? hourLabel(h) : ""}</div>
          ))}
          {counts.map((row, d) => (
            <div key={d} className="contents">
              <div className="flex items-center text-xs font-medium text-stone-500">{DAYS[d]}</div>
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`${DAYS[d]} ${hourLabel(h)}: ${row[h]} bills`}
                  className="aspect-[1.6] rounded-[4px] outline-none transition hover:ring-2 hover:ring-stone-900/30 focus-visible:ring-2 focus-visible:ring-stone-900/50"
                  style={{ background: shade(row[h]) }}
                  onPointerMove={(e) => show(e, <><div className="font-semibold">{DAYS[d]}, {hourLabel(h)}–{hourLabel((h + 1) % 24)}</div><TipRow k="Bills started" v={String(row[h])} /></>)}
                  onFocus={(e) => show(e, <TipRow k={`${DAYS[d]} ${hourLabel(h)}`} v={`${row[h]} bills`} />)}
                  onBlur={hide}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-stone-400">
        Fewer
        {C.ramp.slice(1).map((c) => <span key={c} className="h-2.5 w-5 rounded-[3px]" style={{ background: c }} />)}
        More
      </div>
      {layer}
    </div>
  );
}

/* ───────────────────────── menu matrix (popularity × price) ───────────────────────── */

export function MenuMatrix({
  points,
  cuts,
}: {
  points: { name: string; qty: number; price: number; quadrant: keyof typeof QUADRANTS }[];
  cuts: { qty: number; price: number };
}) {
  const { ref, show, hide, layer } = useTip();
  if (points.length < 4) return <Empty>Needs at least 4 dishes sold in this period</Empty>;

  const W = 640, H = 360, P = { l: 52, r: 16, t: 16, b: 36 };
  const maxQ = Math.max(...points.map((p) => p.qty)) * 1.08;
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices) * 0.9, maxP = Math.max(...prices) * 1.06;
  const x = (q: number) => P.l + (q / maxQ) * (W - P.l - P.r);
  const y = (p: number) => H - P.b - ((p - minP) / (maxP - minP || 1)) * (H - P.t - P.b);
  const labelled = new Set([...points].sort((a, b) => b.qty - a.qty).slice(0, 4).map((p) => p.name));
  const yStep = niceTicks(maxP - minP, 4)[1] ?? maxP;
  const yTicks: number[] = [];
  for (let t = Math.ceil(minP / yStep) * yStep; t <= maxP; t += yStep) yTicks.push(t);
  const xTicks = niceTicks(maxQ).filter((t) => t <= maxQ);

  return (
    <div ref={ref} className="relative" onPointerLeave={hide}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Menu matrix: dishes by number sold and price">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={P.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-stone-400 text-[11px]">{inrCompact(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - P.b + 18} textAnchor="middle" className="fill-stone-400 text-[11px]">{t}</text>
        ))}
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke={C.axis} />
        {/* quadrant dividers at the medians */}
        <line x1={x(cuts.qty)} x2={x(cuts.qty)} y1={P.t} y2={H - P.b} stroke="#a8a29e" strokeDasharray="0" strokeWidth={1} opacity={0.6} />
        <line x1={P.l} x2={W - P.r} y1={y(cuts.price)} y2={y(cuts.price)} stroke="#a8a29e" strokeWidth={1} opacity={0.6} />
        <text x={W - P.r - 6} y={P.t + 12} textAnchor="end" className="fill-stone-500 text-[12px] font-semibold" paintOrder="stroke" stroke="#fff" strokeWidth={4}>★ Stars</text>
        <text x={P.l + 6} y={P.t + 12} className="fill-stone-500 text-[12px] font-semibold" paintOrder="stroke" stroke="#fff" strokeWidth={4}>Puzzles</text>
        <text x={W - P.r - 6} y={H - P.b - 8} textAnchor="end" className="fill-stone-500 text-[12px] font-semibold" paintOrder="stroke" stroke="#fff" strokeWidth={4}>Workhorses</text>
        <text x={P.l + 6} y={H - P.b - 8} className="fill-stone-500 text-[12px] font-semibold" paintOrder="stroke" stroke="#fff" strokeWidth={4}>Slow movers</text>
        <text x={(P.l + W - P.r) / 2} y={H - 4} textAnchor="middle" className="fill-stone-400 text-[11px]">Number sold →</text>
        {points.map((p) => (
          <g
            key={p.name}
            tabIndex={0}
            className="cursor-default outline-none"
            onPointerMove={(e) => show(e, <><div className="mb-1 font-semibold">{p.name}</div><TipRow k="Sold" v={String(p.qty)} /><TipRow k="Price" v={inrCompact(p.price)} /><TipRow k="Group" v={QUADRANTS[p.quadrant].title} /></>)}
            onFocus={(e) => show(e, <TipRow k={p.name} v={`${p.qty} sold`} />)}
            onBlur={hide}
          >
            <circle cx={x(p.qty)} cy={y(p.price)} r={12} fill="transparent" />
            <circle cx={x(p.qty)} cy={y(p.price)} r={5.5} fill={C.series} stroke="#fff" strokeWidth={2} />
            {labelled.has(p.name) && (
              <text x={x(p.qty)} y={y(p.price) - 10} textAnchor="middle" className="fill-stone-700 text-[11px] font-medium" paintOrder="stroke" stroke="#fff" strokeWidth={3}>
                {p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name}
              </text>
            )}
          </g>
        ))}
      </svg>
      {layer}
    </div>
  );
}
