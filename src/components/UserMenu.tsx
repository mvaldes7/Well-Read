import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { headerDisplay, namesFromMetadata } from "@/lib/account/names.mjs";
import { createClient } from "@/lib/supabase/server";

// Reads the session cookie, so it must render inside <Suspense> (cacheComponents).
// The name comes from the verified JWT claims' user_metadata (no extra network call);
// it's user-editable metadata, so it's display only.
export default async function UserMenu() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (typeof email !== "string" || !email) return null;
  const { firstName, lastName } = namesFromMetadata(data?.claims?.user_metadata);
  const { label, isName } = headerDisplay({ firstName, email });
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <div className="user">
      <Link
        href="/account"
        className="user-link"
        title={isName ? `${fullName} (${email})` : email}
        aria-label={`Account: ${isName ? fullName : email}`}
      >
        {isName && <span className="hi">Hi,</span>}
        <span className="user-name">{label}</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="btn-ghost">
          Sign out
        </button>
      </form>
    </div>
  );
}
