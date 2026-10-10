"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Learn", match: (p: string) => p === "/" || p.startsWith("/d/") },
  { href: "/bookshelf", label: "Bookshelf", match: (p: string) => p === "/bookshelf" },
];

/** Pages where the main nav is hidden (signed-out auth pages). */
const HIDDEN_ON = new Set(["/login", "/signup"]);

// Client component with no auth data: renders in the static shell (no Suspense needed).
export default function MainNav() {
  const pathname = usePathname() ?? "";
  if (HIDDEN_ON.has(pathname)) return null;
  return (
    <nav aria-label="Main" className="main-nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
