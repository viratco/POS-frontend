// Lets the counter (/staff) and kitchen (/kitchen) screens open with no internet.
// Only those pages and the app's own files are kept; everything else goes to the network
// as usual. Data (tables, orders, menu) is kept by the page itself, not here.

const PAGES = "pos-pages-v1";
const FILES = "pos-files-v1";
const OFFLINE_PAGES = ["/staff", "/kitchen"];
const MAX_FILES = 400;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![PAGES, FILES].includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isFile = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /^\/(tables|brand)\//.test(url.pathname) ||
  /^\/counter[-.]/.test(url.pathname) ||
  url.pathname === "/favicon.ico";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the database and photos: never touched

  if (req.mode === "navigate") {
    if (OFFLINE_PAGES.includes(url.pathname)) event.respondWith(page(event, req, url.pathname));
    else if (/^\/(staff|admin|qr)(\/|$)/.test(url.pathname)) event.respondWith(orOfflineNote(req));
    return;
  }
  if (isFile(url)) event.respondWith(file(req));
});

// Pages: always the latest from the server; the saved copy only when the server can't be
// reached (or takes more than 6 s, as on a dead café Wi-Fi).
async function page(event, req, key) {
  const cache = await caches.open(PAGES);
  const network = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic" && !res.redirected) await cache.put(key, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => undefined));
  try {
    return await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 6000))]);
  } catch {
    const saved = await cache.match(key, { ignoreVary: true, ignoreSearch: true });
    if (saved) return saved;
    try {
      return await network;
    } catch {
      return offlineNote();
    }
  }
}

// App files have unique names per version, so a saved copy is always right.
async function file(req) {
  const cache = await caches.open(FILES);
  const saved = await cache.match(req, { ignoreVary: true });
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") {
    await cache.put(req, res.clone());
    void trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) await cache.delete(k);
}

async function orOfflineNote(req) {
  try {
    return await fetch(req);
  } catch {
    return offlineNote();
  }
}

function offlineNote() {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No internet</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f2;color:#2a2119;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:360px;padding:24px;text-align:center"><div style="font-size:44px">📴</div>
<h1 style="font-size:20px;margin:12px 0 6px">No internet</h1>
<p style="color:#8a7b6b;margin:0">This page needs the internet. The Tables screen keeps working offline.</p>
<a href="/staff" style="display:inline-block;margin-top:18px;background:#2a2119;color:#f5ebd9;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700">Go to Tables</a></div></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

// The page lists the files it loaded (its first visit happens before this worker is in charge),
// so they're saved for offline use too, along with the page itself.
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "keep") return;
  event.waitUntil(
    (async () => {
      const files = await caches.open(FILES);
      for (const u of msg.files || []) {
        let url;
        try {
          url = new URL(u, self.location.origin);
        } catch {
          continue;
        }
        if (url.origin !== self.location.origin || !isFile(url)) continue;
        if (await files.match(url.href, { ignoreVary: true })) continue;
        try {
          const res = await fetch(url.href);
          if (res.ok) await files.put(url.href, res);
        } catch {}
      }
      if (OFFLINE_PAGES.includes(msg.page)) {
        const pages = await caches.open(PAGES);
        if (!(await pages.match(msg.page, { ignoreVary: true }))) {
          try {
            const res = await fetch(msg.page, { credentials: "same-origin" });
            if (res.ok && !res.redirected) await pages.put(msg.page, res);
          } catch {}
        }
      }
    })(),
  );
});
