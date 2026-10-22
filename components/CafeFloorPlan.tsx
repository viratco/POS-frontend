"use client";

import { useState, type KeyboardEvent } from "react";
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

/* ───────────────────────── the café, drawn from the owner's sketch ─────────────────────────
   Units are the sketch's pixels (top view, entrance at the top). Change positions here. */

type Side = "top" | "bottom" | "left" | "right";
type Spot = { n: number; x: number; y: number; w: number; h: number; chairs: Partial<Record<Side, number>> };

const SPOTS: Spot[] = [
  { n: 1, x: 890, y: 290, w: 95, h: 66, chairs: { left: 1, right: 1 } },
  { n: 2, x: 890, y: 432, w: 95, h: 68, chairs: { left: 1, right: 1 } },
  { n: 3, x: 898, y: 553, w: 107, h: 142, chairs: { left: 2, right: 2 } },
  { n: 4, x: 637, y: 430, w: 128, h: 95, chairs: { top: 1, bottom: 1 } },
  { n: 5, x: 432, y: 600, w: 93, h: 92, chairs: { top: 1, bottom: 1 } },
  { n: 6, x: 897, y: 785, w: 106, h: 100, chairs: { top: 2, bottom: 2 } },
  { n: 7, x: 675, y: 835, w: 100, h: 75, chairs: { left: 1, right: 1 } },
  { n: 8, x: 248, y: 768, w: 172, h: 100, chairs: { top: 2, bottom: 2 } },
  { n: 9, x: 318, y: 995, w: 142, h: 110, chairs: { top: 2, bottom: 2 } },
  { n: 10, x: 214, y: 1285, w: 93, h: 83, chairs: { top: 1, right: 1 } },
];

// Crops the open-ended passage on the left; it simply runs off the edge.
const VIEW = { x: 165, y: 185, w: 890, h: 1235 };

// Outline of the floor, clockwise from the passage at the top-left (open on its left end).
const FLOOR = "M95,255 L1035,255 L1035,930 L470,930 L470,1395 L190,1395 L190,730 L400,730 L400,445 L95,445 Z";
const ENTRANCE = { x1: 643, x2: 793, y: 255 };
const ARCH = { x1: 605, x2: 865, y: 730 }; // wide opening between the main hall and the middle room

const WALLS = [
  `M95,255 L${ENTRANCE.x1},255`,
  `M${ENTRANCE.x2},255 L1035,255 L1035,930 L470,930 L470,1395 L190,1395 L190,730 L400,730 L400,445 L95,445`,
  `M400,730 L${ARCH.x1},730`,
  `M${ARCH.x2},730 L1035,730`,
];

const COUNTER = { x: 447, y: 278, w: 150, h: 58 };

// Potted plants in the free corners (cx, cy, radius).
const PLANTS: [number, number, number][] = [
  [428, 472, 17],
  [1008, 905, 14],
  [216, 752, 15],
  [445, 1368, 17],
  [612, 300, 13],
];

/* ───────────────────────── palette (Sohee's: espresso, latte, gold) ───────────────────────── */

const INK = "#2a1a10";
const GOLD = "#c9a46a";
const CREAM = "#fbf3e6";

// State hues keep the same families as the dashboard legend (rose / blue / amber / green).
const LOOK: Record<TableState, { label: string; tone: string; soft: string }> = {
  new_order: { label: "New order", tone: "#d9435a", soft: "#f6c9cf" },
  food_ready: { label: "Food ready", tone: "#2f86c4", soft: "#c4def1" },
  in_kitchen: { label: "In kitchen", tone: "#cf8a14", soft: "#f2dba8" },
  served: { label: "Served", tone: "#2f8a5f", soft: "#bfe3cf" },
  available: { label: "Free", tone: "#b39a76", soft: "#efe2cd" },
};

/** "Table 7" / "table 7" / "T7" / "7" → 7. Anything else (e.g. "Window 1") isn't on the plan. */
function spotNumber(name: string): number | null {
  const m = name.trim().match(/^(?:table\s*|t\s*)?(\d{1,2})$/i);
  return m ? Number(m[1]) : null;
}

