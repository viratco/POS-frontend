"use client";

import { useState } from "react";
import { chime, unlockAudio } from "@/lib/chime";

// Browsers only allow sound after a tap, so this must be pressed once per page load.
export default function SoundToggle({ big = false }: { big?: boolean }) {
  const [on, setOn] = useState(false);
  const size = big ? "px-5 py-3 text-xl font-semibold" : "px-3 py-2 text-sm font-semibold";
  const color = on
    ? big ? "bg-emerald-900 text-emerald-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : big ? "bg-amber-400 text-black" : "animate-pulse bg-amber-100 text-amber-900 ring-1 ring-amber-300";
  return (
    <button
      onClick={() => {
        unlockAudio();
        setOn(true);
        setTimeout(chime, 50);
      }}
      className={`rounded-lg ${size} ${color}`}
    >
      {on ? "🔔 Sound on" : big ? "🔕 Tap to enable sound" : "🔕 Enable sound"}
    </button>
  );
}
