// Google Cloud ACE Exam & Practice Platform - Application Logic

const STORAGE_KEYS = {
  SAVED_SESSIONS: "gcp_ace_saved_sessions_v1",
  SCORE_HISTORY: "gcp_ace_score_history_v1",
  THEME: "gcp_ace_theme_v1"
};

const PASS_PERCENTAGE = 75;
const TEST_DURATION_SECONDS = 2 * 60 * 60; // 2 hours = 7200 seconds

const PRESET_SETS = {
  set1: { id: "set1", title: "Exam Set 1 (Q1–52)", start: 1, end: 52 },
  set2: { id: "set2", title: "Exam Set 2 (Q53–104)", start: 53, end: 104 },
  set3: { id: "set3", title: "Exam Set 3 (Q105–156)", start: 105, end: 156 },
  set4: { id: "set4", title: "Exam Set 4 (Q157–208)", start: 157, end: 208 },
  set5: { id: "set5", title: "Exam Set 5 (Q209–260)", start: 209, end: 260 },
  set6: { id: "set6", title: "Exam Set 6 (Q261–310)", start: 261, end: 310 }
};

// Map question bank by ID for fast lookup
const QUESTION_MAP = new Map();
if (typeof QUESTIONS_DATA !== "undefined" && Array.isArray(QUESTIONS_DATA)) {
  QUESTIONS_DATA.forEach((q) => QUESTION_MAP.set(q.id, q));
}

// Application State
let configState = {
  mode: "practice", // 'practice' | 'test'
  setKey: "set1",   // 'set1'..'set6' | 'random' | 'custom'
  randomCount: 55,
  customStart: 1,
  customEnd: 60,
  shuffleQuestions: false
};

let activeSession = null;
let timerIntervalId = null;
let currentNavFilter = "all";
let currentReviewFilter = "all";
let currentEvaluationRecord = null;
let confirmCallback = null;

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  bindDashboardEvents();
  bindExamEvents();
  bindEvaluationEvents();
  bindModalEvents();
  updateStartButtonLabel();
  renderDashboard();
});

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.getElementById("btn-theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEYS.THEME, next);
  });
}

// ==================== STORAGE HELPERS ====================
function getSavedSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSessionsArray(sessions) {
  localStorage.setItem(STORAGE_KEYS.SAVED_SESSIONS, JSON.stringify(sessions));
}

function upsertActiveSessionToStorage() {
  if (!activeSession) return;
  activeSession.updatedAt = new Date().toISOString();
  const sessions = getSavedSessions();
  const idx = sessions.findIndex((s) => s.sessionId === activeSession.sessionId);
  if (idx >= 0) {
    sessions[idx] = activeSession;
  } else {
    sessions.unshift(activeSession);
  }
  saveSessionsArray(sessions);
}

function removeSavedSession(sessionId) {
  const sessions = getSavedSessions().filter((s) => s.sessionId !== sessionId);
  saveSessionsArray(sessions);
}

function getScoreHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SCORE_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveScoreHistory(history) {
  localStorage.setItem(STORAGE_KEYS.SCORE_HISTORY, JSON.stringify(history));
}

// ==================== DASHBOARD LOGIC ====================
function bindDashboardEvents() {
  // Brand home & nav dashboard button
  document.getElementById("brand-home").addEventListener("click", handleNavigateToDashboard);
  document.getElementById("btn-nav-dashboard").addEventListener("click", handleNavigateToDashboard);

  // Mode selection cards
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      configState.mode = card.dataset.mode;
      updateStartButtonLabel();
    });
  });

  // Set selection buttons
  document.querySelectorAll(".set-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".set-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      configState.setKey = btn.dataset.set;

      document.getElementById("random-config-panel").classList.toggle("hidden", configState.setKey !== "random");
      document.getElementById("custom-config-panel").classList.toggle("hidden", configState.setKey !== "custom");
      updateStartButtonLabel();
    });
  });

  document.getElementById("random-count-input").addEventListener("input", (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 55;
    if (val > QUESTIONS_DATA.length) val = QUESTIONS_DATA.length;
    configState.randomCount = val;
    updateStartButtonLabel();
  });

  const updateCustomRange = () => {
    let s = parseInt(document.getElementById("custom-start-input").value, 10) || 1;
    let end = parseInt(document.getElementById("custom-end-input").value, 10) || 60;
    s = Math.max(1, Math.min(QUESTIONS_DATA.length, s));
    end = Math.max(s, Math.min(QUESTIONS_DATA.length, end));
    configState.customStart = s;
    configState.customEnd = end;
    updateStartButtonLabel();
  };

  document.getElementById("custom-start-input").addEventListener("input", updateCustomRange);
  document.getElementById("custom-end-input").addEventListener("input", updateCustomRange);

  document.getElementById("btn-select-all-310").addEventListener("click", () => {
    document.getElementById("custom-start-input").value = 1;
    document.getElementById("custom-end-input").value = QUESTIONS_DATA.length;
    updateCustomRange();
  });

  document.getElementById("chk-shuffle-questions").addEventListener("change", (e) => {
    configState.shuffleQuestions = e.target.checked;
  });

  document.getElementById("btn-start-session").addEventListener("click", () => {
    startNewSessionFromConfig();
  });

  document.getElementById("btn-clear-sessions").addEventListener("click", () => {
    showConfirmModal(
      "Clear Saved Sessions",
      "Are you sure you want to delete all saved in-progress sessions?",
      () => {
        saveSessionsArray([]);
        renderDashboard();
      }
    );
  });

  document.getElementById("btn-clear-history").addEventListener("click", () => {
    showConfirmModal(
      "Clear Evaluation History",
      "Are you sure you want to clear all saved test scores and evaluations?",
      () => {
        saveScoreHistory([]);
        renderDashboard();
      }
    );
  });
}

