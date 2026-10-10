import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FoundationLearn", template: "%s · FoundationLearn" },
  description: "Learn foundational subjects: history, philosophy, the arts and poetry.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="bar">
            <Link href="/" className="logo">
              FoundationLearn<small>A personal collection</small>
            </Link>
            {/* Sized placeholder while the session streams in, so the header doesn't shift. */}
            <Suspense fallback={<div className="user-menu user-menu-placeholder" aria-hidden="true" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
