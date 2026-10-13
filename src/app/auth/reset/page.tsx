import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PasswordForm from "@/components/PasswordForm";
import { resetPassword } from "@/lib/auth/reset-actions";
import { FORGOT_PATH, RESET_MESSAGES, isRecoverySession } from "@/lib/auth/reset.mjs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password" };

function InvalidLink() {
  return (
    <div role="alert" className="notice">
      <p className="error">{RESET_MESSAGES.linkInvalid}</p>
      <p>
        <Link href={FORGOT_PATH}>Request a new link</Link>
      </p>
    </div>
  );
}

// Reads the session cookie and the query, so it renders inside <Suspense> (cacheComponents).
async function ResetBody({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams;
  if (error) return <InvalidLink />;
  const supabase = await createClient();
  if (!supabase) return <p className="error">{RESET_MESSAGES.notConfigured}</p>;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (isRecoverySession(claims)) return <PasswordForm mode="reset" action={resetPassword} />;
  // A normal signed-in session isn't a recovery context: change the password on /account.
  if (claims?.sub) redirect("/account");
  return <InvalidLink />;
}

export default function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  return (
    <section aria-labelledby="reset-heading" className="auth-page">
      <div className="quiz-frame">
        <p className="eyebrow center">Members</p>
        <h1 id="reset-heading">New password</h1>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <ResetBody searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}
