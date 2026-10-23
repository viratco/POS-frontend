// Café details printed on bills. Set these in .env.local / Vercel env vars.
export const BUSINESS = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME || "Sohee's Kitchen",
  legalName: process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME || "",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "",
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE || "",
  gstin: process.env.NEXT_PUBLIC_GSTIN || "",
  fssai: process.env.NEXT_PUBLIC_FSSAI || "",
  footer: process.env.NEXT_PUBLIC_BILL_FOOTER || "Thank you! Visit again.",
};

// SAC code for restaurant services (GST).
export const RESTAURANT_SAC = "996331";
