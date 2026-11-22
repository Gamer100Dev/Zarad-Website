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
  if (!dialog || !close || !intro || !play || !result || !start || !restart || !canvas || !renderer) return;

  const W = 960, H = 540, horizon = 118, playerDepth = 0.82;
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

  // A real four-pose SVG sprite replaces the old hand-drawn character.
  const runnerSprite = new Image();
  let runnerSpriteReady = false;
  runnerSprite.addEventListener("load", () => {
    runnerSpriteReady = runnerSprite.naturalWidth >= 720 && runnerSprite.naturalHeight >= 260;
  });
  runnerSprite.src = "/assets/game/zarad-runner-sprites.svg?v=runner-art-fix-20261122";
  if (runnerSprite.complete && runnerSprite.naturalWidth >= 720) runnerSpriteReady = true;

  let raf = 0, last = 0, spawnClock = 0, elapsed = 0, roadScroll = 0;
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
  // One camera convention everywhere: depth 0 is the distant horizon,
  // depth 1 is the runner's near-ground plane. Objects move by increasing depth.
  function clampDepth(depth) { return Math.max(0, Math.min(1.24, depth)); }
  function yAt(depth) {
    const d = clampDepth(depth);
    return horizon + Math.pow(d, 1.55) * (H - horizon);
  }
  function spacing(depth) {
    const d = clampDepth(depth);
    return 98 + d * 248;
  }
  function xAt(which, depth) { return W / 2 + which * spacing(depth); }
  function scaleAt(depth) {
    const d = clampDepth(depth);
    return 0.22 + Math.pow(d, 1.08) * 1.16;
  }
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

  function drawSpiceBowl(x, y, scale, spiceColour, rimColour) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(31,18,14,.24)";
    ctx.beginPath(); ctx.ellipse(0, 4, 32, 9, 0, 0, Math.PI * 2); ctx.fill();
    const ceramic = ctx.createLinearGradient(-30, 0, 30, 0);
    ceramic.addColorStop(0, "#4b302d"); ceramic.addColorStop(.3, rimColour); ceramic.addColorStop(.7, "#e1b775"); ceramic.addColorStop(1, "#58342e");
    ctx.fillStyle = ceramic;
    ctx.beginPath(); ctx.moveTo(-29, -8); ctx.quadraticCurveTo(-22, 19, 0, 20); ctx.quadraticCurveTo(22, 19, 29, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#f1cf91"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -8, 29, 8, 0, 0, Math.PI * 2); ctx.stroke();
    const mound = ctx.createRadialGradient(-8, -18, 2, 0, -12, 30);
    mound.addColorStop(0, "#f0d18c"); mound.addColorStop(.4, spiceColour); mound.addColorStop(1, "#693f32");
    ctx.fillStyle = mound;
    ctx.beginPath(); ctx.moveTo(-25, -9); ctx.quadraticCurveTo(-17, -31, 0, -35); ctx.quadraticCurveTo(18, -30, 25, -9); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,224,162,.45)" : "rgba(65,37,28,.2)";
      ctx.beginPath(); ctx.arc(-17 + (i * 13 % 34), -13 - (i * 7 % 15), 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawMarketAwning(x, y, width, height, phase) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(33,19,16,.22)"; ctx.beginPath(); ctx.ellipse(0, height * .14, width * .63, height * .12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5b342d"; ctx.fillRect(-width * .53, -height * .05, width * .06, height * 1.1); ctx.fillRect(width * .47, -height * .05, width * .06, height * 1.1);
    ctx.fillStyle = "#6b3731";
    ctx.beginPath(); ctx.moveTo(-width * .64, 0); ctx.lineTo(width * .64, 0); ctx.lineTo(width * .55, -height * .5); ctx.lineTo(-width * .55, -height * .5); ctx.closePath(); ctx.fill();
    const colours = ["#913a36", "#e5c58e", "#b77a43", "#f3dfb8", "#46634b"];
    for (let i = 0; i < 9; i++) {
      const sx = -width * .6 + i * width * .15;
      ctx.fillStyle = colours[(i + Math.floor(phase)) % colours.length];
      ctx.beginPath(); ctx.moveTo(sx, -height * .48); ctx.lineTo(sx + width * .15, -height * .48); ctx.lineTo(sx + width * .16, -height * .1); ctx.quadraticCurveTo(sx + width * .08, -height * .03 + Math.sin(phase + i) * 2, sx - width * .01, -height * .1); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "#e2bb78"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-width * .6, -height * .49); ctx.lineTo(width * .6, -height * .49); ctx.stroke();
    ctx.restore();
  }

  function drawWorld(now) {
    const t = now * .001;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#3976a4"); sky.addColorStop(.27, "#8cb8c6"); sky.addColorStop(.62, "#f6ca83"); sky.addColorStop(1, "#bb7146");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sunGlow = ctx.createRadialGradient(480, 110, 4, 480, 110, 190);
    sunGlow.addColorStop(0, "rgba(255,237,192,.22)"); sunGlow.addColorStop(.4, "rgba(255,203,128,.08)"); sunGlow.addColorStop(1, "rgba(255,180,100,0)");
    ctx.fillStyle = sunGlow; ctx.fillRect(260, 0, 440, 315);

    // Distant medina rooftops.
    for (let i = 0; i < 16; i++) {
      const bx = i * 66 - 12, bh = 38 + (i * 31 % 42);
      ctx.fillStyle = i % 2 ? "#825345" : "#9a6149";
      ctx.fillRect(bx, 170 - bh, 54, bh + 80);
      ctx.fillStyle = "#d5a06d"; ctx.fillRect(bx + 7, 165 - bh, 40, 4);
      if (i % 3 === 1) drawDome(bx + 27, 169 - bh, 40, 28, "#b77951");
    }
    drawDome(480, 178, 125, 82, "#bd8055");
    drawDome(340, 189, 75, 49, "#a66d4d");
    drawDome(628, 188, 81, 53, "#b87b50");

    // Grand tiled gateway with a deep, glowing arch.
    const gate = ctx.createLinearGradient(340, 55, 620, 230);
    gate.addColorStop(0, "#9b5644"); gate.addColorStop(.5, "#d6a16d"); gate.addColorStop(1, "#7c493c");
    ctx.fillStyle = gate;
    ctx.beginPath(); ctx.moveTo(335, 228); ctx.lineTo(335, 116); ctx.quadraticCurveTo(480, -10, 625, 116); ctx.lineTo(625, 228); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#f0c98b"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(351, 225); ctx.lineTo(351, 120); ctx.quadraticCurveTo(480, 5, 609, 120); ctx.lineTo(609, 225); ctx.stroke();
    ctx.fillStyle = "#51343a";
    ctx.beginPath(); ctx.moveTo(396, 228); ctx.lineTo(396, 148); ctx.quadraticCurveTo(480, 63, 564, 148); ctx.lineTo(564, 228); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,214,151,.44)"; ctx.beginPath(); ctx.arc(480, 172, 46, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#e9c88f";
    for (let i = 0; i < 7; i++) ctx.fillRect(351 + i * 43, 124 + i % 2 * 3, 17, 6);
    ctx.font = "700 10px Georgia,serif"; ctx.textAlign = "center"; ctx.fillText("✦  ZARAD  ✦", 480, 207);

    // Market walls and recessed Moorish windows.
    for (let side = 0; side < 2; side++) {
      const sx = side ? 792 : 0;
      const wall = ctx.createLinearGradient(sx, 150, sx + 168, 520);
      wall.addColorStop(0, "#7d4037"); wall.addColorStop(.5, "#a55d45"); wall.addColorStop(1, "#59342f");
      ctx.fillStyle = wall; ctx.fillRect(sx, 150, 168, 390);
      for (let i = 0; i < 3; i++) {
        const wx = sx + 15 + i * 53;
        ctx.fillStyle = "#4e3030";
        ctx.beginPath(); ctx.moveTo(wx, 234); ctx.lineTo(wx, 194); ctx.quadraticCurveTo(wx + 18, 162, wx + 36, 194); ctx.lineTo(wx + 36, 234); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(248,190,115,.55)"; ctx.fillRect(wx + 6, 201, 24, 28);
        ctx.strokeStyle = "#d9aa70"; ctx.lineWidth = 2; ctx.strokeRect(wx + 6, 201, 24, 28);
      }
      ctx.fillStyle = "rgba(240,194,132,.2)";
      for (let y = 250; y < 510; y += 43) ctx.fillRect(sx + 8, y, 151, 2);
    }

    // Shop stalls with rows of spices and striped canopies.
    for (let side = 0; side < 2; side++) {
      const sx = side ? 790 : 0;
      drawMarketAwning(sx + 83, 285, 174, 102, t * 2 + side);
      ctx.fillStyle = "#4a2d29"; ctx.fillRect(sx + 10, 294, 154, 198);
      ctx.fillStyle = "#bd8750"; ctx.fillRect(sx + 8, 291, 158, 9);
      for (let row = 0; row < 3; row++) {
        const yy = 333 + row * 50;
        ctx.fillStyle = "#bd8853"; ctx.fillRect(sx + 17, yy, 139, 5);
        drawSpiceBowl(sx + 42, yy, .61, ["#b5432c", "#d59b2c", "#75553c"][row], "#844637");
        drawSpiceBowl(sx + 86, yy, .61, ["#d39a28", "#743b2f", "#607246"][row], "#7d4334");
        drawSpiceBowl(sx + 130, yy, .61, ["#694b35", "#a53e30", "#d4a342"][row], "#744539");
      }
      ctx.fillStyle = "rgba(36,21,18,.38)"; ctx.fillRect(sx + 8, 492, 158, 48);
    }

    // Decorative blue-and-ochre ceramics around the market edge.
    [[190,382,.88,"#3f6666"],[770,390,.92,"#405d65"],[236,331,.6,"#a44a38"],[726,329,.6,"#a44a38"],[120,452,1,"#b77d4b"],[842,454,1,"#b77d4b"]].forEach(([x,y,s,c]) => {
      ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
      ctx.fillStyle = "rgba(35,21,18,.24)"; ctx.beginPath(); ctx.ellipse(0,5,30,8,0,0,Math.PI*2); ctx.fill();
      const pot = ctx.createLinearGradient(-26,0,26,0); pot.addColorStop(0,"#4a302e"); pot.addColorStop(.35,c); pot.addColorStop(.7,"#e1b77b"); pot.addColorStop(1,"#4a302e");
      ctx.fillStyle = pot; ctx.beginPath(); ctx.moveTo(-16,-5); ctx.quadraticCurveTo(-32,-30,-17,-49); ctx.quadraticCurveTo(0,-64,17,-49); ctx.quadraticCurveTo(32,-30,16,-5); ctx.quadraticCurveTo(0,13,-16,-5); ctx.fill();
      ctx.fillStyle = "#d8b071"; ctx.fillRect(-13,-54,26,7);
      ctx.strokeStyle = "rgba(248,220,175,.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0,-27,20,9,0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8,-44); ctx.lineTo(-8,-9); ctx.moveTo(8,-44); ctx.lineTo(8,-9); ctx.stroke();
      ctx.restore();
    });

    // Palm leaves sway, while brass lanterns glow on both sides of the route.
    drawPalm(33, 330, .8, Math.sin(t * 1.2));
    drawPalm(927, 330, .82, Math.sin(t * 1.2 + 1));
    drawPalm(282, 236, .35, Math.sin(t * 1.2 + 2));
    drawPalm(684, 236, .36, Math.sin(t * 1.2 + 3));
    drawLantern(83, 245, .85, now); drawLantern(876, 245, .85, now);
    drawLantern(252, 205, .52, now); drawLantern(713, 205, .52, now);

    // Rippling market pennants above the vanishing point.
    ctx.strokeStyle = "rgba(79,43,38,.75)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, 76); ctx.quadraticCurveTo(480, 153 + Math.sin(t) * 5, 960, 76); ctx.stroke();
    const flagColours = ["#8f3434", "#d5a04a", "#466b4c", "#eee0bd"];
    for (let i = 0; i < 15; i++) {
      const x = 16 + i * 66, y = 78 + Math.sin(x / 160 + t) * 15;
      ctx.fillStyle = flagColours[i % flagColours.length];
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+31,y+5); ctx.lineTo(x+27,y+33); ctx.lineTo(x+15,y+24); ctx.lineTo(x+5,y+32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,224,168,.7)"; ctx.beginPath(); ctx.arc(x+15,y+12,2.5,0,Math.PI*2); ctx.fill();
    }

    // Three-track railway bed, polished rails and timber sleepers.
    const road = ctx.createLinearGradient(0, horizon, 0, H);
    road.addColorStop(0, "#957255"); road.addColorStop(.38, "#785542"); road.addColorStop(1, "#312a2a");
    ctx.fillStyle = road; ctx.beginPath(); ctx.moveTo(366,horizon); ctx.lineTo(594,horizon); ctx.lineTo(1000,H); ctx.lineTo(-40,H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(244,210,158,.08)";
    for (let i = 0; i < 15; i++) { const y = yAt(i/14); ctx.fillRect(0,y,W,1+i/5); }
    const scroll = roadScroll;
    for (let laneIndex = -1; laneIndex <= 1; laneIndex++) {
      const topX = xAt(laneIndex, 0);
      const bottomX = xAt(laneIndex, 1);

      // Sleepers are actual pieces of track moving from the vanishing point
      // toward the camera. Their position, width and thickness all grow with depth.
      for (let i = 0; i < 16; i++) {
        const depth = (i / 16 + scroll) % 1;
        const y = yAt(depth);
        const x = xAt(laneIndex, depth);
        const width = 24 + depth * 54;
        const thickness = 1.5 + depth * 4.5;
        const radius = 1 + depth * 2.2;

        ctx.fillStyle = "rgba(19,13,12,.38)";
        rounded(x - width / 2, y - thickness * .15, width, thickness * 1.4, radius);
        ctx.fill();

        const wood = ctx.createLinearGradient(x - width / 2, y - thickness, x + width / 2, y);
        wood.addColorStop(0, "#432d29");
        wood.addColorStop(.22, "#835339");
        wood.addColorStop(.5, "#c18b55");
        wood.addColorStop(.78, "#835339");
        wood.addColorStop(1, "#432d29");
        ctx.fillStyle = wood;
        rounded(x - width / 2, y - thickness, width, thickness, radius);
        ctx.fill();

        ctx.strokeStyle = "rgba(244,211,157," + (.18 + depth * .26) + ")";
        ctx.lineWidth = Math.max(.6, depth * 1.1);
        ctx.beginPath();
        ctx.moveTo(x - width * .39, y - thickness * .74);
        ctx.lineTo(x + width * .39, y - thickness * .74);
        ctx.stroke();

        // Rail fasteners grow with the sleepers as they approach.
        const boltRadius = .7 + depth * 1.3;
        for (const side of [-1, 1]) {
          ctx.fillStyle = "#4b3430";
          ctx.beginPath();
          ctx.arc(x + side * width * .34, y - thickness * .18, boltRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(244,209,148,.55)";
          ctx.beginPath();
          ctx.arc(x + side * width * .34 - boltRadius * .25, y - thickness * .35, Math.max(.4, boltRadius * .25), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Rails sit above the timber sleepers. Their cross-section widens toward
      // the viewer, instead of using constant-width 2D strokes.
      for (const side of [-1, 1]) {
        const farX = topX + side * 12;
        const nearX = bottomX + side * 35;
        const farHalf = 1.35;
        const nearHalf = 5.2;

        ctx.fillStyle = "rgba(14,10,10,.42)";
        ctx.beginPath();
        ctx.moveTo(farX - farHalf * 1.8, horizon);
        ctx.lineTo(farX + farHalf * 1.8, horizon);
        ctx.lineTo(nearX + nearHalf * 1.55, H);
        ctx.lineTo(nearX - nearHalf * 1.55, H);
        ctx.closePath();
        ctx.fill();

        const rail = ctx.createLinearGradient(0, horizon, 0, H);
        rail.addColorStop(0, "#6d625d");
        rail.addColorStop(.2, "#c5b6a0");
        rail.addColorStop(.42, "#f2dfbb");
        rail.addColorStop(.68, "#8b8178");
        rail.addColorStop(1, "#d8c6a5");

        ctx.fillStyle = rail;
        ctx.beginPath();
        ctx.moveTo(farX - farHalf, horizon);
        ctx.lineTo(farX + farHalf, horizon);
        ctx.lineTo(nearX + nearHalf, H);
        ctx.lineTo(nearX - nearHalf, H);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(255,248,222,.78)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(farX - farHalf * .22, horizon);
        ctx.lineTo(nearX - nearHalf * .28, H);
        ctx.stroke();

        ctx.strokeStyle = "rgba(52,39,35,.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(farX + farHalf * .55, horizon);
        ctx.lineTo(nearX + nearHalf * .72, H);
        ctx.stroke();
      }
    }
    const reflection = ctx.createLinearGradient(0,210,0,H);
    reflection.addColorStop(0,"rgba(255,204,116,0)"); reflection.addColorStop(1,"rgba(255,177,87,.045)");
    ctx.fillStyle = reflection; ctx.fillRect(0,210,W,330);

    ctx.save(); ctx.fillStyle = "rgba(50,27,28,.84)"; rounded(389,91,182,38,9); ctx.fill();
    ctx.strokeStyle = "#dfb56f"; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = "#ffebc4"; ctx.font = "700 15px Georgia,serif"; ctx.textAlign = "center";
    ctx.fillText("✦  ZARAD SOUK  ✦",480,115); ctx.restore();

    for (let i = 0; i < 24; i++) {
      const x = (i*113 + Math.sin(t*.8+i)*14) % W;
      const y = (i*47 + t*(8+i%5)) % 330;
      const alpha = .12 + (Math.sin(t*1.7+i*2)+1)*.12;
      ctx.fillStyle = "rgba(255,236,186," + alpha + ")";
      ctx.beginPath(); ctx.arc(x,y,.8+(i%3)*.45,0,Math.PI*2); ctx.fill();
    }
  }

  function drawCrate(x, ground, scale) {
    const w=100*scale, h=82*scale;
    ctx.save(); ctx.translate(x,ground);
    ctx.fillStyle="rgba(20,14,12,.34)"; ctx.beginPath(); ctx.ellipse(0,4*scale,w*.7,13*scale,0,0,Math.PI*2); ctx.fill();
    const face=ctx.createLinearGradient(-w/2,-h,w/2,0);
    face.addColorStop(0,"#d49b58"); face.addColorStop(.42,"#a66a3c"); face.addColorStop(1,"#65402f");
    ctx.fillStyle=face; ctx.beginPath(); ctx.moveTo(-w*.47,-h); ctx.lineTo(w*.39,-h); ctx.lineTo(w*.5,-h*.88); ctx.lineTo(w*.5,-h*.08); ctx.lineTo(-w*.39,0); ctx.lineTo(-w*.5,-h*.13); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#efc27e"; ctx.lineWidth=3.4*scale; ctx.stroke();
    ctx.strokeStyle="rgba(77,43,30,.75)"; ctx.lineWidth=3*scale;
    for(let i=-2;i<=2;i++){const xx=i*w*.16;ctx.beginPath();ctx.moveTo(xx,-h*.94);ctx.lineTo(xx,-h*.09);ctx.stroke();}
    ctx.strokeStyle="rgba(248,210,151,.42)";ctx.lineWidth=1.1*scale;
    ctx.beginPath();ctx.moveTo(-w*.42,-h*.76);ctx.lineTo(w*.42,-h*.76);ctx.moveTo(-w*.42,-h*.34);ctx.lineTo(w*.42,-h*.34);ctx.stroke();
    ctx.fillStyle="#542e29";rounded(-w*.25,-h*.72,w*.5,h*.42,4*scale);ctx.fill();
    ctx.strokeStyle="#d9a75c";ctx.lineWidth=1.4*scale;ctx.stroke();
    ctx.fillStyle="#f3d49b";ctx.font="700 "+Math.max(7,9*scale)+"px Georgia,serif";ctx.textAlign="center";ctx.fillText("✧ ZARAD ✧",0,-h*.48);
    ctx.restore();
  }

  function drawAwning(x, ground, scale) {
    const w=126*scale,h=118*scale;
    ctx.save();ctx.translate(x,ground);
    ctx.fillStyle="rgba(20,14,12,.28)";ctx.beginPath();ctx.ellipse(0,2*scale,w*.68,11*scale,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#61372e";ctx.fillRect(-w*.5,-h*.93,w*.11,h*.93);ctx.fillRect(w*.39,-h*.93,w*.11,h*.93);
    ctx.fillStyle="#a84b3a";rounded(-w*.61,-h,w*1.22,h*.3,5*scale);ctx.fill();
    for(let i=-3;i<=3;i++){const sx=i*w*.17;ctx.fillStyle=i%2?"#e6bd76":"#f3dfb6";ctx.fillRect(sx-w*.055,-h*.98,w*.11,h*.24);ctx.beginPath();ctx.arc(sx,-h*.72,w*.055,0,Math.PI);ctx.fill();}
    ctx.strokeStyle="#e5b970";ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(-w*.58,-h*.68);ctx.lineTo(w*.58,-h*.68);ctx.stroke();
    ctx.fillStyle="#69392f";ctx.fillRect(-w*.52,-h*.72,w*.07,h*.72);ctx.fillRect(w*.45,-h*.72,w*.07,h*.72);
    ctx.restore();
  }

  function drawTrain(x, ground, scale) {
    const w=132*scale,h=164*scale;
    ctx.save();ctx.translate(x,ground);
    ctx.fillStyle="rgba(20,14,12,.36)";ctx.beginPath();ctx.ellipse(0,5*scale,w*.72,15*scale,0,0,Math.PI*2);ctx.fill();
    const body=ctx.createLinearGradient(-w*.5,-h,w*.5,0);
    body.addColorStop(0,"#5e282e");body.addColorStop(.25,"#9d3d3a");body.addColorStop(.65,"#762b32");body.addColorStop(1,"#3f252b");
    ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-w*.48,-h*.83);ctx.quadraticCurveTo(-w*.47,-h,-w*.28,-h);ctx.lineTo(w*.28,-h);ctx.quadraticCurveTo(w*.47,-h,w*.48,-h*.83);ctx.lineTo(w*.5,-h*.08);ctx.quadraticCurveTo(0,3*scale,-w*.5,-h*.08);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#e7bd78";ctx.lineWidth=3*scale;ctx.stroke();
    ctx.fillStyle="#efe0c2";rounded(-w*.4,-h*.96,w*.8,h*.1,5*scale);ctx.fill();
    const glass=ctx.createLinearGradient(0,-h*.82,0,-h*.38);glass.addColorStop(0,"#263a43");glass.addColorStop(.45,"#53666a");glass.addColorStop(1,"#192b34");
    ctx.fillStyle=glass;rounded(-w*.36,-h*.82,w*.72,h*.43,10*scale);ctx.fill();ctx.strokeStyle="#d7b77e";ctx.lineWidth=2*scale;ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.18)";ctx.beginPath();ctx.moveTo(-w*.28,-h*.76);ctx.lineTo(-w*.05,-h*.76);ctx.lineTo(-w*.12,-h*.43);ctx.lineTo(-w*.29,-h*.43);ctx.closePath();ctx.fill();
    ctx.fillStyle="#f2d49b";rounded(-w*.14,-h*.33,w*.28,h*.12,3*scale);ctx.fill();
    ctx.fillStyle="#692a30";ctx.font="700 "+Math.max(8,11*scale)+"px Georgia,serif";ctx.textAlign="center";ctx.fillText("ZARAD",0,-h*.245);
    for(const side of [-1,1]){
      const glow=ctx.createRadialGradient(side*w*.33,-h*.16,1,side*w*.33,-h*.16,23*scale);glow.addColorStop(0,"rgba(255,237,168,.8)");glow.addColorStop(1,"rgba(255,205,103,0)");
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(side*w*.33,-h*.16,23*scale,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff1bd";ctx.beginPath();ctx.arc(side*w*.33,-h*.16,6*scale,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="#402b2c";rounded(-w*.46,-h*.07,w*.92,h*.1,4*scale);ctx.fill();
    ctx.fillStyle="#d9b377";ctx.fillRect(-w*.3,-h*.035,w*.6,3*scale);
    ctx.restore();
  }

  function drawSpice(item, x, ground, scale) {
    const w = 42 * scale, h = 56 * scale;
    const bob = Math.sin(elapsed * 5 + item.depth * 7) * 3 * scale;
    const y = ground - h * .5 - 10 * scale + bob;
    ctx.save(); ctx.translate(x, y);
    // Soft halo behind the floating glass jar.
    const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 48 * scale);
    halo.addColorStop(0, "rgba(255,213,111,.30)"); halo.addColorStop(.45, "rgba(255,188,78,.10)"); halo.addColorStop(1, "rgba(255,177,69,0)");
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
    const x = xAt(visualLane, playerDepth);
    const jumping = jumpTime > 0;
    const sliding = slideTime > 0;
    const jumpProgress = jumping ? Math.min(1, jumpTime / .78) : 0;
    const lift = jumping ? Math.sin(jumpProgress * Math.PI) * 112 : 0;
    const runningFrame = Math.floor(now / 115) % 2;
    const frame = sliding ? 3 : jumping ? 2 : runningFrame;
    const lean = Math.max(-.1, Math.min(.1, (lane - visualLane) * .15));
    const idleBob = jumping || sliding ? 0 : Math.abs(Math.sin(now * .014)) * 2.5;
    const groundY = yAt(playerDepth);
    const baseY = groundY - 3 - lift + idleBob;

    // Ground shadow stays on the track while the character rises above it.
    ctx.save();
    ctx.translate(x, groundY + 4);
    const shadowScale = Math.max(.42, 1 - lift / 155);
    ctx.scale(shadowScale, .72);
    ctx.fillStyle = "rgba(23, 15, 14, .36)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, baseY);
    ctx.rotate(lean + (sliding ? .035 : jumping ? -.018 : Math.sin(now * .007) * .012));

    if (runnerSpriteReady && runnerSprite.naturalWidth >= 720) {
      // Four 180×260 cells: alternating run, jump and slide.
      const imageX = frame * 180;
      const width = 180;
      const height = 260;
      // Each pose has its own feet baseline in the sprite sheet. Anchor that
      // baseline to the projected track plane instead of the full transparent cell.
      const footAnchor = [178, 178, 226, 234][frame];
      ctx.shadowColor = "rgba(31, 17, 15, .34)";
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(
        runnerSprite,
        imageX, 0, 180, 260,
        -width / 2, -footAnchor, width, height
      );
    } else {
      // Clean fallback silhouette while the SVG finishes loading.
      ctx.shadowColor = "rgba(31,17,15,.3)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#f4e6ce";
      ctx.beginPath();
      ctx.ellipse(0, -143, 26, 33, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#852f3a";
      ctx.beginPath();
      ctx.ellipse(0, -179, 28, 15, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-22, -177, 44, 8);
      ctx.fillStyle = "#4c2d37";
      rounded(-27, -112, 54, 78, 13);
      ctx.fill();
      ctx.fillStyle = "#f4e6ce";
      ctx.fillRect(-20, -43, 17, 42);
      ctx.fillRect(5, -43, 17, 42);
      ctx.fillStyle = "#8e343c";
      rounded(-26, -8, 26, 12, 5); ctx.fill();
      rounded(1, -8, 26, 12, 5); ctx.fill();
    }
    ctx.restore();

    // Small warm footfall glints add motion without covering the artwork.
    if (!jumping && !sliding && runningFrame === 0) {
      ctx.save();
      ctx.globalAlpha = .42;
      ctx.fillStyle = "#f6d69e";
      for (let i = 0; i < 3; i++) {
        const px = x - 20 - i * 8 + Math.sin(now * .018 + i) * 3;
        const py = groundY - 2 - i * 4;
        ctx.beginPath();
        ctx.arc(px, py, 1.8 + i * .5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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
    particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 95 * dt; particle.life -= dt; });
    particles = particles.filter((particle) => particle.life > 0);
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
    metres = 0; collected = 0; elapsed = 0; spawnClock = 0; roadScroll = 0; objects = []; particles = []; toast = ""; toastTime = 0;
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