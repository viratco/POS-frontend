export type Table = { id: string; name: string; qr_token: string; is_active: boolean; sort_order: number };
export type Category = { id: string; name: string; sort_order: number; image_url: string | null };
export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_paise: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  diet: Diet;
  spice_level: number; // 0-3
  is_bestseller: boolean;
  badge: string | null;
  moods: Mood[];
  is_combo: boolean;
  subcategory: string | null;
  options: OptionGroup[];
};
// Dish options, e.g. { name: "Choice", min: 1, max: 1, choices: [{ name: "Chicken", price: 5000 }] }.
export type OptionChoice = { name: string; price: number }; // price in paise, added to the dish price
export type OptionGroup = { name: string; min: number; max: number; choices: OptionChoice[] };
export type PickedOption = { group: string; name: string; price?: number };
export type Diet = "veg" | "egg" | "nonveg";
export type Mood = "meal" | "share" | "drink";
export type OrderStatus = "open" | "paid" | "cancelled";
export type OrderItemStatus = "new" | "pending" | "ready" | "served" | "void";
export type Order = {
  id: string;
  table_id: string;
  status: OrderStatus;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  invoice_no?: string | null;
  discount_paise?: number | null;
  discount_reason?: string | null;
  subtotal_paise?: number | null;
  gst_rate_bps?: number | null;
  gst_paise?: number | null;
  total_paise?: number | null;
};
export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  price_paise_snapshot: number;
  qty: number;
  note: string | null;
  status: OrderItemStatus;
  source: "customer" | "staff";
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  options?: PickedOption[] | null;
};
export type CartLine = { menu_item_id: string; qty: number; note: string | null; options?: { group: string; name: string }[] };

// Guest details collected before a QR order (staff-only table).
export type Guest = { order_id: string; name: string; phone: string; marketing_consent: boolean; created_at: string };
