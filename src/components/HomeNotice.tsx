"use client";

import { useSearchParams } from "next/navigation";
import { noticeMessage } from "@/lib/auth/reset.mjs";

/** One-off success notice on / (e.g. ?notice=password_updated); unknown codes render nothing. */
export default function HomeNotice() {
  const message = noticeMessage(useSearchParams().get("notice"));
  if (!message) return null;
  return (
    <p role="status" className="notice flash">
      {message}
    </p>
  );
}
