// @ts-check
// Free, fetchable fallback sources for Dig deeper when a lesson's curated sources are blocklisted
// or fail at runtime (403, 429, timeout, empty or challenge page). Discovery uses only free APIs:
// Wikipedia (OpenSearch + query extracts/extlinks) and guessed Stanford Encyclopedia entry URLs.
// .gov / .edu / SEP pages are taken from Wikipedia external links, never from a paid search API.
import { classifySourceUrl, isBlockedSource } from "./sources.mjs";
import { isHttpsUrl } from "../../content/sources.mjs";

/** Wikimedia-required identifying User-Agent (contact via the public repo). */
export const FALLBACK_USER_AGENT = "Well-Read-Drilldown/1.0 (https://github.com/mvaldes7/Well-Read; educational source fallback)";
export const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
export const SEP_ENTRY = "https://plato.stanford.edu/entries/";

const CHALLENGE_RE = /just a moment|enable javascript and cookies|checking your browser|cf-browser-verification|vercel security checkpoint|attention required|access denied|sorry, you have been blocked|please verify you are a human|unfortunately,? we cannot serve/i;
const MIN_EXTRACT = 120;
const MIN_VISIBLE = 40;
const LEADING_ARTICLE = /^(the|a|an)\s+/i;
// Surrounding punctuation/symbols only; inner punctuation in a title is kept.
const EDGE_PUNCT = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

/**
 * Collapse whitespace, trim surrounding punctuation, and strip one leading English article (The/A/An).
 * @param {string} s
 */
export function normalizeSearchQuery(s) {
  let t = String(s ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(EDGE_PUNCT, "").trim();
  t = t.replace(LEADING_ARTICLE, "").trim();
  t = t.replace(EDGE_PUNCT, "").trim();
  return t;
}

/** Significant words (4+ alphanumeric, after article-stripping) for title/query overlap. @param {string} s */
function significantWords(s) {
  return normalizeSearchQuery(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{4,}/g) ?? [];
}

/**
 * True when a Wikipedia page title covers the drilldown choice (not merely the parent topic).
 * Two-word queries must match both words, so "Meiji Restoration" does not cover "Meiji Constitution".
 * @param {string} title @param {string} query
 */
export function titleCoversQuery(title, query) {
  const qw = significantWords(query);
  if (!qw.length) return false;
  const tw = new Set(significantWords(title));
  const hit = qw.filter((w) => tw.has(w)).length;
  if (qw.length <= 2) return hit === qw.length;
  return hit / qw.length >= 0.7;
}

/**
 * Subscription/library proxy hosts that sit under an allowlisted .edu/.gov domain but are not freely fetchable.
 * Real faculty or museum .edu pages are kept; ezproxy / .lib. / Gale proxy hosts are dropped.
 * @param {string} url
 */
export function isLibraryProxyUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "gale.com" || host.endsWith(".gale.com") || host === "galegroup.com" || host.endsWith(".galegroup.com")) return true;
    const labels = host.split(".");
    if (labels.some((l) => l === "lib" || l === "ezproxy" || l === "libproxy" || l === "ezp" || l === "libraryproxy")) return true;
    return false;
  } catch {
    return false;
  }
}

/** @param {{ title?: string, body?: string, text?: string }} page */
export function isChallengePage(page = {}) {
  return CHALLENGE_RE.test(`${page.title ?? ""}\n${page.body ?? ""}\n${page.text ?? ""}`);
}

/**
 * True when a fetched page cannot be used as grounding text.
 * @param {{ status?: number, body?: string, problem?: string | null, title?: string, text?: string }} page
 */
export function isUnusablePage(page = {}) {
  const problem = String(page.problem ?? "");
  if (problem && /HTTP 401|HTTP 403|HTTP 429|HTTP 5\d\d|timeout|abort|too many redirects|page too large|unsupported content-type/i.test(problem)) return true;
  if (page.status === 401 || page.status === 403 || page.status === 429 || (typeof page.status === "number" && page.status >= 500)) return true;
  const title = String(page.title ?? "");
  const text = String(page.text ?? "");
  if (isChallengePage({ title, body: page.body, text })) return true;
  if (text.replace(/\s+/g, " ").trim().length < MIN_VISIBLE && !problem) {
    // A 200 with almost no visible text is treated as empty (challenge shells are caught above).
    if (!page.status || page.status === 200) return true;
  }
  return false;
}

