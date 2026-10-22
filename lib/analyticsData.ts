import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AItem, AnalyticsInput, AOrder, APayment } from "./analytics";

const PAGE = 1000; // Supabase's default max rows per request
const ID_CHUNK = 150; // keeps `in (...)` filters well under URL length limits

type Query<T> = { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> };

async function all<T>(build: () => Query<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Everything the dashboard needs for orders created at or after `sinceMs`. Runs as the signed-in staff user (RLS). */
export async function loadAnalyticsInput(supabase: SupabaseClient, sinceMs: number): Promise<AnalyticsInput> {
  const since = new Date(sinceMs).toISOString();

  const [orders, menu, categories, tables] = await Promise.all([
    all<AOrder>(() =>
      supabase
        .from("orders")
        .select("id, table_id, status, created_at, closed_at, subtotal_paise, total_paise")
        .gte("created_at", since)
        .order("created_at"),
    ),
    all(() => supabase.from("menu_items").select("id, category_id, name, price_paise, is_available, diet, is_bestseller, badge, is_combo").order("id")),
    all(() => supabase.from("menu_categories").select("id, name").order("id")),
    all(() => supabase.from("tables").select("id, name").order("id")),
  ]);

  const idChunks = chunks(orders.map((o) => o.id), ID_CHUNK);
  const [itemParts, paymentParts] = await Promise.all([
    Promise.all(
      idChunks.map((ids) =>
        all<AItem>(() =>
          supabase
            .from("order_items")
            .select("order_id, menu_item_id, name_snapshot, price_paise_snapshot, qty, status, source, created_at, accepted_at, ready_at")
            .in("order_id", ids)
            .order("id"),
        ),
      ),
    ),
    Promise.all(
      idChunks.map((ids) =>
        all<APayment>(() => supabase.from("payments").select("order_id, method, amount_paise").in("order_id", ids).order("id")),
      ),
    ),
  ]);

  return {
    orders,
    items: itemParts.flat(),
    payments: paymentParts.flat(),
    menu: menu as AnalyticsInput["menu"],
    categories: categories as AnalyticsInput["categories"],
    tables: tables as AnalyticsInput["tables"],
  };
}
