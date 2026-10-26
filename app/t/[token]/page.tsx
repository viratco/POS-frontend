import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { supabaseAnon } from "@/lib/supabase/server";
import type { Category, MenuItem } from "@/lib/types";
import MenuClient, { type Brand } from "./MenuClient";

export const viewport: Viewport = { themeColor: "#ffffff" };

type TableInfo = { id: string; name: string; cafe_id?: string; cafe_name?: string; cafe_slug?: string; logo_url?: string | null };

export default function TablePage({ params }: PageProps<"/t/[token]">) {
  return (
    <Suspense fallback={<MenuSkeleton />}>
      <TableMenu params={params} />
    </Suspense>
  );
}

async function TableMenu({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = supabaseAnon();

  const { data: table } = await supabase.rpc("get_table_by_token", { p_qr_token: token }).maybeSingle<TableInfo>();
  if (!table) notFound();

  // Only this table's café's menu. (cafe_id is missing only on a database from before multi-café.)
  let categoriesQ = supabase.from("menu_categories").select("*").order("sort_order");
  let itemsQ = supabase.from("menu_items").select("*").order("sort_order");
  if (table.cafe_id) {
    categoriesQ = categoriesQ.eq("cafe_id", table.cafe_id);
    itemsQ = itemsQ.eq("cafe_id", table.cafe_id);
  }
  const [{ data: categories }, { data: items }] = await Promise.all([categoriesQ, itemsQ]);
  const brand: Brand = {
    name: table.cafe_name ?? "Sohee's Kitchen",
    slug: table.cafe_slug ?? "sohees",
    logoUrl: table.logo_url ?? null,
  };

  return (
    <MenuClient
      token={token}
      tableName={table.name}
      brand={brand}
      categories={(categories ?? []) as Category[]}
      items={((items ?? []) as Partial<MenuItem>[]).map(withDefaults)}
    />
  );
}

// Tolerates rows from before the menu-discovery migration.
function withDefaults(i: Partial<MenuItem>): MenuItem {
  return {
    ...(i as MenuItem),
    diet: i.diet ?? "veg",
    spice_level: i.spice_level ?? 0,
    is_bestseller: i.is_bestseller ?? false,
    badge: i.badge ?? null,
    moods: i.moods ?? [],
    is_combo: i.is_combo ?? false,
    subcategory: i.subcategory ?? null,
    options: Array.isArray(i.options) ? i.options : [],
  };
}

function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex animate-pulse items-center gap-3 px-5 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
        <div className="h-12 w-12 rounded-full bg-[#edf2f7]" />
        <div className="h-5 w-36 rounded bg-[#edf2f7]" />
      </div>
      <div className="mx-auto max-w-md animate-pulse px-5">
        <div className="mt-6 h-8 w-72 rounded bg-[#edf2f7]" />
        <div className="mt-7 grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[5/6] rounded-2xl bg-[#edf2f7]" />
          ))}
        </div>
      </div>
    </div>
  );
}
