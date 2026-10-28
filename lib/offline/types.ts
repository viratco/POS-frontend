import type { Discount } from "@/lib/money";
import type { Category, Guest, MenuItem, Order, OrderItem, PickedOption, Table } from "@/lib/types";

export type OpenOrder = Order & { order_items: OrderItem[]; order_guests: Guest[] };

/** The last copy of the counter screen from the server, kept on the device. */
export type Snapshot = {
  cafeId: string;
  savedAt: string; // ISO time it was loaded
  day: string; // local date (YYYY-MM-DD) the sales figure belongs to
  tables: Table[];
  orders: OpenOrder[]; // open orders with their dishes and guests
  sales: { net: number; withGst: number }; // today's paid bills
};

export type MenuCache = { cafeId: string; categories: Category[]; menu: MenuItem[] };

/** This device's letter and offline invoice series (see register_counter in the database). */
export type DeviceInfo = {
  id: string;
  letter: string | null;
  prefix: string | null;
  series: Record<string, number>; // financial year -> last number used
};

/** A dish added at the counter. id is made on the device so sending it twice is harmless. */
export type AddLine = {
  id: string;
  menu_item_id: string;
  qty: number;
  note: string | null;
  options: PickedOption[]; // with prices, for the screen
  name: string; // for the screen and kitchen slip until the server's copy arrives
  price: number; // unit price incl. options, paise
};

/** Everything a paid-while-offline bill needs to print and to be saved later. */
export type Receipt = {
  tableName: string;
  invoiceNo: string | null;
  closedAt: string;
  method: "upi" | "cash";
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountReason: string | null;
  rateBps: number;
  gst: number;
  total: number;
};

type Base = {
  seq?: number; // queue position (set by the store)
  id: string; // unique per change
  cafeId: string;
  tableName: string; // for the screen and the "couldn't be saved" list
  at: string; // when it happened, ISO
};

export type Action = Base &
  (
    | { kind: "add"; tableId: string; orderId: string; lines: AddLine[] }
    | { kind: "accept"; orderId: string; itemIds: string[] }
    | { kind: "status"; orderId: string; itemIds: string[]; status: "served" | "void" }
    | { kind: "reject"; orderId: string; itemIds: string[] }
    | { kind: "cancel"; orderId: string }
    | {
        kind: "close";
        orderId: string;
        method: "upi" | "cash";
        itemIds: string[];
        discount: Discount;
        deviceId: string | null;
        receipt: Receipt;
      }
  );

/** A change the server couldn't take, explained for staff. */
export type Problem = { id: string; at: string; what: string; why: string };
