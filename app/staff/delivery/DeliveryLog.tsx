"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { formatINR } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { MenuItem } from "@/lib/types";

// Zomato / Swiggy / phone orders, typed in so the café sees all its food revenue.
// Prices are what was charged on that platform, so they're editable per line.

type Platform = "zomato" | "swiggy" | "phone" | "other";
const PLATFORMS: { key: Platform; label: string; chip: string }[] = [
  { key: "zomato", label: "Zomato", chip: "bg-red-50 text-red-700 ring-red-200" },
  { key: "swiggy", label: "Swiggy", chip: "bg-orange-50 text-orange-700 ring-orange-200" },
  { key: "phone", label: "Phone / own", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  { key: "other", label: "Other", chip: "bg-stone-100 text-stone-700 ring-stone-200" },
];
const platformOf = (k: string) => PLATFORMS.find((p) => p.key === k) ?? PLATFORMS[3];

type DeliveryRow = {
  id: string;
  platform: Platform;
  ref: string | null;
  note: string | null;
  ordered_at: string;
  total_paise: number;
  voided_at: string | null;
  void_reason: string | null;
  delivery_items: { id: string; name: string; qty: number; price_paise: number }[];
};

type Line = { key: string; menu_item_id: string | null; name: string; qty: number; price: string }; // price in ₹, as typed

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const toPaise = (rupees: string) => {
  const n = Number(rupees);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};

const MESSAGES: Record<string, string> = {
  invalid_cart: "Add at least one dish.",
  invalid_date: "The time can't be in the future or more than a month back.",
  forbidden: "This login can't record deliveries.",
  not_found: "That entry was already removed.",
};
const friendly = (m: string) =>
  MESSAGES[m] ??
  (/check constraint/.test(m) ? "Check each dish has a name, a quantity of at least 1, and a price." : /add_delivery_order|delivery_orders/.test(m) ? "Delivery isn't set up in the database yet." : m);

export default function DeliveryLog() {
  const supabase = supabaseBrowser();
  const [day, setDay] = useState("");
  const [today, setToday] = useState("");
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(todayISO());
    setToday(todayISO());
    void supabase
      .from("menu_items")
      .select("*")
      .order("name")
      .then(({ data }) => setMenu((data ?? []) as MenuItem[]));
  }, [supabase]);

  const load = useCallback(
    async (d: string) => {
      if (!d) return;
      setLoading(true);
      const start = new Date(`${d}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("*, delivery_items(id, name, qty, price_paise)")
        .gte("ordered_at", start.toISOString())
        .lt("ordered_at", end.toISOString())
        .order("ordered_at", { ascending: false });
      setLoading(false);
      if (error) setError(friendly(error.message));
      else {
        setError(null);
        setRows((data ?? []) as DeliveryRow[]);
      }
    },
    [supabase],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(day);
  }, [day, load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }

  async function remove(row: DeliveryRow) {
    const { error } = await supabase.rpc("void_delivery_order", { p_id: row.id, p_reason: "Entered by mistake" });
    if (error) setError(friendly(error.message));
    else showToast("Entry removed from totals");
    void load(day);
  }

  const counted = rows.filter((r) => !r.voided_at);
  const sum = (p?: Platform) => counted.filter((r) => !p || r.platform === p).reduce((s, r) => s + r.total_paise, 0);
  const isToday = day === today;

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-stone-900">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delivery</h1>
            <p className="text-sm text-stone-500">Record Zomato, Swiggy and phone orders to track all food sales.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={day}
              max={today || undefined}
              onChange={(e) => setDay(e.target.value)}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-900"
            />
            <button onClick={() => setAdding(true)} className="h-11 rounded-xl bg-stone-900 px-5 text-sm font-bold text-white hover:bg-stone-800">
              + Add delivery order
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={`Orders${isToday ? " today" : ""}`} value={String(counted.length)} />
          <Stat label="Total sales" value={formatINR(sum())} strong />
          <Stat label="Zomato" value={formatINR(sum("zomato"))} />
          <Stat label="Swiggy" value={formatINR(sum("swiggy"))} />
          <Stat label="Phone / other" value={formatINR(sum("phone") + sum("other"))} />
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

        <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {loading ? (
            <p className="p-8 text-center text-stone-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-stone-400">No delivery orders on this day.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map((r) => (
                <li key={r.id} className={`flex items-start gap-4 px-4 py-3 ${r.voided_at ? "opacity-50" : ""}`}>
                  <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${platformOf(r.platform).chip}`}>
                    {platformOf(r.platform).label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${r.voided_at ? "line-through" : ""}`}>
                      {r.delivery_items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                    </div>
                    <div className="text-xs text-stone-500">
                      {new Date(r.ordered_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                      {r.ref && ` · #${r.ref}`}
                      {r.note && ` · ${r.note}`}
                      {r.voided_at && <span className="font-semibold text-red-600"> · removed{r.void_reason ? ` (${r.void_reason})` : ""}</span>}
                    </div>
                  </div>
                  <div className={`font-bold tabular-nums ${r.voided_at ? "line-through" : ""}`}>{formatINR(r.total_paise)}</div>
                  {!r.voided_at && <RemoveButton onConfirm={() => remove(r)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {adding && (
        <AddDelivery
          menu={menu}
          onClose={() => setAdding(false)}
          onSaved={(total) => {
            setAdding(false);
            showToast(`Saved · ${formatINR(total)}`);
            if (day !== today) setDay(today);
            else void load(day);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${strong ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-200"}`}>
      <div className={`text-xs font-semibold ${strong ? "text-stone-300" : "text-stone-500"}`}>{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

// Tap once to arm, again within 4 s to remove (no browser pop-up).
function RemoveButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${armed ? "bg-red-600 text-white" : "text-stone-400 ring-1 ring-stone-200 hover:text-stone-700"}`}
    >
      {armed ? "Tap again" : "Remove"}
    </button>
  );
}

/* ───────────────────────── add form ───────────────────────── */

let nextKey = 0;

function AddDelivery({ menu, onClose, onSaved }: { menu: MenuItem[]; onClose: () => void; onSaved: (totalPaise: number) => void }) {
  const [platform, setPlatform] = useState<Platform>("zomato");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? menu.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8) : []), [menu, q]);

  function addDish(m: MenuItem) {
    setLines((ls) => {
      const same = ls.find((l) => l.menu_item_id === m.id);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: String(nextKey++), menu_item_id: m.id, name: m.name, qty: 1, price: String(m.price_paise / 100) }];
    });
    setQuery("");
  }
  function addCustom() {
    setLines((ls) => [...ls, { key: String(nextKey++), menu_item_id: null, name: query.trim(), qty: 1, price: "" }]);
    setQuery("");
  }
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => s + (toPaise(l.price) || 0) * l.qty, 0);
  const invalid = lines.find((l) => !l.name.trim() || l.price.trim() === "" || Number.isNaN(toPaise(l.price)));

  async function save() {
    if (!lines.length) return setError("Add at least one dish.");
    if (invalid) return setError(`Fill in the name and price for every dish${invalid.name ? ` (${invalid.name})` : ""}.`);
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("add_delivery_order", {
      p_platform: platform,
      p_items: lines.map((l) => ({ menu_item_id: l.menu_item_id, name: l.name.trim(), qty: l.qty, price_paise: toPaise(l.price) })),
      p_ref: ref,
      p_note: note,
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    onSaved((data as { total_paise: number }).total_paise);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-bold">Add delivery order</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-400 hover:text-stone-800" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${platform === p.key ? "bg-stone-900 text-white ring-stone-900" : `${p.chip}`}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !q) return;
                if (matches[0]) addDish(matches[0]);
                else addCustom();
              }}
              placeholder="Search a dish to add…"
              className="h-12 w-full rounded-xl bg-stone-100 px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
            />
            {q && (
              <ul className="absolute inset-x-0 top-13 z-10 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => addDish(m)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50">
                      <span>{m.name}</span>
                      <span className="text-stone-500 tabular-nums">{formatINR(m.price_paise)}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button onClick={addCustom} className="w-full px-4 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                    + Add “{query.trim()}” as a custom item
                  </button>
                </li>
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 py-6 text-center text-sm text-stone-400">
              Search the menu above, or{" "}
              <button onClick={addCustom} className="font-semibold text-stone-700 underline">
                add a custom item
              </button>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              <li className="grid grid-cols-[1fr_6.5rem_5.5rem_1.5rem] gap-2 px-1 text-[11px] font-semibold text-stone-400 uppercase">
                <span>Dish</span>
                <span className="text-center">Qty</span>
                <span>Price each ₹</span>
                <span />
              </li>
              {lines.map((l) => (
                <li key={l.key} className="grid grid-cols-[1fr_6.5rem_5.5rem_1.5rem] items-center gap-2">
                  <input
                    value={l.name}
                    onChange={(e) => update(l.key, { name: e.target.value })}
                    placeholder="Dish name"
                    maxLength={80}
                    className="h-10 min-w-0 rounded-lg bg-stone-100 px-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
                  />
                  <div className="flex h-10 items-center justify-between rounded-lg bg-stone-100 px-1">
                    <button onClick={() => update(l.key, { qty: Math.max(1, l.qty - 1) })} className="h-8 w-8 rounded-md font-bold hover:bg-white">
                      −
                    </button>
                    <span className="font-semibold tabular-nums">{l.qty}</span>
                    <button onClick={() => update(l.key, { qty: Math.min(100, l.qty + 1) })} className="h-8 w-8 rounded-md font-bold hover:bg-white">
                      +
                    </button>
                  </div>
                  <input
                    value={l.price}
                    onChange={(e) => update(l.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-10 min-w-0 rounded-lg bg-stone-100 px-3 text-right text-sm tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
                  />
                  <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-stone-400 hover:text-red-600" aria-label={`Remove ${l.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              maxLength={40}
              placeholder="Order no. (optional)"
              className="h-11 rounded-xl bg-stone-100 px-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Note (optional)"
              className="h-11 rounded-xl bg-stone-100 px-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
            />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-stone-100 px-5 py-4">
          <div className="flex-1">
            <div className="text-xs text-stone-500">{lines.reduce((n, l) => n + l.qty, 0)} items</div>
            <div className="text-xl font-bold tabular-nums">{formatINR(total)}</div>
          </div>
          <button onClick={save} disabled={busy} className="h-12 rounded-xl bg-emerald-600 px-6 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy ? "Saving…" : "Save order"}
          </button>
        </div>
      </div>
    </div>
  );
}
