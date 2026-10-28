import type { Metadata } from "next";
import OfflineReady from "@/components/OfflineReady";
import Dashboard from "./Dashboard";

// Installable as an app ("Counter") that keeps working offline.
export const metadata: Metadata = {
  manifest: "/counter.webmanifest",
  icons: { apple: "/counter-apple.png" },
  appleWebApp: { capable: true, title: "Counter", statusBarStyle: "default" },
};

export default function StaffPage() {
  return (
    <>
      <OfflineReady />
      <Dashboard />
    </>
  );
}
