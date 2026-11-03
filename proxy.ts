import { createServerClient } from "@supabase/ssr";
import { nodeRealtime } from "@/lib/supabase/node-realtime";
import { NextResponse, type NextRequest } from "next/server";
import { readRole, ROLE_COOKIE, ROLE_TTL_SECONDS, signRole, type Role } from "@/lib/roleCookie";

// Refreshes the Supabase session cookie and gates staff/kitchen pages by role.
const STAFF_PATHS = ["/staff", "/admin", "/qr"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      realtime: nodeRealtime,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Verifies the session JWT locally (ES256 signing keys), refreshing it if expired.
  // Unlike getUser(), this needs no round trip to Supabase Auth on every click.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const path = request.nextUrl.pathname;

  // Role comes from a signed cookie when fresh; otherwise one lookup, then cached.
  async function roleOf(userId: string): Promise<Role | null> {
    const nowSec = Math.floor(Date.now() / 1000);
    const cached = await readRole(request.cookies.get(ROLE_COOKIE)?.value, userId, nowSec);
    if (cached) return cached;
    const { data: staff } = await supabase.from("staff").select("role").eq("user_id", userId).maybeSingle();
    const role = (staff?.role as Role | undefined) ?? null;
    const signed = role && (await signRole(userId, role, nowSec));
    if (signed) {
      response.cookies.set(ROLE_COOKIE, signed, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: ROLE_TTL_SECONDS });
    }
    return role;
  }

  // The site's front door is the sign-in: signed-out people go to /login, signed-in ones to their screen.
  if (path === "/") {
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = !userId ? "/login" : (await roleOf(userId)) === "kitchen" ? "/kitchen" : "/staff";
    return NextResponse.redirect(url);
  }

  const needsStaff = STAFF_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  const needsKitchen = path === "/kitchen";
  if (!needsStaff && !needsKitchen) return response;

  if (!userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const role = await roleOf(userId);
  const allowed = needsStaff ? role === "staff" : role === "staff" || role === "kitchen";
  if (!allowed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "not_authorised");
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/", "/staff/:path*", "/admin/:path*", "/qr/:path*", "/kitchen", "/login"],
};
