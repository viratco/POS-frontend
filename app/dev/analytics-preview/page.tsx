import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import AnalyticsDashboard, { AnalyticsSkeleton, istClock } from "@/app/admin/analytics/AnalyticsDashboard";
import { computeAnalytics, filterInput, parseFilters, parseRange, type Filters, type Range } from "@/lib/analytics";
import { demoAnalyticsInput } from "@/lib/analyticsDemo";
import type { Profit } from "@/lib/profit";

// Design preview of the analytics dashboard with made-up data. Never served in production.
export default function AnalyticsPreview({ searchParams }: PageProps<"/dev/analytics-preview">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ searchParams }: { searchParams: PageProps<"/dev/analytics-preview">["searchParams"] }) {
  const q = await searchParams;
  const range = parseRange(q.range, q.from, q.to);
  const filters = parseFilters(q);
  await connection();
  const { a, tables, today, updatedAt } = build(range, filters);
  // Made-up stock spend: about a third of sales, a bit more last period.
  const net = a.kpis.netSales;
  const spend = { value: Math.round(net.value * 0.34), prev: Math.round(net.prev * 0.39) };
  const profit: Profit = {
    spend,
    profit: { value: net.value - spend.value, prev: net.prev - spend.prev },
    margin: { value: net.value ? 1 - spend.value / net.value : null, prev: net.prev ? 1 - spend.prev / net.prev : null },
    owed: Math.round(spend.value * 0.2),
    topItems: [
      { name: "Raw chicken", paise: Math.round(spend.value * 0.32) },
      { name: "Shin Ramyun packets", paise: Math.round(spend.value * 0.18) },
      { name: "Vegetables", paise: Math.round(spend.value * 0.14) },
      { name: "Milk", paise: Math.round(spend.value * 0.09) },
      { name: "Gochujang", paise: Math.round(spend.value * 0.05) },
    ],
  };
  return <AnalyticsDashboard a={a} profit={profit} range={range} filters={filters} tables={tables} today={today} updatedAt={updatedAt} demo />;
}

function build(range: Range, filters: Filters) {
  const now = Date.now();
  const input = demoAnalyticsInput(now);
  return {
    a: computeAnalytics(filterInput(input, filters), range, now),
    tables: input.tables,
    today: new Date(now + 330 * 60_000).toISOString().slice(0, 10),
    updatedAt: istClock(now),
  };
}
