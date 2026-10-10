"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Learn", match: (p: string) => p === "/" || p.startsWith("/d/") },
  { href: "/bookshelf", label: "Bookshelf", match: (p: string) => p === "/bookshelf" },
];

export default function MainNav() {
  const pathname = usePathname() ?? "";
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
