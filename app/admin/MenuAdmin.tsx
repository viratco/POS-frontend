"use client";

import { useCallback, useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { formatINR } from "@/lib/money";
import { optionsToText, textToOptions } from "@/lib/options";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { DietMark } from "@/components/MenuMarks";
import type { Category, Diet, MenuItem, Mood } from "@/lib/types";

const MOOD_LABELS: Record<Mood, string> = { meal: "🍜 Full meal", share: "🍗 Share & snack", drink: "🧋 Drink" };

type Draft = Omit<MenuItem, "id" | "price_paise"> & { id?: string; price: string; optionsText: string };

// "120" or "120.50" -> paise, without going through floats.
function rupeesToPaise(input: string): number | null {
  const m = input.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

function paiseToRupees(p: number) {
  return p % 100 === 0 ? String(p / 100) : `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;
}

export default function MenuAdmin() {
  const supabase = supabaseBrowser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
    ]);
    setCategories((c.data ?? []) as Category[]);
    setItems((i.data ?? []) as MenuItem[]);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(item: MenuItem) {
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_available: !x.is_available } : x)));
    const { error } = await supabase.from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id);
    if (error) setError(error.message);
    void load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const price_paise = rupeesToPaise(draft.price);
    if (price_paise === null) {
      setError("Price must be a number like 120 or 120.50");
      return;
    }
    const parsed = textToOptions(draft.optionsText);
    if (parsed.error) {
      setError(`Options: ${parsed.error}`);
      return;
    }
    const row = {
      category_id: draft.category_id,
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      price_paise,
      image_url: draft.image_url?.trim() || null,
      is_available: draft.is_available,
      sort_order: draft.sort_order,
      diet: draft.diet,
      spice_level: draft.spice_level,
      is_bestseller: draft.is_bestseller,
      badge: draft.badge?.trim() || null,
      moods: draft.moods,
      is_combo: draft.is_combo,
      subcategory: draft.subcategory?.trim() || null,
      // Only sent when used, so editing still works on a database without the options column.
      ...(parsed.groups.length || draft.options?.length ? { options: parsed.groups } : {}),
    };
    const { error } = draft.id
      ? await supabase.from("menu_items").update(row).eq("id", draft.id)
      : await supabase.from("menu_items").insert(row);
    if (error) setError(error.message);
    else {
      setError(null);
      setDraft(null);
      void load();
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const { error } = await supabase
      .from("menu_categories")
      .insert({ name: newCategory.trim(), sort_order: (categories.at(-1)?.sort_order ?? 0) + 10 });
    if (error) setError(error.message);
    setNewCategory("");
    void load();
  }

  async function setCategoryImage(c: Category) {
    const url = window.prompt(`Image link for the "${c.name}" tile (leave empty to remove):`, c.image_url ?? "");
    if (url === null) return;
    const { error } = await supabase.from("menu_categories").update({ image_url: url.trim() || null }).eq("id", c.id);
    if (error) setError(error.message);
    void load();
  }

  function startNew(categoryId: string) {
    const inCat = items.filter((i) => i.category_id === categoryId);
    setDraft({
      category_id: categoryId,
      name: "",
      description: "",
      price: "",
      image_url: "",
      is_available: true,
      sort_order: (inCat.at(-1)?.sort_order ?? 0) + 10,
      diet: "veg",
      spice_level: 0,
      is_bestseller: false,
      badge: "",
      moods: [],
      is_combo: false,
      subcategory: "",
      options: [],
      optionsText: "",
    });
  }

  return (
    <div className="min-h-screen">
      <StaffNav />
      <main className="mx-auto max-w-3xl p-5">
        <h1 className="text-2xl font-semibold">Menu</h1>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {categories.map((c) => (
          <section key={c.id} className="mt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {c.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                )}
                <h2 className="text-lg font-semibold">{c.name}</h2>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setCategoryImage(c)} className="text-sm text-stone-500 hover:text-stone-900">
                  {c.image_url ? "Change tile image" : "Set tile image"}
                </button>
                <button onClick={() => startNew(c.id)} className="text-sm font-medium text-emerald-700">
                  + Add item
                </button>
              </div>
            </div>
            <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              {items
                .filter((i) => i.category_id === c.id)
                .map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-3">
                    <div className={`min-w-0 flex-1 ${i.is_available ? "" : "opacity-50"}`}>
                      <div className="flex items-center gap-2 font-medium">
                        <DietMark diet={i.diet} />
                        {i.name}
                        {i.is_bestseller && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">⭐ Start here</span>}
                        {i.is_combo && <span className="rounded-full bg-emerald-100 px-2 text-xs text-emerald-800">Combo</span>}
                      </div>
                      <div className="truncate text-sm text-stone-500">{i.description}</div>
                    </div>
                    <span className="tabular-nums">{formatINR(i.price_paise)}</span>
                    <button
                      onClick={() => toggle(i)}
                      className={`w-28 rounded-full px-3 py-1 text-xs font-medium ${i.is_available ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}
                    >
                      {i.is_available ? "Available" : "Sold out"}
                    </button>
                    <button
                      onClick={() => setDraft({ ...i, price: paiseToRupees(i.price_paise), optionsText: optionsToText(i.options ?? []) })}
                      className="text-sm text-stone-500 hover:text-stone-900"
                    >
                      Edit
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <form onSubmit={addCategory} className="mt-10 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          />
          <button className="rounded-lg border border-stone-300 px-4 py-2">Add category</button>
        </form>
      </main>

      {draft && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">{draft.id ? "Edit item" : "New item"}</h3>
            <Field label="Name">
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" />
            </Field>
            <Field label="Description">
              <textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (₹)">
                <input required inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="input" />
              </Field>
              <Field label="Category">
                <select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })} className="input">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Options & add-ons (optional)">
              <textarea
                rows={Math.max(3, draft.optionsText.split("\n").length + 1)}
                value={draft.optionsText}
                onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
                placeholder={"Choice (pick 1)\nVeg\nChicken +50\nPork +80\nAdd On (pick 0-3)\nHoney Butter +50"}
                className="input font-mono text-sm"
              />
              <span className="mt-1 block text-xs text-stone-500">
                A group line like <b>Choice (pick 1)</b> or <b>Add On (pick 0-3)</b>, then one choice per line. Add <b>+50</b> for extra ₹.
              </span>
            </Field>
            <Field label="Sub-category (optional, e.g. French Fries, Kimbap, Hot, Cold)">
              <input
                list="subcategory-options"
                maxLength={40}
                value={draft.subcategory ?? ""}
                onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
                className="input"
              />
              <datalist id="subcategory-options">
                {[...new Set(items.filter((i) => i.category_id === draft.category_id && i.subcategory).map((i) => i.subcategory!))].map((sc) => (
                  <option key={sc} value={sc} />
                ))}
              </datalist>
            </Field>
            <Field label="Photo URL (optional)">
              <input value={draft.image_url ?? ""} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Diet">
                <select value={draft.diet} onChange={(e) => setDraft({ ...draft, diet: e.target.value as Diet })} className="input">
                  <option value="veg">Veg</option>
                  <option value="egg">Contains egg</option>
                  <option value="nonveg">Non-veg</option>
                </select>
              </Field>
              <Field label="Spice">
                <select value={draft.spice_level} onChange={(e) => setDraft({ ...draft, spice_level: Number(e.target.value) })} className="input">
                  <option value={0}>Not spicy</option>
                  <option value={1}>🌶 Mild</option>
                  <option value={2}>🌶🌶 Medium</option>
                  <option value={3}>🌶🌶🌶 Hot</option>
                </select>
              </Field>
            </div>
            <Field label="Show under “In the mood for…”">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MOOD_LABELS) as Mood[]).map((m) => {
                  const on = draft.moods.includes(m);
                  return (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setDraft({ ...draft, moods: on ? draft.moods.filter((x) => x !== m) : [...draft.moods, m] })}
                      className={`rounded-full px-3 py-1 text-sm ${on ? "bg-stone-900 text-white" : "bg-stone-100"}`}
                    >
                      {MOOD_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.is_bestseller} onChange={(e) => setDraft({ ...draft, is_bestseller: e.target.checked })} />
                ⭐ Show in “Start here”
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.is_combo} onChange={(e) => setDraft({ ...draft, is_combo: e.target.checked })} />
                💚 It&apos;s a combo
              </label>
            </div>
            <Field label="Badge (optional, e.g. #1 ordered, Try this first)">
              <input maxLength={24} value={draft.badge ?? ""} onChange={(e) => setDraft({ ...draft, badge: e.target.value })} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort order">
                <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} className="input" />
              </Field>
              <label className="flex items-end gap-2 pb-2">
                <input type="checkbox" checked={draft.is_available} onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })} />
                Available
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setDraft(null)} className="flex-1 rounded-lg border border-stone-300 py-2.5">
                Cancel
              </button>
              <button className="flex-1 rounded-lg bg-stone-900 py-2.5 font-medium text-white">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-stone-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
