import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import FloorPlanDemo from "./FloorPlanDemo";

// Design preview of the staff floor plan with made-up tables. Never served in production.
export default function FloorPlanPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <Demo />
    </Suspense>
  );
}

async function Demo() {
  await connection();
  return <FloorPlanDemo now={stamp()} />;
}

function stamp() {
  return Date.now();
}
