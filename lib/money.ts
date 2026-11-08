// All money is integer paise. Only format to rupees at the edge.

// The café's GST rate, set from its settings once they load (see lib/cafe.ts).
// The server always charges the café's own rate; this only keeps the on-screen preview in step.
let rate = 500;
export function setGstRate(bps: number) {
  rate = bps;
}
export function gstRate() {
  return rate;
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return "₹" + rupees.toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Same rounding as close_order() in SQL: nearest paisa.
export function gstPaise(subtotalPaise: number, rateBps = rate): number {
  return Math.floor((subtotalPaise * rateBps + 5000) / 10000);
}

export function billFor(lines: { price_paise_snapshot: number; qty: number; status: string }[], rateBps = rate) {
  const subtotal = lines
    // Only what was sent to the kitchen is billed; "new" is still awaiting staff acceptance.
    .filter((l) => l.status !== "void" && l.status !== "new")
    .reduce((sum, l) => sum + l.price_paise_snapshot * l.qty, 0);
  const gst = gstPaise(subtotal, rateBps);
  return { subtotal, gst, total: subtotal + gst, rateBps };
}

// Intra-state GST is split equally into CGST + SGST; any odd paisa goes to SGST.
export function gstSplit(gstPaise: number) {
  const cgst = Math.floor(gstPaise / 2);
  return { cgst, sgst: gstPaise - cgst };
}

// Plain 2-decimal amount for printed bills, e.g. 35000 -> "350.00".
export function amount(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type Discount = { type: "percent" | "amount"; value: number; reason: string } | null;

// Mirrors close_order(): discount comes off the subtotal, GST is charged on what's left.
// percent value is in basis points (1000 = 10%), amount value is in paise.
export function applyDiscount(subtotalPaise: number, discount: Discount, rateBps = rate) {
  let off = 0;
  if (discount?.type === "percent") off = Math.floor((subtotalPaise * Math.min(10000, Math.max(0, discount.value)) + 5000) / 10000);
  if (discount?.type === "amount") off = Math.min(Math.max(0, discount.value), subtotalPaise);
  const taxable = subtotalPaise - off;
  const gst = gstPaise(taxable, rateBps);
  return { subtotal: subtotalPaise, discount: off, taxable, gst, total: taxable + gst, rateBps };
}

// The ₹ discount that makes the bill come to `totalPaise` incl. GST (or the nearest paisa below,
// when GST rounding can't land on it exactly). Null if that's more than the bill.
export function discountForTotal(subtotalPaise: number, totalPaise: number, rateBps = rate): number | null {
  if (totalPaise < 0 || totalPaise > subtotalPaise + gstPaise(subtotalPaise, rateBps)) return null;
  let taxable = Math.min(subtotalPaise, Math.floor((totalPaise * 10000) / (10000 + rateBps)) + 2);
  while (taxable > 0 && taxable + gstPaise(taxable, rateBps) > totalPaise) taxable--;
  return subtotalPaise - taxable;
}
