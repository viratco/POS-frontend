"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import StaffNav from "@/components/StaffNav";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Table } from "@/lib/types";

type Layout = "a4" | "single";

// Table tent card, A6 portrait (105 × 148 mm), based on the café's existing printed card.
const CARD_W = 105;
const CARD_H = 148;
const GREEN = "#1d4a2b";
const LEAF = "#c9e8a8";

export default function QrSheet() {
  const [tables, setTables] = useState<Table[]>([]);
  const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout>("a4");

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

  // Vector QR codes, so they print sharp at any size.
  useEffect(() => {
    if (!baseUrl) return;
    void Promise.all(
      tables.map(async (t) => {
        const svg = await QRCode.toString(urlFor(baseUrl, t), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
        return [t.id, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`] as const;
      }),
    ).then((pairs) => setCodes(Object.fromEntries(pairs)));
  }, [tables, baseUrl]);

  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
  const pages = layout === "a4" ? chunk(tables, 4) : tables.map((t) => [t]);

  return (
    <div className="min-h-screen bg-[#f6f4f1] print:bg-white">
      <style>{`
        @page { size: ${layout === "a4" ? "A4 portrait" : `${CARD_W}mm ${CARD_H}mm`}; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .qr-page { break-after: page; }
          .qr-page:last-child { break-after: auto; }
          .qr-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <StaffNav />

      <div className="no-print mx-auto max-w-5xl px-5 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">Table QR cards</h1>
        <p className="text-sm text-stone-500">
          One card per table, A6 size (105 × 148 mm). Print on thick paper or card, then cut along the lines.
        </p>

        <div className="mt-5 grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm text-stone-600">
            Site address inside the QR codes
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value.replace(/\/$/, ""))} className="input mt-1" />
          </label>
          <div className="flex items-end gap-2">
            <div className="flex rounded-xl bg-stone-100 p-1 text-sm font-semibold">
              {(
                [
                  ["a4", "A4 · 4 per sheet"],
                  ["single", "1 card per page"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setLayout(k)}
                  className={`rounded-lg px-3 py-2 ${layout === k ? "bg-white shadow-sm" : "text-stone-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => window.print()} className="h-10 rounded-xl bg-stone-900 px-5 font-bold text-white">
              🖨 Print {tables.length} cards
            </button>
          </div>
        </div>

        {isLocal && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            These QR codes point to <code>localhost</code>, which phones can&apos;t open. Print from the live site (your Vercel address) instead.
          </p>
        )}
        <p className="mt-3 text-xs text-stone-500">
          In the print dialog: paper <b>{layout === "a4" ? "A4" : "A6 / 105×148 mm"}</b>, margins <b>None</b>, turn on{" "}
          <b>Background graphics</b>, scale <b>100%</b>.
        </p>
      </div>

      <div className="flex flex-col items-center gap-8 py-8 print:block print:gap-0 print:p-0">
        {pages.map((group, i) => (
          <div
            key={i}
            className={`qr-page ${layout === "a4" ? "grid grid-cols-2 bg-white shadow-lg print:shadow-none" : ""}`}
            style={layout === "a4" ? { width: "210mm", height: "297mm", padding: "0" } : undefined}
          >
            {group.map((t) => (
              <div
                key={t.id}
                className={layout === "a4" ? "flex items-center justify-center outline outline-1 -outline-offset-1 outline-dashed outline-stone-300" : ""}
                style={layout === "a4" ? { width: "105mm", height: "148.5mm" } : undefined}
              >
                <Card table={t} qr={codes[t.id]} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="no-print mx-auto max-w-5xl px-5 pb-12">
        <h2 className="text-sm font-bold text-stone-700">Test a table</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {tables.map((t) => (
            <a
              key={t.id}
              href={urlFor(baseUrl, t)}
              target="_blank"
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-stone-200 hover:bg-emerald-50"
            >
              {t.name} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ table, qr }: { table: Table; qr?: string }) {
  return (
    <div
      className="qr-card relative overflow-hidden text-white"
      style={{
        width: `${CARD_W}mm`,
        height: `${CARD_H}mm`,
        background: `radial-gradient(120% 70% at 50% 0%, #2a5f3a 0%, ${GREEN} 55%, #163a21 100%)`,
      }}
    >
      {/* Logo + tagline */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/sohees-logo-white.png" alt="Sohee's Kitchen" className="absolute left-1/2 -translate-x-1/2" style={{ top: "7mm", width: "64mm" }} />
      <div
        className="absolute inset-x-0 text-center font-display"
        style={{ top: "26.5mm", fontSize: "12.5pt", letterSpacing: "0.16em", fontWeight: 500 }}
      >
        SCAN. ORDER. ENJOY.
      </div>

      {/* Phone outline with notch, open at the bottom like the original card */}
      <svg
        className="absolute inset-0"
        width={`${CARD_W}mm`}
        height={`${CARD_H}mm`}
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        fill="none"
        aria-hidden
      >
        <path
          d={`M 10 ${CARD_H} V 46 A 9 9 0 0 1 19 37 H 44 C 47 37 47.5 41.5 52.5 41.5 C 57.5 41.5 58 37 61 37 H 86 A 9 9 0 0 1 95 46 V ${CARD_H}`}
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="52.5" cy="38.8" r="1.1" fill="white" />
      </svg>

      {/* QR on a white square */}
      <div className="absolute left-1/2 -translate-x-1/2 bg-white" style={{ top: "49mm", width: "62mm", height: "62mm", padding: "4.5mm" }}>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code for ${table.name}`} className="h-full w-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <div className="h-full w-full animate-pulse bg-stone-200" />
        )}
      </div>

      {/* Call to action */}
      <div
        className="absolute inset-x-0 text-center font-bold uppercase"
        style={{ top: "117mm", color: LEAF, fontSize: "9.5pt", lineHeight: 1.45, letterSpacing: "0.02em" }}
      >
        Order right from your table
        <br />
        Pay at the counter
      </div>

      {/* Table number */}
      <div
        className="absolute inset-x-0 text-center font-display"
        style={{ top: "133.5mm", fontSize: "11pt", letterSpacing: "0.14em" }}
      >
        {tableLabel(table.name)}
      </div>
    </div>
  );
}

// "Table 1" -> "TABLE NO. 1"; other names (e.g. "Window 2") are just upper-cased.
function tableLabel(name: string) {
  const m = name.trim().match(/^table\s*(?:no\.?\s*)?(\d+)$/i);
  return m ? `TABLE NO. ${m[1]}` : name.toUpperCase();
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function urlFor(base: string, t: Table) {
  return `${base}/t/${t.qr_token}`;
}
