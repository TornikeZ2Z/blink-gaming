/* Charge's background music (Tornike, 2026-10-27: "very low volume, not to overshadow the animation sounds, but there").
   A soft lo-fi loop played live with Web Audio, so there is nothing to download: a warm pad and a round bass on a slow
   jazzy turn (Dm9, G13, Cmaj9, Am9, two bars each, 84 bpm), with soft electric-piano notes drifting over it. Between
   rounds it is just that; in a round a gentle kick, a shaker and a rim come in, and the piano gets busier as the battery
   fills. An overcharge sweeps it down into a muffle for a bar and the beat drops out; it comes back with the next round.
   Every effect ducks it a little, so the game's own sounds always sit on top.
   BrainerMusic(audioContext, destination) returns { start(), stop(), mood('idle' | 'round', fill 0..1), dip(), duck(),
   running }. It also renders offline: pass an OfflineAudioContext and call pump(seconds) before rendering. */
(() => {
'use strict';
const BPM = 84, Q = 60 / BPM, S16 = Q / 4, BAR = Q * 4, SWING = 0.14;
const LEVEL = 0.1;   // the whole mix, some 11 dB under the effects; game.js lifts both together by 12 dB through its master level
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
// two bars each; the pad's voicing, the bass note, and the notes the piano picks from
const CHORDS = [
  { bass: 38, pad: [53, 57, 60, 64], keys: [62, 64, 65, 69, 72, 76] },   // Dm9
  { bass: 43, pad: [53, 57, 59, 64], keys: [62, 64, 67, 69, 71, 74] },   // G13
  { bass: 36, pad: [52, 55, 59, 62], keys: [60, 62, 64, 67, 71, 74] },   // Cmaj9
  { bass: 45, pad: [55, 59, 60, 64], keys: [60, 64, 67, 69, 71, 72] }    // Am9
];

window.BrainerMusic = (ac, dest) => {
  const out = ac.createGain(); out.gain.value = 0;
  const duckG = ac.createGain(); duckG.gain.value = 1;
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = 0.5;   // the overcharge sweeps this down
  duckG.connect(tone).connect(out).connect(dest);
  const bus = duckG;
  const noiseBuf = (() => { const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
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
  function keys(m, t, v) {   // a soft electric piano: a sine whose bell-like overtone fades quickly
    const c = ac.createOscillator(), mo = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
    c.type = 'sine'; mo.type = 'sine'; c.frequency.value = hz(m); mo.frequency.value = hz(m) * 2;
    mg.gain.setValueAtTime(hz(m) * 0.9, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.5); mo.connect(mg).connect(c.frequency);
    env(g, t, 0.006, 0.05 * v, 0.02, 1.3); c.connect(g).connect(bus);
    for (const x of [c, mo]) { x.start(t); x.stop(t + 1.5); }
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.004, 0.2, 0.02, 0.22); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3);
  }
  function noise(t, freq, type, q, peak, dec) {   // the shaker and the rim
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 1; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.003, peak, 0.004, dec); s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
  }
  function schedule(i, t) {   // one sixteenth: i counts from the start of the 8-bar loop
    const bar = Math.floor(i / 16) % 8, s16 = i % 16, ch = CHORDS[Math.floor(bar / 2)], first = bar % 2 === 0;
    if (s16 === 0 && first) { if (bar === 0) rnd = 7; pad(ch.pad, t, BAR * 2); }
    if (s16 === 0 || s16 === 8) bass(s16 === 0 && first ? ch.bass : ch.bass + (s16 === 8 && !first ? 7 : 0), t, Q * 1.9);
    const busy = mood === 'round' ? 0.3 + fill * 0.45 : 0.16, r = rand(), r2 = rand();
    if (s16 % 2 === 0 && r < busy) keys(ch.keys[Math.floor(r2 * ch.keys.length)], t, 0.7 + 0.3 * r2);
    if (mood === 'round') {
      if (s16 === 0 || s16 === 8 || (s16 === 10 && r2 < 0.35)) kick(t);
      if (s16 % 4 === 2) noise(t, 7500, 'highpass', 0.7, 0.03, 0.05);
      if (s16 === 4 || s16 === 12) noise(t, 1900, 'bandpass', 1.4, 0.05, 0.07);
    }
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
    dip() {   // an overcharge: muffled for a bar, then clear again
      const t = ac.currentTime; mood = 'idle';
      tone.frequency.cancelScheduledValues(t); tone.frequency.setValueAtTime(tone.frequency.value, t);
      tone.frequency.exponentialRampToValueAtTime(260, t + 0.6); tone.frequency.setValueAtTime(260, t + BAR); tone.frequency.exponentialRampToValueAtTime(5200, t + BAR * 2.5);
    },
    duck() {   // an effect is playing: step aside a little
      const t = ac.currentTime; duckG.gain.cancelScheduledValues(t); duckG.gain.setValueAtTime(duckG.gain.value, t);
      duckG.gain.linearRampToValueAtTime(0.5, t + 0.05); duckG.gain.setValueAtTime(0.5, t + 0.35); duckG.gain.linearRampToValueAtTime(1, t + 1.1);
    }
  };
};
})();
