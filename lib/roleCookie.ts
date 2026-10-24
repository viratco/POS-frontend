// Caches a signed-in user's staff role in a short-lived HMAC-signed cookie, so the
// proxy doesn't query the `staff` table on every navigation. The cookie only gates
// which pages load; the data itself stays protected by RLS (is_staff()).

export type Role = "staff" | "kitchen";

export const ROLE_COOKIE = "sk_role";
export const ROLE_TTL_SECONDS = 10 * 60; // a role change takes effect within 10 minutes

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey | null> | undefined;

// Uses its own secret. (It used to be derived from KITCHEN_SECRET, but that value is in
// the kitchen tablet's URL, so anyone who saw the link could have forged a "staff" cookie.)
// Without ROLE_COOKIE_SECRET the role isn't cached and the proxy checks the database each time.
function key(): Promise<CryptoKey | null> {
  keyPromise ??= (async () => {
    const secret = process.env.ROLE_COOKIE_SECRET;
    if (!secret || secret.length < 32) return null;
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const derived = await crypto.subtle.sign("HMAC", base, enc.encode("sohee:role-cookie:v1"));
    return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  })();
  return keyPromise;
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Cookie value for `userId` having `role`, or null if no signing secret is configured. */
export async function signRole(userId: string, role: Role, nowSec: number): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const payload = `${userId}.${role}.${nowSec + ROLE_TTL_SECONDS}`;
  return `${payload}.${b64url(await crypto.subtle.sign("HMAC", k, enc.encode(payload)))}`;
}

/** The cached role if the cookie is genuine, unexpired and belongs to `userId`. */
export async function readRole(value: string | undefined, userId: string, nowSec: number): Promise<Role | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [uid, role, exp, sig] = parts;
  if (uid !== userId || (role !== "staff" && role !== "kitchen") || !(Number(exp) > nowSec)) return null;
  const k = await key();
  if (!k) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", k, fromB64url(sig), enc.encode(`${uid}.${role}.${exp}`));
    return ok ? role : null;
  } catch {
    return null;
  }
}
