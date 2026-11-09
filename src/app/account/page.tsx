import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AccountForm from "@/components/AccountForm";
import LessonReminder from "@/components/LessonReminder";
import { reminderConfig } from "@/lib/reminders/logic.mjs";
import PasswordForm from "@/components/PasswordForm";
import { changePassword } from "@/lib/auth/reset-actions";
import { namesFromMetadata } from "@/lib/account/names.mjs";
import { createClient } from "@/lib/supabase/server";
import { drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { loadReviewLink, reviewLinkLabel } from "@/lib/drilldowns/review.mjs";
import { drilldownDbConfigured, reviewQueue } from "@/lib/drilldowns/server-db.mjs";

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
  const config = reminderConfig(process.env);
  const { data: reminder, error: reminderError } = await supabase.from("lesson_reminder_settings").select("enabled").eq("user_id", claims.sub).maybeSingle();
  return (
    <>
      <p className="account-email">
        Signed in as <strong>{email}</strong>
      </p>
      <LessonReminder key={claims.sub} loadFailed={!!reminderError} enabled={reminder?.enabled === true} available={!!config} publicKey={config?.publicKey ?? null} />
      <AccountForm firstName={firstName ?? ""} lastName={lastName ?? ""} />
      <section aria-labelledby="password-heading" className="account-section">
        <h2 id="password-heading">Change password</h2>
        <PasswordForm mode="change" action={changePassword} />
      </section>
    </>
  );
}

// Owner-only link to /review. Uses the exact gate /review uses (flag, verified session, DB owner check);
// for everyone else, or on any error, it renders nothing. Own Suspense so the queue never delays the page.
// Keep it inside its <Suspense> child: createClient() reads cookies()/connection(), and moving that out
// (or into a cached scope) could cache the link and show it to other users.
async function OwnerReviewLink() {
  if (!drilldownsEnabled(process.env)) return null;
  const supabase = await createClient();
  const link = await loadReviewLink({
    enabled: true,
    configured: drilldownDbConfigured() && Boolean(supabase),
    getUserId: async () => {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getClaims();
      const sub = data?.claims?.sub;
      return !error && typeof sub === "string" && sub ? sub : null;
    },
    db: { reviewQueue },
  });
  if (!link) return null;
  return (
    <p className="account-review-link">
      <Link href="/review">{reviewLinkLabel(link.count)}</Link>
    </p>
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
        <Suspense fallback={null}>
          <OwnerReviewLink />
        </Suspense>
      </div>
    </section>
  );
}
