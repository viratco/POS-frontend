"use client";

import { useState, type KeyboardEvent } from "react";
import { type FloorPlan, type Side, type Spot, spotNumber } from "@/lib/floorPlan";
import { billFor, formatINR } from "@/lib/money";
import type { Order, OrderItem, Table } from "@/lib/types";

type TableState = "available" | "new_order" | "food_ready" | "in_kitchen" | "served";

interface TableRow {
  table: Table;
  order: Order | null;
  items: OrderItem[];
  state: TableState;
}

interface CafeFloorPlanProps {
  /** This café's room: walls, door, counter and where each table stands. */
  plan: FloorPlan;
  /** Every active table (not just the filtered ones), so the room never has holes. */
  rows: TableRow[];
  /** Tables matching the current filter; the rest are dimmed. Omit to show all. */
  visibleIds?: Set<string>;
  selectedId: string | null;
  onSelectTable: (id: string) => void;
  now: number;
  ago: (iso: string, now: number) => string;
  /** Creates (or re-activates) tables named "Table N" for plan spots with no table yet. */
  onSetupTables?: (names: string[]) => Promise<void>;
}

/* ───────────────────────── state styling ───────────────────────── */

const LOOK: Record<TableState, { label: string; fill: string; edge: string; chair: string; dot: string }> = {
  new_order: { label: "New order", fill: "#ffe4e6", edge: "#e11d48", chair: "#fda4af", dot: "#e11d48" },
  food_ready: { label: "Food ready", fill: "#e0f2fe", edge: "#0284c7", chair: "#7dd3fc", dot: "#0284c7" },
  in_kitchen: { label: "In kitchen", fill: "#fef3c7", edge: "#d97706", chair: "#fcd34d", dot: "#d97706" },
  served: { label: "Served", fill: "#d1fae5", edge: "#059669", chair: "#6ee7b7", dot: "#059669" },
  available: { label: "Free", fill: "#efe3cf", edge: "#b9a586", chair: "#ddd0bb", dot: "#b9a586" },
};

/** Bill so far, or "3 new" while a guest's first order still waits for staff (new items aren't billed yet). */
function amountLabel(r: TableRow): string {
  const total = billFor(r.items).total;
  if (total > 0) return formatINR(total);
  const fresh = r.items.filter((i) => i.status === "new").reduce((n, i) => n + i.qty, 0);
  return fresh ? `${fresh} new` : formatINR(0);
}

/* ───────────────────────── component ───────────────────────── */

