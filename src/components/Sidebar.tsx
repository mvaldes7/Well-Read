"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import LogoMark from "@/components/LogoMark";
import NavIcon from "@/components/NavIcon";
import { SIDEBAR_LINKS, activeHref, showSidebar } from "@/lib/ui/nav.mjs";

function Logo() {
  return (
    <Link href="/" className="logo">
      <LogoMark />
      <span className="logo-text">
        Well-Read<small>A personal collection</small>
      </span>
    </Link>
  );
}

/**
 * App sidebar (TSK-015): replaces the top nav. Hidden on the signed-out auth pages (logo only).
 * Below 860px it collapses behind a Menu button (aria-expanded; Esc closes and returns focus).
 * `user` is the streamed server UserMenu (name -> /account, Sign out).
 */
export default function Sidebar({ user }: { user: ReactNode }) {
  const pathname = usePathname() ?? "";
  // Open state is tied to the path it was opened on, so navigating closes the menu.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!showSidebar(pathname)) {
    return (
      <header className="auth-header">
        <Logo />
      </header>
    );
  }

  const active = activeHref(pathname);
  return (
    <aside className={`sidebar${open ? " open" : ""}`} aria-label="Sidebar">
      <div className="sidebar-top">
        <Logo />
        <button
          ref={button}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="sidebar-panel"
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          <span aria-hidden="true" className="menu-glyph">{open ? "✕" : "☰"}</span>
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <div id="sidebar-panel" className="sidebar-panel">
        <nav aria-label="Main">
          <ul>
            {SIDEBAR_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={active === l.href ? "page" : undefined}>
                  <NavIcon name={l.icon} />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-user">{user}</div>
      </div>
    </aside>
  );
}
