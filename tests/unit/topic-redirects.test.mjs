import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextRedirects, topicRedirectPath, TOPIC_REDIRECTS } from '../../src/content/topic-redirects.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));
const liveTopic = (discipline, topic) => disciplines.find((d) => d.slug === discipline)?.topics.find((t) => t.slug === topic);

const LESSONS = {
  'george-washington': 'making-the-presidency-work',
  'john-adams': 'national-security-and-the-limits-of-dissent',
  'thomas-jefferson': 'liberty-expansion-and-contradiction',
  'abraham-lincoln': 'from-preserving-the-union-to-ending-slavery',
  'theodore-roosevelt': 'the-presidency-as-a-force-for-action',
};

test('retired president topic pages and lesson pages redirect to U.S. Presidents', () => {
  assert.equal(TOPIC_REDIRECTS.filter((r) => r.to === 'us-presidents').length, 5);
  for (const { from, lesson } of Object.entries(LESSONS).map(([from, lesson]) => ({ from, lesson }))) {
    assert.equal(topicRedirectPath(`/d/american-civics/${from}`), '/d/american-civics/us-presidents');
    assert.equal(topicRedirectPath(`/d/american-civics/${from}/${lesson}`), `/d/american-civics/us-presidents/${lesson}`);
  }
  assert.equal(topicRedirectPath('/d/american-civics/us-presidents'), null);
  assert.equal(topicRedirectPath('/d/american-civics/marbury-v-madison'), null);
  assert.equal(topicRedirectPath('/d/american-civics/george-washington/nope'), '/d/american-civics/us-presidents/nope');
  assert.equal(topicRedirectPath('/learn'), null);
});


test('retired Protestant Reformation topic and lesson pages redirect to Protestant Christianity', () => {
  assert.equal(topicRedirectPath('/d/religious-studies/protestant-reformation'), '/d/religious-studies/protestant-christianity');
  assert.equal(topicRedirectPath('/d/religious-studies/protestant-reformation/why-western-christianity-split'), '/d/religious-studies/protestant-christianity/why-western-christianity-split');
  assert.equal(topicRedirectPath('/d/religious-studies/protestant-reformation/nope'), '/d/religious-studies/protestant-christianity/nope');
  assert.equal(topicRedirectPath('/d/religious-studies/protestant-christianity'), null);
  assert.equal(topicRedirectPath('/d/religious-studies/four-noble-truths'), null);
});


test('retired Italian and Northern Renaissance topic pages redirect to The Renaissance', () => {
  assert.equal(topicRedirectPath('/d/art-history/italian-renaissance'), '/d/art-history/renaissance');
  assert.equal(topicRedirectPath('/d/art-history/northern-renaissance'), '/d/art-history/renaissance');
  assert.equal(topicRedirectPath('/d/art-history/italian-renaissance/how-renaissance-artists-made-pictures-feel-real'), '/d/art-history/renaissance/how-renaissance-artists-made-pictures-feel-real');
  assert.equal(topicRedirectPath('/d/art-history/northern-renaissance/detail-symbols-and-printed-images'), '/d/art-history/renaissance/detail-symbols-and-printed-images');
  assert.equal(topicRedirectPath('/d/art-history/renaissance'), null);
  assert.equal(topicRedirectPath('/d/art-history/impressionism'), null);
});

test('retired Cubism and Surrealism topic pages redirect to Early twentieth-century art', () => {
  assert.equal(topicRedirectPath('/d/art-history/cubism'), '/d/art-history/early-twentieth-century-art');
  assert.equal(topicRedirectPath('/d/art-history/surrealism'), '/d/art-history/early-twentieth-century-art');
  assert.equal(topicRedirectPath('/d/art-history/cubism/why-artists-broke-the-picture-apart'), '/d/art-history/early-twentieth-century-art/why-artists-broke-the-picture-apart');
  assert.equal(topicRedirectPath('/d/art-history/surrealism/when-dreams-disrupt-reality'), '/d/art-history/early-twentieth-century-art/when-dreams-disrupt-reality');
  assert.equal(topicRedirectPath('/d/art-history/early-twentieth-century-art'), null);
});

