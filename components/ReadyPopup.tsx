"use client";

import { useEffect, useRef, useState } from "react";
import { chime } from "@/lib/chime";
import { optionsLabel } from "@/lib/options";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Middle-of-screen alert when the kitchen marks a dish ready, on every staff tab, so someone
// goes and collects it. It stays until staff tap OK, or until the dish is served.

type ReadyItem = {
  id: string;
  name_snapshot: string;
  qty: number;
  note: string | null;
  options: { name: string; group: string }[] | null;
  orders: { tables: { name: string } | null } | null;
};

// Kept for this browser tab's session, so moving between staff tabs doesn't lose or repeat an alert.
const SEEN_KEY = "pos.readySeen";
const WAITING_KEY = "pos.readyWaiting";

function read(key: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function write(key: string, ids: string[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {}
}

export default function ReadyPopup() {
  const [alerts, setAlerts] = useState<ReadyItem[]>([]);
  // Used if this browser blocks session storage.
  const seenFallback = useRef<string[] | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    async function check() {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name_snapshot, qty, note, options, orders!inner(status, tables(name))")
        .eq("status", "ready")
        .eq("orders.status", "open");
      if (error || stopped) return; // no connection: the next check catches up
      const ready = (data ?? []) as unknown as ReadyItem[];
      const ids = ready.map((i) => i.id);

      const seen = read(SEEN_KEY) ?? seenFallback.current;
      // First look after opening: dishes already ready are on the screen, so no alert for those.
      if (!seen) {
        seenFallback.current = ids;
        write(SEEN_KEY, ids);
        return;
      }
      const fresh = ids.filter((id) => !seen.includes(id));
      const waiting = [...new Set([...(read(WAITING_KEY) ?? []), ...fresh])].filter((id) => ids.includes(id));
      const nowSeen = [...new Set([...seen, ...ids])].slice(-500);
      seenFallback.current = nowSeen;
      write(SEEN_KEY, nowSeen);
      write(WAITING_KEY, waiting);
      setAlerts(ready.filter((i) => waiting.includes(i.id)));
      if (fresh.length > 0) chime();
    }

    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), 200);
    };

    void check();
    // Realtime only delivers rows the signed-in user can see, so it needs their token first.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (stopped) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (stopped) return;
      channel = supabase
        .channel("ready-alerts")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_items" }, soon)
        .subscribe();
    });
    // A backup in case the live connection misses something.
    const poll = setInterval(() => void check(), 15_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  function dismiss() {
    write(WAITING_KEY, []);
    setAlerts([]);
  }

  if (alerts.length === 0) return null;

  const tables = new Map<string, ReadyItem[]>();
  for (const a of alerts) {
    const name = a.orders?.tables?.name ?? "Table";
    tables.set(name, [...(tables.get(name) ?? []), a]);
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Food is ready" className="no-print fixed inset-0 z-[90] flex animate-fade-in items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-4 ring-sky-400">
        <div className="bg-sky-600 px-6 py-5 text-center text-white">
          <div className="text-5xl" aria-hidden>
            🔔
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Food is ready!</h2>
          <p className="mt-0.5 font-medium text-sky-100">Please collect it from the kitchen</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {[...tables].map(([name, items]) => (
            <div key={name}>
              <div className="text-2xl font-bold text-stone-900">{name}</div>
              <ul className="mt-1 space-y-1">
                {items.map((i) => (
                  <li key={i.id} className="text-lg leading-snug text-stone-700">
                    <span className="font-bold text-stone-900">{i.qty}×</span> {i.name_snapshot}
                    {i.options && i.options.length > 0 && <span className="block pl-6 text-sm text-stone-500">{optionsLabel(i.options)}</span>}
                    {i.note && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{i.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-stone-200 p-4">
          <button onClick={dismiss} autoFocus className="h-14 w-full rounded-xl bg-sky-600 text-lg font-bold text-white transition hover:bg-sky-700 active:scale-[0.98]">
            OK, going to get it
          </button>
        </div>
      </div>
    </div>
  );
}
