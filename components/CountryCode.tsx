"use client";

import { COUNTRY_CODES, flag } from "@/lib/phone";

// "🇮🇳 +91 ▾" at the start of a phone field; tapping it opens the country list.
export default function CountryCode({ value, onChange, className = "" }: { value: string; onChange: (code: string) => void; className?: string }) {
  const current = COUNTRY_CODES.find((c) => c.code === value);
  return (
    <span className={`relative mr-2 flex h-full shrink-0 items-center gap-1 border-r border-current/20 pr-2 pl-3 font-semibold ${className}`}>
      {current && <span aria-hidden>{flag(current.iso)}</span>}+{value}
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M2.5 4.5L6 8l3.5-3.5" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Country code"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.iso} value={c.code}>
            {flag(c.iso)} {c.country} (+{c.code})
          </option>
        ))}
      </select>
    </span>
  );
}
