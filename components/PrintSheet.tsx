"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bill, Kot, type Loaded, PAPER_KEY } from "@/app/staff/print/[orderId]/PrintDoc";
import type { Cafe } from "@/lib/cafe";
import type { Receipt } from "@/lib/offline/types";
import type { Order, OrderItem } from "@/lib/types";

// Prints a kitchen slip, bill or receipt from what's on this screen, without opening a new
// page, so it works with no internet. Same layout as /staff/print.

export type PrintJob =
  | { kind: "kot"; tableName: string; items: OrderItem[] }
  | { kind: "bill"; tableName: string; order: Order; items: OrderItem[] }
  | { kind: "receipt"; receipt: Receipt };

function toLoaded(job: PrintJob, cafe: Cafe | null): Loaded {
  const blank: Order = { id: "", table_id: "", status: "open", note: null, created_at: new Date().toISOString(), closed_at: null };
  if (job.kind === "kot") {
    // Everything on a slip is for the kitchen to cook now.
    return { cafe, order: { ...blank, tables: { name: job.tableName } }, items: job.items.map((i) => ({ ...i, status: "pending" })), payments: [] };
  }
  if (job.kind === "bill") {
    return { cafe, order: { ...job.order, status: "open", tables: { name: job.tableName } }, items: job.items, payments: [] };
  }
  const r = job.receipt;
  return {
    cafe,
    order: {
      ...blank,
      status: "paid",
      created_at: r.closedAt,
      closed_at: r.closedAt,
      invoice_no: r.invoiceNo ?? "given when back online",
      subtotal_paise: r.subtotal,
      discount_paise: r.discount,
      discount_reason: r.discountReason,
      gst_rate_bps: r.rateBps,
      gst_paise: r.gst,
      total_paise: r.total,
      tables: { name: r.tableName },
    },
    items: r.items,
    payments: r.total > 0 ? [{ method: r.method, amount_paise: r.total, received_at: r.closedAt }] : [],
  };
}

export default function PrintSheet({ job, cafe, onClose }: { job: PrintJob; cafe: Cafe | null; onClose: () => void }) {
  const [paper, setPaper] = useState<"80" | "58">("80");
  const [printedAt] = useState(() => new Date().toISOString());
  const data = toLoaded(job, cafe);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Once per sheet: open the print dialog.
  useEffect(() => {
    try {
      const p = localStorage.getItem(PAPER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p === "58" || p === "80") setPaper(p);
    } catch {}
    // Only the sheet prints; the rest of the screen is hidden while printing.
    document.body.classList.add("pos-printing");
    const t = setTimeout(() => window.print(), 350);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("pos-printing");
    };
  }, []);

  function choosePaper(p: "80" | "58") {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {}
  }

  const title = job.kind === "kot" ? "Kitchen slip" : job.kind === "receipt" ? "Tax invoice" : "Bill (unpaid)";
  const width = paper === "80" ? "72mm" : "48mm";

  return createPortal(
    <div id="pos-print" className="fixed inset-0 z-[100] overflow-y-auto bg-stone-200 print:bg-white">
      <style>{`@page { size: ${paper}mm auto; margin: 0; }`}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-stone-300 bg-white px-4 py-3">
        <span className="font-semibold">{title}</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Printed from this device</span>
        <div className="ml-2 flex rounded-lg bg-stone-100 p-0.5 text-sm">
          {(["80", "58"] as const).map((p) => (
            <button key={p} onClick={() => choosePaper(p)} className={`rounded-md px-3 py-1 font-medium ${paper === p ? "bg-white shadow-sm" : "text-stone-500"}`}>
              {p}mm
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-500 ring-1 ring-stone-300">
            Close
          </button>
          <button onClick={() => window.print()} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-bold text-white">
            🖨 Print
          </button>
        </div>
      </div>
      <div className="flex justify-center py-6 print:block print:py-0">
        <div
          className="bg-white px-[3mm] py-[4mm] text-black shadow-lg print:shadow-none"
          style={{ width, fontSize: paper === "80" ? "12.5px" : "11px", lineHeight: 1.35, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}
        >
          {job.kind === "kot" ? <Kot data={data} printedAt={printedAt} /> : <Bill data={data} kind={job.kind} printedAt={printedAt} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
