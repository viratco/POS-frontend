import { formatINR } from "@/lib/money";

export type PayMethod = "upi" | "cash" | "card";

/** One part of a hybrid bill, in paise. */
export type PaySplit = { method: PayMethod; amount: number };

export const PAY_METHODS: PayMethod[] = ["upi", "cash", "card"];

export const payLabel = (m: PayMethod | string) => (m === "upi" ? "UPI" : m === "card" ? "Card" : "Cash");

// "Cash ₹500.00 + UPI ₹306.00" for a hybrid bill, or just "UPI".
export function paidBy(method: PayMethod, splits?: PaySplit[] | null) {
  return splits?.length ? splits.map((s) => `${payLabel(s.method)} ${formatINR(s.amount)}`).join(" + ") : payLabel(method);
}

// A hybrid bill keeps the biggest part as its main method.
export const mainMethod = (splits: PaySplit[]): PayMethod => [...splits].sort((a, b) => b.amount - a.amount)[0].method;
