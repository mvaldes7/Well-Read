"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitQuiz, type QuizState } from "@/lib/quiz/actions";
import { saveMessage } from "@/lib/progress/logic.mjs";

/** Client-safe question: no answerIndex is ever sent to the browser before submit. */
export interface PublicQuestion {
  question: string;
  options: string[];
}

interface Props {
  lessonId: string;
  questions: PublicQuestion[];
}

export default function Quiz(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <QuizAttempt key={attempt} {...props} onRetry={() => setAttempt((a) => a + 1)} />;
}

function QuizAttempt({ lessonId, questions, onRetry }: Props & { onRetry: () => void }) {
  const [state, dispatch, pending] = useActionState<QuizState, unknown>(submitQuiz, { status: "idle" });
  const [, startTransition] = useTransition();
  const [missing, setMissing] = useState(false);
  const router = useRouter();
  const savedNow = state.status === "graded" && state.save === "saved";

  // After a saved attempt, re-render server components so the completion status updates.
  useEffect(() => {
    if (savedNow) router.refresh();
  }, [savedNow, router]);

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
        <p role="status" className={`score ${state.passed ? "pass" : "fail"}`}>
          <strong>
            {state.score}/{state.total}
          </strong>
          {state.passed ? "Passed – lesson complete." : "Not passed – you need 70% to complete this lesson."}
        </p>
        <p className={`save ${state.save === "failed" ? "error" : "muted"}`}>{saveMessage(state.save, state.passed)}</p>
        <ol>
          {state.questions.map((r, i) => (
            <li key={i}>
              <p className="q">
                {i + 1}. {questions[i]?.question}
              </p>
              <p className={r.correct ? "right" : "wrong"}>
                Your answer: {questions[i]?.options[r.chosenIndex]}{" "}
                <span aria-hidden="true">{r.correct ? "✓" : "✗"}</span>
                <span className="visually-hidden">{r.correct ? "(correct)" : "(incorrect)"}</span>
              </p>
              {!r.correct && <p>Correct answer: {questions[i]?.options[r.correctIndex]}</p>}
            </li>
          ))}
        </ol>
        {/* Always offer another attempt; a pass is never downgraded by a retake. */}
        <div className="actions">
          <button type="button" className="btn submit" onClick={onRetry}>
            {state.passed ? "Retake quiz" : "Retry quiz"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="quiz-form" aria-describedby="quiz-help">
      <p id="quiz-help" className="quiz-help">
        Answer all {questions.length} questions. You need 70% to complete the lesson.
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
