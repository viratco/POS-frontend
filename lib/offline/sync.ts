"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatINR } from "@/lib/money";
import { isNetworkError, reportNetworkFailure } from "./net";
import { dequeue, readDevice, readIdMap, readProblems, readQueue, saveDevice, saveIdMap, saveProblems } from "./store";
import type { Action, DeviceInfo } from "./types";

// Sends the changes made while offline, oldest first, using the same database functions as
// when online. Each one is safe to send twice, so a connection that drops mid-way just
// means the next attempt carries on where this one stopped.

export type Outcome =
  | { ok: true; data?: unknown }
  | { ok: false; retry: boolean; message: string }; // retry: keep it queued and try again later

const TIMEOUT_MS = 12_000;

export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // Older browsers / plain-http LAN testing: build a v4 UUID by hand.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type DbError = { message: string; code?: string; details?: string | null } | null;

/** Turns a database reply into ok / try again later / won't ever work. */
export function outcomeOf(error: DbError, status: number, data?: unknown): Outcome {
  if (!error) return { ok: true, data };
  if (status === 0 || status >= 500 || isNetworkError(error)) {
    return { ok: false, retry: true, message: "No connection" };
  }
  // Session expired while offline: it refreshes by itself once the internet is back.
  if (status === 401 || error.code === "PGRST301" || error.code === "PGRST303") {
    return { ok: false, retry: true, message: "Sign in again to send them." };
  }
  // The database doesn't have the offline functions yet (RUN_THIS_offline.sql not run).
  if (error.code === "PGRST202") {
    return { ok: false, retry: true, message: "Waiting for a database update. Tell the owner." };
  }
  return { ok: false, retry: false, message: reason(error) };
}

function reason(error: NonNullable<DbError>) {
  const m = error.message;
  if (m.includes("order_closed")) return "the bill had already been closed on another device.";
  if (m.includes("invalid_status_change")) return "that dish had already been changed on another device.";
  if (m.includes("item_unavailable")) return "a dish is no longer on the menu.";
  if (m.includes("invalid_table")) return "that table no longer exists.";
  if (m.includes("already_paid")) return `this table was already paid on another device${error.details ? ` (invoice ${error.details})` : ""}, so this bill wasn't saved twice.`;
  if (m.includes("order_cancelled")) return "the order had been cancelled on another device, so this payment wasn't saved. Note it in the cash book.";
  if (m.includes("order_not_found") || m.includes("order_not_open")) return "the order couldn't be found (it may have been moved or closed on another device).";
  if (m.includes("forbidden") || m.includes("permission denied")) return "this login isn't allowed to do that.";
  return m;
}

/** One line for the "couldn't be saved" list. */
export function describe(a: Action): string {
  switch (a.kind) {
    case "add": {
      const n = a.lines.reduce((s, l) => s + l.qty, 0);
      return `${a.tableName}: ${n} dish${n === 1 ? "" : "es"} added`;
    }
    case "accept":
      return `${a.tableName}: QR order accepted`;
    case "status":
      return `${a.tableName}: ${a.itemIds.length} dish${a.itemIds.length === 1 ? "" : "es"} ${a.status === "void" ? "removed" : "served"}`;
    case "reject":
      return `${a.tableName}: QR order rejected`;
    case "cancel":
      return `${a.tableName}: order cancelled`;
    case "close":
      return `${a.tableName}: ${formatINR(a.receipt.total)} paid by ${a.method === "upi" ? "UPI" : "cash"}${a.receipt.invoiceNo ? ` (${a.receipt.invoiceNo})` : ""}`;
  }
}

/** Sends one change to the database. */
export async function execute(a: Action, supabase: SupabaseClient, idMap: Record<string, string>): Promise<Outcome> {
  const real = (id: string) => idMap[id] ?? id;
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  try {
    switch (a.kind) {
      case "add": {
        const { data, error, status } = await supabase
          .rpc("staff_add_items", {
            p_table_id: a.tableId,
            p_items: a.lines.map((l) => ({
              id: l.id,
              menu_item_id: l.menu_item_id,
              qty: l.qty,
              note: l.note,
              options: l.options.map(({ group, name }) => ({ group, name })),
            })),
            // A new order keeps the id the counter gave it, so later changes find it.
            p_order_id: idMap[a.orderId] ? null : a.orderId,
            p_at: a.at,
            p_offline: true,
          })
          .abortSignal(signal());
        const out = outcomeOf(error, status, data);
        const serverId = (data as { order_id?: string } | null)?.order_id;
        if (out.ok && serverId && serverId !== a.orderId && idMap[a.orderId] !== serverId) {
          idMap[a.orderId] = serverId;
          await saveIdMap(a.cafeId, idMap);
        }
        return out;
      }
      case "accept": {
        const { data, error, status } = await supabase
          .rpc("accept_order_items", { p_order_id: real(a.orderId), p_item_ids: a.itemIds, p_at: a.at })
          .abortSignal(signal());
        return outcomeOf(error, status, data);
      }
      case "status": {
        // Only dishes that can still move to this step, so one changed elsewhere doesn't block the rest.
        let q = supabase.from("order_items").update({ status: a.status }).in("id", a.itemIds);
        q = a.status === "served" ? q.in("status", ["pending", "ready", "served"]) : q.neq("status", "void");
        const { error, status } = await q.abortSignal(signal());
        return outcomeOf(error, status);
      }
      case "reject": {
        const voided = await supabase
          .from("order_items")
          .update({ status: "void" })
          .in("id", a.itemIds)
          .eq("status", "new")
          .abortSignal(signal());
        if (voided.error) return outcomeOf(voided.error, voided.status);
        // Nothing else on the table: close the empty order so the table shows as free.
        const left = await supabase.from("order_items").select("id").eq("order_id", real(a.orderId)).neq("status", "void").limit(1).abortSignal(signal());
        if (left.error) return outcomeOf(left.error, left.status);
        if ((left.data ?? []).length > 0) return { ok: true };
        const done = await supabase
          .from("orders")
          .update({ status: "cancelled", closed_at: a.at })
          .eq("id", real(a.orderId))
          .eq("status", "open")
          .abortSignal(signal());
        return outcomeOf(done.error, done.status);
      }
      case "cancel": {
        // Already closed elsewhere = nothing to do.
        const { error, status } = await supabase
          .from("orders")
          .update({ status: "cancelled", closed_at: a.at })
          .eq("id", real(a.orderId))
          .eq("status", "open")
          .abortSignal(signal());
        return outcomeOf(error, status);
      }
      case "close": {
        const r = a.receipt;
        const { data, error, status } = await supabase
          .rpc("close_order_offline", {
            p_order_id: real(a.orderId),
            p_method: a.method,
            p_item_ids: a.itemIds,
            p_expected_total: r.total,
            p_closed_at: r.closedAt,
            p_device_id: a.deviceId,
            p_invoice_no: r.invoiceNo,
            p_discount_type: a.discount?.type ?? null,
            p_discount_value: a.discount?.value ?? 0,
            p_discount_reason: a.discount?.reason || null,
          })
          .abortSignal(signal());
        return outcomeOf(error, status, data);
      }
    }
  } catch (err) {
    return isNetworkError(err) ? { ok: false, retry: true, message: "No connection" } : { ok: false, retry: false, message: String(err) };
  }
}

