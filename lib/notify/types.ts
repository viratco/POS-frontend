export type NewItemsEvent = {
  tableName: string;
  source: "customer" | "staff";
  items: { name: string; qty: number; note: string | null }[];
};

// Swap providers by implementing this and registering it in ./index.ts.
export interface OrderNotifier {
  notifyNewItems(event: NewItemsEvent): Promise<void>;
}