/** Bill so far, or "3 new" while a guest's first order still waits for staff (new items aren't billed yet). */
function amountLabel(r: TableRow): string {
  const total = billFor(r.items).total;
  if (total > 0) return formatINR(total);
  const fresh = r.items.filter((i) => i.status === "new").reduce((n, i) => n + i.qty, 0);
  return fresh ? `${fresh} new` : formatINR(0);
}

/* ───────────────────────── component ───────────────────────── */

export default function CafeFloorPlan({ rows, visibleIds, selectedId, onSelectTable, now, ago, onSetupTables }: CafeFloorPlanProps) {
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
      <div className="overflow-hidden rounded-[28px] bg-[#1d130d] shadow-[0_18px_50px_-20px_rgba(42,26,16,0.55)] ring-1 ring-[#3a2a1f]">
        <div className="flex flex-wrap items-end justify-between gap-3 px-6 pt-5 pb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-[#c9a46a] uppercase">Sohee&apos;s Kitchen</p>
            <h3 className="font-poster text-[30px] leading-none text-[#f3e7d5]">Floor plan</h3>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-[#c9a46a]/40 px-3 py-1 text-[#e8d2b0]">{seated.length} seated</span>
            <span className="rounded-full border border-[#c9a46a]/40 px-3 py-1 text-[#e8d2b0]">{free.length} free</span>
          </div>
        </div>

        {missing.length > 0 && onSetupTables && (
          <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#3a2a1f] px-4 py-2.5 text-sm text-[#f3e7d5]">
            <span>
              {missing.join(", ")} {missing.length === 1 ? "is" : "are"} on the plan but not set up yet.
            </span>
            <button
              onClick={setup}
              disabled={settingUp}
              className="rounded-lg bg-[#c9a46a] px-3 py-1.5 text-xs font-bold text-[#2a1a10] transition hover:bg-[#d9b780] disabled:opacity-60"
            >
              {settingUp ? "Setting up…" : `Set up ${missing.length === 1 ? "it" : `all ${missing.length}`}`}
            </button>
          </div>
        )}

        <div className="px-2 pb-3 sm:px-4 sm:pb-5">
          <svg
            viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
            className="mx-auto block h-auto w-full max-w-[920px]"
            role="group"
            aria-label="Café floor plan"
          >
            <PlanDefs />

            {/* floor: oak planks, warm light pools, shade along the walls */}
            <path d={FLOOR} fill="#ecd9bb" />
            <path d={FLOOR} fill="url(#oak)" />
            <g clipPath="url(#floorClip)">
              {SPOTS.map((s) => (
                <ellipse key={s.n} cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w * 1.25 + 40} ry={s.h * 1.25 + 40} fill="url(#lamp)" />
              ))}
              {WALLS.map((d) => (
                <path key={d} d={d} fill="none" stroke="#5a3d26" strokeWidth={34} opacity={0.18} filter="url(#soft)" />
              ))}
            </g>

            {/* walls with a gold inlay */}
            {WALLS.map((d) => (
              <path key={d} d={d} fill="none" stroke={INK} strokeWidth={13} strokeLinecap="square" strokeLinejoin="miter" />
            ))}
            {WALLS.map((d) => (
              <path key={`g${d}`} d={d} fill="none" stroke={GOLD} strokeWidth={1.4} strokeLinecap="square" strokeLinejoin="miter" opacity={0.75} />
            ))}

            <Entrance />

            {/* opening between rooms */}
            <path d={`M${ARCH.x1 + 8},${ARCH.y} L${ARCH.x2 - 8},${ARCH.y}`} stroke="#b89a72" strokeWidth={2} strokeDasharray="2 9" strokeLinecap="round" />

            <Counter />
            {PLANTS.map(([cx, cy, r]) => <Plant key={`${cx},${cy}`} cx={cx} cy={cy} r={r} />)}

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

          {/* key */}
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 px-3 text-[11px] font-semibold text-[#d9c6a0]">
            {(["new_order", "food_ready", "in_kitchen", "served", "available"] as TableState[]).map((st) => (
              <span key={st} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-[#1d130d]" style={{ background: LOOK[st].tone }} />
                {LOOK[st].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Side list: who's seated, who's free ── */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-[24px] border border-[#eadfce] bg-[#fffaf2] p-4 shadow-sm">
          <h3 className="font-poster text-[22px] leading-none text-[#2a1a10]">Seated now</h3>
          {seated.length === 0 ? (
            <p className="mt-3 text-sm text-[#8a7b6b]">No guests seated.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {seated.map((r) => {
                const look = LOOK[r.state];
                return (
                  <li key={r.table.id}>
                    <button
                      onClick={() => onSelectTable(r.table.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[#f5ecdf] ${r.table.id === selectedId ? "bg-[#f3e8d8] ring-1 ring-[#c9a46a]/60" : ""}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: look.tone }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#2a1a10]">{r.table.name}</span>
                        <span className="block text-xs text-[#8a7b6b]">
                          {look.label} · {r.order && now ? ago(r.order.created_at, now) : ""}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-[#2a1a10] tabular-nums">{amountLabel(r)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-[#eadfce] bg-[#fffaf2] p-4 shadow-sm">
          <h3 className="font-poster text-[22px] leading-none text-[#2a1a10]">Free tables</h3>
          {free.length === 0 ? (
            <p className="mt-3 text-sm text-[#8a7b6b]">Every table is taken.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {free.map((r) => (
                <button
                  key={r.table.id}
                  onClick={() => onSelectTable(r.table.id)}
                  className="rounded-full border border-[#e3d5c0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5a4a39] transition hover:border-[#2a1a10] hover:bg-[#2a1a10] hover:text-[#f3e7d5]"
                >
                  {r.table.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {offPlan.length > 0 && (
          <div className="rounded-[24px] border border-dashed border-[#d6c8b2] bg-[#fffdf9] p-4">
            <h3 className="text-sm font-bold text-[#2a1a10]">Not on the floor plan</h3>
            <p className="mt-0.5 text-xs text-[#8a7b6b]">Name a table “Table 1”–“Table 10” to place it.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {offPlan.map((r) => (
                <button
                  key={r.table.id}
                  onClick={() => onSelectTable(r.table.id)}
                  className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a4a39] ring-1 ring-[#e2d7c6] hover:ring-[#2a1a10]/40"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: LOOK[r.state].tone }} />
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

function urgency(s: TableState) {
  return { new_order: 0, food_ready: 1, in_kitchen: 2, served: 3, available: 4 }[s];
}

/* ───────────────────────── shared SVG definitions ───────────────────────── */

function PlanDefs() {
  return (
    <defs>
      {/* oak planks: staggered boards with slightly different tones */}
      <pattern id="oak" width="168" height="56" patternUnits="userSpaceOnUse">
        <rect width="168" height="14" fill="#efdcbf" />
        <rect y="14" width="168" height="14" fill="#e9d4b4" />
        <rect y="28" width="168" height="14" fill="#eddabc" />
        <rect y="42" width="168" height="14" fill="#e6d0ae" />
        <path d="M0 14H168M0 28H168M0 42H168M0 56H168" stroke="#d8bf99" strokeWidth="1" />
        <path d="M56 0V14M140 14V28M28 28V42M112 42V56" stroke="#d3b891" strokeWidth="1" />
        <path d="M8 6h30M90 20h40M40 34h50M120 48h30" stroke="#dcc5a2" strokeWidth="0.8" opacity="0.7" />
      </pattern>
      {/* walnut tabletop grain */}
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a87a4f" />
        <stop offset="0.55" stopColor="#8f633c" />
        <stop offset="1" stopColor="#7a5232" />
      </linearGradient>
      <pattern id="grain" width="40" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 3 Q10 1 20 3 T40 3" fill="none" stroke="#6b4628" strokeWidth="0.8" opacity="0.35" />
        <path d="M0 7 Q12 9 22 7 T40 7" fill="none" stroke="#c49a6c" strokeWidth="0.6" opacity="0.35" />
      </pattern>
      <radialGradient id="lamp">
        <stop offset="0" stopColor="#fff3d9" stopOpacity="0.85" />
        <stop offset="1" stopColor="#fff3d9" stopOpacity="0" />
      </radialGradient>
      <clipPath id="floorClip">
        <path d={FLOOR} />
      </clipPath>
      <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
      <filter id="lift" x="-20%" y="-20%" width="140%" height="170%">
        <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#2a1a10" floodOpacity="0.28" />
      </filter>
    </defs>
  );
}

/* ───────────────────────── fixtures ───────────────────────── */

function Entrance() {
  const { x1, x2, y } = ENTRANCE;
  const mid = (x1 + x2) / 2;
  return (
    <g>
      {/* welcome mat */}
      <rect x={mid - 46} y={y + 10} width={92} height={28} rx={5} fill="#7a5a3c" />
      <rect x={mid - 41} y={y + 14} width={82} height={20} rx={3} fill="none" stroke="#c9a46a" strokeWidth={1} strokeDasharray="3 3" />
      <text x={mid} y={y + 25} dy="0.35em" textAnchor="middle" className="fill-[#e8d2b0] font-poster text-[13px] tracking-[0.18em]">WELCOME</text>
      {/* double doors swinging in */}
      <g stroke={GOLD} strokeWidth={2} fill="none" strokeLinecap="round">
        <path d={`M${x1},${y} L${x1},${y + 72}`} />
        <path d={`M${x2},${y} L${x2},${y + 72}`} />
        <path d={`M${x1},${y + 72} A72,72 0 0 0 ${x1 + 72},${y}`} strokeDasharray="3 6" opacity={0.8} />
        <path d={`M${x2},${y + 72} A72,72 0 0 1 ${x2 - 72},${y}`} strokeDasharray="3 6" opacity={0.8} />
      </g>
      <text x={mid} y={y - 34} textAnchor="middle" className="fill-[#c9a46a] font-poster text-[22px] tracking-[0.3em]">ENTRANCE</text>
      <path d={`M${mid - 8},${y - 22} l8,8 l8,-8`} fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Counter() {
  const { x, y, w, h } = COUNTER;
  return (
    <g>
      <g filter="url(#lift)">
        <rect x={x} y={y} width={w} height={h} rx={12} fill={INK} />
      </g>
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={9} fill="none" stroke={GOLD} strokeWidth={1} opacity={0.6} />
      {/* espresso machine: body + two group heads */}
      <rect x={x + 12} y={y + 11} width={34} height={20} rx={4} fill="#4a3426" stroke={GOLD} strokeWidth={0.8} />
      <circle cx={x + 21} cy={y + 21} r={4} fill="#d9c6a0" />
      <circle cx={x + 37} cy={y + 21} r={4} fill="#d9c6a0" />
      {/* pastry case */}
      <rect x={x + w - 46} y={y + 10} width={34} height={22} rx={4} fill="#f3e7d5" opacity={0.18} stroke="#e8d2b0" strokeWidth={0.8} />
      <circle cx={x + w - 38} cy={y + 21} r={4} fill="#d98a5a" />
      <circle cx={x + w - 28} cy={y + 21} r={4} fill="#e8c27a" />
      <circle cx={x + w - 19} cy={y + 21} r={3.5} fill="#b86b4b" />
      <text x={x + w / 2} y={y + h - 12} textAnchor="middle" className="fill-[#e8d2b0] font-poster text-[17px] tracking-[0.22em]">COUNTER</text>
    </g>
  );
}

function Plant({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const leaves = [0, 51, 103, 154, 206, 257, 309];
  return (
    <g filter="url(#lift)">
      <circle cx={cx} cy={cy} r={r} fill="#8c6a4a" />
      <circle cx={cx} cy={cy} r={r - 3} fill="#5b4330" />
      {leaves.map((a, i) => (
        <ellipse
          key={a}
          cx={cx + Math.cos((a * Math.PI) / 180) * r * 0.55}
          cy={cy + Math.sin((a * Math.PI) / 180) * r * 0.55}
          rx={r * 0.62}
          ry={r * 0.3}
          transform={`rotate(${a} ${cx + Math.cos((a * Math.PI) / 180) * r * 0.55} ${cy + Math.sin((a * Math.PI) / 180) * r * 0.55})`}
          fill={["#5f8a4c", "#4e7a3f", "#6f9a58"][i % 3]}
        />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.22} fill="#7fa864" />
    </g>
  );
}

/* ───────────────────────── one table, top view ───────────────────────── */

const CHAIR = { long: 30, short: 14, gap: 6 };

function chairRects(s: Spot) {
  const out: { x: number; y: number; w: number; h: number; side: Side }[] = [];
  const along = (len: number, count: number, i: number) => (len / (count + 1)) * (i + 1);
  for (const side of ["top", "bottom", "left", "right"] as Side[]) {
    const count = s.chairs[side] ?? 0;
    for (let i = 0; i < count; i++) {
      if (side === "top" || side === "bottom") {
        const cx = s.x + along(s.w, count, i);
        const y = side === "top" ? s.y - CHAIR.gap - CHAIR.short : s.y + s.h + CHAIR.gap;
        out.push({ x: cx - CHAIR.long / 2, y, w: CHAIR.long, h: CHAIR.short, side });
      } else {
        const cy = s.y + along(s.h, count, i);
        const x = side === "left" ? s.x - CHAIR.gap - CHAIR.short : s.x + s.w + CHAIR.gap;
        out.push({ x, y: cy - CHAIR.long / 2, w: CHAIR.short, h: CHAIR.long, side });
      }
    }
  }
  return out;
}

/** A cushioned chair seen from above: seat plus a darker backrest on the side away from the table. */
function Chair({ c, cushion }: { c: ReturnType<typeof chairRects>[number]; cushion: string }) {
  const back = {
    top: { x: c.x, y: c.y, w: c.w, h: 4 },
    bottom: { x: c.x, y: c.y + c.h - 4, w: c.w, h: 4 },
    left: { x: c.x, y: c.y, w: 4, h: c.h },
    right: { x: c.x + c.w - 4, y: c.y, w: 4, h: c.h },
  }[c.side];
  return (
    <g filter="url(#lift)">
      <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={6} fill={cushion} />
      <rect x={back.x} y={back.y} width={back.w} height={back.h} rx={2} fill="#6b4a30" />
    </g>
  );
}

/** Small plates by each seat, so a free table reads as "set and ready". */
function Settings({ s }: { s: Spot }) {
  return (
    <>
      {chairRects(s).map((c, i) => {
        const inset = 13;
        const px = c.side === "left" ? s.x + inset : c.side === "right" ? s.x + s.w - inset : c.x + c.w / 2;
        const py = c.side === "top" ? s.y + inset : c.side === "bottom" ? s.y + s.h - inset : c.y + c.h / 2;
        return (
          <g key={i} opacity={0.9}>
            <circle cx={px} cy={py} r={7.5} fill="#fbf3e6" />
            <circle cx={px} cy={py} r={4.5} fill="none" stroke="#e2cfae" strokeWidth={1} />
          </g>
        );
      })}
    </>
  );
}

function TableShape({
  spot: s, row, dimmed, selected, onSelect, agoText,
}: { spot: Spot; row: TableRow; dimmed: boolean; selected: boolean; onSelect: () => void; agoText: string }) {
  const look = LOOK[row.state];
  const occupied = !!row.order;
  const n = spotNumber(row.table.name);
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const total = occupied ? amountLabel(row) : "";
  const seats = Object.values(s.chairs).reduce((a, b) => a + (b ?? 0), 0);
  const tall = s.h > 80;
  // Cream info card on the tabletop for busy tables.
  const card = { w: Math.min(s.w - 14, 92), h: tall ? 70 : 54 };
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
      style={{ opacity: dimmed ? 0.3 : 1, transition: "opacity 200ms" }}
    >
      {/* generous hit area */}
      <rect x={s.x - 26} y={s.y - 26} width={s.w + 52} height={s.h + 52} rx={18} fill="transparent" />

      {/* status glow on the floor */}
      {occupied && (
        <rect
          x={s.x - 12} y={s.y - 12} width={s.w + 24} height={s.h + 24} rx={22} fill={look.tone}
          opacity={row.state === "new_order" ? 0.55 : 0.38} filter="url(#glow)"
          className={row.state === "new_order" ? "animate-pulse" : ""}
        />
      )}

      {/* selection / keyboard focus: double gold ring */}
      <g className={selected ? "" : "opacity-0 transition-opacity group-focus-visible:opacity-100"}>
        <rect x={s.x - 21} y={s.y - 21} width={s.w + 42} height={s.h + 42} rx={22} fill="none" stroke={INK} strokeWidth={3} />
        <rect x={s.x - 16} y={s.y - 16} width={s.w + 32} height={s.h + 32} rx={18} fill="none" stroke={GOLD} strokeWidth={1.5} />
      </g>

      {chairRects(s).map((c, i) => <Chair key={i} c={c} cushion={occupied ? look.soft : "#f1e4cf"} />)}

      {/* tabletop */}
      <g filter="url(#lift)">
        <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={13} fill="url(#wood)" />
      </g>
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={13} fill="url(#grain)" />
      <rect
        x={s.x + 1.5} y={s.y + 1.5} width={s.w - 3} height={s.h - 3} rx={11.5} fill="none"
        stroke={occupied ? look.tone : "#c9a072"} strokeWidth={occupied ? 3.5 : 1.2}
        className="transition-[stroke-width] duration-150 group-hover:[stroke-width:4.5]"
      />

      {/* phones: the plan is too small for details, so just a big number (details are in the list below) */}
      <g className="sm:hidden">
        <circle cx={cx} cy={cy} r={26} fill={occupied ? CREAM : "#f6ead7"} opacity={0.95} />
        <text x={cx} y={cy} dy="0.36em" textAnchor="middle" className="fill-[#2a1a10] font-poster text-[40px]">{n}</text>
      </g>

      {occupied ? (
        <g className="hidden sm:inline">
          <rect x={cx - card.w / 2} y={cy - card.h / 2} width={card.w} height={card.h} rx={10} fill={CREAM} opacity={0.96} />
          <text x={cx} y={cy - card.h / 2 + (tall ? 25 : 20)} textAnchor="middle" className="fill-[#2a1a10] font-poster text-[24px]">{n}</text>
          <text x={cx} y={cy + (tall ? 10 : 9)} textAnchor="middle" className="fill-[#2a1a10] text-[13px] font-bold">{total}</text>
          <text x={cx} y={cy + card.h / 2 - (tall ? 9 : 6)} textAnchor="middle" className="text-[11px] font-semibold" style={{ fill: look.tone }}>
            {agoText}
          </text>
        </g>
      ) : (
        <g className="hidden sm:inline">
          <Settings s={s} />
          <circle cx={cx} cy={cy} r={tall ? 25 : 21} fill="#f6ead7" opacity={0.93} />
          <text x={cx} y={cy} dy="0.36em" textAnchor="middle" className="fill-[#2a1a10] font-poster text-[30px]">{n}</text>
        </g>
      )}

      {/* status dot */}
      {occupied && <circle cx={s.x + s.w - 3} cy={s.y + 3} r={8} fill={look.tone} stroke={CREAM} strokeWidth={3} />}

    </g>
  );
}

function EmptySpot({ spot: s }: { spot: Spot }) {
  return (
    <g aria-label={`Table ${s.n} is not set up yet`}>
      {chairRects(s).map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={6} fill="none" stroke="#b89a72" strokeWidth={1.5} strokeDasharray="4 4" />
      ))}
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={13} fill="#f3e6d1" fillOpacity={0.5} stroke="#b89a72" strokeWidth={2} strokeDasharray="6 5" />
      <text x={s.x + s.w / 2} y={s.y + s.h / 2} dy="0.1em" textAnchor="middle" className="fill-[#a88a62] font-poster text-[26px]">{s.n}</text>
      <text x={s.x + s.w / 2} y={s.y + s.h / 2 + 20} textAnchor="middle" className="fill-[#a88a62] text-[10px] font-semibold tracking-wider">NOT SET UP</text>
    </g>
  );
}