export type SyncResult = { sent: number; failed: number; waiting: string | null };

let running: Promise<SyncResult> | null = null;

/** Sends everything queued for this café. Only one run at a time, even across tabs. */
export function sendQueue(cafeId: string, supabase: SupabaseClient): Promise<SyncResult> {
  running ??= (async () => {
    try {
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      return locks ? await locks.request("pos-offline-sync", () => drain(cafeId, supabase)) : await drain(cafeId, supabase);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function drain(cafeId: string, supabase: SupabaseClient): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, failed: 0, waiting: null };
  const idMap = await readIdMap(cafeId);
  for (const a of await readQueue(cafeId)) {
    const out = await execute(a, supabase, idMap);
    if (!out.ok && out.retry) {
      if (out.message === "No connection") reportNetworkFailure();
      result.waiting = out.message;
      break; // keep the order: later changes may depend on this one
    }
    if (!out.ok) {
      await saveProblems(cafeId, [...(await readProblems(cafeId)), { id: a.id, at: new Date().toISOString(), what: describe(a), why: out.message }]);
      result.failed++;
    } else {
      result.sent++;
    }
    await dequeue(a.seq!);
  }
  return result;
}

/* ───────────── this device's offline invoice series ───────────── */

// Device updates go one at a time, so a check-in can't undo a number just handed out.
let deviceChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = deviceChain.then(fn, fn);
  deviceChain = next.catch(() => undefined);
  return next;
}

async function deviceFor(cafeId: string): Promise<DeviceInfo> {
  const saved = await readDevice(cafeId);
  if (saved) return saved;
  const fresh: DeviceInfo = { id: newId(), letter: null, prefix: null, series: {} };
  await saveDevice(cafeId, fresh);
  return fresh;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "device";
  return `${browser} on ${os}`;
}

/** Online check-in: tells the server this counter is alive and gets its letter + series. */
export function checkIn(cafeId: string, supabase: SupabaseClient): Promise<DeviceInfo | null> {
  return serial(async () => {
    const d = await deviceFor(cafeId);
    const { data, error } = await supabase.rpc("register_counter", { p_device_id: d.id, p_label: deviceLabel() }).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error || !data) return d;
    const r = data as { letter: string; prefix: string; series: Record<string, number> };
    const series = { ...d.series };
    for (const [fy, n] of Object.entries(r.series ?? {})) series[fy] = Math.max(series[fy] ?? 0, n);
    const next: DeviceInfo = { ...d, letter: r.letter, prefix: r.prefix, series };
    await saveDevice(cafeId, next);
    return next;
  });
}

/** Indian financial year (April–March, India time) of a moment, e.g. "2026-27". */
export function financialYear(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(at);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * The next invoice number in this device's offline series, e.g. "SK/2026-27/A0007".
 * Saved before it's returned, so it's never handed out twice. Null if this device never
 * checked in online (the server then gives the bill a number when it's sent).
 */
export function nextOfflineInvoice(cafeId: string, prefix: string, at: Date): Promise<{ invoiceNo: string | null; deviceId: string | null }> {
  return serial(async () => {
    const d = await readDevice(cafeId);
    if (!d?.letter) return { invoiceNo: null, deviceId: d?.id ?? null };
    const fy = financialYear(at);
    const n = (d.series[fy] ?? 0) + 1;
    if (n > 9999) return { invoiceNo: null, deviceId: d.id };
    await saveDevice(cafeId, { ...d, series: { ...d.series, [fy]: n } });
    const saved = await readDevice(cafeId);
    if (saved?.series[fy] !== n) return { invoiceNo: null, deviceId: d.id }; // storage failed: don't risk a repeat
    return { invoiceNo: `${prefix || d.prefix}/${fy}/${d.letter}${String(n).padStart(4, "0")}`, deviceId: d.id };
  });
}
