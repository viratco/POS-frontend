import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import AnalyticsDashboard, { AnalyticsSkeleton, istClock } from "@/app/admin/analytics/AnalyticsDashboard";
import { computeAnalytics, parseRange, type RangeKey } from "@/lib/analytics";
import { demoAnalyticsInput } from "@/lib/analyticsDemo";

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
  const range = parseRange((await searchParams).range);
  await connection();
  const { a, updatedAt } = build(range);
  return <AnalyticsDashboard a={a} range={range} updatedAt={updatedAt} demo />;
}

function build(range: RangeKey) {
  const now = Date.now();
  return { a: computeAnalytics(demoAnalyticsInput(now), range, now), updatedAt: istClock(now) };
}
