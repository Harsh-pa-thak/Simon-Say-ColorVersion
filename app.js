/* ==========================================================================
   Simon — memory console
   Watch the order, repeat it back. The sequence grows by one pad each round.
   ========================================================================== */

(() => {
  "use strict";

  const COLORS = [
    { id: "red", name: "red", freq: 329.63, spill: "rgba(255, 94, 70, 0.17)" },
    { id: "yellow", name: "yellow", freq: 415.3, spill: "rgba(255, 191, 60, 0.15)" },
    { id: "blue", name: "blue", freq: 493.88, spill: "rgba(84, 156, 255, 0.16)" },
    { id: "green", name: "green", freq: 659.25, spill: "rgba(63, 224, 143, 0.14)" },
  ];

  const COLOR_BY_ID = new Map(COLORS.map((c) => [c.id, c]));
  const BEST_KEY = "simonHighScore";

  const SEGMENTS = {
    0: "abcdef",
    1: "bc",
    2: "abdeg",
    3: "abcdg",
    4: "bcfg",
    5: "acdfg",
    6: "acdefg",
    7: "abc",
    8: "abcdefg",
    9: "abcdfg",
  };
  const SEG_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

  const els = {
    console: document.getElementById("console"),
    level: document.getElementById("levelReadout"),
    best: document.getElementById("bestReadout"),
    pips: document.getElementById("pips"),
    status: document.getElementById("status"),
    start: document.getElementById("startBtn"),
    sound: document.getElementById("soundToggle"),
    soundText: document.querySelector(".toggle__text"),
    spill: document.querySelector(".room__spill"),
  };

  const padEls = new Map(
    [...document.querySelectorAll(".pad")].map((el) => [el.dataset.color, el])
  );

  const state = {
    seq: [],
    step: 0,
    level: 0,
    phase: "idle", // idle | showing | input | between | over
    sound: true,
    best: readBest(),
    run: 0,
    timers: new Set(),
  };

  /* ---------- small utilities ------------------------------------------- */

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
  const pad2 = (n) => String(Math.max(0, Math.min(99, n))).padStart(2, "0");
  const pad3 = (n) => String(Math.max(0, Math.min(999, n))).padStart(3, "0");

  function after(fn, ms) {
    const id = setTimeout(() => {
      state.timers.delete(id);
      fn();
    }, ms);
    state.timers.add(id);
    return id;
  }

  function clearTimers() {
    state.timers.forEach((id) => clearTimeout(id));
    state.timers.clear();
  }

  function readBest() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0);
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch {
      /* storage can be unavailable in private or embedded contexts */
    }
  }

  /* ---------- audio ------------------------------------------------------ */

  let audioCtx = null;

  function getAudio() {
    if (!state.sound) return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, duration = 260, options = {}) {
    const ctx = getAudio();
    if (!ctx) return;

    const { gain = 0.13, type = "triangle", detune = 0 } = options;
    const now = ctx.currentTime;
    const secs = Math.max(0.06, duration / 1000);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + secs);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3400, now);
    filter.Q.value = 0.6;

    const voices = [
      { type, mult: 1, level: 1 },
      { type: "square", mult: 2, level: 0.16 },
    ];

    voices.forEach((voice) => {
      const osc = ctx.createOscillator();
      const voiceGain = ctx.createGain();
      osc.type = voice.type;
      osc.frequency.setValueAtTime(freq * voice.mult, now);
      osc.detune.setValueAtTime(detune, now);
      voiceGain.gain.value = voice.level;
      osc.connect(voiceGain).connect(master);
      osc.start(now);
      osc.stop(now + secs + 0.05);
    });

    master.connect(filter).connect(ctx.destination);
  }

  function chime() {
    tone(523.25, 200, { gain: 0.075, type: "triangle" });
    after(() => tone(783.99, 260, { gain: 0.06, type: "triangle" }), 90);
  }

  function buzz() {
    const ctx = getAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const secs = 0.46;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.014);
    master.gain.exponentialRampToValueAtTime(0.0001, now + secs);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, now);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(126, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + secs);

    osc.connect(master).connect(filter).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + secs + 0.05);
  }

  /* ---------- lighting --------------------------------------------------- */

  const glowTimers = new Map();

  function ambient(colorId) {
    const color = colorId ? COLOR_BY_ID.get(colorId) : null;
    if (color) {
      els.spill.style.background = `radial-gradient(circle, ${color.spill} 0%, transparent 62%)`;
      els.spill.style.opacity = "1";
      return;
    }
    els.spill.style.opacity = "0";
  }

  function flash(id, options = {}) {
    const el = padEls.get(id);
    if (!el) return;

    const { sound = true, duration = 260, ghost = false } = options;
    const color = COLOR_BY_ID.get(id);

    if (glowTimers.has(id)) clearTimeout(glowTimers.get(id));
    el.classList.remove("is-lit", "is-ghost");
    el.classList.add(ghost ? "is-ghost" : "is-lit");

    if (!ghost) ambient(id);
    if (sound) tone(color.freq, duration);

    glowTimers.set(
      id,
      setTimeout(() => {
        el.classList.remove("is-lit", "is-ghost");
        if (!document.querySelector(".pad.is-lit")) ambient(null);
        glowTimers.delete(id);
      }, duration)
    );
  }

  /* ---------- display ---------------------------------------------------- */

  function drawDigits(host, value) {
    host.textContent = "";
    for (const char of value) {
      const digit = document.createElement("span");
      digit.className = "digit";
      const on = SEGMENTS[char] || "";
      SEG_NAMES.forEach((name) => {
        const seg = document.createElement("span");
        seg.className = `seg seg--${name}${on.includes(name) ? " is-on" : ""}`;
        digit.appendChild(seg);
      });
      host.appendChild(digit);
    }
  }

  function drawPips() {
    const total = Math.min(state.seq.length, 10);
    const filled = Math.min(state.step, total);
    els.pips.textContent = "";

    for (let i = 0; i < total; i += 1) {
      const pip = document.createElement("span");
      pip.className = i < filled ? "pip is-hit" : "pip";
      els.pips.appendChild(pip);
    }
    els.pips.classList.toggle("is-empty", total === 0);
  }

  function render() {
    drawDigits(els.level, pad2(state.level));
    drawDigits(els.best, pad3(state.best));
    drawPips();
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function setPhase(phase) {
    state.phase = phase;
    els.console.dataset.phase = phase;
    els.start.setAttribute(
      "aria-label",
      phase === "idle" || phase === "over" ? "Start game" : "Restart game"
    );
  }

  /* ---------- attract mode ----------------------------------------------- */

  let attractTimer = null;

  function startAttract() {
    stopAttract();
    attractTimer = window.setInterval(() => {
      if (state.phase !== "idle" || document.hidden) return;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      flash(color.id, { sound: false, duration: 300, ghost: true });
    }, 2600);
  }

  function stopAttract() {
    if (attractTimer) window.clearInterval(attractTimer);
    attractTimer = null;
  }

  /* ---------- game flow -------------------------------------------------- */

  function startGame() {
    clearTimers();
    stopAttract();
    state.run += 1;

    state.seq = [];
    state.step = 0;
    state.level = 0;
    setPhase("showing");
    render();
    setStatus("Watch the order.");
    els.console.classList.remove("is-shaking");

    // one coordinated power-up sweep, silent
    COLORS.forEach((color, i) => {
      after(() => flash(color.id, { sound: false, duration: 150 }), i * 75);
    });

    const run = state.run;
    after(() => {
      if (run === state.run) nextRound();
    }, 700);
  }

  async function nextRound() {
    const run = state.run;
    state.level += 1;
    state.step = 0;
    state.seq.push(COLORS[Math.floor(Math.random() * COLORS.length)].id);
    render();
    await playSequence(run);
  }

  async function playSequence(run) {
    setPhase("showing");
    setStatus("Watch the order.");
    drawPips();

    await wait(Math.max(380, 640 - state.level * 20));
    if (run !== state.run) return;

    const gap = Math.max(220, 560 - state.level * 26);
    const lit = Math.max(120, Math.round(gap * 0.62));

    for (const id of state.seq) {
      if (run !== state.run) return;
      flash(id, { duration: lit });
      await wait(gap);
    }

    if (run !== state.run) return;
    await wait(140);
    if (run !== state.run) return;

    setPhase("input");
    setStatus("Your turn.");
  }

  function pressPad(id) {
    if (state.phase === "idle" || state.phase === "over") {
      startGame();
      return;
    }
    if (state.phase !== "input") return;

    const expected = state.seq[state.step];
    flash(id, { duration: 210 });

    if (id !== expected) {
      fail(id, expected);
      return;
    }

    state.step += 1;
    drawPips();

    if (state.step === state.seq.length) {
      setPhase("between");
      setStatus("Clean. Next round.");
      chime();

      const run = state.run;
      after(() => {
        if (run === state.run) nextRound();
      }, 680);
    }
  }

  function fail(pressedId, expectedId) {
    setPhase("over");
    buzz();

    const consoleEl = els.console;
    consoleEl.classList.remove("is-shaking");
    void consoleEl.offsetWidth;
    consoleEl.classList.add("is-shaking");

    const isNewBest = state.level > state.best;
    if (isNewBest) {
      state.best = state.level;
      saveBest(state.best);
    }
    render();

    // show the pad that was needed
    const run = state.run;
    after(() => flash(expectedId, { duration: 620, sound: false }), 480);

    if (isNewBest) {
      setStatus(`New best: ${state.level}. Press start to go again.`);
    } else {
      const bestLine = state.best > 0 ? ` Best is ${state.best}.` : "";
      setStatus(`${cap(expectedId)} came next, not ${pressedId}.${bestLine} Press start to go again.`);
    }

    after(() => {
      if (run !== state.run) return;
      setPhase("idle");
      startAttract();
    }, 3200);
  }

  /* ---------- input wiring ----------------------------------------------- */

  padEls.forEach((el, id) => {
    el.addEventListener("click", () => pressPad(id));
  });

  els.start.addEventListener("click", startGame);

  els.sound.addEventListener("click", () => {
    state.sound = !state.sound;
    els.sound.setAttribute("aria-pressed", String(state.sound));
    els.soundText.textContent = state.sound ? "sound on" : "sound off";
    if (state.sound) tone(523.25, 130, { gain: 0.07 });
  });

  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

    const onButton = event.target instanceof Element && event.target.closest("button");

    if (event.key === " " || event.key === "Enter") {
      if (onButton) return; // let the focused control handle it
      event.preventDefault();
      startGame();
      return;
    }

    const index = "1234".indexOf(event.key);
    if (index >= 0) {
      event.preventDefault();
      pressPad(COLORS[index].id);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAttract();
    else if (state.phase === "idle") startAttract();
  });

  /* ---------- boot -------------------------------------------------------- */

  render();
  setPhase("idle");
  startAttract();
})();
