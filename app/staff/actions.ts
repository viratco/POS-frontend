"use server";

import { notifyNewItemsAfterResponse } from "@/lib/notify";
import { supabaseServer } from "@/lib/supabase/server";
import type { CartLine } from "@/lib/types";

export async function staffAddItems(tableId: string, lines: CartLine[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("staff_add_items", { p_table_id: tableId, p_items: lines });
  if (error) return { ok: false, error: error.message };

  const result = data as { table_name: string; items: { name_snapshot: string; qty: number; note: string | null }[] };
  notifyNewItemsAfterResponse({
    tableName: result.table_name,
    source: "staff",
    items: result.items.map((i) => ({ name: i.name_snapshot, qty: i.qty, note: i.note })),
  });
  return { ok: true };
}

// Accept a customer's QR order: sends its waiting items to the kitchen and alerts the chef.
export async function acceptOrder(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("accept_order_items", { p_order_id: orderId });
  if (error) return { ok: false, error: error.message };

  const result = data as { table_name: string; items: { name_snapshot: string; qty: number; note: string | null }[] };
  if (result.items.length > 0) {
    notifyNewItemsAfterResponse({
      tableName: result.table_name,
      source: "customer",
      items: result.items.map((i) => ({ name: i.name_snapshot, qty: i.qty, note: i.note })),
    });
  }
  return { ok: true };
}
