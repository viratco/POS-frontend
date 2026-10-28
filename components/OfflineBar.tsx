"use client";

import { useState } from "react";
import type { Problem } from "@/lib/offline/types";

// The strip under the top bar that tells staff what's happening with the internet:
// offline (working on this device), sending, or changes the server couldn't take.

function since(iso: string | null) {
  if (!iso) return "";
  const t = new Date(iso);
  return t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function OfflineBar({
  online,
  pending,
  syncing,
  waiting,
  savedAt,
  problems,
  onDismissProblems,
}: {
  online: boolean;
  pending: number; // changes saved here, not yet sent
  syncing: boolean;
  waiting: string | null; // why sending is paused while online (e.g. database update needed)
  savedAt: string | null; // when the screen last loaded from the server
  problems: Problem[];
  onDismissProblems: () => void;
}) {
  const [open, setOpen] = useState(false);
  const changes = `${pending} change${pending === 1 ? "" : "s"}`;

  return (
    <div className="space-y-2">
      {!online && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 font-bold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              Offline: working on this device
            </span>
            <span className="text-sm font-semibold">
              {pending > 0 ? `${changes} saved here, will send when the internet is back` : "Nothing waiting to send"}
            </span>
          </div>
          <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 text-[13px] text-amber-900/90 sm:grid-cols-2">
            <li>• Orders, kitchen slips, bills and cash/UPI payments work as normal.</li>
            <li>• The kitchen screen is offline too: hand the printed slip to the kitchen.</li>
            <li>• QR orders from guests will show up here when you&apos;re back online.</li>
            <li>• Don&apos;t clear this browser&apos;s history/data until it says all saved.</li>
          </ul>
          {savedAt && <p className="mt-1 text-xs text-amber-800/80">Showing tables as of {since(savedAt)} plus what you&apos;ve done since.</p>}
        </div>
      )}

      {online && (syncing || pending > 0) && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm">
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" />
          </svg>
          {syncing || !waiting ? `Back online: sending ${changes}…` : `${changes} waiting to send. ${waiting}`}
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setOpen((v) => !v)} className="font-bold">
              ⚠ {problems.length} offline change{problems.length === 1 ? "" : "s"} couldn&apos;t be saved · {open ? "hide" : "see which"}
            </button>
            <button onClick={onDismissProblems} className="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-rose-300 hover:bg-white">
              Got it, clear
            </button>
          </div>
          {open && (
            <ul className="mt-2 space-y-1.5">
              {problems.map((p) => (
                <li key={p.id} className="rounded-lg bg-white/70 px-3 py-2">
                  <span className="font-semibold">{p.what}</span>: {p.why}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