test('next.config redirects cover each retired topic and its lesson wildcard', () => {
  const entries = nextRedirects();
  assert.equal(entries.length, TOPIC_REDIRECTS.length * 2);
  assert.ok(entries.every((e) => e.permanent === true));
  const sources = new Set(entries.map((e) => e.source));
  for (const from of Object.keys(LESSONS)) {
    assert.ok(sources.has(`/d/american-civics/${from}`), from);
    assert.ok(sources.has(`/d/american-civics/${from}/:lesson`), from);
  }
  assert.ok(sources.has('/d/religious-studies/protestant-reformation'));
  assert.ok(sources.has('/d/religious-studies/protestant-reformation/:lesson'));
  for (const from of ['italian-renaissance', 'northern-renaissance']) {
    assert.ok(sources.has(`/d/art-history/${from}`), from);
    assert.ok(sources.has(`/d/art-history/${from}/:lesson`), from);
  }
  for (const from of ['cubism', 'surrealism']) {
    assert.ok(sources.has(`/d/art-history/${from}`), from);
    assert.ok(sources.has(`/d/art-history/${from}/:lesson`), from);
  }
  assert.ok(sources.has('/d/world-history/silk-roads'));
  assert.ok(sources.has('/d/world-history/silk-roads/:lesson'));
});

test('retired Silk Roads topic and lesson pages redirect to Trade and Exchange Networks', () => {
  assert.equal(topicRedirectPath('/d/world-history/silk-roads'), '/d/world-history/trade-and-exchange-networks');
  assert.equal(topicRedirectPath('/d/world-history/silk-roads/how-trade-connected-worlds'), '/d/world-history/trade-and-exchange-networks/how-trade-connected-worlds');
  assert.equal(topicRedirectPath('/d/world-history/silk-roads/nope'), '/d/world-history/trade-and-exchange-networks/nope');
  assert.equal(topicRedirectPath('/d/world-history/trade-and-exchange-networks'), null);
  assert.equal(topicRedirectPath('/d/world-history/revolution-and-reform'), null);
});

test('every redirect lands on a live topic in one hop; no retired slug is still live', () => {
  for (const r of TOPIC_REDIRECTS) {
    const toDiscipline = r.toDiscipline ?? r.discipline;
    assert.ok(liveTopic(toDiscipline, r.to), `${r.discipline}/${r.from} -> ${toDiscipline}/${r.to}: target topic missing`);
    assert.equal(liveTopic(r.discipline, r.from), undefined, `${r.discipline}/${r.from} is retired but still a live topic`);
    const chained = TOPIC_REDIRECTS.find((x) => x.discipline === toDiscipline && x.from === r.to);
    assert.equal(chained, undefined, `${r.discipline}/${r.from} -> ${toDiscipline}/${r.to} is itself redirected (chain)`);
  }
  const keys = TOPIC_REDIRECTS.map((r) => `${r.discipline}/${r.from}`);
  assert.equal(new Set(keys).size, keys.length, 'duplicate redirect source');
  // A redirected topic page and each of its lesson pages resolve to an existing lesson in one step.
  for (const d of disciplines) for (const t of d.topics) for (const l of t.lessons) {
    const dest = `/d/${d.slug}/${t.slug}/${l.slug}`;
    assert.equal(topicRedirectPath(dest), null, `${dest} is live and must not redirect`);
  }
});

