import { redirect } from "next/navigation";

// The proxy already sends "/" to the sign-in or the signed-in person's screen; this is the fallback.
export default function Home() {
  redirect("/login");
}
