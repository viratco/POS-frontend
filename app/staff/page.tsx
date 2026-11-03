import type { Metadata } from "next";
import OfflineReady from "@/components/OfflineReady";
import Dashboard from "./Dashboard";

// Installable as an app ("Mezana") that keeps working offline.
export const metadata: Metadata = {
  title: "Tables",
  manifest: "/counter.webmanifest",
  icons: { apple: "/mezana-apple.png" },
  appleWebApp: { capable: true, title: "Mezana", statusBarStyle: "default" },
};

export default function StaffPage() {
  return (
    <>
      <OfflineReady />
      <Dashboard />
    </>
  );
}
