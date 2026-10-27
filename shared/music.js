/* The games' background music, Charge's first and now every game's (Tornike, 2026-10-27: "very low volume, not to
   overshadow the animation sounds, but there"; then "we need this background sound for all games"), in its robot mix
   since 2026-10-28. A soft lo-fi loop played live with Web Audio, so there is nothing to download: a warm pad and a
   round bass on a slow jazzy turn (Dm9, G13, Cmaj9, Am9, two bars each, 84 bpm), a soft bleep arpeggio in eighths, and
   hollow robot bleeps drifting over it. Between rounds it is just that; in a round a soft kick and a tiny tick come in
   and the bleeps get busier as the round goes on. A lost round sweeps it down into a muffle for a bar; it comes back
   with the next round.
   Every effect ducks it a little, so the game's own sounds always sit on top. shared/sound.js plays it.
   BrainerMusic(audioContext, destination) returns { start(), stop(), mood('idle' | 'round', fill 0..1), dip(), duck(),
   running }. It also renders offline: pass an OfflineAudioContext and call pump(seconds) before rendering. */
(() => {
'use strict';
const BPM = 84, Q = 60 / BPM, S16 = Q / 4, BAR = Q * 4, SWING = 0.14;
const LEVEL = 0.055, CLEAR = 3800;   // the whole mix, well under the effects; CLEAR: the top of its tone, which a lost round sweeps down
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
// two bars each; the pad's voicing (the arpeggio walks it too), the bass note, and the notes the bleeps pick from
const CHORDS = [
  { bass: 38, pad: [53, 57, 60, 64], keys: [62, 64, 65, 69, 72, 76] },   // Dm9
  { bass: 43, pad: [53, 57, 59, 64], keys: [62, 64, 67, 69, 71, 74] },   // G13
  { bass: 36, pad: [52, 55, 59, 62], keys: [60, 62, 64, 67, 71, 74] },   // Cmaj9
  { bass: 45, pad: [55, 59, 60, 64], keys: [60, 64, 67, 69, 71, 72] }    // Am9
];

window.BrainerMusic = (ac, dest) => {
  const out = ac.createGain(); out.gain.value = 0;
  const duckG = ac.createGain(); duckG.gain.value = 1;
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = CLEAR; tone.Q.value = 0.5;   // a lost round sweeps this down
  duckG.connect(tone).connect(out).connect(dest);
  const bus = duckG;
  let step = 0, next = 0, timer = 0, running = false, mood = 'idle', fill = 0, rnd = 1;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };   // the same piano line every time it loops

  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function pad(notes, t, dur) {   // two soft triangles a few cents apart per note, through a gentle low-pass
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = mood === 'round' ? 1500 + fill * 900 : 1100; f.connect(bus);
    for (const m of notes) for (const det of [-7, 7]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      env(g, t, 0.9, 0.022, dur - 1.2, 1.4); o.connect(g).connect(f); o.start(t); o.stop(t + dur + 0.6);
    }
  }
  function bass(m, t, dur) {
    const o = ac.createOscillator(), s = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'triangle'; s.type = 'sine'; o.frequency.value = hz(m); s.frequency.value = hz(m - 12); f.type = 'lowpass'; f.frequency.value = 380;
    env(g, t, 0.03, 0.15, dur * 0.55, dur * 0.4); o.connect(f); s.connect(f); f.connect(g).connect(bus);
    for (const x of [o, s]) { x.start(t); x.stop(t + dur + 0.1); }
  }
  function bleep(m, t, v) {   // the robot's voice: a hollow two-sine note (the third harmonic) that drops into pitch
    const f = hz(m), o = ac.createOscillator(), o3 = ac.createOscillator(), g = ac.createGain(), g3 = ac.createGain();
    o.type = 'sine'; o3.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.015); o3.frequency.value = f * 3; g3.gain.value = 0.25;
    env(g, t, 0.004, 0.04 * v, 0.06, 0.3); o.connect(g); o3.connect(g3).connect(g); g.connect(bus);
    for (const x of [o, o3]) { x.start(t); x.stop(t + 0.45); }
  }
  function tick(t) {   // a tiny high tick on the off-beats of a round
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 2100;
    env(g, t, 0.002, 0.01, 0.004, 0.03); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.05);
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.004, 0.12, 0.02, 0.22); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3);
  }
  function schedule(i, t) {   // one sixteenth: i counts from the start of the 8-bar loop
    const bar = Math.floor(i / 16) % 8, s16 = i % 16, ch = CHORDS[Math.floor(bar / 2)], first = bar % 2 === 0;
    if (s16 === 0 && first) { if (bar === 0) rnd = 7; pad(ch.pad, t, BAR * 2); }
    if (s16 === 0 || s16 === 8) bass(s16 === 0 && first ? ch.bass : ch.bass + (s16 === 8 && !first ? 7 : 0), t, Q * 1.9);
    const busy = mood === 'round' ? 0.2 + fill * 0.3 : 0.12, r = rand(), r2 = rand();
    if (s16 % 2 === 0 && r < busy * 0.6) bleep(ch.keys[Math.floor(r2 * ch.keys.length)] + 12, t, 0.7 + 0.3 * r2);
    if (s16 % 2 === 0) bleep(ch.pad[[0, 2, 1, 3][(s16 / 2) % 4]] + 12, t, 0.6);   // the arpeggio, in eighths
    if (mood === 'round' && s16 % 4 === 2) tick(t);
    if (mood === 'round' && (s16 === 0 || s16 === 8 || (s16 === 10 && r2 < 0.35))) kick(t);
  }
  function pump(until) {   // schedules every sixteenth up to `until` (the audio clock), with a lazy swing
    while (next < until) {
      schedule(step, next + (step % 2 ? S16 * SWING : 0));
      next += S16; step++;
    }
  }
  return {
    get running() { return running; },
    pump,
    start() {
      if (running) return;
      running = true; const t = ac.currentTime;
      if (!next || next < t) { next = t + 0.08; step = 0; }
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t); out.gain.linearRampToValueAtTime(LEVEL, t + 2.5);   // fades in
      if (typeof ac.startRendering !== 'function') { pump(t + 0.25); timer = setInterval(() => pump(ac.currentTime + 0.25), 50); }   // live; an offline context is pumped by its caller
      else out.gain.setValueAtTime(LEVEL, 0);
    },
    stop() {
      if (!running) return;
      running = false; clearInterval(timer); const t = ac.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      next = 0;
    },
    mood(m, f = 0) { mood = m; fill = Math.max(0, Math.min(1, f)); },
    dip() {   // a lost round: muffled for a bar, then clear again
      const t = ac.currentTime; mood = 'idle';
      tone.frequency.cancelScheduledValues(t); tone.frequency.setValueAtTime(tone.frequency.value, t);
      tone.frequency.exponentialRampToValueAtTime(260, t + 0.6); tone.frequency.setValueAtTime(260, t + BAR); tone.frequency.exponentialRampToValueAtTime(CLEAR, t + BAR * 2.5);
    },
    duck() {   // an effect is playing: step aside a little
      const t = ac.currentTime; duckG.gain.cancelScheduledValues(t); duckG.gain.setValueAtTime(duckG.gain.value, t);
      duckG.gain.linearRampToValueAtTime(0.5, t + 0.05); duckG.gain.setValueAtTime(0.5, t + 0.35); duckG.gain.linearRampToValueAtTime(1, t + 1.1);
    }
  };
};
})();
