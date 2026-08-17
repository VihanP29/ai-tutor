const root = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const ui = {
  data: null,
  route: "today",
  lessonOpen: false,
  loading: false,
  modal: null,
  recap: null,
};

const conceptTracks = {
  backend_request_flow: "swe",
  caching: "swe",
  pagination_validation: "swe",
  database_indexes: "swe",
  program_execution: "swe",
  repo_navigation: "exploration",
  hashmaps: "dsa",
  two_pointers: "dsa",
  sliding_window: "dsa",
  gradient_descent: "ml",
  neural_networks: "ml",
};

const icons = {
  today: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  progress: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="m12 3 1.5 4.2L18 9l-4.5 1.8L12 15l-1.5-4.2L6 9l4.5-1.8L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  play: '<path d="m9 7 8 5-8 5V7Z"/>',
  sliders: '<path d="M4 7h10M18 7h2M10 17h10M4 17h2"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  send: '<path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function inlineFormat(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function markdown(text) {
  const parts = String(text).split(/```/);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const content = part.replace(/^[a-z]+\n/i, "").trim();
      return `<pre><code>${escapeHtml(content)}</code></pre>`;
    }
    return part.split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p>${inlineFormat(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  }).join("");
}

function prettyConcept(id) {
  const special = { dsa: "DS&A", api: "API", ml: "ML" };
  return id.split("_").map((word) => special[word] || `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

function clampPercent(value) {
  return Math.round(Math.max(0, Math.min(1, value || 0)) * 100);
}

function trackAverage(track) {
  const entries = Object.entries(ui.data.mastery).filter(([concept]) => conceptTracks[concept] === track);
  if (!entries.length) return 0;
  return entries.reduce((sum, [, mastery]) => sum + mastery.score, 0) / entries.length;
}

function thisWeekSessions() {
  const now = new Date();
  const start = new Date(now);
  const day = (now.getDay() + 6) % 7;
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return ui.data.history.filter((item) => new Date(item.completedAt) >= start);
}

function dateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function toast(message, error = false) {
  const element = document.createElement("div");
  element.className = `toast${error ? " error" : ""}`;
  element.innerHTML = `<span>${error ? "!" : "✓"}</span><span>${escapeHtml(message)}</span>`;
  toastRegion.append(element);
  setTimeout(() => element.remove(), 4500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

function sidebar() {
  const connected = ui.data.tutor.connected;
  return `
    <aside class="sidebar">
      <div class="wordmark">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div><strong>AI Tutor</strong><small>Personal learning</small></div>
      </div>
      <nav class="nav-list" aria-label="Main navigation">
        ${navButton("today", "today", "Today")}
        ${navButton("progress", "progress", "Progress")}
        ${navButton("history", "history", "History")}
      </nav>
      <div class="nav-spacer"></div>
      <div class="tutor-status">
        <div class="status-line"><i class="status-dot ${connected ? "" : "offline"}"></i><span>${connected ? "AI connected" : "Offline tutor"}</span></div>
        <p>${connected ? `${escapeHtml(ui.data.tutor.model)} is guiding sessions.` : "Add an API key when you want live AI guidance."}</p>
      </div>
    </aside>`;
}

function navButton(route, iconName, label) {
  return `<button class="nav-button ${ui.route === route ? "active" : ""}" data-route="${route}" aria-current="${ui.route === route ? "page" : "false"}">${icon(iconName)}<span>${label}</span></button>`;
}

function shell(content) {
  return `<div class="app-shell">${sidebar()}<main class="main">${content}</main></div>${ui.modal ? modal() : ""}`;
}

function dashboard() {
  const lesson = ui.data.recommendation.lesson;
  const active = ui.data.activeSession;
  const sessions = thisWeekSessions();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";
  const focus = [
    { track: "swe", label: "SWE foundations", color: "sage" },
    { track: "dsa", label: "DS&A fluency", color: "orange" },
    { track: "ml", label: "ML foundations", color: "blue" },
  ];

  return shell(`<div class="page">
    <header class="topbar">
      <div><p class="eyebrow">${dateLabel()}</p><h1>${greeting}, ${escapeHtml(ui.data.profile.name)}.</h1></div>
      <div class="avatar" aria-label="${escapeHtml(ui.data.profile.name)} profile">${escapeHtml(ui.data.profile.name.slice(0, 2).toUpperCase())}</div>
    </header>

    <div class="dashboard-grid">
      <section class="lesson-hero" aria-labelledby="next-lesson-title">
        <div class="hero-content">
          <span class="hero-label">${active ? "Session in progress" : "Your next lesson"}</span>
          <h2 id="next-lesson-title">${escapeHtml(active?.lesson.title || lesson.title)}</h2>
          <p class="hero-objective">${escapeHtml(active?.lesson.objective || lesson.objective)}</p>
          <div class="lesson-meta">
            <span>${icon("clock")} ${active?.duration || lesson.duration} minutes</span>
            <span>${icon("spark")} ${escapeHtml(active?.lesson.format || lesson.format)}</span>
            <span>${escapeHtml((ui.data.tracks[active?.lesson.track || lesson.track]).shortLabel)}</span>
          </div>
        </div>
        <div class="hero-actions">
          <button class="button button-primary" data-action="${active ? "resume" : "quick-start"}">${icon("play")} ${active ? "Resume lesson" : "Start today’s lesson"}</button>
          ${active ? "" : `<button class="button button-ghost" data-action="open-lesson-picker">${icon("sliders")} Choose something else</button>`}
        </div>
      </section>

      <div class="side-stack">
        <section class="card">
          <div class="card-head"><h3>This week</h3><button class="link-button" data-route="history">View history</button></div>
          <div class="week-number">${sessions.length}</div>
          <p class="week-copy">guided session${sessions.length === 1 ? "" : "s"} completed</p>
          ${weekCalendar(sessions)}
        </section>
        <section class="card">
          <div class="card-head"><h3>Current focus</h3><button class="link-button" data-route="progress">View all</button></div>
          <div class="focus-list">${focus.map((item) => focusItem(item)).join("")}</div>
        </section>
      </div>
    </div>

    <div class="reason-strip">${icon("info")}<span><strong>Why this lesson?</strong> ${escapeHtml(lesson.reason)}</span></div>

    <section class="section">
      <div class="section-heading">
        <div><h2>Your learning tracks</h2><p>Recruiting comes first. ML stays warm without steering the whole curriculum.</p></div>
      </div>
      <div class="track-grid">
        ${trackCard("swe", "Backend & systems", "Trace real software, debug behavior, and build durable mental models.", "Primary")}
        ${trackCard("dsa", "Interview patterns", "Recognize structures and derive solutions instead of memorizing templates.", "Priority")}
        ${trackCard("ml", "ML mechanics", "Connect high-level intuition to the mathematics underneath modern models.", "Side track")}
      </div>
    </section>
  </div>`);
}

function weekCalendar(sessions) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const completedDays = new Set(sessions.map((item) => new Date(item.completedAt).toDateString()));
  return `<div class="week-grid">${[0,1,2,3,4,5,6].map((offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    const done = completedDays.has(date.toDateString());
    const today = date.toDateString() === now.toDateString();
    return `<div class="day ${done ? "done" : ""} ${today ? "today" : ""}"><span>${done ? "✓" : date.getDate()}</span><small>${date.toLocaleDateString("en-US", { weekday: "narrow" })}</small></div>`;
  }).join("")}</div>`;
}

function focusItem({ track, label, color }) {
  const value = clampPercent(trackAverage(track));
  return `<div class="focus-item"><div class="focus-icon ${color}">${ui.data.tracks[track].shortLabel.slice(0, 2)}</div><div><div class="focus-label"><span>${label}</span><span>${value}%</span></div><div class="meter"><span style="width:${value}%"></span></div></div></div>`;
}

function trackCard(track, title, description, badge) {
  const meta = ui.data.tracks[track];
  const value = clampPercent(trackAverage(track));
  return `<article class="track-card ${meta.color}" data-action="start-track" data-track="${track}" tabindex="0" role="button">
    <div class="track-top"><span class="track-pill">${badge}</span><span class="track-arrow">${icon("arrow")}</span></div>
    <h3>${title}</h3><p>${description}</p>
    <div class="track-progress"><div class="meter"><span style="width:${value}%"></span></div><span>${value}%</span></div>
  </article>`;
}

function progressPage() {
  const values = Object.values(ui.data.mastery);
  const avg = values.reduce((sum, entry) => sum + entry.score, 0) / values.length;
  const practiced = values.filter((entry) => entry.lastPracticed).length;
  const comfortable = values.filter((entry) => entry.status === "comfortable").length;
  const sorted = Object.entries(ui.data.mastery).sort(([, a], [, b]) => b.score - a.score);
  return shell(`<div class="page">
    <header class="page-header"><p class="eyebrow">Learner model</p><h1>Your progress</h1><p>These are confidence estimates, not grades. They change only when a lesson gives the tutor evidence about what you can explain or apply.</p></header>
    <div class="progress-overview">
      ${statCard("Overall confidence", `${clampPercent(avg)}%`, "Across currently tracked concepts")}
      ${statCard("Concepts practiced", String(practiced), `of ${values.length} in the learner model`)}
      ${statCard("Comfortable", String(comfortable), "Ready for harder application")}
    </div>
    <section class="section card">
      <div class="card-head"><div><h2>Concept map</h2></div><span class="track-pill">Evidence based</span></div>
      <div class="mastery-list">${sorted.map(([id, entry]) => masteryRow(id, entry)).join("")}</div>
    </section>
  </div>`);
}

function statCard(label, value, detail) {
  return `<div class="stat-card"><small>${label}</small><strong>${value}</strong><p>${detail}</p></div>`;
}

function masteryRow(id, entry) {
  const value = clampPercent(entry.score);
  const evidence = entry.evidence?.at(-1) || "No direct evidence recorded yet.";
  return `<div class="mastery-row"><div class="mastery-name">${prettyConcept(id)}<small>${escapeHtml(evidence)}</small></div><div class="meter"><span style="width:${value}%"></span></div><div class="mastery-score">${value}%</div></div>`;
}

function historyPage() {
  const history = [...ui.data.history].reverse();
  return shell(`<div class="page">
    <header class="page-header"><p class="eyebrow">Session record</p><h1>Learning history</h1><p>A concise record of what changed after each session—not a transcript archive.</p></header>
    <div class="history-list">${history.length ? history.map(historyItem).join("") : '<div class="empty-state">Finish your first lesson and it will appear here.</div>'}</div>
  </div>`);
}

function historyItem(item) {
  const date = new Date(item.completedAt);
  const change = Math.round((item.scoreAfter - item.scoreBefore) * 100);
  return `<article class="history-item">
    <div class="history-date"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString("en-US", { month: "short" })}</small></div>
    <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p></div>
    <div class="history-score"><strong>+${change}%</strong><small>${item.duration} min · ${ui.data.tracks[item.track]?.shortLabel || item.track}</small></div>
  </article>`;
}

function lessonPage() {
  const session = ui.data.activeSession;
  if (!session) return dashboard();
  return `<div class="lesson-shell">
    <header class="lesson-topbar">
      <button class="button button-text lesson-back" data-action="lesson-back">${icon("back")}<span>Dashboard</span></button>
      <div class="lesson-title-mini"><small>${ui.data.tracks[session.lesson.track].shortLabel} · ${session.duration} min</small><strong>${escapeHtml(session.lesson.title)}</strong></div>
      <button class="button button-light lesson-finish" data-action="finish-session" ${ui.loading ? "disabled" : ""}>${icon("check")}<span>${ui.loading ? "Finishing…" : "Finish"}</span></button>
    </header>
    <main class="chat-wrap">
      <section class="lesson-intro"><span class="track-pill">${escapeHtml(session.lesson.format)}</span><h1>${escapeHtml(session.lesson.title)}</h1><p>${escapeHtml(session.lesson.objective)}</p></section>
      <div class="conversation" id="conversation">
        ${session.messages.map(messageTemplate).join("")}
        ${ui.loading ? typingTemplate() : ""}
      </div>
    </main>
    <div class="composer-wrap">
      <form class="composer" id="message-form">
        <textarea name="message" rows="1" aria-label="Your response" placeholder="Think out loud…" ${ui.loading ? "disabled" : ""}></textarea>
        <button class="button button-dark send-button" type="submit" aria-label="Send response" ${ui.loading ? "disabled" : ""}>${icon("send")}</button>
      </form>
      <div class="composer-hint">Press Enter to send · Shift + Enter for a new line</div>
    </div>
  </div>`;
}

function messageTemplate(message) {
  const user = message.role === "user";
  return `<article class="message ${user ? "user" : "assistant"}">
    ${user ? `<div class="message-bubble">${markdown(message.content)}</div><div class="message-avatar">VI</div>` : `<div class="message-avatar">AI</div><div class="message-bubble">${markdown(message.content)}</div>`}
  </article>`;
}

function typingTemplate() {
  return `<article class="message assistant"><div class="message-avatar">AI</div><div class="message-bubble"><span class="typing" aria-label="Tutor is thinking"><span></span><span></span><span></span></span></div></article>`;
}

function recapPage() {
  const recap = ui.recap;
  return `<div class="lesson-shell"><main class="recap"><section class="recap-card">
    <div class="recap-icon">✓</div><p class="eyebrow" style="margin-top:22px">Session complete</p><h1>${escapeHtml(recap.title)}</h1><p class="recap-summary">${escapeHtml(recap.summary)}</p>
    <div class="score-change"><div><small>Confidence before</small><strong>${clampPercent(recap.scoreBefore)}%</strong></div><div>${icon("arrow")}</div><div style="text-align:right"><small>Confidence now</small><strong>${clampPercent(recap.scoreAfter)}%</strong></div></div>
    <div class="recap-grid">
      <div class="recap-block"><h3>What you demonstrated</h3><ul>${recap.demonstrated.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      <div class="recap-block"><h3>Keep developing</h3><ul>${recap.needsWork.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
    </div>
    <div class="recap-actions"><button class="button button-dark" data-action="recap-home">Back to dashboard</button><button class="button button-light" data-route="progress">See updated progress</button></div>
  </section></main></div>`;
}

function modal() {
  const selectedDuration = ui.modal.duration;
  const choices = ui.modal.track
    ? ui.data.catalog.filter((lesson) => lesson.track === ui.modal.track).slice(0, 4)
    : [ui.data.recommendation.lesson, ...ui.data.alternatives];
  return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="lesson-picker-title">
    <div class="modal-head"><div><h2 id="lesson-picker-title">Shape today’s session</h2><p>These choices affect one lesson, not your long-term priorities.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close")}</button></div>
    <p class="choice-label">How much time do you have?</p>
    <div class="segmented">${[10,20,30,40].map((value) => `<button class="choice ${selectedDuration === value ? "selected" : ""}" data-action="choose-duration" data-duration="${value}">${value} min</button>`).join("")}</div>
    <p class="choice-label">What should we work on?</p>
    <div class="alternate-list">${choices.map((lesson, index) => `<button class="alternate ${ui.modal.lessonId === lesson.id ? "selected" : ""}" data-action="choose-lesson" data-lesson-id="${lesson.id}"><div><strong>${escapeHtml(lesson.title)}</strong><small>${escapeHtml(lesson.objective)}</small></div><span>${!ui.modal.track && index === 0 ? "Recommended" : ui.data.tracks[lesson.track].shortLabel}</span></button>`).join("")}</div>
    <div class="modal-actions"><button class="button button-light" data-action="close-modal">Cancel</button><button class="button button-dark" data-action="start-selected" ${ui.loading ? "disabled" : ""}>${ui.loading ? "Preparing…" : "Start lesson"}</button></div>
  </section></div>`;
}

function render() {
  if (!ui.data) return;
  if (ui.recap) root.innerHTML = recapPage();
  else if (ui.lessonOpen && ui.data.activeSession) root.innerHTML = lessonPage();
  else if (ui.route === "progress") root.innerHTML = progressPage();
  else if (ui.route === "history") root.innerHTML = historyPage();
  else root.innerHTML = dashboard();
  requestAnimationFrame(() => {
    const conversation = document.querySelector("#conversation");
    if (conversation) window.scrollTo({ top: document.body.scrollHeight, behavior: ui.loading ? "smooth" : "auto" });
    const textarea = document.querySelector("#message-form textarea");
    if (textarea && !ui.loading) textarea.focus();
  });
}

async function startLesson({ lessonId, track, duration } = {}) {
  ui.loading = true;
  render();
  try {
    const result = await api("/api/session/start", { method: "POST", body: JSON.stringify({ lessonId, track, duration }) });
    ui.data.activeSession = result.session;
    ui.lessonOpen = true;
    ui.modal = null;
    ui.route = "today";
  } catch (error) {
    toast(error.message, true);
  } finally {
    ui.loading = false;
    render();
  }
}

async function sendMessage(content) {
  const session = ui.data.activeSession;
  const optimistic = { id: `optimistic-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() };
  session.messages.push(optimistic);
  ui.loading = true;
  render();
  try {
    const result = await api(`/api/session/${session.id}/message`, { method: "POST", body: JSON.stringify({ message: content }) });
    session.messages = session.messages.filter((message) => message.id !== optimistic.id);
    session.messages.push({ ...optimistic, id: `user-${Date.now()}` }, result.message);
  } catch (error) {
    session.messages = session.messages.filter((message) => message.id !== optimistic.id);
    toast(error.message, true);
    try { ui.data = await api("/api/state"); } catch {}
  } finally {
    ui.loading = false;
    render();
  }
}

async function finishSession() {
  if (ui.loading) return;
  const session = ui.data.activeSession;
  ui.loading = true;
  render();
  try {
    const result = await api(`/api/session/${session.id}/complete`, { method: "POST", body: "{}" });
    ui.data = result.state;
    ui.recap = result.recap;
    ui.lessonOpen = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    toast(error.message, true);
  } finally {
    ui.loading = false;
    render();
  }
}

document.addEventListener("click", (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    ui.route = routeTarget.dataset.route;
    ui.lessonOpen = false;
    ui.recap = null;
    render();
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "backdrop-close") {
    if (event.target === target) { ui.modal = null; render(); }
    return;
  }
  if (action === "quick-start") startLesson();
  if (action === "resume") { ui.lessonOpen = true; render(); }
  if (action === "lesson-back") { ui.lessonOpen = false; render(); }
  if (action === "finish-session") finishSession();
  if (action === "open-lesson-picker") {
    ui.modal = { duration: ui.data.profile.preferences.defaultDuration, lessonId: ui.data.recommendation.lesson.id };
    render();
  }
  if (action === "close-modal") { ui.modal = null; render(); }
  if (action === "choose-duration") { ui.modal.duration = Number(target.dataset.duration); render(); }
  if (action === "choose-lesson") { ui.modal.lessonId = target.dataset.lessonId; render(); }
  if (action === "start-selected") startLesson(ui.modal);
  if (action === "start-track") {
    const track = target.dataset.track;
    const matching = ui.data.catalog.find((lesson) => lesson.track === track);
    ui.modal = { duration: ui.data.profile.preferences.defaultDuration, lessonId: matching?.id || null, track };
    render();
  }
  if (action === "recap-home") { ui.recap = null; ui.route = "today"; render(); }
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "message-form") return;
  event.preventDefault();
  const textarea = event.target.elements.message;
  const content = textarea.value.trim();
  if (content && !ui.loading) sendMessage(content);
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("#message-form textarea") && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.target.form.requestSubmit();
  }
  if (event.key === "Escape" && ui.modal) { ui.modal = null; render(); }
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".track-card")) event.target.click();
});

async function init() {
  try {
    ui.data = await api("/api/state");
    ui.lessonOpen = Boolean(ui.data.activeSession);
    render();
  } catch (error) {
    root.innerHTML = `<div class="boot-screen"><div class="brand-mark"><span></span><span></span><span></span></div><h2>Couldn’t load your tutor</h2><p>${escapeHtml(error.message)}</p><button class="button button-dark" onclick="location.reload()">Try again</button></div>`;
  }
}

init();
