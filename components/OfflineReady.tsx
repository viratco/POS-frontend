"use client";

import { useEffect } from "react";

// Installs the service worker (public/sw.js) so this screen opens even with no internet,
// and hands it the files this page loaded so they're saved too. Production only: in
// development the files change on every save.
export default function OfflineReady() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const files = performance.getEntriesByType("resource").map((e) => e.name);
        reg.active?.postMessage({ type: "keep", page: location.pathname, files });
      })
      .catch(() => {});
  }, []);
  return null;
}
