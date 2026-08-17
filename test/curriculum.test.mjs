import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectLesson } from "../lib/curriculum.mjs";

async function seedState() {
  return JSON.parse(await readFile(new URL("../data/learner-state.json", import.meta.url), "utf8"));
}

test("the seeded recommendation selects pagination boundary cases", async () => {
  const state = await seedState();
  const lesson = selectLesson(state);
  assert.equal(lesson.id, "pagination-boundaries");
  assert.match(lesson.reason, /backend debugging foundation/i);
});

test("a requested track stays within that track", async () => {
  const state = await seedState();
  const lesson = selectLesson(state, { track: "ml", duration: 30 });
  assert.equal(lesson.track, "ml");
});

test("recent lessons are penalized when no explicit recommendation wins", async () => {
  const state = await seedState();
  state.recommendation = { lessonId: "missing", reason: "" };
  state.history.push({ lessonId: "hashmap-patterns" });
  const lesson = selectLesson(state, { track: "dsa", duration: 25 });
  assert.notEqual(lesson.id, "hashmap-patterns");
});
