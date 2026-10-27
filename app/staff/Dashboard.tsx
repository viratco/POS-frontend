"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DietMark } from "@/components/MenuMarks";
import SoundToggle from "@/components/SoundToggle";
import StaffNav from "@/components/StaffNav";
import { chime } from "@/lib/chime";
import { kitchenTicket, openWhatsApp, setWhatsappOnAccept, whatsappOnAccept } from "@/lib/kitchenWhatsApp";
import { type Cafe, loadCafe } from "@/lib/cafe";
import { autoPlan, readPlan, SOHEES_PLAN, spotNumber } from "@/lib/floorPlan";
import { applyDiscount, billFor, type Discount, formatINR, gstRate } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { defaultPicks, extraPrice, lineKey, missingGroup, optionsLabel } from "@/lib/options";
import type { Category, Guest, MenuItem, OptionGroup, Order, OrderItem, PickedOption, Table } from "@/lib/types";
import { useOrderFeed } from "@/lib/useOrderFeed";
import CafeFloorPlan from "@/components/CafeFloorPlan";
import { acceptOrder, staffAddItems } from "./actions";

/* ───────────────────────── table states ───────────────────────── */

// Each state maps to the one thing staff should do next.
type TableState = "available" | "new_order" | "food_ready" | "in_kitchen" | "served";

const STATE: Record<TableState, { label: string; hint: string; stripe: string; chip: string; dot: string; glow: string }> = {
  new_order: { label: "New order", hint: "Check & accept", stripe: "bg-rose-500", chip: "bg-rose-100/90 text-rose-800 ring-rose-200", dot: "bg-rose-500", glow: "ring-rose-400" },
  food_ready: { label: "Food ready", hint: "Serve now", stripe: "bg-sky-500", chip: "bg-sky-100/90 text-sky-800 ring-sky-200", dot: "bg-sky-500", glow: "ring-sky-400" },
  in_kitchen: { label: "In kitchen", hint: "Being cooked", stripe: "bg-amber-400", chip: "bg-amber-100/90 text-amber-900 ring-amber-200", dot: "bg-amber-400", glow: "ring-amber-400" },
  served: { label: "Served", hint: "Bill when asked", stripe: "bg-emerald-500", chip: "bg-emerald-100/90 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500", glow: "ring-emerald-400" },
  available: { label: "Available", hint: "", stripe: "bg-[#d8cebe]", chip: "bg-[#f4eee4] text-[#786959] ring-[#e2d7c7]", dot: "bg-[#b8aa96]", glow: "ring-[#e2d7c7]" },
};

function stateOf(items: OrderItem[] | undefined): TableState {
  if (!items) return "available";
  const live = items.filter((i) => i.status !== "void");
  if (live.some((i) => i.status === "new")) return "new_order";
  if (live.some((i) => i.status === "ready")) return "food_ready";
  if (live.length === 0 || live.some((i) => i.status === "pending")) return "in_kitchen";
  return "served";
}

// Plain-language versions of the database's safety checks.
function friendlyError(msg: string) {
  if (msg.includes("order_closed")) return "This bill is already closed and can't be changed. Refresh the page.";
  if (msg.includes("invalid_status_change")) return "That item can't be moved back. Refresh the page.";
  if (msg.includes("use_close_order")) return "Use Take payment to close a bill.";
  if (msg.includes("permission denied")) return "You don't have permission to do that.";
  return msg;
}

// Opens a printable view in a new tab; call directly from a click handler.
// Reject a QR order's waiting dishes. If that leaves nothing else on the table,
// the empty order is closed too, so the table shows as free again.
async function rejectWaiting(
  supabase: ReturnType<typeof supabaseBrowser>,
  orderId: string,
  waiting: OrderItem[],
  all: OrderItem[],
) {
  const ids = waiting.map((i) => i.id);
  const res = await supabase.from("order_items").update({ status: "void" }).in("id", ids);
  if (res.error) return { error: res.error, emptied: false };
  if (all.some((i) => i.status !== "void" && !ids.includes(i.id))) return { error: null, emptied: false };
  const done = await supabase.from("orders").update({ status: "cancelled", closed_at: new Date().toISOString() }).eq("id", orderId);
  return { error: done.error, emptied: !done.error };
}

