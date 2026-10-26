import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rangeWindow, type Kpi, type RangeKey } from "./analytics";

// Gross profit = net sales (before GST) − stock bought (Purchases), for the same period.
// Stock counts on the day it was bought, so short periods swing with bulk buys;
// rent, salaries and bills aren't included.

export type Profit = {
  spend: Kpi; // paise spent on stock
  profit: Kpi; // net sales − spend
  margin: { value: number | null; prev: number | null }; // profit ÷ net sales
  owed: number; // "pay later" bills in this period, still unpaid
  topItems: { name: string; paise: number }[];
};

const istDate = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

type Row = { total_paise: number; payment: string; purchased_on: string; purchase_items: { name: string; amount_paise: number }[] };

export async function loadProfit(supabase: SupabaseClient, range: RangeKey, now: number, netSales: Kpi): Promise<Profit | null> {
  const w = rangeWindow(range, now);
  const { data, error } = await supabase
    .from("purchases")
    .select("total_paise, payment, purchased_on, purchase_items(name, amount_paise)")
    .is("voided_at", null)
    .gte("purchased_on", istDate(w.prevFrom))
    .lte("purchased_on", istDate(now));
  if (error) return null; // Purchases not set up yet: the section stays hidden

  // Dates have no time of day, so "today" compares with all of yesterday.
  const from = istDate(w.from);
  const rows = (data ?? []) as Row[];
  const cur = rows.filter((r) => r.purchased_on >= from);
  const prev = rows.filter((r) => r.purchased_on < from);
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.total_paise, 0);

  const spend = { value: sum(cur), prev: sum(prev) };
  const profit = { value: netSales.value - spend.value, prev: netSales.prev - spend.prev };
  const pct = (p: number, n: number) => (n > 0 ? p / n : null);

  const byItem = new Map<string, { name: string; paise: number }>();
  for (const r of cur)
    for (const i of r.purchase_items) {
      const k = i.name.toLowerCase();
      const e = byItem.get(k) ?? { name: i.name, paise: 0 };
      e.paise += i.amount_paise;
      byItem.set(k, e);
    }

  return {
    spend,
    profit,
    margin: { value: pct(profit.value, netSales.value), prev: pct(profit.prev, netSales.prev) },
    owed: sum(cur.filter((r) => r.payment === "credit")),
    topItems: [...byItem.values()].sort((a, b) => b.paise - a.paise).slice(0, 5),
  };
}
