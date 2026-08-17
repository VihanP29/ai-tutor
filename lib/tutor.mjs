import { createHash, randomUUID } from "node:crypto";
import { selectLesson, TRACKS } from "./curriculum.mjs";
import { applyMemoryAssessment, DIMENSIONS, ensureLearnerState } from "./learner-memory.mjs";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

function learnerContext(state) {
  ensureLearnerState(state);
  const mastery = Object.entries(state.mastery)
    .map(([id, value]) => {
      const dimensions = Object.entries(value.dimensions || {})
        .map(([name, score]) => `${name} ${Math.round(score * 100)}%`)
        .join(", ");
      return `${id}: ${Math.round(value.score * 100)}% (${value.status}${dimensions ? `; ${dimensions}` : ""})`;
    })
    .join("\n");
  const userNotes = state.learningMemory.userNotes.map((item) => item.text).join("; ") || "none";
  const recentStrengths = state.learningMemory.recentStrengths.map((item) => item.text).join("; ") || "still calibrating";
  const currentStruggles = state.learningMemory.currentStruggles.map((item) => item.text).join("; ") || "still calibrating";
  const calibrationNotes = state.learningMemory.tutorObservations.map((item) => item.text).join("; ") || "none";

  return `Learner: ${state.profile.name}
Primary goal: ${state.profile.primaryGoal}
Current context: ${state.learningMemory.currentContext}
Learning preferences: ${state.profile.preferences.teachingStyle.join("; ")}
Stable strengths: ${state.profile.strengths.join("; ")}
Known foundational gaps: ${state.profile.gaps.join("; ")}
User-authored memory notes: ${userNotes}
Recently demonstrated strengths: ${recentStrengths}
Current struggles observed in lessons: ${currentStruggles}
Tutor calibration notes: ${calibrationNotes}
Current mastery estimates:
${mastery}`;
}

function tutorInstructions(state, session) {
  return `You are a personal tutor conducting one focused lesson.

${learnerContext(state)}

Lesson: ${session.lesson.title}
Objective: ${session.lesson.objective}
Format: ${session.lesson.format}
Target duration: ${session.duration} minutes
Session pace: ${session.tailoring?.pace || "balanced"}
Learner's request for this session: ${session.tailoring?.request || "No additional request; follow the learner model."}

Teach through guided struggle. Ask one meaningful question at a time. Calibrate from the learner's actual answer. Do not dump a complete lecture or jump ahead to advanced terminology. Acknowledge correct reasoning specifically, correct misconceptions directly, and connect explanations to the current lesson objective. Prefer intuition, small examples, debugging symptoms, or tiny calculations over definitions. Do not mistake résumé exposure, prior AI-assisted implementation, or vocabulary for mastery. If the learner says a question is unfair or reveals they lack a prerequisite, acknowledge the calibration miss and backfill before continuing. If the lesson is too easy or too advanced, move the level rather than staying on the planned script. Keep each turn compact enough for an interactive session. For a light session, reduce cognitive load without becoming passive; for a hands-on session, reach application sooner. The learner can ask how much time remains; estimate based on transcript progress. When the objective has been demonstrated, say so and suggest finishing the session.`;
}

function extractText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function callOpenAI(body) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      store: false,
      safety_identifier: createHash("sha256").update("ai-tutor-local-single-user").digest("hex").slice(0, 32),
      ...body,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return response.json();
}

export function createSession(lesson, duration, tailoring = {}) {
  return {
    id: randomUUID(),
    lessonId: lesson.id,
    lesson: {
      id: lesson.id,
      conceptId: lesson.conceptId,
      track: lesson.track,
      title: lesson.title,
      objective: lesson.objective,
      format: lesson.format,
      prompts: lesson.prompts,
    },
    duration,
    tailoring: {
      pace: ["light", "balanced", "hands-on"].includes(tailoring.pace) ? tailoring.pace : "balanced",
      request: String(tailoring.request || "").trim().slice(0, 600),
    },
    startedAt: new Date().toISOString(),
    status: "active",
    messages: [{ id: randomUUID(), role: "assistant", content: lesson.opening, createdAt: new Date().toISOString() }],
  };
}

