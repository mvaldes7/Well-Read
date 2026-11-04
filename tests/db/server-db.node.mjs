// Run by scripts/test-db-local.sh (node --conditions=react-server) against the THROWAWAY cluster only:
// connects over the temp Unix socket as drilldown_server and drives server-db.mjs's real reserve/saveLesson.
import assert from "node:assert/strict";
import postgres from "postgres";
import { drilldownDbFor } from "../../src/lib/drilldowns/server-db.mjs";
import { splitLesson } from "../../src/lib/drilldowns/service.mjs";

const host = process.env.WR_TEST_PG_SOCKET;
if (!host || !host.startsWith("/")) throw new Error("WR_TEST_PG_SOCKET (temp socket dir) required");
const as = (user) => postgres({ host, user, database: "postgres", max: 1, prepare: false, onnotice: () => {} });
const admin = as("postgres");
const server = as("drilldown_server");
const db = drilldownDbFor(server);
const U = "00000000-0000-0000-0000-0000000000e1";
const U2 = "00000000-0000-0000-0000-0000000000e2";
try {
  await admin`insert into auth.users values (${U}, now()), (${U2}, null)`;
  const g = (id) => ({
    id, slug: "robespierre", title: "Robespierre",
    sections: [1, 2, 3, 4].map((i) => ({ heading: `H${i}`, body: `B${i}` })), keyFacts: ["a", "b", "c", "d", "e", "f"],
    quiz: [1, 2, 3, 4, 5, 6].map((i) => ({ question: `Q${i}?`, options: ["a", "b", "c", "d"], answerIndex: i % 4, explanation: `E${i}` })),
  });
  const save = (id, reviewStatus, claims = []) => {
    const { lesson, answers, explanations } = splitLesson(g(id));
    return db.saveLesson({ userId: U, id, parentLessonId: "les_fr02", choiceId: "robespierre", promptVersion: "p1b-2-grounded",
      model: "gemini-3.1-flash-lite", reviewStatus, lesson, sources: [{ url: "https://chnm.org/x", title: "T", publisher: "P" }],
      citations: { facts: ["S1"], quiz: ["S1"] }, unconfirmedClaims: claims, answers, explanations });
  };
  await db.reserve(U, 0, true);
  await db.reserve(U, 2, false);
  await save("gen_nodetest01", "pending");
  const [row] = await admin`select jsonb_typeof(lesson) l, jsonb_typeof(sources) s, jsonb_typeof(citations) c, jsonb_typeof(unconfirmed_claims) u,
      review_status, created_by::text, lesson->'quiz'->0 ? 'answerIndex' has_answer from public.generated_lessons where id = 'gen_nodetest01'`;
  assert.deepEqual({ ...row }, { l: "object", s: "array", c: "object", u: "array", review_status: "pending", created_by: U, has_answer: false });
  const [key] = await admin`select jsonb_typeof(answers) a, answers->>0 a0, explanations->>5 e5 from public.generated_quiz_keys where lesson_id = 'gen_nodetest01'`;
  assert.deepEqual({ ...key }, { a: "array", a0: "1", e5: "E6" });
  await db.reserve(U, 0, true);
  await save("gen_nodetest02", "flagged", [{ ref: "fact1", claim: "x", reason: "y" }]);
  // Per-user cap (2 lessons) and no reservation left -> WR429; unverified email -> WR403.
  await assert.rejects(db.reserve(U, 0, true), (e) => e.code === "WR429" && /user_cap/.test(e.message));
  await assert.rejects(save("gen_nodetest03", "rejected"), (e) => e.code === "WR429" && /no reservation/.test(e.message));
  await assert.rejects(db.reserve(U2, 0, true), (e) => e.code === "WR403");
  // drilldown_server still has no table access.
  await assert.rejects(server`select id from public.generated_lessons`, (e) => e.code === "42501");
  const [usage] = await admin`select lessons, calls from public.drilldown_usage_user where user_id = ${U}`;
  assert.deepEqual({ ...usage }, { lessons: 2, calls: 2 });
  // P4 (20261104214500): fact_check jsonb round-trip, owner gate and actions through postgres.js.
  await db.saveFactCheck(U, "gen_nodetest01", [{ ref: "fact1", supported: true }, { ref: "quiz3", supported: false, note: "n" }]);
  await assert.rejects(db.reviewQueue(U), (e) => e.code === "WR403");
  await admin`delete from public.drilldown_owner`;
  await admin`insert into public.drilldown_owner (user_id) values (${U})`;
  const q = await db.reviewQueue(U);
  const mine = q.find((r) => r.id === "gen_nodetest01");
  assert.equal(Array.isArray(mine.fact_check) && mine.fact_check[1].note, "n");
  assert.equal(Array.isArray(mine.open_reports), true);
  assert.equal(await db.reviewAction(U, "gen_nodetest01", "publish"), "published");
  assert.equal(await db.reviewAction(U, "gen_nodetest02", "reject"), "rejected");
  await assert.rejects(db.reviewAction(U2, "gen_nodetest01", "reject"), (e) => e.code === "WR403");
  console.log("server-db.node.mjs: reserve + save via postgres.js as drilldown_server OK (jsonb stored as objects/arrays)");
} finally {
  await server.end(); await admin.end();
}
