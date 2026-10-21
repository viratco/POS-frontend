import { connection } from "next/server";

// Render pings this to know the app is up (and restarts it if not).
export async function GET() {
  await connection();
  return Response.json({ ok: true, time: new Date().toISOString() });
}
