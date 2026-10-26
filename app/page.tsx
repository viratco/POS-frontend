import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/business";

const links = [
  { href: "/staff", label: "Staff dashboard", hint: "Tables, orders, take payment" },
  { href: "/admin", label: "Menu admin", hint: "Add / edit items, toggle availability" },
  { href: "/qr", label: "Table QR codes", hint: "Print QR codes, open customer menu to test" },
  { href: "/kitchen", label: "Kitchen screen", hint: "Sign in on the kitchen tablet with the café's kitchen login" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="text-2xl font-semibold">{PRODUCT_NAME}</h1>
      <p className="mt-1 text-stone-500">Dine-in ordering</p>
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
