import type { NewItemsEvent, OrderNotifier } from "./types";

export const consoleNotifier: OrderNotifier = {
  async notifyNewItems(event) {
    console.log(`[notify] ${event.tableName}: ${itemsSummary(event.items)}`);
  },
};

export function itemsSummary(items: NewItemsEvent["items"]) {
  return items.map((i) => `${i.qty}x ${i.name}${i.note ? ` (${i.note})` : ""}`).join(", ");
}
