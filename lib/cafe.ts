"use client";

import { useEffect, useState } from "react";
import { setGstRate } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";

// The signed-in login's café (each login belongs to exactly one). Row Level Security
// only ever returns that one row, so no filter is needed.
export type Cafe = {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  fssai: string | null;
  bill_footer: string;
  gst_rate_bps: number;
  invoice_prefix: string;
  logo_url: string | null;
  qr_logo_url: string | null;
  floor_plan?: unknown; // see lib/floorPlan.ts (readPlan)
};

let cached: Promise<Cafe | null> | undefined;

/** Loads once per page load (sign-in and sign-out do a full reload, which clears it). */
export function loadCafe(): Promise<Cafe | null> {
  cached ??= Promise.resolve(supabaseBrowser().from("cafes").select("*").maybeSingle<Cafe>()).then(({ data }) => {
    if (data) setGstRate(data.gst_rate_bps);
    return data ?? null;
  });
  return cached;
}

/** After Settings saves, so every screen picks up the new details. */
export function forgetCafe() {
  cached = undefined;
}

export function useCafe() {
  const [cafe, setCafe] = useState<Cafe | null>(null);
  useEffect(() => {
    let live = true;
    void loadCafe().then((c) => live && setCafe(c));
    return () => {
      live = false;
    };
  }, []);
  return cafe;
}

/** "Sohee's Kitchen" -> "S", for the little logo square. */
export function initial(name: string | undefined) {
  return (name?.trim()[0] ?? "·").toUpperCase();
}
