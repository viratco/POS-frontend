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
    // Only what was sent to the kitchen is billed; "new" is still awaiting staff acceptance.
    .filter((l) => l.status !== "void" && l.status !== "new")
    .reduce((sum, l) => sum + l.price_paise_snapshot * l.qty, 0);
  const gst = gstPaise(subtotal);
  return { subtotal, gst, total: subtotal + gst, rateBps: GST_RATE_BPS };
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
