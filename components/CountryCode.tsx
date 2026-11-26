"use client";

import { COUNTRY_CODES } from "@/lib/phone";

// "+91 ▾" at the start of a phone field; tapping it opens the country list.
export default function CountryCode({ value, onChange, className = "" }: { value: string; onChange: (code: string) => void; className?: string }) {
  return (
    <span className={`relative flex h-full shrink-0 items-center gap-0.5 pl-3 pr-1 ${className}`}>
      +{value}
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M2.5 4.5L6 8l3.5-3.5" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Country code"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code + c.country} value={c.code}>
            +{c.code} {c.country}
          </option>
        ))}
      </select>
    </span>
  );
}
