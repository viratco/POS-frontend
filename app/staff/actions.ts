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

export async function staffAddItems(tableId: string, lines: CartLine[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("staff_add_items", { p_table_id: tableId, p_items: lines });
  if (error) return { ok: false, error: error.message };

  const result = data as { table_name: string; items: TicketRow[] };
  notifyNewItemsAfterResponse({
    tableName: result.table_name,
    source: "staff",
    items: result.items.map(toTicket),
  });
  return { ok: true };
}

// Accept a customer's QR order: sends its waiting items to the kitchen and alerts the chef.
export async function acceptOrder(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("accept_order_items", { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };

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
