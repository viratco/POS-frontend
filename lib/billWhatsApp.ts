// Sending a paid bill to the guest on WhatsApp: a private link to the tax invoice, and the café's
// Google review link. WhatsApp opens with the message typed; staff tap Send.

import { formatINR } from "@/lib/money";

/** "+91 98765 43210", "098765 43210" -> "9876543210", or null if it isn't an Indian mobile. */
export function indianMobile(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function billMessage(o: { cafeName: string; guestName?: string | null; total: number; link: string; reviewUrl?: string | null }) {
  const first = o.guestName?.trim().split(/\s+/)[0];
  return [
    `Hi${first ? ` ${first}` : ""}! Thank you for visiting *${o.cafeName}* ☕`,
    "",
    `Your bill (${formatINR(o.total)}):`,
    o.link,
    ...(o.reviewUrl ? ["", "Enjoyed your visit? A quick Google review helps us a lot 🙏", o.reviewUrl] : []),
  ].join("\n");
}

export const whatsappUrl = (phone: string, text: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
