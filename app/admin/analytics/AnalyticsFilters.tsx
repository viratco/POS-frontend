"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type Filters, hasFilters, RANGES, type Range, TIMES_OF_DAY } from "@/lib/analytics";

// Which days to look at (quick picks or any dates), plus payment, table and time of day.
export default function AnalyticsFilters({
  base,
  range,
  filters,
  tables,
  today,
}: {
  base: string;
  range: Range;
  filters: Filters;
  tables: { id: string; name: string }[];
  today: string; // YYYY-MM-DD, India time
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showDates, setShowDates] = useState(range.key === "custom");
  const [from, setFrom] = useState(range.from ?? "");
  const [to, setTo] = useState(range.to ?? "");

  function go(r: Range, f: Filters) {
    const q = new URLSearchParams({ range: r.key });
    if (r.key === "custom" && r.from && r.to) {
      q.set("from", r.from);
      q.set("to", r.to);
    }
    if (f.pay) q.set("pay", f.pay);
    if (f.table) q.set("table", f.table);
    if (f.time) q.set("time", f.time);
    start(() => router.push(`${base}?${q}`, { scroll: false }));
  }

  const chip = (on: boolean) =>
    `shrink-0 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
      on ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
    }`;
  const select = (on: boolean) =>
    `h-10 max-w-full rounded-xl bg-white px-3 text-sm font-semibold shadow-sm ring-1 outline-none focus:ring-2 focus:ring-stone-900 ${
      on ? "text-stone-900 ring-stone-900" : "text-stone-500 ring-stone-200/70"
    }`;

  return (
    <div className={`mt-5 space-y-2 transition-opacity ${pending ? "opacity-50" : ""}`} aria-busy={pending}>
      <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-stone-200/70" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            aria-current={r.key === range.key ? "page" : undefined}
            onClick={() => {
              setShowDates(false);
              go({ key: r.key }, filters);
            }}
            className={chip(r.key === range.key)}
          >
            {r.label}
          </button>
        ))}
        <button aria-expanded={showDates} onClick={() => setShowDates((v) => !v)} className={chip(range.key === "custom")}>
          Pick dates
        </button>
      </nav>

      {showDates && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) go({ key: "custom", from, to }, filters);
          }}
          className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-stone-200/70"
        >
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-500">
            From
            <input type="date" required value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg bg-stone-100 px-2 text-stone-900 outline-none focus:ring-2 focus:ring-stone-900" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-500">
            To
            <input type="date" required value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg bg-stone-100 px-2 text-stone-900 outline-none focus:ring-2 focus:ring-stone-900" />
          </label>
          <button disabled={!from || !to} className="h-10 rounded-lg bg-stone-900 px-4 text-sm font-bold text-white disabled:opacity-40">
            Show
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Payment" value={filters.pay ?? ""} onChange={(e) => go(range, { ...filters, pay: (e.target.value || null) as Filters["pay"] })} className={select(!!filters.pay)}>
          <option value="">All payments</option>
          <option value="upi">UPI only</option>
          <option value="cash">Cash only</option>
        </select>
        <select aria-label="Table" value={filters.table ?? ""} onChange={(e) => go(range, { ...filters, table: e.target.value || null })} className={select(!!filters.table)}>
          <option value="">All tables</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select aria-label="Time of day" value={filters.time ?? ""} onChange={(e) => go(range, { ...filters, time: (e.target.value || null) as Filters["time"] })} className={select(!!filters.time)}>
          <option value="">All day</option>
          {TIMES_OF_DAY.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        {hasFilters(filters) && (
          <button onClick={() => go(range, { pay: null, table: null, time: null })} className="h-10 rounded-xl px-3 text-sm font-semibold text-stone-500 hover:text-stone-900">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
