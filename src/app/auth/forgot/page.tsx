import type { Metadata } from "next";
import Link from "next/link";
import ForgotForm from "@/components/ForgotForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <section aria-labelledby="forgot-heading" className="auth-page">
      <div className="quiz-frame">
        <p className="eyebrow center">Members</p>
        <h1 id="forgot-heading">Reset password</h1>
        <ForgotForm />
      </div>
      <p className="auth-alt">
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </section>
  );
}
