"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// "Bill to": a company name and tax / VAT / GST number printed on the invoice, for guests
// who need a business bill. Works on open bills and on bills already paid.
export default function BillTo({
  orderId,
  name,
  taxId,
  disabled = false,
  onSaved,
}: {
  orderId: string;
  name?: string | null;
  taxId?: string | null;
  disabled?: boolean;
  onSaved?: (v: { name: string | null; taxId: string | null }) => void;
}) {
  const [saved, setSaved] = useState({ name: name ?? null, taxId: taxId ?? null });
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTax, setDraftTax] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved({ name: name ?? null, taxId: taxId ?? null });
  }, [orderId, name, taxId]);

  function edit() {
    setDraftName(saved.name ?? "");
    setDraftTax(saved.taxId ?? "");
    setError(null);
    setOpen(true);
  }

  async function save(clear = false) {
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("staff_set_bill_to", {
      p_order_id: orderId,
      p_name: clear ? "" : draftName,
      p_tax_id: clear ? "" : draftTax,
    });
    setBusy(false);
    if (error) {
      setError(
        error.code === "PGRST202" || error.message.includes("staff_set_bill_to")
          ? "Company details need a one-time database update first."
          : "Couldn't save. Check the internet and try again.",
      );
      return;
    }
    const row = data as { bill_to_name: string | null; bill_to_tax_id: string | null };
    const v = { name: row.bill_to_name, taxId: row.bill_to_tax_id };
    setSaved(v);
    onSaved?.(v);
    setOpen(false);
  }

  const has = saved.name || saved.taxId;

  if (open) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mt-2 space-y-2.5 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200"
      >
        <p className="text-sm font-semibold text-stone-700">Bill to (printed on the invoice)</p>
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Company name"
          maxLength={100}
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-[15px] outline-none focus:border-stone-500"
        />
        <input
          value={draftTax}
          onChange={(e) => setDraftTax(e.target.value)}
          placeholder="GST / VAT number"
          maxLength={40}
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-[15px] uppercase outline-none focus:border-stone-500"
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || (!draftName.trim() && !draftTax.trim())}
            className="h-10 flex-1 rounded-lg bg-stone-900 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {has && (
            <button type="button" disabled={busy} onClick={() => void save(true)} className="h-10 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
              Remove
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg px-3 text-sm font-semibold text-stone-600 hover:bg-stone-200">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return has ? (
    <button
      onClick={edit}
      disabled={disabled}
      className="mt-1.5 -ml-2 flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm hover:bg-stone-100 disabled:hover:bg-transparent"
      title="Change company details"
    >
      <span>🏢</span>
      <span className="truncate font-semibold text-stone-800">{saved.name}</span>
      {saved.taxId && <span className="truncate text-stone-500 tabular-nums">{saved.taxId}</span>}
    </button>
  ) : (
    <button
      onClick={edit}
      disabled={disabled}
      className="mt-0.5 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-stone-600 hover:bg-stone-100 disabled:text-stone-400 disabled:hover:bg-transparent"
    >
      <span className="text-base leading-none">+</span> Company name &amp; GST / VAT on bill
    </button>
  );
}
