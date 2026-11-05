"use client";

import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { type Cafe, forgetCafe, useCafe } from "@/lib/cafe";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { applyTheme, THEMES, themeOf } from "@/lib/themes";

// The café's own details, printed on every bill and tax invoice.
type Draft = {
  name: string;
  legal_name: string;
  address: string;
  phone: string;
  gstin: string;
  fssai: string;
  bill_footer: string;
  gst_percent: string;
  google_review_url: string;
};

const toDraft = (c: Cafe): Draft => ({
  name: c.name,
  legal_name: c.legal_name ?? "",
  address: c.address ?? "",
  phone: c.phone ?? "",
  gstin: c.gstin ?? "",
  fssai: c.fssai ?? "",
  bill_footer: c.bill_footer,
  gst_percent: String(c.gst_rate_bps / 100),
  google_review_url: c.google_review_url ?? "",
});

// The review link column arrives with RUN_THIS_whatsapp_bills.sql; until then the field stays hidden.
const hasReviewLink = (c: Cafe) => "google_review_url" in c;

const GST_RATES = ["0", "5", "12", "18"];

export default function CafeSettings() {
  const cafe = useCafe();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cafe) setDraft(toDraft(cafe));
  }, [cafe]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cafe || !draft) return;
    const gstin = draft.gstin.trim().toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
      setMsg({ ok: false, text: "GSTIN should be 15 characters, e.g. 09ABCDE1234F1Z5." });
      return;
    }
    let review = draft.google_review_url.trim();
    if (review && !/^https?:\/\//i.test(review)) review = `https://${review}`;
    review = review.replace(/^http:\/\//i, "https://");
    if (review && (!/^https:\/\/[^\s]+\.[^\s]+$/.test(review) || review.length > 300)) {
      setMsg({ ok: false, text: "The Google review link should look like https://g.page/r/…/review" });
      return;
    }
    setBusy(true);
    setMsg(null);
    const blank = (v: string) => v.trim() || null;
    const { error } = await supabaseBrowser()
      .from("cafes")
      .update({
        name: draft.name.trim(),
        legal_name: blank(draft.legal_name),
        address: blank(draft.address),
        phone: blank(draft.phone),
        gstin: gstin || null,
        fssai: blank(draft.fssai),
        bill_footer: draft.bill_footer.trim() || "Thank you! Visit again.",
        gst_rate_bps: Math.round(Number(draft.gst_percent) * 100),
        ...(hasReviewLink(cafe) ? { google_review_url: review || null } : {}),
      })
      .eq("id", cafe.id);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    forgetCafe();
    setMsg({ ok: true, text: "Saved. New bills will use these details." });
  }

  return (
    <div className="min-h-screen bg-[color:var(--t-f6f4f1)]">
      <StaffNav />
      <main className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Café settings</h1>
        <p className="text-sm text-stone-500">Printed on every bill and tax invoice.</p>

        {!draft ? (
          <div className="mt-6 h-96 animate-pulse rounded-2xl bg-white ring-1 ring-stone-200" />
        ) : (
          <form onSubmit={save} className="mt-6 space-y-5 rounded-2xl bg-white p-5 ring-1 ring-stone-200 sm:p-6">
            <Field label="Café name" hint="Shown on the QR menu and at the top of bills">
              <input required maxLength={60} value={draft.name} onChange={set("name")} className="input" />
            </Field>
            <Field label="Legal / business name" hint="As registered for GST">
              <input maxLength={100} value={draft.legal_name} onChange={set("legal_name")} className="input" />
            </Field>
            <Field label="Address">
              <textarea maxLength={300} rows={3} value={draft.address} onChange={set("address")} className="input h-auto py-2" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone">
                <input maxLength={30} value={draft.phone} onChange={set("phone")} className="input" inputMode="tel" />
              </Field>
              <Field label="GST rate" hint="Restaurants are usually 5%">
                <select value={draft.gst_percent} onChange={set("gst_percent")} className="input">
                  {(GST_RATES.includes(draft.gst_percent) ? GST_RATES : [...GST_RATES, draft.gst_percent]).map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="GSTIN" hint="Needed for a valid tax invoice">
                <input maxLength={15} value={draft.gstin} onChange={set("gstin")} className="input uppercase" />
              </Field>
              <Field label="FSSAI licence no.">
                <input maxLength={20} value={draft.fssai} onChange={set("fssai")} className="input" inputMode="numeric" />
              </Field>
            </div>
            <Field label="Message at the bottom of bills">
              <input maxLength={120} value={draft.bill_footer} onChange={set("bill_footer")} className="input" />
            </Field>
            {cafe && hasReviewLink(cafe) && (
              <div id="google-review" className="scroll-mt-24">
              <Field label="Google review link" hint="Sent with WhatsApp bills and printed as a QR code on receipts">
                <input
                  maxLength={300}
                  value={draft.google_review_url}
                  onChange={set("google_review_url")}
                  placeholder="https://g.page/r/…/review"
                  inputMode="url"
                  className="input"
                />
                <span className="mt-1 block text-xs text-stone-400">
                  In your Google Business Profile, tap “Ask for reviews” and copy the link.
                </span>
              </Field>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-5">
              <button disabled={busy} className="h-11 rounded-xl bg-stone-900 px-6 font-bold text-white disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
              {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
            </div>
            {cafe && (
              <p className="text-xs text-stone-400">
                Invoice numbers: {cafe.invoice_prefix}/&lt;year&gt;/00001 onwards. Account: {cafe.slug}
              </p>
            )}
          </form>
        )}

        {/* Themes are on hold for now. To bring them back: run RUN_THIS_themes.sql, uncomment this and the lines marked "themes" in lib/cafe.ts and app/layout.tsx.
        {cafe && <ThemePicker key={cafe.id} cafeId={cafe.id} current={cafe.theme} />}
        */}
      </main>
    </div>
  );
}

// Colours the staff screens, the guest QR menu and the printed QR cards. (On hold, see above.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ThemePicker({ cafeId, current }: { cafeId: string; current?: string | null }) {
  const [chosen, setChosen] = useState(themeOf(current).key);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(key: typeof chosen) {
    const before = chosen;
    setChosen(key);
    applyTheme(key); // shows straight away on this screen
    setSaving(true);
    setMsg(null);
    const { error } = await supabaseBrowser().from("cafes").update({ theme: key }).eq("id", cafeId);
    setSaving(false);
    if (error) {
      setChosen(before);
      applyTheme(before);
      setMsg({ ok: false, text: "Couldn't save the theme. Check your internet and try again." });
      return;
    }
    forgetCafe();
    setMsg({ ok: true, text: `${themeOf(key).name} is on. Guests see it the next time they open the menu.` });
  }

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-stone-200 sm:p-6">
      <h2 className="text-lg font-bold tracking-tight">Theme</h2>
      <p className="text-sm text-stone-500">Colours for your staff screens, guest QR menu and printed QR cards. Bills stay black and white.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => {
          const on = chosen === t.key;
          return (
            <button
              key={t.key}
              disabled={saving}
              aria-pressed={on}
              onClick={() => pick(t.key)}
              className={`overflow-hidden rounded-2xl text-left transition active:scale-[0.98] ${on ? "ring-2 ring-stone-900" : "ring-1 ring-stone-200 hover:ring-stone-400"}`}
            >
              {/* A tiny version of the app in this theme's own colours. */}
              <div data-theme={t.key} className="bg-stone-100 p-3">
                <div className="rounded-lg bg-[color:var(--t-surface)] p-2 shadow-sm">
                  <div className="h-1.5 w-3/4 rounded-full bg-stone-800" />
                  <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-stone-300" />
                  <div className="mt-2 flex gap-1">
                    <span className="h-5 flex-1 rounded-md bg-stone-900" />
                    <span className="h-5 w-5 rounded-md" style={{ background: t.qr.from }} />
                  </div>
                </div>
              </div>
              <div className="px-3 py-2">
                <div className="flex items-center justify-between gap-1 text-sm font-bold">
                  {t.name}
                  {on && <span aria-hidden>✓</span>}
                </div>
                <div className="text-xs text-stone-500">{t.note}</div>
              </div>
            </button>
          );
        })}
      </div>
      {msg && <p className={`mt-3 text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-stone-700">{label}</span>
      {hint && <span className="ml-2 text-xs text-stone-400">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
