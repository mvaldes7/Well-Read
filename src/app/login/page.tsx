import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { signIn } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section aria-labelledby="login-heading" className="auth-page">
      <div className="quiz-frame">
        <p className="eyebrow center">Members</p>
        <h1 id="login-heading">Sign in</h1>
        {/* AuthForm reads ?next= via useSearchParams, which needs a Suspense boundary. */}
        <Suspense fallback={<p>Loading…</p>}>
          <AuthForm mode="signin" action={signIn} />
        </Suspense>
        <p className="forgot">
          <Link href="/auth/forgot">Forgot password?</Link>
        </p>
      </div>
      <p className="auth-alt">
        No account yet? <Link href="/signup">Create one</Link>
      </p>
    </section>
  );
}
