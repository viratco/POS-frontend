"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { formatINR } from "@/lib/money";
import { optionsLabel } from "@/lib/options";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { OrderStatus, PickedOption } from "@/lib/types";

// Everyone who gave their name and number on the QR menu, one row per phone number,
// with every bill they were part of.

type GuestRow = {
  order_id: string;
  name: string;
  phone: string;
  marketing_consent: boolean;
  created_at: string;
  orders: { status: OrderStatus; total_paise: number | null; created_at: string } | null;
};

type Customer = {
  phone: string;
  name: string; // the name they used last
  otherNames: string[];
  consent: boolean;
  visits: number; // bills not cancelled
  spent: number; // paid bills they were on, with GST
  last: string;
  orderIds: string[]; // newest first
};

type Bill = {
  id: string;
  status: OrderStatus;
  invoice_no: string | null;
  created_at: string;
  closed_at: string | null;
  total_paise: number | null;
  discount_paise: number | null;
  tables: { name: string } | null;
  order_items: { id: string; name_snapshot: string; qty: number; price_paise_snapshot: number; status: string; options: PickedOption[] | null }[];
  payments: { method: "upi" | "cash" }[];
};

type Sort = "recent" | "visits" | "spent";

const PAGE = 1000; // the database hands out at most this many rows per request