function offlineReply(session, userMessage) {
  const userTurns = session.messages.filter((message) => message.role === "user").length;
  const promptIndex = Math.min(Math.max(userTurns - 1, 0), session.lesson.prompts.length - 1);
  const nextPrompt = session.lesson.prompts[promptIndex];
  const normalized = userMessage.toLowerCase();

  if (/how (much|long)|time (left|remain)/.test(normalized)) {
    const progress = Math.min(85, 20 + userTurns * 20);
    const remaining = Math.max(5, Math.round(session.duration * (1 - progress / 100) / 5) * 5);
    return `You're roughly ${progress}% through this lesson—about ${remaining} minutes remain. I want to test the idea once more, then have you explain the core reasoning back to me.\n\n${nextPrompt}`;
  }

  if (/not fair|never learned|don'?t know anything about/.test(normalized)) {
    return `You're right—that question assumed a prerequisite we haven't established. I'm recording that as a calibration correction. Let's backfill the smallest missing piece first, then return to the original problem.\n\n${nextPrompt}`;
  }

  if (/don'?t know|not sure|no idea|stuck/.test(normalized)) {
    return `That's useful calibration. Let's reduce the problem instead of jumping to the answer. Focus only on what changes between the two cases and what stays the same.\n\n${nextPrompt}`;
  }

  if (userTurns >= session.lesson.prompts.length) {
    return `Your reasoning is moving in the right direction, and you've now touched the main objective for this lesson. Before we finish, give me a two-sentence explanation of the idea and one bug or problem it helps you recognize. That final checkpoint will determine what we reinforce next.`;
  }

  return `Good—you're reasoning from the behavior of the system instead of reaching for framework syntax. The part I want to sharpen is the causal link: state exactly what assumption your answer depends on.\n\n${nextPrompt}`;
}

export async function replyToLearner(state, session, userMessage) {
  if (!process.env.OPENAI_API_KEY) return { text: offlineReply(session, userMessage), mode: "offline" };

  const input = session.messages.map((message) => ({ role: message.role, content: message.content }));
  const response = await callOpenAI({
    instructions: tutorInstructions(state, session),
    input,
    reasoning: { effort: "low" },
    text: { verbosity: "medium" },
  });

  const text = extractText(response);
  if (!text) throw new Error("The tutor returned an empty response.");
  return { text, mode: "openai", responseId: response.id };
}

function localAssessment(session) {
  const userMessages = session.messages.filter((message) => message.role === "user");
  const totalWords = userMessages.reduce((sum, message) => sum + message.content.trim().split(/\s+/).length, 0);
  const evidence = Math.min(1, userMessages.length / 4) * 0.6 + Math.min(1, totalWords / 120) * 0.4;
  const baseDelta = userMessages.length ? Number((0.025 + evidence * 0.1).toFixed(2)) : 0;
  const appliedFormat = /hands-on|debug|practice|workflow|investigation/i.test(session.lesson.format) || session.tailoring?.pace === "hands-on";
  const mathematical = session.lesson.track === "ml" && /gradient|math|linear|neural/i.test(session.lesson.title);
  const dimensionUpdates = userMessages.length ? [
    { dimension: "conceptual", delta: baseDelta, evidence: "Engaged with the central concept and explained at least part of the causal model." },
    { dimension: "reasoning", delta: Number((baseDelta * 0.9).toFixed(2)), evidence: "Reasoned from system behavior rather than relying only on terminology." },
  ] : [];
  if (appliedFormat && userMessages.length >= 2) dimensionUpdates.push({ dimension: "application", delta: Number((baseDelta * 0.75).toFixed(2)), evidence: "Applied the idea to a concrete example or debugging scenario." });
  if (mathematical && userMessages.length >= 2) dimensionUpdates.push({ dimension: "mathematical", delta: Number((baseDelta * 0.65).toFixed(2)), evidence: "Worked with the mathematical mechanics at an introductory level." });
  return {
    dimensionUpdates,
    summary: `Practiced ${session.lesson.title.toLowerCase()} through ${userMessages.length} guided checkpoint${userMessages.length === 1 ? "" : "s"}.`,
    demonstrated: userMessages.length >= 3
      ? ["Reasoned through the lesson using system behavior", "Explained at least one causal connection"]
      : userMessages.length
        ? ["Engaged with the core lesson prompt"]
        : [],
    needsWork: userMessages.length >= 3
      ? ["Reinforce the idea in a fresh example"]
      : ["Complete a deeper explanation and application checkpoint"],
    misconceptions: [],
    newStrengths: userMessages.length >= 3 ? ["Uses system behavior and symptoms to form a causal explanation"] : [],
    newStruggles: userMessages.length >= 3 ? [] : ["The lesson ended before independent understanding was fully demonstrated"],
    nextStep: userMessages.length >= 3
      ? "Advance to the next prerequisite-aware lesson, then revisit this concept with a short review."
      : "Continue this concept in the next session with less scaffolding before advancing.",
    nextAction: userMessages.length >= 3 ? "advance" : "continue",
  };
}

