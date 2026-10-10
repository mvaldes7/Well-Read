export const TOPIC_KINDS = ["person", "event", "era", "style"] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

export interface LessonSection {
  heading: string;
  body: string;
}

export interface QuizQuestion {
  question: string;
  /** Exactly four options. */
  options: [string, string, string, string];
  /** Index (0-3) of the correct option. */
  answerIndex: 0 | 1 | 2 | 3;
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
}

export interface Topic {
  slug: string;
  title: string;
  kind: TopicKind;
  summary: string;
  lessons: Lesson[];
}

export interface Discipline {
  slug: string;
  title: string;
  description: string;
  topics: Topic[];
}
