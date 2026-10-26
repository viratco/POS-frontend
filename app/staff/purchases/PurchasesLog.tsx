"use client";

import { useCallback, useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { formatINR } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Stock the café buys (ramen packets, raw chicken, vegetables...): one entry per supplier bill.

type Payment = "cash" | "upi" | "bank" | "credit";
const PAYMENTS: { key: Payment; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "upi", label: "UPI" },
  { key: "bank", label: "Bank" },
  { key: "credit", label: "Pay later" },
];
const UNITS = ["kg", "g", "l", "ml", "pcs", "packet", "box", "dozen", "tray", "bottle", "can"] as const;
type Unit = (typeof UNITS)[number];
const unitLabel = (u: string) => (u === "l" ? "L" : u === "packet" ? "packets" : u);

type PurchaseRow = {
  id: string;
  supplier: string | null;
  bill_no: string | null;
  note: string | null;
  purchased_on: string;
  payment: Payment;
  total_paise: number;
  voided_at: string | null;
  void_reason: string | null;
  purchase_items: { id: string; name: string; qty: number; unit: string; amount_paise: number }[];
};

// What we remember about an item from past bills, to fill in the next one.
type Known = { name: string; unit: Unit; ratePaise: number };

type Line = { key: string; name: string; qty: string; unit: Unit; amount: string; amountTouched: boolean };

type Range = "today" | "week" | "month" | "lastmonth";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeDates(r: Range): [string, string] {
  const now = new Date();
  const today = iso(now);
  if (r === "today") return [today, today];
  if (r === "week") return [iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), today];
  if (r === "month") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
}