/** @param {string} s */
export function slugifyForEntry(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^the-/, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Search queries, most specific first (choice, then topic, then lesson).
 * @param {{ topic?: { title?: string }, lesson?: { title?: string }, choice?: { label?: string } }} ctx
 * @returns {string[]}
 */
export function fallbackSearchQueries(ctx = {}) {
  const raw = /** @type {string[]} */ ([ctx.choice?.label, ctx.topic?.title, ctx.lesson?.title].filter((s) => typeof s === "string" && s.trim()));
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  const add = (/** @type {string} */ value) => {
    const t = value.replace(/\s+/g, " ").trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const s of raw) {
    const original = s.replace(/\s+/g, " ").trim();
    const normalized = normalizeSearchQuery(original);
    // Prefer the stripped form (OpenSearch is prefix/title-based; "The Meiji Constitution" returns no hits).
    add(normalized);
    // Keep the original when it differs: some articles are actually titled with a leading "The".
    if (normalized.toLowerCase() !== original.toLowerCase()) add(original);
  }
  return out.slice(0, 6);
}

/**
 * @param {(url: string, init?: any) => Promise<any>} fetchImpl
 * @param {string} url
 * @param {number} [timeoutMs]
 */
async function fetchJson(fetchImpl, url, timeoutMs = 10_000) {
  const res = await fetchImpl(url, {
    headers: { "user-agent": FALLBACK_USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res || res.status !== 200) return null;
  try { return await res.json(); } catch { return null; }
}

/**
 * Wikipedia OpenSearch: returns article titles (and urls) for a query.
 * @param {(url: string, init?: any) => Promise<any>} fetchImpl
 * @param {string} query
 * @returns {Promise<{ title: string, url: string }[]>}
 */
export async function wikipediaOpenSearch(fetchImpl, query) {
  if (!query || !query.trim()) return [];
  const url = `${WIKIPEDIA_API}?action=opensearch&search=${encodeURIComponent(query.trim())}&limit=5&namespace=0&format=json`;
  try {
    const data = await fetchJson(fetchImpl, url);
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    const titles = data[1], urls = Array.isArray(data[3]) ? data[3] : [];
    /** @type {{ title: string, url: string }[]} */
    const out = [];
    for (let i = 0; i < titles.length; i++) {
      if (typeof titles[i] !== "string" || !titles[i]) continue;
      const u = typeof urls[i] === "string" && urls[i].startsWith("https://en.wikipedia.org/")
        ? urls[i]
        : `https://en.wikipedia.org/wiki/${encodeURIComponent(titles[i].replace(/ /g, "_"))}`;
      out.push({ title: titles[i], url: u });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Plain-text extract plus external links for one Wikipedia title.
 * @param {(url: string, init?: any) => Promise<any>} fetchImpl
 * @param {string} title
 * @returns {Promise<{ title: string, url: string, extract: string, extlinks: string[] } | null>}
 */
export async function wikipediaExtractAndLinks(fetchImpl, title) {
  const url = `${WIKIPEDIA_API}?action=query&prop=extracts|extlinks|info&exintro=0&explaintext=1&inprop=url&ellimit=80&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  try {
    const data = await fetchJson(fetchImpl, url);
    const pages = data?.query?.pages;
    if (!pages || typeof pages !== "object") return null;
    const page = Object.values(pages)[0];
    if (!page || typeof page !== "object" || page.missing != null || typeof page.title !== "string") return null;
    const extract = typeof page.extract === "string" ? page.extract.replace(/\s+/g, " ").trim() : "";
    if (extract.length < MIN_EXTRACT) return null;
    const canonical = typeof page.fullurl === "string" && page.fullurl.startsWith("https://")
      ? page.fullurl
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    const extlinks = (Array.isArray(page.extlinks) ? page.extlinks : [])
      .map((/** @type {any} */ e) => (typeof e === "string" ? e : e && typeof e["*"] === "string" ? e["*"] : null))
      .filter(Boolean)
      .map((/** @type {string} */ u) => (u.startsWith("http://") ? `https://${u.slice(7)}` : u));
    return { title: page.title, url: canonical, extract, extlinks };
  } catch {
    return null;
  }
}

/**
 * Keep only allowlisted, non-blocked HTTPS .gov / .edu / SEP (and other trusted-tier) links.
 * @param {string[]} links
 * @returns {{ publisher: string, title: string, url: string }[]}
 */
export function pickTrustedExtlinks(links) {
  const seen = new Set();
  /** @type {{ publisher: string, title: string, url: string, rank: number }[]} */
  const out = [];
  for (const raw of links) {
    if (typeof raw !== "string" || !isHttpsUrl(raw) || isBlockedSource(raw) || isLibraryProxyUrl(raw)) continue;
    let href;
    try { href = new URL(raw).href; } catch { continue; }
    if (seen.has(href)) continue;
    const cls = classifySourceUrl(href);
    if (!cls || cls.tier !== "trusted") continue;
    if (hostIsWikipedia(href)) continue;
    seen.add(href);
    const rank = cls.domain === "plato.stanford.edu" ? 0 : cls.group === "government" ? 1 : 2;
    out.push({
      publisher: publisherFor(cls, href),
      title: titleFromUrl(href),
      url: href,
      rank,
    });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 4).map(({ publisher, title, url }) => ({ publisher, title, url }));
}

/** @param {string} url */
function hostIsWikipedia(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "wikipedia.org" || h.endsWith(".wikipedia.org");
  } catch { return false; }
}

/** @param {{ domain: string, group: string }} cls @param {string} href */
function publisherFor(cls, href) {
  if (cls.domain === "plato.stanford.edu") return "Stanford Encyclopedia of Philosophy";
  if (cls.group === "government") {
    try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return "U.S. government"; }
  }
  if (cls.group === "university") {
    try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return "University"; }
  }
  return cls.domain;
}

/** @param {string} href */
function titleFromUrl(href) {
  try {
    const u = new URL(href);
    const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, " ").replace(/\.[a-z]+$/, "").trim() || u.hostname;
  } catch { return href; }
}

/**
 * Guess SEP entry URLs from choice / topic titles (no search API required).
 * @param {{ topic?: { title?: string, slug?: string }, choice?: { label?: string, id?: string } }} ctx
 * @returns {{ publisher: string, title: string, url: string }[]}
 */
export function guessedSepEntries(ctx = {}) {
  const labels = [ctx.choice?.label, ctx.choice?.id, ctx.topic?.title, ctx.topic?.slug].filter(Boolean);
  const seen = new Set();
  /** @type {{ publisher: string, title: string, url: string }[]} */
  const out = [];
  for (const label of labels) {
    const slug = slugifyForEntry(String(label));
    if (!slug || slug.length < 4 || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      publisher: "Stanford Encyclopedia of Philosophy",
      title: String(label),
      url: `${SEP_ENTRY}${slug}/`,
    });
  }
  return out.slice(0, 3);
}

