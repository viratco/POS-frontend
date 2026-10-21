"use client";

// Builds the kitchen ticket for the WhatsApp group and opens WhatsApp with it typed in.
// WhatsApp can't pre-select a group from a link, so staff pick the group and tap Send.
// (The WhatsApp Business API can't post to normal groups, so this is the practical route.)

type TicketItem = { qty: number; name_snapshot: string; note: string | null };

export function kitchenTicket(tableName: string, items: TicketItem[], source: "qr" | "staff" = "qr") {
  const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const lines = items.map((i) => `▪️ *${i.qty} × ${i.name_snapshot}*${i.note ? `\n     ↳ _${i.note}_` : ""}`);
  const totalQty = items.reduce((n, i) => n + i.qty, 0);
  return [
    `🍳 *NEW ORDER · ${tableName.toUpperCase()}*`,
    `🕒 ${time} · ${source === "qr" ? "QR order" : "Taken by staff"}`,
    "",
    ...lines,
    "",
    `Total: ${totalQty} item${totalQty > 1 ? "s" : ""}`,
  ].join("\n");
}

const PREF_KEY = "sohees.whatsappOnAccept";

export function whatsappOnAccept(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setWhatsappOnAccept(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {}
}

// Must be called directly inside a click handler, or browsers block the new tab.
export function openWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

export async function copyTicket(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
