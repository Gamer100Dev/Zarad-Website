(() => {
  "use strict";

  // Zarad's WebGL runner is a Moroccan reskin/adaptation of the classic
  // three-lane Subway Surfers systems: track movement, lane switching,
  // jump/roll physics, coin trails, obstacle patterns, boosts and police chase.
  // Gameplay structure is adapted from Rohan Chacko's MIT WebGL project:
  // https://github.com/RohanChacko/Subway-Surfers (2019).
  const LANES = [-1, 0, 1];
  const PLAYER_DEPTH = 0.82;
  const MAX_DEPTH = 1.18;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const randomLane = () => LANES[Math.floor(Math.random() * LANES.length)];
  const random = (min, max) => min + Math.random() * (max - min);

  function create() {
    let nextObjectId = 1;
    const state = {};

    function addObject(kind, lane, depth, extra) {
      state.objects.push({
        id: nextObjectId++,
        kind,
        lane: clamp(lane, -1, 1),
        depth,
        resolved: false,
        ...(extra || {})
      });
    }

    function addCoinTrail(lane, depth, count, shape) {
      const total = count || 7;
      for (let i = 0; i < total; i++) {
        let laneAt = lane;
        if (shape === "weave") {
          laneAt = lane + (i % 4 === 2 ? (lane === 1 ? -1 : 1) : 0);
        } else if (shape === "arc" && i >= 3 && i <= 5) {
          laneAt = lane === 0 ? (i === 4 ? 1 : -1) : 0;
        }
        addObject("coin", laneAt, depth + i * 0.061, { coinStyle: i % 3 });
      }
    }

    function spawnPattern() {
      const lane = randomLane();
      const roll = Math.random();
      const entryDepth = 0.015;

      if (roll < 0.30) {
        addCoinTrail(lane, entryDepth, 6 + Math.floor(Math.random() * 3),
          Math.random() < 0.34 ? "weave" : Math.random() < 0.5 ? "arc" : "line");
        return;
      }

      if (roll < 0.43) {
        const powerups = [
          "boost-magnet", "boost-jetpack", "boost-sneakers",
          "boost-hoverboard", "boost-x2"
        ];
        addObject(powerups[Math.floor(Math.random() * powerups.length)], lane, entryDepth);
        addCoinTrail(lane === 0 ? 1 : 0, entryDepth + 0.12, 5, "line");
        return;
      }

      const obstacleRoll = Math.random();
      const obstacle = obstacleRoll < 0.28 ? "train"
        : obstacleRoll < 0.52 ? "barrier"
        : obstacleRoll < 0.75 ? "awning" : "crate";
      addObject(obstacle, lane, entryDepth, {
        obstacleId: nextObjectId,
        variant: Math.floor(Math.random() * 3)
      });

      // Keep at least one adjacent route readable and reward route changes.
      const safeLane = lane === 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      if (Math.random() < 0.82) {
        addCoinTrail(safeLane, entryDepth + 0.10, 5, "line");
      }

      // Later runs add a second obstacle, never blocking all three lanes.
      if (state.elapsed > 18 && Math.random() < 0.22) {
        const secondLane = lane === 0 ? (safeLane === -1 ? 1 : -1) : -lane;
        addObject(Math.random() < 0.55 ? "crate" : "barrier",
          secondLane, entryDepth + random(0.015, 0.07));
      }
    }

    function reset() {
      nextObjectId = 1;
      Object.assign(state, {
        elapsed: 0,
        distance: 0,
        speed: 13.5,
        lane: 0,
        visualLane: 0,
        jumpHeight: 0,
        jumpVelocity: 0,
        jumpTime: 0,
        slideTime: 0,
        roadScroll: 0,
        score: 0,
        coins: 0,
        combo: 0,
        comboTimer: 0,
        magnet: 0,
        jetpack: 0,
        sneakers: 0,
        hoverboard: 0,
        doubleScore: 0,
        stumble: 0,
        hitCooldown: 0,
        guard: 0,
        boostsUsed: 0,
        nearMisses: 0,
        gameOver: false,
        objects: [],
        spawnClock: 0.42,
        shieldFlash: 0
      });
      return snapshot();
    }

    function snapshot() {
      return {
        ...state,
        objects: state.objects.map(item => ({ ...item })),
        multiplier: state.doubleScore > 0 ? 2 : 1
      };
    }

    function move(direction) {
      if (state.gameOver) return state.lane;
      state.lane = clamp(state.lane + Math.sign(direction), -1, 1);
      return state.lane;
    }

    function jump() {
      if (state.gameOver || state.jumpHeight > 0.05 || state.slideTime > 0) return false;
      state.jumpVelocity = state.sneakers > 0 ? 10.7 : 8.65;
      state.jumpTime = 0.001;
      return true;
    }

    function slide() {
      if (state.gameOver || state.slideTime > 0 || state.jumpHeight > 0.12 || state.jetpack > 0) return false;
      state.slideTime = 0.82;
      return true;
    }

    function collectCoin() {
      state.coins++;
      state.combo = Math.min(6, state.combo + 1);
      state.comboTimer = 2.1;
      const multiplier = state.doubleScore > 0 ? 2 : 1;
      state.score += 10 * state.combo * multiplier;
      return state.combo;
    }

    function collectPowerup(kind) {
      if (kind === "boost-magnet") state.magnet = Math.max(state.magnet, 11);
      else if (kind === "boost-jetpack") {
        state.jetpack = Math.max(state.jetpack, 7.2);
        state.jumpHeight = Math.max(state.jumpHeight, 2.35);
      } else if (kind === "boost-sneakers") state.sneakers = Math.max(state.sneakers, 10);
      else if (kind === "boost-hoverboard" || kind === "boost-shield") {
        state.hoverboard = Math.max(state.hoverboard, 9);
      } else if (kind === "boost-x2") state.doubleScore = Math.max(state.doubleScore, 12);
      state.boostsUsed++;
      return snapshot();
    }

    function hit(kind) {
      if (state.gameOver || state.hitCooldown > 0.08) return "grace";
      if (state.hoverboard > 0) {
        state.hoverboard = 0;
        state.shieldFlash = 0.8;
        state.hitCooldown = 1.0;
        return "board";
      }
      if (state.guard >= 0.36) {
        state.gameOver = true;
        return "caught";
      }
      state.guard = Math.max(state.guard, 0.48);
      state.stumble = 1.25;
      state.hitCooldown = 0.9;
      return "stumble";
    }

    function canClearCrate() {
      return state.jetpack > 0 || state.jumpHeight > 0.78;
    }
    function canClearBarrier() {
      return state.jetpack > 0 || state.jumpHeight > 0.62;
    }
    function canClearTrain() {
      return state.jetpack > 0 || state.jumpHeight > 1.82;
    }
    function canPassAwning() {
      return state.slideTime > 0.12;
    }

    function resolveWorld(dt) {
      const travel = state.speed * dt / 43;
      for (let i = state.objects.length - 1; i >= 0; i--) {
        const item = state.objects[i];
        item.depth += travel;

        if (item.kind === "coin" && !item.resolved) {
          const inPickupWindow = item.depth >= PLAYER_DEPTH - 0.035 &&
            item.depth <= PLAYER_DEPTH + 0.055;
          const magnetPull = state.magnet > 0 && item.depth > 0.53 &&
            item.depth < PLAYER_DEPTH + 0.07 && Math.abs(item.lane - state.lane) <= 1;
          const jetpackPull = state.jetpack > 0 && item.depth > 0.48 &&
            item.depth < PLAYER_DEPTH + 0.07;
          if ((inPickupWindow && item.lane === state.lane) || magnetPull || jetpackPull) {
            item.resolved = true;
            collectCoin();
          }
        } else if (item.kind.startsWith("boost-") && !item.resolved) {
          if (Math.abs(item.depth - PLAYER_DEPTH) < 0.04 && item.lane === state.lane) {
            item.resolved = true;
            collectPowerup(item.kind);
          }
        } else if (["train", "crate", "barrier", "awning"].includes(item.kind) && !item.resolved) {
          const collisionCrossing = item.depth >= PLAYER_DEPTH && item.depth <= PLAYER_DEPTH + 0.026;
          if (collisionCrossing) {
            item.resolved = true;
            if (item.lane === state.lane) {
              const safe = item.kind === "crate" ? canClearCrate()
                : item.kind === "barrier" ? canClearBarrier()
                : item.kind === "awning" ? canPassAwning()
                : canClearTrain();
              if (!safe) {
                const result = hit(item.kind);
                if (result === "stumble") state.score = Math.max(0, state.score - 20);
              }
            } else if (item.depth > PLAYER_DEPTH - 0.01) {
              state.nearMisses++;
              state.score += 15 * (state.doubleScore > 0 ? 2 : 1);
            }
          }
        }

        if (item.depth > MAX_DEPTH) state.objects.splice(i, 1);
      }
    }

    function update(deltaSeconds) {
      if (state.gameOver) return snapshot();
      const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
      state.elapsed += dt;

      const penalty = state.stumble > 0 ? 0.62 : 1;
      state.speed = Math.min(32, 13.5 + state.elapsed * 0.22) * penalty;
      state.distance += state.speed * dt;
      state.score += state.speed * dt * (state.doubleScore > 0 ? 2 : 1);
      state.roadScroll = (state.roadScroll + state.speed * dt / 26) % 1;
      state.visualLane += (state.lane - state.visualLane) * Math.min(1, dt * 14);

      if (state.jetpack > 0) {
        state.jumpHeight = 2.55 + Math.sin(state.elapsed * 7.5) * 0.12;
        state.jumpTime += dt;
      } else if (state.jumpHeight > 0 || state.jumpVelocity > 0) {
        state.jumpTime += dt;
        state.jumpHeight = Math.max(0, state.jumpHeight + state.jumpVelocity * dt);
        state.jumpVelocity -= 18.2 * dt;
        if (state.jumpHeight <= 0) {
          state.jumpHeight = 0;
          state.jumpVelocity = 0;
          state.jumpTime = 0;
        }
      }

      if (state.slideTime > 0) state.slideTime = Math.max(0, state.slideTime - dt);
      for (const key of ["magnet", "jetpack", "sneakers", "hoverboard", "doubleScore", "stumble", "hitCooldown", "shieldFlash"]) {
        if (state[key] > 0) state[key] = Math.max(0, state[key] - dt);
      }

      if (state.stumble > 0) state.guard = clamp(state.guard + dt * 0.09, 0, 1);
      else state.guard = Math.max(0, state.guard - dt * 0.16);

      if (state.comboTimer > 0) state.comboTimer = Math.max(0, state.comboTimer - dt);
      else state.combo = 0;

      state.spawnClock += dt;
      const spawnInterval = Math.max(0.52, 0.98 - state.elapsed * 0.0038);
      if (state.spawnClock >= spawnInterval) {
        state.spawnClock = 0;
        spawnPattern();
      }

      resolveWorld(dt);
      if (state.guard >= 0.995) state.gameOver = true;
      return snapshot();
    }

    reset();
    return Object.freeze({
      reset,
      snapshot,
      move,
      jump,
      slide,
      update,
      collectCoin,
      collectPowerup,
      hit,
      canClearCrate,
      canClearBarrier,
      canClearTrain,
      canPassAwning,
      magnetActive: () => state.magnet > 0,
      jetpackActive: () => state.jetpack > 0,
      hoverboardActive: () => state.hoverboard > 0
    });
  }

  window.ZaradRunnerCore = Object.freeze({ create });
})();