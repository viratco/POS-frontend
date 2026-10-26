// Each café's bill details (name, address, GSTIN, FSSAI, footer) live in the `cafes` table
// and are edited under Settings. See lib/cafe.ts.

// The product's own name, shown where no café is known yet (sign-in page, home page).
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || "Café POS";

// SAC code for restaurant services (GST).
export const RESTAURANT_SAC = "996331";
