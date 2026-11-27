// Topic consolidation round 2 (Philosophy, American Civics, Art History, Poetry & Literature):
// retired topic and lesson URLs redirect (308) in one hop to the merged topic; lesson slugs are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextRedirects, topicRedirectPath, TOPIC_REDIRECTS } from '../../src/content/topic-redirects.mjs';

const disciplines = JSON.parse(readFileSync(new URL('../../src/content/disciplines.json', import.meta.url), 'utf8'));

test('round 2: retired Philosophy, Civics, Art History and Literature topic and lesson pages redirect to their merged topics', () => {
  const MOVES = [
    // [discipline, old topic, lesson slug, new topic]
    ['philosophy', 'socrates', 'the-examined-life', 'ancient-greek-ethics'],
    ['philosophy', 'aristotle-virtue-ethics', 'becoming-the-kind-of-person-who-acts-well', 'ancient-greek-ethics'],
    ['philosophy', 'aristotle-virtue-ethics', 'how-habits-shape-character', 'ancient-greek-ethics'],
    ['american-civics', 'federal-legislative-process', 'how-an-idea-becomes-federal-law', 'how-federal-government-works'],
    ['american-civics', 'electoral-college', 'how-votes-become-a-presidency', 'how-federal-government-works'],
    ['art-history', 'perspective', 'how-paintings-create-depth', 'renaissance'],
    ['poetry-and-literature', 'classic-novels', 'what-makes-a-classic-novel', 'reading-fiction'],
    ['poetry-and-literature', 'unreliable-narration', 'reading-between-the-telling-and-the-truth', 'reading-fiction'],
    ['poetry-and-literature', 'reading-poetry', 'how-to-read-a-poem', 'poetry'],
    ['poetry-and-literature', 'homer', 'war-homecoming-and-the-making-of-an-epic', 'poetry'],
    ['poetry-and-literature', 'langston-hughes', 'poetry-with-the-rhythm-of-everyday-life', 'poetry'],
  ];
  const entries = nextRedirects();
  for (const [d, from, lesson, to] of MOVES) {
    assert.equal(topicRedirectPath(`/d/${d}/${from}`), `/d/${d}/${to}`);
    assert.equal(topicRedirectPath(`/d/${d}/${from}/${lesson}`), `/d/${d}/${to}/${lesson}`);
    assert.ok(entries.some((e) => e.source === `/d/${d}/${from}/:lesson` && e.destination === `/d/${d}/${to}/:lesson` && e.permanent), from);
    const topic = disciplines.find((x) => x.slug === d).topics.find((t) => t.slug === to);
    assert.ok(topic && topic.lessons.some((l) => l.slug === lesson), `${lesson} not in ${d}/${to}`);
    assert.equal(topicRedirectPath(`/d/${d}/${to}`), null);
    // One hop: the target topic is not itself a retired slug.
    assert.equal(TOPIC_REDIRECTS.some((r) => r.discipline === d && r.from === to), false);
  }
  // Left alone by decision.
  for (const p of ['/d/philosophy/utilitarianism', '/d/philosophy/stoicism', '/d/american-civics/marbury-v-madison', '/d/religious-studies/four-noble-truths', '/d/religious-studies/covenant-in-judaism', '/d/religious-studies/five-pillars-of-islam']) assert.equal(topicRedirectPath(p), null, p);
});
