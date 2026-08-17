import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CURRICULUM } from "../lib/curriculum.mjs";
import { applyAssessment, assessSession, createSession, replyToLearner } from "../lib/tutor.mjs";

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

test("a session keeps temporary pace and request tailoring", () => {
  const lesson = CURRICULUM.find((item) => item.id === "gradient-mechanics");
  const session = createSession(lesson, 20, { pace: "hands-on", request: "Connect this to a tiny calculation." });

  assert.deepEqual(session.tailoring, {
    pace: "hands-on",
    request: "Connect this to a tiny calculation.",
  });
});

test("ending without a learner response does not create mastery evidence", async () => {
  const state = await stateFixture();
  const lesson = CURRICULUM.find((item) => item.id === "pagination-boundaries");
  const session = createSession(lesson, 10);

  const assessment = await assessSession(state, session);

  assert.deepEqual(assessment.dimensionUpdates, []);
  assert.deepEqual(assessment.demonstrated, []);
  assert.equal(assessment.nextAction, "continue");
});

test("offline tutor acknowledges a calibration miss before continuing", async () => {
  const state = await stateFixture();
  const lesson = CURRICULUM.find((item) => item.id === "cache-design");
  const session = createSession(lesson, 30);
  session.messages.push({ role: "user", content: "I never learned caching. That question is not fair." });

  const reply = await replyToLearner(state, session, session.messages.at(-1).content);
  assert.match(reply.text, /calibration correction|backfill/i);
});

test("applying assessment updates mastery, history, and clears the active session", async () => {
  const state = await stateFixture();
  const lesson = CURRICULUM.find((item) => item.id === "pagination-boundaries");
  const session = createSession(lesson, 30);
  state.activeSession = session;
  const result = applyAssessment(state, session, {
    dimensionUpdates: [
      { dimension: "conceptual", delta: 0.12, evidence: "Distinguished invalid input from empty results." },
      { dimension: "reasoning", delta: 0.1, evidence: "Derived the negative-offset failure." },
      { dimension: "application", delta: 0.08, evidence: "Proposed boundary tests." },
    ],
    summary: "Explained validation boundaries.",
    demonstrated: ["Separated invalid input from empty results"],
    needsWork: ["Add tests"],
    misconceptions: [],
    newStrengths: ["Uses the offset formula to derive invalid cases"],
    newStruggles: [],
    nextStep: "Continue with an independent boundary-case explanation.",
    nextAction: "continue",
  });

  assert.equal(result.state.activeSession, null);
  assert.equal(result.state.mastery.pagination_validation.dimensions.conceptual, 0.32);
  assert.equal(result.state.mastery.pagination_validation.dimensions.reasoning, 0.24);
  assert.equal(result.state.mastery.pagination_validation.dimensions.application, 0.22);
  assert.equal(result.state.mastery.pagination_validation.score, 0.26);
  assert.equal(result.state.history.at(-1).lessonId, "pagination-boundaries");
  assert.equal(result.state.history.at(-1).nextAction, "continue");
  assert.equal(result.state.recommendation.lessonId, "pagination-boundaries");
  assert.match(result.state.learningMemory.recentStrengths.at(-1).text, /offset formula/i);
});
