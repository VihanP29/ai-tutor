import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CURRICULUM } from "../lib/curriculum.mjs";
import { applyAssessment, createSession, replyToLearner } from "../lib/tutor.mjs";

async function stateFixture() {
  return JSON.parse(await readFile(new URL("../data/learner-state.json", import.meta.url), "utf8"));
}

test("offline tutor returns a guided next question", async () => {
  const state = await stateFixture();
  const lesson = CURRICULUM.find((item) => item.id === "pagination-boundaries");
  const session = createSession(lesson, 30);
  session.messages.push({ role: "user", content: "I would reject page zero because the offset becomes negative." });
  const reply = await replyToLearner(state, session, session.messages.at(-1).content);
  assert.equal(reply.mode, "offline");
  assert.match(reply.text, /what breaks|assumption/i);
});

test("applying assessment updates mastery, history, and clears the active session", async () => {
  const state = await stateFixture();
  const lesson = CURRICULUM.find((item) => item.id === "pagination-boundaries");
  const session = createSession(lesson, 30);
  state.activeSession = session;
  const before = state.mastery.pagination_validation.score;
  const result = applyAssessment(state, session, {
    scoreDelta: 0.12,
    status: "developing",
    summary: "Explained validation boundaries.",
    demonstrated: ["Separated invalid input from empty results"],
    needsWork: ["Add tests"],
    nextStep: "Practice database query behavior next.",
  });

  assert.equal(result.state.activeSession, null);
  assert.equal(result.state.mastery.pagination_validation.score, before + 0.12);
  assert.equal(result.state.history.at(-1).lessonId, "pagination-boundaries");
  assert.notEqual(result.state.recommendation.lessonId, "backend-request-flow");
});
