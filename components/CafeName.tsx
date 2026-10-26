"use client";

import { useCafe } from "@/lib/cafe";

// The signed-in login's café name, for server-rendered pages.
export default function CafeName({ fallback = " " }: { fallback?: string }) {
  return <>{useCafe()?.name ?? fallback}</>;
}
