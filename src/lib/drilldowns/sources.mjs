// @ts-check
// Trusted-source allowlist for drill-downs (docs/plans/topic-drilldowns.md, section 3).
// A URL qualifies only if it is HTTPS on the default port, has no credentials, and its hostname equals an allowlisted
// domain or is a subdomain of one (suffix match on a "." boundary). Lookalikes such as "evilhistory.com",
// "history.com.evil.net" or "plato.stanford.edu.attacker.io" never match. Hand-curated lesson sources stay trusted
// on their own (they were reviewed by hand); this list governs NEW candidate sources.
//
// Tiers:
// - "trusted": may be a lesson's only source.
// - "supplementary": (Wikipedia) may be cited, but never as the only source; at least one trusted or curated source
//   must also pass the fetch check.

/** @typedef {"trusted" | "supplementary"} SourceTier */
/** @typedef {{ domain: string, tier: SourceTier, group: string, pathPrefix?: string }} AllowEntry */

/** @type {readonly AllowEntry[]} */
export const SOURCE_ALLOWLIST = Object.freeze([
  // General reference / museums / broadcasters
  { domain: "history.com", tier: "trusted", group: "reference" },
  { domain: "nationalgeographic.com", tier: "trusted", group: "reference" },
  { domain: "si.edu", tier: "trusted", group: "museum" },
  { domain: "smithsonianmag.com", tier: "trusted", group: "museum" },
  { domain: "khanacademy.org", tier: "trusted", group: "education" },
  { domain: "pbs.org", tier: "trusted", group: "reference" },
  { domain: "worldhistory.org", tier: "trusted", group: "reference" },
  // Philosophy encyclopedias
  { domain: "plato.stanford.edu", tier: "trusted", group: "scholarly" },
  { domain: "iep.utm.edu", tier: "trusted", group: "scholarly" },
  // Scholarly / open access (named list, no wildcards beyond .edu)
  { domain: "jstor.org", tier: "trusted", group: "scholarly", pathPrefix: "/stable/" },
  { domain: "plos.org", tier: "trusted", group: "scholarly" },
  { domain: "doaj.org", tier: "trusted", group: "scholarly" },
  { domain: "gutenberg.org", tier: "trusted", group: "primary-text" },
  // Lower trust: useful, but never the only source
  { domain: "wikipedia.org", tier: "supplementary", group: "encyclopedia" },
]);

/** Whole top-level domains: .gov (US government) and .edu (US accredited institutions). */
export const TLD_ALLOWLIST = Object.freeze([
  { tld: "gov", tier: /** @type {SourceTier} */ ("trusted"), group: "government" },
  { tld: "edu", tier: /** @type {SourceTier} */ ("trusted"), group: "university" },
]);

/**
 * True when `host` is `domain` or a subdomain of it, on a dot boundary.
 * @param {string} host lowercase hostname
 * @param {string} domain lowercase registrable domain
 */
export function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Classify a candidate source URL, or null if it is not allowlisted.
 * @param {unknown} raw
 * @returns {{ tier: SourceTier, group: string, domain: string } | null}
 */
export function classifySourceUrl(raw) {
  if (typeof raw !== "string" || raw.trim() !== raw || raw === "") return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port !== "") return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  // Reject IP literals, punycode (IDN lookalikes) and single-label hosts.
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.startsWith("[") || host.split(".").some((p) => p.startsWith("xn--") || p === "")) return null;
  for (const e of SOURCE_ALLOWLIST) {
    if (!hostMatches(host, e.domain)) continue;
    if (e.pathPrefix && !u.pathname.startsWith(e.pathPrefix)) return null;
    return { tier: e.tier, group: e.group, domain: e.domain };
  }
  const tld = host.slice(host.lastIndexOf(".") + 1);
  const t = TLD_ALLOWLIST.find((x) => x.tld === tld);
  return t ? { tier: t.tier, group: t.group, domain: `.${t.tld}` } : null;
}

/**
 * Tier rule over a lesson's passing sources: at least one source that is curated or "trusted".
 * @param {{ url: string, curated?: boolean }[]} passing sources that passed every fetch check
 */
export function sourceTierProblems(passing) {
  if (passing.length === 0) return ["no source passed the fetch check"];
  const strong = passing.some((s) => s.curated || classifySourceUrl(s.url)?.tier === "trusted");
  return strong ? [] : ["supplementary sources (e.g. Wikipedia) cannot be the only source"];
}
