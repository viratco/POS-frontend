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
