"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import LogoMark from "@/components/LogoMark";
import NavIcon from "@/components/NavIcon";
import { SIDEBAR_LINKS, activeHref, escReturnsFocus, showSidebar, trapTab } from "@/lib/ui/nav.mjs";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
 * Below 820px (the globals.css breakpoint) it collapses behind a Menu button (aria-expanded).
 * While open (TSK-020), Tab / Shift+Tab cycle through the Close button and the panel's controls,
 * and Esc closes it, returning focus to the toggle only if focus was inside the menu.
 * `user` is the streamed server UserMenu (name -> /account, Sign out); `streak` the streamed
 * SidebarStreak (TSK-016).
 */
export default function Sidebar({ user, streak }: { user: ReactNode; streak: ReactNode }) {
  const pathname = usePathname() ?? "";
  // Open state is tied to the path it was opened on, so navigating closes the menu.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const toggle = button.current;
      const box = panel.current;
      // Desktop layout (toggle hidden, e.g. after a resize): no trap, Esc does nothing.
      if (!toggle || !box || toggle.offsetParent === null) return;
      const focused = document.activeElement;
      const inside = focused === toggle || box.contains(focused);
      if (e.key === "Escape") {
        setOpenOn(null);
        if (escReturnsFocus(inside)) toggle.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [toggle, ...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      const next = trapTab(items.length, items.indexOf(focused as HTMLElement), e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      items[next].focus();
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
    <div className={`sidebar${open ? " open" : ""}`}>
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
      <div id="sidebar-panel" className="sidebar-panel" ref={panel}>
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
        <div className="sidebar-streak">{streak}</div>
        <div className="sidebar-user">{user}</div>
      </div>
    </div>
  );
}
