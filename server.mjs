import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { alternateLessons, CURRICULUM, selectLesson, TRACKS } from "./lib/curriculum.mjs";
import { addUserMemoryNote, createProfileSync, ensureLearnerState, removeUserMemoryNote } from "./lib/learner-memory.mjs";
import { StateStore } from "./lib/state-store.mjs";
import { applyAssessment, assessSession, createSession, modelName, replyToLearner } from "./lib/tutor.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const store = new StateStore(process.env.DATA_PATH || path.join(ROOT, "data", "learner-state.json"));
const port = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function inferTrack(request) {
  const text = request.toLowerCase();
  if (/\b(ml|machine learning|gradient|neural|model|math)\b/.test(text)) return "ml";
  if (/\b(dsa|leetcode|algorithm|data structure|interview problem)\b/.test(text)) return "dsa";
  if (/\b(backend|api|database|cache|system|repository|swe)\b/.test(text)) return "swe";
  return null;
}

async function bodyFrom(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw badRequest("Request body is too large.");
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

function publicState(state) {
  ensureLearnerState(state);
  const recommended = selectLesson(state);
  return {
    ...state,
    recommendation: { ...state.recommendation, lesson: recommended },
    alternatives: alternateLessons(state, recommended.id),
    catalog: CURRICULUM.map((lesson) => ({ ...lesson, trackMeta: TRACKS[lesson.track] })),
    tracks: TRACKS,
    curriculumSize: CURRICULUM.length,
    tutor: { connected: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_API_KEY ? modelName() : null },
  };
}

async function apiRoute(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/state") {
    return json(response, 200, publicState(await store.read()));
  }

  if (request.method === "GET" && url.pathname === "/api/memory/export") {
    const state = await store.read();
    return json(response, 200, { text: createProfileSync(state), generatedAt: new Date().toISOString() });
  }

  if (request.method === "PATCH" && url.pathname === "/api/profile") {
    const input = await bodyFrom(request);
    const state = await store.update((current) => {
      ensureLearnerState(current);
      if (input.primaryGoal !== undefined) {
        const primaryGoal = String(input.primaryGoal).trim();
        if (!primaryGoal || primaryGoal.length > 600) throw badRequest("Keep the primary goal between 1 and 600 characters.");
        current.profile.primaryGoal = primaryGoal;
      }
      if (input.currentContext !== undefined) {
        const currentContext = String(input.currentContext).trim();
        if (!currentContext || currentContext.length > 1_200) throw badRequest("Keep the current context between 1 and 1,200 characters.");
        current.learningMemory.currentContext = currentContext;
      }
      if (input.defaultDuration !== undefined) {
        const duration = Number(input.defaultDuration);
        if (!Number.isFinite(duration) || duration < 10 || duration > 60) throw badRequest("Default duration must be between 10 and 60 minutes.");
        current.profile.preferences.defaultDuration = duration;
      }
      return current;
    });
    return json(response, 200, { state: publicState(state) });
  }

  if (request.method === "POST" && url.pathname === "/api/memory/note") {
    const input = await bodyFrom(request);
    const content = String(input.content || "").trim();
    if (!content) return json(response, 400, { error: "Write something for the tutor to remember." });
    if (content.length > 600) return json(response, 400, { error: "Keep a memory note under 600 characters." });
    let note;
    const state = await store.update((current) => {
      note = addUserMemoryNote(current, content);
      return current;
    });
    return json(response, 201, { note, state: publicState(state) });
  }

  const noteMatch = url.pathname.match(/^\/api\/memory\/note\/([^/]+)$/);
  if (request.method === "DELETE" && noteMatch) {
    let removed = false;
    const state = await store.update((current) => {
      removed = removeUserMemoryNote(current, noteMatch[1]);
      return current;
    });
    if (!removed) return json(response, 404, { error: "That memory note no longer exists." });
    return json(response, 200, { state: publicState(state) });
  }

  if (request.method === "POST" && url.pathname === "/api/session/start") {
    const input = await bodyFrom(request);
    const state = await store.read();
    if (state.activeSession) return json(response, 200, { session: state.activeSession, resumed: true });

    const inferredTrack = input.track || inferTrack(String(input.request || ""));
    const lesson = input.lessonId
      ? CURRICULUM.find((item) => item.id === input.lessonId)
      : selectLesson(state, { track: inferredTrack, duration: input.duration });
    if (!lesson) return json(response, 404, { error: "That lesson could not be found." });

    const duration = Math.min(60, Math.max(10, Number(input.duration || lesson.duration || 30)));
    const session = createSession(lesson, duration, { pace: input.pace, request: input.request });
    await store.update((current) => ({ ...current, activeSession: session }));
    return json(response, 201, { session, resumed: false });
  }

  const messageMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/message$/);
  if (request.method === "POST" && messageMatch) {
    const input = await bodyFrom(request);
    const content = String(input.message || "").trim();
    if (!content) return json(response, 400, { error: "Write a response before sending." });
    if (content.length > 8_000) return json(response, 400, { error: "Keep a single response under 8,000 characters." });

    const state = await store.read();
    const session = state.activeSession;
    if (!session || session.id !== messageMatch[1]) return json(response, 404, { error: "This session is no longer active." });

    const userEntry = { id: randomUUID(), role: "user", content, createdAt: new Date().toISOString() };
    session.messages.push(userEntry);
    await store.update((current) => ({ ...current, activeSession: session }));

    try {
      const reply = await replyToLearner(state, session, content);
      const tutorEntry = { id: randomUUID(), role: "assistant", content: reply.text, createdAt: new Date().toISOString() };
      session.messages.push(tutorEntry);
      await store.update((current) => ({ ...current, activeSession: session }));
      return json(response, 200, { message: tutorEntry, mode: reply.mode });
    } catch (error) {
      return json(response, 502, { error: "The AI tutor could not respond. Your message was saved; try again in a moment.", detail: error.message });
    }
  }

  const completeMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/complete$/);
  if (request.method === "POST" && completeMatch) {
    const state = await store.read();
    const session = state.activeSession;
    if (!session || session.id !== completeMatch[1]) return json(response, 404, { error: "This session is no longer active." });

    try {
      const assessment = await assessSession(state, session);
      const result = applyAssessment(state, session, assessment);
      await store.write(result.state);
      return json(response, 200, {
        recap: {
          title: session.lesson.title,
          track: result.track,
          ...assessment,
          scoreBefore: result.historyItem.scoreBefore,
          scoreAfter: result.historyItem.scoreAfter,
          dimensionsBefore: result.historyItem.dimensionsBefore,
          dimensionsAfter: result.historyItem.dimensionsAfter,
        },
        state: publicState(result.state),
      });
    } catch (error) {
      return json(response, 502, { error: "The session could not be assessed yet. Your progress is still saved.", detail: error.message });
    }
  }

  if (request.method === "DELETE" && url.pathname === "/api/session/active") {
    const state = await store.update((current) => ({ ...current, activeSession: null }));
    return json(response, 200, { state: publicState(state) });
  }

  return json(response, 404, { error: "API route not found." });
}

async function staticRoute(response, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const candidate = path.resolve(PUBLIC_DIR, `.${requestPath}`);
  if (!candidate.startsWith(`${PUBLIC_DIR}${path.sep}`)) return json(response, 403, { error: "Forbidden." });

  try {
    const details = await stat(candidate);
    const filePath = details.isDirectory() ? path.join(candidate, "index.html") : candidate;
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(content);
  } catch {
    const content = await readFile(path.join(PUBLIC_DIR, "index.html"));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    response.end(content);
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await apiRoute(request, response, url);
    else await staticRoute(response, url);
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI Tutor is running at http://127.0.0.1:${port}`);
  console.log(process.env.OPENAI_API_KEY ? `Tutor mode: OpenAI (${modelName()})` : "Tutor mode: offline demo (set OPENAI_API_KEY for live AI)");
});
