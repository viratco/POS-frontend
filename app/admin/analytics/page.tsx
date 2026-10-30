import { connection } from "next/server";
import { Suspense } from "react";
import { computeAnalytics, type Filters, filterInput, hasFilters, parseFilters, parseRange, rangeWindow, type Range } from "@/lib/analytics";
import { loadAnalyticsInput } from "@/lib/analyticsData";
import { loadProfit } from "@/lib/profit";
import { supabaseServer } from "@/lib/supabase/server";
import AnalyticsDashboard, { AnalyticsSkeleton, istClock, tableChoices } from "./AnalyticsDashboard";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}

async function Analytics({ searchParams }: { searchParams: PageProps<"/admin/analytics">["searchParams"] }) {
  const q = await searchParams;
  const range = parseRange(q.range, q.from, q.to);
  const filters = parseFilters(q);
  await connection(); // always fresh numbers, computed per request
  const { a, profit, tables, today, updatedAt } = await build(range, filters);
  return <AnalyticsDashboard a={a} profit={profit} range={range} filters={filters} tables={tables} today={today} updatedAt={updatedAt} />;
}

async function build(range: Range, filters: Filters) {
  const now = Date.now();
  // Load the current window and the one before it, for the "vs previous" comparisons.
  const supabase = await supabaseServer();
  const input = await loadAnalyticsInput(supabase, rangeWindow(range, now).prevFrom);
  const a = computeAnalytics(filterInput(input, filters), range, now);
  // Stock bills can't be split by table, payment or time, so no profit figure for a filtered view.
  const profit = hasFilters(filters) ? null : await loadProfit(supabase, range, now, a.kpis.netSales);
  const today = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  return { a, profit, tables: tableChoices(input.tables), today, updatedAt: istClock(now) };
}
