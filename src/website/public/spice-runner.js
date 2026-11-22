(() => {
  "use strict";

  const overlay = document.querySelector("#spice-game");
  const trigger = document.querySelector("#spice-game-trigger");
  if (!overlay || !trigger) return;

  const $ = id => document.getElementById(id);
  const dialog = overlay.querySelector(".spice-game-dialog");
  const closeButton = $("spice-game-close");
  const intro = $("spice-game-intro");
  const playPanel = $("spice-game-play");
  const resultPanel = $("spice-game-result");
  const startButton = $("spice-game-start");
  const restartButton = $("spice-game-restart");
  const canvas = $("spice-runner-canvas");
  const renderer = canvas && window.ZaradSpiceWebGL && window.ZaradSpiceWebGL.create(canvas);
  const core = window.ZaradRunnerCore && window.ZaradRunnerCore.create();

  if (!dialog || !closeButton || !intro || !playPanel || !resultPanel ||
      !startButton || !restartButton || !canvas) return;

  if (!renderer || !core) {
    const feedback = $("spice-runner-feedback");
    if (feedback) feedback.textContent = "WebGL is unavailable. Enable hardware acceleration and refresh.";
    startButton.disabled = restartButton.disabled = true;
    return;
  }

  const say = (ro, en) => document.documentElement.lang === "en" ? en : ro;
  const missions = [
    { ro: "Adună 30 de monede", en: "Collect 30 coins", goal: 30, kind: "coins" },
    { ro: "Aleargă 500 m", en: "Run 500 m", goal: 500, kind: "distance" },
    { ro: "Folosește 3 power-up-uri", en: "Use 3 power-ups", goal: 3, kind: "boosts" },
    { ro: "Treci pe lângă 5 obstacole", en: "Near-miss 5 obstacles", goal: 5, kind: "nearMisses" }
  ];

  let raf = 0;
  let lastFrame = 0;
  let running = false;
  let paused = false;
  let previousFocus = null;
  let pointerStart = null;
  let missionIndex = 0;
  let missionBonus = 0;
  let careerCoins = 0;
  let wallet = 0;
  let best = 0;
  let hasNewBest = false;

  function readNumber(key) {
    try { return Math.max(0, Number(localStorage.getItem(key) || 0) || 0); }
    catch { return 0; }
  }
  function writeNumber(key, value) {
    try { localStorage.setItem(key, String(Math.max(0, Math.floor(value)))); } catch {}
  }
  function loadProfile() {
    wallet = readNumber("zarad-souk-wallet");
    careerCoins = readNumber("zarad-souk-career-coins");
    best = readNumber("zarad-subway-best");
  }
  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value);
  }
  function updateMenu() {
    loadProfile();
    setText("spice-runner-wallet", wallet.toLocaleString());
    setText("spice-runner-menu-best", best.toLocaleString());
    setText("spice-runner-career-coins", careerCoins.toLocaleString());
    setText("spice-runner-top-wallet", wallet.toLocaleString());
    setText("spice-runner-top-best", best.toLocaleString());
    updateMenuDetail("missions");
  }
  function updateMenuDetail(tab) {
    const detail = $("spice-runner-menu-detail");
    if (!detail) return;
    const lines = {
      missions: say(
        "MISIUNE ZILNICĂ · Adună 30 de monede în alergările tale. Completează misiunea pentru un bonus de 250 puncte.",
        "DAILY MISSION · Collect 30 coins across your runs. Finish the mission for a 250 point bonus."
      ),
      collection: say(
        "COLECȚIE ZARAD · Monede în cont: " + wallet.toLocaleString() + ". Total monede adunate: " + careerCoins.toLocaleString() + ".",
        "ZARAD COLLECTION · Wallet: " + wallet.toLocaleString() + " coins. Lifetime coins collected: " + careerCoins.toLocaleString() + "."
      ),
      records: say(
        "CEL MAI BUN REZULTAT · " + best.toLocaleString() + " puncte. Aleargă mai departe, schimbă benzile și păstrează combo-ul de monede.",
        "PERSONAL BEST · " + best.toLocaleString() + " points. Run farther, switch lanes and keep your coin streak alive."
      )
    };
    detail.textContent = lines[tab] || lines.missions;
    document.querySelectorAll("[data-runner-menu-tab]").forEach(button => {
      const active = button.dataset.runnerMenuTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function feedback(ro, en) {
    const node = $("spice-runner-feedback");
    if (node) node.textContent = say(ro, en);
  }

  function activePowerups(state) {
    const labels = [];
    if (state.jetpack > 0) labels.push(say("JETPACK", "JETPACK"));
    if (state.magnet > 0) labels.push(say("MAGNET", "MAGNET"));
    if (state.sneakers > 0) labels.push(say("SUPER SNEAKERS", "SUPER SNEAKERS"));
    if (state.hoverboard > 0) labels.push(say("HOVERBOARD", "HOVERBOARD"));
    if (state.doubleScore > 0) labels.push("2× SCORE");
    return labels;
  }

  function updateMission(state) {
    const mission = missions[missionIndex];
    if (!mission) {
      setText("spice-runner-mission", say("Toate misiunile sunt complete", "All missions complete"));
      setText("spice-runner-mission-progress", "✓");
      const fill = $("spice-runner-mission-fill");
      if (fill) fill.style.width = "100%";
      return;
    }
    const value = mission.kind === "coins" ? state.coins
      : mission.kind === "distance" ? Math.floor(state.distance)
      : mission.kind === "boosts" ? state.boostsUsed
      : state.nearMisses;
    setText("spice-runner-mission", say(mission.ro, mission.en));
    setText("spice-runner-mission-progress", value + "/" + mission.goal);
    const fill = $("spice-runner-mission-fill");
    if (fill) fill.style.width = Math.min(100, value / mission.goal * 100) + "%";
    if (value >= mission.goal) {
      missionBonus += 250;
      missionIndex++;
      feedback("Misiune completă! +250 puncte", "Mission complete! +250 points");
      if (missionIndex < missions.length) updateMission(state);
    }
  }

  function updateHud(state) {
    setText("spice-runner-score", Math.floor(state.score + missionBonus).toLocaleString());
    setText("spice-runner-coins", state.coins.toLocaleString());
    setText("spice-runner-distance", Math.floor(state.distance) + " m");
    setText("spice-runner-best", best.toLocaleString());
    setText("spice-runner-speed", Math.round(state.speed * 3.6) + " km/h");
    setText("spice-runner-multiplier", "×" + (state.doubleScore > 0 ? 2 : 1));
    const powerups = activePowerups(state);
    const pill = $("spice-runner-powerup");
    if (pill) {
      pill.textContent = powerups.join("  ·  ");
      pill.hidden = powerups.length === 0;
    }
    updateMission(state);
  }

  function render(now) {
    const state = core.snapshot();
    renderer.render({
      ...state,
      lane: state.visualLane,
      jumpTime: state.jumpTime,
      jumpHeight: state.jumpHeight,
      slideTime: state.slideTime,
      now,
      objects: state.objects,
      roadScroll: state.roadScroll,
      chaser: state.guard,
      coins: state.coins,
      score: state.score + missionBonus
    });
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  }

  function finishRun() {
    if (!running) return;
    running = false;
    paused = false;
    stopLoop();
    const state = core.snapshot();
    const finalScore = Math.floor(state.score + missionBonus);
    const finalWalletGain = state.coins + (missionBonus > 0 ? 15 : 0);
    careerCoins += state.coins;
    wallet += finalWalletGain;
    hasNewBest = finalScore > best;
    if (hasNewBest) best = finalScore;
    writeNumber("zarad-souk-wallet", wallet);
    writeNumber("zarad-souk-career-coins", careerCoins);
    if (hasNewBest) writeNumber("zarad-subway-best", best);

    overlay.classList.remove("spice-runner-gameplay");
    dialog.classList.remove("spice-runner-live");
    setText("spice-runner-final-score", finalScore.toLocaleString());
    setText("spice-runner-final-coins", state.coins.toLocaleString());
    setText("spice-runner-final-distance", Math.floor(state.distance) + " m");
    setText("spice-runner-final-best", best.toLocaleString());
    setText("spice-runner-result-title", hasNewBest
      ? say("RECORD NOU!", "NEW HIGH SCORE!")
      : say("AI FOST PRINS!", "BUSTED!"));
    setText("spice-runner-result-copy", say(
      "Ai alergat " + Math.floor(state.distance) + " m prin souk și ai strâns " + state.coins + " monede Zarad.",
      "You ran " + Math.floor(state.distance) + " m through the souk and collected " + state.coins + " Zarad coins."
    ));
    const newBest = $("spice-runner-new-best");
    if (newBest) newBest.hidden = !hasNewBest;
    playPanel.hidden = true;
    resultPanel.hidden = false;
    updateMenu();
    restartButton.focus();
  }

  function frame(timestamp) {
    if (!running) return;
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (!paused) {
      const state = core.update(dt);
      updateHud(state);
      if (state.gameOver) {
        render(timestamp);
        finishRun();
        return;
      }
    }
    render(timestamp);
    if (running) raf = requestAnimationFrame(frame);
  }

  function startRun() {
    stopLoop();
    missionIndex = 0;
    missionBonus = 0;
    core.reset();
    running = true;
    paused = false;
    intro.hidden = true;
    resultPanel.hidden = true;
    playPanel.hidden = false;
    overlay.classList.add("spice-runner-gameplay");
    dialog.classList.add("spice-runner-live");
    const pauseLayer = $("spice-runner-pause-layer");
    if (pauseLayer) pauseLayer.hidden = true;
    setText("spice-runner-pause", say("PAUZĂ", "PAUSE"));
    feedback("Schimbă benzile, sari peste bariere, rostogolește-te și strânge monede!", "Switch lanes, jump barriers, roll under signs and collect coins!");
    updateHud(core.snapshot());
    raf = requestAnimationFrame(frame);
    canvas.focus();
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    const pauseLayer = $("spice-runner-pause-layer");
    if (pauseLayer) pauseLayer.hidden = !paused;
    setText("spice-runner-pause", paused ? say("CONTINUĂ", "RESUME") : say("PAUZĂ", "PAUSE"));
    if (!paused) lastFrame = 0;
  }

  function startAction(action) {
    if (!running || paused) return;
    if (action === "left") core.move(-1);
    else if (action === "right") core.move(1);
    else if (action === "jump") core.jump();
    else if (action === "slide") core.slide();
  }

  function openGame() {
    previousFocus = document.activeElement;
    stopLoop();
    running = false;
    paused = false;
    overlay.classList.remove("spice-runner-gameplay");
    dialog.classList.remove("spice-runner-live");
    intro.hidden = false;
    playPanel.hidden = true;
    resultPanel.hidden = true;
    overlay.hidden = false;
    document.body.classList.add("spice-game-open");
    updateMenu();
    render(0);
    closeButton.focus();
  }

  function closeGame() {
    stopLoop();
    running = false;
    paused = false;
    overlay.classList.remove("spice-runner-gameplay");
    dialog.classList.remove("spice-runner-live");
    overlay.hidden = true;
    document.body.classList.remove("spice-game-open");
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  loadProfile();
  trigger.addEventListener("click", openGame);
  closeButton.addEventListener("click", closeGame);
  startButton.addEventListener("click", startRun);
  restartButton.addEventListener("click", startRun);
  $("spice-runner-pause").addEventListener("click", togglePause);
  $("spice-runner-resume").addEventListener("click", togglePause);

  document.querySelectorAll("[data-runner-action]").forEach(button => {
    button.addEventListener("click", () => startAction(button.dataset.runnerAction));
  });
  document.querySelectorAll("[data-runner-menu-tab]").forEach(button => {
    button.addEventListener("click", () => updateMenuDetail(button.dataset.runnerMenuTab));
  });

  document.addEventListener("keydown", event => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (running) togglePause();
      else closeGame();
      return;
    }
    if (!running || paused) return;
    const key = event.key.toLowerCase();
    if (["arrowleft", "a", "arrowright", "d", "arrowup", "w", " ", "arrowdown", "s", "p"].includes(key)) {
      event.preventDefault();
    }
    if ((key === "arrowleft" || key === "a") && !event.repeat) startAction("left");
    else if ((key === "arrowright" || key === "d") && !event.repeat) startAction("right");
    else if (key === "arrowup" || key === "w" || key === " ") startAction("jump");
    else if (key === "arrowdown" || key === "s") startAction("slide");
    else if (key === "p") togglePause();
  });

  canvas.addEventListener("pointerdown", event => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", event => {
    if (!pointerStart || !running || paused) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) startAction(dx < 0 ? "left" : "right");
    else startAction(dy < 0 ? "jump" : "slide");
  });
  canvas.addEventListener("pointercancel", () => { pointerStart = null; });
  overlay.addEventListener("click", event => {
    if (event.target === overlay && !running) closeGame();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running && !paused) togglePause();
    lastFrame = 0;
  });

  updateMenu();
  render(0);
})();