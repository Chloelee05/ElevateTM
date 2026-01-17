const elements = {
  gameStatus: document.getElementById("gameStatus"),
  roundNum: document.getElementById("roundNum"),
  maintenanceFee: document.getElementById("maintenanceFee"),
  playerMoney: document.getElementById("playerMoney"),
  playerScore: document.getElementById("playerScore"),
  aiMoney: document.getElementById("aiMoney"),
  aiScore: document.getElementById("aiScore"),
  aiBid: document.getElementById("aiBid"),
  bidForm: document.getElementById("bidForm"),
  bidInput: document.getElementById("bidInput"),
  bidHint: document.getElementById("bidHint"),
  bidTimer: document.getElementById("bidTimer"),
  timerLabel: document.getElementById("timerLabel"),
  bidError: document.getElementById("bidError"),
  roundResult: document.getElementById("roundResult"),
  aiReasons: document.getElementById("aiReasons"),
  startScreen: document.getElementById("startScreen"),
  startButton: document.getElementById("startButton"),
  reportModal: document.getElementById("reportModal"),
  reportClose: document.getElementById("reportClose"),
  reportRestart: document.getElementById("reportRestart"),
  resultTitle: document.getElementById("resultTitle"),
  resultMessage: document.getElementById("resultMessage"),
  finalPlayerScore: document.getElementById("finalPlayerScore"),
  finalAiScore: document.getElementById("finalAiScore"),
  finalArchetype: document.getElementById("finalArchetype"),
  reportGrid: document.getElementById("reportGrid"),
  finalTakeaway: document.getElementById("finalTakeaway"),
  finalSuggestions: document.getElementById("finalSuggestions"),
  playerBid: document.getElementById("playerBid"),
};

let currentState = null;
let timerId = null;
let timeLeft = 10;
let bidLocked = false;
let lockedBidValue = null;
let cooldownId = null;
let cooldownLeft = 0;
let pendingCooldown = false;
let gameStarted = false;
let endTimerId = null;

function parseReportDetails(reportText) {
  if (!reportText) {
    return { highlights: [], archetype: "", takeaway: "", suggestions: [] };
  }
  const lines = reportText.split(/\r?\n/).map((line) => line.trim());
  const inlineLabels = [
    "Risk Posture",
    "Capital Efficiency",
    "Emotional Discipline",
    "Liquidity Management",
    "Adaptability",
  ];

  const results = [];
  for (const label of inlineLabels) {
    const line = lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase() + ":"));
    if (!line) continue;
    const value = line.slice(label.length + 1).trim();
    if (value) results.push({ label, value });
  }

  const sectionValue = (label) => {
    const headerIndex = lines.findIndex((l) => l.toLowerCase() === (label + ":").toLowerCase());
    if (headerIndex === -1) return "";
    for (let i = headerIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      if (line.endsWith(":") && line.length > 1) return "";
      return line;
    }
    return "";
  };

  const archetype = sectionValue("Overall Archetype");
  const takeaway = sectionValue("Key Takeaway");

  const suggestionsIndex = lines.findIndex(
    (l) => l.toLowerCase() === "player suggestions:"
  );
  const suggestions = [];
  if (suggestionsIndex !== -1) {
    for (let i = suggestionsIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      if (line.endsWith(":") && line.length > 1) break;
      if (line.startsWith("-")) suggestions.push(line.replace(/^-+\s*/, ""));
      if (suggestions.length >= 3) break;
    }
  }

  return { highlights: results, archetype, takeaway, suggestions: suggestionsIndex === -1 ? [] : suggestions };
}

function formatMoneyPerPoint(state) {
  const totalBids = state.history.reduce((acc, rec) => acc + (rec.player_bid || 0), 0);
  const points = Math.max(1, state.player.score);
  const perPoint = Math.round(totalBids / points);
  return `$${perPoint}/point`;
}

