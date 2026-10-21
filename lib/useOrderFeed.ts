"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { OrderItem } from "@/lib/types";

// Subscribes to realtime changes on orders + order_items.
// Calls `reload` on any change (and when the tab regains focus, to catch anything
// missed while the socket was asleep), and `onNewItem` for each inserted item.
export function useOrderFeed(reload: () => void, onNewItem?: (item: OrderItem) => void) {
  const [live, setLive] = useState(false);
  const reloadRef = useRef(reload);
  const newItemRef = useRef(onNewItem);
  useEffect(() => {
    reloadRef.current = reload;
    newItemRef.current = onNewItem;
  });

  useEffect(() => {
    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current(), 150);
    };

    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    // Realtime only delivers rows that RLS lets this user see, so the socket must
    // carry the staff/kitchen session token *before* joining, not the anon key.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;
      channel = subscribe();
    });

    const subscribe = () => supabase
      .channel("order-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
        if (payload.eventType === "INSERT") newItemRef.current?.(payload.new as OrderItem);
        scheduleReload();
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") scheduleReload();
      });

    const onVisible = () => document.visibilityState === "visible" && scheduleReload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return live;
}
