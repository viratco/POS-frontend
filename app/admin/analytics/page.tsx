import { connection } from "next/server";
import { Suspense } from "react";
import { computeAnalytics, parseRange, rangeWindow, type RangeKey } from "@/lib/analytics";
import { loadAnalyticsInput } from "@/lib/analyticsData";
import { loadProfit } from "@/lib/profit";
import { supabaseServer } from "@/lib/supabase/server";
import AnalyticsDashboard, { AnalyticsSkeleton, istClock } from "./AnalyticsDashboard";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}

async function Analytics({ searchParams }: { searchParams: PageProps<"/admin/analytics">["searchParams"] }) {
  const range = parseRange((await searchParams).range);
  await connection(); // always fresh numbers, computed per request
  const { a, profit, updatedAt } = await build(range);
  return <AnalyticsDashboard a={a} profit={profit} range={range} updatedAt={updatedAt} />;
}

async function build(range: RangeKey) {
  const now = Date.now();
  // Load the current window and the one before it, for the "vs previous" comparisons.
  const supabase = await supabaseServer();
  const input = await loadAnalyticsInput(supabase, rangeWindow(range, now).prevFrom);
  const a = computeAnalytics(input, range, now);
  const profit = await loadProfit(supabase, range, now, a.kpis.netSales);
  return { a, profit, updatedAt: istClock(now) };
}
