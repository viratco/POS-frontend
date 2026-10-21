"use client";

import { useState } from "react";
import { chime, unlockAudio } from "@/lib/chime";

// Browsers only allow sound after a tap, so this must be pressed once per page load.
export default function SoundToggle({ big = false }: { big?: boolean }) {
  const [on, setOn] = useState(false);
  const size = big ? "px-5 py-3 text-xl font-semibold" : "px-3 py-1.5 text-sm";
  const color = on
    ? big ? "bg-emerald-900 text-emerald-200" : "bg-emerald-100 text-emerald-800"
    : big ? "bg-amber-400 text-black" : "bg-amber-100 text-amber-900";
  return (
    <button
      onClick={() => {
        unlockAudio();
        setOn(true);
        setTimeout(chime, 50);
      }}
      className={`rounded-lg ${size} ${color}`}
    >
      {on ? "🔔 Sound on" : "🔕 Tap to enable sound"}
    </button>
  );
}
