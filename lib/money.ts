// All money is integer paise. Only format to rupees at the edge.

export const GST_RATE_BPS = Number(process.env.NEXT_PUBLIC_GST_RATE_BPS ?? 500);

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return "₹" + rupees.toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Same rounding as close_order() in SQL: nearest paisa.
export function gstPaise(subtotalPaise: number, rateBps = GST_RATE_BPS): number {
  return Math.floor((subtotalPaise * rateBps + 5000) / 10000);
}

export function billFor(lines: { price_paise_snapshot: number; qty: number; status: string }[]) {
  const subtotal = lines
    .filter((l) => l.status !== "void")
    .reduce((sum, l) => sum + l.price_paise_snapshot * l.qty, 0);
  const gst = gstPaise(subtotal);
  return { subtotal, gst, total: subtotal + gst, rateBps: GST_RATE_BPS };
}
