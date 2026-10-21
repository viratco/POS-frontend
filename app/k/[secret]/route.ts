import { createServerClient } from "@supabase/ssr";
import { nodeRealtime } from "@/lib/supabase/node-realtime";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Secret kitchen link: /k/<KITCHEN_SECRET>. Signs the tablet in as the
// kitchen user (read-only + mark ready) and sends it to /kitchen.
// The session then refreshes itself, so the tablet stays signed in.
export async function GET(request: NextRequest, { params }: RouteContext<"/k/[secret]">) {
  const { secret } = await params;
  const expected = process.env.KITCHEN_SECRET ?? "";
  const ok =
    expected.length >= 16 &&
    secret.length === expected.length &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!ok) return new NextResponse("Not found", { status: 404 });

  const response = NextResponse.redirect(new URL("/kitchen", request.url));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      realtime: nodeRealtime,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.KITCHEN_EMAIL!,
    password: process.env.KITCHEN_PASSWORD!,
  });
  if (error) return new NextResponse(`Kitchen sign-in failed: ${error.message}`, { status: 500 });
  return response;
}
