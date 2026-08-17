import { randomUUID } from "node:crypto";

export const DIMENSIONS = {
  conceptual: "Conceptual",
  reasoning: "Reasoning",
  application: "Application",
  mathematical: "Mathematical",
};

function clampScore(value) {
  const clamped = Math.min(0.98, Math.max(0, Number(value) || 0));
  return Math.round(clamped * 10_000) / 10_000;
}

function statusFor(score) {
  if (score >= 0.78) return "comfortable";
  if (score >= 0.38) return "developing";
  return score > 0.08 ? "needs-work" : "unseen";
}

export function normalizeMasteryEntry(entry = {}) {
  const fallback = Number(entry.score || 0);
  const dimensions = entry.dimensions && Object.keys(entry.dimensions).length
    ? Object.fromEntries(Object.entries(entry.dimensions).map(([key, value]) => [key, clampScore(value)]))
    : fallback > 0
      ? { conceptual: clampScore(fallback) }
      : {};
  const values = Object.values(dimensions);
  const score = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  return { ...entry, dimensions, score: clampScore(score), status: entry.status || statusFor(score), evidence: entry.evidence || [] };
}

export function ensureLearnerState(state) {
  state.version = Math.max(2, state.version || 1);
  state.profile.preferences ||= {};
  state.profile.preferences.defaultDuration ||= 30;
  state.mastery = Object.fromEntries(Object.entries(state.mastery || {}).map(([id, entry]) => [id, normalizeMasteryEntry(entry)]));
  state.learningMemory ||= {};
  state.learningMemory.currentContext ||= "SWE internship recruiting is the current priority; DS&A is active and ML remains a side-learning track.";
  state.learningMemory.userNotes ||= [];
  state.learningMemory.recentStrengths ||= [];
  state.learningMemory.currentStruggles ||= [];
  state.learningMemory.tutorObservations ||= [];
  state.learningMemory.lastProfileSyncAt ||= null;
  return state;
}

function mergeMemory(items, additions, session, limit = 8) {
  const merged = [...items];
  for (const text of additions || []) {
    const clean = String(text).trim();
    if (!clean) continue;
    const existing = merged.findIndex((item) => item.text.toLowerCase() === clean.toLowerCase());
    const value = {
      id: existing >= 0 ? merged[existing].id : randomUUID(),
      text: clean,
      conceptId: session.lesson.conceptId,
      sourceSessionId: session.id,
      observedAt: new Date().toISOString(),
    };
    if (existing >= 0) merged.splice(existing, 1);
    merged.push(value);
  }
  return merged.slice(-limit);
}

export function addUserMemoryNote(state, text) {
  ensureLearnerState(state);
  const note = { id: randomUUID(), text: String(text).trim(), createdAt: new Date().toISOString() };
  state.learningMemory.userNotes.push(note);
  state.learningMemory.userNotes = state.learningMemory.userNotes.slice(-12);
  return note;
}

export function removeUserMemoryNote(state, noteId) {
  ensureLearnerState(state);
  const before = state.learningMemory.userNotes.length;
  state.learningMemory.userNotes = state.learningMemory.userNotes.filter((note) => note.id !== noteId);
  return before !== state.learningMemory.userNotes.length;
}

export function applyMemoryAssessment(state, session, assessment) {
  ensureLearnerState(state);
  const conceptId = session.lesson.conceptId;
  const current = normalizeMasteryEntry(state.mastery[conceptId]);
  const beforeDimensions = { ...current.dimensions };
  const evidence = [...current.evidence];

  for (const update of assessment.dimensionUpdates || []) {
    if (!(update.dimension in DIMENSIONS)) continue;
    const baseline = current.dimensions[update.dimension] ?? Math.max(0.08, current.score * 0.7);
    current.dimensions[update.dimension] = clampScore(baseline + update.delta);
    if (update.evidence) evidence.push(`${DIMENSIONS[update.dimension]}: ${update.evidence}`);
  }

  const values = Object.values(current.dimensions);
  current.score = clampScore(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : current.score);
  current.status = statusFor(current.score);
  current.lastPracticed = new Date().toISOString();
  current.evidence = [...evidence, assessment.summary].slice(-8);
  state.mastery[conceptId] = current;

  state.learningMemory.recentStrengths = mergeMemory(
    state.learningMemory.recentStrengths,
    assessment.newStrengths,
    session,
  );
  state.learningMemory.currentStruggles = mergeMemory(
    state.learningMemory.currentStruggles,
    [...(assessment.newStruggles || []), ...(assessment.misconceptions || []).map((item) => `Misconception to revisit: ${item}`)],
    session,
  );

  return { beforeDimensions, afterDimensions: { ...current.dimensions }, score: current.score, status: current.status };
}

export function createProfileSync(state) {
  ensureLearnerState(state);
  const strongConcepts = Object.entries(state.mastery)
    .filter(([, entry]) => entry.score >= 0.6)
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 6)
    .map(([id, entry]) => `${id.replaceAll("_", " ")}: ${Math.round(entry.score * 100)}% confidence`);
  const developingConcepts = Object.entries(state.mastery)
    .filter(([, entry]) => entry.score < 0.45)
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, 6)
    .map(([id, entry]) => `${id.replaceAll("_", " ")}: ${Math.round(entry.score * 100)}% confidence`);
  const notes = state.learningMemory.userNotes.map((item) => `- ${item.text}`).join("\n") || "- None added";
  const strengths = state.learningMemory.recentStrengths.map((item) => `- ${item.text}`).join("\n") || "- No recent evidence yet";
  const struggles = state.learningMemory.currentStruggles.map((item) => `- ${item.text}`).join("\n") || "- No recent evidence yet";

  return `# AI Tutor profile sync for ${state.profile.name}

## Stable goal
${state.profile.primaryGoal}

## Current context
${state.learningMemory.currentContext}

## Learning contract
${state.profile.preferences.teachingStyle.map((item) => `- ${item}`).join("\n")}
- Approximate building/theory preference: ${state.profile.preferences.theoryBuildRatio.building}/${state.profile.preferences.theoryBuildRatio.theory}

## Notes I explicitly asked the tutor to remember
${notes}

## Recently demonstrated strengths
${strengths}

## Current struggles or gaps exposed in lessons
${struggles}

## Stronger concepts
${strongConcepts.map((item) => `- ${item}`).join("\n") || "- Still calibrating"}

## Concepts needing development
${developingConcepts.map((item) => `- ${item}`).join("\n") || "- Still calibrating"}

## Current recommendation
${state.recommendation?.reason || "Choose the next lesson from current evidence and goals."}

This summary distinguishes demonstrated understanding from résumé exposure and AI-assisted implementation. Use it as learning context, not as a claim of mastery.`;
}
