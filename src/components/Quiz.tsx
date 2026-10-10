"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { submitQuiz, type QuizState } from "@/lib/quiz/actions";

/** Client-safe question: no answerIndex is ever sent to the browser before submit. */
export interface PublicQuestion {
  question: string;
  options: string[];
}

interface Props {
  lessonId: string;
  questions: PublicQuestion[];
}

const SAVE_MESSAGES = {
  saved: "Progress saved.",
  kept: "Progress saved earlier; your best result is kept.",
  failed: "Your result couldn't be saved, so this attempt won't count toward your progress yet. Please try again later.",
} as const;

export default function Quiz(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <QuizAttempt key={attempt} {...props} onRetry={() => setAttempt((a) => a + 1)} />;
}

function QuizAttempt({ lessonId, questions, onRetry }: Props & { onRetry: () => void }) {
  const [state, dispatch, pending] = useActionState<QuizState, unknown>(submitQuiz, { status: "idle" });
  const [, startTransition] = useTransition();
  const [missing, setMissing] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const answers = questions.map((_, i) => Number(form.get(`q${i}`)));
    if (questions.some((_, i) => form.get(`q${i}`) === null)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    startTransition(() => dispatch({ lessonId, answers }));
  }

  if (state.status === "graded") {
    return (
      <div className="quiz-result">
        <p role="status" className={state.passed ? "pass" : "fail"}>
          <strong>
            {state.score}/{state.total} – {state.passed ? "Passed" : "Not passed"}
          </strong>{" "}
          {state.passed ? "Lesson complete." : "You need 70% to complete this lesson."}
        </p>
        <p className={state.save === "failed" ? "error" : "muted"}>{SAVE_MESSAGES[state.save]}</p>
        <ol>
          {state.questions.map((r, i) => (
            <li key={i}>
              <p>{questions[i]?.question}</p>
              <p>
                Your answer: {questions[i]?.options[r.chosenIndex]} {r.correct ? "✓" : "✗"}
              </p>
              {!r.correct && <p>Correct answer: {questions[i]?.options[r.correctIndex]}</p>}
            </li>
          ))}
        </ol>
        {!state.passed && (
          <button type="button" onClick={onRetry}>
            Retry quiz
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="quiz-form" aria-describedby="quiz-help">
      <p id="quiz-help" className="muted">
        Answer all {questions.length} questions. You need 70% to complete the lesson.
      </p>
      {questions.map((q, i) => (
        <fieldset key={i}>
          <legend>
            {i + 1}. {q.question}
          </legend>
          {q.options.map((option, j) => (
            <label key={j}>
              <input type="radio" name={`q${i}`} value={j} required /> {option}
            </label>
          ))}
        </fieldset>
      ))}
      {(missing || state.status === "error") && (
        <p role="alert" className="error">
          {missing ? "Answer every question before submitting." : state.status === "error" ? state.error : null}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Submit answers"}
      </button>
    </form>
  );
}
