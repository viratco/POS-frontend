"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SoundToggle from "@/components/SoundToggle";
import StaffNav from "@/components/StaffNav";
import { chime } from "@/lib/chime";
import { billFor, formatINR, GST_RATE_BPS } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Category, MenuItem, Order, OrderItem, Table } from "@/lib/types";
import { useOrderFeed } from "@/lib/useOrderFeed";
import { acceptOrder, staffAddItems } from "./actions";

type TableState = "empty" | "new_order" | "open" | "ready_to_pay";

const STATE_STYLE: Record<TableState, { label: string; card: string; badge: string }> = {
  empty: { label: "Empty", card: "border-stone-200 bg-white", badge: "bg-stone-100 text-stone-600" },
  new_order: { label: "New order", card: "border-rose-400 bg-rose-50", badge: "bg-rose-500 text-white" },
  open: { label: "Open", card: "border-amber-300 bg-amber-50", badge: "bg-amber-200 text-amber-900" },
  ready_to_pay: { label: "Ready to pay", card: "border-emerald-400 bg-emerald-50", badge: "bg-emerald-200 text-emerald-900" },
};

const STATUS_LABEL: Record<OrderItem["status"], string> = {
  new: "Waiting for OK",
  pending: "In kitchen",
  ready: "Ready to serve",
  served: "Served",
  void: "Removed",
};

function minsAgo(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return m === 0 ? "just now" : `${m} min ago`;
}

const ITEM_STYLE: Record<OrderItem["status"], string> = {
  new: "bg-rose-100 text-rose-800",
  pending: "bg-amber-100 text-amber-900",
  ready: "bg-sky-100 text-sky-900",
  served: "bg-emerald-100 text-emerald-900",
  void: "bg-stone-100 text-stone-500 line-through",
};