export default function CafeFloorPlan({ plan, rows, visibleIds, selectedId, onSelectTable, now, ago, onSetupTables }: CafeFloorPlanProps) {
  const SPOTS = plan.spots;
  const VIEW = plan.view;
  const [settingUp, setSettingUp] = useState(false);
  const byNumber = new Map<number, TableRow>();
  const offPlan: TableRow[] = [];
  for (const r of rows) {
    const n = spotNumber(r.table.name);
    if (n != null && SPOTS.some((s) => s.n === n) && !byNumber.has(n)) byNumber.set(n, r);
    else offPlan.push(r);
  }
  const missing = SPOTS.filter((s) => !byNumber.has(s.n)).map((s) => `Table ${s.n}`);
  const seated = rows.filter((r) => r.order).sort((a, b) => urgency(a.state) - urgency(b.state));
  const free = rows.filter((r) => !r.order);

  async function setup() {
    if (!onSetupTables || !missing.length) return;
    setSettingUp(true);
    try {
      await onSetupTables(missing);
    } finally {
      setSettingUp(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── The room ── */}
      <div className="overflow-hidden rounded-3xl border border-[#e2d7c6] bg-[#f3ece1] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2d7c6] bg-[#fffdf9] px-5 py-3">
          <div>
            <h3 className="text-[15px] font-bold text-[#2a2119]">Floor plan</h3>
            <p className="text-xs text-[#8a7b6b]">Top view · tap a table to open it</p>
          </div>
          <span className="rounded-full bg-[#f0e7d8] px-3 py-1 text-xs font-semibold text-[#5a4a39]">
            {seated.length} seated · {free.length} free
          </span>
        </div>

        {missing.length > 0 && onSetupTables && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
            <span>
              {missing.join(", ")} {missing.length === 1 ? "is" : "are"} on the plan but not set up yet.
            </span>
            <button
              onClick={setup}
              disabled={settingUp}
              className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-amber-50 transition hover:bg-amber-950 disabled:opacity-60"
            >
              {settingUp ? "Setting up…" : `Set up ${missing.length === 1 ? "it" : `all ${missing.length}`}`}
            </button>
          </div>
        )}

        <div>
          <svg
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
            className="mx-auto block h-auto w-full max-w-[920px]"
            role="group"
            aria-label="Café floor plan"
          >
            <defs>
              <pattern id="planks" width="46" height="46" patternUnits="userSpaceOnUse">
                <path d="M0 0H46M0 23H46" stroke="#eadfcd" strokeWidth="1.2" />
                <path d="M14 0V23M37 23V46" stroke="#eadfcd" strokeWidth="1.2" />
              </pattern>
              <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                <path d="M25 0H0V25" fill="none" stroke="#e6dccd" strokeWidth="1" />
              </pattern>
              <filter id="lift" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#2a2119" floodOpacity="0.16" />
              </filter>
            </defs>

            {/* outside + floor */}
            <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#grid)" />
            {plan.floor.map((d) => (
              <g key={d}>
                <path d={d} fill="#fbf6ee" />
                <path d={d} fill="url(#planks)" />
              </g>
            ))}

            {/* walls */}
            {plan.walls.map((d) => (
              <path key={d} d={d} fill="none" stroke="#2a2119" strokeWidth={10} strokeLinecap="square" strokeLinejoin="miter" />
            ))}

            {/* entrance: double door swinging in */}
            {plan.entrance && <Entrance door={plan.entrance} />}

            {/* openings between rooms */}
            {plan.openings?.map((o) => (
              <path key={`${o.x1}-${o.y}`} d={`M${o.x1},${o.y} L${o.x2},${o.y}`} stroke="#d6c8b2" strokeWidth={2} strokeDasharray="6 7" />
            ))}

            {/* area labels, e.g. TERRACE */}
            {plan.labels?.map((l) => (
              <text key={l.text} x={l.x} y={l.y} textAnchor="middle" className="fill-[#b3a28b] text-[16px] font-semibold tracking-[0.25em]">
                {l.text}
              </text>
            ))}

            {/* counter */}
            {plan.counter && (
              <>
                <g filter="url(#lift)">
                  <rect x={plan.counter.x} y={plan.counter.y} width={plan.counter.w} height={plan.counter.h} rx={10} fill="#2a2119" />
                </g>
                <text
                  x={plan.counter.x + plan.counter.w / 2}
                  y={plan.counter.y + plan.counter.h / 2}
                  dy="0.35em"
                  textAnchor="middle"
                  className="fill-[#d9b26f] text-[17px] font-bold tracking-[0.14em]"
                >
                  {plan.counter.label ?? "COUNTER"}
                </text>
              </>
            )}

            {/* tables */}
            {SPOTS.map((s) => {
              const row = byNumber.get(s.n);
              return row ? (
                <TableShape
                  key={s.n}
                  spot={s}
                  row={row}
                  dimmed={!!visibleIds && !visibleIds.has(row.table.id)}
                  selected={row.table.id === selectedId}
                  onSelect={() => onSelectTable(row.table.id)}
                  agoText={row.order && now ? ago(row.order.created_at, now) : ""}
                />
              ) : (
                <EmptySpot key={s.n} spot={s} />
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Side list: who's seated, who's free ── */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-3xl border border-[#e2d7c6] bg-white p-4 shadow-sm">
          <h3 className="text-[15px] font-bold text-[#2a2119]">Seated now</h3>
          {seated.length === 0 ? (
            <p className="mt-2 text-sm text-[#8a7b6b]">No guests seated.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {seated.map((r) => {
                const look = LOOK[r.state];
                return (
                  <li key={r.table.id}>
                    <button
                      onClick={() => onSelectTable(r.table.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f7f1e8] ${r.table.id === selectedId ? "bg-[#f3ebdf] ring-1 ring-[#2a2119]/20" : ""}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: look.dot }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#2a2119]">{r.table.name}</span>
                        <span className="block text-xs text-[#8a7b6b]">
                          {look.label} · {r.order && now ? ago(r.order.created_at, now) : ""}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-[#2a2119] tabular-nums">{amountLabel(r)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-[#e2d7c6] bg-white p-4 shadow-sm">
          <h3 className="text-[15px] font-bold text-[#2a2119]">Free tables</h3>
          {free.length === 0 ? (
            <p className="mt-2 text-sm text-[#8a7b6b]">Every table is taken.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {free.map((r) => (
                <button
                  key={r.table.id}
                  onClick={() => onSelectTable(r.table.id)}
                  className="rounded-lg bg-[#f4eee4] px-2.5 py-1.5 text-xs font-semibold text-[#5a4a39] transition hover:bg-[#2a2119] hover:text-[#f5ebd9]"
                >
                  {r.table.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {offPlan.length > 0 && (
          <div className="rounded-3xl border border-dashed border-[#d6c8b2] bg-[#fffdf9] p-4">
            <h3 className="text-sm font-bold text-[#2a2119]">Not on the floor plan</h3>
            <p className="mt-0.5 text-xs text-[#8a7b6b]">Only tables named “Table 1”, “Table 2”… that have a spot on the plan are drawn.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {offPlan.map((r) => (
                <button
                  key={r.table.id}
                  onClick={() => onSelectTable(r.table.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5a4a39] ring-1 ring-[#e2d7c6] hover:ring-[#2a2119]/40"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: LOOK[r.state].dot }} />
                  {r.table.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Entrance({ door: d }: { door: { x1: number; x2: number; y: number } }) {
  const r = Math.min(75, (d.x2 - d.x1) / 2);
  const mid = (d.x1 + d.x2) / 2;
  return (
    <>
      <g stroke="#8a7b6b" strokeWidth={2} fill="none">
        <path d={`M${d.x1},${d.y} L${d.x1},${d.y + r} A${r},${r} 0 0 0 ${d.x1 + r},${d.y}`} strokeDasharray="4 5" />
        <path d={`M${d.x2},${d.y} L${d.x2},${d.y + r} A${r},${r} 0 0 1 ${d.x2 - r},${d.y}`} strokeDasharray="4 5" />
      </g>
      <text x={mid} y={d.y - 22} textAnchor="middle" className="fill-[#8a7b6b] text-[17px] font-semibold tracking-[0.2em]">
        ENTRANCE
      </text>
      <path d={`M${mid - 9},${d.y - 12} l9,9 l9,-9`} fill="none" stroke="#8a7b6b" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function urgency(s: TableState) {
  return { new_order: 0, food_ready: 1, in_kitchen: 2, served: 3, available: 4 }[s];
}

/* ───────────────────────── one table, top view ───────────────────────── */

const CHAIR = { long: 30, short: 13, gap: 7 };

function chairRects(s: Spot) {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const along = (len: number, count: number, i: number) => (len / (count + 1)) * (i + 1);
  for (const side of ["top", "bottom", "left", "right"] as Side[]) {
    const count = s.chairs[side] ?? 0;
    for (let i = 0; i < count; i++) {
      if (side === "top" || side === "bottom") {
        const cx = s.x + along(s.w, count, i);
        const y = side === "top" ? s.y - CHAIR.gap - CHAIR.short : s.y + s.h + CHAIR.gap;
        out.push({ x: cx - CHAIR.long / 2, y, w: CHAIR.long, h: CHAIR.short });
      } else {
        const cy = s.y + along(s.h, count, i);
        const x = side === "left" ? s.x - CHAIR.gap - CHAIR.short : s.x + s.w + CHAIR.gap;
        out.push({ x, y: cy - CHAIR.long / 2, w: CHAIR.short, h: CHAIR.long });
      }
    }
  }
  return out;
}

function TableShape({
  spot: s, row, dimmed, selected, onSelect, agoText,
}: { spot: Spot; row: TableRow; dimmed: boolean; selected: boolean; onSelect: () => void; agoText: string }) {
  const look = LOOK[row.state];
  const occupied = !!row.order;
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const total = occupied ? amountLabel(row) : "";
  const seats = Object.values(s.chairs).reduce((a, b) => a + (b ?? 0), 0);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${row.table.name}: ${look.label}${occupied ? `, ${total}, seated ${agoText}` : `, ${seats} seats`}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onKey}
      className="group cursor-pointer outline-none"
      style={{ opacity: dimmed ? 0.35 : 1, transition: "opacity 200ms" }}
    >
      {/* generous hit area */}
      <rect x={s.x - 26} y={s.y - 26} width={s.w + 52} height={s.h + 52} rx={18} fill="transparent" />

      {/* attention halo */}
      {row.state === "new_order" && (
        <rect x={s.x - 14} y={s.y - 14} width={s.w + 28} height={s.h + 28} rx={18} fill="none" stroke={look.edge} strokeWidth={4} className="animate-pulse" />
      )}
      {row.state === "food_ready" && (
        <rect x={s.x - 12} y={s.y - 12} width={s.w + 24} height={s.h + 24} rx={16} fill="none" stroke={look.edge} strokeWidth={3} strokeDasharray="8 6" />
      )}

      {/* selection ring + focus ring */}
      <rect
        x={s.x - 20} y={s.y - 20} width={s.w + 40} height={s.h + 40} rx={20} fill="none" stroke="#2a2119" strokeWidth={3}
        className={selected ? "" : "opacity-0 group-focus-visible:opacity-60"}
      />

      {chairRects(s).map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={6} fill={occupied ? look.chair : "#e6dccb"} stroke="#fff" strokeWidth={2} />
      ))}

      <g filter="url(#lift)">
        <rect
          x={s.x} y={s.y} width={s.w} height={s.h} rx={12}
          fill={look.fill} stroke={look.edge} strokeWidth={occupied ? 3.5 : 2}
          className="transition-[stroke-width] duration-150 group-hover:[stroke-width:5]"
        />
      </g>

      {/* Phones: the plan is too small for details, so just a big number (details are in the list below). */}
      <text x={cx} y={cy} dy="0.35em" textAnchor="middle" className="fill-[#2a2119] text-[44px] font-extrabold sm:hidden">{spotNumber(row.table.name)}</text>

      {occupied ? (
        <g className="hidden sm:inline">
          <text x={cx} y={cy - (s.h > 80 ? 22 : 15)} textAnchor="middle" className="fill-[#2a2119] text-[22px] font-extrabold">{spotNumber(row.table.name)}</text>
          <text x={cx} y={cy + (s.h > 80 ? 4 : 5)} textAnchor="middle" className="fill-[#2a2119] text-[14px] font-bold">{total}</text>
          <text x={cx} y={cy + (s.h > 80 ? 24 : 21)} textAnchor="middle" className="fill-[#6d5e50] text-[12px] font-medium">{agoText}</text>
        </g>
      ) : (
        <g className="hidden sm:inline">
          <text x={cx} y={cy} dy="0.1em" textAnchor="middle" className="fill-[#5a4a39] text-[28px] font-extrabold">{spotNumber(row.table.name)}</text>
          <text x={cx} y={cy + 22} textAnchor="middle" className="fill-[#8a7b6b] text-[11px] font-semibold tracking-wider">{seats} SEATS</text>
        </g>
      )}

      {/* status dot */}
      {occupied && <circle cx={s.x + s.w - 2} cy={s.y + 2} r={8} fill={look.dot} stroke="#fff" strokeWidth={3} />}
    </g>
  );
}

function EmptySpot({ spot: s }: { spot: Spot }) {
  return (
    <g aria-label={`Table ${s.n} is not set up yet`}>
      {chairRects(s).map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={6} fill="none" stroke="#cdbfa8" strokeWidth={1.5} strokeDasharray="4 4" />
      ))}
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={12} fill="#faf6ef" stroke="#cdbfa8" strokeWidth={2} strokeDasharray="6 5" />
      <text x={s.x + s.w / 2} y={s.y + s.h / 2} dy="0.1em" textAnchor="middle" className="fill-[#b9a586] text-[24px] font-extrabold">{s.n}</text>
      <text x={s.x + s.w / 2} y={s.y + s.h / 2 + 20} textAnchor="middle" className="fill-[#b9a586] text-[10px] font-semibold tracking-wider">NOT SET UP</text>
    </g>
  );
}
