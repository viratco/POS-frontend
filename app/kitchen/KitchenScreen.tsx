"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SoundToggle from "@/components/SoundToggle";
import { chime } from "@/lib/chime";
import { useOnline } from "@/lib/offline/net";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useOrderFeed } from "@/lib/useOrderFeed";

type Ticket = {
  id: string;
  name_snapshot: string;
  qty: number;
  note: string | null;
  created_at: string;
  accepted_at: string | null;
  options?: { name: string }[] | null;
  orders: { tables: { name: string } | null } | null;
};

export default function KitchenScreen() {
  const supabase = supabaseBrowser();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0); // set on mount; 0 avoids a prerender-time clock
  const online = useOnline();
  // The dish waiting for "Yes, ready". Nothing is marked until that second tap.
  const [confirming, setConfirming] = useState<string | null>(null);
  const askedAt = useRef(0);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("order_items")
      .select("*, orders!inner(status, tables(name))")
      .eq("status", "pending")
      .eq("orders.status", "open")
      .order("accepted_at", { ascending: true, nullsFirst: true })
      .order("created_at");
    if (error) setError(error.message);
    else {
      setError(null);
      setTickets(data as unknown as Ticket[]);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const live = useOrderFeed(load, () => chime());

  // Changes its mind or walks away: the question goes away by itself.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(null), 6000);
    return () => clearTimeout(t);
  }, [confirming]);

  function ask(id: string, at: number) {
    askedAt.current = at;
    setConfirming(id);
  }

  function confirm(id: string, at: number) {
    // "Yes" appears where the finger already is: ignore a double-tap on Mark ready.
    if (at - askedAt.current < 500) return;
    setConfirming(null);
    void markReady(id);
  }

  async function markReady(id: string) {
    setTickets((ts) => ts.filter((t) => t.id !== id)); // optimistic
    const { error } = await supabase.rpc("mark_item_ready", { p_item_id: id });
    if (error) {
      setError(error.message);
      void load();
    }
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          Kitchen · <span className="text-amber-400">{tickets.length}</span> pending
        </h1>
        <div className="flex items-center gap-4">
          <span className={`text-lg ${live ? "text-emerald-400" : "text-red-500"}`}>{live ? "● Live" : "● Reconnecting…"}</span>
          <SoundToggle big />
        </div>
      </header>

      {!online && (
        <div className="mb-4 rounded-xl border-2 border-amber-400 bg-amber-950 p-4 text-amber-100">
          <p className="text-2xl font-bold">📴 No internet</p>
          <p className="mt-1 text-lg">
            New orders won&apos;t show here until it&apos;s back. The counter prints a kitchen slip for every order meanwhile. Cook from the slips.
          </p>
        </div>
      )}
      {error && online && <p className="mb-4 rounded-lg bg-red-900 p-3 text-xl">{error}</p>}

      {tickets.length === 0 ? (
        <p className="mt-32 text-center text-4xl text-neutral-500">All caught up ✓</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tickets.map((t) => {
            const mins = now === 0 ? 0 : Math.max(0, Math.floor((now - new Date(t.accepted_at ?? t.created_at).getTime()) / 60_000));
            const late = mins >= 15;
            return (
              <li key={t.id}>
                <div className={`rounded-2xl border-4 p-5 ${confirming === t.id ? "border-emerald-500 bg-emerald-950" : late ? "border-red-500 bg-red-950" : "border-neutral-700 bg-neutral-900"}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-amber-400">{t.orders?.tables?.name ?? "?"}</span>
                    <span className={`text-2xl font-semibold tabular-nums ${late ? "text-red-400" : "text-neutral-300"}`}>
                      {mins === 0 ? "now" : `${mins} min`}
                    </span>
                  </div>
                  <div className="mt-2 text-4xl leading-tight font-bold">
                    <span className="text-emerald-400">{t.qty}×</span> {t.name_snapshot}
                  </div>
                  {t.options && t.options.length > 0 && (
                    <div className="mt-1 text-2xl font-semibold text-sky-300">{t.options.map((o) => o.name).join(" · ")}</div>
                  )}
                  {t.note && <div className="mt-3 rounded-lg bg-yellow-300 px-3 py-2 text-2xl font-bold text-black">⚠ {t.note}</div>}

                  {confirming === t.id ? (
                    <div className="mt-4">
                      <p className="text-xl font-bold text-emerald-300">Is this dish ready?</p>
                      <div className="mt-2 flex gap-3">
                        <button onClick={() => setConfirming(null)} className="h-16 flex-1 rounded-xl bg-neutral-700 text-2xl font-bold text-white active:scale-[0.98]">
                          No
                        </button>
                        <button onClick={(e) => confirm(t.id, e.timeStamp)} className="h-16 flex-[2] rounded-xl bg-emerald-500 text-2xl font-bold text-black active:scale-[0.98]">
                          ✓ Yes, ready
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={(e) => ask(t.id, e.timeStamp)} className="mt-4 h-16 w-full rounded-xl bg-neutral-800 text-2xl font-bold text-white ring-2 ring-neutral-600 active:scale-[0.98]">
                      Mark ready
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
