// Analytics for the admin dashboard. Pure functions: rows in, numbers out.
// All money is integer paise. All clock maths is IST (UTC+5:30, no DST).

import type { Diet } from "./types";

export type RangeKey = "today" | "7d" | "30d" | "90d";

export const RANGES: { key: RangeKey; label: string; compare: string }[] = [
  { key: "today", label: "Today", compare: "vs same time yesterday" },
  { key: "7d", label: "7 days", compare: "vs previous 7 days" },
  { key: "30d", label: "30 days", compare: "vs previous 30 days" },
  { key: "90d", label: "90 days", compare: "vs previous 90 days" },
];

export function parseRange(v: string | string[] | undefined): RangeKey {
  return RANGES.some((r) => r.key === v) ? (v as RangeKey) : "7d";
}

/* ─────────────────────────── input rows ─────────────────────────── */

export type AOrder = {
  id: string;
  table_id: string;
  status: "open" | "paid" | "cancelled";
  created_at: string;
  closed_at: string | null;
  subtotal_paise: number | null;
  total_paise: number | null;
  gst_paise?: number | null;
};

// Net sales = what was actually charged before GST (i.e. after any discount).
function netOf(o: AOrder) {
  return o.total_paise != null && o.gst_paise != null ? o.total_paise - o.gst_paise : (o.subtotal_paise ?? 0);
}
export type AItem = {
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  price_paise_snapshot: number;
  qty: number;
  status: "new" | "pending" | "ready" | "served" | "void";
  source: "customer" | "staff";
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
};
export type APayment = { order_id: string; method: "upi" | "cash"; amount_paise: number };
export type AMenuItem = {
  id: string;
  category_id: string;
  name: string;
  price_paise: number;
  is_available: boolean;
  diet: Diet;
  is_bestseller: boolean;
  badge: string | null;
  is_combo: boolean;
};
export type ACategory = { id: string; name: string };
export type ATable = { id: string; name: string };

export type AnalyticsInput = {
  orders: AOrder[];
  items: AItem[];
  payments: APayment[];
  menu: AMenuItem[];
  categories: ACategory[];
  tables: ATable[];
};

