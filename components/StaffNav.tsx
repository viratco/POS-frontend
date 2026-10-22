"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const links = [
  { href: "/staff", label: "Tables", icon: "M4 5h16v4H4zM6 9v10M18 9v10" },
  { href: "/admin", label: "Menu", icon: "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" },
  { href: "/admin/analytics", label: "Analytics", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/qr", label: "QR codes", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" },
];

export default function StaffNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  async function signOut() {
    if (!confirm("Sign out of this device?")) return;
    await supabaseBrowser().auth.signOut();
    // Full reload so no signed-in pages linger in the router cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#ece3d6] bg-[#fdfbf7]/95 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5 pr-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2a1a10] font-poster text-lg text-[#ecd5b1] italic shadow-sm">S</div>
          <div className="hidden leading-tight sm:block">
            <div className="text-[15px] font-bold tracking-tight text-[#2a2119]">Sohee&apos;s Kitchen</div>
            <div className="text-[11px] font-semibold tracking-wider text-[#8a7b6b] uppercase">Staff POS</div>
          </div>
        </div>

        <nav className="flex gap-1 rounded-xl border border-[#ded3c2] bg-[#f4ece0]/70 p-1">
          {links.map((l) => {
            const on = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                // Don't prefetch: a prefetch made while signed out caches the redirect to /login.
                prefetch={false}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                  on ? "bg-white text-[#2a2119] shadow-sm" : "text-[#7a6b5c] hover:text-[#2a2119]"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={l.icon} />
                </svg>
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
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
