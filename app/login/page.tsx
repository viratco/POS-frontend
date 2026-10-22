"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "not_authorised" ? "This account doesn't have access to that page." : null,
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      return;
    }
    // Full page load (not router.replace): drops any pages the router cached while
    // signed out, which would otherwise bounce straight back to /login.
    const next = params.get("next");
    window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/staff");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4f1] p-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2a1a10] font-poster text-3xl text-[#ecd5b1] italic shadow-lg">S</div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sohee&apos;s Kitchen</h1>
          <p className="text-sm text-stone-500">Staff sign in</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl bg-stone-100 px-4 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Password</span>
            <div className="relative mt-1">
              <input
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-xl bg-stone-100 px-4 pr-16 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-stone-900"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 right-3 text-sm font-semibold text-stone-500 hover:text-stone-800"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            disabled={busy}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 font-bold text-white transition hover:bg-stone-800 disabled:opacity-60"
          >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
