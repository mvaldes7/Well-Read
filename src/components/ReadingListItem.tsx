"use client";

import { useActionState, useRef } from "react";
import { deleteItem, moveItem, type ItemActionState } from "@/lib/reading-list/actions";
import { STATUSES, kindLabel, moveTargets, safeHref, type Item } from "@/lib/reading-list/logic.mjs";

const idle: ItemActionState = { status: "idle" };

export default function ReadingListItem({ item }: { item: Item }) {
  const [moveState, moveAction, moving] = useActionState(moveItem, idle);
  const [delState, delAction, deleting] = useActionState(deleteItem, idle);
  const dialog = useRef<HTMLDialogElement>(null);
  const href = safeHref(item.url);
  const titleId = `rl-item-${item.id}`;
  const error = (moveState.status === "error" && moveState.message) || (delState.status === "error" && delState.message) || "";

  return (
    <li className="rl-item" aria-labelledby={titleId} aria-busy={moving || deleting || undefined}>
      <div className="rl-item-main">
        <span className="rl-kind-tag">{kindLabel(item.kind)}</span>
        <span id={titleId} className="rl-item-title">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {item.title}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          ) : (
            item.title
          )}
        </span>
      </div>
      <div className="rl-item-actions">
        <form action={moveAction} className="rl-move">
          <input type="hidden" name="id" value={item.id} />
          {moveTargets(item.status).map((to) => {
            const s = STATUSES.find((x) => x.value === to)!;
            return (
              <button key={to} type="submit" name="to" value={to} className="rl-btn" disabled={moving || deleting} aria-describedby={titleId}>
                {s.moveLabel}
              </button>
            );
          })}
        </form>
        <button type="button" className="rl-btn rl-delete" aria-haspopup="dialog" aria-describedby={titleId} disabled={deleting} onClick={() => dialog.current?.showModal()}>
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="rl-item-error error">
          {error}
        </p>
      )}
      {/* Native modal dialog: focus moves in, Esc / Cancel closes and focus returns to Delete. */}
      <dialog ref={dialog} className="rl-dialog" aria-labelledby={`${titleId}-dh`} aria-describedby={`${titleId}-dd`}>
        <h2 id={`${titleId}-dh`}>Delete this item?</h2>
        <p id={`${titleId}-dd`}>
          “{item.title}” will be removed from your reading list. This can’t be undone.
        </p>
        <form action={delAction} onSubmit={() => dialog.current?.close()} className="rl-dialog-actions">
          <input type="hidden" name="id" value={item.id} />
          <button type="button" className="rl-btn" autoFocus onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn rl-confirm-delete">
            Delete
          </button>
        </form>
      </dialog>
    </li>
  );
}
