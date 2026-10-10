import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { signUp } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <section aria-labelledby="signup-heading" className="auth-page">
      <h1 id="signup-heading">Create account</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <AuthForm mode="signup" action={signUp} />
      </Suspense>
      <p>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </section>
  );
}
