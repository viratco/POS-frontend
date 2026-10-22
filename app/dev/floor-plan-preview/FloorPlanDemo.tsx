"use client";

import { useEffect, useState } from "react";
import CafeFloorPlan from "@/components/CafeFloorPlan";
import type { Order, OrderItem, Table } from "@/lib/types";

type State = "available" | "new_order" | "food_ready" | "in_kitchen" | "served";

// Made-up tables in every state; Table 10 deliberately missing, "Window 1" off-plan.
const DEMO: [string, State, number, number][] = [
  ["Table 1", "served", 38, 2],
  ["Table 2", "available", 0, 0],
  ["Table 3", "new_order", 4, 3],
  ["Table 4", "in_kitchen", 12, 2],
  ["Table 5", "available", 0, 0],
  ["Table 6", "food_ready", 21, 4],
  ["Table 7", "available", 0, 0],
  ["Table 8", "in_kitchen", 9, 5],
  ["Table 9", "served", 55, 6],
  ["Window 1", "available", 0, 0],
];

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const STATUS: Record<State, OrderItem["status"]> = { available: "served", new_order: "new", food_ready: "ready", in_kitchen: "pending", served: "served" };

export default function FloorPlanDemo() {
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(Date.now()), []);
  if (!now) return null;

  const rows = DEMO.map(([name, state, minsAgo, n], i) => {
    const table: Table = { id: `t${i}`, name, qr_token: "", is_active: true, sort_order: i };
    if (state === "available") return { table, order: null, items: [], state };
    const created = new Date(now - minsAgo * 60_000).toISOString();
    const order: Order = { id: `o${i}`, table_id: table.id, status: "open", note: null, created_at: created, closed_at: null };
    const items: OrderItem[] = Array.from({ length: n }, (_, k) => ({
      id: `i${i}${k}`, order_id: order.id, menu_item_id: null, name_snapshot: "Dish", price_paise_snapshot: 24900 + k * 6000, qty: 1,
      note: null, status: STATUS[state], source: "customer", created_at: created, accepted_at: null, ready_at: null,
    }));
    return { table, order, items, state };
  });

  return (
    <main className="mx-auto w-full max-w-[1400px] p-6">
      <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        Floor plan preview with made-up tables — development only. Selected: {selected ?? "none"}
      </p>
      <CafeFloorPlan rows={rows} selectedId={selected} onSelectTable={setSelected} now={now} ago={ago} onSetupTables={async () => alert("Would create the missing tables")} />
    </main>
  );
}
