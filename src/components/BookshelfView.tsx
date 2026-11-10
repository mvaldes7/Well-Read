"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  libraryItems,
  libraryTotals,
  packLibraryRows,
  getBookshelfViewServerSnapshot,
  getBookshelfViewSnapshot,
  parseBookshelfView,
  shelfAvailableWidth,
  subscribeBookshelfView,
  volumeLessonLine,
  writeStoredBookshelfView,
} from "@/lib/bookshelf/view.mjs";
import { bookLabel, spineStyle, type Book, type BookshelfGroup } from "@/lib/progress/logic.mjs";
import { toRoman } from "@/lib/ui/roman.mjs";

type BookshelfViewMode = "discipline" | "library";

type Props = {
  groups: BookshelfGroup[];
  descriptions: Record<string, string>;
};

export default function BookshelfView({ groups, descriptions }: Props) {
  const view = useSyncExternalStore(
    subscribeBookshelfView,
    getBookshelfViewSnapshot,
    getBookshelfViewServerSnapshot,
  );
  const [available, setAvailable] = useState<number | null>(null);
  const caseRef = useRef<HTMLDivElement>(null);
  const disciplineBtn = useRef<HTMLButtonElement>(null);
  const libraryBtn = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (view !== "library") return;
    const caseEl = caseRef.current;
    if (!caseEl) return;
    const measure = () => {
      const inner = caseEl.querySelector<HTMLElement>(".case-inner") ?? caseEl;
      setAvailable(shelfAvailableWidth(inner.clientWidth, caseEl.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(caseEl);
    return () => ro.disconnect();
  }, [view]);

  const selectView = (next: BookshelfViewMode) => {
    writeStoredBookshelfView(window.localStorage, parseBookshelfView(next));
  };

  const onToggleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown" && key !== "Home" && key !== "End") {
      return;
    }
    event.preventDefault();
    const next: BookshelfViewMode =
      key === "Home" || key === "ArrowLeft" || key === "ArrowUp" ? "discipline" : "library";
    selectView(next);
    (next === "discipline" ? disciplineBtn : libraryBtn).current?.focus();
  };

  const totals = libraryTotals(groups);
  const items = libraryItems(groups, spineStyle);
  const rows = available == null ? [] : packLibraryRows(items, available);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">The Permanent Collection</p>
        <h1>Bookshelf</h1>
        <p className="dek-discipline" hidden={view !== "discipline"}>
          One volume for each topic where you&apos;ve completed at least one lesson, shelved by discipline.
        </p>
        <p className="dek-library" hidden={view !== "library"}>
          Every completed topic, kept in discipline order, on one continuous set of shelves.
        </p>
        <hr className="rule" />
        <div className="view-toggle" role="group" aria-label="Bookshelf view" onKeyDown={onToggleKeyDown}>
          <button
            ref={disciplineBtn}
            type="button"
            aria-pressed={view === "discipline"}
            onClick={() => selectView("discipline")}
          >
            By discipline
          </button>
          <button
            ref={libraryBtn}
            type="button"
            aria-pressed={view === "library"}
            onClick={() => selectView("library")}
          >
            Whole library
          </button>
        </div>
        <p className="toggle-note">Remembers your last choice on this device.</p>
      </header>

      <div id="view-discipline" hidden={view !== "discipline"}>
        {groups.map((group) => {
          const { slug, title, color } = group.discipline;
          const passed = group.books.reduce((n, b) => n + b.passedCount, 0);
          const gallery = `Gallery ${toRoman(group.position)}`;
          return (
            <section key={slug} className="room" aria-labelledby={`shelf-${slug}`}>
              <div className="walltext">
                <p className="eyebrow brass">{gallery}</p>
                <h2 id={`shelf-${slug}`}>{title}</h2>
                <p>{descriptions[slug] ?? ""}</p>
                <p className="count">{volumeLessonLine(group.books.length, passed)}</p>
              </div>
              <div className="case">
                <div className="case-inner">
                  <ul className={`books cover-${color}`}>
                    {group.books.map((book) => (
                      <BookSpine key={book.topicSlug} book={book} />
                    ))}
                    <Bookend />
                  </ul>
                </div>
                <div className="ledge">
                  <span className="plaque" aria-hidden="true">
                    <small>{gallery} ·</small> {title}
                  </span>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div id="view-library" hidden={view !== "library"}>
        <section className="room room-whole" aria-labelledby="shelf-library">
          <div className="walltext">
            <p className="eyebrow brass">The Collection</p>
            <h2 id="shelf-library">Whole library</h2>
            <p>Every completed topic, kept in discipline order, on one continuous set of shelves.</p>
            <ul className="palette">
              {groups.map((group) => (
                <li key={group.discipline.slug} className={`swatch cover-${group.discipline.color}`}>
                  <i aria-hidden="true" />
                  {group.discipline.title}
                </li>
              ))}
            </ul>
            <p className="count">{totals.line}</p>
          </div>
          <div className="case case-stack" ref={caseRef}>
            {rows.length === 0 ? (
              <div className="bay">
                <div className="case-inner">
                  <ul className="books" />
                </div>
                <div className="ledge" />
              </div>
            ) : (
              rows.map((row, i) => {
                const last = i === rows.length - 1;
                return (
                  <div className="bay" key={`bay-${i}`}>
                    <div className="case-inner">
                      <ul className="books">
                        {row.map((item) => (
                          <BookSpine
                            key={`${item.book.disciplineSlug}/${item.book.topicSlug}`}
                            book={item.book}
                            color={item.color}
                            groupStart={item.groupStart}
                          />
                        ))}
                        {last ? <Bookend /> : null}
                      </ul>
                    </div>
                    <div className="ledge">
                      {last ? (
                        <span className="plaque" aria-hidden="true">
                          The Collection
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <p className="legend">
        Brass tag <b>1/2</b> = lessons completed of lessons in the topic
      </p>
    </>
  );
}

function BookSpine({
  book,
  color,
  groupStart,
}: {
  book: Book;
  color?: string;
  groupStart?: boolean;
}) {
  const s = spineStyle(`${book.disciplineSlug}/${book.topicSlug}`, book.topicTitle);
  return (
    <li className={color ? `cover-${color}` : undefined} data-group-start={groupStart || undefined}>
      <Link
        href={book.href}
        className={`spine shade-${s.shade}`}
        aria-label={bookLabel(book)}
        style={{ "--w": `${s.width}px`, "--h": `${s.height}px`, "--fs": `${s.fontSize}px` } as React.CSSProperties}
      >
        <span className="cap" aria-hidden="true" />
        <span className="t" aria-hidden="true">
          {s.lines.map((line) => (
            <span key={line} className="ln">
              {line}
            </span>
          ))}
        </span>
        <span className="cap b" aria-hidden="true" />
        <span className="tag" aria-hidden="true">
          {book.passedCount}/{book.lessonCount}
        </span>
      </Link>
    </li>
  );
}

function Bookend() {
  return (
    <li aria-hidden="true">
      <span className="bookend" />
    </li>
  );
}
