import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRedirects, topicRedirectPath, TOPIC_REDIRECTS } from '../../src/content/topic-redirects.mjs';

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
  assert.equal(topicRedirectPath('/d/american-civics/electoral-college'), null);
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
});
