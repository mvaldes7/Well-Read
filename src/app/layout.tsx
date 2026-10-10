import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import MainNav from "@/components/MainNav";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Curio", template: "%s · Curio" },
  description: "Learn foundational subjects: history, philosophy, the arts and poetry.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="bar">
            <Link href="/" className="logo">
              Curio<small>A personal collection</small>
            </Link>
            {/* Static shell: the two nav links need no auth data, so they render immediately. */}
            <MainNav />
            {/* Only the email + sign-out stream in; a sized placeholder holds their space. */}
            <Suspense fallback={<div className="user user-placeholder" aria-hidden="true" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
