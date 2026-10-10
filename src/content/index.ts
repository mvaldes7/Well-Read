import raw from "./disciplines.json";
import {
  TOPIC_KINDS,
  type Discipline,
  type Lesson,
  type QuizQuestion,
  type Topic,
} from "./schema";

// JSON imports are typed structurally (e.g. `kind: string`), so the data is
// checked at load time and narrowed to the schema types. A mistake in the JSON
// fails `next build` (and the unit tests) instead of rendering bad content.

function fail(path: string, msg: string): never {
  throw new Error(`Invalid content at ${path}: ${msg}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.trim() === "") fail(path, "expected non-empty string");
  return v;
}

function arr(v: unknown, path: string, min = 1): unknown[] {
  if (!Array.isArray(v) || v.length < min) fail(path, `expected array with at least ${min} item(s)`);
  return v;
}

function uniqueSlugs<T extends { slug: string }>(items: T[], path: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) fail(path, `bad slug "${item.slug}"`);
    if (seen.has(item.slug)) fail(path, `duplicate slug "${item.slug}"`);
    seen.add(item.slug);
  }
  return items;
}

function question(v: unknown, path: string): QuizQuestion {
  if (!isObject(v)) fail(path, "expected object");
  const options = arr(v.options, `${path}.options`, 4).map((o, i) => str(o, `${path}.options[${i}]`));
  if (options.length !== 4) fail(`${path}.options`, "expected exactly 4 options");
  const a = v.answerIndex;
  if (a !== 0 && a !== 1 && a !== 2 && a !== 3) fail(`${path}.answerIndex`, "expected 0-3");
  return {
    question: str(v.question, `${path}.question`),
    options: [options[0], options[1], options[2], options[3]],
    answerIndex: a,
  };
}

function lesson(v: unknown, path: string): Lesson {
  if (!isObject(v)) fail(path, "expected object");
  return {
    slug: str(v.slug, `${path}.slug`),
    title: str(v.title, `${path}.title`),
    sections: arr(v.sections, `${path}.sections`).map((s, i) => {
      const p = `${path}.sections[${i}]`;
      if (!isObject(s)) fail(p, "expected object");
      return { heading: str(s.heading, `${p}.heading`), body: str(s.body, `${p}.body`) };
    }),
    keyFacts: arr(v.keyFacts, `${path}.keyFacts`).map((f, i) => str(f, `${path}.keyFacts[${i}]`)),
    quiz: arr(v.quiz, `${path}.quiz`, 3).map((q, i) => question(q, `${path}.quiz[${i}]`)),
  };
}

function topic(v: unknown, path: string): Topic {
  if (!isObject(v)) fail(path, "expected object");
  const kind = TOPIC_KINDS.find((k) => k === v.kind);
  if (!kind) fail(`${path}.kind`, `expected one of ${TOPIC_KINDS.join(", ")}`);
  return {
    slug: str(v.slug, `${path}.slug`),
    title: str(v.title, `${path}.title`),
    kind,
    summary: str(v.summary, `${path}.summary`),
    lessons: uniqueSlugs(
      arr(v.lessons, `${path}.lessons`).map((l, i) => lesson(l, `${path}.lessons[${i}]`)),
      `${path}.lessons`,
    ),
  };
}

export function parseDisciplines(data: unknown): Discipline[] {
  return uniqueSlugs(
    arr(data, "disciplines").map((d, i) => {
      const path = `disciplines[${i}]`;
      if (!isObject(d)) fail(path, "expected object");
      return {
        slug: str(d.slug, `${path}.slug`),
        title: str(d.title, `${path}.title`),
        description: str(d.description, `${path}.description`),
        topics: uniqueSlugs(
          arr(d.topics, `${path}.topics`).map((t, j) => topic(t, `${path}.topics[${j}]`)),
          `${path}.topics`,
        ),
      };
    }),
    "disciplines",
  );
}

export const disciplines: Discipline[] = parseDisciplines(raw);

export function getDiscipline(slug: string): Discipline | undefined {
  return disciplines.find((d) => d.slug === slug);
}

export function getTopic(disciplineSlug: string, topicSlug: string): Topic | undefined {
  return getDiscipline(disciplineSlug)?.topics.find((t) => t.slug === topicSlug);
}

export function getLesson(
  disciplineSlug: string,
  topicSlug: string,
  lessonSlug: string,
): Lesson | undefined {
  return getTopic(disciplineSlug, topicSlug)?.lessons.find((l) => l.slug === lessonSlug);
}

export type { Discipline, Lesson, LessonSection, QuizQuestion, Topic, TopicKind } from "./schema";
