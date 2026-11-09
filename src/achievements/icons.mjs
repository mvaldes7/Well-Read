// @ts-check
// Subject icons for achievement medallions (Achievements page). Thin line drawings on a 24x24 grid,
// stroked with currentColor so the earned (gold coin) and locked (grey coin) colours come from CSS.
// Decorative only: every medal has a text title. Unknown ids fall back to a plain seal.

/** @type {Readonly<Record<string, string>>} */
export const ICON_PATHS = Object.freeze({
  globe: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM3 12h18M12 3c2.6 2.5 3.9 5.5 3.9 9s-1.3 6.5-3.9 9M12 3c-2.6 2.5-3.9 5.5-3.9 9s1.3 6.5 3.9 9M4.6 7.5h14.8M4.6 16.5h14.8",
  column: "M4.5 3.5h15M5.5 3.5c0 1.9 1.1 3 2.8 3h7.4c1.7 0 2.8-1.1 2.8-3M7.5 6.5v11M10.5 6.5v11M13.5 6.5v11M16.5 6.5v11M6 17.5h12M4.5 20.5h15",
  lamp: "M3 14.5c0-1.8 2-2.8 4.8-2.8h7.4l5.3-2.2-2.1 4.2c-.7 1.3-2 2-3.5 2H5.8C4 15.7 3 15.3 3 14.5ZM8.5 15.7 7.5 19h8l-1-3.3M5.5 11.9c-.3-1 .2-1.9 1.3-2.2M19.8 7.6c-1-.8-1.1-2.1-.1-3.6 1 1.5 1 2.8.1 3.6Z",
  capitol: "M3 20.5h18M4.5 18h15M6 18v-5M9 18v-5M12 18v-5M15 18v-5M18 18v-5M5 13h14M6.5 13c0-3.5 2.4-6.2 5.5-6.2s5.5 2.7 5.5 6.2M10.6 6.9V5h2.8v1.9M12 5V2.5",
  palette: "M12 3.5c-5 0-9 3.5-9 8 0 3.8 2.9 6.5 5.7 6.5 1.4 0 2.1-.9 2.1-1.9 0-1.3 1-2.2 2.3-2.2h2.5c3 0 5.4-1.8 5.4-4.6 0-3.4-4-5.8-9-5.8ZM7.2 10.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM10 6.6a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM14.6 6.6a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z",
  quill: "M20 3.5C13.5 4.5 8.6 9 6.6 15.5L5 21M20 3.5c-1 4.8-4 9-8.8 11H7M20 3.5c-2.6 1.3-5 3.3-7 5.7M9.8 11h4.4",
  candle: "M9 10.5h6v9.5H9ZM6.5 20h11M12 10.5V8.6M12 8.2c-1.4-1-1.4-2.8 0-4.7 1.4 1.9 1.4 3.7 0 4.7Z",
  book: "M12 7c-2.5-1.6-5.5-1.8-8.5-1.2v12.5c3-.6 6-.4 8.5 1.2 2.5-1.6 5.5-1.8 8.5-1.2V5.8C17.5 5.2 14.5 5.4 12 7Zm0 0v12.5",
  laurel: "M8 20c-3.5-2-5-5.5-4.5-10M16 20c3.5-2 5-5.5 4.5-10M4.6 15.6c1.6-.2 2.7.4 3.2 1.6M3.7 11.6c1.5.2 2.5 1 2.8 2.3M4.2 7.4c1.3.6 2 1.7 2 3M19.4 15.6c-1.6-.2-2.7.4-3.2 1.6M20.3 11.6c-1.5.2-2.5 1-2.8 2.3M19.8 7.4c-1.3.6-2 1.7-2 3M12 6.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z",
  compass: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM15.6 8.4l-2 5.2-5.2 2 2-5.2ZM12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21",
  seal: "M12 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM9 13.8l-1.2 6.7 4.2-2.5 4.2 2.5-1.2-6.7",
});

/** Discipline slug -> icon (Completionist set). */
const SUBJECT = Object.freeze({
  "world-history": "globe",
  "ancient-history": "column",
  philosophy: "lamp",
  "american-civics": "capitol",
  "art-history": "palette",
  "poetry-and-literature": "quill",
  "religious-studies": "candle",
});

/** Single achievements -> icon (Milestones). */
const SINGLE = Object.freeze({
  "first-lesson": "book",
  "perfect-score": "laurel",
  "discipline-explorer": "compass",
});

/**
 * Icon name for an achievement id: "completionist:<slug>" / "mastery:<slug>" use the subject icon,
 * milestones have their own, anything else (or an unknown subject) gets the seal.
 * @param {string} id @returns {keyof typeof ICON_PATHS}
 */
export function iconFor(id) {
  const m = /^(?:completionist|mastery):(.+)$/.exec(id);
  const name = m ? /** @type {Record<string, string>} */ (SUBJECT)[m[1]] : /** @type {Record<string, string>} */ (SINGLE)[id];
  return /** @type {any} */ (name && name in ICON_PATHS ? name : "seal");
}
