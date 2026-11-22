(() => {
  "use strict";

  // Gameplay systems adapted for Zarad from the MIT-licensed
  // RohanChacko/Subway-Surfers WebGL project (2019).
  // Adapted systems: three-lane movement, jump physics, boost timers,
  // obstacle setbacks and a pursuing guard. Art, controls and scoring
  // are re-authored for Zarad's spice-market setting.

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function create() {
    const state = {};
    function reset() {
      Object.assign(state, {
        lane: 0, visualLane: 0,
        elapsed: 0, speed: .54, speedPenalty: 1,
        jumpTime: 0, jumpHeight: 0, jumpDuration: .78, jumpMax: 1.28,
        slideTime: 0,
        liftTimer: 0, magnetTimer: 0, shieldTimer: 0,
        setbackTimer: 0, chaser: .12, gameOver: false,
        combo: 0, comboTimer: 0, points: 0, collected: 0
      });
      return snapshot();
    }
    function snapshot() { return { ...state }; }

    function move(direction) {
      state.lane = clamp(state.lane + Math.sign(direction), -1, 1);
      return state.lane;
    }
    function jump() {
      if (state.gameOver || state.jumpTime > 0 || state.slideTime > 0) return false;
      state.jumpTime = .0001;
      return true;
    }
    function slide() {
      if (state.gameOver || state.slideTime > 0 || state.jumpTime > 0) return false;
      state.slideTime = .68;
      return true;
    }
    function collectSpice() {
      state.comboTimer = 2.1;
      state.combo = Math.min(5, state.combo + 1);
      state.collected++;
      state.points += 10 * Math.max(1, state.combo);
      return state.combo;
    }
    function collectPowerup(kind) {
      if (kind === "boost-jump") state.liftTimer = 7.5;
      else if (kind === "boost-magnet") state.magnetTimer = 8;
      else if (kind === "boost-shield") state.shieldTimer = 9;
      return snapshot();
    }

    // Low barriers cause a slowdown and allow the guard to close the gap,
    // matching the source project's barrier setback / police pursuit loop.
    function hitBarrier() {
      if (state.shieldTimer > 0) {
        state.shieldTimer = 0;
        return "shield";
      }
      if (state.setbackTimer > .1) {
        state.gameOver = true;
        return "caught";
      }
      state.setbackTimer = 3.8;
      state.speedPenalty = .67;
      state.chaser = clamp(state.chaser + .43, 0, 1);
      return "setback";
    }

    function update(dt) {
      const step = clamp(dt || 0, 0, .05);
      state.elapsed += step;
      const targetSpeed = .54 + Math.min(.32, state.elapsed * .0028);
      if (state.setbackTimer > 0) {
        state.setbackTimer = Math.max(0, state.setbackTimer - step);
        state.chaser = clamp(state.chaser + step * .075, 0, 1);
        if (state.setbackTimer === 0) state.speedPenalty = 1;
      } else {
        state.chaser = Math.max(.10, state.chaser - step * .035);
      }
      state.speed = targetSpeed * state.speedPenalty;

      state.visualLane += (state.lane - state.visualLane) * Math.min(1, step * 13);
      if (state.jumpTime > 0) {
        state.jumpTime += step;
        const t = clamp(state.jumpTime / state.jumpDuration, 0, 1);
        state.jumpHeight = Math.sin(t * Math.PI) * state.jumpMax * (state.liftTimer > 0 ? 1.32 : 1);
        if (t >= 1) { state.jumpTime = 0; state.jumpHeight = 0; }
      }
      if (state.slideTime > 0) state.slideTime = Math.max(0, state.slideTime - step);
      if (state.liftTimer > 0) state.liftTimer = Math.max(0, state.liftTimer - step);
      if (state.magnetTimer > 0) state.magnetTimer = Math.max(0, state.magnetTimer - step);
      if (state.shieldTimer > 0) state.shieldTimer = Math.max(0, state.shieldTimer - step);
      if (state.comboTimer > 0) state.comboTimer = Math.max(0, state.comboTimer - step);
      else state.combo = 0;
      if (state.chaser >= .985) state.gameOver = true;
      return snapshot();
    }

    return {
      reset, snapshot, move, jump, slide, update,
      collectSpice, collectPowerup, hitBarrier,
      canClearCrate: () => state.jumpHeight > .55,
      canClearTrain: () => state.jumpHeight > 1.02,
      canPassAwning: () => state.slideTime > .12,
      isMagnetActive: () => state.magnetTimer > 0,
      isShieldActive: () => state.shieldTimer > 0
    };
  }

  window.ZaradRunnerCore = Object.freeze({ create });
})();