function renderFinalReport(reportText, state, outcome) {
  const details = parseReportDetails(reportText);
  const rounds = state.history.length;
  const playerWins = state.history.filter((r) => r.winner === "PLAYER").length;
  const winRate = rounds > 0 ? ((playerWins / rounds) * 100).toFixed(0) + "%" : "0%";

  const resultLabel =
    state.player.score > state.ai.score
      ? "VICTORY"
      : state.player.score < state.ai.score
      ? "DEFEAT"
      : "DRAW";

  if (elements.resultTitle) elements.resultTitle.textContent = resultLabel;
  if (elements.resultMessage) {
    elements.resultMessage.textContent = outcome?.message || "Final results locked.";
  }
  if (elements.finalPlayerScore) elements.finalPlayerScore.textContent = String(state.player.score);
  if (elements.finalAiScore) elements.finalAiScore.textContent = String(state.ai.score);
  if (elements.finalArchetype) elements.finalArchetype.textContent = details.archetype || "-";
  if (elements.finalTakeaway) elements.finalTakeaway.textContent = details.takeaway || "-";

  if (elements.finalSuggestions) {
    elements.finalSuggestions.innerHTML = "";
    if (details.suggestions.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No suggestions provided.";
      elements.finalSuggestions.appendChild(li);
    } else {
      details.suggestions.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        elements.finalSuggestions.appendChild(li);
      });
    }
  }

  if (elements.reportGrid) {
    elements.reportGrid.innerHTML = "";
    const addCard = (title, value, className) => {
      const card = document.createElement("div");
      card.className = `report-card ${className}`;
      const t = document.createElement("div");
      t.className = "report-card-title";
      t.textContent = title;
      const v = document.createElement("div");
      v.className = "report-card-value";
      v.textContent = value;
      card.appendChild(t);
      card.appendChild(v);
      elements.reportGrid.appendChild(card);
    };

    const getHighlight = (label) =>
      details.highlights.find((h) => h.label.toLowerCase() === label.toLowerCase())?.value || "-";

    addCard("RISK POSTURE", getHighlight("Risk Posture"), "card-risk");
    addCard("CAPITAL EFFICIENCY", formatMoneyPerPoint(state), "card-efficiency");
    addCard("WIN RATE", winRate, "card-winrate");
    addCard("LIQUIDITY", getHighlight("Liquidity Management"), "card-liquidity");
    addCard("FINAL CREDITS", `$${state.player.money}`, "card-credits");
    addCard("TOTAL ROUNDS", String(rounds), "card-rounds");
  }
}

function renderState(state) {
  currentState = state;
  bidLocked = false;
  lockedBidValue = null;
  elements.bidInput.disabled = false;
  elements.bidForm.querySelector("button").disabled = false;
  stopEndTimer();
  elements.roundNum.textContent = state.current_round;
  elements.maintenanceFee.textContent = state.maintenance_fee_current;
  elements.playerMoney.textContent = state.player.money;
  elements.playerScore.textContent = state.player.score;
  elements.aiMoney.textContent = state.ai.money;
  elements.aiScore.textContent = state.ai.score;
  if (elements.playerBid) elements.playerBid.textContent = "-";
  if (elements.aiBid) elements.aiBid.textContent = "-";
  elements.bidHint.textContent = `Enter any integer between 0 and ${state.player.money} inclusive.`;
  elements.bidInput.max = "";
  elements.bidError.textContent = "";
  sanitizeBidInput();
  if (!gameStarted) {
    return;
  }
  if (pendingCooldown) {
    pendingCooldown = false;
    startCooldown();
    return;
  }
  startTimer();
}

function renderReasons(reasons) {
  elements.aiReasons.innerHTML = "";
  if (!reasons || reasons.length === 0) {
    elements.aiReasons.innerHTML = "<li>No AI notes yet.</li>";
    return;
  }
  reasons.forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    elements.aiReasons.appendChild(li);
  });
}

function renderOutcome(outcome) {
  if (!outcome) return;
  if (outcome.status === "ended") {
    elements.gameStatus.textContent = "Game ended";
    stopTimer();
    stopCooldown();
    startEndTimer();
  } else {
    elements.gameStatus.textContent = "Round resolved";
  }
  if (outcome.round) {
    const winner = outcome.round.winner ? outcome.round.winner : "TIE";
    elements.roundResult.textContent = `Player bid $${outcome.round.player_bid} | AI bid $${outcome.round.ai_bid} | Winner: ${winner}`;
    if (elements.playerBid) elements.playerBid.textContent = String(outcome.round.player_bid);
    if (elements.aiBid) elements.aiBid.textContent = String(outcome.round.ai_bid);
  }
  if (outcome.message && !outcome.round) {
    elements.roundResult.textContent = outcome.message;
  }
}

async function loadState() {
  const res = await fetch("/api/state");
  const data = await res.json();
  renderState(data.state);
}

function lockBid(event) {
  event?.preventDefault();
  if (bidLocked) return;
  const bidValue = sanitizeBidInput();
  const maxBid = currentState ? Number(currentState.player.money) : 0;
  if (!Number.isFinite(bidValue) || bidValue < 0 || bidValue > maxBid) {
    elements.bidError.textContent = `Bid must be between 0 and ${maxBid} inclusive.`;
    return;
  }
  bidLocked = true;
  lockedBidValue = bidValue;
  elements.bidInput.disabled = true;
  elements.bidForm.querySelector("button").disabled = true;
  elements.bidHint.textContent = "Bid locked. Waiting for timer.";
  elements.bidError.textContent = "";
}

async function sendBid(bidValue) {
  elements.bidForm.querySelector("button").disabled = true;
  elements.bidInput.disabled = true;
  elements.bidHint.textContent = "Submitting...";
  elements.bidError.textContent = "";

  try {
    const res = await fetch("/api/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bid: bidValue }),
    });

    const data = await res.json();
    if (!res.ok) {
      elements.bidError.textContent = data.error || "Request failed.";
      return;
    }

    pendingCooldown = data.outcome?.status === "ok";
    renderState(data.state);
    renderOutcome(data.outcome);
    renderReasons(data.outcome?.aiReasons);

    if (data.report) {
      renderFinalReport(data.report, data.state, data.outcome);
      if (elements.reportModal) elements.reportModal.classList.remove("hidden");
    }

    elements.bidInput.value = "";
    elements.bidHint.textContent = `Enter any integer between 0 and ${data.state.player.money} inclusive.`;
  } catch (err) {
    elements.bidError.textContent = "Network error.";
  }
}

