"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const links = [
  { href: "/staff", label: "Tables" },
  { href: "/admin", label: "Menu" },
  { href: "/qr", label: "QR codes" },
];

export default function StaffNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="no-print flex items-center gap-4 border-b border-stone-200 bg-white px-5 py-3">
      <span className="font-semibold">Sohee&apos;s Kitchen</span>
      <nav className="flex gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 text-sm ${pathname === l.href ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {children}
        <button onClick={signOut} className="text-sm text-stone-500 hover:text-stone-900">
          Sign out
        </button>
      </div>
    </header>
  );
}
