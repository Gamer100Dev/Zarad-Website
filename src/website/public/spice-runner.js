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
  const ctx = canvas && canvas.getContext("2d");
  const feedback = document.querySelector("#spice-runner-feedback");
  const distanceEl = document.querySelector("#spice-runner-distance");
  const spicesEl = document.querySelector("#spice-runner-spices");
  const bestEl = document.querySelector("#spice-runner-best");
  const resultTitle = document.querySelector("#spice-runner-result-title");
  const resultCopy = document.querySelector("#spice-runner-result-copy");
  const resultScore = document.querySelector("#spice-runner-result-score");
  const resultMark = document.querySelector("#spice-runner-result-mark");
  if (!dialog || !close || !intro || !play || !result || !start || !restart || !canvas || !ctx) return;

  const W = 960, H = 540, horizon = 148, playerZ = 0.085;
  const spices = [
    ["Ras el Hanout", "Ras el Hanout", "ras-el-hanout.jpeg", "#bd7941"],
    ["Kamoun", "Cumin", "kamoun.jpeg", "#b18a45"],
    ["Kharkoum", "Turmeric", "kharkoum.jpeg", "#d8a52e"],
    ["Gingembre", "Ginger", "gingembre.jpeg", "#c47c3e"],
    ["Karfa", "Cinnamon", "karfa.jpeg", "#9a5938"],
    ["Felfel Kahal", "Black pepper", "felfel-kahal.jpeg", "#595044"],
    ["Tahmira", "Paprika", "tahmira.jpeg", "#a83c2d"],
    ["Zaafrane", "Saffron", "zaafrane.jpeg", "#d09a32"],
    ["Zarad", "Zarad blend", "zarad-amestec-oriental.jpeg", "#8b4631"]
  ];
  const spiceImages = spices.map((spice) => {
    const image = new Image();
    image.src = "/assets/spices/" + spice[2];
    return image;
  });

  let raf = 0, last = 0, spawnClock = 0, elapsed = 0;
  let running = false, paused = false, previousFocus = null, pointer = null;
  let lane = 0, visualLane = 0, jumpTime = 0, slideTime = 0;
  let metres = 0, collected = 0, objects = [], toast = "", toastTime = 0, best = 0;
  const say = (ro, en) => document.documentElement.lang === "en" ? en : ro;
  try {
    best = Math.max(0, Number(localStorage.getItem("zarad-spice-run-best") || 0) || 0);
  } catch { best = 0; }

  function shuffle(values) {
    const copy = values.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function yAt(z) { return horizon + Math.pow(Math.max(0, 1 - z), 1.72) * 392; }
  function spacing(z) { return 72 + (1 - z) * 218; }
  function xAt(which, z) { return W / 2 + which * spacing(z); }
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
  function drawArch(x, y, scale, colour) {
    const w = 118 * scale, h = 118 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = colour;
    rounded(-w * .58, -h, w * 1.16, h * .23, 6 * scale);
    ctx.fill();
    ctx.fillStyle = "#713c32";
    ctx.fillRect(-w * .53, -h * .82, w * .13, h * .82);
    ctx.fillRect(w * .4, -h * .82, w * .13, h * .82);
    ctx.fillStyle = "rgba(255,231,188,.35)";
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * w * .19 - w * .035, -h * .98, w * .07, h * .17);
    ctx.restore();
  }
  function drawWorld(now) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#d7a66c"); sky.addColorStop(.43, "#f0d2a5"); sky.addColorStop(1, "#b6784d");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,239,196,.48)";
    ctx.beginPath(); ctx.arc(770, 72, 39, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8e5b48"; ctx.fillRect(0, 112, W, 116);
    for (let i = 0; i < 12; i++) {
      const x = 22 + i * 84;
      ctx.fillStyle = "#603d38"; ctx.fillRect(x, 84 + (i % 3) * 8, 58, 145);
      ctx.fillStyle = "#d3a06d"; ctx.fillRect(x + 8, 104 + (i % 3) * 8, 42, 82);
    }
    ctx.fillStyle = "#ead0a7"; ctx.fillRect(0, 214, W, 326);
    for (let side = 0; side < 2; side++) {
      const sx = side ? 800 : 0;
      ctx.fillStyle = side ? "#7c4939" : "#85453b"; ctx.fillRect(sx, 170, 160, 370);
      for (let i = 0; i < 3; i++) {
        const x = sx + 12 + i * 54;
        ctx.fillStyle = i % 2 ? "#d49a45" : "#a84836";
        ctx.beginPath(); ctx.moveTo(x, 242); ctx.lineTo(x + 46, 242); ctx.lineTo(x + 54, 267); ctx.lineTo(x - 8, 267); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#60372f"; ctx.fillRect(x + 1, 267, 44, 96);
        ctx.fillStyle = "#d7b077"; ctx.fillRect(x + 7, 281, 32, 61);
      }
    }
    const road = ctx.createLinearGradient(0, horizon, 0, H);
    road.addColorStop(0, "#765d4b"); road.addColorStop(1, "#342c2a");
    ctx.fillStyle = road;
    ctx.beginPath(); ctx.moveTo(375, horizon); ctx.lineTo(585, horizon); ctx.lineTo(900, H); ctx.lineTo(60, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(248,220,169,.16)"; ctx.lineWidth = 2;
    for (let n = 1; n <= 2; n++) {
      ctx.beginPath(); ctx.moveTo(375 + 70 * n, horizon); ctx.lineTo(60 + 280 * n, H); ctx.stroke();
    }
    const scroll = (now * .00022) % 1;
    for (let i = 0; i < 12; i++) {
      const z = (i / 12 + scroll) % 1, p = 1 - z, y = yAt(p), half = 105 + p * 285;
      ctx.strokeStyle = "rgba(244,215,169," + (.05 + z * .12) + ")";
      ctx.lineWidth = 1 + z * 2; ctx.beginPath(); ctx.moveTo(W / 2 - half, y); ctx.lineTo(W / 2 + half, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(242,204,143,.7)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(375, horizon); ctx.lineTo(60, H); ctx.moveTo(585, horizon); ctx.lineTo(900, H); ctx.stroke();
    ctx.fillStyle = "#5b2c2b"; rounded(372, 91, 216, 42, 8); ctx.fill();
    ctx.strokeStyle = "#e8bd70"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#ffe5b8"; ctx.font = "700 18px Georgia,serif"; ctx.textAlign = "center"; ctx.fillText("ZARAD SOUK", 480, 118);
    drawArch(94, 273, .7, "#b86d3d"); drawArch(858, 273, .7, "#c28a47");
    drawArch(205, 212, .4, "#a84a3c"); drawArch(755, 212, .4, "#a84a3c");
  }
  function drawCrate(x, ground, scale) {
    const w = 94 * scale, h = 76 * scale;
    ctx.save(); ctx.translate(x, ground);
    ctx.fillStyle = "rgba(20,14,12,.28)";
    ctx.beginPath(); ctx.ellipse(0, 3 * scale, w * .66, 11 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9a6036"; rounded(-w / 2, -h, w, h, 6 * scale); ctx.fill();
    ctx.strokeStyle = "#e0b171"; ctx.lineWidth = 4 * scale; ctx.stroke();
    ctx.strokeStyle = "#5b3528"; ctx.lineWidth = 5 * scale; ctx.beginPath();
    ctx.moveTo(-w * .36, -h * .82); ctx.lineTo(w * .36, -h * .18);
    ctx.moveTo(w * .36, -h * .82); ctx.lineTo(-w * .36, -h * .18); ctx.stroke();
    ctx.fillStyle = "#f2d6a1"; ctx.font = "700 " + Math.max(7, 10 * scale) + "px Georgia,serif"; ctx.textAlign = "center"; ctx.fillText("SPICE", 0, -h * .49);
    ctx.restore();
  }
  function drawAwning(x, ground, scale) {
    const w = 112 * scale, h = 105 * scale;
    ctx.save(); ctx.translate(x, ground);
    ctx.fillStyle = "rgba(20,14,12,.22)"; ctx.beginPath(); ctx.ellipse(0, 2 * scale, w * .68, 10 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#713b32"; ctx.fillRect(-w * .52, -h * .95, w * .14, h * .95); ctx.fillRect(w * .38, -h * .95, w * .14, h * .95);
    ctx.fillStyle = "#d5a24e"; rounded(-w * .61, -h, w * 1.22, h * .25, 5 * scale); ctx.fill();
    ctx.fillStyle = "#8d453c"; for (let i = -2; i <= 2; i++) ctx.fillRect(i * w * .2 - w * .045, -h * .98, w * .09, h * .21);
    ctx.restore();
  }
  function drawSpice(item, x, ground, scale) {
    const r = 25 * scale, y = ground - r - 9 * scale;
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = "rgba(255,199,82,.8)"; ctx.shadowBlur = 16 * scale;
    ctx.fillStyle = "#f2c46c"; ctx.beginPath(); ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    const image = spiceImages[item.spiceIndex];
    if (image.complete && image.naturalWidth) ctx.drawImage(image, -r, -r, r * 2, r * 2);
    else { ctx.fillStyle = spices[item.spiceIndex][3]; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = "#fff2d7"; ctx.font = "700 17px Georgia"; ctx.textAlign = "center"; ctx.fillText("✦", 0, 6); }
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = "#fff1c8"; ctx.lineWidth = Math.max(1.5, 3 * scale);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  function drawRunner(now) {
    const x = xAt(visualLane, .045), jumping = jumpTime > 0, sliding = slideTime > 0;
    const lift = jumping ? Math.sin(Math.min(1, jumpTime / .78) * Math.PI) * 94 : 0;
    const ground = 480 - lift, scale = sliding ? .8 : 1, stride = Math.sin(now * .025) * (sliding ? 1 : 9);
    ctx.save(); ctx.translate(x, ground + (jumping || sliding ? 0 : Math.sin(now * .016) * 3)); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(20,13,12,.32)"; ctx.beginPath(); ctx.ellipse(0, 55 + lift * .18, jumping ? 34 : 42, 10, 0, 0, Math.PI * 2); ctx.fill();
    if (sliding) {
      ctx.rotate(-.12); ctx.fillStyle = "#7e302f"; rounded(-32, -36, 66, 34, 14); ctx.fill();
      ctx.fillStyle = "#e8c39a"; ctx.beginPath(); ctx.arc(31, -31, 19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3e322b"; ctx.fillRect(-25, -5, 24, 13); ctx.fillRect(8, -2, 26, 11);
    } else {
      ctx.strokeStyle = "#40332d"; ctx.lineWidth = 11; ctx.lineCap = "round"; ctx.beginPath();
      ctx.moveTo(-10, 27); ctx.lineTo(-15 + stride, 52); ctx.moveTo(10, 27); ctx.lineTo(15 - stride, 52); ctx.stroke();
      ctx.fillStyle = "#d6a15c"; rounded(-26 + stride, 45, 25, 11, 5); ctx.fill(); rounded(4 - stride, 45, 25, 11, 5); ctx.fill();
      ctx.strokeStyle = "#e8c39a"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-22, -2); ctx.lineTo(-37 - stride * .45, 19); ctx.moveTo(22, -2); ctx.lineTo(37 + stride * .45, 16); ctx.stroke();
      ctx.fillStyle = "#7f302e"; rounded(-25, -19, 50, 54, 13); ctx.fill();
      ctx.fillStyle = "#d5a34f"; rounded(-17, -6, 34, 27, 5); ctx.fill(); ctx.fillStyle = "#6b352c"; ctx.fillRect(-5, -5, 10, 27);
      ctx.fillStyle = "#e8c39a"; ctx.beginPath(); ctx.arc(0, -39, 23, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3f302a"; ctx.beginPath(); ctx.arc(-8, -41, 2.5, 0, Math.PI * 2); ctx.arc(8, -41, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#89523c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -33, 7, .2, Math.PI - .2); ctx.stroke();
      ctx.fillStyle = "#47714c"; ctx.beginPath(); ctx.moveTo(-25, -52); ctx.quadraticCurveTo(-24, -77, 0, -78); ctx.quadraticCurveTo(25, -77, 25, -52); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d8ad5c"; ctx.fillRect(-26, -54, 52, 6); ctx.fillStyle = "#f0d49f"; ctx.beginPath(); ctx.arc(0, -77, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function draw(now) {
    drawWorld(now);
    objects.slice().sort((a, b) => b.z - a.z).forEach((item) => {
      const y = yAt(item.z), scale = .24 + (1 - item.z) * 1.06, x = xAt(item.lane, item.z);
      if (item.kind === "spice") drawSpice(item, x, y, scale);
      else if (item.kind === "crate") drawCrate(x, y, scale);
      else drawAwning(x, y, scale);
    });
    drawRunner(now);
    if (toastTime > 0 && toast) {
      ctx.save(); ctx.globalAlpha = Math.min(1, toastTime * 2); rounded(305, 164, 350, 42, 12);
      ctx.fillStyle = "rgba(55,34,28,.88)"; ctx.fill(); ctx.fillStyle = "#ffe6b6";
      ctx.font = "700 16px Georgia,serif"; ctx.textAlign = "center"; ctx.fillText(toast, W / 2, 191); ctx.restore();
    }
  }
  function spawn() {
    const laneChoice = Math.floor(Math.random() * 3) - 1;
    if (Math.random() < .34) objects.push({ kind: "spice", lane: laneChoice, z: 1.06, spiceIndex: Math.floor(Math.random() * spices.length), resolved: false });
    else objects.push({ kind: Math.random() < .54 ? "crate" : "awning", lane: laneChoice, z: 1.06, resolved: false });
  }
  function move(direction) { if (running) lane = Math.max(-1, Math.min(1, lane + direction)); }
  function jump() { if (running && jumpTime === 0 && slideTime === 0) jumpTime = .001; }
  function slide() { if (running && slideTime === 0 && jumpTime === 0) slideTime = .66; }

  function finish() {
    if (!running) return;
    running = false; stopLoop();
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
    const speed = .47 + Math.min(.34, elapsed * .0034);
    spawnClock += dt;
    if (spawnClock >= Math.max(.62, 1.02 - elapsed * .002)) { spawnClock = 0; spawn(); }
    jumpTime = jumpTime > 0 ? jumpTime + dt : 0;
    if (jumpTime >= .78) jumpTime = 0;
    slideTime = Math.max(0, slideTime - dt);
    visualLane += (lane - visualLane) * Math.min(1, dt * 13);
    toastTime = Math.max(0, toastTime - dt);
    for (let i = objects.length - 1; i >= 0; i--) {
      const item = objects[i]; item.z -= speed * dt;
      if (item.z <= playerZ && !item.resolved) {
        item.resolved = true;
        if (item.lane === lane) {
          if (item.kind === "spice") {
            collected++;
            const spice = spices[item.spiceIndex];
            notify(say("Ai adunat: " + spice[0], "Collected: " + spice[1]));
          } else {
            const cleared = item.kind === "crate" ? jumpTime > .12 : slideTime > .12;
            if (!cleared) { finish(); return; }
            notify(item.kind === "crate" ? say("Frumos salt!", "Nice jump!") : say("La fix! Te-ai strecurat pe dedesubt.", "Perfect slide!"));
          }
        }
      }
      if (item.z < -.12) objects.splice(i, 1);
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
    stopLoop(); lane = 0; visualLane = 0; jumpTime = 0; slideTime = 0;
    metres = 0; collected = 0; elapsed = 0; spawnClock = 0; objects = []; toast = ""; toastTime = 0;
    running = true; paused = document.hidden;
    intro.hidden = true; result.hidden = true; play.hidden = false;
    feedback.textContent = say("Atenție la lăzi și copertine!", "Watch out for crates and low awnings!");
    hud(); raf = requestAnimationFrame(frame); canvas.focus();
  }
  function openGame() {
    previousFocus = document.activeElement; stopLoop(); running = false;
    intro.hidden = false; play.hidden = true; result.hidden = true;
    overlay.hidden = false; document.body.classList.add("spice-game-open");
    draw(0); close.focus();
  }
  function closeGame() {
    stopLoop(); running = false; overlay.hidden = true; document.body.classList.remove("spice-game-open");
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