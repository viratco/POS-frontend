"use server";

import { notifyNewItemsAfterResponse } from "@/lib/notify";
import { supabaseServer } from "@/lib/supabase/server";
import type { CartLine } from "@/lib/types";

type TicketRow = { name_snapshot: string; qty: number; note: string | null; options?: { name: string }[] | null };
// "Chicken Wings (Full · Honey Butter)" for the chef's alert.
const toTicket = (i: TicketRow) => ({
  name: i.options?.length ? `${i.name_snapshot} (${i.options.map((o) => o.name).join(" · ")})` : i.name_snapshot,
  qty: i.qty,
  note: i.note,
});

// status lets the counter tell "the server said no" from "the server is out of reach".
type Result = { ok: true; orderId?: string } | { ok: false; error: string; code?: string; status: number };

// Each dish may carry an id made on the counter, and a new order the id the counter gave it,
// so sending the same thing again after a dropped connection never adds it twice.
export async function staffAddItems(
  tableId: string,
  lines: (CartLine & { id?: string })[],
  orderId?: string,
): Promise<Result> {
  const supabase = await supabaseServer();
  let { data, error, status } = await supabase.rpc("staff_add_items", { p_table_id: tableId, p_items: lines, p_order_id: orderId ?? null });
  // Database not updated for offline mode yet: same call the old way.
  if (error?.code === "PGRST202") ({ data, error, status } = await supabase.rpc("staff_add_items", { p_table_id: tableId, p_items: lines }));
  if (error) return { ok: false, error: error.message, code: error.code, status };

  const result = data as { order_id: string; table_name: string; items: TicketRow[] };
  if (result.items.length > 0) {
    notifyNewItemsAfterResponse({
      tableName: result.table_name,
      source: "staff",
      items: result.items.map(toTicket),
    });
  }
  return { ok: true, orderId: result.order_id };
}

// Accept a customer's QR order: sends the waiting items staff saw (itemIds) to the kitchen
// and alerts the chef.
export async function acceptOrder(orderId: string, itemIds?: string[]): Promise<Result> {
  const supabase = await supabaseServer();
  let { data, error, status } = await supabase.rpc("accept_order_items", { p_order_id: orderId, p_item_ids: itemIds ?? null });
  if (error?.code === "PGRST202") ({ data, error, status } = await supabase.rpc("accept_order_items", { p_order_id: orderId }));
  if (error) return { ok: false, error: error.message, code: error.code, status };

  const result = data as { table_name: string; items: TicketRow[] };
  if (result.items.length > 0) {
    notifyNewItemsAfterResponse({
      tableName: result.table_name,
      source: "customer",
      items: result.items.map(toTicket),
    });
  }
  return { ok: true };
}
