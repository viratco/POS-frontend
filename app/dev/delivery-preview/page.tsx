import { notFound } from "next/navigation";
import DeliveryLog from "@/app/staff/delivery/DeliveryLog";

// Design preview of the Delivery page without signing in. Never served in production.
export default function DeliveryPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DeliveryLog />;
}
