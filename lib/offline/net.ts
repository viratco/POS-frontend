"use client";

import { useSyncExternalStore } from "react";

// Is the internet really reachable? navigator.onLine only knows about the Wi-Fi link: when the
// café's router is up but its internet is down, it still says "online". So we also check that
// the database answers: every 20 s while online, every 4 s while offline (to notice the return
// quickly), and right away whenever a request fails.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let online = true;
let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(value: boolean) {
  if (value === online) return;
  online = value;
  listeners.forEach((l) => l());
}

async function reachable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const res = await fetch(`${URL}/auth/v1/health`, {
      headers: KEY ? { apikey: KEY } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 500; // a database that errors can't save anything either
  } catch {
    return false;
  }
}

async function check() {
  clearTimeout(timer);
  set(await reachable());
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  timer = setTimeout(check, online ? (hidden ? 60_000 : 20_000) : 4_000);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  online = navigator.onLine;
  window.addEventListener("offline", () => {
    set(false);
    void check();
  });
  window.addEventListener("online", () => void check());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void check());
  void check();
}

/** Something hints the connection changed: check right away instead of waiting. */
export function checkConnection() {
  if (started) void check();
}

/** A request just failed for lack of connection: switch to offline now and keep checking. */
export function reportNetworkFailure() {
  set(false);
  void check();
}

export function isOnline() {
  return online;
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** true while the database is reachable. */
export function useOnline() {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

/** A request that failed because there was no connection (not because the server said no). */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true; // fetch() itself failed
  if (typeof err === "object") {
    const e = err as { message?: unknown; name?: unknown; status?: unknown; code?: unknown };
    if (e.name === "AbortError" || e.name === "TimeoutError") return true;
    const msg = typeof e.message === "string" ? e.message : "";
    // supabase-js turns a failed fetch into { message: "TypeError: Failed to fetch", code: "" }
    if (!e.code && /(TypeError|FetchError|AbortError|TimeoutError)\b|failed to fetch|load failed|network ?error|fetch failed|timed? ?out/i.test(msg)) return true;
  }
  return false;
}
