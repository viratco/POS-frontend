"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BUSINESS, RESTAURANT_SAC } from "@/lib/business";
import { amount, billFor, gstSplit } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Order, OrderItem } from "@/lib/types";

type Kind = "bill" | "receipt" | "kot";
type Paper = "80" | "58";
type Loaded = {
  order: Order & { tables: { name: string } | null };
  items: OrderItem[];
  payments: { method: "upi" | "cash"; amount_paise: number; received_at: string }[];
};

const PAPER_KEY = "sohees.paper";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function PrintDoc() {
  const { orderId } = useParams<{ orderId: string }>();
  const params = useSearchParams();
  const kind = (["bill", "receipt", "kot"].includes(params.get("type") ?? "") ? params.get("type") : "bill") as Kind;
  const auto = params.get("auto") === "1";

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>("80");
  const [printedAt, setPrintedAt] = useState("");

  useEffect(() => {
    try {
      const p = localStorage.getItem(PAPER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p === "58" || p === "80") setPaper(p);
    } catch {}
    setPrintedAt(new Date().toISOString());
    const supabase = supabaseBrowser();
    void Promise.all([
      supabase.from("orders").select("*, tables(name)").eq("id", orderId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("payments").select("method, amount_paise, received_at").eq("order_id", orderId),
    ]).then(([o, i, p]) => {
      if (o.error) return setError(o.error.message);
      setData({ order: o.data as Loaded["order"], items: (i.data ?? []) as OrderItem[], payments: (p.data ?? []) as Loaded["payments"] });
    });
  }, [orderId]);

  // Auto-open the print dialog once the document has rendered.
  useEffect(() => {
    if (!auto || !data) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [auto, data]);

  function choosePaper(p: Paper) {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {}
  }

  const width = paper === "80" ? "72mm" : "48mm";
  const base = paper === "80" ? "12.5px" : "11px";

  return (
    <div className="min-h-screen bg-stone-200 print:bg-white">
      <style>{`
        @page { size: ${paper}mm auto; margin: 0; }
        @media print { html, body { background: #fff !important; } }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-stone-300 bg-white px-4 py-3">
        <span className="font-semibold">{kind === "kot" ? "Kitchen ticket" : kind === "receipt" ? "Tax invoice" : "Bill (unpaid)"}</span>
        <div className="ml-2 flex rounded-lg bg-stone-100 p-0.5 text-sm">
          {(["80", "58"] as Paper[]).map((p) => (
            <button key={p} onClick={() => choosePaper(p)} className={`rounded-md px-3 py-1 font-medium ${paper === p ? "bg-white shadow-sm" : "text-stone-500"}`}>
              {p}mm
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.close()} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-500 ring-1 ring-stone-300">
            Close
          </button>
          <button onClick={() => window.print()} disabled={!data} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
            🖨 Print
          </button>
        </div>
        {kind !== "kot" && !BUSINESS.gstin && (
          <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            GSTIN isn&apos;t set, so this isn&apos;t a valid tax invoice yet. Add NEXT_PUBLIC_GSTIN (and address) in the app&apos;s settings.
          </p>
        )}
      </div>

      <div className="flex justify-center py-6 print:block print:py-0">
        <div
          className="bg-white px-[3mm] py-[4mm] text-black shadow-lg print:shadow-none"
          style={{ width, fontSize: base, lineHeight: 1.35, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}
        >
          {error && <p>Couldn&apos;t load: {error}</p>}
          {!data && !error && <p>Loading…</p>}
          {data && kind === "kot" && <Kot data={data} printedAt={printedAt} />}
          {data && kind !== "kot" && <Bill data={data} kind={kind} printedAt={printedAt} />}
        </div>
      </div>
    </div>
  );
}

function Hr({ dashed = true }: { dashed?: boolean }) {
  return <div className={`my-[2mm] border-t border-black ${dashed ? "border-dashed" : ""}`} />;
}

function Line({ left, right, bold, big }: { left: React.ReactNode; right: React.ReactNode; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`} style={big ? { fontSize: "1.3em" } : undefined}>
      <span>{left}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}

function Bill({ data, kind, printedAt }: { data: Loaded; kind: "bill" | "receipt"; printedAt: string }) {
  const { order, items, payments } = data;
  const paid = order.status === "paid";
  const billed = items.filter((i) => ["pending", "ready", "served"].includes(i.status));
  // Paid bills use the frozen totals; open bills are an estimate from current items.
  const live = billFor(billed);
  const subtotal = paid ? (order.subtotal_paise ?? live.subtotal) : live.subtotal;
  const gst = paid ? (order.gst_paise ?? live.gst) : live.gst;
  const total = paid ? (order.total_paise ?? live.total) : live.total;
  const rateBps = paid ? (order.gst_rate_bps ?? live.rateBps) : live.rateBps;
  const { cgst, sgst } = gstSplit(gst);
  const halfRate = rateBps / 200;
  const isInvoice = kind === "receipt" && paid;

  return (
    <div>
      <div className="text-center">
        <div className="font-bold uppercase" style={{ fontSize: "1.35em", letterSpacing: "0.04em" }}>
          {BUSINESS.name}
        </div>
        {BUSINESS.legalName && <div>{BUSINESS.legalName}</div>}
        {BUSINESS.address && <div className="whitespace-pre-line">{BUSINESS.address}</div>}
        {BUSINESS.phone && <div>Ph: {BUSINESS.phone}</div>}
        {BUSINESS.gstin && <div>GSTIN: {BUSINESS.gstin}</div>}
        {BUSINESS.fssai && <div>FSSAI: {BUSINESS.fssai}</div>}
      </div>

      <Hr />
      <div className="text-center font-bold">{isInvoice ? "TAX INVOICE" : "BILL — NOT PAID"}</div>
      <Hr />

      {isInvoice && order.invoice_no && <Line left="Invoice No" right={order.invoice_no} />}
      <Line left="Date" right={when(isInvoice && order.closed_at ? order.closed_at : printedAt || order.created_at)} />
      <Line left="Table" right={order.tables?.name ?? "—"} />

      <Hr />
      <div className="flex font-bold">
        <span className="flex-1">Item</span>
        <span className="w-[2.5em] text-right">Qty</span>
        <span className="w-[5.5em] text-right">Amount</span>
      </div>
      <Hr />
      {billed.map((i) => (
        <div key={i.id} className="mb-[1mm]">
          <div className="flex">
            <span className="flex-1 pr-1">{i.name_snapshot}</span>
            <span className="w-[2.5em] text-right tabular-nums">{i.qty}</span>
            <span className="w-[5.5em] text-right tabular-nums">{amount(i.price_paise_snapshot * i.qty)}</span>
          </div>
          {i.qty > 1 && <div className="text-[0.85em]">@ {amount(i.price_paise_snapshot)}</div>}
        </div>
      ))}
      <Hr />

      <Line left={`Subtotal (${billed.reduce((n, i) => n + i.qty, 0)} items)`} right={amount(subtotal)} />
      {gst > 0 && (
        <>
          <Line left={`CGST @ ${halfRate}%`} right={amount(cgst)} />
          <Line left={`SGST @ ${halfRate}%`} right={amount(sgst)} />
        </>
      )}
      <Hr dashed={false} />
      <Line left="TOTAL" right={`₹ ${amount(total)}`} bold big />
      <Hr dashed={false} />

      {isInvoice ? (
        payments.map((p, idx) => <Line key={idx} left={`Paid by ${p.method === "upi" ? "UPI" : "Cash"}`} right={amount(p.amount_paise)} />)
      ) : (
        <div className="text-center">Please pay at the counter</div>
      )}

      <Hr />
      <div className="text-center">
        {isInvoice && <div className="text-[0.85em]">SAC {RESTAURANT_SAC} · Restaurant service</div>}
        <div className="mt-[1mm] font-semibold">{BUSINESS.footer}</div>
      </div>
    </div>
  );
}

function Kot({ data, printedAt }: { data: Loaded; printedAt: string }) {
  const { order, items } = data;
  const cooking = items.filter((i) => i.status === "pending");
  return (
    <div>
      <div className="text-center font-bold" style={{ fontSize: "1.2em" }}>
        KOT · KITCHEN
      </div>
      <Hr dashed={false} />
      <div className="text-center font-bold uppercase" style={{ fontSize: "2em", lineHeight: 1.1 }}>
        {order.tables?.name ?? "—"}
      </div>
      <div className="text-center">{printedAt ? when(printedAt) : ""}</div>
      <Hr dashed={false} />
      {cooking.length === 0 && <div className="text-center">Nothing in the kitchen for this table.</div>}
      {cooking.map((i) => (
        <div key={i.id} className="mb-[2mm]" style={{ fontSize: "1.35em", lineHeight: 1.25 }}>
          <div className="font-bold">
            {i.qty} × {i.name_snapshot}
          </div>
          {i.note && <div className="pl-[4mm] font-semibold">** {i.note}</div>}
        </div>
      ))}
      <Hr dashed={false} />
      <div className="text-center">Items: {cooking.reduce((n, i) => n + i.qty, 0)}</div>
    </div>
  );
}
