import { formatINR } from "@/lib/money";

/** Swiggy / Zomato: the delivery app collected the money (it is settled to the café later). */
export type PayMethod = "upi" | "cash" | "card" | "swiggy" | "zomato";

/** Methods a Hybrid bill can be split across. */
export type SplitMethod = "upi" | "cash" | "card";

/** One part of a hybrid bill, in paise. */
export type PaySplit = { method: PayMethod; amount: number };

export const SPLIT_METHODS: SplitMethod[] = ["upi", "cash", "card"];

export const PAY_METHODS: PayMethod[] = ["upi", "cash", "card", "swiggy", "zomato"];

const LABELS: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", swiggy: "Swiggy", zomato: "Zomato" };
export const payLabel = (m: PayMethod | string) => LABELS[m] ?? "Cash";

// "Cash ₹500.00 + UPI ₹306.00" for a hybrid bill, or just "UPI".
export function paidBy(method: PayMethod, splits?: PaySplit[] | null) {
  return splits?.length ? splits.map((s) => `${payLabel(s.method)} ${formatINR(s.amount)}`).join(" + ") : payLabel(method);
}

// A hybrid bill keeps the biggest part as its main method.
export const mainMethod = (splits: PaySplit[]): PayMethod => [...splits].sort((a, b) => b.amount - a.amount)[0].method;
