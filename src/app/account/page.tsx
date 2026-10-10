import type { Metadata } from "next";
import { Suspense } from "react";
import AccountForm from "@/components/AccountForm";
import { namesFromMetadata } from "@/lib/account/names.mjs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

// Reads the session cookie, so it renders inside <Suspense> (cacheComponents).
async function AccountDetails() {
  const supabase = await createClient();
  if (!supabase) return <p className="error">Accounts aren&apos;t configured on this server.</p>;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : "";
  if (!claims?.sub) return <p className="error">Your session has ended. Sign in again.</p>;
  const { firstName, lastName } = namesFromMetadata(claims.user_metadata);
  return (
    <>
      <p className="account-email">
        Signed in as <strong>{email}</strong>
      </p>
      <AccountForm firstName={firstName ?? ""} lastName={lastName ?? ""} />
    </>
  );
}

export default function AccountPage() {
  return (
    <section aria-labelledby="account-heading" className="auth-page">
      <div className="quiz-frame">
        <p className="eyebrow center">Your account</p>
        <h1 id="account-heading">Account</h1>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AccountDetails />
        </Suspense>
      </div>
    </section>
  );
}
