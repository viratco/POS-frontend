import { connection } from "next/server";
import { Suspense } from "react";
import { computeAnalytics, parseRange, rangeWindow, type RangeKey } from "@/lib/analytics";
import { loadAnalyticsInput } from "@/lib/analyticsData";
import { supabaseServer } from "@/lib/supabase/server";
import AnalyticsDashboard, { AnalyticsSkeleton, istClock } from "./AnalyticsDashboard";

export const metadata = { title: "Analytics · Sohee's Kitchen" };

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
  const { a, updatedAt } = await build(range);
  return <AnalyticsDashboard a={a} range={range} updatedAt={updatedAt} />;
}

async function build(range: RangeKey) {
  const now = Date.now();
  // Load the current window and the one before it, for the "vs previous" comparisons.
  const input = await loadAnalyticsInput(await supabaseServer(), rangeWindow(range, now).prevFrom);
  return { a: computeAnalytics(input, range, now), updatedAt: istClock(now) };
}