export default function Dashboard() {
  const supabase = supabaseBrowser();
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, o] = await Promise.all([
      supabase.from("tables").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("orders").select("*").eq("status", "open"),
    ]);
    if (t.error || o.error) {
      setError((t.error ?? o.error)!.message);
      return;
    }
    const openOrders = (o.data ?? []) as Order[];
    const ids = openOrders.map((x) => x.id);
    const it = ids.length
      ? await supabase.from("order_items").select("*").in("order_id", ids).order("created_at")
      : { data: [], error: null };
    if (it.error) {
      setError(it.error.message);
      return;
    }
    setError(null);
    setTables((t.data ?? []) as Table[]);
    setOrders(openOrders);
    setItems((it.data ?? []) as OrderItem[]);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const live = useOrderFeed(load, (item) => {
    if (item.source === "staff") return;
    chime();
    setFlash((f) => new Set(f).add(item.order_id));
    setTimeout(() => setFlash((f) => {
      const n = new Set(f);
      n.delete(item.order_id);
      return n;
    }), 6000);
  });

  const openByTable = useMemo(() => new Map(orders.map((o) => [o.table_id, o])), [orders]);
  const itemsByOrder = useMemo(() => {
    const m = new Map<string, OrderItem[]>();
    items.forEach((i) => m.set(i.order_id, [...(m.get(i.order_id) ?? []), i]));
    return m;
  }, [items]);

  function stateOf(tableId: string): TableState {
    const order = openByTable.get(tableId);
    if (!order) return "empty";
    const live = (itemsByOrder.get(order.id) ?? []).filter((i) => i.status !== "void");
    if (live.some((i) => i.status === "new")) return "new_order";
    return live.length > 0 && live.every((i) => i.status === "ready" || i.status === "served") ? "ready_to_pay" : "open";
  }

  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Every table with QR items waiting for staff OK, oldest first.
  const waitingOrders = orders
    .map((o) => ({
      order: o,
      table: tables.find((t) => t.id === o.table_id),
      items: (itemsByOrder.get(o.id) ?? []).filter((i) => i.status === "new"),
    }))
    .filter((w) => w.table && w.items.length > 0)
    .sort((a, b) => a.items[0].created_at.localeCompare(b.items[0].created_at));

  async function reject(tableName: string, waiting: OrderItem[]) {
    if (!confirm(`Reject the new order for ${tableName}? It won't be made or billed.`)) return;
    const { error } = await supabase.from("order_items").update({ status: "void" }).in("id", waiting.map((i) => i.id));
    if (error) setError(error.message);
    void load();
  }

  const [accepting, setAccepting] = useState<string | null>(null);
  async function accept(orderId: string) {
    setAccepting(orderId);
    const res = await acceptOrder(orderId);
    setAccepting(null);
    if (!res.ok) setError(res.error);
    void load();
  }

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <StaffNav>
        <span className={`text-xs ${live ? "text-emerald-600" : "text-red-600"}`}>{live ? "● Live" : "● Connecting…"}</span>
        <SoundToggle />
      </StaffNav>
      {error && <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {waitingOrders.length > 0 && (
        <section className="border-b-2 border-rose-200 bg-rose-50 px-4 py-4">
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-rose-900">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600" />
            </span>
            {waitingOrders.length} new order{waitingOrders.length > 1 ? "s" : ""} · check the table, then accept
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {waitingOrders.map(({ order, table, items: waiting }) => (
              <div key={order.id} className="flex flex-col rounded-xl border-2 border-rose-300 bg-white p-4 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold">{table!.name}</span>
                  <span className="text-sm text-stone-500">{now ? minsAgo(waiting[0].created_at, now) : ""}</span>
                </div>
                <ul className="mt-2 flex-1 space-y-1">
                  {waiting.map((i) => (
                    <li key={i.id} className="text-[15px]">
                      <span className="font-semibold">{i.qty} ×</span> {i.name_snapshot}
                      {i.note && <span className="block pl-6 text-sm text-amber-700">“{i.note}”</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <button
                    disabled={accepting === order.id}
                    onClick={() => accept(order.id)}
                    className="flex-1 rounded-lg bg-emerald-600 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
                  >
                    {accepting === order.id ? "Sending…" : "✓ Accept & send to kitchen"}
                  </button>
                  <button
                    disabled={accepting === order.id}
                    onClick={() => reject(table!.name, waiting)}
                    className="rounded-lg border-2 border-stone-200 px-4 py-3 font-semibold text-stone-600 hover:bg-stone-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        <section className="grid flex-1 grid-cols-2 content-start gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
          {tables.map((t) => {
            const order = openByTable.get(t.id);
            const orderItems = order ? itemsByOrder.get(order.id) ?? [] : [];
            const live = orderItems.filter((i) => i.status !== "void");
            const s = STATE_STYLE[stateOf(t.id)];
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(t.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedId(t.id)}
                className={`cursor-pointer rounded-xl border-2 p-4 text-left transition ${s.card} ${selectedId === t.id ? "ring-2 ring-stone-900" : ""} ${order && flash.has(order.id) ? "animate-pulse" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-lg font-semibold">{t.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.badge}`}>{s.label}</span>
                </div>
                {order ? (
                  <div className="mt-3 text-sm text-stone-600">
                    {live.reduce((n, i) => n + i.qty, 0)} items ·{" "}
                    <span className="font-medium text-stone-900">{formatINR(billFor(orderItems).total)}</span>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-stone-400">—</div>
                )}
                {stateOf(t.id) === "new_order" && (
                  <div className="mt-2 text-sm font-semibold text-rose-700">Needs your OK ↑</div>
                )}
              </div>
            );
          })}
        </section>

        {selected && (
          <OrderPanel
            key={selected.id}
            table={selected}
            order={openByTable.get(selected.id) ?? null}
            items={(openByTable.get(selected.id) && itemsByOrder.get(openByTable.get(selected.id)!.id)) || []}
            onClose={() => setSelectedId(null)}
            onChanged={load}
            onAccept={accept}
            accepting={accepting === openByTable.get(selected.id)?.id}
          />
        )}
      </div>
    </div>
  );
}

function OrderPanel({
  table,
  order,
  items,
  onClose,
  onChanged,
  onAccept,
  accepting,
}: {
  table: Table;
  order: Order | null;
  items: OrderItem[];
  onClose: () => void;
  onChanged: () => void;
  onAccept: (orderId: string) => Promise<void>;
  accepting: boolean;
}) {
  const supabase = supabaseBrowser();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bill = billFor(items);
  const waiting = items.filter((i) => i.status === "new");
  const sent = items.filter((i) => i.status !== "new");

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error.message);
    onChanged();
    return !error;
  }

  const setItemStatus = (id: string, status: OrderItem["status"]) =>
    run(() => supabase.from("order_items").update({ status }).eq("id", id));

  async function pay(method: "upi" | "cash") {
    if (!order) return;
    const ok = await run(() =>
      supabase.rpc("close_order", { p_order_id: order.id, p_method: method, p_gst_rate_bps: GST_RATE_BPS }),
    );
    if (ok) {
      setPaying(false);
      onClose();
    }
  }

  async function cancelOrder() {
    if (!order || !confirm(`Cancel the whole order for ${table.name}? This can't be undone.`)) return;
    const ok = await run(() =>
      supabase.from("orders").update({ status: "cancelled", closed_at: new Date().toISOString() }).eq("id", order.id),
    );
    if (ok) onClose();
  }

  return (
    <aside className="w-full border-t border-stone-200 bg-white p-5 lg:w-[420px] lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{table.name}</h2>
        <button onClick={onClose} className="text-sm text-stone-500">
          Close
        </button>
      </div>
      {order && (
        <p className="text-xs text-stone-500">Opened {new Date(order.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" })}</p>
      )}

      {order && waiting.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
          <p className="font-bold text-rose-900">New order · waiting for your OK</p>
          <ul className="mt-2 space-y-1.5">
            {waiting.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-[15px]">
                <span>
                  <span className="font-semibold">{i.qty} ×</span> {i.name_snapshot}
                  {i.note && <span className="block pl-6 text-sm text-amber-700">“{i.note}”</span>}
                </span>
                <span className="tabular-nums text-stone-600">{formatINR(i.price_paise_snapshot * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              disabled={accepting || busy}
              onClick={() => onAccept(order.id)}
              className="flex-1 rounded-lg bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {accepting ? "Sending…" : "✓ Accept & send to kitchen"}
            </button>
            <button
              disabled={accepting || busy}
              onClick={() =>
                confirm(`Reject ${waiting.length} waiting item(s) for ${table.name}?`) &&
                run(() => supabase.from("order_items").update({ status: "void" }).in("id", waiting.map((i) => i.id)))
              }
              className="rounded-lg border-2 border-stone-200 bg-white px-4 py-3 font-semibold text-stone-600 hover:bg-stone-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {sent.length === 0 ? (
        waiting.length === 0 && <p className="mt-6 text-stone-500">No items yet.</p>
      ) : (
        <>
        <h3 className="mt-5 text-xs font-semibold tracking-wider text-stone-500 uppercase">Sent to kitchen</h3>
        <ul className="mt-1 divide-y divide-stone-100">
          {sent.map((i) => (
            <li key={i.id} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className={i.status === "void" ? "text-stone-400 line-through" : ""}>
                  <div className="font-medium">
                    {i.qty} × {i.name_snapshot}
                  </div>
                  {i.note && <div className="text-sm text-stone-500">“{i.note}”</div>}
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${ITEM_STYLE[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                    {i.source === "staff" && <span className="text-stone-400">added by staff</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">{formatINR(i.price_paise_snapshot * i.qty)}</div>
                  {i.status !== "void" && (
                    <div className="mt-1 flex justify-end gap-2 text-xs">
                      {i.status !== "served" && i.status !== "new" && (
                        <button disabled={busy} onClick={() => setItemStatus(i.id, "served")} className="text-emerald-700 hover:underline">
                          Served
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => confirm(`Remove ${i.name_snapshot}?`) && setItemStatus(i.id, "void")}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {order && (
        <dl className="mt-4 space-y-1 border-t border-stone-200 pt-3 text-sm">
          <Row label="Subtotal" value={formatINR(bill.subtotal)} />
          <Row label={`GST (${bill.rateBps / 100}%)`} value={formatINR(bill.gst)} />
          <Row label="Grand total" value={formatINR(bill.total)} strong />
        </dl>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-2">
        <button onClick={() => setAdding(true)} className="rounded-lg border border-stone-300 py-2.5 font-medium">
          + Add item
        </button>
        {order && !paying && (
          <button
            disabled={busy || bill.subtotal === 0}
            onClick={() => setPaying(true)}
            className="rounded-lg bg-emerald-600 py-2.5 font-medium text-white disabled:opacity-50"
          >
            Mark paid & close table
          </button>
        )}
        {paying && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-sm">
              Collect <strong>{formatINR(bill.total)}</strong> by:
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button disabled={busy} onClick={() => pay("upi")} className="rounded-lg bg-emerald-600 py-2 text-white">
                UPI
              </button>
              <button disabled={busy} onClick={() => pay("cash")} className="rounded-lg bg-emerald-600 py-2 text-white">
                Cash
              </button>
              <button onClick={() => setPaying(false)} className="rounded-lg border border-stone-300 py-2">
                Back
              </button>
            </div>
          </div>
        )}
        {order && (
          <button disabled={busy} onClick={cancelOrder} className="py-2 text-sm text-red-600 hover:underline">
            Cancel order
          </button>
        )}
      </div>

      {adding && <AddItemDialog tableId={table.id} tableName={table.name} onDone={() => { setAdding(false); onChanged(); }} />}
    </aside>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : "text-stone-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function AddItemDialog({ tableId, tableName, onDone }: { tableId: string; tableName: string; onDone: () => void }) {
  const supabase = supabaseBrowser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").eq("is_available", true).order("sort_order"),
    ]).then(([c, m]) => {
      setCategories((c.data ?? []) as Category[]);
      setMenu((m.data ?? []) as MenuItem[]);
    });
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemId) return;
    setBusy(true);
    const res = await staffAddItems(tableId, [{ menu_item_id: itemId, qty, note: note.trim() || null }]);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onDone}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5">
        <h3 className="text-lg font-semibold">Add item · {tableName}</h3>
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          required
          className="mt-4 w-full rounded-lg border border-stone-300 px-3 py-2.5"
        >
          <option value="">Choose an item…</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {menu
                .filter((m) => m.category_id === c.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {formatINR(m.price_paise)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div className="mt-3 flex gap-3">
          <input
            type="number"
            min={1}
            max={50}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-20 rounded-lg border border-stone-300 px-3 py-2.5"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Note (optional)"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2.5"
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onDone} className="flex-1 rounded-lg border border-stone-300 py-2.5">
            Cancel
          </button>
          <button disabled={busy || !itemId} className="flex-1 rounded-lg bg-stone-900 py-2.5 font-medium text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
