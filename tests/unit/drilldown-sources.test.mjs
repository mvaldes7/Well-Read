import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySourceUrl, hostMatches, isBlockedSource, BLOCKED_SOURCES, sourceTierProblems, SOURCE_ALLOWLIST } from '../../src/lib/drilldowns/sources.mjs';
import { factCheckOutcome, FACTCHECK_RULE } from '../../src/lib/drilldowns/config.mjs';

const tier = (u) => classifySourceUrl(u)?.tier ?? null;

test('allowlist: named domains and subdomains match on a dot boundary', () => {
  for (const u of [
    'https://www.history.com/articles/french-revolution', 'https://www.nationalgeographic.com/history/article/x',
    'https://www.loc.gov/item/x', 'https://www.archives.gov/founding-docs', 'https://www.nps.gov/inde/index.htm',
    'https://www.si.edu/spotlight', 'https://americanhistory.si.edu/x', 'https://www.smithsonianmag.com/history/x',
    'https://www.khanacademy.org/humanities/x', 'https://plato.stanford.edu/entries/seneca/', 'https://iep.utm.edu/seneca/',
    'https://www.worldhistory.org/Genghis_Khan/', 'https://www.pbs.org/wgbh/x', 'https://avalon.law.yale.edu/x',
    'https://www.jstor.org/stable/123', 'https://journals.plos.org/plosone/article?id=1', 'https://doaj.org/article/x',
    'https://www.gutenberg.org/ebooks/1497',
  ]) assert.equal(tier(u), 'trusted', u);
  assert.equal(tier('https://en.wikipedia.org/wiki/Seneca_the_Younger'), 'supplementary');
  assert.equal(hostMatches('a.b.history.com', 'history.com'), true);
});

test('allowlist: lookalikes, other TLDs, http, credentials, ports, IPs and punycode never match', () => {
  for (const u of [
    'https://evilhistory.com/x', 'https://history.com.evil.net/x', 'https://plato.stanford.edu.attacker.io/x',
    'https://notwikipedia.org/x', 'https://wikipedia.org.co/x', 'https://gov.example.com/x', 'https://example.gov.uk/x',
    'https://example.edu.au/x', 'https://pbs.org-news.com/x', 'https://smithsonianmag.co/x', 'https://www.history.co/x',
    'http://www.history.com/x', 'https://user:pw@www.history.com/x', 'https://www.history.com:8443/x',
    'https://192.168.0.1/x', 'https://xn--hstory-9ya.com/x', 'https://xn--80ak6aa92e.gov/x', 'ftp://loc.gov/x',
    'javascript:alert(1)', ' https://www.loc.gov/x', '', null, 42,
    'https://example.org/x', 'https://randomblog.org/x', // .org is NOT wildcarded
    'https://www.jstor.org/action/doBasicSearch?q=x', // JSTOR only on /stable/ pages
  ]) assert.equal(classifySourceUrl(u), null, String(u));
  assert.equal(hostMatches('evilhistory.com', 'history.com'), false);
});

test('allowlist entries are lowercase registrable domains with no wildcards', () => {
  for (const e of SOURCE_ALLOWLIST) assert.match(e.domain, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, e.domain);
  assert.ok(!SOURCE_ALLOWLIST.some((e) => e.domain === 'org'));
});

test('tier rule: Wikipedia cannot be the only passing source; curated or trusted sources satisfy it', () => {
  const w = { url: 'https://en.wikipedia.org/wiki/X' };
  assert.equal(sourceTierProblems([w]).length, 1);
  assert.deepEqual(sourceTierProblems([w, { url: 'https://www.loc.gov/x' }]), []);
  assert.deepEqual(sourceTierProblems([w, { url: 'https://www.worldhistory.org/x', curated: true }]), []);
  assert.equal(sourceTierProblems([]).length, 1);
});

test('fact-check rule (Mike, 2026-11-02): 0 = pass, 1 = pass flagged for review, 2+ = reject', () => {
  assert.equal(FACTCHECK_RULE.maxUnconfirmedToDeliver, 1);
  assert.equal(factCheckOutcome(0), 'pass');
  assert.equal(factCheckOutcome(1), 'pass_flagged');
  assert.equal(factCheckOutcome(2), 'reject');
  assert.equal(factCheckOutcome(12), 'reject');
  assert.equal(factCheckOutcome(-1), 'reject');
  assert.equal(factCheckOutcome(Number.NaN), 'reject');
});

test('blocked sites (Mike, 2026-11-02): exact list, subdomains, pbs.org only under /empires', () => {
  assert.deepEqual(BLOCKED_SOURCES.map((b) => b.domain + (b.pathPrefix ?? '')).sort(),
    ['britannica.com', 'doaj.org', 'jstor.org', 'khanacademy.org', 'metmuseum.org', 'pbs.org/empires', 'si.edu', 'smithsonianmag.com']);
  for (const u of ['https://www.si.edu/x', 'https://americanhistory.si.edu/x', 'https://www.smithsonianmag.com/x', 'https://www.jstor.org/stable/1',
    'https://www.khanacademy.org/x', 'https://www.britannica.com/biography/X', 'https://www.metmuseum.org/essays/cubism', 'https://doaj.org/a',
    'https://www.pbs.org/empires/thegreeks/', 'https://www.pbs.org/empires']) assert.equal(isBlockedSource(u), true, u);
  for (const u of ['https://www.pbs.org/wgbh/x', 'https://www.pbs.org/empiresx', 'https://notbritannica.com/x', 'https://www.history.com/x', 'nope', null])
    assert.equal(isBlockedSource(u), false, String(u));
});

test('blocked sites never count toward the tier rule, even when curated', () => {
  const brit = { url: 'https://www.britannica.com/x', curated: true };
  assert.equal(sourceTierProblems([brit]).length, 1);
  assert.equal(sourceTierProblems([brit, { url: 'https://www.si.edu/x' }]).length, 1);
  assert.deepEqual(sourceTierProblems([brit, { url: 'https://www.loc.gov/x' }]), []);
  assert.equal(sourceTierProblems([brit, { url: 'https://en.wikipedia.org/wiki/X' }]).length, 1);
});