export async function assessSession(state, session) {
  if (!process.env.OPENAI_API_KEY) return { ...localAssessment(session), mode: "offline" };

  const transcript = session.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  const response = await callOpenAI({
    instructions: `Assess a tutoring session conservatively. Distinguish exposure, conceptual understanding, reasoning, mathematical mechanics, and practical application. Do not infer mastery from agreement, vocabulary, résumé claims, prior AI-assisted work, or tutor praise. Update only dimensions the learner independently demonstrated in this transcript. Capture calibration misses, misconceptions, strengths, and struggles in specific language that will help the next tutor session. Return only the requested structured result.`,
    input: `${learnerContext(state)}\n\nLesson objective: ${session.lesson.objective}\n\nTranscript:\n${transcript}`,
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "session_assessment",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            dimensionUpdates: {
              type: "array",
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  dimension: { type: "string", enum: Object.keys(DIMENSIONS) },
                  delta: { type: "number", minimum: -0.1, maximum: 0.2 },
                  evidence: { type: "string" },
                },
                required: ["dimension", "delta", "evidence"],
              },
            },
            demonstrated: { type: "array", items: { type: "string" }, maxItems: 3 },
            needsWork: { type: "array", items: { type: "string" }, maxItems: 3 },
            misconceptions: { type: "array", items: { type: "string" }, maxItems: 3 },
            newStrengths: { type: "array", items: { type: "string" }, maxItems: 3 },
            newStruggles: { type: "array", items: { type: "string" }, maxItems: 3 },
            nextStep: { type: "string" },
            nextAction: { type: "string", enum: ["continue", "advance", "review"] },
          },
          required: ["summary", "dimensionUpdates", "demonstrated", "needsWork", "misconceptions", "newStrengths", "newStruggles", "nextStep", "nextAction"],
        },
      },
    },
  });

  return { ...JSON.parse(extractText(response)), mode: "openai" };
}

export function applyAssessment(state, session, assessment) {
  ensureLearnerState(state);
  const conceptId = session.lesson.conceptId;
  const current = state.mastery[conceptId] || { score: 0, status: "unseen", evidence: [], dimensions: {} };
  const scoreBefore = current.score;
  const memoryResult = applyMemoryAssessment(state, session, assessment);
  const completedAt = new Date().toISOString();
  const historyItem = {
    id: session.id,
    lessonId: session.lessonId,
    conceptId,
    track: session.lesson.track,
    title: session.lesson.title,
    startedAt: session.startedAt,
    completedAt,
    duration: session.duration,
    messageCount: session.messages.length,
    summary: assessment.summary,
    scoreBefore,
    scoreAfter: memoryResult.score,
    dimensionsBefore: memoryResult.beforeDimensions,
    dimensionsAfter: memoryResult.afterDimensions,
    dimensionUpdates: assessment.dimensionUpdates,
    demonstrated: assessment.demonstrated,
    needsWork: assessment.needsWork,
    misconceptions: assessment.misconceptions,
    nextAction: assessment.nextAction,
    tailoring: session.tailoring,
  };
  state.history.push(historyItem);
  state.history = state.history.slice(-50);

  state.activeSession = null;
  state.recommendation = assessment.nextAction === "continue"
    ? { lessonId: session.lessonId, reason: assessment.nextStep, updatedAt: completedAt }
    : null;
  const nextLesson = assessment.nextAction === "continue"
    ? session.lesson
    : selectLesson(state, { duration: session.duration });
  state.recommendation = {
    lessonId: nextLesson.id,
    reason: assessment.nextStep,
    updatedAt: completedAt,
  };
  return { state, historyItem, assessment, track: TRACKS[session.lesson.track] };
}

export function modelName() {
  return DEFAULT_MODEL;
}
