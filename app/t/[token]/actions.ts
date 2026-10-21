"use server";

import { supabaseAnon } from "@/lib/supabase/server";
import type { CartLine } from "@/lib/types";

export type PlacedItem = { id: string; name_snapshot: string; price_paise_snapshot: number; qty: number; note: string | null };
export type PlaceOrderResult =
  | { ok: true; tableName: string; items: PlacedItem[] }
  | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  invalid_table: "This table's QR code isn't active. Please ask a staff member.",
  item_unavailable: "Something in your cart just sold out. Please review your cart.",
  invalid_cart: "Your cart is empty or too large.",
};

export async function placeOrder(token: string, lines: CartLine[]): Promise<PlaceOrderResult> {
  const { data, error } = await supabaseAnon().rpc("place_order", { p_qr_token: token, p_items: lines });
  if (error) {
    console.error("place_order failed:", error.message);
    return { ok: false, error: MESSAGES[error.message] ?? "Couldn't send your order. Please try again." };
  }

  // The chef is alerted when staff accept the order (see staff/actions.ts).
  const result = data as { table_name: string; items: PlacedItem[] };
  return { ok: true, tableName: result.table_name, items: result.items };
}