const MOVES = [
  // [old discipline, old topic, lesson slug, new discipline, new topic]
  ['world-history', 'genghis-khan', 'unification-conquest-and-legacy', 'world-history', 'mongol-and-ottoman-empires'],
  ['world-history', 'ottoman-empire', 'governing-across-three-continents', 'world-history', 'mongol-and-ottoman-empires'],
  ['world-history', 'french-revolution', '1789-the-revolution-begins', 'world-history', 'revolution-and-reform'],
  ['world-history', 'french-revolution', 'republic-and-terror', 'world-history', 'revolution-and-reform'],
  ['world-history', 'meiji-restoration', 'rebuilding-japan-in-the-name-of-an-emperor', 'world-history', 'revolution-and-reform'],
  ['world-history', 'roman-republic', 'how-the-republic-was-governed', 'ancient-history', 'governing-the-classical-world'],
  ['ancient-history', 'the-nile-and-egyptian-kingship', 'how-the-nile-supported-a-kingdom', 'ancient-history', 'egypt-and-mesopotamia'],
  ['ancient-history', 'code-of-hammurabi', 'what-ancient-laws-tell-us', 'ancient-history', 'egypt-and-mesopotamia'],
  ['ancient-history', 'democracy-in-ancient-athens', 'who-counted-as-the-people', 'ancient-history', 'governing-the-classical-world'],
  ['ancient-history', 'ashoka-and-the-mauryan-empire', 'can-an-emperor-rule-through-moral-persuasion', 'ancient-history', 'governing-the-classical-world'],
];

test('round 2: retired World and Ancient History topic and lesson pages redirect to their merged topics', () => {
  for (const [fromD, fromT, lesson, toD, toT] of MOVES) {
    assert.equal(topicRedirectPath(`/d/${fromD}/${fromT}`), `/d/${toD}/${toT}`);
    assert.equal(topicRedirectPath(`/d/${fromD}/${fromT}/${lesson}`), `/d/${toD}/${toT}/${lesson}`);
    assert.ok(liveTopic(toD, toT).lessons.some((l) => l.slug === lesson), `${lesson} not in ${toD}/${toT}`);
  }
  for (const live of ['mongol-and-ottoman-empires', 'revolution-and-reform', 'trade-and-exchange-networks']) assert.equal(topicRedirectPath(`/d/world-history/${live}`), null);
  for (const live of ['egypt-and-mesopotamia', 'governing-the-classical-world']) assert.equal(topicRedirectPath(`/d/ancient-history/${live}`), null);
});

test('cross-discipline move: Roman Republic redirects from World History to Ancient History (toDiscipline)', () => {
  assert.equal(topicRedirectPath('/d/world-history/roman-republic'), '/d/ancient-history/governing-the-classical-world');
  assert.equal(topicRedirectPath('/d/world-history/roman-republic/how-the-republic-was-governed'), '/d/ancient-history/governing-the-classical-world/how-the-republic-was-governed');
  assert.equal(topicRedirectPath('/d/world-history/roman-republic/nope'), '/d/ancient-history/governing-the-classical-world/nope');
  // The old slug under the new discipline was never a URL, so it does not redirect.
  assert.equal(topicRedirectPath('/d/ancient-history/roman-republic'), null);
  const entries = nextRedirects();
  assert.deepEqual(entries.filter((e) => e.source.startsWith('/d/world-history/roman-republic')), [
    { source: '/d/world-history/roman-republic', destination: '/d/ancient-history/governing-the-classical-world', permanent: true },
    { source: '/d/world-history/roman-republic/:lesson', destination: '/d/ancient-history/governing-the-classical-world/:lesson', permanent: true },
  ]);
  // Same-discipline entries keep their discipline when toDiscipline is absent.
  assert.ok(entries.some((e) => e.source === '/d/world-history/silk-roads' && e.destination === '/d/world-history/trade-and-exchange-networks'));
  // Roman Republic is no longer in World History; its lesson id and slug are unchanged under Ancient History.
  assert.equal(liveTopic('world-history', 'roman-republic'), undefined);
  const rr = liveTopic('ancient-history', 'governing-the-classical-world').lessons.find((l) => l.id === 'les_rr01');
  assert.equal(rr.slug, 'how-the-republic-was-governed');
});