function startTimer() {
  stopTimer();
  stopCooldown();
  stopEndTimer();
  timeLeft = 10;
  elements.gameStatus.textContent = "ROUND TIMER";
  if (elements.timerLabel) elements.timerLabel.textContent = "ROUND ENDS IN:";
  if (elements.bidTimer) elements.bidTimer.textContent = String(timeLeft);
  timerId = setInterval(() => {
    timeLeft -= 1;
    if (elements.bidTimer) elements.bidTimer.textContent = String(timeLeft);
    if (timeLeft <= 0) {
      stopTimer();
      const maxBid = currentState ? Number(currentState.player.money) : 0;
      let bidToSend = 0;
      if (bidLocked && Number.isFinite(lockedBidValue)) {
        bidToSend = Math.max(0, Math.min(lockedBidValue, maxBid));
      } else {
        const raw = Number(elements.bidInput.value);
        bidToSend = Number.isFinite(raw) ? Math.max(0, Math.min(raw, maxBid)) : 0;
      }
      sendBid(bidToSend);
    }
  }, 1000);
}

function sanitizeBidInput() {
  const maxBid = currentState ? Number(currentState.player.money) : 0;
  const raw = String(elements.bidInput.value ?? "");
  const digits = raw.replace(/[^\d]/g, "");
  let value = digits === "" ? NaN : Number(digits);
  if (!Number.isFinite(value)) value = NaN;
  if (Number.isFinite(value)) {
    value = Math.max(0, Math.min(Math.trunc(value), maxBid));
    elements.bidInput.value = String(value);
  } else {
    value = 0;
    elements.bidInput.value = "0";
  }
  return Number.isFinite(value) ? value : NaN;
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function startCooldown() {
  stopCooldown();
  stopTimer();
  stopEndTimer();
  cooldownLeft = 5;
  elements.gameStatus.textContent = "ROUND STARTS IN";
  if (elements.timerLabel) elements.timerLabel.textContent = "ROUND STARTS IN:";
  elements.bidInput.disabled = true;
  elements.bidForm.querySelector("button").disabled = true;
  elements.bidHint.textContent = "Cooldown...";
  if (elements.bidTimer) elements.bidTimer.textContent = String(cooldownLeft);
  cooldownId = setInterval(() => {
    cooldownLeft -= 1;
    if (elements.bidTimer) elements.bidTimer.textContent = String(cooldownLeft);
    if (cooldownLeft <= 0) {
      stopCooldown();
      elements.bidInput.disabled = false;
      elements.bidForm.querySelector("button").disabled = false;
      elements.bidHint.textContent = `Enter any integer between 0 and ${currentState.player.money} inclusive.`;
      startTimer();
    }
  }, 1000);
}

function stopCooldown() {
  if (cooldownId) {
    clearInterval(cooldownId);
    cooldownId = null;
  }
}

function startEndTimer() {
  stopEndTimer();
  let left = 5;
  if (elements.timerLabel) elements.timerLabel.textContent = "GAME ENDS IN:";
  if (elements.bidTimer) elements.bidTimer.textContent = String(left);
  endTimerId = setInterval(() => {
    left -= 1;
    if (elements.bidTimer) elements.bidTimer.textContent = String(left);
    if (left <= 0) {
      stopEndTimer();
    }
  }, 1000);
}

function stopEndTimer() {
  if (endTimerId) {
    clearInterval(endTimerId);
    endTimerId = null;
  }
}

loadState();
elements.bidForm.addEventListener("submit", lockBid);
elements.bidInput.addEventListener("input", () => {
  sanitizeBidInput();
});
if (elements.startButton) {
  elements.startButton.addEventListener("click", () => {
    gameStarted = true;
    if (elements.startScreen) elements.startScreen.style.display = "none";
    if (currentState) {
      renderState(currentState);
      startCooldown();
    }
    fetch("/api/start", { method: "POST" }).catch(() => {});
  });
}
if (elements.reportClose) {
  elements.reportClose.addEventListener("click", () => {
    if (elements.reportModal) elements.reportModal.classList.add("hidden");
  });
}
if (elements.reportRestart) {
  elements.reportRestart.addEventListener("click", async () => {
    await fetch("/api/restart", { method: "POST" }).catch(() => {});
    if (elements.reportModal) elements.reportModal.classList.add("hidden");
    if (elements.startScreen) elements.startScreen.style.display = "";
    gameStarted = false;
    stopTimer();
    stopCooldown();
    if (elements.timerLabel) elements.timerLabel.textContent = "ROUND ENDS IN:";
    if (elements.bidTimer) elements.bidTimer.textContent = "10";
    await loadState();
  });
}
