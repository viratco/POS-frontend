"use client";

// On-device storage for offline mode (IndexedDB): the last copy of the counter screen, the
// menu, this device's invoice series, and the queue of changes still to be sent.
// Every function fails soft: if the browser blocks storage, offline mode is simply off.

import type { Action, DeviceInfo, MenuCache, Problem, Snapshot } from "./types";

const DB_NAME = "pos-offline";
const KV = "kv";
const OUTBOX = "outbox";

let dbPromise: Promise<IDBDatabase | null> | undefined;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(KV);
        req.result.createObjectStore(OUTBOX, { keyPath: "seq", autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          // Resolve once the write is really on disk, not just queued.
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

const get = <T>(key: string) => run<T>(KV, "readonly", (s) => s.get(key) as IDBRequest<T>);
const put = (key: string, value: unknown) => run(KV, "readwrite", (s) => s.put(value, key)).then(() => undefined);

export const readSnapshot = (cafeId: string) => get<Snapshot>(`snapshot:${cafeId}`);
export const saveSnapshot = (s: Snapshot) => put(`snapshot:${s.cafeId}`, s);

export const readMenu = (cafeId: string) => get<MenuCache>(`menu:${cafeId}`);
export const saveMenu = (m: MenuCache) => put(`menu:${m.cafeId}`, m);

export const readDevice = (cafeId: string) => get<DeviceInfo>(`device:${cafeId}`);
export const saveDevice = (cafeId: string, d: DeviceInfo) => put(`device:${cafeId}`, d);

// Orders made on this device, and the id the server gave them when they joined an existing order.
export const readIdMap = async (cafeId: string) => (await get<Record<string, string>>(`ids:${cafeId}`)) ?? {};
export const saveIdMap = (cafeId: string, m: Record<string, string>) => put(`ids:${cafeId}`, m);

export const readProblems = async (cafeId: string) => (await get<Problem[]>(`problems:${cafeId}`)) ?? [];
export const saveProblems = (cafeId: string, p: Problem[]) => put(`problems:${cafeId}`, p.slice(-50));

/** Changes waiting to be sent, oldest first. */
export async function readQueue(cafeId: string): Promise<Action[]> {
  const all = (await run<Action[]>(OUTBOX, "readonly", (s) => s.getAll() as IDBRequest<Action[]>)) ?? [];
  return all.filter((a) => a.cafeId === cafeId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/** Saves a change to the queue. Returns false if this device can't store it. */
export async function enqueue(action: Action): Promise<boolean> {
  const { seq: _seq, ...row } = action;
  void _seq;
  return (await run(OUTBOX, "readwrite", (s) => s.add(row))) !== undefined;
}

export const dequeue = (seq: number) => run(OUTBOX, "readwrite", (s) => s.delete(seq)).then(() => undefined);

/** Whether this browser can keep data for offline use at all. */
export async function storageWorks() {
  return (await open()) !== null;
}

/** Sign-out: forget this café's saved copy (the queue is kept only if the caller chooses to). */
export async function forgetCafeData(cafeId: string) {
  await Promise.all([
    run(KV, "readwrite", (s) => s.delete(`snapshot:${cafeId}`)),
    run(KV, "readwrite", (s) => s.delete(`menu:${cafeId}`)),
  ]);
}
