import { notFound } from "next/navigation";
import FloorPlanDemo from "./FloorPlanDemo";

// Design preview of the staff floor plan with made-up tables. Never served in production.
export default function FloorPlanPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FloorPlanDemo />;
}
