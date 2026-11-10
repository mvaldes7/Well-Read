// @ts-check
// Bookshelf view toggle helpers: localStorage choice, library totals, and the
// whole-library packing rules from the approved mockup (wrap on discipline
// boundaries when the rest of a group fits on a new shelf).

/** @typedef {import("../progress/logic.mjs").Book} Book */
/** @typedef {import("../progress/logic.mjs").BookshelfGroup} BookshelfGroup */

export const BOOKSHELF_VIEW_KEY = "well-read-bookshelf-view";
export const BOOKSHELF_VIEWS = /** @type {const} */ (["discipline", "library"]);

export const SHELF_GAP = 3;
export const SHELF_GROUP_GAP = 10;
export const SHELF_PREFER_WRAP = 0.6;
export const SHELF_NARROW_MAX = 600;
export const SHELF_PAD_NARROW = 32;
export const SHELF_PAD_WIDE = 80;
export const SHELF_MIN_AVAILABLE = 200;
export const SHELF_BOOKEND_W = 22;

/**
 * @typedef {"discipline" | "library"} BookshelfViewMode
 *
 * @typedef {{
 *   book: Book,
 *   color: string,
 *   groupId: string,
 *   groupStart: boolean,
 *   width: number,
 * }} LibraryItem
 *
 * @typedef {{ groupId: string, width: number, groupStart?: boolean }} PackItem
 */

/**
 * @param {unknown} value
 * @returns {BookshelfViewMode}
 */
export function parseBookshelfView(value) {
  return value === "library" ? "library" : "discipline";
}

/**
 * Read the stored view for this device. Missing, unreadable, or unknown values
 * fall back to the default ("discipline") so SSR and the first client paint match.
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {BookshelfViewMode}
 */
export function readStoredBookshelfView(storage) {
  if (!storage) return "discipline";
  try {
    return parseBookshelfView(storage.getItem(BOOKSHELF_VIEW_KEY));
  } catch {
    return "discipline";
  }
}

/** @type {Set<() => void>} */
const viewListeners = new Set();
/** In-memory choice so the same tab updates immediately and writes still work if Storage throws. */
/** @type {BookshelfViewMode | null} */
let sessionView = null;

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeBookshelfView(listener) {
  viewListeners.add(listener);
  if (viewListeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onBookshelfViewStorage);
  }
  return () => {
    viewListeners.delete(listener);
    if (viewListeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onBookshelfViewStorage);
    }
  };
}

/** @param {StorageEvent} event */
function onBookshelfViewStorage(event) {
  if (event.key && event.key !== BOOKSHELF_VIEW_KEY) return;
  sessionView = event.key === BOOKSHELF_VIEW_KEY ? parseBookshelfView(event.newValue) : null;
  notifyBookshelfView();
}

function notifyBookshelfView() {
  for (const listener of viewListeners) listener();
}

/** Client snapshot for useSyncExternalStore. */
export function getBookshelfViewSnapshot() {
  if (sessionView) return sessionView;
  return readStoredBookshelfView(typeof window === "undefined" ? null : window.localStorage);
}

/** SSR / hydration snapshot: always the default, so the first paint matches the server. */
export function getBookshelfViewServerSnapshot() {
  return /** @type {const} */ ("discipline");
}

/**
 * @param {Pick<Storage, "setItem"> | null | undefined} storage
 * @param {unknown} view
 */
export function writeStoredBookshelfView(storage, view) {
  const mode = parseBookshelfView(view);
  sessionView = mode;
  if (storage) {
    try {
      storage.setItem(BOOKSHELF_VIEW_KEY, mode);
    } catch {
      // Quota or private-mode Storage can throw; the in-memory choice still works.
    }
  }
  notifyBookshelfView();
}

/**
 * "N volumes · M lessons completed", with singular forms at 1.
 * @param {number} volumes
 * @param {number} lessons
 */
export function volumeLessonLine(volumes, lessons) {
  return `${volumes} ${volumes === 1 ? "volume" : "volumes"} · ${lessons} ${lessons === 1 ? "lesson" : "lessons"} completed`;
}

