import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import UserMenu from "@/components/UserMenu";
import SidebarStreak from "@/components/SidebarStreak";
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

// Matches the charcoal sidebar (--char) so the browser/OS chrome blends in.
export const viewport: Viewport = { themeColor: "#232326" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          {/* Sidebar (TSK-015). Only the name + sign-out stream in; a sized placeholder holds their space. */}
          <Sidebar
            streak={
              <Suspense fallback={<div className="streak-placeholder" aria-hidden="true" />}>
                <SidebarStreak />
              </Suspense>
            }
            user={
              <Suspense fallback={<div className="user user-placeholder" aria-hidden="true" />}>
                <UserMenu />
              </Suspense>
            }
          />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
