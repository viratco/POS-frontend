import { notFound } from "next/navigation";
import PurchasesLog from "@/app/staff/purchases/PurchasesLog";

// Design preview of the Purchases page without signing in. Never served in production.
export default function PurchasesPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PurchasesLog />;
}
