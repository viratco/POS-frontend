// Made-up order history for the dev-only analytics preview (/dev/analytics-preview).
// Deterministic (seeded), so the preview looks the same on every reload.

import type { AItem, AMenuItem, AnalyticsInput, AOrder, APayment } from "./analytics";
import { istDayStart } from "./analytics";
import type { Diet } from "./types";

// [name, category, ₹, diet, bestseller/badge, combo, popularity weight, cook minutes]
const DISHES: [string, string, number, Diet, boolean, boolean, number, number][] = [
  ["Hot Coffee", "Beverages", 220, "veg", false, false, 6, 3],
  ["Cappuccino", "Beverages", 240, "veg", false, false, 5, 4],
  ["Iced Americano", "Beverages", 220, "veg", false, false, 4, 3],
  ["Matcha Bubble Tea", "Beverages", 249, "veg", true, false, 9, 5],
  ["Brown Sugar Boba Milk", "Beverages", 229, "veg", false, false, 7, 5],
  ["Yuzu Ade", "Beverages", 199, "veg", false, false, 2, 3],
  ["Strawberry Milk Shake", "Beverages", 260, "veg", false, false, 2, 4],
  ["Yam Yam Chicken Burger", "House Favorites", 299, "nonveg", false, false, 5, 12],
  ["Crispy Veg Burger", "House Favorites", 249, "veg", false, false, 3, 11],
  ["Onigiri", "House Favorites", 440, "veg", true, false, 3, 6],
  ["Korean Corn Dog", "House Favorites", 199, "veg", false, false, 8, 8],
  ["Corn Cheese", "House Favorites", 189, "veg", false, false, 2, 9],
  ["French Fries Salted", "Signatures", 310, "veg", false, false, 6, 7],
  ["Yam Yam Fries", "Signatures", 350, "veg", false, false, 5, 8],
  ["Chicken Kimbap", "Signatures", 440, "nonveg", true, false, 6, 10],
  ["Veg Kimbap", "Signatures", 390, "veg", false, false, 3, 10],
  ["Chicken Mandu", "Signatures", 360, "nonveg", false, false, 4, 13],
  ["Tteokbokki", "Signatures", 349, "veg", false, false, 7, 9],
  ["Cheese Tteokbokki", "Signatures", 389, "veg", false, false, 4, 10],
  ["Fried Chicken Boneless", "Signatures", 450, "nonveg", true, false, 8, 16],
  ["Yam Yam Chicken", "Signatures", 470, "nonveg", false, false, 5, 17],
  ["Kimchi Jjigae", "Complete Plates", 429, "veg", false, false, 2, 18],
  ["Bibimbap", "Complete Plates", 449, "egg", false, false, 3, 15],
  ["Chicken Ramen", "Ramen & More", 399, "nonveg", false, false, 4, 11],
  ["Cheese Ramen", "Ramen & More", 379, "egg", false, false, 3, 10],
  ["Couple Combo", "Combos", 899, "nonveg", false, true, 2, 18],
  ["Black Sesame Latte", "Beverages", 280, "veg", false, false, 0, 4],
];
// Dishes that tend to be ordered with each other.
const PAIRS: Record<string, string> = {
  "Korean Corn Dog": "Matcha Bubble Tea",
  "Fried Chicken Boneless": "Yam Yam Fries",
  Tteokbokki: "Chicken Kimbap",
  "Yam Yam Chicken Burger": "French Fries Salted",
  "Chicken Ramen": "Chicken Mandu",
};

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function demoAnalyticsInput(now: number, days = 180): AnalyticsInput {
  const r = rng(42);
  const pick = <T,>(xs: T[], w: (x: T) => number) => {
    const total = xs.reduce((s, x) => s + w(x), 0);
    let t = r() * total;
    for (const x of xs) if ((t -= w(x)) <= 0) return x;
    return xs[0];
  };

  const categories = [...new Set(DISHES.map((d) => d[1]))].map((name, i) => ({ id: `c${i}`, name }));
  const catId = (name: string) => categories.find((c) => c.name === name)!.id;
  const menu: AMenuItem[] = DISHES.map(([name, cat, price, diet, featured, combo], i) => ({
    id: `m${i}`, category_id: catId(cat), name, price_paise: price * 100, is_available: true,
    diet, is_bestseller: featured, badge: null, is_combo: combo,
  }));
  const byName = new Map(menu.map((m, i) => [m.name, { m, w: DISHES[i][6], cook: DISHES[i][7] }]));
  const dishes = [...byName.values()].filter((d) => d.w > 0);
  const tables = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `Table ${i + 1}` }));

  const orders: AOrder[] = [];
  const items: AItem[] = [];
  const payments: APayment[] = [];
  const hourWeight = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 5, 3, 2, 3, 4, 6, 7, 6, 4, 2, 0];
  const iso = (ms: number) => new Date(ms).toISOString();
  let seq = 0;

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = istDayStart(now) - d * 86_400_000;
    const dow = (new Date(dayStart + 330 * 60_000).getUTCDay() + 6) % 7;
    const growth = 0.7 + 0.3 * ((days - d) / days);
    const n = Math.round((dow >= 4 ? 30 : 18) * growth * (0.8 + r() * 0.4));
    for (let k = 0; k < n; k++) {
      const hour = pick(hourWeight.map((w, h) => ({ w, h })), (x) => x.w).h;
      const start = dayStart + hour * 3_600_000 + Math.floor(r() * 3_600_000);
      if (start > now - 20 * 60_000) continue;
      const id = `o${seq++}`;
      const table = tables[Math.floor(r() * tables.length)];
      const rounds = r() < 0.32 ? 2 : 1;
      let t = start;
      let subtotal = 0;
      for (let round = 0; round < rounds; round++) {
        const customer = r() < 0.74;
        const created = t;
        const acceptAt = customer ? created + (0.5 + r() * r() * 9) * 60_000 : created;
        const neverAccepted = customer && r() < 0.025;
        const lines = 1 + Math.floor(r() * 3);
        const chosen = new Set<string>();
        for (let l = 0; l < lines; l++) {
          const dish = pick(dishes, (x) => x.w);
          chosen.add(dish.m.name);
          if (PAIRS[dish.m.name] && r() < 0.55) chosen.add(PAIRS[dish.m.name]);
        }
        for (const name of chosen) {
          const { m, cook } = byName.get(name)!;
          const qty = r() < 0.15 ? 2 : 1;
          const ready = acceptAt + (cook * (0.7 + r() * 0.8)) * 60_000;
          items.push({
            order_id: id, menu_item_id: m.id, name_snapshot: m.name, price_paise_snapshot: m.price_paise, qty,
            status: neverAccepted ? "void" : "served", source: customer ? "customer" : "staff",
            created_at: iso(created), accepted_at: neverAccepted ? null : iso(acceptAt), ready_at: neverAccepted ? null : iso(ready),
          });
          if (!neverAccepted) subtotal += qty * m.price_paise;
        }
        t += (18 + r() * 25) * 60_000;
      }
      const closed = t + (10 + r() * 25) * 60_000;
      const gst = Math.floor((subtotal * 500 + 5000) / 10000);
      orders.push({ id, table_id: table.id, status: "paid", created_at: iso(start), closed_at: iso(closed), subtotal_paise: subtotal, total_paise: subtotal + gst });
      payments.push({ order_id: id, method: r() < 0.71 ? "upi" : "cash", amount_paise: subtotal + gst });
    }
  }
  return { orders, items, payments, menu, categories, tables };
}
