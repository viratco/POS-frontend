import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MezanaEmblem, MezanaWordmark } from "@/components/Mezana";
import { RESTAURANT_SAC } from "@/lib/business";
import { amount, formatINR, gstSplit } from "@/lib/money";
import { payLabel } from "@/lib/payments";
import { billWhen, publicBill } from "@/lib/publicBill";
import SaveButton from "./SaveButton";

// /b/<token>: the guest's copy of a paid bill, sent on WhatsApp from the counter. Anyone with the
// link can see this one bill; it is kept out of search engines.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const bill = await publicBill((await params).token);
  const robots = { index: false, follow: false };
  if (!bill) return { title: "Bill", robots };
  // WhatsApp shows this title and the bill picture (opengraph-image) as the link preview.
  const title = `Your bill from ${bill.cafe.name} · ${formatINR(bill.order.total_paise)}`;
  const description = bill.cafe.google_review_url ? "Tap to see your full bill and leave us a Google review." : "Tap to see your full bill.";
  return { title: { absolute: title }, description, robots, openGraph: { title, description, siteName: bill.cafe.name, type: "website" } };
}
export const viewport: Viewport = { themeColor: "#f6f1e8" };

export default function BillPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f6f1e8]" />}>
      <Bill params={params} />
    </Suspense>
  );
}

async function Bill({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bill = await publicBill(token);
  if (!bill) notFound();

  const { cafe, order, items, payments } = bill;
  const discount = order.discount_paise ?? 0;
  const { cgst, sgst } = gstSplit(order.gst_paise);
  const half = order.gst_rate_bps / 200;
  const when = billWhen(order.closed_at);

  return (
    <main className="min-h-screen bg-[#f6f1e8] px-4 py-8 text-stone-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-md">
        <a
          href="https://www.mezana.in"
          target="_blank"
          rel="noopener"
          className="mb-4 flex items-center justify-between rounded-2xl bg-[#1b070b] px-4 py-3 text-[#f7eedd] print:hidden"
        >
          <span className="flex items-center gap-2.5">
            <MezanaEmblem className="h-7 w-auto" />
            <MezanaWordmark className="h-3.5 w-auto text-[#f7eedd]" />
          </span>
          <span className="text-[11px] font-semibold tracking-[0.16em] text-[#be9445] uppercase">Digital bill</span>
        </a>
        <article className="rounded-3xl bg-white p-6 shadow-[0_20px_50px_-30px_rgba(60,30,20,.45)] ring-1 ring-stone-200 print:shadow-none print:ring-0">
          <header className="text-center">
            {cafe.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cafe.logo_url} alt="" className="mx-auto mb-3 h-14 w-14 rounded-full object-cover ring-1 ring-stone-200" />
            ) : null}
            <h1 className="text-2xl font-bold tracking-tight">{cafe.name}</h1>
            <div className="mt-1 space-y-0.5 text-xs leading-relaxed text-stone-500">
              {cafe.legal_name && <p>{cafe.legal_name}</p>}
              {cafe.address && <p className="whitespace-pre-line">{cafe.address}</p>}
              {cafe.phone && <p>Ph: {cafe.phone}</p>}
              {(cafe.gstin || cafe.fssai) && (
                <p>
                  {cafe.gstin && <>GSTIN {cafe.gstin}</>}
                  {cafe.gstin && cafe.fssai && " · "}
                  {cafe.fssai && <>FSSAI {cafe.fssai}</>}
                </p>
              )}
            </div>
          </header>

          <div className="mt-5 rounded-2xl bg-stone-50 px-4 py-3 text-sm">
            <div className="flex justify-between font-bold">
              <span>Tax invoice</span>
              <span className="tabular-nums">{order.invoice_no ?? "—"}</span>
            </div>
            <div className="mt-1 flex justify-between text-stone-500">
              <span>{when}</span>
              {order.table && <span>{order.table}</span>}
            </div>
          </div>

          <ul className="mt-4 divide-y divide-stone-100">
            {items.map((i, k) => (
              <li key={k} className="flex gap-3 py-2.5 text-sm">
                <span className="w-6 shrink-0 font-semibold text-stone-500 tabular-nums">{i.qty}×</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{i.name}</span>
                  {i.options && i.options.length > 0 && <span className="block text-xs text-stone-500">+ {i.options.map((o) => o.name).join(", ")}</span>}
                  {i.qty > 1 && <span className="block text-xs text-stone-400">@ ₹{amount(i.price_paise)}</span>}
                </span>
                <span className="font-medium tabular-nums">₹{amount(i.price_paise * i.qty)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-2 space-y-1 border-t border-dashed border-stone-300 pt-3 text-sm">
            <Row label="Subtotal" value={`₹${amount(order.subtotal_paise)}`} />
            {discount > 0 && (
              <>
                <Row label={`Discount${order.discount_reason ? ` (${order.discount_reason})` : ""}`} value={`− ₹${amount(discount)}`} accent />
                <Row label="Taxable value" value={`₹${amount(order.subtotal_paise - discount)}`} />
              </>
            )}
            {order.gst_paise > 0 && (
              <>
                <Row label={`CGST @ ${half}%`} value={`₹${amount(cgst)}`} />
                <Row label={`SGST @ ${half}%`} value={`₹${amount(sgst)}`} />
              </>
            )}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-stone-900 pt-3">
            <span className="font-bold">Total</span>
            <span className="text-3xl font-bold tracking-tight tabular-nums">{formatINR(order.total_paise)}</span>
          </div>
          {payments.length > 0 && (
            <p className="mt-1 text-right text-sm text-stone-500">
              Paid by {payments.map((p) => (payments.length > 1 ? `${payLabel(p.method)} ${formatINR(p.amount_paise)}` : payLabel(p.method))).join(" + ")}
            </p>
          )}

          <footer className="mt-5 text-center text-xs text-stone-400">
            <p>SAC {RESTAURANT_SAC} · Restaurant service</p>
            <p className="mt-2 text-sm font-semibold text-stone-700">{cafe.bill_footer}</p>
          </footer>
        </article>

        {cafe.google_review_url && (
          <section className="mt-5 rounded-3xl bg-white p-6 text-center ring-1 ring-stone-200 print:hidden">
            <div className="text-2xl" aria-hidden>
              ⭐⭐⭐⭐⭐
            </div>
            <h2 className="mt-2 text-lg font-bold">Enjoyed your visit?</h2>
            <p className="mt-1 text-sm text-stone-500">A quick Google review helps {cafe.name} more than you know.</p>
            <a
              href={cafe.google_review_url}
              target="_blank"
              rel="noopener"
              className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-stone-900 font-bold text-white hover:bg-stone-800"
            >
              <GoogleG /> Review us on Google
            </a>
          </section>
        )}

        <div className="mt-4 flex justify-center print:hidden">
          <SaveButton />
        </div>

        <a href="https://www.mezana.in" target="_blank" rel="noopener" className="mt-8 flex flex-col items-center gap-2 pb-4 text-stone-400 print:hidden">
          <MezanaEmblem className="h-8 w-auto" />
          <span className="flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase">
            Powered by <MezanaWordmark className="h-3 w-auto text-[#5e1420]" />
          </span>
          <span className="text-xs text-stone-400">QR ordering &amp; billing for cafés · mezana.in</span>
        </a>
      </div>
    </main>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${accent ? "font-semibold text-emerald-700" : "text-stone-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
