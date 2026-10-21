import { createServerClient } from "@supabase/ssr";
import { nodeRealtime } from "@/lib/supabase/node-realtime";
import { NextResponse, type NextRequest } from "next/server";

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

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const path = request.nextUrl.pathname;

  const needsStaff = STAFF_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  const needsKitchen = path === "/kitchen";
  if (!needsStaff && !needsKitchen) return response;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  const { data: staff } = await supabase.from("staff").select("role").eq("user_id", user.id).maybeSingle();
  const role = staff?.role as "staff" | "kitchen" | undefined;
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
  matcher: ["/staff/:path*", "/admin/:path*", "/qr/:path*", "/kitchen", "/login"],
};
