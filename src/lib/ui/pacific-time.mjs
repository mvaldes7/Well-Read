// @ts-check
// "Nov 4, 1:41 PM PT": a timestamp in Pacific time, independent of the server's or browser's own zone. Pure and
// deterministic (fixed locale + zone), so a server-rendered value never differs from a client render.
const FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

/** @param {string | number | Date | null | undefined} value @returns {string} "" for a missing or invalid value */
export function formatPacific(value) {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // ICU uses U+202F / U+2009 around "PM" in some versions; normalize so output is stable everywhere.
  return `${FMT.format(d).replace(/[\u202f\u2009\u00a0]/g, " ")} PT`;
}

/** Machine-readable value for <time dateTime>. @param {string | number | Date | null | undefined} value */
export function isoOrEmpty(value) {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
