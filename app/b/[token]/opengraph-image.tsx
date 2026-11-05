import { ImageResponse } from "next/og";
import { formatINR } from "@/lib/money";
import { payLabel } from "@/lib/payments";
import { billWhen, publicBill } from "@/lib/publicBill";

// The picture of the bill that WhatsApp shows as the link's preview when the bill is sent.
// 1200×630 is the size WhatsApp shows as a large preview.
export const alt = "Your bill";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#2a1a14";
const MUTED = "#8a7564";
const MAROON = "#5e1420";
const GOLD = "#be9445";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const bill = await publicBill((await params).token);
  if (!bill) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f1e8" }} />, size);
  }
  const { cafe, order, items, payments } = bill;
  const shown = items.slice(0, 5);
  const more = items.length - shown.length;
  const paid = payments.length > 1 ? "Split payment" : payments[0] ? `Paid by ${payLabel(payments[0].method)}` : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f1e8", padding: 48, gap: 40, color: INK }}>
        {/* the receipt */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 28, padding: "40px 44px", boxShadow: "0 20px 50px rgba(60,30,20,.12)" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: GOLD }}>TAX INVOICE{order.invoice_no ? ` · ${order.invoice_no}` : ""}</div>
          <div style={{ display: "flex", fontSize: 54, marginTop: 10, lineHeight: 1.05 }}>{cafe.name}</div>
          <div style={{ display: "flex", fontSize: 24, marginTop: 10, color: MUTED }}>
            {billWhen(order.closed_at)}
            {order.table ? ` · ${order.table}` : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 26, borderTop: "2px dashed #e4d8c6", paddingTop: 18, gap: 10 }}>
            {shown.map((i, k) => (
              <div key={k} style={{ display: "flex", fontSize: 27 }}>
                <span style={{ width: 64, color: MUTED }}>{i.qty}×</span>
                <span style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>{i.name.length > 30 ? `${i.name.slice(0, 29)}…` : i.name}</span>
                <span>{formatINR(i.price_paise * i.qty)}</span>
              </div>
            ))}
            {more > 0 && <div style={{ display: "flex", fontSize: 24, color: MUTED }}>+ {more} more item{more > 1 ? "s" : ""}</div>}
          </div>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 10, fontSize: 20, color: MUTED }}>
            Digital bill by <span style={{ color: MAROON, letterSpacing: 5 }}>MEZANA</span>
          </div>
        </div>

        {/* total and the ask */}
        <div style={{ width: 380, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", background: MAROON, borderRadius: 28, padding: "36px 36px 32px", color: "#f7eedd" }}>
            <div style={{ display: "flex", fontSize: 26, color: GOLD }}>Total</div>
            <div style={{ display: "flex", fontSize: 84, marginTop: 4, lineHeight: 1 }}>{formatINR(order.total_paise)}</div>
            <div style={{ display: "flex", fontSize: 24, marginTop: 14, opacity: 0.85 }}>{paid}</div>
            <div style={{ display: "flex", fontSize: 22, marginTop: 4, opacity: 0.7 }}>incl. GST</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 28, padding: "28px 32px", alignItems: "center", textAlign: "center" }}>
            {cafe.google_review_url ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2, 3, 4].map((k) => (
                    <svg key={k} width="34" height="34" viewBox="0 0 24 24">
                      <path fill="#f4b400" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
                    </svg>
                  ))}
                </div>
                <div style={{ display: "flex", fontSize: 28, marginTop: 8 }}>Enjoyed your visit?</div>
                <div style={{ display: "flex", fontSize: 22, marginTop: 6, color: MUTED }}>Tap to view the bill & review us on Google</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", fontSize: 30 }}>Thank you!</div>
                <div style={{ display: "flex", fontSize: 22, marginTop: 6, color: MUTED }}>Tap to view your full bill</div>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