/**
 * Totals for the whole-library wall text, from the same groups the page already loads.
 * @param {ReadonlyArray<BookshelfGroup>} groups
 * @returns {{ volumes: number, lessons: number, line: string }}
 */
export function libraryTotals(groups) {
  let volumes = 0;
  let lessons = 0;
  for (const group of groups) {
    volumes += group.books.length;
    for (const book of group.books) lessons += book.passedCount;
  }
  return { volumes, lessons, line: volumeLessonLine(volumes, lessons) };
}

/**
 * Horizontal padding the .books list uses at a given case width (32px on
 * narrow cases, 80px on desktop), matching globals.css and the mockup.
 * @param {number} caseWidth
 */
export function shelfBooksPad(caseWidth) {
  return caseWidth <= SHELF_NARROW_MAX ? SHELF_PAD_NARROW : SHELF_PAD_WIDE;
}

/**
 * Packing width inside a case: inner client width minus the books padding.
 * @param {number} innerWidth
 * @param {number} caseWidth
 */
export function shelfAvailableWidth(innerWidth, caseWidth) {
  return Math.max(SHELF_MIN_AVAILABLE, innerWidth - shelfBooksPad(caseWidth));
}

/**
 * Flatten bookshelf groups into packing items, in discipline then topic order.
 * `groupStart` marks the first book of each discipline.
 * @param {ReadonlyArray<BookshelfGroup>} groups
 * @param {(key: string, title: string) => { width: number }} widthOf
 * @returns {LibraryItem[]}
 */
export function libraryItems(groups, widthOf) {
  /** @type {LibraryItem[]} */
  const items = [];
  for (const group of groups) {
    let first = true;
    for (const book of group.books) {
      const { width } = widthOf(`${book.disciplineSlug}/${book.topicSlug}`, book.topicTitle);
      items.push({
        book,
        color: group.discipline.color,
        groupId: group.discipline.slug,
        groupStart: first,
        width,
      });
      first = false;
    }
  }
  return items;
}

/**
 * Pack books into shelf rows. A new discipline starts a new row when the rest
 * of that group fits on a fresh shelf and either it does not fit here or the
 * current row is already at least `preferWrapAt` full. A single book that does
 * not fit also wraps. On a narrow available width this still lets a later,
 * smaller discipline share a shelf (the phone layout).
 *
 * @template {PackItem} T
 * @param {ReadonlyArray<T>} items
 * @param {number} available
 * @param {{ gap?: number, groupGap?: number, preferWrapAt?: number }} [opts]
 * @returns {T[][]}
 */
export function packLibraryRows(items, available, opts = {}) {
  const gap = opts.gap ?? SHELF_GAP;
  const groupGap = opts.groupGap ?? SHELF_GROUP_GAP;
  const preferWrapAt = opts.preferWrapAt ?? SHELF_PREFER_WRAP;
  /** @type {T[][]} */
  const rows = [];
  /** @type {T[]} */
  let row = [];
  let used = 0;

  /**
   * @param {T} item
   * @param {number} extra
   */
  const add = (item, extra) => {
    row.push(item);
    used += extra + item.width;
  };
  const flush = () => {
    if (row.length) rows.push(row);
    row = [];
    used = 0;
  };
  /**
   * @param {number} from
   */
  const groupWidth = (from) => {
    const id = items[from].groupId;
    let w = 0;
    let n = 0;
    for (let i = from; i < items.length && items[i].groupId === id; i++) {
      w += (n ? gap : 0) + items[i].width;
      n += 1;
    }
    return w;
  };

  items.forEach((item, i) => {
    const start = Boolean(item.groupStart) || (i > 0 && items[i - 1].groupId !== item.groupId);
    const extra = start && row.length ? groupGap : row.length ? gap : 0;
    if (start && row.length) {
      const rest = groupWidth(i);
      const fitsHere = used + extra + rest <= available;
      const preferWrap = used >= available * preferWrapAt;
      if ((!fitsHere || preferWrap) && rest <= available) {
        flush();
        add(item, 0);
        return;
      }
    }
    if (row.length && used + extra + item.width > available) {
      flush();
      add(item, 0);
      return;
    }
    add(item, extra);
  });
  flush();
  return rows;
}
