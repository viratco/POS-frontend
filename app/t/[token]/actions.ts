"use server";

import { supabaseAnon } from "@/lib/supabase/server";
import type { CartLine } from "@/lib/types";

export type PlacedItem = {
  id: string;
  name_snapshot: string;
  price_paise_snapshot: number;
  qty: number;
  note: string | null;
  options?: { group: string; name: string; price?: number }[] | null;
};
export type PlaceOrderResult =
  | { ok: true; tableName: string; items: PlacedItem[]; counterAway?: boolean }
  | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  invalid_table: "This table's QR code isn't active. Please ask a staff member.",
  item_unavailable: "Something in your cart just sold out. Please review your cart.",
  invalid_cart: "Your cart is empty or too large.",
  invalid_options: "One of your dishes needs its options chosen again. Please check your cart.",
  invalid_phone: "Please enter a valid 10-digit mobile number.",
  invalid_name: "Please enter your name.",
  slow_down: "Lots of orders from this table just now. Please wait a minute, or ask a staff member.",
};

export type GuestDetails = { name: string; phone: string; marketing_consent: boolean };

export async function placeOrder(token: string, lines: CartLine[], guest?: GuestDetails): Promise<PlaceOrderResult> {
  const db = supabaseAnon();
  const away = counterAway(token); // asked alongside, so the guest doesn't wait longer
  let { data, error } = await db.rpc("place_order", { p_qr_token: token, p_items: lines, ...(guest ? { p_customer: guest } : {}) });
  // Database not updated yet for guest details: still take the order rather than fail.
  if (error?.code === "PGRST202" && guest) {
    ({ data, error } = await db.rpc("place_order", { p_qr_token: token, p_items: lines }));
  }
  if (error) {
    console.error("place_order failed:", error.message);
    return { ok: false, error: MESSAGES[error.message] ?? "Couldn't send your order. Please try again." };
  }

  // The chef is alerted when staff accept the order (see staff/actions.ts).
  const result = data as { table_name: string; items: PlacedItem[] };
  return { ok: true, tableName: result.table_name, items: result.items, counterAway: await away };
}

// The café's counter was in use in the last few hours but hasn't checked in for a few minutes: its internet
// is probably down, so staff won't see this order until it's back. (A counter that simply
// wasn't opened today says nothing.)
async function counterAway(token: string) {
  const { data, error } = await supabaseAnon().rpc("counter_last_seen", { p_qr_token: token });
  if (error || !data) return false;
  const gone = Date.now() - new Date(data as string).getTime();
  return gone > 3 * 60_000 && gone < 3 * 3600_000;
}
