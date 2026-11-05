"use client";

import { useEffect, useState } from "react";
import { billMessage, indianMobile, whatsappUrl } from "@/lib/billWhatsApp";
import { useCafe } from "@/lib/cafe";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Who = { name: string; phone: string };

// Sends a paid bill to the guest on WhatsApp: a private link to the tax invoice and the café's
// Google review link. Uses the numbers already on the bill, or one typed in here.
export default function WhatsAppBill({ orderId, total, guests }: { orderId: string; total: number; guests: Who[] }) {
  const cafe = useCafe();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [sentTo, setSentTo] = useState<string[]>([]);
  // The bill picture, ready for the phone's share menu (Android tablets and phones; not every browser).
  const [image, setImage] = useState<File | null>(null);
  const people = guests.filter((g, i) => indianMobile(g.phone) && guests.findIndex((x) => x.phone === g.phone) === i);

  // Ask for the link straight away, so the tap can open WhatsApp at once (browsers block
  // windows opened after a wait).
  useEffect(() => {
    let live = true;
    void linkFor(orderId).then((r) => {
      if (!live) return;
      if ("token" in r) setToken(r.token);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [orderId]);

  useEffect(() => {
    if (!token || typeof navigator.canShare !== "function") return;
    let live = true;
    void fetch(`/b/${token}/opengraph-image`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!live || !b) return;
        const file = new File([b], "bill.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) setImage(file);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token]);

  async function shareImage() {
    if (!image || !token) return;
    const one = people.length === 1 ? people[0].name : null;
    try {
      await navigator.share({ files: [image], text: message(token, one) });
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn't open the share menu. Use the buttons above instead.");
    }
  }

  const message = (t: string, name: string | null) =>
    billMessage({ cafeName: cafe?.name ?? "our café", guestName: name, total, link: `${location.origin}/b/${t}`, reviewUrl: cafe?.google_review_url });

  async function send(phone: string, name: string | null) {
    const mobile = indianMobile(phone);
    if (!mobile) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    const text = (t: string) => message(t, name);
    if (token) {
      window.open(whatsappUrl(mobile, text(token)), "_blank", "noopener");
    } else {
      // The link isn't back yet: open the window now (inside the tap), fill it in when it arrives.
      const w = window.open("", "_blank");
      const r = await linkFor(orderId);
      if (!("token" in r)) {
        w?.close();
        setError(r.error);
        return;
      }
      setToken(r.token);
      if (w) {
        w.opener = null;
        w.location.href = whatsappUrl(mobile, text(r.token));
      }
    }
    setError(null);
    setSentTo((s) => [...s, mobile]);
  }

  return (
    <div className="w-full rounded-xl bg-emerald-50 p-3 text-left ring-1 ring-emerald-200">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
        <WhatsAppIcon /> Send the bill on WhatsApp
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {people.map((g) => (
          <button
            key={g.phone}
            onClick={() => send(g.phone, g.name)}
            className="flex h-11 items-center justify-between rounded-lg bg-[#1f9e57] px-4 text-sm font-bold text-white hover:bg-[#178a4a]"
          >
            <span className="truncate">
              {sentTo.includes(g.phone) ? "✓ Sent to " : "Send to "}
              {g.name}
            </span>
            <span className="ml-2 font-medium tabular-nums opacity-80">••{g.phone.slice(-4)}</span>
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(typed, null);
          }}
          className="flex gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            inputMode="tel"
            placeholder={people.length ? "Another number" : "Guest's mobile number"}
            className="h-11 min-w-0 flex-1 rounded-lg bg-white px-3 text-sm ring-1 ring-emerald-200 outline-none focus:ring-2 focus:ring-emerald-600"
          />
          <button className="h-11 rounded-lg bg-stone-900 px-4 text-sm font-bold text-white">Send</button>
        </form>
      </div>
      {image && (
        <button
          onClick={shareImage}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-100/50"
        >
          🖼 Share bill as a picture
          <span className="font-normal text-emerald-900/60">(pick the chat in WhatsApp)</span>
        </button>
      )}
      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      {cafe && !cafe.google_review_url && !error && (
        <p className="mt-2 text-xs text-emerald-900/70">Add your Google review link in Settings to ask for a review in the same message.</p>
      )}
    </div>
  );
}

async function linkFor(orderId: string): Promise<{ token: string } | { error: string }> {
  const { data, error } = await supabaseBrowser().rpc("bill_link", { p_order_id: orderId });
  if (!error && typeof data === "string") return { token: data };
  if (error?.code === "PGRST202" || error?.message?.includes("bill_link")) return { error: "WhatsApp bills need a one-time database update first." };
  if (error?.message?.includes("not_paid")) return { error: "This bill is still being saved. Try again in a moment." };
  return { error: "Couldn't make the bill link. Check the internet and try again." };
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#1f9e57" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2z" />
    </svg>
  );
}
