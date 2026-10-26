"use client";

import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { type Cafe, forgetCafe, useCafe } from "@/lib/cafe";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
});

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
    <div className="min-h-screen bg-[#f6f4f1]">
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
      </main>
    </div>
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
