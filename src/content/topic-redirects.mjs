// @ts-check
// Retired topic slugs that should keep working after content regrouping.
// Only the discipline and topic segments are rewritten; the lesson segment,
// if present, is kept. Paths stay on the same discipline unless an entry sets
// `toDiscipline` (a topic moved to another discipline).

/** @typedef {{ discipline: string, from: string, to: string, toDiscipline?: string }} TopicRedirect */

/** @type {ReadonlyArray<TopicRedirect>} */
export const TOPIC_REDIRECTS = [
  { discipline: "american-civics", from: "george-washington", to: "us-presidents" },
  { discipline: "american-civics", from: "john-adams", to: "us-presidents" },
  { discipline: "american-civics", from: "thomas-jefferson", to: "us-presidents" },
  { discipline: "american-civics", from: "abraham-lincoln", to: "us-presidents" },
  { discipline: "american-civics", from: "theodore-roosevelt", to: "us-presidents" },
  { discipline: "american-civics", from: "federal-legislative-process", to: "how-federal-government-works" },
  { discipline: "american-civics", from: "electoral-college", to: "how-federal-government-works" },
  { discipline: "philosophy", from: "socrates", to: "ancient-greek-ethics" },
  { discipline: "philosophy", from: "aristotle-virtue-ethics", to: "ancient-greek-ethics" },
  { discipline: "art-history", from: "perspective", to: "renaissance" },
  { discipline: "poetry-and-literature", from: "classic-novels", to: "reading-fiction" },
  { discipline: "poetry-and-literature", from: "unreliable-narration", to: "reading-fiction" },
  { discipline: "poetry-and-literature", from: "reading-poetry", to: "poetry" },
  { discipline: "poetry-and-literature", from: "homer", to: "poetry" },
  { discipline: "poetry-and-literature", from: "langston-hughes", to: "poetry" },
  { discipline: "religious-studies", from: "protestant-reformation", to: "protestant-christianity" },
  { discipline: "art-history", from: "italian-renaissance", to: "renaissance" },
  { discipline: "art-history", from: "northern-renaissance", to: "renaissance" },
  { discipline: "art-history", from: "cubism", to: "early-twentieth-century-art" },
  { discipline: "art-history", from: "surrealism", to: "early-twentieth-century-art" },
  { discipline: "world-history", from: "silk-roads", to: "trade-and-exchange-networks" },
  { discipline: "world-history", from: "genghis-khan", to: "mongol-and-ottoman-empires" },
  { discipline: "world-history", from: "ottoman-empire", to: "mongol-and-ottoman-empires" },
  { discipline: "world-history", from: "french-revolution", to: "revolution-and-reform" },
  { discipline: "world-history", from: "meiji-restoration", to: "revolution-and-reform" },
  { discipline: "world-history", from: "roman-republic", to: "governing-the-classical-world", toDiscipline: "ancient-history" },
  { discipline: "ancient-history", from: "the-nile-and-egyptian-kingship", to: "egypt-and-mesopotamia" },
  { discipline: "ancient-history", from: "code-of-hammurabi", to: "egypt-and-mesopotamia" },
  { discipline: "ancient-history", from: "democracy-in-ancient-athens", to: "governing-the-classical-world" },
  { discipline: "ancient-history", from: "ashoka-and-the-mauryan-empire", to: "governing-the-classical-world" },
];

/**
 * Next.js `redirects()` entries: the old topic page and its lesson pages.
 * @returns {Array<{ source: string, destination: string, permanent: true }>}
 */
export function nextRedirects() {
  return TOPIC_REDIRECTS.flatMap(({ discipline, from, to, toDiscipline }) => {
    const target = `/d/${toDiscipline ?? discipline}/${to}`;
    return [
      { source: `/d/${discipline}/${from}`, destination: target, permanent: true },
      { source: `/d/${discipline}/${from}/:lesson`, destination: `${target}/:lesson`, permanent: true },
    ];
  });
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
  const target = `/d/${hit.toDiscipline ?? hit.discipline}/${hit.to}`;
  return lesson ? `${target}/${lesson}` : target;
}
