import { createHash, randomUUID } from "node:crypto";
import { selectLesson, TRACKS } from "./curriculum.mjs";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

function learnerContext(state) {
  const mastery = Object.entries(state.mastery)
    .map(([id, value]) => `${id}: ${Math.round(value.score * 100)}% (${value.status})`)
    .join("\n");

  return `Learner: ${state.profile.name}
Primary goal: ${state.profile.primaryGoal}
Current priority: SWE internship readiness, then DS&A; ML remains an active side track.
Learning preferences: ${state.profile.preferences.teachingStyle.join("; ")}
Strengths: ${state.profile.strengths.join("; ")}
Known gaps: ${state.profile.gaps.join("; ")}
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

Teach through guided struggle. Ask one meaningful question at a time. Calibrate from the learner's actual answer. Do not dump a complete lecture or jump ahead to advanced terminology. Acknowledge correct reasoning specifically, correct misconceptions directly, and connect explanations to the current lesson objective. Prefer intuition, small examples, debugging symptoms, or tiny calculations over definitions. Do not mistake résumé exposure or vocabulary for mastery. Keep each turn compact enough for an interactive session. The learner can ask how much time remains; estimate based on transcript progress. When the objective has been demonstrated, say so and suggest finishing the session.`;
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

export function createSession(lesson, duration) {
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
  const scoreDelta = Number((0.04 + evidence * 0.12).toFixed(2));
  return {
    scoreDelta,
    status: evidence > 0.68 ? "comfortable" : "developing",
    summary: `Practiced ${session.lesson.title.toLowerCase()} through ${userMessages.length} guided checkpoint${userMessages.length === 1 ? "" : "s"}.`,
    demonstrated: userMessages.length >= 3
      ? ["Reasoned through the lesson using system behavior", "Explained at least one causal connection"]
      : ["Engaged with the core lesson prompt"],
    needsWork: userMessages.length >= 3
      ? ["Reinforce the idea in a fresh example"]
      : ["Complete a deeper explanation and application checkpoint"],
    nextStep: "Continue with the next prerequisite-aware lesson, then revisit this concept with a short review.",
  };
}

export async function assessSession(state, session) {
  if (!process.env.OPENAI_API_KEY) return { ...localAssessment(session), mode: "offline" };

  const transcript = session.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  const response = await callOpenAI({
    instructions: `Assess a tutoring session conservatively. Do not infer mastery from agreement, vocabulary, or tutor praise. Base every judgment on what the learner independently demonstrated. Return only the requested structured result.`,
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
            scoreDelta: { type: "number", minimum: -0.1, maximum: 0.2 },
            status: { type: "string", enum: ["needs-work", "developing", "comfortable"] },
            summary: { type: "string" },
            demonstrated: { type: "array", items: { type: "string" }, maxItems: 3 },
            needsWork: { type: "array", items: { type: "string" }, maxItems: 3 },
            nextStep: { type: "string" },
          },
          required: ["scoreDelta", "status", "summary", "demonstrated", "needsWork", "nextStep"],
        },
      },
    },
  });

  return { ...JSON.parse(extractText(response)), mode: "openai" };
}

export function applyAssessment(state, session, assessment) {
  const conceptId = session.lesson.conceptId;
  const current = state.mastery[conceptId] || { score: 0, status: "unseen", evidence: [] };
  const nextScore = Math.min(0.98, Math.max(0.05, current.score + assessment.scoreDelta));
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
    scoreBefore: current.score,
    scoreAfter: nextScore,
    demonstrated: assessment.demonstrated,
    needsWork: assessment.needsWork,
  };

  state.mastery[conceptId] = {
    ...current,
    score: nextScore,
    status: assessment.status,
    lastPracticed: completedAt,
    evidence: [...(current.evidence || []), assessment.summary].slice(-4),
  };
  state.history.push(historyItem);
  state.history = state.history.slice(-50);

  state.activeSession = null;
  state.recommendation = null;
  const nextLesson = selectLesson(state, { duration: session.duration });
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
