# AI Tutor

A local-first, single-user learning system built around one loop:

> choose the right next topic → teach interactively → observe reasoning → update the learner model → choose better tomorrow

## What works

- Personalized “today” dashboard with a prerequisite-aware lesson recommendation
- 10, 20, 30, or 40 minute lesson sessions
- Guided tutor chat that asks one question at a time
- Persistent learner profile, concept confidence, session history, and next-step recommendation
- End-of-session assessment that updates mastery estimates
- Offline tutor mode, so the complete flow works without an API key
- Optional OpenAI Responses API mode using a server-side key
- No runtime packages or database setup; Node and a JSON file are enough

## Run locally

Install Node.js 20 or newer, then:

```bash
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

For live AI tutoring, copy the example environment file and add an API key:

```bash
cp .env.example .env
```

Load the values in your shell before starting the app. For example:

```bash
set -a
source .env
set +a
npm start
```

The default model is `gpt-5.6-luna`, selected for a low-cost daily tutoring workload. Override it with `OPENAI_MODEL`.

## Test

```bash
npm test
```

## Project map

```text
public/                 browser application
server.mjs              HTTP server and API routes
lib/curriculum.mjs      lesson graph and recommendation scoring
lib/tutor.mjs           offline tutor + OpenAI Responses API adapter
lib/state-store.mjs     serialized, atomic JSON persistence
data/learner-state.json editable learner profile and current state
test/                   Node test suite
```

The OpenAI API key stays on the server. Session transcripts and learning state stay local; API calls use `store: false`.
