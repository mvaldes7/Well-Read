"use server";

import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { drilldownsEnabled } from "./config.mjs";
import { REPORT_MESSAGES, reportErrorMessage, validateReport } from "./report-logic.mjs";

export interface ReportState {
  status: "idle" | "done" | "error";
  message?: string;
}

/** Insert a report for a visible generated lesson. Deliberately no select after the insert (lesson_reports has column grants). */
export async function reportLesson(_prev: ReportState, formData: FormData): Promise<ReportState> {
  if (!drilldownsEnabled(process.env)) return { status: "error", message: REPORT_MESSAGES.disabled };
  const row = validateReport(formData.get("lessonId"), formData.get("reason"));
  if (!row) return { status: "error", message: REPORT_MESSAGES.invalid };
  try {
    const supabase = await createClient();
    if (!supabase) return { status: "error", message: REPORT_MESSAGES.failed };
    const { data, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || !data?.claims?.sub) return { status: "error", message: REPORT_MESSAGES.signedOut };
    const { error } = await supabase.from("lesson_reports").insert(row);
    if (error && error.code !== "23505") console.error(`lesson_reports insert failed (${error.code ?? "unknown"})`);
    return { status: !error || error.code === "23505" ? "done" : "error", message: reportErrorMessage(error) };
  } catch (err) {
    unstable_rethrow(err);
    return { status: "error", message: REPORT_MESSAGES.failed };
  }
}
