import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addUserMemoryNote,
  applyMemoryAssessment,
  createProfileSync,
  ensureLearnerState,
  removeUserMemoryNote,
} from "../lib/learner-memory.mjs";
import { createSession } from "../lib/tutor.mjs";
import { CURRICULUM } from "../lib/curriculum.mjs";

async function stateFixture() {
  return JSON.parse(await readFile(new URL("../data/learner-state.json", import.meta.url), "utf8"));
}

test("legacy mastery is migrated into dimension-aware learner memory", () => {
  const state = {
    version: 1,
    profile: { preferences: {} },
    mastery: { caching: { score: 0.42, status: "developing" } },
  };

  ensureLearnerState(state);

  assert.equal(state.version, 2);
  assert.equal(state.mastery.caching.dimensions.conceptual, 0.42);
  assert.equal(state.learningMemory.userNotes.length, 0);
  assert.equal(state.profile.preferences.defaultDuration, 30);
});

test("assessment updates only evidenced dimensions and durable observations", async () => {
  const state = await stateFixture();
  const lesson = CURRICULUM.find((item) => item.id === "gradient-mechanics");
  const session = createSession(lesson, 30);
  const mathematicalBefore = state.mastery.gradient_descent.dimensions.mathematical;

  const result = applyMemoryAssessment(state, session, {
    summary: "Explained the direction of a gradient update.",
    dimensionUpdates: [
      { dimension: "conceptual", delta: 0.04, evidence: "Explained derivative sign." },
      { dimension: "reasoning", delta: 0.03, evidence: "Predicted the next direction." },
    ],
    newStrengths: ["Connects derivative sign to movement direction"],
    newStruggles: ["Needs practice calculating derivative magnitude"],
    misconceptions: ["Initially treated the derivative as the new parameter value"],
  });

  assert.equal(result.afterDimensions.mathematical, mathematicalBefore);
  assert.equal(result.afterDimensions.conceptual, 0.82);
  assert.match(state.mastery.gradient_descent.evidence.at(-2), /Reasoning:/);
  assert.match(state.learningMemory.recentStrengths.at(-1).text, /derivative sign/i);
  assert.match(state.learningMemory.currentStruggles.at(-1).text, /Misconception to revisit/i);
});

test("user notes are controlled and profile sync remains explicit", async () => {
  const state = await stateFixture();
  const note = addUserMemoryNote(state, "Use my operating systems class when an analogy fits.");
  const sync = createProfileSync(state);

  assert.match(sync, /AI Tutor profile sync for Vihan/);
  assert.match(sync, /operating systems class/);
  assert.match(sync, /AI-assisted implementation/);
  assert.equal(removeUserMemoryNote(state, note.id), true);
  assert.equal(state.learningMemory.userNotes.some((item) => item.id === note.id), false);
});
