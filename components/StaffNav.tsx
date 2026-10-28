"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { forgetSavedCafe, initial, useCafe } from "@/lib/cafe";
import { forgetCafeData, readQueue } from "@/lib/offline/store";
import { supabaseBrowser } from "@/lib/supabase/browser";

const links = [
  { href: "/staff", label: "Tables", icon: "M4 5h16v4H4zM6 9v10M18 9v10" },
  { href: "/staff/bills", label: "Bills", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { href: "/staff/purchases", label: "Purchases", icon: "M3 4h2l2.5 11h11L21 7H6.2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z" },
  { href: "/admin", label: "Menu", icon: "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" },
  { href: "/admin/analytics", label: "Analytics", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/qr", label: "QR codes", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" },
  { href: "/admin/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export default function StaffNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const cafe = useCafe();

  async function signOut() {
    // Changes made offline stay on this device until they're sent; signing out stops that.
    const waiting = cafe ? (await readQueue(cafe.id)).length : 0;
    const ask = waiting
      ? `${waiting} change${waiting === 1 ? "" : "s"} made offline (orders or bills) haven't been sent yet. Connect to the internet and wait for "All saved" first.\n\nSign out anyway? They'll be sent the next time this café signs in here.`
      : "Sign out of this device?";
    if (!confirm(ask)) return;
    if (cafe) await forgetCafeData(cafe.id);
    forgetSavedCafe();
    await supabaseBrowser().auth.signOut();
    // Full reload so no signed-in pages linger in the router cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#ece3d6] bg-[#fdfbf7]/95 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-2.5 pr-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2a1a10] font-poster text-lg text-[#ecd5b1] italic shadow-sm">{initial(cafe?.name)}</div>
          <div className="hidden leading-tight sm:block">
            <div className="max-w-[12rem] truncate text-[15px] font-bold tracking-tight text-[#2a2119]">{cafe?.name ?? "\u00a0"}</div>
            <div className="text-[11px] font-semibold tracking-wider text-[#8a7b6b] uppercase">Staff POS</div>
          </div>
        </div>

        {/* Scrolls sideways on phones instead of pushing the page wider than the screen. */}
        <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[#ded3c2] bg-[#f4ece0]/70 p-1 [scrollbar-width:none]">
          {links.map((l) => {
            const on = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                // Preloaded in the background so tabs open instantly. (This bar only shows when signed
                // in, and signing in/out reloads the page, so no signed-out redirect gets cached.)
                className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                  on ? "bg-white text-[#2a2119] shadow-sm" : "text-[#7a6b5c] hover:text-[#2a2119]"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={l.icon} />
                </svg>
                <span className="hidden sm:inline">{l.label}</span>
                <PendingBar />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {children}
          <button
            onClick={signOut}
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#8a7b6b] transition hover:bg-[#f0e7d8] hover:text-[#2a2119]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

// A thin bar under a tab while its page is still loading, so a tap always shows a response.
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}
    >
      <span className="block h-full w-1/2 animate-navbar rounded-full bg-[#2a2119]" />
    </span>
  );
}
