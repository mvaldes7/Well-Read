// @ts-check
// Retired topic slugs that should keep working after content regrouping.
// Paths stay on the same discipline; only the topic segment (and then the
// lesson segment, if present) is rewritten.

/** @typedef {{ discipline: string, from: string, to: string }} TopicRedirect */

/** @type {ReadonlyArray<TopicRedirect>} */
export const TOPIC_REDIRECTS = [
  { discipline: "american-civics", from: "george-washington", to: "us-presidents" },
  { discipline: "american-civics", from: "john-adams", to: "us-presidents" },
  { discipline: "american-civics", from: "thomas-jefferson", to: "us-presidents" },
  { discipline: "american-civics", from: "abraham-lincoln", to: "us-presidents" },
  { discipline: "american-civics", from: "theodore-roosevelt", to: "us-presidents" },
  { discipline: "religious-studies", from: "protestant-reformation", to: "protestant-christianity" },
  { discipline: "art-history", from: "italian-renaissance", to: "renaissance" },
  { discipline: "art-history", from: "northern-renaissance", to: "renaissance" },
  { discipline: "art-history", from: "cubism", to: "early-twentieth-century-art" },
  { discipline: "art-history", from: "surrealism", to: "early-twentieth-century-art" },
];

/**
 * Next.js `redirects()` entries: the old topic page and its lesson pages.
 * @returns {Array<{ source: string, destination: string, permanent: true }>}
 */
export function nextRedirects() {
  return TOPIC_REDIRECTS.flatMap(({ discipline, from, to }) => [
    { source: `/d/${discipline}/${from}`, destination: `/d/${discipline}/${to}`, permanent: true },
    { source: `/d/${discipline}/${from}/:lesson`, destination: `/d/${discipline}/${to}/:lesson`, permanent: true },
  ]);
}

/**
 * Resolve a browse path against the retired-topic map.
 * @param {string} pathname
 * @returns {string | null} the new path when a redirect applies, otherwise null
 */
export function topicRedirectPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/d/")) return null;
  const parts = pathname.split("/").filter(Boolean);
  // ["d", discipline, topic] or ["d", discipline, topic, lesson]
  if (parts.length < 3 || parts.length > 4 || parts[0] !== "d") return null;
  const [, discipline, topic, lesson] = parts;
  const hit = TOPIC_REDIRECTS.find((r) => r.discipline === discipline && r.from === topic);
  if (!hit) return null;
  return lesson ? `/d/${hit.discipline}/${hit.to}/${lesson}` : `/d/${hit.discipline}/${hit.to}`;
}