/* ─────────────────────────── time helpers ─────────────────────────── */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Start of the IST calendar day containing `ms`, as a UTC epoch. */
export function istDayStart(ms: number): number {
  return Math.floor((ms + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
}
function istParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  return { hour: d.getUTCHours(), dow: (d.getUTCDay() + 6) % 7 }; // Mon = 0
}

export function rangeWindow(range: RangeKey, now: number) {
  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[range];
  const from = istDayStart(now) - (days - 1) * DAY_MS;
  // "Today" compares against yesterday up to the same clock time.
  const prevFrom = from - days * DAY_MS;
  const prevTo = range === "today" ? now - DAY_MS : from;
  return { from, to: now, prevFrom, prevTo, days };
}

const mins = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function spread(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return { median: quantile(s, 0.5), p90: quantile(s, 0.9), n: s.length };
}

/* ─────────────────────────── output ─────────────────────────── */

export type Kpi = { value: number; prev: number };
export type MatrixQuadrant = "star" | "workhorse" | "puzzle" | "dog";

export type Analytics = {
  hasData: boolean;
  kpis: { netSales: Kpi; bills: Kpi; avgBill: Kpi; itemsSold: Kpi; grossWithGst: number; gst: number };
  daily: { day: number; label: string; net: number; bills: number }[];
  hourly: { hour: number; net: number; bills: number }[]; // paid bills by IST start hour
  heatmap: { counts: number[][]; max: number }; // [dow][hour], paid bills by order start time
  payments: { method: "upi" | "cash"; amount: number; bills: number }[];
  categories: { name: string; net: number; qty: number }[];
  topItems: { name: string; qty: number; net: number }[];

  // ── What Rista doesn't show ──
  qr: { customerQty: number; staffQty: number; share: number; prevShare: number };
  accept: { median: number | null; p90: number | null; n: number; slowBatches: number };
  kitchen: { median: number | null; p90: number | null; n: number; slowest: { name: string; median: number; n: number }[] };
  tableTime: { median: number | null; p90: number | null; n: number; avgRounds: number; addOnRate: number };
  tables: { name: string; net: number; bills: number; avgMinutes: number | null }[];
  lostQr: { qty: number; value: number; batches: number };
  matrix: { name: string; qty: number; price: number; quadrant: MatrixQuadrant }[];
  matrixCuts: { qty: number; price: number };
  pairs: { a: string; b: string; together: number; pctOfA: number }[];
  neverOrdered: { name: string; category: string; price: number }[];
  badgeLift: { featuredAvgQty: number; otherAvgQty: number; featuredCount: number; otherCount: number };
  combos: { net: number; share: number };
  diet: { diet: Diet; net: number; qty: number }[];
};

/** Item lines that count as sold: sent to the kitchen and not voided. */
const isSold = (i: AItem) => i.status === "pending" || i.status === "ready" || i.status === "served";

/** A guest QR order waiting longer than this for staff to accept counts as slow. */
export const SLOW_ACCEPT_MINUTES = 5;

export function computeAnalytics(input: AnalyticsInput, range: RangeKey, now: number): Analytics {
  const w = rangeWindow(range, now);
  const inCur = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= w.from && t < w.to;
  };
  const inPrev = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= w.prevFrom && t < w.prevTo;
  };

  const curOrders = input.orders.filter((o) => inCur(o.created_at));
  const prevOrders = input.orders.filter((o) => inPrev(o.created_at));
  const curIds = new Set(curOrders.map((o) => o.id));
  const prevIds = new Set(prevOrders.map((o) => o.id));
  const curItems = input.items.filter((i) => curIds.has(i.order_id));
  const prevItems = input.items.filter((i) => prevIds.has(i.order_id));

  const paid = (os: AOrder[]) => os.filter((o) => o.status === "paid");
  const curPaid = paid(curOrders);
  const prevPaid = paid(prevOrders);
  const net = (os: AOrder[]) => os.reduce((s, o) => s + netOf(o), 0);
  const qtySold = (is: AItem[]) => is.filter(isSold).reduce((s, i) => s + i.qty, 0);

  const netCur = net(curPaid);
  const netPrev = net(prevPaid);
  const grossWithGst = curPaid.reduce((s, o) => s + (o.total_paise ?? 0), 0);

  const menuById = new Map(input.menu.map((m) => [m.id, m]));
  const catById = new Map(input.categories.map((c) => [c.id, c.name]));
  const tableById = new Map(input.tables.map((t) => [t.id, t.name]));
  const paidIds = new Set(curPaid.map((o) => o.id));
  const prevPaidIds = new Set(prevPaid.map((o) => o.id));
  const soldPaid = curItems.filter((i) => isSold(i) && paidIds.has(i.order_id));

  /* daily trend */
  const daily: Analytics["daily"] = [];
  for (let d = 0; d < w.days; d++) {
    const day = w.from + d * DAY_MS;
    const label = new Date(day + IST_MS).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
    daily.push({ day, label, net: 0, bills: 0 });
  }
  for (const o of curPaid) {
    const idx = Math.floor((istDayStart(new Date(o.created_at).getTime()) - w.from) / DAY_MS);
    if (daily[idx]) {
      daily[idx].net += netOf(o);
      daily[idx].bills += 1;
    }
  }

  /* day × hour heatmap of paid bills */
  const counts = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const o of curPaid) {
    const { dow, hour } = istParts(o.created_at);
    counts[dow][hour] += 1;
  }
  const heatMax = Math.max(0, ...counts.flat());
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, net: 0, bills: 0 }));
  for (const o of curPaid) {
    const h = hourly[istParts(o.created_at).hour];
    h.net += netOf(o);
    h.bills += 1;
  }

  /* payment mix */
  const payMap = new Map<"upi" | "cash", { amount: number; bills: number }>();
  for (const p of input.payments) {
    if (!paidIds.has(p.order_id)) continue;
    const e = payMap.get(p.method) ?? { amount: 0, bills: 0 };
    e.amount += p.amount_paise;
    e.bills += 1;
    payMap.set(p.method, e);
  }
  const payments = (["upi", "cash"] as const).map((m) => ({ method: m, ...(payMap.get(m) ?? { amount: 0, bills: 0 }) }));

  /* per item / category */
  const byItem = new Map<string, { name: string; qty: number; net: number; menuId: string | null }>();
  for (const i of soldPaid) {
    const key = i.menu_item_id ?? `name:${i.name_snapshot}`;
    const e = byItem.get(key) ?? { name: i.name_snapshot, qty: 0, net: 0, menuId: i.menu_item_id };
    e.qty += i.qty;
    e.net += i.qty * i.price_paise_snapshot;
    byItem.set(key, e);
  }
  const topItems = [...byItem.values()].sort((a, b) => b.qty - a.qty || b.net - a.net).slice(0, 10);

  const byCat = new Map<string, { name: string; net: number; qty: number }>();
  for (const e of byItem.values()) {
    const m = e.menuId ? menuById.get(e.menuId) : undefined;
    const name = (m && catById.get(m.category_id)) ?? "Other";
    const c = byCat.get(name) ?? { name, net: 0, qty: 0 };
    c.net += e.net;
    c.qty += e.qty;
    byCat.set(name, c);
  }
  const categories = [...byCat.values()].sort((a, b) => b.net - a.net);

  /* QR adoption: share of sold quantity the guest ordered themselves */
  const qrShare = (is: AItem[]) => {
    const sold = is.filter(isSold);
    const total = sold.reduce((s, i) => s + i.qty, 0);
    const cust = sold.filter((i) => i.source === "customer").reduce((s, i) => s + i.qty, 0);
    return { cust, staff: total - cust, share: total ? cust / total : 0 };
  };
  const qrCur = qrShare(curItems);

  /* Order rounds: one customer submit / staff add = one batch of rows with the same created_at */
  type Batch = { order_id: string; created_at: string; source: string; accepted_at: string | null; items: AItem[] };
  const batches = new Map<string, Batch>();
  for (const i of curItems) {
    const key = `${i.order_id}|${i.created_at}`;
    const b = batches.get(key) ?? { order_id: i.order_id, created_at: i.created_at, source: i.source, accepted_at: null, items: [] };
    b.items.push(i);
    if (i.accepted_at && (!b.accepted_at || i.accepted_at < b.accepted_at)) b.accepted_at = i.accepted_at;
    batches.set(key, b);
  }

  /* Staff acceptance time for guest QR orders */
  const acceptWaits: number[] = [];
  let lostQty = 0;
  let lostValue = 0;
  let lostBatches = 0;
  for (const b of batches.values()) {
    if (b.source !== "customer") continue;
    if (b.accepted_at) {
      acceptWaits.push(Math.max(0, mins(b.created_at, b.accepted_at)));
    } else {
      // Never accepted: dropped when the bill closed (void) — a guest asked and nobody sent it.
      const dropped = b.items.filter((i) => i.status === "void");
      if (dropped.length) {
        lostBatches += 1;
        for (const i of dropped) {
          lostQty += i.qty;
          lostValue += i.qty * i.price_paise_snapshot;
        }
      }
    }
  }
  const acceptSpread = spread(acceptWaits);

  /* Kitchen time: accepted → ready, overall and per dish */
  const cookTimes: number[] = [];
  const perDish = new Map<string, number[]>();
  for (const i of curItems) {
    if (!i.accepted_at || !i.ready_at) continue;
    const m = Math.max(0, mins(i.accepted_at, i.ready_at));
    cookTimes.push(m);
    const arr = perDish.get(i.name_snapshot) ?? [];
    arr.push(m);
    perDish.set(i.name_snapshot, arr);
  }
  const slowest = [...perDish.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([name, v]) => ({ name, median: spread(v).median ?? 0, n: v.length }))
    .sort((a, b) => b.median - a.median)
    .slice(0, 6);

  /* Table time and rounds per visit */
  const seatMinutes: number[] = [];
  const roundsPerOrder = new Map<string, number>();
  for (const b of batches.values()) roundsPerOrder.set(b.order_id, (roundsPerOrder.get(b.order_id) ?? 0) + 1);
  for (const o of curPaid) if (o.closed_at) seatMinutes.push(Math.max(0, mins(o.created_at, o.closed_at)));
  const paidRounds = curPaid.map((o) => roundsPerOrder.get(o.id) ?? 1);
  const avgRounds = paidRounds.length ? paidRounds.reduce((a, b) => a + b, 0) / paidRounds.length : 0;
  const addOnRate = paidRounds.length ? paidRounds.filter((r) => r > 1).length / paidRounds.length : 0;

  const byTable = new Map<string, { name: string; net: number; bills: number; minutes: number[] }>();
  for (const o of curPaid) {
    const name = tableById.get(o.table_id) ?? "Table";
    const e = byTable.get(o.table_id) ?? { name, net: 0, bills: 0, minutes: [] };
    e.net += netOf(o);
    e.bills += 1;
    if (o.closed_at) e.minutes.push(mins(o.created_at, o.closed_at));
    byTable.set(o.table_id, e);
  }
  const tables = [...byTable.values()]
    .map((t) => ({ name: t.name, net: t.net, bills: t.bills, avgMinutes: spread(t.minutes).median }))
    .sort((a, b) => b.net - a.net);

  /* Menu matrix: popularity × price (no food cost in the system, so price stands in for margin) */
  const matrixRows = [...byItem.values()]
    .filter((e) => e.menuId && menuById.has(e.menuId))
    .map((e) => ({ name: e.name, qty: e.qty, price: menuById.get(e.menuId!)!.price_paise }));
  const cutQty = quantile([...matrixRows.map((r) => r.qty)].sort((a, b) => a - b), 0.5) ?? 0;
  const cutPrice = quantile([...matrixRows.map((r) => r.price)].sort((a, b) => a - b), 0.5) ?? 0;
  const matrix = matrixRows.map((r) => ({
    ...r,
    quadrant: (r.qty >= cutQty
      ? r.price >= cutPrice ? "star" : "workhorse"
      : r.price >= cutPrice ? "puzzle" : "dog") as MatrixQuadrant,
  }));

  /* Ordered together: pairs of distinct dishes on the same paid bill */
  const dishesPerOrder = new Map<string, Set<string>>();
  for (const i of soldPaid) {
    const s = dishesPerOrder.get(i.order_id) ?? new Set<string>();
    s.add(i.name_snapshot);
    dishesPerOrder.set(i.order_id, s);
  }
  const ordersWith = new Map<string, number>();
  const pairCount = new Map<string, number>();
  for (const set of dishesPerOrder.values()) {
    const names = [...set].sort();
    for (const n of names) ordersWith.set(n, (ordersWith.get(n) ?? 0) + 1);
    for (let x = 0; x < names.length; x++)
      for (let y = x + 1; y < names.length; y++) {
        const k = `${names[x]}\u0000${names[y]}`;
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
  }
  const pairs = [...pairCount.entries()]
    .filter(([, n]) => n >= 2)
    .map(([k, together]) => {
      const [x, y] = k.split("\u0000");
      // Lead with the less common dish: "people who order X usually add Y".
      const [a, b] = (ordersWith.get(x) ?? 0) <= (ordersWith.get(y) ?? 0) ? [x, y] : [y, x];
      return { a, b, together, pctOfA: together / (ordersWith.get(a) ?? together) };
    })
    .sort((p, q) => q.together - p.together || q.pctOfA - p.pctOfA)
    .slice(0, 8);

  /* Never ordered in this window (currently on the menu) */
  const orderedIds = new Set(curItems.filter(isSold).map((i) => i.menu_item_id));
  const neverOrdered = input.menu
    .filter((m) => m.is_available && !orderedIds.has(m.id))
    .map((m) => ({ name: m.name, category: catById.get(m.category_id) ?? "", price: m.price_paise }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  /* Do the "Bestseller"/badge labels on the menu actually sell more? */
  const qtyByMenuId = new Map<string, number>();
  for (const e of byItem.values()) if (e.menuId) qtyByMenuId.set(e.menuId, e.qty);
  const live = input.menu.filter((m) => m.is_available);
  const featured = live.filter((m) => m.is_bestseller || m.badge);
  const others = live.filter((m) => !(m.is_bestseller || m.badge));
  const avgQty = (ms: AMenuItem[]) => (ms.length ? ms.reduce((s, m) => s + (qtyByMenuId.get(m.id) ?? 0), 0) / ms.length : 0);

  /* Combos and diet mix */
  let comboNet = 0;
  const dietMap = new Map<Diet, { net: number; qty: number }>();
  for (const e of byItem.values()) {
    const m = e.menuId ? menuById.get(e.menuId) : undefined;
    if (m?.is_combo) comboNet += e.net;
    const diet = m?.diet ?? "veg";
    const d = dietMap.get(diet) ?? { net: 0, qty: 0 };
    d.net += e.net;
    d.qty += e.qty;
    dietMap.set(diet, d);
  }
  const itemNetTotal = [...byItem.values()].reduce((s, e) => s + e.net, 0);

  return {
    hasData: curOrders.length > 0,
    kpis: {
      netSales: { value: netCur, prev: netPrev },
      bills: { value: curPaid.length, prev: prevPaid.length },
      avgBill: { value: curPaid.length ? netCur / curPaid.length : 0, prev: prevPaid.length ? netPrev / prevPaid.length : 0 },
      itemsSold: { value: qtySold(curItems.filter((i) => paidIds.has(i.order_id))), prev: qtySold(prevItems.filter((i) => prevPaidIds.has(i.order_id))) },
      grossWithGst,
      gst: grossWithGst - netCur,
    },
    daily,
    hourly,
    heatmap: { counts, max: heatMax },
    payments,
    categories,
    topItems: topItems.map(({ name, qty, net }) => ({ name, qty, net })),
    qr: { customerQty: qrCur.cust, staffQty: qrCur.staff, share: qrCur.share, prevShare: qrShare(prevItems).share },
    accept: { ...acceptSpread, slowBatches: acceptWaits.filter((m) => m > SLOW_ACCEPT_MINUTES).length },
    kitchen: { ...spread(cookTimes), slowest },
    tableTime: { ...spread(seatMinutes), avgRounds, addOnRate },
    tables,
    lostQr: { qty: lostQty, value: lostValue, batches: lostBatches },
    matrix,
    matrixCuts: { qty: cutQty, price: cutPrice },
    pairs,
    neverOrdered,
    badgeLift: { featuredAvgQty: avgQty(featured), otherAvgQty: avgQty(others), featuredCount: featured.length, otherCount: others.length },
    combos: { net: comboNet, share: itemNetTotal ? comboNet / itemNetTotal : 0 },
    diet: (["veg", "egg", "nonveg"] as const).map((d) => ({ diet: d, ...(dietMap.get(d) ?? { net: 0, qty: 0 }) })),
  };
}

