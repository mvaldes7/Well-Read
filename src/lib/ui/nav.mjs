// @ts-check
// Sidebar navigation (TSK-015). Pure, so the link set and active-state rules are unit-tested.
// Deliberately NOT included (Mike, TSK-015): Ledger, Search. Reading List added in TSK-017.

/** @typedef {{ href: string, label: string, icon: string, match: (p: string) => boolean }} NavLink */

/** @type {ReadonlyArray<NavLink>} */
export const SIDEBAR_LINKS = Object.freeze([
  { href: "/", label: "Dashboard", icon: "home", match: (p) => p === "/" },
  { href: "/learn", label: "Learn", icon: "book", match: (p) => p === "/learn" || p === "/d" || p.startsWith("/d/") },
  { href: "/bookshelf", label: "Library Wall", icon: "shelf", match: (p) => p === "/bookshelf" },
  { href: "/reading-list", label: "Reading List", icon: "list", match: (p) => p === "/reading-list" },
  { href: "/progress", label: "Progress", icon: "chart", match: (p) => p === "/progress" },
  { href: "/achievements", label: "Badges", icon: "badge", match: (p) => p === "/achievements" },
  { href: "/account", label: "Settings", icon: "gear", match: (p) => p === "/account" },
]);

/** Signed-out auth pages (incl. password reset, TSK-018): no sidebar, logo only. */
export const NO_SIDEBAR = new Set(["/login", "/signup", "/auth/forgot", "/auth/reset"]);

/** @param {string} pathname */
const normalise = (pathname) => (pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname);

/** @param {string} pathname */
export function showSidebar(pathname) {
  return !NO_SIDEBAR.has(normalise(pathname));
}

/**
 * href of the active sidebar link for a path, or null.
 * @param {string} pathname
 */
export function activeHref(pathname) {
  const p = normalise(pathname);
  return SIDEBAR_LINKS.find((l) => l.match(p))?.href ?? null;
}

/**
 * Focus trap for the open mobile menu (TSK-020). Given the trap's focusable elements in order
 * and the index of the focused one (-1 when focus is outside the trap), returns the index to
 * move focus to, or null to let the browser handle Tab normally (moving within the trap).
 * @param {number} count
 * @param {number} current
 * @param {boolean} shift
 * @returns {number | null}
 */
export function trapTab(count, current, shift) {
  if (count <= 0) return null;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

/**
 * Esc on the open menu: return focus to the toggle only when focus was inside the menu
 * (panel or the toggle itself); otherwise leave it where the user put it.
 * @param {boolean} focusInsideMenu
 */
export const escReturnsFocus = (focusInsideMenu) => focusInsideMenu;
