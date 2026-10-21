"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DietMark } from "@/components/MenuMarks";
import SoundToggle from "@/components/SoundToggle";
import StaffNav from "@/components/StaffNav";
import { chime } from "@/lib/chime";
import { kitchenTicket, openWhatsApp, setWhatsappOnAccept, whatsappOnAccept } from "@/lib/kitchenWhatsApp";
import { billFor, formatINR, GST_RATE_BPS } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Category, MenuItem, Order, OrderItem, Table } from "@/lib/types";
import { useOrderFeed } from "@/lib/useOrderFeed";
import { acceptOrder, staffAddItems } from "./actions";

/* ───────────────────────── table states ───────────────────────── */

// Each state maps to the one thing staff should do next.
type TableState = "available" | "new_order" | "food_ready" | "in_kitchen" | "served";

const STATE: Record<TableState, { label: string; hint: string; stripe: string; chip: string; dot: string }> = {
  new_order: { label: "New order", hint: "Check & accept", stripe: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  food_ready: { label: "Food ready", hint: "Serve now", stripe: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  in_kitchen: { label: "In kitchen", hint: "Being cooked", stripe: "bg-amber-400", chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-400" },
  served: { label: "Served", hint: "Bill when asked", stripe: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  available: { label: "Available", hint: "", stripe: "bg-stone-200", chip: "bg-stone-100 text-stone-500 ring-stone-200", dot: "bg-stone-300" },
};

function stateOf(items: OrderItem[] | undefined): TableState {
  if (!items) return "available";
  const live = items.filter((i) => i.status !== "void");
  if (live.some((i) => i.status === "new")) return "new_order";
  if (live.some((i) => i.status === "ready")) return "food_ready";
  if (live.length === 0 || live.some((i) => i.status === "pending")) return "in_kitchen";
  return "served";
}

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (m === 0) return "just now";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

type Filter = "all" | "action" | "occupied" | "available";

/* ───────────────────────── dashboard ───────────────────────── */

export default function Dashboard() {
  const supabase = supabaseBrowser();
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [salesToday, setSalesToday] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [waOn, setWaOn] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaOn(whatsappOnAccept());
  }, []);
  function toggleWa() {
    setWaOn((v) => {
      setWhatsappOnAccept(!v);
      return !v;
    });
  }

  const load = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [t, o, p] = await Promise.all([
      supabase.from("tables").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("orders").select("*").eq("status", "open"),
      supabase.from("payments").select("amount_paise").gte("received_at", startOfDay.toISOString()),
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
    setSalesToday(((p.data ?? []) as { amount_paise: number }[]).reduce((s, x) => s + x.amount_paise, 0));
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const live = useOrderFeed(load, (item) => {
    if (item.source === "staff") return;
    chime();
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const openByTable = useMemo(() => new Map(orders.map((o) => [o.table_id, o])), [orders]);
  const itemsByOrder = useMemo(() => {
    const m = new Map<string, OrderItem[]>();
    items.forEach((i) => m.set(i.order_id, [...(m.get(i.order_id) ?? []), i]));
    return m;
  }, [items]);

  const rows = tables.map((t) => {
    const order = openByTable.get(t.id) ?? null;
    const orderItems = order ? (itemsByOrder.get(order.id) ?? []) : undefined;
    return { table: t, order, items: orderItems ?? [], state: stateOf(orderItems) };
  });

  const waitingOrders = rows
    .map((r) => ({ ...r, waiting: r.items.filter((i) => i.status === "new") }))
    .filter((r) => r.order && r.waiting.length > 0)
    .sort((a, b) => a.waiting[0].created_at.localeCompare(b.waiting[0].created_at));

  const qtyWhere = (st: OrderItem["status"]) => items.filter((i) => i.status === st).reduce((n, i) => n + i.qty, 0);
  const counts = {
    occupied: rows.filter((r) => r.order).length,
    action: rows.filter((r) => r.state === "new_order" || r.state === "food_ready").length,
    available: rows.filter((r) => !r.order).length,
    readyItems: qtyWhere("ready"),
    kitchenItems: qtyWhere("pending"),
  };

  const visibleRows = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "action"
        ? r.state === "new_order" || r.state === "food_ready"
        : filter === "occupied"
          ? !!r.order
          : !r.order,
  );

  async function accept(orderId: string, tableName: string, waiting: OrderItem[]) {
    // Open WhatsApp before any await, while we're still inside the tap (or browsers block it).
    if (waOn) openWhatsApp(kitchenTicket(tableName, waiting, "qr"));
    setAccepting(orderId);
    const res = await acceptOrder(orderId);
    setAccepting(null);
    if (!res.ok) setError(res.error);
    else showToast(waOn ? `✓ ${tableName} accepted · now tap Send in WhatsApp` : `✓ ${tableName} sent to kitchen`);
    void load();
  }

  async function reject(tableName: string, waiting: OrderItem[]) {
    if (!confirm(`Reject the new order for ${tableName}? It won't be made or billed.`)) return;
    const { error } = await supabase.from("order_items").update({ status: "void" }).in("id", waiting.map((i) => i.id));
    if (error) setError(error.message);
    else showToast(`${tableName} order rejected`);
    void load();
  }

  const selected = rows.find((r) => r.table.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-stone-900">
      <StaffNav>
        <span
          className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:flex ${
            live ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "animate-pulse bg-red-500"}`} />
          {live ? "Live" : "Reconnecting…"}
        </span>
        <WhatsAppToggle on={waOn} onToggle={toggleWa} />
        <SoundToggle />
      </StaffNav>

      <main className="mx-auto max-w-[1400px] px-4 pt-5 pb-16 sm:px-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
            <button onClick={() => setError(null)} className="font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {/* At a glance */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Tables in use" value={`${counts.occupied}/${tables.length}`} />
          <Stat label="New orders" value={String(waitingOrders.length)} tone={waitingOrders.length ? "rose" : undefined} />
          <Stat label="Ready to serve" value={`${counts.readyItems} items`} tone={counts.readyItems ? "sky" : undefined} />
          <Stat label="In kitchen" value={`${counts.kitchenItems} items`} />
          <Stat label="Today's sales" value={formatINR(salesToday)} className="col-span-2 md:col-span-1" />
        </div>

        {/* 1. New orders need an OK first */}
        {waitingOrders.length > 0 && (
          <section className="mt-6">
            <h2 className="flex flex-wrap items-center gap-x-2.5 text-lg font-bold">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600" />
              </span>
              New orders
              <span className="text-sm font-medium text-stone-500">Check the guests are seated, then accept</span>
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {waitingOrders.map(({ order, table, waiting }) => (
                <div key={order!.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-2 ring-rose-200">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold tracking-tight">{table.name}</span>
                    <span className="text-sm font-medium text-rose-600">{now ? ago(waiting[0].created_at, now) : ""}</span>
                  </div>
                  <ul className="mt-2 flex-1 space-y-1.5">
                    {waiting.map((i) => (
                      <li key={i.id} className="text-[15px] leading-snug">
                        <span className="font-bold">{i.qty}×</span> {i.name_snapshot}
                        {i.note && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{i.note}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={accepting === order!.id}
                      onClick={() => accept(order!.id, table.name, waiting)}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[15px] font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
                    >
                      {accepting === order!.id ? "Sending…" : "✓ Accept & send to kitchen"}
                    </button>
                    <button
                      disabled={accepting === order!.id}
                      onClick={() => reject(table.name, waiting)}
                      className="h-12 rounded-xl px-4 font-semibold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. All tables */}
        <section className="mt-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Tables</h2>
            <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-stone-200">
              {(
                [
                  ["all", "All", tables.length],
                  ["action", "Needs action", counts.action],
                  ["occupied", "In use", counts.occupied],
                  ["available", "Available", counts.available],
                ] as const
              ).map(([key, label, n]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    filter === key ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 text-xs ${filter === key ? "bg-white/20" : "bg-stone-100"}`}>{n}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visibleRows.map((r) => (
              <TableCard key={r.table.id} {...r} now={now} selected={r.table.id === selectedId} onClick={() => setSelectedId(r.table.id)} />
            ))}
            {visibleRows.length === 0 && (
              <p className="col-span-full rounded-2xl bg-white py-10 text-center text-stone-400 ring-1 ring-stone-200">Nothing here right now.</p>
            )}
          </div>

          <Legend />
        </section>
      </main>

      {selected && (
        <TableDrawer
          key={selected.table.id}
          table={selected.table}
          order={selected.order}
          items={selected.items}
          state={selected.state}
          now={now}
          accepting={!!selected.order && accepting === selected.order.id}
          onAccept={(waiting) => selected.order && accept(selected.order.id, selected.table.name, waiting)}
          waOn={waOn}
          onClose={() => setSelectedId(null)}
          onChanged={load}
          toast={showToast}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-toast rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold whitespace-nowrap text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, className = "" }: { label: string; value: string; tone?: "rose" | "sky"; className?: string }) {
  const toneCls =
    tone === "rose" ? "bg-rose-50 ring-rose-200 text-rose-700" : tone === "sky" ? "bg-sky-50 ring-sky-200 text-sky-700" : "bg-white ring-stone-200";
  return (
    <div className={`rounded-2xl px-4 py-3 shadow-sm ring-1 ${toneCls} ${className}`}>
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function Legend() {
  const order: TableState[] = ["new_order", "food_ready", "in_kitchen", "served", "available"];
  return (
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-500">
      {order.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE[s].dot}`} />
          <span className="font-semibold text-stone-700">{STATE[s].label}</span>
          {STATE[s].hint && <span>· {STATE[s].hint}</span>}
        </span>
      ))}
    </div>
  );
}

function TableCard({
  table,
  order,
  items,
  state,
  now,
  selected,
  onClick,
}: {
  table: Table;
  order: Order | null;
  items: OrderItem[];
  state: TableState;
  now: number;
  selected: boolean;
  onClick: () => void;
}) {
  const s = STATE[state];
  const n = (st: OrderItem["status"]) => items.filter((i) => i.status === st).reduce((c, i) => c + i.qty, 0);
  const liveCount = items.filter((i) => i.status !== "void").reduce((c, i) => c + i.qty, 0);
  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-[148px] flex-col overflow-hidden rounded-2xl p-4 pl-5 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${
        selected ? "ring-2 ring-stone-900" : "ring-stone-200"
      } ${order ? "bg-white" : "bg-white/60"}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${s.stripe} ${state === "new_order" ? "animate-pulse" : ""}`} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xl font-bold tracking-tight">{table.name}</div>
          <div className="mt-0.5 text-xs font-medium text-stone-400">{order ? `Open ${now ? ago(order.created_at, now) : ""}` : "Free"}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${s.chip}`}>{s.label}</span>
      </div>

      {order ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
            {n("new") > 0 && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-700">{n("new")} waiting</span>}
            {n("ready") > 0 && <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700">{n("ready")} ready</span>}
            {n("pending") > 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">{n("pending")} cooking</span>}
            {n("served") > 0 && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">{n("served")} served</span>}
          </div>
          <div className="mt-auto flex items-end justify-between pt-3">
            <span className="text-sm text-stone-500">{liveCount} items</span>
            <span className="text-xl font-bold tabular-nums">{formatINR(billFor(items).total)}</span>
          </div>
        </>
      ) : (
        <div className="mt-auto flex items-center gap-1.5 pt-3 text-sm font-medium text-stone-400">
          <span className="text-lg leading-none">+</span> Start an order
        </div>
      )}
    </button>
  );
}

/* ───────────────────────── table drawer ───────────────────────── */

function TableDrawer({
  table,
  order,
  items,
  state,
  now,
  accepting,
  onAccept,
  waOn,
  onClose,
  onChanged,
  toast,
}: {
  table: Table;
  order: Order | null;
  items: OrderItem[];
  state: TableState;
  now: number;
  accepting: boolean;
  onAccept: (waiting: OrderItem[]) => void;
  waOn: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: (msg: string) => void;
}) {
  const supabase = supabaseBrowser();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const bill = billFor(items);

  const group = (st: OrderItem["status"]) => items.filter((i) => i.status === st);
  const waiting = group("new");
  const ready = group("ready");
  const cooking = group("pending");
  const served = group("served");
  const removed = group("void");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, done?: string) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error.message);
    else if (done) toast(done);
    onChanged();
    return !error;
  }

  const setStatus = (ids: string[], status: OrderItem["status"], done?: string) =>
    run(() => supabase.from("order_items").update({ status }).in("id", ids), done);

  async function cancelOrder() {
    if (!order || !confirm(`Cancel the whole order for ${table.name}? Nothing will be billed. This can't be undone.`)) return;
    const ok = await run(
      () => supabase.from("orders").update({ status: "cancelled", closed_at: new Date().toISOString() }).eq("id", order.id),
      `${table.name} order cancelled`,
    );
    if (ok) onClose();
  }

  const liveQty = items.filter((i) => i.status !== "void").reduce((n, i) => n + i.qty, 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-stone-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[460px] animate-slide-in flex-col bg-[#fbfaf8] shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 pt-5 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold tracking-tight">{table.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATE[state].chip}`}>{STATE[state].label}</span>
            </div>
            <p className="mt-1 text-sm text-stone-500">{order ? `Open ${now ? ago(order.created_at, now) : ""} · ${liveQty} items` : "No order yet"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

          {!order && (
            <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-stone-200">
              <div className="text-4xl">🍽️</div>
              <p className="mt-3 font-semibold">This table is free</p>
              <p className="mt-1 text-sm text-stone-500">Guests can scan the QR, or you can take their order here.</p>
              <button onClick={() => setAdding(true)} className="mt-5 h-12 rounded-xl bg-stone-900 px-6 font-bold text-white">
                + Take an order
              </button>
            </div>
          )}

          {waiting.length > 0 && (
            <Section title="Waiting for your OK" tone="rose" count={waiting.length}>
              {waiting.map((i) => (
                <ItemLine key={i.id} item={i} />
              ))}
              <div className="flex gap-2 pt-3">
                <button
                  disabled={accepting || busy}
                  onClick={() => onAccept(waiting)}
                  className="h-12 flex-1 rounded-xl bg-emerald-600 font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
                >
                  {accepting ? "Sending…" : "✓ Accept & send to kitchen"}
                </button>
                <button
                  disabled={accepting || busy}
                  onClick={() =>
                    confirm(`Reject the new order for ${table.name}?`) &&
                    setStatus(
                      waiting.map((i) => i.id),
                      "void",
                      "Order rejected",
                    )
                  }
                  className="h-12 rounded-xl bg-white px-4 font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50"
                >
                  Reject
                </button>
              </div>
            </Section>
          )}

          {ready.length > 0 && (
            <Section
              title="Ready to serve"
              tone="sky"
              count={ready.length}
              action={
                <button
                  disabled={busy}
                  onClick={() =>
                    setStatus(
                      ready.map((i) => i.id),
                      "served",
                      "Marked as served",
                    )
                  }
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                >
                  Serve all
                </button>
              }
            >
              {ready.map((i) => (
                <ItemLine
                  key={i.id}
                  item={i}
                  onServe={() => setStatus([i.id], "served")}
                  onRemove={() => confirm(`Remove ${i.name_snapshot}?`) && setStatus([i.id], "void")}
                  busy={busy}
                />
              ))}
            </Section>
          )}

          {cooking.length > 0 && (
            <Section
              title="In kitchen"
              tone="amber"
              count={cooking.length}
              action={
                <button
                  onClick={() => openWhatsApp(kitchenTicket(table.name, cooking, "qr").replace("NEW ORDER", "REMINDER"))}
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
                >
                  Resend on WhatsApp
                </button>
              }
            >
              {cooking.map((i) => (
                <ItemLine
                  key={i.id}
                  item={i}
                  sub={now ? `sent ${ago(i.accepted_at ?? i.created_at, now)}` : undefined}
                  onServe={() => setStatus([i.id], "served")}
                  onRemove={() => confirm(`Remove ${i.name_snapshot}? Tell the kitchen if they've started it.`) && setStatus([i.id], "void")}
                  busy={busy}
                />
              ))}
            </Section>
          )}

          {served.length > 0 && (
            <Section title="Served" tone="emerald" count={served.length}>
              {served.map((i) => (
                <ItemLine key={i.id} item={i} onRemove={() => confirm(`Remove ${i.name_snapshot} from the bill?`) && setStatus([i.id], "void")} busy={busy} />
              ))}
            </Section>
          )}

          {removed.length > 0 && (
            <button onClick={() => setShowRemoved((v) => !v)} className="text-sm font-medium text-stone-400 hover:text-stone-600">
              {showRemoved ? "Hide" : "Show"} {removed.length} removed item{removed.length > 1 ? "s" : ""}
            </button>
          )}
          {showRemoved && (
            <div className="rounded-2xl bg-white px-4 py-1 opacity-60 ring-1 ring-stone-200">
              {removed.map((i) => (
                <ItemLine key={i.id} item={i} />
              ))}
            </div>
          )}

          {order && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <Row label="Subtotal" value={formatINR(bill.subtotal)} />
              <Row label={`GST (${bill.rateBps / 100}%)`} value={formatINR(bill.gst)} />
              <div className="my-2 border-t border-dashed border-stone-200" />
              <Row label="Total" value={formatINR(bill.total)} strong />
              {waiting.length > 0 && <p className="mt-2 text-xs text-rose-600">Items waiting for your OK aren&apos;t billed until accepted.</p>}
            </div>
          )}
        </div>

        {/* footer actions */}
        {order && (
          <div className="border-t border-stone-200 bg-white px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex gap-2">
              <button onClick={() => setAdding(true)} className="h-14 rounded-xl px-5 font-bold text-stone-800 ring-1 ring-stone-300 transition hover:bg-stone-50">
                + Add
              </button>
              <button
                disabled={busy || bill.subtotal === 0}
                onClick={() => setPaying(true)}
                className="flex h-14 flex-1 items-center justify-between rounded-xl bg-stone-900 px-5 font-bold text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40"
              >
                <span>Take payment</span>
                <span className="tabular-nums">{formatINR(bill.total)}</span>
              </button>
            </div>
            <button disabled={busy} onClick={cancelOrder} className="mt-3 w-full text-center text-sm font-medium text-stone-400 hover:text-red-600">
              Cancel this order
            </button>
          </div>
        )}
      </aside>

      {adding && (
        <AddItemsModal
          tableId={table.id}
          tableName={table.name}
          waOn={waOn}
          onClose={() => setAdding(false)}
          onAdded={(n) => {
            setAdding(false);
            toast(`✓ ${n} item${n > 1 ? "s" : ""} sent to kitchen`);
            onChanged();
          }}
        />
      )}

      {paying && order && (
        <PaymentModal
          tableName={table.name}
          bill={bill}
          waitingCount={waiting.length}
          busy={busy}
          onClose={() => setPaying(false)}
          onPay={async (method) => {
            const ok = await run(
              () => supabase.rpc("close_order", { p_order_id: order.id, p_method: method, p_gst_rate_bps: GST_RATE_BPS }),
              `✓ ${table.name} paid by ${method === "upi" ? "UPI" : "cash"} · table is free`,
            );
            if (ok) {
              setPaying(false);
              onClose();
            }
          }}
        />
      )}
    </div>
  );
}

const SECTION_TONE = {
  rose: { box: "bg-rose-50/60 ring-rose-200", title: "text-rose-700" },
  sky: { box: "bg-sky-50/60 ring-sky-200", title: "text-sky-700" },
  amber: { box: "bg-white ring-stone-200", title: "text-amber-700" },
  emerald: { box: "bg-white ring-stone-200", title: "text-emerald-700" },
};

function Section({
  title,
  tone,
  count,
  action,
  children,
}: {
  title: string;
  tone: keyof typeof SECTION_TONE;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = SECTION_TONE[tone];
  return (
    <section className={`rounded-2xl px-4 pt-3 pb-2 ring-1 ${t.box}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-xs font-bold tracking-wider uppercase ${t.title}`}>
          {title} <span className="opacity-60">· {count}</span>
        </h3>
        {action}
      </div>
      <div className="divide-y divide-stone-100">{children}</div>
    </section>
  );
}

function ItemLine({
  item,
  sub,
  onServe,
  onRemove,
  busy,
}: {
  item: OrderItem;
  sub?: string;
  onServe?: () => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const meta = [sub, item.source === "staff" ? "added by staff" : null].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] leading-snug ${item.status === "void" ? "line-through" : ""}`}>
          <span className="font-bold">{item.qty}×</span> {item.name_snapshot}
        </div>
        {item.note && <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{item.note}</div>}
        {meta && <div className="mt-0.5 text-xs text-stone-400">{meta}</div>}
      </div>
      <div className="pt-px text-right text-[15px] font-semibold tabular-nums">{formatINR(item.price_paise_snapshot * item.qty)}</div>
      {(onServe || onRemove) && (
        <div className="-my-1 flex gap-1">
          {onServe && (
            <IconButton title="Mark served" disabled={busy} onClick={onServe} className="text-emerald-600 hover:bg-emerald-50">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </IconButton>
          )}
          {onRemove && (
            <IconButton title="Remove" disabled={busy} onClick={onRemove} className="text-stone-400 hover:bg-red-50 hover:text-red-600">
              <path d="M6 6l12 12M18 6L6 18" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${strong ? "text-lg font-bold" : "text-sm text-stone-500"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/* ───────────────────────── modals ───────────────────────── */

function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-stone-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full animate-rise flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        {children}
      </div>
    </div>
  );
}

function PaymentModal({
  tableName,
  bill,
  waitingCount,
  busy,
  onClose,
  onPay,
}: {
  tableName: string;
  bill: ReturnType<typeof billFor>;
  waitingCount: number;
  busy: boolean;
  onClose: () => void;
  onPay: (method: "upi" | "cash") => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <p className="text-sm font-semibold text-stone-500">Take payment · {tableName}</p>
        <div className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{formatINR(bill.total)}</div>
        <p className="mt-1 text-sm text-stone-500">
          {formatINR(bill.subtotal)} + {formatINR(bill.gst)} GST
        </p>
        {waitingCount > 0 && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {waitingCount} item{waitingCount > 1 ? "s" : ""} still waiting for your OK will be dropped and not billed.
          </p>
        )}
        <p className="mt-6 text-sm font-semibold text-stone-700">How did they pay?</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            disabled={busy}
            onClick={() => onPay("upi")}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl bg-stone-900 text-white transition hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-2xl">📱</span>
            <span className="text-lg font-bold">UPI</span>
          </button>
          <button
            disabled={busy}
            onClick={() => onPay("cash")}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-600 text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-2xl">💵</span>
            <span className="text-lg font-bold">Cash</span>
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-stone-400">This closes the bill and frees the table.</p>
        <button onClick={onClose} className="mt-4 h-12 w-full rounded-xl font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50">
          Not yet
        </button>
      </div>
    </Modal>
  );
}

type Pick = { qty: number; note: string };

function AddItemsModal({
  tableId,
  tableName,
  waOn,
  onClose,
  onAdded,
}: {
  tableId: string;
  tableName: string;
  waOn: boolean;
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const supabase = supabaseBrowser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cat, setCat] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<Record<string, Pick>>({});
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

  const q = query.trim().toLowerCase();
  const shown = menu.filter((m) => (cat === "all" || m.category_id === cat) && (!q || m.name.toLowerCase().includes(q)));
  const lines = Object.entries(picks).filter(([, p]) => p.qty > 0);
  const count = lines.reduce((n, [, p]) => n + p.qty, 0);
  const total = lines.reduce((s, [id, p]) => s + (menu.find((m) => m.id === id)?.price_paise ?? 0) * p.qty, 0);

  function bump(id: string, d: number) {
    setPicks((p) => {
      const qty = Math.max(0, Math.min(50, (p[id]?.qty ?? 0) + d));
      const next = { ...p };
      if (qty === 0) delete next[id];
      else next[id] = { qty, note: p[id]?.note ?? "" };
      return next;
    });
  }

  async function submit() {
    if (waOn) {
      openWhatsApp(
        kitchenTicket(
          tableName,
          lines.map(([id, p]) => ({ qty: p.qty, name_snapshot: menu.find((m) => m.id === id)?.name ?? "", note: p.note.trim() || null })),
          "staff",
        ),
      );
    }
    setBusy(true);
    setError(null);
    const res = await staffAddItems(
      tableId,
      lines.map(([id, p]) => ({ menu_item_id: id, qty: p.qty, note: p.note.trim() || null })),
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onAdded(count);
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="border-b border-stone-200 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Add items · {tableName}</h3>
          <button onClick={onClose} className="text-sm font-semibold text-stone-400 hover:text-stone-700">
            Close
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu…"
          className="mt-3 h-11 w-full rounded-xl bg-stone-100 px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
        />
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
          {[{ id: "all", name: "All" }, ...categories].map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${cat === c.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto px-5">
        {shown.map((m) => {
          const qty = picks[m.id]?.qty ?? 0;
          return (
            <li key={m.id} className="py-2.5">
              <div className="flex items-center gap-3">
                <DietMark diet={m.diet ?? "veg"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.name}</div>
                  <div className="text-sm text-stone-500 tabular-nums">{formatINR(m.price_paise)}</div>
                </div>
                {qty === 0 ? (
                  <button onClick={() => bump(m.id, 1)} className="h-10 rounded-xl px-4 text-sm font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50">
                    Add
                  </button>
                ) : (
                  <div className="flex h-10 items-center rounded-xl bg-stone-900 text-white">
                    <button onClick={() => bump(m.id, -1)} className="h-full w-10 text-lg" aria-label="Less">
                      −
                    </button>
                    <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
                    <button onClick={() => bump(m.id, 1)} className="h-full w-10 text-lg" aria-label="More">
                      +
                    </button>
                  </div>
                )}
              </div>
              {qty > 0 && (
                <input
                  value={picks[m.id].note}
                  onChange={(e) => setPicks((p) => ({ ...p, [m.id]: { ...p[m.id], note: e.target.value } }))}
                  maxLength={200}
                  placeholder="Note for kitchen (optional)"
                  className="mt-2 ml-7 h-9 w-[calc(100%-1.75rem)] rounded-lg bg-amber-50 px-3 text-sm ring-1 ring-amber-200 outline-none placeholder:text-amber-700/50 focus:ring-amber-400"
                />
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-stone-400">No dishes match.</li>}
      </ul>

      <div className="border-t border-stone-200 bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <button
          disabled={busy || count === 0}
          onClick={submit}
          className="flex h-14 w-full items-center justify-between rounded-xl bg-emerald-600 px-5 font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400"
        >
          <span>{busy ? "Sending…" : count ? `Send ${count} item${count > 1 ? "s" : ""} to kitchen` : "Pick items to add"}</span>
          {count > 0 && <span className="tabular-nums">{formatINR(total)}</span>}
        </button>
      </div>
    </Modal>
  );
}

function WhatsAppToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-stone-600 ring-1 ring-stone-200"
      title="When on, accepting an order opens WhatsApp with the kitchen ticket ready to send"
    >
      <span className={`relative h-4 w-7 rounded-full transition ${on ? "bg-emerald-500" : "bg-stone-300"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
      <span className="hidden md:inline">WhatsApp group</span>
      <span className="md:hidden">WA</span>
    </button>
  );
}
