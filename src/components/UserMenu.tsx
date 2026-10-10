import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

// Reads the session cookie, so it must render inside <Suspense> (cacheComponents).
export default async function UserMenu() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (typeof email !== "string" || !email) return null;

  return (
    <div className="user-menu">
      <nav aria-label="Main">
        <Link href="/">Learn</Link> <Link href="/bookshelf">Bookshelf</Link>
      </nav>
      <span>
        Signed in as <strong>{email}</strong>
      </span>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
