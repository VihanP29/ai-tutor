export const TRACKS = {
  swe: { label: "Software engineering", shortLabel: "SWE", color: "sage" },
  dsa: { label: "Data structures & algorithms", shortLabel: "DS&A", color: "orange" },
  ml: { label: "Machine learning", shortLabel: "ML / AI", color: "blue" },
  exploration: { label: "Exploration", shortLabel: "Explore", color: "violet" },
};

export const CURRICULUM = [
  {
    id: "backend-request-flow",
    conceptId: "backend_request_flow",
    track: "swe",
    title: "Trace a backend request end to end",
    objective: "Follow a request through routing, view/controller, ORM, serializer, and response—and identify where a bug can live.",
    duration: 30,
    prerequisites: [],
    format: "guided debugging",
    opening: "An API endpoint returns the wrong events, but the server responds with 200. Before reading any code, which layers of the request path would you consider—and which would you inspect first?",
    prompts: [
      "What does a successful 200 response rule out, and what does it leave possible?",
      "If the database contains the correct rows but the response is wrong, which layer becomes most suspicious?",
      "Explain the request path back to me as if you were onboarding to an unfamiliar repository.",
    ],
  },
  {
    id: "cache-design",
    conceptId: "caching",
    track: "swe",
    title: "Debug cache keys and stale data",
    objective: "Distinguish cache-key collisions from invalidation failures using symptoms rather than guesswork.",
    duration: 25,
    prerequisites: ["backend_request_flow"],
    format: "bug investigation",
    opening: "Page 2 of an events endpoint sometimes returns page 1, and restarting the server temporarily fixes it. What does that symptom suggest?",
    prompts: [
      "What information must be represented in the cache key for these requests to remain distinct?",
      "How would the symptom differ if this were an invalidation bug instead?",
      "Name every write path that may need to invalidate an events-list cache.",
    ],
  },
  {
    id: "pagination-boundaries",
    conceptId: "pagination_validation",
    track: "swe",
    title: "Make pagination survive boundary cases",
    objective: "Reason through page inputs, offsets, empty results, and validation before touching framework syntax.",
    duration: 30,
    prerequisites: ["backend_request_flow"],
    format: "hands-on reasoning",
    opening: "A client calls `GET /events?page=0&limit=20`. Should the API return an empty list, coerce the value, or reject the request? Walk me through your choice before we discuss code.",
    prompts: [
      "Using `(page - 1) × limit`, what breaks when page is 0 or negative?",
      "Which inputs belong to validation, and which outcomes are legitimate empty results?",
      "Design three boundary-case tests that would catch the most expensive bugs here.",
    ],
  },
  {
    id: "database-indexes",
    conceptId: "database_indexes",
    track: "swe",
    title: "Why database queries become slow",
    objective: "Build intuition for scans, indexes, selectivity, and the tradeoff between read speed and write cost.",
    duration: 35,
    prerequisites: ["backend_request_flow"],
    format: "systems intuition",
    opening: "A table has ten million events. `WHERE venue_id = 12` has become slow. What do you think the database must do if no useful index exists?",
    prompts: [
      "What changes when an index on `venue_id` is added?",
      "Why might we not index every column?",
      "What would make an index much less useful than expected?",
    ],
  },
  {
    id: "program-to-process",
    conceptId: "program_execution",
    track: "swe",
    title: "What happens when you run a program?",
    objective: "Connect source code, compilation or interpretation, processes, memory, and the operating system.",
    duration: 30,
    prerequisites: [],
    format: "mental model",
    opening: "You type `python app.py` and press Enter. What concrete things do you think happen between that keystroke and your first line of code executing?",
    prompts: [
      "What is the difference between the program file and the running process?",
      "Who gives the process memory and CPU time?",
      "How does this model help explain why two copies of the same program can run independently?",
    ],
  },
  {
    id: "hashmap-patterns",
    conceptId: "hashmaps",
    track: "dsa",
    title: "Recognize when a hash map changes the problem",
    objective: "Move from knowing hash maps to spotting complement, frequency, and lookup patterns in interview problems.",
    duration: 25,
    prerequisites: [],
    format: "pattern practice",
    opening: "You need to find whether any two numbers sum to a target. Before writing code, what repeated work does the brute-force solution perform?",
    prompts: [
      "What fact about earlier values would be useful to remember?",
      "What time-space tradeoff are we making?",
      "What wording in a new problem should make a hash map come to mind?",
    ],
  },
  {
    id: "two-pointers",
    conceptId: "two_pointers",
    track: "dsa",
    title: "Derive the two-pointer invariant",
    objective: "Understand why two pointers work on sorted data instead of memorizing a template.",
    duration: 30,
    prerequisites: ["hashmaps"],
    format: "guided derivation",
    opening: "On a sorted array, the values at the left and right ends sum too large. Which pointer can you move while safely ruling out possibilities—and why?",
    prompts: [
      "What property of sorted data makes that move safe?",
      "State the invariant that remains true after each move.",
      "When would two pointers be a bad fit even if the input is an array?",
    ],
  },
  {
    id: "sliding-window",
    conceptId: "sliding_window",
    track: "dsa",
    title: "Turn repeated subarray work into a sliding window",
    objective: "Recognize contiguous-range problems and maintain exactly the state that changes at the window edges.",
    duration: 30,
    prerequisites: ["two_pointers"],
    format: "pattern practice",
    opening: "To compute every length-k subarray sum, the brute-force solution repeatedly adds most of the same values. What could we reuse when shifting one position?",
    prompts: [
      "What leaves the window and what enters it?",
      "How does a fixed-size window differ from a variable-size one?",
      "Describe the signal that a problem is asking for a sliding window.",
    ],
  },
  {
    id: "gradient-mechanics",
    conceptId: "gradient_descent",
    track: "ml",
    title: "From slope to a real gradient update",
    objective: "Connect high-level gradient descent intuition to derivatives, parameter updates, and learning-rate behavior.",
    duration: 30,
    prerequisites: [],
    format: "math intuition",
    opening: "For `L(w) = w²`, you start at `w = 3`. Without calculating yet, what information must the derivative give us to choose the next move?",
    prompts: [
      "What does a positive derivative say about increasing w?",
      "Why does a learning rate that is too large cause oscillation?",
      "How does one derivative become a gradient when the model has many parameters?",
    ],
  },
  {
    id: "neural-network-bridge",
    conceptId: "neural_networks",
    track: "ml",
    title: "Build the bridge from linear models to neurons",
    objective: "Develop a continuous mental model of weights, biases, activations, and why stacked linear layers are not enough.",
    duration: 35,
    prerequisites: ["gradient_descent"],
    format: "conceptual build",
    opening: "If one layer computes `h = 2x + 1` and the next computes `y = 3h + 4`, what happens when you substitute the first into the second?",
    prompts: [
      "Why is the collapsed function still limited?",
      "What changes when a nonlinear activation sits between layers?",
      "Explain weights and bias by what they do, not by their names.",
    ],
  },
  {
    id: "repo-navigation",
    conceptId: "repo_navigation",
    track: "exploration",
    title: "Navigate an unfamiliar repository without drowning",
    objective: "Use entry points, request paths, tests, and targeted search to form a working map before editing code.",
    duration: 30,
    prerequisites: [],
    format: "workflow lab",
    opening: "You open a repository with 800 files and one bug report. What is the first question you need the codebase to answer?",
    prompts: [
      "Which files reveal the runtime entry point and request boundaries?",
      "How can an existing test become a map of the feature?",
      "What evidence tells you your mental model is good enough to edit safely?",
    ],
  },
];

