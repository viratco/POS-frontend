import type { Action, OpenOrder, Snapshot } from "./types";

// What the counter should show: the last copy from the server, with the changes that haven't
// reached the server yet laid on top. Works the same before, during and after sending, because
// every change can be laid on a copy that already contains it without doubling anything.

export type View = Pick<Snapshot, "tables" | "orders" | "sales">;

export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function applyActions(base: Snapshot, actions: Action[], idMap: Record<string, string>): View {
  const orders: OpenOrder[] = structuredClone(base.orders);
  const today = localDay();
  const sales = base.day === today ? { ...base.sales } : { net: 0, withGst: 0 };
  // A device order that turned out to join an order already open at that table.
  const alias: Record<string, string> = {};
  const find = (id: string) => {
    const real = alias[id] ?? idMap[id] ?? id;
    return orders.find((o) => o.id === real);
  };
  const drop = (o: OpenOrder) => orders.splice(orders.indexOf(o), 1);

  for (const a of actions) {
    switch (a.kind) {
      case "add": {
        let o = orders.find((x) => x.table_id === a.tableId);
        if (!o) {
          o = {
            id: idMap[a.orderId] ?? a.orderId,
            table_id: a.tableId,
            status: "open",
            note: null,
            created_at: a.at,
            closed_at: null,
            order_items: [],
            order_guests: [],
          };
          orders.push(o);
        } else if (o.id !== a.orderId) {
          alias[a.orderId] = o.id;
        }
        const have = new Set(o.order_items.map((i) => i.id));
        for (const l of a.lines) {
          if (have.has(l.id)) continue;
          o.order_items.push({
            id: l.id,
            order_id: o.id,
            menu_item_id: l.menu_item_id,
            name_snapshot: l.name,
            price_paise_snapshot: l.price,
            qty: l.qty,
            note: l.note,
            status: "pending",
            source: "staff",
            created_at: a.at,
            accepted_at: a.at,
            ready_at: null,
            options: l.options.length ? l.options : null,
          });
        }
        break;
      }
      case "accept": {
        const o = find(a.orderId);
        o?.order_items.forEach((i) => {
          if (a.itemIds.includes(i.id) && i.status === "new") {
            i.status = "pending";
            i.accepted_at = a.at;
          }
        });
        break;
      }
      case "status": {
        const o = find(a.orderId);
        o?.order_items.forEach((i) => {
          if (a.itemIds.includes(i.id) && i.status !== "void") i.status = a.status;
        });
        break;
      }
      case "reject": {
        const o = find(a.orderId);
        if (!o) break;
        o.order_items.forEach((i) => {
          if (a.itemIds.includes(i.id) && i.status === "new") i.status = "void";
        });
        if (!o.order_items.some((i) => i.status !== "void")) drop(o);
        break;
      }
      case "cancel": {
        const o = find(a.orderId);
        if (o) drop(o);
        break;
      }
      case "close": {
        const o = find(a.orderId);
        if (o) drop(o);
        if (localDay(new Date(a.receipt.closedAt)) === today) {
          sales.net += a.receipt.subtotal - a.receipt.discount;
          sales.withGst += a.receipt.total;
        }
        break;
      }
    }
  }
  return { tables: base.tables, orders, sales };
}
