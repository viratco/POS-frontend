"use client";

import { AddItemsModal } from "@/app/staff/Dashboard";

// Preview of the staff "Add items" window without signing in. Never served in production.
export default function AddItemsPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return <AddItemsModal tableId="preview" tableName="Table 4" waOn={false} onClose={() => {}} onAdded={() => {}} />;
}
