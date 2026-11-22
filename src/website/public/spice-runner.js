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
  let metres = 0, collected = 0, objects = [], particles = [], toast = "", toastTime = 0, best = 0;
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
  function drawDome(cx, base, width, height, colour) {
    ctx.save();
    ctx.fillStyle = "#704337";
    ctx.fillRect(cx - width * .48, base - height * .35, width * .96, height * .35);
    const gradient = ctx.createLinearGradient(cx - width * .5, base - height, cx + width * .5, base);
    gradient.addColorStop(0, "#f1c98c");
    gradient.addColorStop(.45, colour);
    gradient.addColorStop(1, "#94513d");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx - width * .5, base - height * .32);
    ctx.bezierCurveTo(cx - width * .54, base - height * .74, cx - width * .27, base - height * 1.12, cx, base - height);
    ctx.bezierCurveTo(cx + width * .27, base - height * 1.12, cx + width * .54, base - height * .74, cx + width * .5, base - height * .32);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,227,179,.5)";
    ctx.lineWidth = Math.max(1, width * .018);
    ctx.stroke();
    ctx.fillStyle = "#d6a65f";
    ctx.fillRect(cx - width * .55, base - height * .34, width * 1.1, height * .06);
    ctx.beginPath();
    ctx.moveTo(cx, base - height * 1.04);
    ctx.lineTo(cx, base - height * 1.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, base - height * 1.25, Math.max(2, width * .035), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLantern(x, y, scale, now) {
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 17 * scale, 1, 0, 17 * scale, 50 * scale);
    glow.addColorStop(0, "rgba(255,203,104,.34)");
    glow.addColorStop(1, "rgba(255,180,76,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 17 * scale, 50 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#614038"; ctx.lineWidth = 2.2 * scale;
    ctx.beginPath(); ctx.moveTo(0, -25 * scale); ctx.lineTo(0, -9 * scale); ctx.stroke();
    ctx.fillStyle = "#b47c3f";
    ctx.beginPath(); ctx.moveTo(-11 * scale, -10 * scale); ctx.lineTo(11 * scale, -10 * scale); ctx.lineTo(8 * scale, -3 * scale); ctx.lineTo(-8 * scale, -3 * scale); ctx.closePath(); ctx.fill();
    const body = ctx.createLinearGradient(-12 * scale, 0, 12 * scale, 0);
    body.addColorStop(0, "#70402e"); body.addColorStop(.28, "#e5ad57"); body.addColorStop(.52, "#fff0ba"); body.addColorStop(.78, "#b87937"); body.addColorStop(1, "#5b332b");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-9 * scale, -3 * scale); ctx.lineTo(9 * scale, -3 * scale); ctx.lineTo(13 * scale, 8 * scale);
    ctx.lineTo(10 * scale, 32 * scale); ctx.lineTo(0, 38 * scale); ctx.lineTo(-10 * scale, 32 * scale); ctx.lineTo(-13 * scale, 8 * scale); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#d9a052"; ctx.lineWidth = 1.4 * scale; ctx.stroke();
    ctx.fillStyle = "rgba(255,246,204,.85)";
    ctx.fillRect(-2.2 * scale, 2 * scale, 4.4 * scale, 24 * scale);
    ctx.strokeStyle = "rgba(100,54,38,.8)"; ctx.lineWidth = 1.1 * scale;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 5 * scale, 1 * scale); ctx.lineTo(i * 5 * scale, 30 * scale); ctx.stroke();
    }
    ctx.fillStyle = "#d59a4e";
    ctx.beginPath(); ctx.moveTo(-10 * scale, 32 * scale); ctx.lineTo(10 * scale, 32 * scale); ctx.lineTo(5 * scale, 39 * scale); ctx.lineTo(-5 * scale, 39 * scale); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f0c06a";
    ctx.beginPath(); ctx.arc(0, 42 * scale, 2.2 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPalm(x, base, scale, sway) {
    ctx.save();
    ctx.translate(x, base);
    ctx.strokeStyle = "#684333";
    ctx.lineWidth = 13 * scale;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-5 * scale, -55 * scale, sway * 6 * scale, -116 * scale);
    ctx.stroke();
    ctx.strokeStyle = "rgba(225,177,108,.55)";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath(); ctx.moveTo(-2 * scale, -8 * scale); ctx.quadraticCurveTo(-8 * scale, -59 * scale, sway * 6 * scale - 2 * scale, -112 * scale); ctx.stroke();
    const crownY = -116 * scale;
    for (let i = 0; i < 9; i++) {
      const angle = -Math.PI * .93 + i * Math.PI * .232 + sway * .06;
      const length = (46 + (i % 3) * 8) * scale;
      ctx.save();
      ctx.translate(sway * 6 * scale, crownY);
      ctx.rotate(angle);
      const leaf = ctx.createLinearGradient(0, 0, length, 0);
      leaf.addColorStop(0, "#345b3d"); leaf.addColorStop(1, "#769653");
      ctx.strokeStyle = leaf;
      ctx.lineWidth = (7 - Math.abs(i - 4) * .55) * scale;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(length * .42, -13 * scale, length, 0); ctx.stroke();
      ctx.strokeStyle = "rgba(210,207,126,.45)";
      ctx.lineWidth = 1.1 * scale;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(length * .48, -13 * scale, length, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSpice(item, x, ground, scale) {
    const w = 42 * scale, h = 56 * scale;
    const bob = Math.sin(elapsed * 5 + item.z * 7) * 3 * scale;
    const y = ground - h * .5 - 10 * scale + bob;
    ctx.save(); ctx.translate(x, y);
    // Soft halo behind the floating glass jar.
    const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 48 * scale);
    halo.addColorStop(0, "rgba(255,213,111,.48)"); halo.addColorStop(.45, "rgba(255,188,78,.16)"); halo.addColorStop(1, "rgba(255,177,69,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 48 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(25,16,12,.24)";
    ctx.beginPath(); ctx.ellipse(0, h * .58, w * .74, 6 * scale, 0, 0, Math.PI * 2); ctx.fill();

    const jarPath = () => {
      ctx.beginPath();
      ctx.moveTo(-w * .35, -h * .17);
      ctx.quadraticCurveTo(-w * .44, -h * .26, -w * .32, -h * .36);
      ctx.lineTo(-w * .2, -h * .44);
      ctx.lineTo(-w * .2, -h * .55);
      ctx.lineTo(w * .2, -h * .55);
      ctx.lineTo(w * .2, -h * .44);
      ctx.lineTo(w * .32, -h * .36);
      ctx.quadraticCurveTo(w * .44, -h * .26, w * .35, -h * .17);
      ctx.lineTo(w * .31, h * .38);
      ctx.quadraticCurveTo(0, h * .52, -w * .31, h * .38);
      ctx.closePath();
    };
    jarPath();
    const glass = ctx.createLinearGradient(-w * .5, 0, w * .5, 0);
    glass.addColorStop(0, "rgba(255,245,212,.75)"); glass.addColorStop(.22, "rgba(255,255,238,.24)");
    glass.addColorStop(.55, "rgba(255,255,255,.08)"); glass.addColorStop(.82, "rgba(255,237,183,.34)"); glass.addColorStop(1, "rgba(255,249,220,.8)");
    ctx.fillStyle = glass; ctx.fill();
    ctx.save(); jarPath(); ctx.clip();
    const image = spiceImages[item.spiceIndex];
    if (image && image.complete && image.naturalWidth) {
      ctx.globalAlpha = .88;
      ctx.drawImage(image, -w * .33, -h * .22, w * .66, h * .66);
    } else {
      ctx.fillStyle = spices[item.spiceIndex][3]; ctx.fillRect(-w * .4, -h * .2, w * .8, h * .65);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,221,140,.22)"; ctx.fillRect(-w * .3, -h * .08, w * .6, h * .08);
    ctx.restore();
    jarPath(); ctx.strokeStyle = "#fff1cb"; ctx.lineWidth = Math.max(1.5, 2.2 * scale); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.72)";
    rounded(-w * .28, -h * .18, w * .08, h * .43, w * .04); ctx.fill();
    // Gold screw cap with ridges and a small Zarad flower.
    const cap = ctx.createLinearGradient(-w * .25, 0, w * .25, 0);
    cap.addColorStop(0, "#8a542b"); cap.addColorStop(.24, "#efc46a"); cap.addColorStop(.55, "#fff0a5"); cap.addColorStop(1, "#9a6030");
    ctx.fillStyle = cap; rounded(-w * .23, -h * .64, w * .46, h * .16, 3 * scale); ctx.fill();
    ctx.strokeStyle = "#f8dd99"; ctx.lineWidth = 1 * scale;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * w * .07, -h * .62); ctx.lineTo(i * w * .07, -h * .5); ctx.stroke();
    }
    ctx.fillStyle = "#713b31";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = i % 2 ? 3 * scale : 6 * scale;
      const px = Math.cos(a) * r, py = -h * .57 + Math.sin(a) * r;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawRunner(now) {
    const x = xAt(visualLane, .045);
    const jumping = jumpTime > 0;
    const sliding = slideTime > 0;
    const jumpProgress = jumping ? Math.min(1, jumpTime / .78) : 0;
    const lift = jumping ? Math.sin(jumpProgress * Math.PI) * 100 : 0;
    const runPhase = now * .014;
    const stride = Math.sin(runPhase);
    const bob = jumping ? 0 : sliding ? 0 : Math.abs(Math.sin(runPhase * 2)) * 3.6;
    const slideProgress = sliding ? 1 - slideTime / .66 : 0;
    const lean = (lane - visualLane) * .28 + (sliding ? .34 : jumping ? -.05 : stride * .025);
    const rootY = 480 - lift + (sliding ? 8 : 0) + bob;

    ctx.save();
    ctx.translate(x, rootY);
    ctx.rotate(lean);
    ctx.scale(sliding ? 1.08 : jumping ? 1.015 : 1, sliding ? .78 : jumping ? 1.04 : 1);

    // Soft contact shadow reacts to jump height.
    const shadowScale = 1 - lift / 160;
    ctx.save();
    ctx.translate(0, 8 + lift * .7);
    ctx.scale(Math.max(.45, shadowScale), 1);
    ctx.fillStyle = "rgba(28,17,15," + (.26 - Math.min(.16, lift / 700)) + ")";
    ctx.beginPath(); ctx.ellipse(0, 0, 43, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Animated scarf streams out behind the runner, with embroidered gold trim.
    const scarfWave = Math.sin(now * .012) * 10 + Math.cos(now * .019) * 4;
    ctx.save();
    ctx.translate(-16, -126);
    ctx.rotate(-.05 + Math.sin(now * .009) * .05);
    ctx.fillStyle = "#512632";
    ctx.beginPath();
    ctx.moveTo(7, -2); ctx.bezierCurveTo(-18, -20, -57, -28 + scarfWave, -94, -10 + scarfWave);
    ctx.bezierCurveTo(-76, 14 + scarfWave, -54, 26 + scarfWave, -20, 20);
    ctx.bezierCurveTo(-43, 40 + scarfWave, -69, 48 + scarfWave, -88, 36 + scarfWave);
    ctx.bezierCurveTo(-50, 67 + scarfWave, -11, 45, 13, 13);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#d6a45c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.bezierCurveTo(-28, -6, -60, 9 + scarfWave, -89, 16 + scarfWave); ctx.stroke();
    ctx.strokeStyle = "rgba(250,218,158,.85)"; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const px = -21 - i * 13;
      ctx.beginPath(); ctx.moveTo(px, 4 + scarfWave * .3); ctx.lineTo(px - 5, 15 + scarfWave * .3); ctx.stroke();
    }
    ctx.restore();

    // Articulated legs: thighs, knees, joggers, cuffs and high-top trainers.
    function drawLeg(side, phase, pose) {
      ctx.save();
      ctx.translate(side * 14, -58);
      let upperAngle = Math.sin(phase + (side > 0 ? Math.PI : 0)) * .55;
      let lowerAngle = Math.max(0, Math.cos(phase + (side > 0 ? Math.PI : 0))) * .62 + .08;
      if (pose === "jump") { upperAngle = side * .36 + .18; lowerAngle = -.82; }
      if (pose === "slide") { upperAngle = -.95 + side * .13; lowerAngle = .12 + side * .1; }
      ctx.rotate(upperAngle);
      const pants = ctx.createLinearGradient(-13, 0, 15, 0);
      pants.addColorStop(0, "#2e2830"); pants.addColorStop(.34, "#59323a"); pants.addColorStop(.74, "#492a34"); pants.addColorStop(1, "#231f27");
      ctx.strokeStyle = pants; ctx.lineWidth = 24; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-side * 4, 15, side * 2, 33); ctx.stroke();
      ctx.strokeStyle = "rgba(231,189,140,.35)"; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(-7, 7); ctx.quadraticCurveTo(-9, 19, -4, 29); ctx.stroke();
      ctx.fillStyle = "#5f343b"; ctx.beginPath(); ctx.arc(side * 2, 33, 11, 0, Math.PI * 2); ctx.fill();
      ctx.translate(side * 2, 33);
      ctx.rotate(lowerAngle);
      ctx.strokeStyle = pants; ctx.lineWidth = 18; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * 5, 15, side * 4, 29); ctx.stroke();
      // ankle ribbing
      ctx.fillStyle = "#e9d4b3"; rounded(-9, 20, 18, 9, 3); ctx.fill();
      ctx.fillStyle = "#8d3b39"; ctx.fillRect(-9, 23, 18, 2.5);
      ctx.fillStyle = "#d7a55f"; ctx.fillRect(-9, 27, 18, 2);
      // sneaker silhouette and layered sole
      ctx.save(); ctx.translate(side * 4, 30);
      const shoe = ctx.createLinearGradient(-15, -7, 17, 12);
      shoe.addColorStop(0, "#f6e8d0"); shoe.addColorStop(.42, "#c7ad8e"); shoe.addColorStop(.72, "#913d3b"); shoe.addColorStop(1, "#4a2730");
      ctx.fillStyle = shoe;
      ctx.beginPath(); ctx.moveTo(-8, -10); ctx.quadraticCurveTo(0, -14, 8, -8); ctx.lineTo(18, 3); ctx.quadraticCurveTo(25, 9, 17, 13); ctx.lineTo(-17, 13); ctx.quadraticCurveTo(-22, 8, -15, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f6e9d1"; rounded(-19, 8, 39, 7, 3); ctx.fill();
      ctx.fillStyle = "#b88750"; ctx.fillRect(-15, 13, 32, 2);
      ctx.strokeStyle = "#8d3b39"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(7, 2); ctx.moveTo(-9, -2); ctx.lineTo(5, 6); ctx.stroke();
      ctx.strokeStyle = "#f5e5c8"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(6, 0); ctx.stroke();
      ctx.fillStyle = "#d7a45a"; ctx.beginPath(); ctx.arc(0, -7, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.restore();
      ctx.restore();
    }

    const pose = sliding ? "slide" : jumping ? "jump" : "run";
    drawLeg(-1, runPhase, pose);
    drawLeg(1, runPhase, pose);

    // Arms swing opposite to the legs; elbow, cuff and hand are drawn separately.
    function drawArm(side, phase, poseName) {
      ctx.save();
      ctx.translate(side * 27, -111);
      let angle = Math.sin(phase + (side < 0 ? Math.PI : 0)) * .5;
      if (poseName === "jump") angle = side * -.48 - .42;
      if (poseName === "slide") angle = side * .92 + .3;
      ctx.rotate(angle);
      const sleeve = ctx.createLinearGradient(-12, 0, 12, 0);
      sleeve.addColorStop(0, "#a98d70"); sleeve.addColorStop(.3, "#fff0d6"); sleeve.addColorStop(.7, "#e3cfb3"); sleeve.addColorStop(1, "#98795f");
      ctx.strokeStyle = sleeve; ctx.lineWidth = 21; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * 8, 18, side * 13, 37); ctx.stroke();
      ctx.strokeStyle = "#a64a42"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(side * 8, 29); ctx.lineTo(side * 17, 32); ctx.stroke();
      ctx.fillStyle = "#e8c39a"; ctx.beginPath(); ctx.ellipse(side * 13, 48, 8, 11, side * .25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(139,83,57,.45)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(side * 11, 45); ctx.lineTo(side * 15, 52); ctx.stroke();
      ctx.restore();
    }
    drawArm(-1, runPhase, pose);
    drawArm(1, runPhase, pose);

    // Hoodie body with quilted panels, shoulder seams, hem ribbing and a rear emblem.
    ctx.save();
    ctx.translate(0, -104);
    const jacket = ctx.createLinearGradient(-34, -23, 34, 51);
    jacket.addColorStop(0, "#fff5e4"); jacket.addColorStop(.28, "#f0e1c9"); jacket.addColorStop(.62, "#d9c3a5"); jacket.addColorStop(.83, "#fff0d8"); jacket.addColorStop(1, "#b79a78");
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.moveTo(-22, -24); ctx.quadraticCurveTo(-34, -17, -35, 0); ctx.lineTo(-29, 45);
    ctx.quadraticCurveTo(0, 57, 29, 45); ctx.lineTo(35, 0); ctx.quadraticCurveTo(34, -17, 22, -24);
    ctx.quadraticCurveTo(0, -33, -22, -24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(103,67,51,.55)"; ctx.lineWidth = 1.6; ctx.stroke();
    // Side panels and stitched seams.
    ctx.strokeStyle = "rgba(151,117,85,.42)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-25, -5); ctx.quadraticCurveTo(-20, 20, -21, 43); ctx.moveTo(25, -5); ctx.quadraticCurveTo(20, 20, 21, 43); ctx.stroke();
    // Hood folds rise around the neck.
    ctx.fillStyle = "#d1baa0";
    ctx.beginPath(); ctx.moveTo(-21, -22); ctx.quadraticCurveTo(-27, -42, -8, -45); ctx.quadraticCurveTo(0, -42, 8, -45); ctx.quadraticCurveTo(27, -42, 21, -22); ctx.quadraticCurveTo(0, -12, -21, -22); ctx.fill();
    ctx.strokeStyle = "#fff3de"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-17, -28); ctx.quadraticCurveTo(0, -17, 17, -28); ctx.stroke();
    // Cuffs and hem details.
    ctx.fillStyle = "#8c3737"; ctx.fillRect(-29, 39, 58, 6);
    ctx.fillStyle = "#d4a75e"; ctx.fillRect(-29, 44, 58, 2.5);
    ctx.fillStyle = "#8c3737"; ctx.fillRect(-27, -1, 7, 9); ctx.fillRect(20, -1, 7, 9);
    // Back embroidered medallion, inspired by the Zarad spice-flower mark.
    ctx.save(); ctx.translate(0, 1);
    ctx.fillStyle = "#8d3737";
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, r = i % 2 ? 5 : 11;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8a85c"; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#74302f"; ctx.font = "800 9px Georgia,serif"; ctx.textAlign = "center";
    ctx.fillText("ZARAD", 0, 20);
    ctx.restore();
    // Tiny embroidered piping and drawstrings.
    ctx.strokeStyle = "#b58b57"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-10, -17); ctx.lineTo(-8, -8); ctx.moveTo(10, -17); ctx.lineTo(8, -8); ctx.stroke();
    ctx.fillStyle = "#b58b57"; ctx.beginPath(); ctx.arc(-8, -7, 1.4, 0, Math.PI * 2); ctx.arc(8, -7, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Head, curly hair, ears and burgundy cap with a gold eight-point flower.
    ctx.save(); ctx.translate(0, -159);
    ctx.fillStyle = "#332a2a";
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * .12 + i * Math.PI * .15;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 20, 8 + Math.sin(a) * 15, 7.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#e8c39a";
    ctx.beginPath(); ctx.ellipse(0, 5, 20, 23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d4a783";
    ctx.beginPath(); ctx.ellipse(-20, 8, 5, 8, -.15, 0, Math.PI * 2); ctx.ellipse(20, 8, 5, 8, .15, 0, Math.PI * 2); ctx.fill();
    const cap = ctx.createLinearGradient(-22, -26, 22, 13);
    cap.addColorStop(0, "#a74742"); cap.addColorStop(.45, "#852e35"); cap.addColorStop(1, "#4d2830");
    ctx.fillStyle = cap;
    ctx.beginPath(); ctx.moveTo(-22, 1); ctx.quadraticCurveTo(-23, -34, 0, -36); ctx.quadraticCurveTo(24, -34, 22, 1); ctx.quadraticCurveTo(0, 14, -22, 1); ctx.fill();
    ctx.fillStyle = "#d7a85c";
    ctx.beginPath(); ctx.ellipse(0, 1, 24, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#f0cf8f"; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = "#f0d08a";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = i % 2 ? 4 : 8;
      const px = Math.cos(a) * r, py = -18 + Math.sin(a) * r;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath(); ctx.ellipse(-8, -25, 6, 3, -.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Little shoe dust puffs give the footfalls weight.
    if (!jumping && !sliding) {
      ctx.globalAlpha = .22 + Math.abs(stride) * .12;
      ctx.fillStyle = "#f6d3a0";
      for (let i = 0; i < 3; i++) {
        const px = -24 - i * 11 + Math.sin(runPhase + i) * 5;
        const py = -3 + i * 4;
        ctx.beginPath(); ctx.arc(px, py, 2.5 + i, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBarrier(x, ground, scale) {
    const w = 108 * scale, h = 58 * scale;
    ctx.save(); ctx.translate(x, ground);
    ctx.fillStyle = "rgba(20,14,12,.3)";
    ctx.beginPath(); ctx.ellipse(0, 4 * scale, w * .72, 12 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#704432";
    ctx.fillRect(-w * .37, -h * .05, w * .12, h * .8);
    ctx.fillRect(w * .25, -h * .05, w * .12, h * .8);
    const board = ctx.createLinearGradient(0, -h, 0, 0);
    board.addColorStop(0, "#fff1d1"); board.addColorStop(1, "#d8b98c");
    ctx.fillStyle = board; rounded(-w * .55, -h, w * 1.1, h * .53, 5 * scale); ctx.fill();
    ctx.strokeStyle = "#835038"; ctx.lineWidth = 2 * scale; ctx.stroke();
    ctx.save(); rounded(-w * .53, -h * .98, w * 1.06, h * .48, 4 * scale); ctx.clip();
    for (let i = -4; i <= 4; i++) {
      ctx.fillStyle = i % 2 ? "#a33e36" : "#f0d9b2";
      ctx.beginPath(); ctx.moveTo(i * w * .24 - 11 * scale, -h); ctx.lineTo(i * w * .24 + 11 * scale, -h); ctx.lineTo(i * w * .24 + 35 * scale, -h * .46); ctx.lineTo(i * w * .24 + 13 * scale, -h * .46); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#e9c66e"; ctx.beginPath(); ctx.arc(side * w * .45, -h * .75, 4.5 * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    if (!particles.length) return;
    ctx.save();
    particles.forEach((particle) => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.colour;
      ctx.shadowColor = particle.colour;
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size * (.4 + alpha), 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function draw(now) {
    drawWorld(now);
    objects.slice().sort((a, b) => b.z - a.z).forEach((item) => {
      const y = yAt(1 - item.z), scale = .24 + (1 - item.z) * 1.06, x = xAt(item.lane, item.z);
      if (item.kind === "spice") drawSpice(item, x, y, scale);
      else if (item.kind === "crate") drawCrate(x, y, scale);
      else if (item.kind === "train") drawTrain(x, y, scale);
      else if (item.kind === "barrier") drawBarrier(x, y, scale);
      else drawAwning(x, y, scale);
    });
    drawParticles();
    drawRunner(now);
    if (toastTime > 0 && toast) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, toastTime * 2);
      rounded(305, 164, 350, 42, 12);
      ctx.fillStyle = "rgba(55,34,28,.88)"; ctx.fill();
      ctx.strokeStyle = "rgba(243,198,119,.7)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#ffe6b6"; ctx.font = "700 16px Georgia,serif"; ctx.textAlign = "center";
      ctx.fillText(toast, W / 2, 191);
      ctx.restore();
    }
  }

  function spawn() {
    const laneChoice = Math.floor(Math.random() * 3) - 1;
    if (Math.random() < .37) objects.push({ kind: "spice", lane: laneChoice, z: 1.06, spiceIndex: Math.floor(Math.random() * spices.length), resolved: false });
    else {
      const roll = Math.random();
      const kind = roll < .34 ? "crate" : roll < .57 ? "awning" : roll < .79 ? "barrier" : "train";
      objects.push({ kind, lane: laneChoice, z: 1.06, resolved: false });
    }
  }
  function burst(x, y, colour, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 145;
      const life = .35 + Math.random() * .45;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, life, maxLife: life, size: 1.8 + Math.random() * 3.2, colour });
    }
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
    particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 95 * dt; particle.life -= dt; });
    particles = particles.filter((particle) => particle.life > 0);
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
            burst(xAt(item.lane, item.z), yAt(1 - item.z) - 25, "#ffcf69", 15);
            notify(say("Ai adunat: " + spice[0], "Collected: " + spice[1]));
          } else {
            const cleared = item.kind === "crate" || item.kind === "barrier" ? jumpTime > .12 : item.kind === "awning" ? slideTime > .12 : false;
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
    metres = 0; collected = 0; elapsed = 0; spawnClock = 0; objects = []; particles = []; toast = ""; toastTime = 0;
    running = true; paused = document.hidden;
    intro.hidden = true; result.hidden = true; play.hidden = false;
    feedback.textContent = say("Ferește-te de tramvaie, sari peste bariere și strânge borcanele!", "Dodge trams, jump the barriers and collect the spice jars!");
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