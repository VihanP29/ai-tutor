import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../lib/state-store.mjs";

test("StateStore serializes concurrent updates without losing data", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-tutor-store-"));
  const filePath = path.join(directory, "state.json");
  await writeFile(filePath, JSON.stringify({ count: 0 }), "utf8");
  const store = new StateStore(filePath);

  await Promise.all(Array.from({ length: 8 }, () => store.update((state) => ({ ...state, count: state.count + 1 }))));
  const saved = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(saved.count, 8);
  assert.ok(saved.updatedAt);
  await rm(directory, { recursive: true });
});
