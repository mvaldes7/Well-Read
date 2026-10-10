import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { signUp } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <section aria-labelledby="signup-heading" className="auth-page">
      <div className="quiz-frame">
        <p className="eyebrow center">New member</p>
        <h1 id="signup-heading">Create account</h1>
        <Suspense fallback={<p>Loading…</p>}>
          <AuthForm mode="signup" action={signUp} />
        </Suspense>
      </div>
      <p className="auth-alt">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </section>
  );
}
