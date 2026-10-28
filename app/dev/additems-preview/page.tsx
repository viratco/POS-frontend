"use client";

import { AddItemsModal } from "@/app/staff/Dashboard";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Category, MenuItem } from "@/lib/types";

async function menu(show: (m: { categories: Category[]; menu: MenuItem[] }) => void) {
  const db = supabaseBrowser();
  const [c, m] = await Promise.all([db.from("menu_categories").select("*").order("sort_order"), db.from("menu_items").select("*").order("sort_order")]);
  show({ categories: (c.data ?? []) as Category[], menu: ((m.data ?? []) as MenuItem[]).map((i) => ({ ...i, options: Array.isArray(i.options) ? i.options : [] })) });
}

// Preview of the staff "Add items" window without signing in. Never served in production.
export default function AddItemsPreview() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <AddItemsModal
      tableName="Table 4"
      waOn={false}
      loadMenu={menu}
      onSend={async () => ({ error: null, queued: true })}
      onClose={() => {}}
      onAdded={() => {}}
    />
  );
}
