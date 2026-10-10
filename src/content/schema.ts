import { DISCIPLINE_COLORS } from "./colors.mjs";

export const TOPIC_KINDS = ["person", "event", "era", "style"] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

export interface LessonSection {
  heading: string;
  /** Plain text; paragraphs are separated by a blank line ("\n\n"). */
  body: string;
}

export interface QuizQuestion {
  question: string;
  /** Exactly four options. */
  options: [string, string, string, string];
  /** Index (0-3) of the correct option. */
  answerIndex: 0 | 1 | 2 | 3;
  /** Why the answer is right. Required. Server-only until the quiz is graded (never sent before submit). */
  explanation: string;
}

/** A reference shown under a lesson. `url` must be a valid https URL, unique within the lesson. */
export interface LessonSource {
  publisher: string;
  title: string;
  url: string;
  note?: string;
}

export interface Lesson {
  /** Permanent id (e.g. `les_rr01`). Never derived from the slug, never reused; completions are keyed on it. */
  id: string;
  /** URL segment; may change without affecting saved progress. */
  slug: string;
  title: string;
  sections: LessonSection[];
  keyFacts: string[];
  quiz: QuizQuestion[];
  /** Optional, ordered; rendered as the lesson's "Sources" list. */
  sources?: LessonSource[];
}

export interface Topic {
  slug: string;
  title: string;
  kind: TopicKind;
  summary: string;
  lessons: Lesson[];
}

export { DISCIPLINE_COLORS };
/** Named cover-color token; mapped to real colors only in globals.css (`.cover-<token>`). */
export type DisciplineColor = (typeof DISCIPLINE_COLORS)[number];

export interface Discipline {
  slug: string;
  title: string;
  description: string;
  color: DisciplineColor;
  topics: Topic[];
}