export function masteryFor(state, conceptId) {
  return state.mastery?.[conceptId]?.score ?? 0;
}

function daysSince(dateString, now = new Date()) {
  if (!dateString) return 90;
  const elapsed = now.getTime() - new Date(dateString).getTime();
  return Math.max(0, elapsed / 86_400_000);
}

export function selectLesson(state, options = {}) {
  const requestedTrack = options.track && options.track !== "auto" ? options.track : null;
  const requestedDuration = Number(options.duration || state.profile.preferences.defaultDuration || 30);
  const recentIds = new Set((state.history || []).slice(-3).map((session) => session.lessonId));
  const recommendation = state.recommendation?.lessonId;

  const eligible = CURRICULUM.filter((lesson) => {
    if (requestedTrack && lesson.track !== requestedTrack) return false;
    return lesson.prerequisites.every((concept) => masteryFor(state, concept) >= 0.4);
  });

  const pool = eligible.length ? eligible : CURRICULUM.filter((lesson) => !requestedTrack || lesson.track === requestedTrack);
  const ranked = pool.map((lesson) => {
    const priority = state.profile.trackPriorities[lesson.track] ?? 0.1;
    const mastery = masteryFor(state, lesson.conceptId);
    const lastPracticed = state.mastery?.[lesson.conceptId]?.lastPracticed;
    let score = priority * 4 + (1 - mastery) * 2 + Math.min(daysSince(lastPracticed) / 30, 1);
    score -= Math.abs(lesson.duration - requestedDuration) / 25;
    if (lesson.id === recommendation) score += 3;
    if (recentIds.has(lesson.id)) score -= 2.5;
    return { lesson, score };
  }).sort((a, b) => b.score - a.score);

  const selected = ranked[0]?.lesson || CURRICULUM[0];
  const concept = state.mastery?.[selected.conceptId];
  const reason = selected.id === recommendation
    ? state.recommendation.reason
    : concept?.score
      ? `This builds on a developing skill (${Math.round(concept.score * 100)}% confidence) in your ${TRACKS[selected.track].shortLabel} track.`
      : `This is a high-value next foundation in your ${TRACKS[selected.track].shortLabel} track.`;

  return { ...selected, reason, trackMeta: TRACKS[selected.track] };
}

export function alternateLessons(state, selectedId, limit = 3) {
  return CURRICULUM
    .filter((lesson) => lesson.id !== selectedId)
    .map((lesson) => ({
      ...lesson,
      trackMeta: TRACKS[lesson.track],
      score: (state.profile.trackPriorities[lesson.track] || 0) * 2 + (1 - masteryFor(state, lesson.conceptId)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