const toPaise = (rupees: string) => {
  const n = Number(rupees);
  return rupees.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const fmtQty = (q: number) => String(Number(q.toFixed(3)));
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

const MESSAGES: Record<string, string> = {
  invalid_cart: "Add at least one item.",
  invalid_date: "The date can't be in the future or more than two months back.",
  forbidden: "This login can't record purchases.",
  not_found: "That entry was already changed. Refresh the page.",
};
const friendly = (m: string) =>
  MESSAGES[m] ??
  (/check constraint/.test(m)
    ? "Check each item has a name, a quantity above 0, and an amount."
    : /purchase/.test(m) && /exist|find|schema/.test(m)
      ? "Purchases aren't set up in the database yet."
      : m);

export default function PurchasesLog() {
  const supabase = supabaseBrowser();
  const [range, setRange] = useState<Range>("today");
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [known, setKnown] = useState<Map<string, Known>>(new Map());
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Past items and suppliers, newest first, so the form can suggest them.
  const loadMemory = useCallback(async () => {
    const { data } = await supabase
      .from("purchases")
      .select("supplier, purchased_on, purchase_items(name, qty, unit, amount_paise)")
      .is("voided_at", null)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    const items = new Map<string, Known>();
    const sup = new Set<string>();
    for (const p of (data ?? []) as unknown as Pick<PurchaseRow, "supplier" | "purchase_items">[]) {
      if (p.supplier) sup.add(p.supplier);
      for (const i of p.purchase_items) {
        const k = i.name.toLowerCase();
        if (!items.has(k) && i.qty > 0) items.set(k, { name: i.name, unit: i.unit as Unit, ratePaise: i.amount_paise / i.qty });
      }
    }
    setKnown(items);
    setSuppliers([...sup]);
  }, [supabase]);

  const load = useCallback(
    async (r: Range) => {
      setLoading(true);
      const [from, to] = rangeDates(r);
      const { data, error } = await supabase
        .from("purchases")
        .select("*, purchase_items(id, name, qty, unit, amount_paise)")
        .gte("purchased_on", from)
        .lte("purchased_on", to)
        .order("purchased_on", { ascending: false })
        .order("created_at", { ascending: false });
      setLoading(false);
      if (error) setError(friendly(error.message));
      else {
        setError(null);
        setRows((data ?? []) as PurchaseRow[]);
      }
    },
    [supabase],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(range);
  }, [range, load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMemory();
  }, [loadMemory]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    const { error } = await fn();
    if (error) setError(friendly(error.message));
    else showToast(done);
    void load(range);
    void loadMemory();
  }

  const counted = rows.filter((r) => !r.voided_at);
  const spent = counted.reduce((s, r) => s + r.total_paise, 0);
  const owed = counted.filter((r) => r.payment === "credit").reduce((s, r) => s + r.total_paise, 0);

  // Where the money went: top items and suppliers in this period.
  const itemTotals = new Map<string, { name: string; paise: number; qty: Map<string, number> }>();
  const supplierTotals = new Map<string, number>();
  for (const r of counted) {
    const who = r.supplier ?? "No supplier";
    supplierTotals.set(who, (supplierTotals.get(who) ?? 0) + r.total_paise);
    for (const i of r.purchase_items) {
      const k = i.name.toLowerCase();
      const e = itemTotals.get(k) ?? { name: i.name, paise: 0, qty: new Map<string, number>() };
      e.paise += i.amount_paise;
      e.qty.set(i.unit, (e.qty.get(i.unit) ?? 0) + Number(i.qty));
      itemTotals.set(k, e);
    }
  }
  const topItems = [...itemTotals.values()].sort((a, b) => b.paise - a.paise).slice(0, 6);
  const bySupplier = [...supplierTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-stone-900">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
            <p className="text-sm text-stone-500">Stock you buy: ramen packets, chicken, vegetables, sauces…</p>
          </div>
          <button onClick={() => setAdding(true)} className="h-11 rounded-xl bg-stone-900 px-5 text-sm font-bold text-white hover:bg-stone-800">
            + Add purchase
          </button>
        </div>

        <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-stone-200 sm:inline-flex">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold ${range === r.key ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-900"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Spent on stock" value={formatINR(spent)} strong />
          <Stat label="Bills" value={String(counted.length)} />
          <Stat label="Paid" value={formatINR(spent - owed)} />
          <Stat label="To pay suppliers" value={formatINR(owed)} warn={owed > 0} />
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

        {counted.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Breakdown title="Top items">
              {topItems.map((i) => (
                <BreakdownRow
                  key={i.name}
                  label={i.name}
                  hint={[...i.qty.entries()].map(([u, q]) => `${fmtQty(q)} ${unitLabel(u)}`).join(" + ")}
                  value={formatINR(i.paise)}
                />
              ))}
            </Breakdown>
            <Breakdown title="By supplier">
              {bySupplier.map(([name, paise]) => (
                <BreakdownRow key={name} label={name} value={formatINR(paise)} />
              ))}
            </Breakdown>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {loading ? (
            <p className="p-8 text-center text-stone-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-stone-400">No purchases in this period.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map((r) => (
                <li key={r.id} className={`px-4 py-3 ${r.voided_at ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`font-semibold ${r.voided_at ? "line-through" : ""}`}>{r.supplier ?? "No supplier"}</span>
                        <PaymentBadge payment={r.payment} />
                        <span className="text-xs text-stone-400">
                          {fmtDay(r.purchased_on)}
                          {r.bill_no && ` · Bill ${r.bill_no}`}
                        </span>
                      </div>
                      <div className={`mt-1 text-sm text-stone-600 ${r.voided_at ? "line-through" : ""}`}>
                        {r.purchase_items.map((i) => `${i.name} ${fmtQty(Number(i.qty))} ${unitLabel(i.unit)}`).join(" · ")}
                      </div>
                      {r.note && <div className="mt-0.5 text-xs text-stone-500">{r.note}</div>}
                      {r.voided_at && <div className="mt-0.5 text-xs font-semibold text-red-600">Removed{r.void_reason ? ` (${r.void_reason})` : ""}</div>}
                    </div>
                    <div className={`text-right font-bold tabular-nums ${r.voided_at ? "line-through" : ""}`}>{formatINR(r.total_paise)}</div>
                  </div>
                  {!r.voided_at && (
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      {r.payment === "credit" && (
                        <>
                          <span className="text-xs text-stone-500">Paid now by</span>
                          {PAYMENTS.filter((p) => p.key !== "credit").map((p) => (
                            <button
                              key={p.key}
                              onClick={() => act(() => supabase.rpc("settle_purchase", { p_id: r.id, p_payment: p.key }), `Marked paid by ${p.label}`)}
                              className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            >
                              {p.label}
                            </button>
                          ))}
                        </>
                      )}
                      <RemoveButton
                        onConfirm={() => act(() => supabase.rpc("void_purchase", { p_id: r.id, p_reason: "Entered by mistake" }), "Removed from totals")}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {adding && (
        <AddPurchase
          known={known}
          suppliers={suppliers}
          onClose={() => setAdding(false)}
          onSaved={(total) => {
            setAdding(false);
            showToast(`Saved · ${formatINR(total)}`);
            void load(range);
            void loadMemory();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function Stat({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  const look = strong ? "bg-stone-900 text-white ring-stone-900" : warn ? "bg-amber-50 ring-amber-200" : "bg-white ring-stone-200";
  return (
    <div className={`rounded-2xl p-4 ring-1 ${look}`}>
      <div className={`text-xs font-semibold ${strong ? "text-stone-300" : warn ? "text-amber-800" : "text-stone-500"}`}>{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Breakdown({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</div>
      <ul className="mt-2 space-y-1.5">{children}</ul>
    </div>
  );
}

function BreakdownRow({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">
        {label}
        {hint && <span className="ml-1.5 text-xs text-stone-400">{hint}</span>}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}

function PaymentBadge({ payment }: { payment: Payment }) {
  if (payment === "credit") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Pay later</span>;
  return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">{PAYMENTS.find((p) => p.key === payment)?.label}</span>;
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
      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${armed ? "bg-red-600 text-white" : "text-stone-400 ring-1 ring-stone-200 hover:text-stone-700"}`}
    >
      {armed ? "Tap again" : "Remove"}
    </button>
  );
}

/* ───────────────────────── add form ───────────────────────── */

let nextKey = 0;
const blankLine = (): Line => ({ key: String(nextKey++), name: "", qty: "1", unit: "kg", amount: "", amountTouched: false });

function AddPurchase({
  known,
  suppliers,
  onClose,
  onSaved,
}: {
  known: Map<string, Known>;
  suppliers: string[];
  onClose: () => void;
  onSaved: (totalPaise: number) => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [day, setDay] = useState(iso(new Date()));
  const [payment, setPayment] = useState<Payment>("cash");
  const [billNo, setBillNo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest the amount from the last price paid for this item (until it's typed by hand).
  function suggested(l: Line): Line {
    const k = known.get(l.name.trim().toLowerCase());
    const q = Number(l.qty);
    if (!k || l.amountTouched || !(q > 0) || k.unit !== l.unit) return l;
    return { ...l, amount: String(Math.round((k.ratePaise * q) / 100)) };
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        let next = { ...l, ...patch };
        // Picking a known item also brings back its usual unit.
        if (patch.name !== undefined) {
          const k = known.get(patch.name.trim().toLowerCase());
          if (k) next = { ...next, name: k.name, unit: k.unit };
        }
        return suggested(next);
      }),
    );
  }

  const total = lines.reduce((s, l) => s + (toPaise(l.amount) || 0), 0);
  const filled = lines.filter((l) => l.name.trim() || l.amount.trim());

  async function save() {
    if (!filled.length) return setError("Add at least one item.");
    const bad = filled.find((l) => !l.name.trim() || !(Number(l.qty) > 0) || Number.isNaN(toPaise(l.amount)));
    if (bad) return setError(`Fill in the name, quantity and amount for every item${bad.name ? ` (${bad.name})` : ""}.`);
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("add_purchase", {
      p_items: filled.map((l) => ({ name: l.name.trim(), qty: Number(l.qty), unit: l.unit, amount_paise: toPaise(l.amount) })),
      p_supplier: supplier,
      p_purchased_on: day,
      p_payment: payment,
      p_bill_no: billNo,
      p_note: note,
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    onSaved((data as { total_paise: number }).total_paise);
  }

  const field = "h-11 rounded-xl bg-stone-100 px-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-stone-900";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-bold">Add purchase</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-400 hover:text-stone-800" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
            <input list="suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={60} placeholder="Supplier (e.g. Sharma Poultry)" className={field} />
            <input type="date" value={day} max={iso(new Date())} onChange={(e) => setDay(e.target.value)} className={field} />
            <datalist id="suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <div className="mb-2 hidden grid-cols-[1fr_4.5rem_5.5rem_6rem_1.25rem] gap-2 px-1 sm:grid text-[11px] font-semibold text-stone-400 uppercase">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Amount ₹</span>
              <span />
            </div>
            <ul className="space-y-2">
              {lines.map((l) => {
                const q = Number(l.qty);
                const paise = toPaise(l.amount);
                return (
                  <li key={l.key} className="rounded-xl border border-stone-100 p-2 sm:border-0 sm:p-0">
                    {/* Phone: item name on its own row, then qty · unit · amount. Wider screens: one row. */}
                    <div className="grid grid-cols-[1fr_1fr_1fr_1.25rem] items-center gap-2 sm:grid-cols-[1fr_4.5rem_5.5rem_6rem_1.25rem]">
                      <input
                        list="known-items"
                        value={l.name}
                        onChange={(e) => update(l.key, { name: e.target.value })}
                        placeholder="Item, e.g. Raw chicken"
                        maxLength={80}
                        className={`${field} col-span-3 h-10 min-w-0 sm:col-span-1`}
                      />
                      <input
                        value={l.qty}
                        onChange={(e) => update(l.key, { qty: e.target.value.replace(/[^\d.]/g, "") })}
                        inputMode="decimal"
                        aria-label="Quantity"
                        className={`${field} h-10 min-w-0 text-right tabular-nums`}
                      />
                      <select value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value as Unit })} className={`${field} h-10 min-w-0 px-2`}>
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {unitLabel(u)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={l.amount}
                        onChange={(e) => update(l.key, { amount: e.target.value.replace(/[^\d.]/g, ""), amountTouched: true })}
                        inputMode="decimal"
                        placeholder="₹ amount"
                        className={`${field} h-10 min-w-0 text-right tabular-nums`}
                      />
                      <button
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}
                        className="col-start-4 row-start-1 text-stone-400 hover:text-red-600 sm:col-start-auto sm:row-start-auto"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                    {q > 0 && paise > 0 && (
                      <div className="mt-0.5 pr-8 text-right text-[11px] text-stone-400">
                        {formatINR(Math.round(paise / q))} per {l.unit === "packet" ? "packet" : unitLabel(l.unit)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <datalist id="known-items">
              {[...known.values()].map((k) => (
                <option key={k.name} value={k.name} />
              ))}
            </datalist>
            <button onClick={() => setLines((ls) => [...ls, blankLine()])} className="mt-3 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              + Add another item
            </button>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-stone-500">Paid by</div>
            <div className="flex flex-wrap gap-2">
              {PAYMENTS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPayment(p.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                    payment === p.key
                      ? "bg-stone-900 text-white ring-stone-900"
                      : p.key === "credit"
                        ? "bg-amber-50 text-amber-800 ring-amber-200"
                        : "bg-white text-stone-700 ring-stone-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input value={billNo} onChange={(e) => setBillNo(e.target.value)} maxLength={40} placeholder="Bill no. (optional)" className={field} />
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional)" className={field} />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-stone-100 px-5 py-4">
          <div className="flex-1">
            <div className="text-xs text-stone-500">
              {filled.length} item{filled.length === 1 ? "" : "s"}
            </div>
            <div className="text-xl font-bold tabular-nums">{formatINR(total)}</div>
          </div>
          <button onClick={save} disabled={busy} className="h-12 rounded-xl bg-emerald-600 px-6 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy ? "Saving…" : "Save purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}
