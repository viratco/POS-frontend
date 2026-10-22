"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      title="Refresh"
      aria-label="Refresh"
      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-stone-500 shadow-sm ring-1 ring-stone-200/70 transition hover:text-stone-900"
    >
      <svg viewBox="0 0 24 24" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />
      </svg>
    </button>
  );
}