/**
 * Discover fallback candidates. Wikipedia pages may include a pre-fetched `text` extract so the HTML page
 * does not need a second fetch. Other candidates are URLs to be fetched later.
 * @param {{
 *   fetchImpl: (url: string, init?: any) => Promise<any>,
 *   topic?: { title?: string, slug?: string },
 *   lesson?: { title?: string },
 *   choice?: { label?: string, id?: string },
 * }} args
 * @returns {Promise<{ queries: string[], candidates: { publisher: string, title: string, url: string, text?: string, fallback: true }[] }>}
 */
export async function discoverFallbackSources({ fetchImpl, topic, lesson, choice }) {
  const queries = fallbackSearchQueries({ topic, lesson, choice });
  /** @type {{ publisher: string, title: string, url: string, text?: string, fallback: true }[]} */
  const candidates = [];
  const seen = new Set();
  const add = (/** @type {{ publisher: string, title: string, url: string, text?: string }} */ c) => {
    if (!c?.url || seen.has(c.url) || isBlockedSource(c.url) || !isHttpsUrl(c.url)) return;
    seen.add(c.url);
    candidates.push({ ...c, fallback: true });
  };

  for (const query of queries) {
    const hits = await wikipediaOpenSearch(fetchImpl, query);
    for (const hit of hits.slice(0, 2)) {
      const page = await wikipediaExtractAndLinks(fetchImpl, hit.title);
      if (!page) continue;
      if (!isUnusablePage({ status: 200, text: page.extract, title: page.title })) {
        add({ publisher: "Wikipedia", title: page.title, url: page.url, text: page.extract });
      }
      for (const t of pickTrustedExtlinks(page.extlinks)) add(t);
    }
    // One on-topic Wikipedia extract plus a trusted link is enough to stop. An off-topic hit
    // (often the parent topic page, e.g. Meiji Restoration for "The Meiji Constitution") must not end the search.
    const choiceQuery = typeof choice?.label === "string" ? choice.label : "";
    const onTopicWiki = Boolean(choiceQuery) && candidates.some((c) => c.publisher === "Wikipedia" && titleCoversQuery(c.title, choiceQuery));
    if (onTopicWiki && candidates.some((c) => c.publisher !== "Wikipedia")) break;
  }

  for (const sep of guessedSepEntries({ topic, choice })) add(sep);
  return { queries, candidates: candidates.slice(0, 8) };
}
