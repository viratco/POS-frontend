"use client";

import { useCallback, useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { formatINR } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";

type BillRow = {
  id: string;
  invoice_no: string | null;
  closed_at: string;
  total_paise: number;
  discount_paise?: number | null;
  discount_reason?: string | null;
  offline_note?: string | null; // what the server adjusted when an offline bill was sent
  tables: { name: string } | null;
  payments: { method: "upi" | "cash"; amount_paise: number }[];
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BillsList() {
  const [day, setDay] = useState("");
  const [today, setToday] = useState("");
  const [rows, setRows] = useState<BillRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(todayISO());
    setToday(todayISO());
  }, []);

  const load = useCallback(async (d: string) => {
    if (!d) return;
    setLoading(true);
    const start = new Date(`${d}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { data, error } = await supabaseBrowser()
      .from("orders")
      .select("*, tables(name), payments(method, amount_paise)")
      .eq("status", "paid")
      .gte("closed_at", start.toISOString())
      .lt("closed_at", end.toISOString())
      .order("closed_at", { ascending: false });
    setLoading(false);
    if (error) setError(error.message);
    else {
      setError(null);
      setRows((data ?? []) as unknown as BillRow[]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(day);
  }, [day, load]);

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || (r.invoice_no ?? "").toLowerCase().includes(q) || (r.tables?.name ?? "").toLowerCase().includes(q));
  const sum = (m?: "upi" | "cash") =>
    rows.reduce((s, r) => s + r.payments.filter((p) => !m || p.method === m).reduce((a, p) => a + p.amount_paise, 0), 0);

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-stone-900">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bills</h1>
            <p className="text-sm text-stone-500">Find a paid bill and print its receipt again.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={day}
              max={today || undefined}
              onChange={(e) => setDay(e.target.value)}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-900"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Invoice or table…"
              className="h-11 w-44 rounded-xl bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Bills" value={String(rows.length)} />
          <Stat label="Total" value={formatINR(sum())} />
          <Stat label="UPI" value={formatINR(sum("upi"))} />
          <Stat label="Cash" value={formatINR(sum("cash"))} />
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

        <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {loading ? (
            <p className="p-8 text-center text-stone-400">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-stone-400">No paid bills{q ? " match" : " on this day"}.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {shown.map((r) => (
                <li key={r.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold tabular-nums">
                      {r.invoice_no ?? "—"}
                      {/\/[A-Z]\d{4}$/.test(r.invoice_no ?? "") && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="Paid while the internet was down">
                          Offline bill
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-stone-500">
                      {r.tables?.name ?? "—"} ·{" "}
                      {new Date(r.closed_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} ·{" "}
                      {r.payments.map((p) => (p.method === "upi" ? "UPI" : "Cash")).join(" + ") || "Complimentary"}
                      {(r.discount_paise ?? 0) > 0 && (
                        <span className="ml-1 font-semibold text-emerald-700">
                          · {formatINR(r.discount_paise!)} off{r.discount_reason ? ` (${r.discount_reason})` : ""}
                        </span>
                      )}
                    </div>
                    {r.offline_note && <div className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">⚠ {r.offline_note}</div>}
                  </div>
                  <div className="text-lg font-bold tabular-nums">{formatINR(r.total_paise)}</div>
                  <button
                    onClick={() => window.open(`/staff/print/${r.id}?type=receipt&auto=1`, "_blank")}
                    className="h-10 rounded-xl px-4 text-sm font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50"
                  >
                    🖨 Print
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
