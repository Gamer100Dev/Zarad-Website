(() => {
  "use strict";
  const overlay = document.querySelector("#spice-game");
  const trigger = document.querySelector("#spice-game-trigger");
  if (!overlay || !trigger) return;
  const dialog = overlay.querySelector(".spice-game-dialog");
  const close = document.querySelector("#spice-game-close");
  const intro = document.querySelector("#spice-game-intro");
  const play = document.querySelector("#spice-game-play");
  const result = document.querySelector("#spice-game-result");
  const start = document.querySelector("#spice-game-start");
  const restart = document.querySelector("#spice-game-restart");
  const canvas = document.querySelector("#spice-runner-canvas");
  const renderer = canvas && window.ZaradSpiceWebGL && window.ZaradSpiceWebGL.create(canvas);
  const feedback = document.querySelector("#spice-runner-feedback");
  const distanceEl = document.querySelector("#spice-runner-distance");
  const spicesEl = document.querySelector("#spice-runner-spices");
  const bestEl = document.querySelector("#spice-runner-best");
  const resultTitle = document.querySelector("#spice-runner-result-title");
  const resultCopy = document.querySelector("#spice-runner-result-copy");
  const resultScore = document.querySelector("#spice-runner-result-score");
  const resultMark = document.querySelector("#spice-runner-result-mark");
  if (!dialog || !close || !intro || !play || !result || !start || !restart || !canvas) return;
  if (!renderer) {
    if (feedback) feedback.textContent = "This game needs WebGL enabled in your browser.";
    start.disabled = true;
    restart.disabled = true;
    return;
  }

  const playerDepth = 0.82;

  const spices = [
    ["Ras el Hanout", "Ras el Hanout"],
    ["Kamoun", "Cumin"],
    ["Kharkoum", "Turmeric"],
    ["Gingembre", "Ginger"],
    ["Karfa", "Cinnamon"],
    ["Felfel Kahal", "Black pepper"],
    ["Tahmira", "Paprika"],
    ["Zaafrane", "Saffron"],
    ["Zarad", "Zarad blend"]
  ];

  let raf = 0, last = 0, spawnClock = 0, elapsed = 0, roadScroll = 0;
  let running = false, paused = false, previousFocus = null, pointer = null;
  let lane = 0, visualLane = 0, jumpTime = 0, slideTime = 0;
  let metres = 0, collected = 0, objects = [], toast = "", toastTime = 0, best = 0;
  const say = (ro, en) => document.documentElement.lang === "en" ? en : ro;
  try {
    best = Math.max(0, Number(localStorage.getItem("zarad-spice-run-best") || 0) || 0);
  } catch { best = 0; }

  function hud() {
    distanceEl.textContent = Math.floor(metres) + " m";
    spicesEl.textContent = String(collected);
    bestEl.textContent = Math.floor(best) + " m";
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }
  function notify(message) {
    toast = message;
    toastTime = 1.2;
    feedback.textContent = message;
  }
  function draw(now) {
    renderer.render({
      lane: visualLane,
      jumpTime,
      slideTime,
      now,
      objects,
      roadScroll
    });
  }

  function spawn() {
    const laneChoice = Math.floor(Math.random() * 3) - 1;
    if (Math.random() < .37) objects.push({ kind: "spice", lane: laneChoice, depth: 0.015, spiceIndex: Math.floor(Math.random() * spices.length), resolved: false });
    else {
      const roll = Math.random();
      const kind = roll < .34 ? "crate" : roll < .57 ? "awning" : roll < .79 ? "barrier" : "train";
      objects.push({ kind, lane: laneChoice, depth: 0.015, resolved: false });
    }
  }
  function move(direction) { if (running) lane = Math.max(-1, Math.min(1, lane + direction)); }
  function jump() { if (running && jumpTime === 0 && slideTime === 0) jumpTime = .001; }
  function slide() { if (running && slideTime === 0 && jumpTime === 0) slideTime = .66; }

  function finish() {
    if (!running) return;
    running = false; stopLoop();
    overlay.classList.remove("spice-runner-gameplay");
    dialog.classList.remove("spice-runner-live");
    const score = Math.floor(metres) + collected * 25;
    const record = metres > best;
    if (record) {
      best = metres;
      try { localStorage.setItem("zarad-spice-run-best", String(Math.floor(best))); } catch {}
    }
    hud(); play.hidden = true; result.hidden = false;
    resultMark.textContent = record ? "✦" : "✧";
    resultTitle.textContent = record ? say("Record nou în souk!", "A new souk record!") : say("Aventura continuă!", "The run is over!");
    resultCopy.textContent = say(
      "Ai parcurs " + Math.floor(metres) + " m și ai adunat " + collected + " " + (collected === 1 ? "condiment" : "condimente") + ". Mai încearcă o tură prin piața Zarad!",
      "You ran " + Math.floor(metres) + " m and collected " + collected + " spice jars. Fancy another dash through the Zarad souk?"
    );
    resultScore.textContent = score + " pts";
    restart.focus();
  }
  function update(dt) {
    elapsed += dt; metres += dt * (20 + Math.min(13, elapsed * .16));
    const speed = .54 + Math.min(.30, elapsed * .0028);
    roadScroll = (roadScroll + speed * dt) % 1;
    spawnClock += dt;
    if (spawnClock >= Math.max(.62, 1.02 - elapsed * .002)) { spawnClock = 0; spawn(); }
    jumpTime = jumpTime > 0 ? jumpTime + dt : 0;
    if (jumpTime >= .78) jumpTime = 0;
    slideTime = Math.max(0, slideTime - dt);
    visualLane += (lane - visualLane) * Math.min(1, dt * 13);
    toastTime = Math.max(0, toastTime - dt);
    for (let i = objects.length - 1; i >= 0; i--) {
      const item = objects[i];
      item.depth += speed * dt;
      if (item.depth >= playerDepth && !item.resolved) {
        item.resolved = true;
        if (item.lane === lane) {
          if (item.kind === "spice") {
            collected++;
            const spice = spices[item.spiceIndex];
            burst(xAt(item.lane, item.depth), yAt(item.depth) - 28, "#ffcf69", 15);
            notify(say("Ai adunat: " + spice[0], "Collected: " + spice[1]));
          } else {
            const cleared = item.kind === "crate" || item.kind === "barrier" ? jumpTime > .12 : item.kind === "awning" ? slideTime > .12 : false;
            if (!cleared) { finish(); return; }
            notify(item.kind === "crate" || item.kind === "barrier" ? say("Frumos salt!", "Nice jump!") : say("La fix! Te-ai strecurat pe dedesubt.", "Perfect slide!"));
          }
        }
      }
      if (item.depth > 1.22) objects.splice(i, 1);
    }
    hud();
  }
  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    const dt = Math.min(.045, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) update(dt);
    draw(now);
    if (running) raf = requestAnimationFrame(frame);
  }
  function startGame() {
    stopLoop();
    overlay.classList.add("spice-runner-gameplay");
    dialog.classList.add("spice-runner-live");
    lane = 0; visualLane = 0; jumpTime = 0; slideTime = 0;
    metres = 0; collected = 0; elapsed = 0; spawnClock = 0; roadScroll = 0; objects = []; toast = ""; toastTime = 0;
    running = true; paused = document.hidden;
    intro.hidden = true; result.hidden = true; play.hidden = false;
    feedback.textContent = say("Ferește-te de tramvaie, sari peste bariere și strânge borcanele!", "Dodge trams, jump the barriers and collect the spice jars!");
    hud(); raf = requestAnimationFrame(frame); canvas.focus();
  }
  function openGame() {
    previousFocus = document.activeElement; stopLoop(); running = false;
    overlay.classList.remove("spice-runner-gameplay");
    dialog.classList.remove("spice-runner-live");
    intro.hidden = false; play.hidden = true; result.hidden = true;
    overlay.hidden = false; document.body.classList.add("spice-game-open");
    draw(0); close.focus();
  }
  function closeGame() {
    stopLoop(); running = false;
    overlay.classList.remove("spice-runner-gameplay");
    dialog.classList.remove("spice-runner-live");
    overlay.hidden = true; document.body.classList.remove("spice-game-open");
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  trigger.addEventListener("click", openGame);
  close.addEventListener("click", closeGame);
  start.addEventListener("click", startGame);
  restart.addEventListener("click", startGame);
  document.querySelectorAll("[data-runner-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.runnerAction;
      if (action === "left") move(-1);
      else if (action === "right") move(1);
      else if (action === "jump") jump();
      else if (action === "slide") slide();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closeGame(); return; }
    if (!running) return;
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") { event.preventDefault(); move(-1); }
    else if (key === "arrowright" || key === "d") { event.preventDefault(); move(1); }
    else if (key === "arrowup" || key === "w" || key === " ") { event.preventDefault(); jump(); }
    else if (key === "arrowdown" || key === "s") { event.preventDefault(); slide(); }
  });
  canvas.addEventListener("pointerdown", (event) => { pointer = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointer || !running) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; pointer = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? -1 : 1);
    else if (dy < 0) jump(); else slide();
  });
  canvas.addEventListener("pointercancel", () => { pointer = null; });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeGame(); });
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden || event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button:not([disabled]), canvas[tabindex='0']"))
      .filter((element) => !element.closest("[hidden]"));
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
    else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
  });
  document.addEventListener("visibilitychange", () => { paused = document.hidden; if (!paused) last = 0; });
  draw(0); hud();
})();