import Link from "next/link";
import { MezanaEmblem, MezanaWordmark } from "@/components/Mezana";
import { PRODUCT_TAGLINE } from "@/lib/business";

const links = [
  { href: "/staff", label: "Staff dashboard", hint: "Tables, orders, take payment" },
  { href: "/admin", label: "Menu admin", hint: "Add / edit items, toggle availability" },
  { href: "/qr", label: "Table QR codes", hint: "Print QR codes, open customer menu to test" },
  { href: "/kitchen", label: "Kitchen screen", hint: "Sign in on the kitchen tablet with the café's kitchen login" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <div className="flex items-center gap-4">
        <MezanaEmblem className="h-14 w-auto" />
        <div>
          <h1>
            <MezanaWordmark className="h-5 w-auto text-[#5e1420]" />
          </h1>
          <p className="mt-1.5 font-poster text-[#9a7432] italic">{PRODUCT_TAGLINE}</p>
        </div>
      </div>
      <ul className="mt-6 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} prefetch={false} className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-stone-400">
              <div className="font-medium">{l.label}</div>
              <div className="text-sm text-stone-500">{l.hint}</div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-stone-500">
        Customers reach the menu by scanning a table QR (<code>/t/…</code>).
      </p>
    </main>
  );
}
