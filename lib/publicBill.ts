import "server-only";
import { cache } from "react";
import { supabaseAnon } from "@/lib/supabase/server";

// A paid bill as the guest sees it from the link sent on WhatsApp (see public_bill() in SQL).
export type PublicBill = {
  cafe: {
    name: string;
    legal_name: string | null;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    fssai: string | null;
    bill_footer: string;
    logo_url: string | null;
    google_review_url: string | null;
  };
  order: {
    invoice_no: string | null;
    closed_at: string;
    table: string | null;
    subtotal_paise: number;
    discount_paise: number | null;
    discount_reason: string | null;
    gst_rate_bps: number;
    gst_paise: number;
    total_paise: number;
  };
  items: { name: string; qty: number; price_paise: number; options: { name: string }[] | null }[];
  payments: { method: string; amount_paise: number }[];
};

// Once per request, shared by the page, its title and its preview image.
export const publicBill = cache(async (token: string): Promise<PublicBill | null> => {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data, error } = await supabaseAnon().rpc("public_bill", { p_token: token });
  return error ? null : ((data as PublicBill | null) ?? null);
});

export const billWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