// "9876543210" -> "98765 43210"
function formatPhone(p: string) {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function ago(iso: string) {
  // Calendar days, not 24-hour periods: 8 PM last night is "yesterday" even at 9 AM.
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(new Date(iso))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function group(rows: GuestRow[]): Customer[] {
  const byPhone = new Map<string, Customer & { seen: Set<string> }>();
  // Newest first, so the first row for a phone carries the name they use now.
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    let c = byPhone.get(r.phone);
    if (!c) {
      c = { phone: r.phone, name: r.name, otherNames: [], consent: false, visits: 0, spent: 0, last: r.created_at, orderIds: [], seen: new Set() };
      byPhone.set(r.phone, c);
    }
    if (r.name !== c.name && !c.otherNames.includes(r.name)) c.otherNames.push(r.name);
    c.consent ||= r.marketing_consent;
    if (c.seen.has(r.order_id)) continue;
    c.seen.add(r.order_id);
    c.orderIds.push(r.order_id);
    if (r.orders?.status !== "cancelled") c.visits++;
    if (r.orders?.status === "paid") c.spent += r.orders.total_paise ?? 0;
  }
  return [...byPhone.values()].map((c) => ({ phone: c.phone, name: c.name, otherNames: c.otherNames, consent: c.consent, visits: c.visits, spent: c.spent, last: c.last, orderIds: c.orderIds }));
}

export default function CustomersList() {
  const [rows, setRows] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const all: GuestRow[] = [];
    for (let from = 0; from < PAGE * 30; from += PAGE) {
      const { data, error } = await db
        .from("order_guests")
        .select("order_id, name, phone, marketing_consent, created_at, orders(status, total_paise, created_at)")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        setError(error.message);
        break;
      }
      all.push(...((data ?? []) as unknown as GuestRow[]));
      if ((data ?? []).length < PAGE) break;
    }
    setRows(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const customers = useMemo(() => group(rows), [rows]);
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const shown = customers
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.otherNames.some((n) => n.toLowerCase().includes(q)) || (digits.length >= 3 && c.phone.includes(digits)))
    .sort((a, b) => (sort === "visits" ? b.visits - a.visits : sort === "spent" ? b.spent - a.spent : 0) || b.last.localeCompare(a.last));

  const repeat = customers.filter((c) => c.visits >= 2).length;
  const offers = customers.filter((c) => c.consent).length;

  function download() {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["Name", "Phone", "Visits", "Spent (Rs)", "Last visit", "OK to send offers"].map(cell).join(","),
      ...customers.map((c) =>
        [c.name, c.phone, c.visits, (c.spent / 100).toFixed(2), new Date(c.last).toLocaleDateString("en-IN"), c.consent ? "Yes" : "No"].map(cell).join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-stone-900">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-sm text-stone-500">Guests who ordered from the QR menu with their name and number.</p>
          </div>
          <button
            onClick={download}
            disabled={customers.length === 0}
            className="h-11 rounded-xl bg-white px-4 text-sm font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
          >
            ⬇ Download list
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Customers" value={String(customers.length)} />
          <Stat label="Came back" value={String(repeat)} hint={customers.length ? `${Math.round((repeat / customers.length) * 100)}% of guests` : undefined} />
          <Stat label="OK to send offers" value={String(offers)} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-stone-900">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone number…"
              className="h-11 w-full bg-transparent text-[15px] outline-none"
            />
          </div>
          <div className="flex rounded-xl bg-white p-1 ring-1 ring-stone-200">
            {(
              [
                ["recent", "Recent"],
                ["visits", "Most visits"],
                ["spent", "Top spenders"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${sort === k ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

        <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {loading ? (
            <p className="p-8 text-center text-stone-400">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-stone-400">
              {q ? "No customer matches that name or number." : "No customers yet. They appear here once guests order from the QR menu."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {shown.map((c) => (
                <li key={c.phone} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0e7d8] font-bold text-[#6e5d4e]">
                    {c.name.trim()[0]?.toUpperCase() ?? "·"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-semibold">{c.name}</span>
                      {c.visits >= 5 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Regular</span>}
                      {c.consent && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">OK to send offers</span>}
                    </div>
                    <div className="text-sm text-stone-500">
                      <a href={`tel:+91${c.phone}`} className="font-medium text-emerald-700 tabular-nums hover:underline">
                        {formatPhone(c.phone)}
                      </a>
                      <span className="tabular-nums">
                        {" "}
                        · {c.visits} visit{c.visits === 1 ? "" : "s"} · {formatINR(c.spent)} · last visit {ago(c.last)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpen(c)}
                    className="h-10 shrink-0 rounded-xl px-3 text-sm font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 sm:px-4"
                  >
                    View bills
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {open && <BillsDrawer key={open.phone} customer={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-stone-400">{hint}</div>}
    </div>
  );
}

const STATUS: Record<OrderStatus, { label: string; chip: string }> = {
  paid: { label: "Paid", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  open: { label: "At the table now", chip: "bg-amber-50 text-amber-800 ring-amber-200" },
  cancelled: { label: "Cancelled", chip: "bg-stone-100 text-stone-500 ring-stone-200" },
};

// Every bill this customer was on, newest first, with what they ordered.
function BillsDrawer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = customer.orderIds.slice(0, 60);
    void supabaseBrowser()
      .from("orders")
      .select("id, status, invoice_no, created_at, closed_at, total_paise, discount_paise, tables(name), order_items(id, name_snapshot, qty, price_paise_snapshot, status, options), payments(method)")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "order_items" })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setBills((data ?? []) as unknown as Bill[]);
      });
  }, [customer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // What they order most, across all their bills.
  const favourites = useMemo(() => {
    const count = new Map<string, number>();
    for (const b of bills ?? [])
      for (const i of b.order_items) if (i.status !== "void") count.set(i.name_snapshot, (count.get(i.name_snapshot) ?? 0) + i.qty);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [bills]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-stone-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[480px] animate-slide-in flex-col bg-[#fbfaf8] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold tracking-tight">{customer.name}</h2>
            <a href={`tel:+91${customer.phone}`} className="text-sm font-semibold text-emerald-700 tabular-nums hover:underline">
              📞 {formatPhone(customer.phone)}
            </a>
            <p className="mt-1 text-sm text-stone-500">
              {customer.visits} visit{customer.visits === 1 ? "" : "s"} · {formatINR(customer.spent)} in total · last visit {ago(customer.last)}
            </p>
            {customer.otherNames.length > 0 && <p className="text-xs text-stone-400">Also ordered as {customer.otherNames.join(", ")}</p>}
            {favourites.length > 0 && (
              <p className="mt-1.5 text-sm">
                <span className="font-semibold">Usually orders:</span> {favourites.map(([n, q]) => `${n} (${q})`).join(", ")}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
          {!bills && !error && <p className="py-10 text-center text-stone-400">Loading bills…</p>}
          {bills?.map((b) => {
            const lines = b.order_items.filter((i) => i.status !== "void" && i.status !== "new");
            const s = STATUS[b.status];
            return (
              <div key={b.id} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{when(b.closed_at ?? b.created_at)}</div>
                    <div className="text-xs text-stone-500 tabular-nums">
                      {b.tables?.name ?? "—"}
                      {b.invoice_no ? ` · ${b.invoice_no}` : ""}
                      {b.payments.length ? ` · ${b.payments.map((p) => (p.method === "upi" ? "UPI" : "Cash")).join(" + ")}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.chip}`}>{s.label}</span>
                </div>
                <ul className="mt-2 space-y-1 border-t border-dashed border-stone-200 pt-2 text-sm">
                  {lines.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>
                        <span className="font-semibold">{i.qty}×</span> {i.name_snapshot}
                        {i.options && i.options.length > 0 && <span className="block pl-5 text-xs text-stone-500">{optionsLabel(i.options)}</span>}
                      </span>
                      <span className="tabular-nums text-stone-600">{formatINR(i.price_paise_snapshot * i.qty)}</span>
                    </li>
                  ))}
                  {lines.length === 0 && <li className="text-stone-400">No dishes billed.</li>}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
                  <span className="text-sm text-stone-500">
                    {(b.discount_paise ?? 0) > 0 ? `${formatINR(b.discount_paise!)} off · ` : ""}
                    {b.status === "paid" ? "Total with GST" : "So far"}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold tabular-nums">
                      {formatINR(b.status === "paid" ? (b.total_paise ?? 0) : lines.reduce((t, i) => t + i.price_paise_snapshot * i.qty, 0))}
                    </span>
                    {b.status === "paid" && (
                      <button
                        onClick={() => window.open(`/staff/print/${b.id}?type=receipt&auto=1`, "_blank")}
                        className="rounded-lg px-2.5 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
                      >
                        🖨 Print
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {bills && customer.orderIds.length > 60 && <p className="text-center text-xs text-stone-400">Showing their latest 60 visits.</p>}
        </div>
      </aside>
    </div>
  );
}
