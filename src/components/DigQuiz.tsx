"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitDigQuiz, type DigQuizState } from "@/lib/drilldowns/quiz-actions";
import { digSaveMessage } from "@/lib/drilldowns/dig-quiz.mjs";
import type { PublicQuestion } from "@/lib/quiz/public.mjs";

interface Props {
  lessonId: string;
  /** Question text and options only; answers and explanations stay on the server until grading. */
  questions: PublicQuestion[];
}

/** Quiz on a Dig deeper lesson. Same flow as the lesson quiz, graded by submitDigQuiz. No Dig deeper choices here. */
export default function DigQuiz(props: Props) {
  const [attempt, setAttempt] = useState(0);
  // Same reopen fix as Quiz.tsx: start a fresh attempt when the route is hidden by <Activity>.
  useEffect(() => () => setAttempt((a) => a + 1), []);
  return <DigQuizAttempt key={attempt} {...props} onRetry={() => setAttempt((a) => a + 1)} />;
}

function DigQuizAttempt({ lessonId, questions, onRetry }: Props & { onRetry: () => void }) {
  const [state, dispatch, pending] = useActionState<DigQuizState, unknown>(submitDigQuiz, { status: "idle" });
  const [, startTransition] = useTransition();
  const [missing, setMissing] = useState(false);
  const router = useRouter();
  const savedNow = state.status === "graded" && state.save === "saved";

  useEffect(() => {
    if (savedNow) router.refresh();
  }, [savedNow, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (questions.some((_, i) => form.get(`q${i}`) === null)) {
      setMissing(true);
      return;
    }
    setMissing(false);
    const answers = questions.map((_, i) => Number(form.get(`q${i}`)));
    startTransition(() => dispatch({ lessonId, answers }));
  }

  if (state.status === "graded") {
    return (
      <div className="quiz-result">
        <p role="status" className={`score ${state.passed ? "pass" : "fail"}`}>
          <strong>
            {state.score}/{state.total}
          </strong>
          {state.passed ? "Passed." : "Not passed – you need 70% to pass this quiz."}
        </p>
        <p className={`save ${state.save === "failed" ? "error" : "muted"}`}>{digSaveMessage(state.save, state.passed)}</p>
        <ol>
          {state.questions.map((r, i) => (
            <li key={i}>
              <p className="q">
                {i + 1}. {questions[i]?.question}
              </p>
              <p className={r.correct ? "right" : "wrong"}>
                Your answer: {questions[i]?.options[r.chosenIndex]} {r.correct ? "(correct)" : "(incorrect)"}
              </p>
              {!r.correct && <p>Correct answer: {questions[i]?.options[r.correctIndex]}</p>}
              {r.explanation && (
                <p className="explain">
                  <span className="explain-label">Why: </span>
                  {r.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>
        <div className="actions">
          <button type="button" className="btn submit" onClick={onRetry}>
            {state.passed ? "Retake quiz" : "Retry quiz"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="quiz-form" aria-describedby="dig-quiz-help">
      <p id="dig-quiz-help" className="quiz-help">
        Answer all {questions.length} questions. You need 70% to pass. Dig deeper quizzes don&apos;t count toward mastery or
        achievements.
      </p>
      {questions.map((q, i) => (
        <fieldset key={i}>
          <legend>
            <span className="qno">
              Question {i + 1} of {questions.length}
            </span>
            {q.question}
          </legend>
          <div className="opts">
            {q.options.map((option, j) => (
              <label key={j}>
                <input type="radio" name={`q${i}`} value={j} required /> {option}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {(missing || state.status === "error") && (
        <p role="alert" className="error form-error">
          {missing ? "Answer every question before submitting." : state.status === "error" ? state.error : null}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn submit" disabled={pending}>
          {pending ? "Checking…" : "Submit"}
        </button>
      </div>
    </form>
  );
}
