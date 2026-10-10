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
          <Link href="/" className="site-title">
            FoundationLearn
          </Link>
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