function openPrint(orderId: string, type: "bill" | "receipt" | "kot") {
  window.open(`/staff/print/${orderId}?type=${type}&auto=1`, "_blank");
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
  // Today's paid bills, counted the same way as Analytics: net = before GST.
  const [salesToday, setSalesToday] = useState({ net: 0, withGst: 0 });
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [chosenView, setViewMode] = useState<"floorplan" | "cards">("floorplan");
  const viewMode = chosenView;
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
    // The café loads first-time only (cached); its GST rate is needed for the totals below.
    const [c, t, o, p] = await Promise.all([
      loadCafe(),
      supabase.from("tables").select("*").eq("is_active", true).order("sort_order"),
      // Open orders with their dishes and guests in one round trip (the database is far away).
      supabase
        .from("orders")
        .select("*, order_items(*), order_guests(*)")
        .eq("status", "open")
        .order("created_at", { referencedTable: "order_items" })
        .order("created_at", { referencedTable: "order_guests" }),
      supabase.from("orders").select("total_paise, gst_paise").eq("status", "paid").gte("closed_at", startOfDay.toISOString()),
    ]);
    if (t.error || o.error) {
      setError((t.error ?? o.error)!.message);
      return;
    }
    type OpenOrder = Order & { order_items: OrderItem[]; order_guests: Guest[] };
    const open = (o.data ?? []) as OpenOrder[];
    setError(null);
    setCafe(c);
    setTables((t.data ?? []) as Table[]);
    setOrders(open);
    setItems(open.flatMap((x) => x.order_items ?? []));
    setGuests(open.flatMap((x) => x.order_guests ?? []));
    const paid = (p.data ?? []) as { total_paise: number | null; gst_paise: number | null }[];
    const withGst = paid.reduce((s, x) => s + (x.total_paise ?? 0), 0);
    setSalesToday({ net: withGst - paid.reduce((s, x) => s + (x.gst_paise ?? 0), 0), withGst });
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

  const guestsByOrder = new Map<string, Guest[]>();
  guests.forEach((g) => guestsByOrder.set(g.order_id, [...(guestsByOrder.get(g.order_id) ?? []), g]));

  const rows = tables.map((t) => {
    const order = openByTable.get(t.id) ?? null;
    const orderItems = order ? (itemsByOrder.get(order.id) ?? []) : undefined;
    return { table: t, order, items: orderItems ?? [], state: stateOf(orderItems), guests: order ? (guestsByOrder.get(order.id) ?? []) : [] };
  });

  // This café's own saved floor plan; Sohee's drawn room; or a tidy grid of its tables.
  const plan =
    readPlan(cafe?.floor_plan) ??
    (cafe?.slug === "sohees" ? SOHEES_PLAN : autoPlan(tables.map((t) => spotNumber(t.name)).filter((n): n is number => n != null)));

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

  // Floor-plan spots with no table yet: create them, or re-activate one that was switched off.
  async function setupTables(names: string[]) {
    const { error } = await supabase
      .from("tables")
      .upsert(names.map((name) => ({ name, is_active: true, sort_order: Number(name.replace(/\D/g, "")) * 10 })), { onConflict: "cafe_id,name" });
    if (error) {
      setError(error.message);
      return;
    }
    showToast(`Added ${names.join(", ")} — print their QR codes from the QR page`);
    await load();
  }

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

  async function reject(orderId: string, tableName: string, waiting: OrderItem[], all: OrderItem[]) {
    const { error } = await rejectWaiting(supabase, orderId, waiting, all);
    if (error) setError(error.message);
    else showToast(`${tableName} order rejected`);
    void load();
  }

  const selected = rows.find((r) => r.table.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-[#faf7f2] text-[#2a2119]">
      <StaffNav>
        <span
          className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:flex ${
            live ? "bg-emerald-100/80 text-emerald-800 ring-1 ring-emerald-300" : "bg-red-100/80 text-red-800 ring-1 ring-red-300"
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
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
            <button onClick={() => setError(null)} className="font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {/* At a glance */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            label="Tables in use"
            value={`${counts.occupied}/${tables.length}`}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="12" rx="2" />
                <path d="M7 16v4M17 16v4" />
              </svg>
            }
          />
          <Stat
            label="New orders"
            value={String(waitingOrders.length)}
            tone={waitingOrders.length ? "rose" : undefined}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            }
          />
          <Stat
            label="Ready to serve"
            value={`${counts.readyItems} items`}
            tone={counts.readyItems ? "sky" : undefined}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 18h16M12 5v2M8 18a4 4 0 018 0" />
              </svg>
            }
          />
          <Stat
            label="In kitchen"
            value={`${counts.kitchenItems} items`}
            tone={counts.kitchenItems ? "amber" : undefined}
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 4v4m0 0a4 4 0 01-4 4H5v2h14v-2h-3a4 4 0 01-4-4z" />
              </svg>
            }
          />
          <Stat
            label="Today's sales"
            value={formatINR(salesToday.net)}
            hint={`before GST · ${formatINR(salesToday.withGst)} with GST`}
            tone="gold"
            className="col-span-2 md:col-span-1"
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path d="M9 8h6M9 12h5M9 8v8M13 12l3 4" />
              </svg>
            }
          />
        </div>

        {/* 1. New orders need an OK first */}
        {waitingOrders.length > 0 && (
          <section className="mt-6 rounded-3xl border border-rose-300 bg-gradient-to-br from-rose-50/90 to-[#fff8f8] p-4.5 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2.5 text-lg font-bold text-rose-950">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-rose-600" />
                </span>
                New Orders Needing Confirmation
                <span className="rounded-full bg-rose-200/90 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                  {waitingOrders.length}
                </span>
              </h2>
              <span className="text-xs font-medium text-rose-700">Check the guests are seated, then accept to dispatch</span>
            </div>
            <div className="mt-3.5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {waitingOrders.map(({ order, table, waiting, items: orderItems, guests: who }) => (
                <div key={order!.id} className="flex flex-col justify-between rounded-2xl border border-rose-200 bg-white p-4 shadow-sm ring-2 ring-rose-200/50">
                  <div>
                    <div className="flex items-baseline justify-between border-b border-rose-100 pb-2">
                      <span className="text-2xl font-bold tracking-tight text-[#2a2119]">{table.name}</span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-rose-600">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                        {now ? ago(waiting[0].created_at, now) : ""}
                      </span>
                    </div>
                    {who.length > 0 && <GuestLine guests={who} className="mt-2" />}
                    <ul className="mt-2.5 space-y-1.5">
                      {waiting.map((i) => (
                        <li key={i.id} className="flex items-start justify-between text-[14px] leading-snug">
                          <div>
                            <span className="font-bold text-[#2a2119]">{i.qty}×</span> {i.name_snapshot}
                            {i.options && i.options.length > 0 && <span className="block pl-6 text-sm text-stone-500">{optionsLabel(i.options)}</span>}
                            {i.note && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{i.note}</span>}
                          </div>
                          <span className="text-xs font-semibold text-stone-500 tabular-nums">
                            {formatINR(i.price_paise_snapshot * i.qty)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4 flex gap-2 pt-2 border-t border-rose-50">
                    <button
                      disabled={accepting === order!.id}
                      onClick={() => accept(order!.id, table.name, waiting)}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
                    >
                      {accepting === order!.id ? "Sending…" : "✓ Accept & Send to Kitchen"}
                    </button>
                    <ConfirmButton
                      disabled={accepting === order!.id}
                      onConfirm={() => reject(order!.id, table.name, waiting, orderItems)}
                      className="h-11 rounded-xl px-3 text-xs font-semibold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-50"
                      armedClassName="h-11 rounded-xl bg-red-600 px-3 text-xs font-bold text-white shadow-sm"
                    >
                      Reject
                    </ConfirmButton>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. All tables */}
        <section className="mt-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-[#2a2119]">Tables &amp; Layout</h2>
              <span className="rounded-full bg-[#f0e7d8] px-2.5 py-0.5 text-xs font-semibold text-[#6e5d4e]">
                {counts.occupied} in use · {counts.available} free
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View Switcher: Cards vs Floor Plan */}
              {(
              <div className="flex items-center rounded-xl border border-[#ded3c2] bg-white p-1 shadow-sm">
                <button
                  onClick={() => setViewMode("cards")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    viewMode === "cards" ? "bg-[#2a2119] text-[#f5ebd9] shadow-sm" : "text-[#7a6b5c] hover:text-[#2a2119]"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                  <span>Cards</span>
                </button>
                <button
                  onClick={() => setViewMode("floorplan")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    viewMode === "floorplan" ? "bg-[#2a2119] text-[#f5ebd9] shadow-sm" : "text-[#7a6b5c] hover:text-[#2a2119]"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M3 3h18v18H3zM3 9h18M9 21V9" />
                  </svg>
                  <span>Floor Plan</span>
                </button>
              </div>
              )}

              {/* Filter Pills */}
              <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-[#ded3c2] bg-white p-1 shadow-sm">
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
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filter === key ? "bg-[#2a2119] text-[#f5ebd9]" : "text-[#7a6b5c] hover:text-[#2a2119]"
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 text-[11px] ${filter === key ? "bg-white/20 text-white" : "bg-[#f4eee4] text-[#6d5e50]"}`}>
                      {n}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Conditional View: Floor Plan vs Card Grid */}
          {viewMode === "floorplan" ? (
            <div className="mt-4">
              <CafeFloorPlan
                plan={plan}
                rows={rows}
                visibleIds={filter === "all" ? undefined : new Set(visibleRows.map((r) => r.table.id))}
                selectedId={selectedId}
                onSelectTable={setSelectedId}
                now={now}
                ago={ago}
                onSetupTables={setupTables}
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4">
              {visibleRows.map((r) => (
                <TableCard key={r.table.id} {...r} now={now} selected={r.table.id === selectedId} onClick={() => setSelectedId(r.table.id)} />
              ))}
              {visibleRows.length === 0 && (
                <p className="col-span-full rounded-2xl border border-[#ded3c2] bg-white py-12 text-center text-[#8a7b6b]">
                  No tables match this filter right now.
                </p>
              )}
            </div>
          )}

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
          guests={selected.guests}
          now={now}
          accepting={!!selected.order && accepting === selected.order.id}
          onAccept={(waiting) => selected.order && accept(selected.order.id, selected.table.name, waiting)}
          waOn={waOn}
          onClose={() => setSelectedId(null)}
          onChanged={load}
          toast={showToast}
          allRows={rows}
          onMoved={(toTableId) => {
            setSelectedId(toTableId);
            void load();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-toast rounded-full bg-[#2a2119] px-5 py-3 text-sm font-semibold whitespace-nowrap text-[#f5ebd9] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose" | "sky" | "amber" | "gold";
  icon?: React.ReactNode;
  className?: string;
}) {
  const toneBg =
    tone === "rose"
      ? "bg-rose-50/70 border-rose-200/80 text-rose-950"
      : tone === "sky"
        ? "bg-sky-50/70 border-sky-200/80 text-sky-950"
        : tone === "amber"
          ? "bg-amber-50/70 border-amber-200/80 text-amber-950"
          : tone === "gold"
            ? "bg-[#fffdf8] border-[#ded3c2] text-[#2a2119]"
            : "bg-white/90 border-[#ebe2d4] text-[#2a2119]";

  const iconBg =
    tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : tone === "sky"
        ? "bg-sky-100 text-sky-700"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800"
          : tone === "gold"
            ? "bg-[#f5ebd9] text-[#8a6828]"
            : "bg-[#f4eee4] text-[#786959]";

  return (
    <div className={`relative flex flex-col justify-between rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition hover:shadow-md ${toneBg} ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold tracking-wider text-[#8a7b6b] uppercase">{label}</span>
        {icon && <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight tabular-nums text-[#2a2119]">{value}</div>
      {hint && <div className="mt-0.5 text-xs font-medium text-[#8a7b6b] tabular-nums">{hint}</div>}
    </div>
  );
}

function Legend() {
  const order: TableState[] = ["new_order", "food_ready", "in_kitchen", "served", "available"];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[#ece3d6] bg-white/70 px-4 py-2.5 text-xs text-[#7a6b5c] backdrop-blur-sm">
      <span className="font-bold text-[#2a2119] uppercase tracking-wider text-[11px]">Legend:</span>
      {order.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE[s].dot}`} />
          <span className="font-semibold text-[#2a2119]">{STATE[s].label}</span>
          {STATE[s].hint && <span className="text-[#8a7b6b]">· {STATE[s].hint}</span>}
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
  guests,
  now,
  selected,
  onClick,
}: {
  table: Table;
  order: Order | null;
  items: OrderItem[];
  state: TableState;
  guests: Guest[];
  now: number;
  selected: boolean;
  onClick: () => void;
}) {
  const s = STATE[state];
  const n = (st: OrderItem["status"]) => items.filter((i) => i.status === st).reduce((c, i) => c + i.qty, 0);
  const liveCount = items.filter((i) => i.status !== "void").reduce((c, i) => c + i.qty, 0);
  const tableImg = "/tables/table-topdown.png";

  // Determine stage progress for active orders (0: new, 1: kitchen, 2: ready, 3: served)
  const currentStage = state === "new_order" ? 0 : state === "in_kitchen" ? 1 : state === "food_ready" ? 2 : 3;

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-[0.99] ${
        selected ? "border-[#2a2119] ring-2 ring-[#2a2119]" : "border-[#e5ded4] hover:border-[#cbbfad]"
      } ${order ? "bg-[#fffdfb] shadow-sm" : "bg-[#fcfaf7]/90 hover:bg-white shadow-xs"}`}
    >
      {/* Left Accent Stripe */}
      <span className={`absolute inset-y-0 left-0 w-1.5 z-20 ${s.stripe} ${state === "new_order" ? "animate-pulse" : ""}`} />

      {/* Realistic Table Hero Image Section */}
      <div className="relative aspect-[16/11] w-full overflow-hidden bg-gradient-to-b from-[#f5ede0] to-[#ece1cf]/80 p-2">
        <img
          src={tableImg}
          alt={table.name}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-md"
        />

        {/* Floating Top Header Badges */}
        <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-1 z-10">
          <span className="flex items-center gap-1.5 rounded-lg bg-[#2a2119]/85 px-2.5 py-1 text-xs font-bold text-[#f5ebd9] backdrop-blur-md shadow-sm">
            <span>{table.name}</span>
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-sm backdrop-blur-md ${s.chip}`}>
            {s.label}
          </span>
        </div>

        {/* Floating Bottom Info on Image */}
        <div className="absolute inset-x-2.5 bottom-2 flex items-center justify-between text-[11px] font-medium text-[#2a2119] z-10">
          <span className="flex items-center gap-1 rounded-md bg-white/85 px-2 py-0.5 text-[10px] font-bold backdrop-blur-xs shadow-xs">
            <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#a89b88]" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span>{order ? (now ? ago(order.created_at, now) : "Open") : "Free"}</span>
          </span>
          <span className="rounded-md bg-white/85 px-2 py-0.5 text-[10px] font-bold text-[#6d5e50] backdrop-blur-xs shadow-xs">
            4 Seats
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-3.5 sm:p-4">
        {order ? (
          <div className="space-y-2.5">
            {/* Visual 4-stage mini progress bar */}
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "New", color: "bg-rose-500" },
                { label: "Kitchen", color: "bg-amber-400" },
                { label: "Ready", color: "bg-sky-500" },
                { label: "Served", color: "bg-emerald-500" },
              ].map((step, idx) => (
                <div key={step.label} className="flex flex-col gap-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      idx <= currentStage ? step.color : "bg-[#ece4d8]"
                    }`}
                  />
                  <span className={`text-[9px] font-semibold text-center ${idx === currentStage ? "text-[#2a2119]" : "text-[#a89b88]"}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Item status chips */}
            <div className="flex flex-wrap gap-1 text-[11px] font-semibold pt-0.5">
              {n("new") > 0 && <span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 ring-1 ring-rose-200">{n("new")} new</span>}
              {n("ready") > 0 && <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-200">{n("ready")} ready</span>}
              {n("pending") > 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-amber-200">{n("pending")} cooking</span>}
              {n("served") > 0 && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">{n("served")} served</span>}
            </div>

            {/* Bottom Row */}
            <div className="flex items-end justify-between border-t border-[#f0e7d8] pt-2">
              <span className="min-w-0 text-xs font-medium text-[#8a7b6b]">
                {guests.length > 0 && (
                  <span className="block truncate font-semibold text-[#2a2119]">
                    👤 {guests[0].name}
                    {guests.length > 1 ? ` +${guests.length - 1}` : ""}
                  </span>
                )}
                {liveCount} item{liveCount !== 1 ? "s" : ""}
              </span>
              <span className="text-xl font-extrabold text-[#2a2119] tabular-nums tracking-tight">
                {formatINR(billFor(items).total)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-between py-1">
            <p className="text-xs text-[#8a7b6b] leading-relaxed">
              Available for guests. QR code active on table.
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-dashed border-[#ece2d4] pt-2 text-xs font-semibold text-[#8a7b6b] group-hover:text-[#2a2119]">
              <span className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f4eee4] text-xs font-bold text-[#6d5e50] group-hover:bg-[#2a2119] group-hover:text-white transition">
                  +
                </span>
                Start an order
              </span>
              <span className="rounded bg-[#f4eee4] px-1.5 py-0.5 text-[10px] text-[#6d5e50]">Ready</span>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

/* ───────────────────────── table drawer ───────────────────────── */

function TableDrawer({
  table,
  order,
  items,
  state,
  guests,
  now,
  accepting,
  onAccept,
  waOn,
  onClose,
  onChanged,
  toast,
  allRows,
  onMoved,
}: {
  table: Table;
  order: Order | null;
  items: OrderItem[];
  state: TableState;
  guests: Guest[];
  now: number;
  accepting: boolean;
  onAccept: (waiting: OrderItem[]) => void;
  waOn: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: (msg: string) => void;
  allRows: { table: Table; order: Order | null; items: OrderItem[]; guests: Guest[] }[];
  onMoved: (toTableId: string) => void;
}) {
  const supabase = supabaseBrowser();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  // The order being charged; kept even after the table frees up, so the receipt can print.
  const [paying, setPaying] = useState<Order | null>(null);
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
    if (error) setError(friendlyError(error.message));
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
            {guests.length > 0 && (
              <ul className="mt-2 space-y-1">
                {guests.map((g) => (
                  <li key={g.phone} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-semibold text-stone-800">👤 {g.name}</span>
                    <a href={`tel:+91${g.phone}`} className="font-medium text-emerald-700 tabular-nums hover:underline">
                      {formatPhone(g.phone)}
                    </a>
                    {g.marketing_consent && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">OK to send offers</span>}
                  </li>
                ))}
              </ul>
            )}
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
                <ConfirmButton
                  disabled={accepting || busy}
                  onConfirm={async () => {
                    let emptied = false;
                    await run(async () => {
                      const r = await rejectWaiting(supabase, order!.id, waiting, items);
                      emptied = r.emptied;
                      return r;
                    }, "Order rejected");
                    if (emptied) onClose();
                  }}
                  className="h-12 rounded-xl bg-white px-4 font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50"
                  armedClassName="h-12 rounded-xl bg-red-600 px-4 font-bold text-white shadow-sm"
                >
                  Reject
                </ConfirmButton>
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
                <div className="flex gap-1.5">
                  <button
                    onClick={() => order && openPrint(order.id, "kot")}
                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
                  >
                    🖨 KOT
                  </button>
                  <button
                    onClick={() => openWhatsApp(kitchenTicket(table.name, cooking, "qr").replace("NEW ORDER", "REMINDER"))}
                    className="rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
                  >
                    Resend on WhatsApp
                  </button>
                </div>
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
                disabled={bill.subtotal === 0}
                onClick={() => openPrint(order.id, "bill")}
                title="Print the bill for the guest"
                className="h-14 rounded-xl px-4 font-bold text-stone-800 ring-1 ring-stone-300 transition hover:bg-stone-50 disabled:opacity-40"
              >
                🖨 Bill
              </button>
              <button
                disabled={busy || bill.subtotal === 0}
                onClick={() => setPaying(order)}
                className="flex h-14 flex-1 items-center justify-between rounded-xl bg-stone-900 px-5 font-bold text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.99] disabled:opacity-40"
              >
                <span>Take payment</span>
                <span className="tabular-nums">{formatINR(bill.total)}</span>
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                disabled={busy}
                onClick={() => setMoving(true)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
              >
                ⇄ Move to another table
              </button>
              <button disabled={busy} onClick={cancelOrder} className="text-sm font-medium text-stone-400 hover:text-red-600">
                Cancel this order
              </button>
            </div>
          </div>
        )}
      </aside>

      {moving && order && (
        <MoveTableModal
          from={table}
          order={order}
          items={items}
          rows={allRows}
          waOn={waOn}
          onClose={() => setMoving(false)}
          onMoved={(to, merged) => {
            setMoving(false);
            toast(merged ? `✓ Merged into ${to.name}'s bill` : `✓ Moved to ${to.name}`);
            onMoved(to.id);
          }}
        />
      )}

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

      {paying && (
        <PaymentModal
          tableName={table.name}
          bill={bill}
          waitingCount={waiting.length}
          busy={busy}
          onClose={() => setPaying(null)}
          onPay={async (method, discount) => {
            setBusy(true);
            setError(null);
            // Discount params only when there is one, so plain payments work with older databases too.
            const { data, error } = await supabase.rpc("close_order", {
              p_order_id: paying.id,
              p_method: method,
              p_gst_rate_bps: gstRate(),
              ...(discount
                ? { p_discount_type: discount.type, p_discount_value: discount.value, p_discount_reason: discount.reason || null }
                : {}),
            });
            setBusy(false);
            onChanged();
            if (error) {
              setError(error.message === "invalid_discount" ? "That discount isn't valid." : friendlyError(error.message));
              return null;
            }
            const total = (data as Order).total_paise ?? 0;
            toast(total === 0 ? `✓ ${table.name} closed as complimentary` : `✓ ${table.name} paid by ${method === "upi" ? "UPI" : "cash"} · table is free`);
            return total;
          }}
          onPrintReceipt={() => openPrint(paying.id, "receipt")}
          onDone={() => {
            setPaying(null);
            onClose();
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
          {item.options && item.options.length > 0 && <span className="block text-sm text-stone-500">{optionsLabel(item.options)}</span>}
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

// Tap once: turns red and asks "Tap again". Tap again within 4 s: does it.
// Used instead of the browser's confirm() pop-up, which browsers silently block after a few.
function ConfirmButton({
  onConfirm,
  disabled,
  className,
  armedClassName,
  children,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  className: string;
  armedClassName: string;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
      className={armed ? armedClassName : className}
    >
      {armed ? "Tap again to reject" : children}
    </button>
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

const QUICK_PERCENTS = [5, 10, 15, 20];
const QUICK_REASONS = ["Regular guest", "Birthday", "Staff", "Complaint", "Owner's guest"];

// "12.5" -> 1250 (basis points for %, paise for ₹). Returns null if not a valid number.
function parseValue(input: string): number | null {
  const m = input.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

function PaymentModal({
  tableName,
  bill,
  waitingCount,
  busy,
  onClose,
  onPay,
  onPrintReceipt,
  onDone,
}: {
  tableName: string;
  bill: ReturnType<typeof billFor>;
  waitingCount: number;
  busy: boolean;
  onClose: () => void;
  onPay: (method: "upi" | "cash", discount: Discount) => Promise<number | null>;
  onPrintReceipt: () => void;
  onDone: () => void;
}) {
  const [paid, setPaid] = useState<{ method: "upi" | "cash"; total: number } | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [input, setInput] = useState("");
  const [reason, setReason] = useState("");

  const parsed = parseValue(input);
  const invalid =
    input.trim() !== "" && (parsed === null || (kind === "percent" && parsed > 10000) || (kind === "amount" && parsed > bill.subtotal));
  const discount: Discount = showDiscount && parsed && !invalid ? { type: kind, value: parsed, reason } : null;
  const final = applyDiscount(bill.subtotal, discount, bill.rateBps);

  async function pay(method: "upi" | "cash") {
    const total = await onPay(method, discount);
    if (total !== null) setPaid({ method, total });
  }

  if (paid) {
    return (
      <Modal onClose={onDone}>
        <div className="flex flex-col items-center p-6 text-center">
          <div className="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-semibold text-stone-500">
            {tableName} · {paid.total === 0 ? "complimentary" : `paid by ${paid.method === "upi" ? "UPI" : "cash"}`}
          </p>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{formatINR(paid.total)}</div>
          <p className="mt-1 text-sm text-stone-500">The table is free again.</p>
          {paid.total > 0 && (
            <button
              onClick={onPrintReceipt}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 text-lg font-bold text-white hover:bg-stone-800"
            >
              🖨 Print receipt
            </button>
          )}
          <button onClick={onDone} className="mt-3 h-12 w-full rounded-xl font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="overflow-y-auto p-6">
        <p className="text-sm font-semibold text-stone-500">Take payment · {tableName}</p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-5xl font-bold tracking-tight tabular-nums">{formatINR(final.total)}</span>
          {final.discount > 0 && <span className="text-lg text-stone-400 line-through tabular-nums">{formatINR(bill.total)}</span>}
        </div>

        {/* breakdown */}
        <div className="mt-3 space-y-0.5 rounded-xl bg-stone-50 px-4 py-3 text-sm">
          <Row label="Items" value={formatINR(final.subtotal)} />
          {final.discount > 0 && (
            <div className="flex justify-between py-0.5 font-semibold text-emerald-700">
              <span>
                Discount{discount?.type === "percent" ? ` (${(discount.value / 100).toString()}%)` : ""}
              </span>
              <span className="tabular-nums">− {formatINR(final.discount)}</span>
            </div>
          )}
          <Row label={`GST (${final.rateBps / 100}%)`} value={formatINR(final.gst)} />
        </div>

        {/* discount */}
        {!showDiscount ? (
          <button
            onClick={() => setShowDiscount(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-3 text-sm font-semibold text-stone-600 hover:border-stone-400 hover:bg-stone-50"
          >
            🏷️ Add discount
          </button>
        ) : (
          <div className="mt-3 rounded-2xl p-4 ring-1 ring-emerald-200 bg-emerald-50/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-800">Discount</span>
              <button
                onClick={() => {
                  setShowDiscount(false);
                  setInput("");
                  setReason("");
                }}
                className="text-xs font-semibold text-stone-500 hover:text-red-600"
              >
                Remove
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 ring-1 ring-stone-200">
              {(["percent", "amount"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setKind(k);
                    setInput("");
                  }}
                  className={`rounded-lg py-2 text-sm font-bold ${kind === k ? "bg-stone-900 text-white" : "text-stone-500"}`}
                >
                  {k === "percent" ? "% off" : "₹ off"}
                </button>
              ))}
            </div>

            {kind === "percent" && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {QUICK_PERCENTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(String(p))}
                    className={`rounded-lg py-2 text-sm font-bold ring-1 ${
                      input === String(p) ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-700 ring-stone-200"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center rounded-xl bg-white ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-emerald-500">
              {kind === "amount" && <span className="pl-3 text-stone-400">₹</span>}
              <input
                inputMode="decimal"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={kind === "percent" ? "Other %, e.g. 12.5" : "Amount, e.g. 100"}
                className="h-11 w-full bg-transparent px-3 text-[15px] outline-none"
              />
              {kind === "percent" && <span className="pr-3 text-stone-400">%</span>}
            </div>
            {invalid && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {kind === "percent" ? "Enter a percentage up to 100." : `Enter an amount up to ${formatINR(bill.subtotal)}.`}
              </p>
            )}

            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={60}
              placeholder="Reason (optional)"
              className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${reason === r ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {waitingCount > 0 && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {waitingCount} item{waitingCount > 1 ? "s" : ""} still waiting for your OK will be dropped and not billed.
          </p>
        )}

        <p className="mt-5 text-sm font-semibold text-stone-700">{final.total === 0 ? "Close as complimentary:" : "How did they pay?"}</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            disabled={busy || invalid}
            onClick={() => pay("upi")}
            className="flex h-20 flex-col items-center justify-center gap-0.5 rounded-2xl bg-stone-900 text-white transition hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-xl">📱</span>
            <span className="text-lg font-bold">UPI</span>
          </button>
          <button
            disabled={busy || invalid}
            onClick={() => pay("cash")}
            className="flex h-20 flex-col items-center justify-center gap-0.5 rounded-2xl bg-emerald-600 text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-xl">💵</span>
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

// One line per dish + chosen options.
type Pick = { itemId: string; qty: number; note: string; options: PickedOption[] };

export function AddItemsModal({
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
  const [choosing, setChoosing] = useState<string | null>(null); // item id whose options are open
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").eq("is_available", true).order("sort_order"),
    ]).then(([c, m]) => {
      setCategories((c.data ?? []) as Category[]);
      setMenu(((m.data ?? []) as MenuItem[]).map((i) => ({ ...i, options: Array.isArray(i.options) ? i.options : [] })));
    });
  }, [supabase]);

  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const q = query.trim().toLowerCase();
  const shown = menu.filter((m) => (cat === "all" || m.category_id === cat) && (!q || m.name.toLowerCase().includes(q)));
  const lines = Object.entries(picks).filter(([, p]) => p.qty > 0);
  const count = lines.reduce((n, [, p]) => n + p.qty, 0);
  const unit = (p: Pick) => {
    const m = byId.get(p.itemId);
    return m ? m.price_paise + extraPrice(m.options, p.options) : 0;
  };
  const total = lines.reduce((s, [, p]) => s + unit(p) * p.qty, 0);

  function bump(key: string, d: number, itemId = key, options: PickedOption[] = []) {
    setPicks((p) => {
      const qty = Math.max(0, Math.min(50, (p[key]?.qty ?? 0) + d));
      const next = { ...p };
      if (qty === 0) delete next[key];
      // An existing line keeps its own dish and options; `key` for a dish with options is
      // "dishId|Choice=Veg", which is not a dish id.
      else next[key] = { itemId: p[key]?.itemId ?? itemId, qty, note: p[key]?.note ?? "", options: p[key]?.options ?? options };
      return next;
    });
  }

  async function submit() {
    if (waOn) {
      openWhatsApp(
        kitchenTicket(
          tableName,
          lines.map(([, p]) => ({ qty: p.qty, name_snapshot: byId.get(p.itemId)?.name ?? "", note: p.note.trim() || null, options: p.options })),
          "staff",
        ),
      );
    }
    setBusy(true);
    setError(null);
    const res = await staffAddItems(
      tableId,
      lines.map(([, p]) => ({
        menu_item_id: p.itemId,
        qty: p.qty,
        note: p.note.trim() || null,
        options: p.options.map(({ group, name }) => ({ group, name })),
      })),
    );
    setBusy(false);
    if (!res.ok) setError(res.error === "invalid_options" ? "Pick the options again for one of the dishes." : res.error);
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
          const hasOptions = m.options.length > 0;
          const myLines = lines.filter(([, p]) => p.itemId === m.id);
          const plainQty = picks[m.id]?.qty ?? 0;
          return (
            <li key={m.id} className="py-2.5">
              <div className="flex items-center gap-3">
                <DietMark diet={m.diet ?? "veg"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.name}</div>
                  <div className="text-sm text-stone-500 tabular-nums">
                    {formatINR(m.price_paise)}
                    {hasOptions && " · has options"}
                  </div>
                </div>
                {hasOptions ? (
                  <button
                    onClick={() => setChoosing(choosing === m.id ? null : m.id)}
                    className="h-10 rounded-xl px-4 text-sm font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50"
                  >
                    {choosing === m.id ? "Close" : "Add…"}
                  </button>
                ) : plainQty === 0 ? (
                  <button onClick={() => bump(m.id, 1)} className="h-10 rounded-xl px-4 text-sm font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50">
                    Add
                  </button>
                ) : (
                  <QtyPill qty={plainQty} onLess={() => bump(m.id, -1)} onMore={() => bump(m.id, 1)} />
                )}
              </div>

              {hasOptions && choosing === m.id && (
                <StaffOptionPicker
                  item={m}
                  onAdd={(chosen) => {
                    bump(lineKey(m.id, chosen), 1, m.id, chosen);
                    setChoosing(null);
                  }}
                />
              )}

              {myLines.map(([key, p]) => (
                <div key={key} className="mt-2 ml-7">
                  {hasOptions && (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-1.5">
                      <span className="text-sm font-medium">{optionsLabel(p.options)}</span>
                      <span className="text-sm text-stone-500 tabular-nums">{formatINR(unit(p))}</span>
                      <QtyPill qty={p.qty} onLess={() => bump(key, -1)} onMore={() => bump(key, 1)} small />
                    </div>
                  )}
                  <input
                    value={p.note}
                    onChange={(e) => setPicks((all) => ({ ...all, [key]: { ...all[key], note: e.target.value } }))}
                    maxLength={200}
                    placeholder="Note for kitchen (optional)"
                    className="mt-1.5 h-9 w-full rounded-lg bg-amber-50 px-3 text-sm ring-1 ring-amber-200 outline-none placeholder:text-amber-700/50 focus:ring-amber-400"
                  />
                </div>
              ))}
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

function QtyPill({ qty, onLess, onMore, small }: { qty: number; onLess: () => void; onMore: () => void; small?: boolean }) {
  return (
    <div className={`flex items-center rounded-xl bg-stone-900 text-white ${small ? "h-8" : "h-10"}`}>
      <button onClick={onLess} className={`h-full text-lg ${small ? "w-8" : "w-10"}`} aria-label="Less">
        −
      </button>
      <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
      <button onClick={onMore} className={`h-full text-lg ${small ? "w-8" : "w-10"}`} aria-label="More">
        +
      </button>
    </div>
  );
}

function StaffOptionPicker({ item, onAdd }: { item: MenuItem; onAdd: (picks: PickedOption[]) => void }) {
  const [chosen, setChosen] = useState<PickedOption[]>(() => defaultPicks(item.options));
  const missing = missingGroup(item.options, chosen);

  function toggle(g: OptionGroup, name: string) {
    setChosen((cur) => {
      const has = cur.some((p) => p.group === g.name && p.name === name);
      if (g.max === 1) return [...cur.filter((p) => p.group !== g.name), ...(has && g.min === 0 ? [] : [{ group: g.name, name }])];
      if (has) return cur.filter((p) => !(p.group === g.name && p.name === name));
      if (cur.filter((p) => p.group === g.name).length >= g.max) return cur;
      return [...cur, { group: g.name, name }];
    });
  }

  return (
    <div className="mt-2 ml-7 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      {item.options.map((g) => (
        <div key={g.name} className="mb-2">
          <div className="text-xs font-bold tracking-wide text-stone-500 uppercase">
            {g.name} {g.min > 0 ? "· required" : ""} {g.max > 1 ? `· up to ${g.max}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.choices.map((c) => {
              const on = chosen.some((p) => p.group === g.name && p.name === c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => toggle(g, c.name)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${on ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-700 ring-stone-300"}`}
                >
                  {c.name}
                  {c.price > 0 && <span className={on ? "text-white/70" : "text-stone-400"}> +{formatINR(c.price)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        disabled={!!missing}
        onClick={() => onAdd(chosen)}
        className="mt-1 h-10 w-full rounded-lg bg-stone-900 text-sm font-bold text-white disabled:opacity-40"
      >
        {missing ? `Choose ${missing.name}` : `Add · ${formatINR(item.price_paise + extraPrice(item.options, chosen))}`}
      </button>
    </div>
  );
}

function WhatsAppToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex items-center gap-2 rounded-xl border border-[#ded3c2] bg-white px-3 py-2 text-xs font-semibold text-[#5a4b3d] shadow-sm transition hover:bg-[#fcfaf7]"
      title="When on, accepting an order opens WhatsApp with the kitchen ticket ready to send"
    >
      <span className={`relative h-4 w-7 rounded-full transition ${on ? "bg-emerald-500" : "bg-[#ded3c2]"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
      <span className="hidden md:inline">WhatsApp group</span>
      <span className="md:hidden">WA</span>
    </button>
  );
}

// "9876543210" -> "98765 43210"
function formatPhone(p: string) {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function GuestLine({ guests, className = "" }: { guests: Guest[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] ${className}`}>
      {guests.map((g) => (
        <span key={g.phone} className="text-stone-600">
          👤 <span className="font-semibold text-stone-800">{g.name}</span>{" "}
          <a href={`tel:+91${g.phone}`} className="tabular-nums text-emerald-700 hover:underline">
            {formatPhone(g.phone)}
          </a>
        </span>
      ))}
    </div>
  );
}

function MoveTableModal({
  from,
  order,
  items,
  rows,
  waOn,
  onClose,
  onMoved,
}: {
  from: Table;
  order: Order;
  items: OrderItem[];
  rows: { table: Table; order: Order | null; items: OrderItem[]; guests: Guest[] }[];
  waOn: boolean;
  onClose: () => void;
  onMoved: (to: Table, merged: boolean) => void;
}) {
  const supabase = supabaseBrowser();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = rows.filter((r) => r.table.id !== from.id);
  const picked = choices.find((r) => r.table.id === target) ?? null;
  const merging = !!picked?.order;
  const inKitchen = items.some((i) => i.status === "pending" || i.status === "ready");

  async function confirmMove() {
    if (!picked) return;
    // Tickets already sent show the old table, so tell the kitchen (open WhatsApp inside the tap).
    if (waOn && inKitchen) {
      openWhatsApp(
        `🔁 *TABLE CHANGE*\n${from.name.toUpperCase()} ➜ ${picked.table.name.toUpperCase()}` +
          (merging ? `\n(joined with ${picked.table.name}'s order)` : "") +
          "\nPlease serve the remaining dishes to the new table.",
      );
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("move_order", { p_order_id: order.id, p_to_table: picked.table.id });
    setBusy(false);
    if (error) {
      setError(error.message === "same_table" ? "That's the same table." : error.message === "order_not_open" ? "This bill is already closed." : error.message);
      return;
    }
    onMoved(picked.table, !!(data as { merged?: boolean })?.merged);
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <h3 className="text-xl font-bold">Move {from.name}&apos;s order</h3>
        <p className="mt-1 text-sm text-stone-500">Pick the table the guests are moving to. Everything comes along: dishes, kitchen progress, guest details and the bill.</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {choices.map((r) => {
            const on = r.table.id === target;
            const busyTable = !!r.order;
            const qty = r.items.filter((i) => i.status !== "void").reduce((n, i) => n + i.qty, 0);
            return (
              <button
                key={r.table.id}
                onClick={() => setTarget(r.table.id)}
                className={`rounded-xl p-3 text-left ring-1 transition ${on ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-200 hover:ring-stone-400"}`}
              >
                <div className="font-bold">{r.table.name}</div>
                <div className={`text-xs ${on ? "text-white/70" : busyTable ? "text-amber-700" : "text-emerald-700"}`}>
                  {busyTable ? `In use · ${qty} item${qty === 1 ? "" : "s"}` : "Free"}
                </div>
                {busyTable && r.guests[0] && <div className={`truncate text-xs ${on ? "text-white/70" : "text-stone-500"}`}>👤 {r.guests[0].name}</div>}
              </button>
            );
          })}
        </div>

        {picked && (
          <p className={`mt-4 rounded-xl p-3 text-sm ring-1 ${merging ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"}`}>
            {merging
              ? `${picked.table.name} already has an order. ${from.name}'s dishes will be added to it, making one bill for both tables.`
              : `${from.name}'s order moves to ${picked.table.name}. ${from.name} becomes free.`}
            {inKitchen && waOn && " WhatsApp will open so you can tell the kitchen."}
          </p>
        )}
        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-12 flex-1 rounded-xl font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50">
            Cancel
          </button>
          <button
            disabled={!picked || busy}
            onClick={confirmMove}
            className="h-12 flex-[2] rounded-xl bg-stone-900 font-bold text-white disabled:opacity-40"
          >
            {busy ? "Moving…" : !picked ? "Pick a table" : merging ? `Merge into ${picked.table.name}` : `Move to ${picked.table.name}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
