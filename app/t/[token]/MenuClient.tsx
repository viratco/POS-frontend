"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DietMark } from "@/components/MenuMarks";
import { formatINR } from "@/lib/money";
import { defaultPicks, extraPrice, lineKey, missingGroup, optionsLabel } from "@/lib/options";
import type { Category, MenuItem, OptionGroup, PickedOption } from "@/lib/types";
import { placeOrder, type GuestDetails, type PlacedItem } from "./actions";

// One line per dish + chosen options (e.g. "Wings · Full · Honey Butter" and "Wings · Half" are separate lines).
type Line = { itemId: string; qty: number; note: string; options: PickedOption[] };
type Cart = Record<string, Line>;

// The landing grid shows real categories plus a virtual "Best Seller" tile.
const BEST_SELLER = "__best__";
const NO_SUB = "More";
type Tile = { id: string; name: string; image: string | null; fallback?: string | null };

// The Best Seller tile isn't a real category, so its poster lives at a fixed spot in storage.
// Sohee's has a designed "Best Seller" poster; other cafés show their top dish's photo instead.
const BEST_SELLER_POSTER = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-photos/categories/best-seller.jpg`;

/** The café this table belongs to. */
export type Brand = { name: string; slug: string; logoUrl: string | null };

const INK = "text-[#1a202c]";
const GUEST_KEY = "sohees.guest";

// "+91 98765 43210" / "098765 43210" -> "9876543210"
function normalisePhone(input: string) {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
const GREY = "text-[#718096]";

export default function MenuClient({
  token,
  tableName,
  brand,
  categories,
  items,
}: {
  token: string;
  tableName: string;
  brand: Brand;
  categories: Category[];
  items: MenuItem[];
}) {
  const [cart, setCart] = useState<Cart>({});
  const [openTile, setOpenTile] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [placed, setPlaced] = useState<PlacedItem[] | null>(null);
  const [counterAway, setCounterAway] = useState(false);
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  // Guest details, asked once and remembered on this phone.
  const [guest, setGuest] = useState<GuestDetails>({ name: "", phone: "", marketing_consent: false });
  const [showGuestErrors, setShowGuestErrors] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.name && saved?.phone) setGuest({ name: saved.name, phone: saved.phone, marketing_consent: !!saved.marketing_consent });
    } catch {}
  }, []);
  const guestPhone = normalisePhone(guest.phone);
  const guestNameOk = guest.name.trim().length > 0;
  const guestPhoneOk = /^[6-9]\d{9}$/.test(guestPhone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const bestSellers = items.filter((i) => i.is_bestseller);

  const tiles: Tile[] = [
    ...(bestSellers.length
      ? [{ id: BEST_SELLER, name: "Best Seller", image: brand.slug === "sohees" ? BEST_SELLER_POSTER : null, fallback: bestSellers.find((i) => i.image_url)?.image_url ?? null }]
      : []),
    ...categories
      .filter((c) => items.some((i) => i.category_id === c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image_url ?? items.find((i) => i.category_id === c.id && i.image_url)?.image_url ?? null,
      })),
  ];

  const visible = (i: MenuItem) => !vegOnly || i.diet === "veg";
  // Sold-out dishes sink to the bottom.
  const sortAvail = (list: MenuItem[]) => [...list].sort((a, b) => Number(b.is_available) - Number(a.is_available));
  const tileItems = (tileId: string) =>
    (tileId === BEST_SELLER ? bestSellers : items.filter((i) => i.category_id === tileId)).filter(visible);

  // Sub-categories in menu order (first appearance), each with a thumbnail.
  const subsOf = (tileId: string) => {
    if (tileId === BEST_SELLER) return [];
    const seen = new Map<string, string | null>();
    for (const i of tileItems(tileId)) {
      const key = i.subcategory || NO_SUB;
      if (!seen.has(key)) seen.set(key, i.image_url);
      else if (!seen.get(key) && i.image_url) seen.set(key, i.image_url);
    }
    return [...seen].map(([name, image]) => ({ name, image }));
  };

  const cartLines = Object.entries(cart).filter(([, l]) => l.qty > 0);
  const count = cartLines.reduce((n, [, l]) => n + l.qty, 0);
  const unitPrice = (l: Line) => {
    const item = byId.get(l.itemId);
    return item ? item.price_paise + extraPrice(item.options, l.options) : 0;
  };
  const total = cartLines.reduce((s, [, l]) => s + unitPrice(l) * l.qty, 0);
  // All lines of a dish, whatever options were picked.
  const qtyOf = (itemId: string) => cartLines.filter(([, l]) => l.itemId === itemId).reduce((n, [, l]) => n + l.qty, 0);

  // key is the item id for dishes without options, or a cart line key.
  function setQty(key: string, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[key];
      else next[key] = { itemId: c[key]?.itemId ?? key, qty: Math.min(qty, 50), note: c[key]?.note ?? "", options: c[key]?.options ?? [] };
      return next;
    });
  }

  function addWithOptions(item: MenuItem, picks: PickedOption[]) {
    const key = lineKey(item.id, picks);
    setCart((c) => ({
      ...c,
      [key]: { itemId: item.id, qty: Math.min((c[key]?.qty ?? 0) + 1, 50), note: c[key]?.note ?? "", options: picks },
    }));
    setCustomizing(null);
  }

  function setNote(id: string, note: string) {
    setCart((c) => (c[id] ? { ...c, [id]: { ...c[id], note } } : c));
  }

  // Opening a category from the grid adds one history entry, so the phone's
  // back button returns to the grid instead of leaving the menu.
  function open(tileId: string, subName?: string) {
    if (!openTile) history.pushState({ menuTile: true }, "");
    setOpenTile(tileId);
    setSub(subName ?? subsOf(tileId)[0]?.name ?? null);
    setPicking(false);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    const onPop = () => {
      setOpenTile(null);
      setSearching(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function submit() {
    setError(null);
    if (!guestNameOk || !guestPhoneOk) {
      setShowGuestErrors(true);
      return;
    }
    const details: GuestDetails = { name: guest.name.trim(), phone: guestPhone, marketing_consent: guest.marketing_consent };
    startTransition(async () => {
      const res = await placeOrder(
        token,
        cartLines.map(([, l]) => ({
          menu_item_id: l.itemId,
          qty: l.qty,
          note: l.note.trim() || null,
          options: l.options.map(({ group, name }) => ({ group, name })),
        })),
        details,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(details));
      } catch {}
      setPlaced(res.items);
      setCounterAway(!!res.counterAway);
      setCart({});
      setReviewing(false);
      setOpenTile(null);
      window.scrollTo({ top: 0 });
    });
  }

  if (placed) {
    return <Confirmation brand={brand} tableName={tableName} placed={placed} counterAway={counterAway} onAgain={() => setPlaced(null)} />;
  }

  const current = tiles.find((t) => t.id === openTile);
  const subs = current ? subsOf(current.id) : [];
  const activeSub = subs.find((s) => s.name === sub) ?? subs[0];
  const listItems = current
    ? sortAvail(tileItems(current.id).filter((i) => !activeSub || (i.subcategory || NO_SUB) === activeSub.name))
    : [];

  // "Next" goes to the next sub-category, then on to the next category.
  let next: { label: string; image: string | null; go: () => void } | null = null;
  if (current) {
    const si = subs.findIndex((s) => s.name === activeSub?.name);
    if (si >= 0 && si < subs.length - 1) {
      const n = subs[si + 1];
      next = { label: n.name, image: n.image, go: () => (setSub(n.name), window.scrollTo({ top: 0 })) };
    } else {
      const ti = tiles.findIndex((t) => t.id === current.id);
      const n = tiles[ti + 1];
      if (n) next = { label: n.name, image: n.image, go: () => open(n.id) };
    }
  }

  const searchResults = query.trim()
    ? items.filter(visible).filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  return (
    <div className={`min-h-screen bg-white ${INK}`}>
      {searching ? (
        <SearchHeader query={query} onQuery={setQuery} onClose={() => (setSearching(false), setQuery(""))} />
      ) : current ? (
        <CategoryHeader
          tiles={tiles}
          current={current}
          subs={subs}
          activeSub={activeSub?.name}
          vegOnly={vegOnly}
          onVeg={setVegOnly}
          onBack={() => history.back()}
          onSearch={() => setSearching(true)}
          onPickTile={(id) => open(id)}
          onPickSub={(name) => (setSub(name), window.scrollTo({ top: 0 }))}
          onOpenPicker={() => setPicking(true)}
        />
      ) : (
        <BrandHeader brand={brand} tableName={tableName} />
      )}

      <main className="mx-auto w-full max-w-md pb-32">
        {searching ? (
          <ul className="px-5">
            {query.trim() && searchResults.length === 0 && <p className={`pt-10 text-center ${GREY}`}>No dishes found</p>}
            {searchResults.map((item) => (
              <ItemRow key={item.id} item={item} qty={qtyOf(item.id)} onQty={(q) => setQty(item.id, q)} onCustomize={() => setCustomizing(item)} />
            ))}
          </ul>
        ) : !current ? (
          <>
            <h1 className="px-5 pt-6 pb-7 text-[1.6rem] leading-tight font-bold text-[#2d3748]">What would you like to order?</h1>
            <div className="grid grid-cols-2 gap-4 px-5">
              {tiles.map((t) => (
                <CategoryTile key={t.id} tile={t} onClick={() => open(t.id)} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="pt-10 pb-2 text-center">
              <h2 className="inline-block text-[1.35rem] font-bold text-[#2d3748]">{activeSub && subs.length > 1 ? activeSub.name : current.name}</h2>
              <div className="mx-auto mt-1.5 h-[3px] w-[70px] rounded-full bg-[#2d3748]" />
            </div>

            {listItems.length === 0 ? (
              <p className={`px-5 pt-10 text-center ${GREY}`}>{vegOnly ? "No veg dishes here." : "Nothing here yet."}</p>
            ) : (
              <ul>
                {listItems.map((item) => (
                  <ItemRow key={item.id} item={item} qty={qtyOf(item.id)} onQty={(q) => setQty(item.id, q)} onCustomize={() => setCustomizing(item)} />
                ))}
              </ul>
            )}

            {next && <NextCard label={next.label} image={next.image} onClick={next.go} />}
          </>
        )}
      </main>

      {picking && current && (
        <Sheet onClose={() => setPicking(false)}>
          <h2 className="text-lg font-bold">Menu</h2>
          <ul className="mt-2 divide-y divide-[#edf2f7]">
            {tiles.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => open(t.id)}
                  className={`flex w-full items-center justify-between py-3.5 text-left ${t.id === current.id ? "font-bold" : ""}`}
                >
                  {t.name}
                  <span className={`text-sm ${GREY}`}>{tileItems(t.id).length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {customizing && (
        <OptionsSheet item={customizing} onClose={() => setCustomizing(null)} onAdd={(picks) => addWithOptions(customizing, picks)} />
      )}

      {count > 0 && !reviewing && (
        <div className="fixed inset-x-0 bottom-0 z-30 animate-rise px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setReviewing(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-[#1a202c] px-5 py-4 text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] transition active:scale-[0.98]"
          >
            <span className="text-left leading-tight">
              <span className="block text-xs text-white/70">
                {count} item{count > 1 ? "s" : ""} added
              </span>
              <span className="text-lg font-bold tabular-nums">{formatINR(total)}</span>
            </span>
            <span className="flex items-center gap-1 font-semibold">
              View Cart <Arrow />
            </span>
          </button>
        </div>
      )}

      {reviewing && (
        <Sheet onClose={() => setReviewing(false)}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Your order</h2>
            <span className={`text-sm ${GREY}`}>{tableName}</span>
          </div>

          <ul className="mt-3 divide-y divide-[#edf2f7]">
            {cartLines.map(([id, line]) => {
              const item = byId.get(line.itemId);
              if (!item) return null;
              return (
                <li key={id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <DietMark diet={item.diet} className="mt-1" />
                      <div>
                        <div className="font-semibold">{item.name}</div>
                        {line.options.length > 0 && <div className={`text-sm ${GREY}`}>{optionsLabel(line.options)}</div>}
                        <div className={`text-sm tabular-nums ${GREY}`}>{formatINR(unitPrice(line) * line.qty)}</div>
                      </div>
                    </div>
                    <div className="w-[96px]">
                      <Stepper qty={line.qty} onQty={(q) => setQty(id, q)} />
                    </div>
                  </div>
                  <input
                    value={line.note}
                    onChange={(e) => setNote(id, e.target.value)}
                    maxLength={200}
                    placeholder="Add cooking instructions (optional)"
                    className="mt-3 w-full rounded-xl border border-[#e2e8f0] px-3 py-2.5 text-sm outline-none placeholder:text-[#a0aec0] focus:border-[#1a202c]"
                  />
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex justify-between border-t border-[#edf2f7] pt-4 font-semibold">
            <span>Item total</span>
            <span className="tabular-nums">{formatINR(total)}</span>
          </div>
          <p className={`mt-1 text-xs ${GREY}`}>Taxes are added to your final bill.</p>

          <section className="mt-5 rounded-2xl bg-[#f7fafc] p-4">
            <h3 className="font-bold">Your details</h3>
            <p className={`text-xs ${GREY}`}>So we know who ordered and can reach you about this order.</p>
            <label className="mt-3 block">
              <span className="text-sm font-semibold">Name</span>
              <input
                value={guest.name}
                onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                autoComplete="name"
                maxLength={60}
                placeholder="Your name"
                className={`mt-1 h-12 w-full rounded-xl border bg-white px-3 text-[16px] outline-none focus:border-[#1a202c] ${
                  showGuestErrors && !guestNameOk ? "border-red-400" : "border-[#e2e8f0]"
                }`}
              />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-semibold">Mobile number</span>
              <div
                className={`mt-1 flex h-12 items-center rounded-xl border bg-white focus-within:border-[#1a202c] ${
                  showGuestErrors && !guestPhoneOk ? "border-red-400" : "border-[#e2e8f0]"
                }`}
              >
                <span className={`pl-3 pr-1 text-[16px] ${GREY}`}>+91</span>
                <input
                  value={guest.phone}
                  onChange={(e) => setGuest({ ...guest, phone: e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16) })}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit mobile"
                  className="h-full w-full bg-transparent pr-3 text-[16px] tracking-wide outline-none"
                />
              </div>
            </label>
            {showGuestErrors && (!guestNameOk || !guestPhoneOk) && (
              <p className="mt-2 text-sm text-red-600">
                {!guestNameOk ? "Please enter your name." : "Please enter a valid 10-digit mobile number."}
              </p>
            )}
            <label className="mt-3 flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={guest.marketing_consent}
                onChange={(e) => setGuest({ ...guest, marketing_consent: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-black"
              />
              <span>Send me offers from {brand.name} on WhatsApp (optional)</span>
            </label>
            <p className={`mt-2 text-[11px] leading-snug ${GREY}`}>
              Your details are used only by {brand.name} for your order{guest.marketing_consent ? " and offers you asked for" : ""}. We never
              share them.
            </p>
          </section>

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button
            onClick={submit}
            disabled={pending || count === 0}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1a202c] py-4 text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? (
              <>
                <Spinner /> Placing order…
              </>
            ) : (
              <>
                Place Order · <span className="tabular-nums">{formatINR(total)}</span>
              </>
            )}
          </button>
          <p className={`mt-3 text-center text-xs ${GREY}`}>No payment now. Pay at the counter.</p>
        </Sheet>
      )}
    </div>
  );
}

/* ───────────────────────── headers ───────────────────────── */

function BrandHeader({ brand, tableName }: { brand: Brand; tableName: string }) {
  return (
    <header className="sticky top-0 z-20 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
        <Logo brand={brand} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-lg font-bold text-[#2d3748]">{brand.name}</div>
          <div className={`truncate text-[15px] ${GREY}`}>{tableName}</div>
        </div>
        <span className="rounded-lg border-[1.5px] border-[#2d3748] px-4 py-1.5 text-[15px] font-medium text-[#2d3748]">Dine In</span>
      </div>
    </header>
  );
}

function CategoryHeader({
  tiles,
  current,
  subs,
  activeSub,
  vegOnly,
  onVeg,
  onBack,
  onSearch,
  onPickTile,
  onPickSub,
  onOpenPicker,
}: {
  tiles: Tile[];
  current: Tile;
  subs: { name: string; image: string | null }[];
  activeSub?: string;
  vegOnly: boolean;
  onVeg: (v: boolean) => void;
  onBack: () => void;
  onSearch: () => void;
  onPickTile: (id: string) => void;
  onPickSub: (name: string) => void;
  onOpenPicker: () => void;
}) {
  // Once the guest scrolls, the bar collapses to "← CATEGORY ▾" like DotPe.
  // Two thresholds (collapse past 80px, expand above 16px) so it can't flicker at the edge.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((was) => (was ? y > 16 : y > 80));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The bar is fixed, and a spacer keeps its full (expanded) height in the page,
  // so collapsing it never shifts the menu underneath (which caused a scroll loop).
  const headerRef = useRef<HTMLElement>(null);
  const [spacer, setSpacer] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || scrolled) return;
    const measure = () => setSpacer(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrolled, subs.length]);

  const pillsRef = useRef<HTMLDivElement>(null);
  const subsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    centerActive(pillsRef.current, false);
  }, [current.id, scrolled]);
  useEffect(() => {
    centerActive(subsRef.current, true);
  }, [activeSub]);

  return (
    <>
    <div aria-hidden style={{ height: spacer }} />
    <header ref={headerRef} className="fixed inset-x-0 top-0 z-20 bg-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.12)]">
      <div className="mx-auto max-w-md">
        <div className="flex h-16 items-center gap-3 px-5">
          <button onClick={onBack} aria-label="Back" className="-ml-1 p-1">
            <BackIcon />
          </button>
          {scrolled ? (
            <button onClick={onOpenPicker} className="flex min-w-0 items-center gap-2 text-[1.35rem] font-bold text-[#2d3748] uppercase">
              <span className="truncate">{current.name}</span>
              <svg viewBox="0 0 12 8" className="h-2.5 w-3 shrink-0" fill="currentColor">
                <path d="M0 0h12L6 8z" />
              </svg>
            </button>
          ) : (
            <div className="flex flex-1 justify-center">
              <VegToggle on={vegOnly} onChange={onVeg} />
            </div>
          )}
          <button onClick={onSearch} aria-label="Search" className="ml-auto p-1">
            <SearchIcon />
          </button>
        </div>

        {!scrolled && (
          <div ref={pillsRef} className="no-scrollbar relative flex gap-3 overflow-x-auto px-5 pb-3">
            {tiles.map((t) => {
              const on = t.id === current.id;
              return (
                <button
                  key={t.id}
                  data-on={on}
                  onClick={() => onPickTile(t.id)}
                  className={`shrink-0 rounded-full px-5 py-2.5 text-[17px] whitespace-nowrap ${
                    on ? "bg-black font-medium text-white" : "text-[#4a5568]"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        {subs.length > 1 && (
          <div ref={subsRef} className="no-scrollbar relative flex gap-5 overflow-x-auto px-5 pt-1">
            {subs.map((s) => {
              const on = s.name === activeSub;
              return (
                <button key={s.name} data-on={on} onClick={() => onPickSub(s.name)} className="flex w-[74px] shrink-0 flex-col items-center">
                  <div
                    className={`h-[74px] w-[74px] overflow-hidden rounded-xl bg-[#2a1a10] shadow-[0_2px_6px_rgba(0,0,0,0.12)] ${
                      on ? "ring-[2.5px] ring-black" : "ring-1 ring-[#edf2f7]"
                    }`}
                  >
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-1 text-center font-poster text-[15px] leading-none text-[#e8d2b0] uppercase">
                        {s.name}
                      </div>
                    )}
                  </div>
                  <span className={`mt-2 line-clamp-2 min-h-10 text-center text-[13.5px] leading-tight ${on ? "font-semibold" : "text-[#4a5568]"}`}>
                    {s.name}
                  </span>
                  <span className={`h-[3px] w-full rounded-full ${on ? "bg-black" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
    </>
  );
}

function SearchHeader({ query, onQuery, onClose }: { query: string; onQuery: (q: string) => void; onClose: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex h-16 max-w-md items-center gap-3 px-5">
        <button onClick={onClose} aria-label="Close search" className="-ml-1 p-1">
          <BackIcon />
        </button>
        <input
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search dishes"
          className="h-11 flex-1 rounded-xl bg-[#f7fafc] px-4 text-[16px] outline-none ring-1 ring-[#e2e8f0] focus:ring-[#1a202c]"
        />
      </div>
    </header>
  );
}

function VegToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2.5 text-[17px] text-[#2d3748]">
      Veg only
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-[#38a169]" : "bg-[#e2e8f0]"}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${on ? "left-[22px] bg-white" : "left-0.5 bg-[#2d3748]"}`}
        />
      </span>
    </button>
  );
}

// The café's logo (Settings → logo), or its name's first letter if it has none.
function Logo({ brand }: { brand: Brand }) {
  const [failed, setFailed] = useState(false);
  if (brand.logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.name}
        // Catches an image that failed before the page became interactive (onError missed it).
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailed(true);
        }}
        onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1b2a41] font-poster text-[11px] leading-none text-[#d9c6a0] italic">
      {brand.name.split(/\s+/)[0]}
    </div>
  );
}

/* ───────────────────────── content ───────────────────────── */

function CategoryTile({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  // If the poster can't load, fall back to a dish photo, then to lettering.
  const [src, setSrc] = useState(tile.image);
  return (
    <button
      onClick={onClick}
      className="relative aspect-[5/6] overflow-hidden rounded-2xl bg-[#2a1a10] text-left transition active:scale-[0.97]"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setSrc(src === tile.fallback ? null : (tile.fallback ?? null))}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // No photo yet: poster-style lettering on the brand's chocolate background.
        <div className="absolute inset-x-0 top-0 px-3 pt-4 text-center font-poster text-[2.4rem] leading-[0.85] tracking-[-0.03em] text-[#e8d2b0] uppercase">
          {tile.name}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 via-45% to-transparent" />
      <span className="absolute inset-x-4 bottom-4 text-[1.55rem] leading-[1.1] font-bold text-white drop-shadow-sm">{tile.name}</span>
    </button>
  );
}

function ItemRow({ item, qty, onQty, onCustomize }: { item: MenuItem; qty: number; onQty: (q: number) => void; onCustomize: () => void }) {
  const soldOut = !item.is_available;
  const customizable = item.options.length > 0;
  return (
    <li className={`border-b border-dashed border-[#cbd5e0] px-5 py-7 last:border-b-0 ${soldOut ? "opacity-50" : ""}`}>
      <div className="flex gap-5">
        {item.image_url && (
          <div className="relative h-[118px] w-[118px] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url} alt="" className={`h-full w-full rounded-xl object-cover ${soldOut ? "grayscale" : ""}`} />
            <DietMark diet={item.diet} className="absolute top-2 left-2" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3">
            {!item.image_url && <DietMark diet={item.diet} className="mt-[5px]" />}
            <h3 className="text-[18px] leading-snug tracking-[0.01em]">{item.name}</h3>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <span className={`text-[18px] tabular-nums ${GREY}`}>{formatINR(item.price_paise)}</span>
            <div className="w-[96px]">
              {soldOut ? (
                <div className={`flex h-11 items-center justify-center rounded-lg bg-white text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.12)] ${GREY}`}>
                  Sold out
                </div>
              ) : customizable ? (
                <button
                  onClick={onCustomize}
                  className="h-11 w-full rounded-lg border border-[#edf2f7] bg-white text-[18px] font-bold text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition active:scale-95"
                >
                  {qty > 0 ? `ADD · ${qty}` : "ADD"}
                </button>
              ) : qty === 0 ? (
                <button
                  onClick={() => onQty(1)}
                  className="h-11 w-full rounded-lg border border-[#edf2f7] bg-white text-[18px] font-bold text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition active:scale-95"
                >
                  ADD
                </button>
              ) : (
                <Stepper qty={qty} onQty={onQty} />
              )}
              {customizable && !soldOut && <div className={`mt-1 text-center text-[12px] ${GREY}`}>customizable</div>}
            </div>
          </div>
        </div>
      </div>
      {item.description && <p className={`mt-4 text-[16px] leading-relaxed ${GREY}`}>{item.description}</p>}
    </li>
  );
}

function OptionsSheet({ item, onClose, onAdd }: { item: MenuItem; onClose: () => void; onAdd: (picks: PickedOption[]) => void }) {
  const [picks, setPicks] = useState<PickedOption[]>(() => defaultPicks(item.options));
  const missing = missingGroup(item.options, picks);
  const price = item.price_paise + extraPrice(item.options, picks);

  function toggle(g: OptionGroup, name: string) {
    setPicks((cur) => {
      const has = cur.some((p) => p.group === g.name && p.name === name);
      if (g.max === 1) return [...cur.filter((p) => p.group !== g.name), ...(has && g.min === 0 ? [] : [{ group: g.name, name }])];
      if (has) return cur.filter((p) => !(p.group === g.name && p.name === name));
      if (cur.filter((p) => p.group === g.name).length >= g.max) return cur;
      return [...cur, { group: g.name, name }];
    });
  }

  return (
    <Sheet onClose={onClose}>
      <div className="-mx-5 -mt-3 flex items-center justify-between border-b border-[#edf2f7] px-5 pt-1 pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <DietMark diet={item.diet} />
          <h2 className="truncate text-xl font-bold">{item.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-1 text-2xl leading-none">
          ×
        </button>
      </div>

      {item.options.map((g) => {
        const n = picks.filter((p) => p.group === g.name).length;
        const single = g.max === 1;
        return (
          <section key={g.name} className="-mx-5 mt-4">
            <div className="flex items-baseline justify-between bg-[#f7fafc] px-5 py-3">
              <span className="text-[17px] font-bold">{g.name}</span>
              <span className={`text-sm ${GREY}`}>
                {g.min > 0 ? "Required · " : ""}
                {n}/{g.max} selected
              </span>
            </div>
            <ul className="px-5">
              {g.choices.map((c) => {
                const on = picks.some((p) => p.group === g.name && p.name === c.name);
                return (
                  <li key={c.name}>
                    <button onClick={() => toggle(g, c.name)} className="flex w-full items-center justify-between py-3.5 text-left">
                      <span className="text-[17px]">{c.name}</span>
                      <span className="flex items-center gap-3">
                        {c.price > 0 && <span className={`tabular-nums ${GREY}`}>+ {formatINR(c.price)}</span>}
                        <span
                          className={`flex h-6 w-6 items-center justify-center border-2 ${single ? "rounded-full" : "rounded-md"} ${
                            on ? "border-black" : "border-[#cbd5e0]"
                          }`}
                        >
                          {on && <span className={`h-3 w-3 bg-black ${single ? "rounded-full" : "rounded-sm"}`} />}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <button
        disabled={!!missing}
        onClick={() => onAdd(picks)}
        className="mt-5 flex h-14 w-full items-center justify-between rounded-2xl bg-black px-6 text-lg font-bold text-white disabled:opacity-40"
      >
        <span className="tabular-nums">{formatINR(price)}</span>
        <span>{missing ? `Choose ${missing.name}` : "ADD TO CART"}</span>
      </button>
    </Sheet>
  );
}

function NextCard({ label, image, onClick }: { label: string; image: string | null; onClick: () => void }) {
  return (
    <div className="border-t border-dashed border-[#cbd5e0] px-5 pt-8">
      <button onClick={onClick} className="ml-auto flex w-[62%] flex-col items-end">
        <div className="flex w-full items-center gap-4 rounded-xl border border-[#e2e8f0] p-1.5 text-left">
          <div className="h-[72px] w-[90px] shrink-0 overflow-hidden rounded-lg bg-[#2a1a10]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-1 text-center font-poster text-sm leading-none text-[#e8d2b0] uppercase">
                {label}
              </div>
            )}
          </div>
          <span className="truncate text-[17px]">{label}</span>
        </div>
        <span className="mt-3 flex items-center gap-3 text-[17px]">
          Next
          <span className="flex h-7 w-7 items-center justify-center rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
            <Arrow small />
          </span>
        </span>
      </button>
    </div>
  );
}

function Stepper({ qty, onQty }: { qty: number; onQty: (q: number) => void }) {
  return (
    <div className="flex h-11 items-center justify-between rounded-lg border border-[#edf2f7] bg-white text-[17px] font-bold text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      <button onClick={() => onQty(qty - 1)} className="h-full px-3 leading-none" aria-label="Decrease">
        −
      </button>
      <span className="tabular-nums">{qty}</span>
      <button onClick={() => onQty(qty + 1)} className="h-full px-3 leading-none" aria-label="Increase">
        +
      </button>
    </div>
  );
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`mx-auto max-h-[88vh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-3xl bg-white px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${INK}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[#e2e8f0]" />
        {children}
      </div>
    </div>
  );
}

function Confirmation({
  brand,
  tableName,
  placed,
  counterAway,
  onAgain,
}: {
  brand: Brand;
  tableName: string;
  placed: PlacedItem[];
  counterAway: boolean;
  onAgain: () => void;
}) {
  const placedTotal = placed.reduce((s, i) => s + i.price_paise_snapshot * i.qty, 0);
  return (
    <div className={`min-h-screen bg-white ${INK}`}>
      <BrandHeader brand={brand} tableName={tableName} />
      <main className="mx-auto w-full max-w-md px-5 pt-12 pb-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-[#38a169] text-white">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="mt-6 text-2xl font-bold">Order received!</h1>
          <p className={`mt-2 ${GREY}`}>
            Our staff will confirm your order for <span className="font-semibold text-[#2d3748]">{tableName}</span> and send it to the
            kitchen right away.
          </p>
          {counterAway && (
            <p className="mt-4 rounded-2xl bg-[#fffbeb] px-4 py-3 text-sm font-medium text-[#92400e] ring-1 ring-[#fde68a]">
              The café&apos;s system is reconnecting right now. If no one confirms your order in a few minutes, please tell a staff member what you ordered.
            </p>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-[#edf2f7] p-5">
          <h2 className={`text-sm font-semibold ${GREY}`}>What you ordered</h2>
          <ul className="mt-2 divide-y divide-[#edf2f7]">
            {placed.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">
                    {i.qty} × {i.name_snapshot}
                  </div>
                  {i.options && i.options.length > 0 && <div className={`text-sm ${GREY}`}>{optionsLabel(i.options)}</div>}
                  {i.note && <div className={`mt-0.5 text-sm ${GREY}`}>“{i.note}”</div>}
                </div>
                <div className="tabular-nums">{formatINR(i.price_paise_snapshot * i.qty)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-[#edf2f7] pt-3 font-semibold">
            <span>This order</span>
            <span className="tabular-nums">{formatINR(placedTotal)}</span>
          </div>
        </div>

        <p className={`mt-4 text-center text-sm ${GREY}`}>Taxes are added to your final bill. Pay at the counter.</p>

        <button onClick={onAgain} className="mt-8 w-full rounded-2xl bg-[#1a202c] py-4 font-bold text-white transition active:scale-[0.98]">
          Order something else
        </button>
      </main>
    </div>
  );
}

/* ───────────────────────── icons ───────────────────────── */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#2d3748]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12H5M11 5l-7 7 7 7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </svg>
  );
}

function Arrow({ small = false }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={small ? "h-4 w-4" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 10h11M11 5.5L15.5 10 11 14.5" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

// Scroll a horizontal pill row so the active pill is centred, without touching
// the page's vertical scroll (scrollIntoView can nudge the page on iOS Safari).
function centerActive(row: HTMLElement | null, smooth: boolean) {
  const el = row?.querySelector<HTMLElement>(`[data-on="true"]`);
  if (!row || !el) return;
  row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
}
