"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Table } from "@/lib/types";

export default function QrSheet() {
  const [tables, setTables] = useState<Table[]>([]);
  const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!baseUrl) setBaseUrl(window.location.origin);
    void supabaseBrowser()
      .from("tables")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setTables((data ?? []) as Table[]));
  }, [baseUrl]);

  useEffect(() => {
    if (!baseUrl) return;
    void Promise.all(
      tables.map(async (t) => [t.id, await QRCode.toDataURL(urlFor(baseUrl, t), { width: 600, margin: 1 })] as const),
    ).then((pairs) => setCodes(Object.fromEntries(pairs)));
  }, [tables, baseUrl]);

  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);

  return (
    <div className="min-h-screen">
      <StaffNav />
      <div className="no-print mx-auto max-w-4xl p-5">
        <h1 className="text-2xl font-semibold">Table QR codes</h1>
        <label className="mt-4 block text-sm text-stone-600">
          Site address encoded in the QR codes
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value.replace(/\/$/, ""))} className="input mt-1" />
        </label>
        {isLocal && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Phones can&apos;t open <code>localhost</code>. For testing on a phone, use your computer&apos;s Wi-Fi address
            (e.g. <code>http://192.168.1.20:3000</code>). For real printing, use your Vercel URL.
          </p>
        )}
        <button onClick={() => window.print()} className="mt-4 rounded-lg bg-stone-900 px-4 py-2 font-medium text-white">
          Print
        </button>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 p-5 print:max-w-none print:gap-4 print:p-0 md:grid-cols-3">
        {tables.map((t) => (
          <div key={t.id} className="break-inside-avoid rounded-2xl border-2 border-stone-900 bg-white p-4 text-center">
            <div className="text-sm text-stone-500">Sohee&apos;s Kitchen</div>
            <div className="text-2xl font-bold">{t.name}</div>
            {codes[t.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={codes[t.id]} alt={`QR for ${t.name}`} className="mx-auto my-3 aspect-square w-full max-w-[220px]" />
            )}
            <div className="text-sm font-medium">Scan to order</div>
            <a href={urlFor(baseUrl, t)} target="_blank" className="no-print mt-2 block text-xs text-emerald-700 underline">
              Open customer menu
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function urlFor(base: string, t: Table) {
  return `${base}/t/${t.qr_token}`;
}