function getSelectedQuestionCountPreview() {
  if (PRESET_SETS[configState.setKey]) {
    const p = PRESET_SETS[configState.setKey];
    return p.end - p.start + 1;
  }
  if (configState.setKey === "random") {
    return Math.min(QUESTIONS_DATA.length, Math.max(1, configState.randomCount || 55));
  }
  if (configState.setKey === "custom") {
    return Math.max(1, configState.customEnd - configState.customStart + 1);
  }
  return 52;
}

function updateStartButtonLabel() {
  const count = getSelectedQuestionCountPreview();
  const modeLabel = configState.mode === "test" ? "Start 2-Hour Test" : "Start Practice Session";
  document.getElementById("start-btn-text").textContent = `${modeLabel} (${count} Questions)`;
}

function renderDashboard() {
  const sessions = getSavedSessions();
  const history = getScoreHistory();

  // Top KPI stats
  document.getElementById("stat-total-bank").textContent = QUESTIONS_DATA.length;
  document.getElementById("stat-completed-count").textContent = history.length;
  const passedCount = history.filter((h) => h.passed).length;
  document.getElementById("stat-passed-count").textContent = passedCount;

  if (history.length > 0) {
    const avg = history.reduce((acc, h) => acc + h.percentage, 0) / history.length;
    const best = Math.max(...history.map((h) => h.percentage));
    document.getElementById("stat-avg-score").textContent = `${avg.toFixed(1)}%`;
    document.getElementById("stat-best-score").textContent = `${best.toFixed(1)}%`;
  } else {
    document.getElementById("stat-avg-score").textContent = "0%";
    document.getElementById("stat-best-score").textContent = "0%";
  }
  document.getElementById("stat-saved-count").textContent = sessions.length;

  // Render Saved Sessions
  const sessionsContainer = document.getElementById("saved-sessions-list");
  if (sessions.length === 0) {
    sessionsContainer.innerHTML = `<div class="empty-state">No paused or in-progress sessions saved. Start a Practice or Test session above!</div>`;
  } else {
    sessionsContainer.innerHTML = sessions
      .map((s) => {
        const total = s.questionIds.length;
        const answered = Object.keys(s.userAnswers || {}).filter((k) => (s.userAnswers[k] || "").length > 0).length;
        const modeBadge =
          s.mode === "test"
            ? `<span class="mode-badge test">TEST MODE</span>`
            : `<span class="mode-badge practice">PRACTICE MODE</span>`;
        const timeInfo =
          s.mode === "test"
            ? `Time Left: <strong>${formatDuration(s.remainingSeconds)}</strong>`
            : `Elapsed: <strong>${formatDuration(s.elapsedSeconds || 0)}</strong>`;
        const updatedDate = new Date(s.updatedAt).toLocaleString();

        return `
          <div class="session-item-card">
            <div>
              <div class="session-item-top">
                ${modeBadge}
                <span class="q-bank-id-badge">${answered} / ${total} Answered</span>
              </div>
              <div class="session-item-title">${escapeHtml(s.title)}</div>
              <div class="session-item-meta">
                <span>${timeInfo}</span>
                <span>Saved: ${escapeHtml(updatedDate)}</span>
              </div>
            </div>
            <div class="session-item-actions">
              <button type="button" class="btn btn-primary btn-sm" onclick="resumeSavedSession('${s.sessionId}')">
                Resume Session
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="restartSavedSession('${s.sessionId}')">
                Restart Test
              </button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="deleteSavedSession('${s.sessionId}')">
                Delete
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Render Score History
  const historyContainer = document.getElementById("history-list-container");
  if (history.length === 0) {
    historyContainer.innerHTML = `<div class="empty-state">No completed tests or practice sessions yet. Complete a session to see your comprehensive evaluation and score history here.</div>`;
  } else {
    const rows = history
      .map((h) => {
        const statusClass = h.passed ? "passed" : "failed";
        const statusLabel = h.passed ? "PASSED (≥75%)" : "FAILED (<75%)";
        const modeClass = h.mode === "test" ? "test" : "practice";
        const dateStr = new Date(h.completedAt).toLocaleString();

        return `
          <tr>
            <td><strong>${escapeHtml(h.title)}</strong></td>
            <td><span class="mode-badge ${modeClass}">${h.mode.toUpperCase()}</span></td>
            <td><strong>${h.correctCount} / ${h.totalQuestions}</strong></td>
            <td><strong>${h.percentage.toFixed(1)}%</strong></td>
            <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
            <td>${formatDuration(h.timeSpentSeconds)}</td>
            <td>${escapeHtml(dateStr)}</td>
            <td>
              <div class="session-item-actions">
                <button type="button" class="btn btn-secondary btn-xs" onclick="viewPastEvaluation('${h.evalId}')">
                  View Evaluation
                </button>
                <button type="button" class="btn btn-primary btn-xs" onclick="restartFromHistory('${h.evalId}')">
                  Restart Test
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    historyContainer.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Test / Set</th>
              <th>Mode</th>
              <th>Score</th>
              <th>Percentage</th>
              <th>Result (Pass: 75%)</th>
              <th>Time Spent</th>
              <th>Completed On</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
}

// ==================== SESSION CREATION, RESUME & RESTART ====================
function startNewSessionFromConfig() {
  let selectedIds = [];
  let title = "";

  if (PRESET_SETS[configState.setKey]) {
    const preset = PRESET_SETS[configState.setKey];
    title = preset.title;
    for (let i = preset.start; i <= preset.end; i++) {
      if (QUESTION_MAP.has(i)) selectedIds.push(i);
    }
  } else if (configState.setKey === "random") {
    const count = Math.min(QUESTIONS_DATA.length, Math.max(1, configState.randomCount || 55));
    const allIds = QUESTIONS_DATA.map((q) => q.id);
    shuffleArray(allIds);
    selectedIds = allIds.slice(0, count).sort((a, b) => a - b);
    title = `Random Exam (${count} Questions)`;
  } else if (configState.setKey === "custom") {
    const start = Math.max(1, Math.min(QUESTIONS_DATA.length, configState.customStart || 1));
    const end = Math.max(start, Math.min(QUESTIONS_DATA.length, configState.customEnd || 60));
    for (let i = start; i <= end; i++) {
      if (QUESTION_MAP.has(i)) selectedIds.push(i);
    }
    title = start === 1 && end === QUESTIONS_DATA.length
      ? `Full Question Bank (All ${QUESTIONS_DATA.length} Questions)`
      : `Custom Set (Q${start}–Q${end})`;
  }

  if (configState.shuffleQuestions) {
    shuffleArray(selectedIds);
  }

  launchSession({
    sessionId: "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    title,
    mode: configState.mode,
    questionIds: selectedIds,
    currentIndex: 0,
    userAnswers: {},       // { [questionId]: "C" or "BE" }
    revealedQuestions: {}, // { [questionId]: true } (used in Practice mode)
    flaggedQuestions: {},  // { [questionId]: true }
    remainingSeconds: TEST_DURATION_SECONDS,
    elapsedSeconds: 0,
    isPaused: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function launchSession(sessionObj) {
  stopTimer();
  activeSession = sessionObj;
  activeSession.isPaused = false;
  currentNavFilter = "all";
  document.querySelectorAll("#nav-filter-tabs .nav-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.filter === "all");
  });

  upsertActiveSessionToStorage();
  switchView("exam");
  configureExamHeaderForMode();
  renderCurrentQuestion();
  renderQuestionPalette();
  startTimer();
}

window.resumeSavedSession = function (sessionId) {
  const found = getSavedSessions().find((s) => s.sessionId === sessionId);
  if (!found) return;
  launchSession(found);
};

window.restartSavedSession = function (sessionId) {
  const found = getSavedSessions().find((s) => s.sessionId === sessionId);
  if (!found) return;
  found.currentIndex = 0;
  found.userAnswers = {};
  found.revealedQuestions = {};
  found.flaggedQuestions = {};
  found.remainingSeconds = TEST_DURATION_SECONDS;
  found.elapsedSeconds = 0;
  found.isPaused = false;
  launchSession(found);
};

window.deleteSavedSession = function (sessionId) {
  removeSavedSession(sessionId);
  renderDashboard();
};

function restartCurrentActiveSession() {
  if (!activeSession) return;
  activeSession.currentIndex = 0;
  activeSession.userAnswers = {};
  activeSession.revealedQuestions = {};
  activeSession.flaggedQuestions = {};
  activeSession.remainingSeconds = TEST_DURATION_SECONDS;
  activeSession.elapsedSeconds = 0;
  activeSession.isPaused = false;
  document.getElementById("pause-overlay").classList.add("hidden");
  upsertActiveSessionToStorage();
  configureExamHeaderForMode();
  renderCurrentQuestion();
  renderQuestionPalette();
  startTimer();
}

// ==================== ACTIVE EXAM & PRACTICE VIEW ====================
function bindExamEvents() {
  document.getElementById("btn-prev-question").addEventListener("click", () => {
    if (activeSession && activeSession.currentIndex > 0) {
      activeSession.currentIndex--;
      upsertActiveSessionToStorage();
      renderCurrentQuestion();
      renderQuestionPalette();
    }
  });

  document.getElementById("btn-next-question").addEventListener("click", () => {
    if (!activeSession) return;
    if (activeSession.currentIndex < activeSession.questionIds.length - 1) {
      activeSession.currentIndex++;
      upsertActiveSessionToStorage();
      renderCurrentQuestion();
      renderQuestionPalette();
    } else {
      confirmFinishSession();
    }
  });

  document.getElementById("btn-clear-answer").addEventListener("click", () => {
    if (!activeSession) return;
    const qId = activeSession.questionIds[activeSession.currentIndex];
    delete activeSession.userAnswers[qId];
    delete activeSession.revealedQuestions[qId];
    upsertActiveSessionToStorage();
    updateExamTopbarCounters();
    renderCurrentQuestion();
    renderQuestionPalette();
  });

  document.getElementById("btn-check-answer").addEventListener("click", () => {
    if (!activeSession || activeSession.mode !== "practice") return;
    const qId = activeSession.questionIds[activeSession.currentIndex];
    activeSession.revealedQuestions[qId] = true;
    upsertActiveSessionToStorage();
    updateExamTopbarCounters();
    renderCurrentQuestion();
    renderQuestionPalette();
  });

  document.getElementById("btn-flag-question").addEventListener("click", () => {
    if (!activeSession) return;
    const qId = activeSession.questionIds[activeSession.currentIndex];
    if (activeSession.flaggedQuestions[qId]) {
      delete activeSession.flaggedQuestions[qId];
    } else {
      activeSession.flaggedQuestions[qId] = true;
    }
    upsertActiveSessionToStorage();
    updateExamTopbarCounters();
    renderCurrentQuestion();
    renderQuestionPalette();
  });

  // Pause / Resume Timer
  document.getElementById("btn-pause-timer").addEventListener("click", () => {
    togglePauseTimer();
  });
  document.getElementById("btn-resume-from-modal").addEventListener("click", () => {
    if (activeSession && activeSession.isPaused) {
      togglePauseTimer();
    }
  });
  document.getElementById("btn-restart-from-modal").addEventListener("click", () => {
    showConfirmModal(
      "Restart Test",
      "Are you sure you want to restart this test from Question 1? All current answers and timer progress will be reset.",
      () => restartCurrentActiveSession()
    );
  });
  document.getElementById("btn-save-from-modal").addEventListener("click", () => {
    document.getElementById("pause-overlay").classList.add("hidden");
    saveAndExitToDashboard();
  });

  // Topbar Restart, Save & Exit, Finish
  document.getElementById("btn-restart-active").addEventListener("click", () => {
    showConfirmModal(
      "Restart Current Session",
      "Restart this session from Question 1? Your current answers will be cleared and the timer will be reset.",
      () => restartCurrentActiveSession()
    );
  });

  document.getElementById("btn-save-exit").addEventListener("click", () => {
    saveAndExitToDashboard();
  });

  document.getElementById("btn-finish-session").addEventListener("click", () => {
    confirmFinishSession();
  });

  // Navigator filter tabs
  document.querySelectorAll("#nav-filter-tabs .nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#nav-filter-tabs .nav-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentNavFilter = tab.dataset.filter;
      renderQuestionPalette();
    });
  });
}

function configureExamHeaderForMode() {
  if (!activeSession) return;
  const isTest = activeSession.mode === "test";

  const modeBadge = document.getElementById("active-mode-badge");
  modeBadge.textContent = isTest ? "TEST MODE (2H)" : "PRACTICE MODE";
  modeBadge.className = `mode-badge ${isTest ? "test" : "practice"}`;

  document.getElementById("active-set-title").textContent = activeSession.title;

  // Toggle practice vs test counters
  document.getElementById("practice-live-counters").classList.toggle("hidden", isTest);
  document.getElementById("test-live-counters").classList.toggle("hidden", !isTest);

  // Toggle navigator tabs & legend items for mode
  document.querySelectorAll(".practice-only-tab").forEach((el) => el.classList.toggle("hidden", isTest));
  document.querySelectorAll(".practice-legend").forEach((el) => el.classList.toggle("hidden", isTest));
  document.querySelectorAll(".test-legend").forEach((el) => el.classList.toggle("hidden", !isTest));

  // Timer label & pause button
  document.getElementById("timer-label").textContent = isTest ? "TIME LEFT (2H)" : "TIME ELAPSED";
  const pauseBtn = document.getElementById("btn-pause-timer");
  pauseBtn.textContent = "Pause";

  updateExamTopbarCounters();
  updateTimerDisplay();
}

function updateExamTopbarCounters() {
  if (!activeSession) return;
  const total = activeSession.questionIds.length;
  let answeredCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let flaggedCount = Object.keys(activeSession.flaggedQuestions || {}).length;

  activeSession.questionIds.forEach((qId) => {
    const ans = activeSession.userAnswers[qId] || "";
    if (ans.length > 0) answeredCount++;

    if (activeSession.mode === "practice" && activeSession.revealedQuestions[qId]) {
      const qObj = QUESTION_MAP.get(qId);
      if (qObj && isAnswerCorrect(ans, qObj.answer)) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }
  });

  const pct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  document.getElementById("active-progress-fill").style.width = `${pct}%`;
  document.getElementById("active-progress-text").textContent = `${answeredCount} / ${total} Answered`;

  if (activeSession.mode === "practice") {
    document.getElementById("live-correct-count").textContent = correctCount;
    document.getElementById("live-incorrect-count").textContent = incorrectCount;
    document.getElementById("live-remaining-count").textContent = Math.max(0, total - (correctCount + incorrectCount));
  } else {
    document.getElementById("live-test-answered").textContent = `${answeredCount} / ${total}`;
    document.getElementById("live-test-flagged").textContent = flaggedCount;
  }
}

function renderCurrentQuestion() {
  if (!activeSession) return;
  const total = activeSession.questionIds.length;
  const idx = activeSession.currentIndex;
  const qId = activeSession.questionIds[idx];
  const qObj = QUESTION_MAP.get(qId);
  if (!qObj) return;

  const isPractice = activeSession.mode === "practice";
  const userAns = activeSession.userAnswers[qId] || "";
  const isRevealed = isPractice && Boolean(activeSession.revealedQuestions[qId]);
  const isFlagged = Boolean(activeSession.flaggedQuestions[qId]);
  const requiredSelections = qObj.answer.length;

  // Header badges
  document.getElementById("q-index-badge").textContent = `Question ${idx + 1} of ${total}`;
  document.getElementById("q-bank-id-badge").textContent = `PDF Question #${qObj.id}`;

  const typeBadge = document.getElementById("q-type-badge");
  if (requiredSelections > 1) {
    typeBadge.textContent = `Multiple Choice (Select ${requiredSelections})`;
    typeBadge.className = "q-type-badge multi";
  } else {
    typeBadge.textContent = "Single Choice";
    typeBadge.className = "q-type-badge";
  }

  // Flag button
  const flagBtn = document.getElementById("btn-flag-question");
  flagBtn.classList.toggle("flagged", isFlagged);
  document.getElementById("flag-btn-text").textContent = isFlagged ? "Flagged" : "Flag for Review";

  // Question stem & code/diagram block
  document.getElementById("question-stem").textContent = qObj.question;
  const codeBlockEl = document.getElementById("question-code-block");
  if (qObj.codeBlock) {
    codeBlockEl.textContent = qObj.codeBlock;
    codeBlockEl.classList.remove("hidden");
  } else {
    codeBlockEl.textContent = "";
    codeBlockEl.classList.add("hidden");
  }

  // Render Options
  const optionsContainer = document.getElementById("options-container");
  const optionKeys = Object.keys(qObj.options);

  optionsContainer.innerHTML = optionKeys
    .map((key) => {
      const optText = qObj.options[key];
      const isSelected = userAns.includes(key);
      const isCorrectKey = qObj.answer.includes(key);

      let classes = ["option-item"];
      if (isSelected) classes.push("selected");

      let badgeHtml = "";
      if (isRevealed) {
        if (isCorrectKey) {
          classes.push("correct-option");
          badgeHtml = `<span class="option-tag correct">✓ Correct Answer</span>`;
        } else if (isSelected && !isCorrectKey) {
          classes.push("wrong-option");
          badgeHtml = `<span class="option-tag wrong">✗ Your Selection</span>`;
        }
      }

      return `
        <div class="${classes.join(" ")}" data-opt="${key}" onclick="handleSelectOption('${key}')">
          <div class="option-key">${key}</div>
          <div class="option-text">${escapeHtml(optText)}</div>
          ${badgeHtml}
        </div>
      `;
    })
    .join("");

  // Practice Mode Feedback & Explanation
  const feedbackPanel = document.getElementById("practice-feedback-panel");
  const checkBtn = document.getElementById("btn-check-answer");

  if (isPractice) {
    checkBtn.classList.toggle("hidden", isRevealed);
    if (isRevealed) {
      const correct = isAnswerCorrect(userAns, qObj.answer);
      const banner = document.getElementById("feedback-banner");
      banner.className = `feedback-banner ${correct ? "correct" : "incorrect"}`;
      document.getElementById("feedback-status-icon").textContent = correct ? "✓" : "✗";
      document.getElementById("feedback-status-title").textContent = correct
        ? "Correct Answer!"
        : userAns
        ? `Incorrect — You selected ${userAns.split("").join(", ")}`
        : "Answer Revealed (No option selected)";
      document.getElementById("feedback-status-subtitle").textContent = `Official Correct Answer: ${qObj.answer
        .split("")
        .join(", ")}`;
      document.getElementById("feedback-explanation-text").innerHTML = formatExplanationHtml(qObj.explanation);
      feedbackPanel.classList.remove("hidden");
    } else {
      feedbackPanel.classList.add("hidden");
    }
  } else {
    checkBtn.classList.add("hidden");
    feedbackPanel.classList.add("hidden");
  }

  // Footer Prev / Next buttons
  document.getElementById("btn-prev-question").disabled = idx === 0;
  const nextBtn = document.getElementById("btn-next-question");
  nextBtn.innerHTML = idx === total - 1 ? "Finish &amp; Evaluate &rarr;" : "Next &rarr;";
}

window.handleSelectOption = function (key) {
  if (!activeSession || activeSession.isPaused) return;
  const qId = activeSession.questionIds[activeSession.currentIndex];
  const qObj = QUESTION_MAP.get(qId);
  if (!qObj) return;

  const requiredCount = qObj.answer.length;
  let currentAns = activeSession.userAnswers[qId] || "";

  if (requiredCount === 1) {
    currentAns = key;
    activeSession.userAnswers[qId] = currentAns;
    // In Practice Mode, immediately reveal answer & explanation upon choosing an option
    if (activeSession.mode === "practice") {
      activeSession.revealedQuestions[qId] = true;
    }
  } else {
    // Multi-select question (e.g., Choose 2)
    let selectedArr = currentAns ? currentAns.split("") : [];
    if (selectedArr.includes(key)) {
      selectedArr = selectedArr.filter((k) => k !== key);
    } else {
      if (selectedArr.length >= requiredCount) {
        selectedArr.shift();
      }
      selectedArr.push(key);
    }
    selectedArr.sort();
    currentAns = selectedArr.join("");
    activeSession.userAnswers[qId] = currentAns;

    // Auto-reveal in Practice mode once required number of options are selected
    if (activeSession.mode === "practice" && selectedArr.length === requiredCount) {
      activeSession.revealedQuestions[qId] = true;
    }
  }

  upsertActiveSessionToStorage();
  updateExamTopbarCounters();
  renderCurrentQuestion();
  renderQuestionPalette();
};

function renderQuestionPalette() {
  if (!activeSession) return;
  const grid = document.getElementById("question-palette-grid");
  const total = activeSession.questionIds.length;
  const isPractice = activeSession.mode === "practice";

  document.getElementById("nav-summary-pill").textContent = `Q${activeSession.currentIndex + 1} of ${total}`;

  const buttonsHtml = activeSession.questionIds
    .map((qId, i) => {
      const ans = activeSession.userAnswers[qId] || "";
      const isAnswered = ans.length > 0;
      const isRevealed = isPractice && Boolean(activeSession.revealedQuestions[qId]);
      const isFlagged = Boolean(activeSession.flaggedQuestions[qId]);
      const qObj = QUESTION_MAP.get(qId);
      const isCorrect = isRevealed && qObj && isAnswerCorrect(ans, qObj.answer);
      const isIncorrect = isRevealed && (!qObj || !isAnswerCorrect(ans, qObj.answer));

      // Apply filter
      if (currentNavFilter === "unanswered" && isAnswered) return "";
      if (currentNavFilter === "flagged" && !isFlagged) return "";
      if (currentNavFilter === "correct" && !isCorrect) return "";
      if (currentNavFilter === "incorrect" && !isIncorrect) return "";

      let classes = ["palette-btn"];
      if (i === activeSession.currentIndex) classes.push("current");
      if (isPractice) {
        if (isCorrect) classes.push("correct");
        else if (isIncorrect) classes.push("incorrect");
        else if (isAnswered) classes.push("answered");
      } else {
        if (isAnswered) classes.push("answered");
      }
      if (isFlagged) classes.push("flagged");

      return `<button type="button" class="${classes.join(" ")}" onclick="jumpToQuestion(${i})">${i + 1}</button>`;
    })
    .join("");

  grid.innerHTML =
    buttonsHtml || `<div style="grid-column: 1 / -1; font-size: 0.78rem; color: var(--text-muted); text-align:center; padding: 0.75rem;">No matching questions</div>`;
}

window.jumpToQuestion = function (index) {
  if (!activeSession) return;
  activeSession.currentIndex = index;
  upsertActiveSessionToStorage();
  renderCurrentQuestion();
  renderQuestionPalette();
};

// ==================== TIMER & PAUSE LOGIC ====================
function startTimer() {
  stopTimer();
  if (!activeSession) return;

  timerIntervalId = setInterval(() => {
    if (!activeSession || activeSession.isPaused) return;

    activeSession.elapsedSeconds = (activeSession.elapsedSeconds || 0) + 1;

    if (activeSession.mode === "test") {
      activeSession.remainingSeconds = Math.max(0, (activeSession.remainingSeconds || 0) - 1);
      updateTimerDisplay();

      if (activeSession.remainingSeconds % 5 === 0) {
        upsertActiveSessionToStorage();
      }

      if (activeSession.remainingSeconds <= 0) {
        stopTimer();
        finalizeAndEvaluateSession(true);
      }
    } else {
      updateTimerDisplay();
      if (activeSession.elapsedSeconds % 10 === 0) {
        upsertActiveSessionToStorage();
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function togglePauseTimer() {
  if (!activeSession) return;
  activeSession.isPaused = !activeSession.isPaused;
  upsertActiveSessionToStorage();

  const pauseBtn = document.getElementById("btn-pause-timer");
  const pauseOverlay = document.getElementById("pause-overlay");

  if (activeSession.isPaused) {
    pauseBtn.textContent = "Resume";
    const total = activeSession.questionIds.length;
    const answered = Object.keys(activeSession.userAnswers || {}).filter(
      (k) => (activeSession.userAnswers[k] || "").length > 0
    ).length;

    document.getElementById("pause-time-remaining").textContent =
      activeSession.mode === "test"
        ? formatDuration(activeSession.remainingSeconds)
        : formatDuration(activeSession.elapsedSeconds);
    document.getElementById("pause-progress-text").textContent = `${answered} / ${total} Answered`;
    pauseOverlay.classList.remove("hidden");
  } else {
    pauseBtn.textContent = "Pause";
    pauseOverlay.classList.add("hidden");
  }
}

function updateTimerDisplay() {
  if (!activeSession) return;
  const timerBox = document.getElementById("timer-box");
  const display = document.getElementById("timer-display");

  if (activeSession.mode === "test") {
    const rem = activeSession.remainingSeconds;
    display.textContent = formatDuration(rem);
    timerBox.classList.toggle("warning", rem <= 900 && rem > 300);
    timerBox.classList.toggle("danger", rem <= 300);
  } else {
    display.textContent = formatDuration(activeSession.elapsedSeconds || 0);
    timerBox.classList.remove("warning", "danger");
  }
}

function saveAndExitToDashboard() {
  stopTimer();
  if (activeSession) {
    activeSession.isPaused = false;
    upsertActiveSessionToStorage();
    activeSession = null;
  }
  switchView("dashboard");
  renderDashboard();
}

function handleNavigateToDashboard() {
  if (activeSession) {
    saveAndExitToDashboard();
  } else {
    switchView("dashboard");
    renderDashboard();
  }
}

// ==================== EVALUATION & SCORING (75% PASS MARK) ====================
function confirmFinishSession() {
  if (!activeSession) return;
  const total = activeSession.questionIds.length;
  const answered = activeSession.questionIds.filter(
    (qId) => (activeSession.userAnswers[qId] || "").length > 0
  ).length;
  const unanswered = total - answered;

  const msg =
    unanswered > 0
      ? `You have ${unanswered} unanswered question(s) out of ${total}. Are you sure you want to finish and view your comprehensive evaluation?`
      : `You have answered all ${total} questions. Submit now and view your comprehensive evaluation?`;

  showConfirmModal("Finish & Evaluate Session", msg, () => {
    finalizeAndEvaluateSession(false);
  });
}

function finalizeAndEvaluateSession(autoExpired = false) {
  stopTimer();
  if (!activeSession) return;

  const total = activeSession.questionIds.length;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  activeSession.questionIds.forEach((qId) => {
    const qObj = QUESTION_MAP.get(qId);
    const userAns = activeSession.userAnswers[qId] || "";
    if (!userAns) {
      unansweredCount++;
    } else if (qObj && isAnswerCorrect(userAns, qObj.answer)) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  });

  const percentage = total > 0 ? (correctCount / total) * 100 : 0;
  const passed = percentage >= PASS_PERCENTAGE;
  const timeSpentSeconds =
    activeSession.mode === "test"
      ? Math.max(1, TEST_DURATION_SECONDS - (activeSession.remainingSeconds || 0))
      : activeSession.elapsedSeconds || 0;

  const evalRecord = {
    evalId: "eval_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    title: activeSession.title,
    mode: activeSession.mode,
    questionIds: [...activeSession.questionIds],
    userAnswers: { ...activeSession.userAnswers },
    totalQuestions: total,
    correctCount,
    incorrectCount,
    unansweredCount,
    percentage,
    passed,
    timeSpentSeconds,
    autoExpired,
    completedAt: new Date().toISOString()
  };

  // Save to score history & remove from in-progress sessions
  const history = getScoreHistory();
  history.unshift(evalRecord);
  saveScoreHistory(history);
  removeSavedSession(activeSession.sessionId);

  activeSession = null;
  displayEvaluationRecord(evalRecord);
}

function bindEvaluationEvents() {
  document.getElementById("btn-eval-restart").addEventListener("click", () => {
    if (!currentEvaluationRecord) return;
    launchSession({
      sessionId: "sess_" + Date.now(),
      title: currentEvaluationRecord.title,
      mode: currentEvaluationRecord.mode,
      questionIds: [...currentEvaluationRecord.questionIds],
      currentIndex: 0,
      userAnswers: {},
      revealedQuestions: {},
      flaggedQuestions: {},
      remainingSeconds: TEST_DURATION_SECONDS,
      elapsedSeconds: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  document.getElementById("btn-eval-retry-wrong").addEventListener("click", () => {
    if (!currentEvaluationRecord) return;
    const missedIds = currentEvaluationRecord.questionIds.filter((qId) => {
      const qObj = QUESTION_MAP.get(qId);
      const ans = currentEvaluationRecord.userAnswers[qId] || "";
      return !ans || !qObj || !isAnswerCorrect(ans, qObj.answer);
    });

    if (missedIds.length === 0) return;

    launchSession({
      sessionId: "sess_" + Date.now(),
      title: `${currentEvaluationRecord.title} (Retry ${missedIds.length} Missed/Skipped)`,
      mode: "practice",
      questionIds: missedIds,
      currentIndex: 0,
      userAnswers: {},
      revealedQuestions: {},
      flaggedQuestions: {},
      remainingSeconds: TEST_DURATION_SECONDS,
      elapsedSeconds: 0,
      isPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  document.getElementById("btn-eval-dashboard").addEventListener("click", () => {
    switchView("dashboard");
    renderDashboard();
  });

  document.querySelectorAll("#review-filter-pills .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#review-filter-pills .filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentReviewFilter = pill.dataset.rfilter;
      renderEvaluationReviewList();
    });
  });

  document.getElementById("review-search-input").addEventListener("input", () => {
    renderEvaluationReviewList();
  });
}

function displayEvaluationRecord(record) {
  currentEvaluationRecord = record;
  currentReviewFilter = "all";
  document.getElementById("review-search-input").value = "";
  document.querySelectorAll("#review-filter-pills .filter-pill").forEach((p) => {
    p.classList.toggle("active", p.dataset.rfilter === "all");
  });

  switchView("evaluation");

  // Score Ring SVG animation
  const circumference = 2 * Math.PI * 68; // ~427.26
  const offset = circumference - (record.percentage / 100) * circumference;
  const ringCircle = document.getElementById("eval-score-ring-circle");
  ringCircle.style.strokeDashoffset = offset;
  ringCircle.style.stroke = record.passed ? "var(--success)" : "var(--danger)";

  document.getElementById("eval-percentage-text").textContent = `${record.percentage.toFixed(1)}%`;

  // Badges
  const passBadge = document.getElementById("eval-pass-badge");
  passBadge.textContent = record.passed ? "PASSED (≥75%)" : "FAILED (<75%)";
  passBadge.className = `pass-status-badge ${record.passed ? "passed" : "failed"}`;

  const modeBadge = document.getElementById("eval-mode-badge");
  modeBadge.textContent = record.mode === "test" ? "TEST MODE" : "PRACTICE MODE";
  modeBadge.className = `mode-badge ${record.mode === "test" ? "test" : "practice"}`;

  document.getElementById("eval-date-text").textContent = `Completed ${new Date(record.completedAt).toLocaleString()}`;
  document.getElementById("eval-title").textContent = `${record.title} — Evaluation Report`;

  const requiredCorrect = Math.ceil((PASS_PERCENTAGE / 100) * record.totalQuestions);
  const verdictEl = document.getElementById("eval-verdict-message");
  if (record.passed) {
    verdictEl.textContent = `Congratulations! You scored ${record.correctCount} out of ${record.totalQuestions} (${record.percentage.toFixed(
      1
    )}%), exceeding the 75% passing requirement (${requiredCorrect} correct answers needed).`;
  } else {
    const neededMore = Math.max(1, requiredCorrect - record.correctCount);
    verdictEl.textContent = `You scored ${record.correctCount} out of ${record.totalQuestions} (${record.percentage.toFixed(
      1
    )}%). The passing threshold is 75% (${requiredCorrect} correct answers — you needed ${neededMore} more correct answer${
      neededMore > 1 ? "s" : ""
    } to pass).`;
  }

  // KPIs
  document.getElementById("eval-kpi-score").textContent = `${record.correctCount} / ${record.totalQuestions}`;
  document.getElementById("eval-kpi-correct").textContent = `${record.correctCount}`;
  document.getElementById("eval-kpi-incorrect").textContent = `${record.incorrectCount}`;
  document.getElementById("eval-kpi-unanswered").textContent = `${record.unansweredCount}`;
  document.getElementById("eval-kpi-time").textContent = formatDuration(record.timeSpentSeconds);

  // Enable/disable retry wrong button
  const hasMissed = record.incorrectCount + record.unansweredCount > 0;
  document.getElementById("btn-eval-retry-wrong").disabled = !hasMissed;

  // Filter pill counts
  document.getElementById("rfilter-all").textContent = `All (${record.totalQuestions})`;
  document.getElementById("rfilter-incorrect").textContent = `Incorrect (${record.incorrectCount})`;
  document.getElementById("rfilter-correct").textContent = `Correct (${record.correctCount})`;
  document.getElementById("rfilter-unanswered").textContent = `Unanswered (${record.unansweredCount})`;

  renderEvaluationReviewList();
}

function renderEvaluationReviewList() {
  if (!currentEvaluationRecord) return;
  const container = document.getElementById("review-questions-list");
  const searchQuery = (document.getElementById("review-search-input").value || "").trim().toLowerCase();

  const itemsHtml = currentEvaluationRecord.questionIds
    .map((qId, idx) => {
      const qObj = QUESTION_MAP.get(qId);
      if (!qObj) return "";

      const userAns = currentEvaluationRecord.userAnswers[qId] || "";
      const isUnanswered = userAns.length === 0;
      const isCorrect = !isUnanswered && isAnswerCorrect(userAns, qObj.answer);
      const status = isUnanswered ? "unanswered" : isCorrect ? "correct" : "incorrect";

      if (currentReviewFilter !== "all" && currentReviewFilter !== status) {
        return "";
      }

      if (searchQuery) {
        const hay = `${qObj.id} ${qObj.question} ${qObj.explanation} ${Object.values(qObj.options).join(" ")}`.toLowerCase();
        if (!hay.includes(searchQuery)) return "";
      }

      const statusBadgeHtml =
        status === "correct"
          ? `<span class="status-pill passed">✓ Correct</span>`
          : status === "incorrect"
          ? `<span class="status-pill failed">✗ Incorrect (Your Answer: ${userAns})</span>`
          : `<span class="status-pill failed">Unanswered</span>`;

      const optionsHtml = Object.keys(qObj.options)
        .map((key) => {
          const isUserKey = userAns.includes(key);
          const isRightKey = qObj.answer.includes(key);

          let cls = "option-item locked";
          let tag = "";
          if (isRightKey) {
            cls += " correct-option";
            tag = `<span class="option-tag correct">${isUserKey ? "✓ Your Answer (Correct)" : "✓ Correct Answer"}</span>`;
          } else if (isUserKey) {
            cls += " wrong-option";
            tag = `<span class="option-tag wrong">✗ Your Answer</span>`;
          }

          return `
            <div class="${cls}">
              <div class="option-key">${key}</div>
              <div class="option-text">${escapeHtml(qObj.options[key])}</div>
              ${tag}
            </div>
          `;
        })
        .join("");

      const codeHtml = qObj.codeBlock
        ? `<pre class="question-code-block">${escapeHtml(qObj.codeBlock)}</pre>`
        : "";

      return `
        <div class="review-item-card ${status}">
          <div class="review-item-top">
            <div class="q-badges">
              <span class="q-index-badge">Question ${idx + 1}</span>
              <span class="q-bank-id-badge">PDF #${qObj.id}</span>
            </div>
            ${statusBadgeHtml}
          </div>
          <div class="question-stem">${escapeHtml(qObj.question)}</div>
          ${codeHtml}
          <div class="options-container">${optionsHtml}</div>
          <div class="explanation-box" style="background: var(--bg-card); border-radius: 10px; border: 1px solid var(--border-color);">
            <h4>Official Answer (${qObj.answer}) &amp; Explanation</h4>
            <div class="explanation-content">${formatExplanationHtml(qObj.explanation)}</div>
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  container.innerHTML =
    itemsHtml || `<div class="empty-state">No questions match the selected filter or search query.</div>`;
}

window.viewPastEvaluation = function (evalId) {
  const found = getScoreHistory().find((h) => h.evalId === evalId);
  if (!found) return;
  displayEvaluationRecord(found);
};

window.restartFromHistory = function (evalId) {
  const found = getScoreHistory().find((h) => h.evalId === evalId);
  if (!found) return;
  launchSession({
    sessionId: "sess_" + Date.now(),
    title: found.title,
    mode: found.mode,
    questionIds: [...found.questionIds],
    currentIndex: 0,
    userAnswers: {},
    revealedQuestions: {},
    flaggedQuestions: {},
    remainingSeconds: TEST_DURATION_SECONDS,
    elapsedSeconds: 0,
    isPaused: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
};

// ==================== VIEW & MODAL HELPERS ====================
function switchView(viewName) {
  document.getElementById("dashboard-view").classList.toggle("hidden", viewName !== "dashboard");
  document.getElementById("exam-view").classList.toggle("hidden", viewName !== "exam");
  document.getElementById("evaluation-view").classList.toggle("hidden", viewName !== "evaluation");
  document.getElementById("btn-nav-dashboard").classList.toggle("hidden", viewName === "dashboard");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindModalEvents() {
  document.getElementById("btn-confirm-cancel").addEventListener("click", () => {
    document.getElementById("confirm-modal").classList.add("hidden");
    confirmCallback = null;
  });
  document.getElementById("btn-confirm-ok").addEventListener("click", () => {
    document.getElementById("confirm-modal").classList.add("hidden");
    if (typeof confirmCallback === "function") {
      const cb = confirmCallback;
      confirmCallback = null;
      cb();
    }
  });
}

function showConfirmModal(title, message, onConfirm) {
  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;
  confirmCallback = onConfirm;
  document.getElementById("confirm-modal").classList.remove("hidden");
}

// ==================== UTILITIES ====================
function isAnswerCorrect(userAns, officialAns) {
  if (!userAns || !officialAns) return false;
  const normalize = (s) => s.toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join("");
  return normalize(userAns) === normalize(officialAns);
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExplanationHtml(text) {
  const escaped = escapeHtml(text || "No explanation provided.");
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const cleanUrl = url.replace(/[.,;)]+$/, "");
    const trailing = url.slice(cleanUrl.length);
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
  });
}
