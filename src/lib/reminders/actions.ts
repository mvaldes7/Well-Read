"use server";

import { createClient } from "@/lib/supabase/server";
import { parseSubscription, reminderConfig } from "./logic.mjs";

// Server Actions enforce same-origin CSRF protection. Never accept a user id from the browser.
export async function setLessonReminder(enabled: boolean, raw?: unknown): Promise<{ error?: string }> {
  if (typeof enabled !== "boolean") return { error: "Invalid reminder setting." };
  const sub = enabled ? parseSubscription(raw) : null;
  if (enabled && (!reminderConfig(process.env) || !sub)) return { error: "Reminders aren't available yet." };
  const supabase = await createClient();
  if (!supabase) return { error: "Accounts aren't configured." };
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !userId) return { error: "Sign in again to change reminders." };
  // Off works even with the feature flag/config removed; it stops reminders account-wide.
  const result = enabled && sub
    ? await supabase.from("lesson_reminder_settings").upsert({ user_id: userId, enabled: true, ...sub, updated_at: new Date().toISOString() })
    : await supabase.from("lesson_reminder_settings").update({ enabled: false }).eq("user_id", userId);
  return result.error ? { error: "Couldn't save your reminder setting. Please try again." } : {};
}
