import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import MainNav from "@/components/MainNav";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Well-Read", template: "%s · Well-Read" },
  description: "Learn foundational subjects: history, philosophy, the arts and poetry.",
  applicationName: "Well-Read",
  // iPhone "Add to Home Screen": apple-mobile-web-app-title + standalone launch.
  // Icons come from the file conventions (app/icon.svg, app/apple-icon.png, app/favicon.ico)
  // and app/manifest.ts; their paths are allow-listed in src/lib/auth/logic.mjs.
  appleWebApp: { capable: true, title: "Well-Read", statusBarStyle: "black" },
};

// Matches the charcoal header band (--char) so the browser/OS chrome blends in.
export const viewport: Viewport = { themeColor: "#232326" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="bar">
            <Link href="/" className="logo">
              Well-Read<small>A personal collection</small>
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
