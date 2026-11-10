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
  assert.equal(TOPIC_REDIRECTS.length, 5);
  for (const { from, lesson } of Object.entries(LESSONS).map(([from, lesson]) => ({ from, lesson }))) {
    assert.equal(topicRedirectPath(`/d/american-civics/${from}`), '/d/american-civics/us-presidents');
    assert.equal(topicRedirectPath(`/d/american-civics/${from}/${lesson}`), `/d/american-civics/us-presidents/${lesson}`);
  }
  assert.equal(topicRedirectPath('/d/american-civics/us-presidents'), null);
  assert.equal(topicRedirectPath('/d/american-civics/electoral-college'), null);
  assert.equal(topicRedirectPath('/d/american-civics/george-washington/nope'), '/d/american-civics/us-presidents/nope');
  assert.equal(topicRedirectPath('/learn'), null);
});

test('next.config redirects cover each retired topic and its lesson wildcard', () => {
  const entries = nextRedirects();
  assert.equal(entries.length, 10);
  assert.ok(entries.every((e) => e.permanent === true));
  const sources = new Set(entries.map((e) => e.source));
  for (const from of Object.keys(LESSONS)) {
    assert.ok(sources.has(`/d/american-civics/${from}`), from);
    assert.ok(sources.has(`/d/american-civics/${from}/:lesson`), from);
  }
});
