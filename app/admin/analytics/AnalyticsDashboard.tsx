import Link from "next/link";
import type { ReactNode } from "react";
import StaffNav from "@/components/StaffNav";
import { RANGES, SLOW_ACCEPT_MINUTES, type Analytics, type Kpi, type RangeKey } from "@/lib/analytics";
import { formatINR } from "@/lib/money";
import { Columns, Heatmap, MenuMatrix } from "./charts";
import { BarList, C, Empty, inrCompact, minutes, QUADRANTS, SplitBar } from "./parts";
import RefreshButton from "./RefreshButton";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hour12 = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function istClock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function AnalyticsSkeleton() {
  return (
    <div className="min-h-screen bg-[#f7f4ef]">
      <StaffNav />
      <main className="mx-auto max-w-7xl animate-pulse px-4 pt-8 pb-20 sm:px-6" aria-busy="true" aria-label="Loading analytics">
        <div className="h-4 w-28 rounded bg-stone-200" />
        <div className="mt-3 h-9 w-48 rounded-lg bg-stone-200" />
        <div className="mt-8 h-16 rounded-2xl bg-stone-300/60" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-white" />)}
        </div>
        <div className="mt-3 h-72 rounded-2xl bg-white" />
      </main>
    </div>
  );
}

export default function AnalyticsDashboard({ a, range, updatedAt, demo = false }: { a: Analytics; range: RangeKey; updatedAt: string; demo?: boolean }) {
  const meta = RANGES.find((r) => r.key === range)!;
  const base = demo ? "/dev/analytics-preview" : "/admin/analytics";

  return (
    <div className="min-h-screen bg-[#f7f4ef]">
      <StaffNav />
      <main className="mx-auto max-w-7xl px-4 pt-8 pb-20 sm:px-6">
        {demo && (
          <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Preview with made-up demo data — this page only exists on a development machine.
          </div>
        )}

        {/* Header + range filter */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-stone-400 uppercase">Sohee&apos;s Kitchen</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-stone-900">Analytics</h1>
            <p className="mt-1.5 text-sm text-stone-500">
              Paid bills · net of GST · {meta.compare} · updated {updatedAt}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-stone-200/70" aria-label="Date range">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`${base}?range=${r.key}`}
                  prefetch={false}
                  aria-current={r.key === range ? "page" : undefined}
                  className={`rounded-lg px-2.5 py-2 text-sm font-semibold whitespace-nowrap transition sm:px-3.5 ${
                    r.key === range ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  }`}
                >
                  {r.label}
                </Link>
              ))}
            </nav>
            <RefreshButton />
          </div>
        </div>

        {!a.hasData ? (
          <div className="mt-10 rounded-3xl bg-white p-14 text-center ring-1 ring-stone-200/70">
            <p className="font-display text-2xl text-stone-800">No orders in this period yet</p>
            <p className="mt-2 text-sm text-stone-500">Pick a longer range above, or check back once tables start ordering.</p>
          </div>
        ) : (
          <>
            <Highlights a={a} />

            {/* KPI row */}
            <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Net sales" kpi={a.kpis.netSales} format={formatINR} note={`+ ${formatINR(a.kpis.gst)} GST collected`} />
              <KpiTile label="Paid bills" kpi={a.kpis.bills} format={(v) => v.toLocaleString("en-IN")} />
              <KpiTile label="Average bill" kpi={a.kpis.avgBill} format={(v) => formatINR(Math.round(v / 100) * 100)} />
              <KpiTile label="Items sold" kpi={a.kpis.itemsSold} format={(v) => v.toLocaleString("en-IN")} />
            </section>

            {/* Sales trend + mixes */}
            <section className="mt-3 grid gap-3 lg:grid-cols-3">
              <Card title={range === "today" ? "Sales by hour" : "Daily sales"} sub="Net sales of paid bills" className="lg:col-span-2">
                {range === "today" ? (
                  <Columns data={trimHours(a.hourly).map((h) => ({ key: h.hour, label: hour12(h.hour), value: h.net, sub: String(h.bills) }))} />
                ) : (
                  <Columns data={a.daily.map((d) => ({ key: d.day, label: d.label, value: d.net, sub: String(d.bills) }))} />
                )}
              </Card>
              <div className="grid gap-3">
                <Card title="How guests paid">
                  <SplitBar
                    parts={a.payments.map((p) => ({
                      label: p.method === "upi" ? "UPI" : "Cash",
                      value: p.amount,
                      color: p.method === "upi" ? C.series : C.second,
                      detail: `${inrCompact(p.amount)} · ${p.bills} bills`,
                    }))}
                  />
                </Card>
                <Card title="Veg · Egg · Non-veg" sub="Share of item sales">
                  <SplitBar
                    parts={a.diet.map((d) => ({
                      label: { veg: "Veg", egg: "Egg", nonveg: "Non-veg" }[d.diet],
                      value: d.net,
                      color: { veg: C.series, egg: C.third, nonveg: C.second }[d.diet],
                      detail: `${d.qty} items`,
                    }))}
                  />
                </Card>
              </div>
            </section>

            {/* The part Rista doesn't have */}
            <section className="mt-12">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-2xl font-semibold text-stone-900">Service & ordering insights</h2>
                <span className="rounded-full bg-[#1f5139] px-3 py-1 text-[11px] font-bold tracking-wider text-[#e6efe8] uppercase">Not in Rista</span>
              </div>
              <p className="mt-1 text-sm text-stone-500">Built from the QR ordering flow: every step from a guest&apos;s tap to the bill is timed.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric
                  label="Guests ordered themselves"
                  value={pct(a.qr.share)}
                  delta={a.qr.share - a.qr.prevShare}
                  deltaFmt={(d) => `${Math.abs(Math.round(d * 100))} pts`}
                  foot={`${a.qr.customerQty} of ${a.qr.customerQty + a.qr.staffQty} items came in by QR`}
                />
                <Metric
                  label="Time to accept a QR order"
                  value={minutes(a.accept.median)}
                  tone={a.accept.median != null && a.accept.median > SLOW_ACCEPT_MINUTES ? "bad" : "neutral"}
                  foot={a.accept.n ? `9 in 10 within ${minutes(a.accept.p90)} · ${a.accept.slowBatches} waited over ${SLOW_ACCEPT_MINUTES} min` : "No QR orders accepted yet"}
                />
                <Metric
                  label="Kitchen time per dish"
                  value={minutes(a.kitchen.median)}
                  foot={a.kitchen.n ? `Accepted → ready · 9 in 10 within ${minutes(a.kitchen.p90)}` : "No dishes marked ready yet"}
                />
                <Metric
                  label="Time at the table"
                  value={minutes(a.tableTime.median)}
                  foot={`${a.tableTime.avgRounds.toFixed(1)} rounds per visit · ${pct(a.tableTime.addOnRate)} ordered again`}
                />
                <Metric
                  label="Missed QR orders"
                  value={formatINR(a.lostQr.value)}
                  tone={a.lostQr.value > 0 ? "bad" : "good"}
                  foot={a.lostQr.batches ? `${a.lostQr.qty} items in ${a.lostQr.batches} orders never got accepted` : "Every guest order was accepted"}
                />
              </div>

              <div className="mt-3">
                <Card title="Busy hours" sub="Paid bills by the hour they started (IST) — use it to plan staff and prep">
                  <Heatmap counts={a.heatmap.counts} max={a.heatmap.max} />
                </Card>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <Card title="Menu matrix" sub="Each dot is a dish: how many sold vs its price. Lines are the medians." className="lg:col-span-2">
                  <MenuMatrix points={a.matrix} cuts={a.matrixCuts} />
                </Card>
                <Card title="What to do with each group">
                  <ul className="space-y-4">
                    {(Object.keys(QUADRANTS) as (keyof typeof QUADRANTS)[]).map((q) => {
                      const names = a.matrix.filter((m) => m.quadrant === q).sort((x, y) => y.qty - x.qty).map((m) => m.name);
                      return (
                        <li key={q}>
                          <div className="flex items-baseline justify-between">
                            <span className="font-semibold text-stone-900">{QUADRANTS[q].title}</span>
                            <span className="text-xs text-stone-400 tabular-nums">{names.length} dishes</span>
                          </div>
                          <p className="text-sm text-stone-500">{QUADRANTS[q].hint}</p>
                          {names.length > 0 && <p className="mt-1 truncate text-xs text-stone-400" title={names.join(", ")}>{names.slice(0, 4).join(" · ")}{names.length > 4 ? " …" : ""}</p>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-5 border-t border-stone-100 pt-3 text-xs text-stone-400">Price stands in for profit until dish costs are added.</p>
                </Card>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <Card title="Ordered together" sub="Pairs on the same bill — build combos and upsell prompts from these">
                  {a.pairs.length === 0 ? (
                    <Empty>No repeat pairings yet</Empty>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {a.pairs.map((p) => (
                        <li key={p.a + p.b} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-stone-900">{p.a}</span>
                            <span className="mx-1.5 text-stone-300">+</span>
                            <span className="font-medium text-stone-900">{p.b}</span>
                            <span className="block text-xs text-stone-400">{pct(p.pctOfA)} of bills with {p.a} also had {p.b}</span>
                          </span>
                          <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700 tabular-nums">{p.together} bills</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Slowest dishes in the kitchen" sub="Median minutes from accepted to ready (3+ orders)">
                  <BarList rows={a.kitchen.slowest.map((d) => ({ label: d.name, value: d.median, note: `${d.n}×` }))} format={(v) => minutes(v)} color={C.second} empty="Not enough dishes marked ready yet" />
                </Card>
              </div>
            </section>

            {/* Classic sales breakdowns */}
            <section className="mt-12">
              <h2 className="font-display text-2xl font-semibold text-stone-900">Menu & tables</h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <Card title="Top dishes" sub="By quantity sold">
                  <BarList rows={a.topItems.map((i) => ({ label: i.name, value: i.qty, note: inrCompact(i.net) }))} format={(v) => `${v}`} />
                </Card>
                <Card title="Categories" sub="Net item sales">
                  <BarList rows={a.categories.map((c) => ({ label: c.name, value: c.net, note: `${c.qty} items` }))} format={inrCompact} />
                </Card>
                <Card title="Tables" sub="Net sales · bills · median time seated">
                  <BarList rows={a.tables.map((t) => ({ label: t.name, value: t.net, note: `${t.bills} bills · ${minutes(t.avgMinutes)}` }))} format={inrCompact} />
                </Card>
                <Card title="Menu labels & combos">
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat
                      label="Badge / Bestseller dishes"
                      value={a.badgeLift.otherAvgQty > 0 ? `${(a.badgeLift.featuredAvgQty / a.badgeLift.otherAvgQty).toFixed(1)}×` : "—"}
                      foot={`sell vs. unlabelled (${a.badgeLift.featuredAvgQty.toFixed(1)} vs ${a.badgeLift.otherAvgQty.toFixed(1)} each)`}
                    />
                    <MiniStat label="Combos" value={pct(a.combos.share)} foot={`of item sales · ${inrCompact(a.combos.net)}`} />
                  </div>
                  <div className="mt-5">
                    <p className="text-sm font-semibold text-stone-900">
                      Not ordered in this period <span className="font-normal text-stone-400">({a.neverOrdered.length})</span>
                    </p>
                    {a.neverOrdered.length === 0 ? (
                      <p className="mt-1 text-sm text-stone-500">Every dish on the menu sold at least once.</p>
                    ) : (
                      <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-auto">
                        {a.neverOrdered.map((m) => (
                          <span key={m.name} title={`${m.category} · ${formatINR(m.price)}`} className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function trimHours(h: Analytics["hourly"]) {
  const used = h.filter((x) => x.bills > 0).map((x) => x.hour);
  const lo = used.length ? Math.min(...used) : 10;
  const hi = used.length ? Math.max(...used) : 22;
  return h.filter((x) => x.hour >= Math.min(lo, 10) && x.hour <= Math.max(hi, 22));
}

function Highlights({ a }: { a: Analytics }) {
  const items: { k: string; v: string }[] = [];
  let peak = { d: 0, h: 0, n: 0 };
  a.heatmap.counts.forEach((row, d) => row.forEach((n, h) => { if (n > peak.n) peak = { d, h, n }; }));
  if (peak.n > 0) items.push({ k: "Busiest slot", v: `${DAYS[peak.d]}s, ${hour12(peak.h)}–${hour12((peak.h + 1) % 24)}` });
  if (a.topItems[0]) items.push({ k: "Top dish", v: `${a.topItems[0].name} · ${a.topItems[0].qty} sold` });
  if (a.pairs[0]) items.push({ k: "Best pairing", v: `${a.pairs[0].a} + ${a.pairs[0].b}` });
  if (a.lostQr.value > 0) items.push({ k: "Missed", v: `${formatINR(a.lostQr.value)} in unaccepted QR orders` });
  if (items.length === 0) return null;
  return (
    <section className="mt-6 grid gap-px overflow-hidden rounded-2xl bg-[#2a2119] text-[#f3e7d5] sm:grid-cols-2 lg:grid-cols-4">
      {items.slice(0, 4).map((i) => (
        <div key={i.k} className="bg-[#2a2119] px-5 py-4">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#d9b26f] uppercase">{i.k}</div>
          <div className="mt-1 truncate text-[15px] font-medium" title={i.v}>{i.v}</div>
        </div>
      ))}
    </section>
  );
}

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(42,33,25,0.04)] ring-1 ring-stone-200/70 sm:p-6 ${className}`}>
      <h3 className="text-[15px] font-semibold text-stone-900">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Delta({ d, fmt, invert = false }: { d: number | null; fmt: (d: number) => string; invert?: boolean }) {
  if (d == null) return <span className="text-xs font-semibold text-stone-400">New</span>;
  if (Math.abs(d) < 0.005) return <span className="text-xs font-semibold text-stone-400">— no change</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      <span aria-hidden>{d > 0 ? "▲" : "▼"}</span>
      {fmt(d)}
    </span>
  );
}

function KpiTile({ label, kpi, format, note }: { label: string; kpi: Kpi; format: (v: number) => string; note?: string }) {
  const change = kpi.prev === 0 ? (kpi.value === 0 ? 0 : null) : (kpi.value - kpi.prev) / kpi.prev;
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-stone-200/70">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-stone-900">{format(kpi.value)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Delta d={change} fmt={(d) => `${Math.abs(Math.round(d * 100))}%`} />
        <span className="text-xs text-stone-400">was {format(kpi.prev)}</span>
      </div>
      {note && <div className="mt-2 text-xs text-stone-400">{note}</div>}
    </div>
  );
}

function Metric({
  label, value, foot, tone = "neutral", delta, deltaFmt,
}: { label: string; value: string; foot: string; tone?: "good" | "bad" | "neutral"; delta?: number; deltaFmt?: (d: number) => string }) {
  const toneCls = { good: "text-emerald-700", bad: "text-rose-700", neutral: "text-stone-900" }[tone];
  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 ring-1 ring-stone-200/70">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`text-[26px] leading-none font-semibold tracking-tight ${toneCls}`}>{value}</span>
        {delta != null && deltaFmt && <Delta d={delta} fmt={deltaFmt} />}
      </div>
      <div className="mt-auto pt-3 text-xs leading-relaxed text-stone-400">{foot}</div>
    </div>
  );
}

function MiniStat({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className="rounded-xl bg-[#f7f4ef] p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-stone-900">{value}</div>
      <div className="mt-1 text-xs text-stone-400">{foot}</div>
    </div>
  );
}
