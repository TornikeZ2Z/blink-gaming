/* The games' background music, Charge's first (Tornike, 2026-10-27: "very low volume, not to overshadow the animation
   sounds, but there"), in a robot mix since 2026-10-28, and since the same day a tune of its own for every game ("they
   should be different ... they may have same okay but we need differences too", picked on the robot sound board).
   Soft lo-fi loops played live with Web Audio, so there is nothing to download. Every tune has the same band at the same
   quiet level: a warm pad and a round bass on a turn of four chords (two bars each), a soft bleep arpeggio walking the
   pad, and hollow robot bleeps drifting over it; in a round a soft kick and a tiny tick come in and the bleeps get
   busier as the round goes on. What each game has of its own: the key, tempo, swing, chords, bass line, arpeggio and
   beat, and for the night and space games an echo. A lost round sweeps it down into a muffle for a bar; it comes back
   with the next round. Every effect ducks it a little, so the game's own sounds always sit on top. shared/sound.js
   plays it.
   BrainerMusic(audioContext, destination, game) returns { start(), stop(), mood('idle' | 'round', fill 0..1), dip(),
   duck(), running }; game picks the tune (Charge's when it is missing). It also renders offline: pass an
   OfflineAudioContext and call pump(seconds) before rendering. */
(() => {
'use strict';
const CLEAR = 3800;   // the top of the mix's tone, which a lost round sweeps down
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
/* The tunes. chords: two bars each, with the bass note, the pad's voicing (the arpeggio walks it too) and the notes the
   bleeps pick from. bass(s16, firstBar): [semitones above the chord's bass, length in beats] on the sixteenths it plays.
   arp: which pad note on every arpEvery-th sixteenth, counted across the bars, so a three-note pattern rolls over them.
   lead: how busy the bleeps are. kick: loudness on the sixteenths it plays in a round (ghost: now and then on the
   tenth too); tick: the sixteenths of the tiny tick. pad: the pad's low-pass between rounds and at a round's start.
   echo: [delay in beats, feedback, how much] for the bleeps. ping: a sonar note every two bars. level: the mix,
   matched by ear and meter so every tune sits as quietly as Charge's. */
const TUNES = {
  'charge': { bpm: 84, swing: 0.14, seed: 7, pad: [1100, 1500], lead: 0.6, arp: [0, 2, 1, 3], arpEvery: 2, kick: { 0: 1, 8: 1 }, ghost: true, tick: [2, 6, 10, 14],
    bass: (s, first) => s === 0 ? [0, 1.9] : s === 8 ? [first ? 0 : 7, 1.9] : null,   // a walking root, the fifth in the second bar
    chords: [{ bass: 38, pad: [53, 57, 60, 64], keys: [62, 64, 65, 69, 72, 76] }, { bass: 43, pad: [53, 57, 59, 64], keys: [62, 64, 67, 69, 71, 74] },   // Dm9, G13
      { bass: 36, pad: [52, 55, 59, 62], keys: [60, 62, 64, 67, 71, 74] }, { bass: 45, pad: [55, 59, 60, 64], keys: [60, 64, 67, 69, 71, 72] }] },   // Cmaj9, Am9
  'multi-charge': { bpm: 92, swing: 0.04, seed: 11, level: 0.072, pad: [900, 1300], lead: 0.45, arp: [0, 2, 3], arpEvery: 2, kick: { 0: 1, 4: 0.8, 8: 1, 12: 0.8 }, tick: [2, 6, 10, 14], bassVol: 0.7,
    bass: s => s % 2 === 0 ? [s === 6 || s === 14 ? 12 : 0, 0.45] : null,   // the neon lab: a pulsing eighth-note bass, an octave up now and then
    chords: [{ bass: 45, pad: [60, 64, 67, 71], keys: [64, 67, 69, 71, 72, 76] }, { bass: 41, pad: [57, 60, 64, 71], keys: [60, 64, 65, 69, 71, 72] },   // Am9, Fmaj7#11
      { bass: 38, pad: [57, 60, 64, 65], keys: [62, 64, 65, 69, 72, 74] }, { bass: 40, pad: [57, 59, 62, 64], keys: [59, 62, 64, 69, 71, 74] }] },   // Dm9, E7sus4
  'plane-crash': { bpm: 100, swing: 0.2, seed: 3, level: 0.072, pad: [1300, 1700], lead: 0.75, arp: [0, 1, 2, 3], arpEvery: 2, kick: { 0: 1, 8: 1 }, tick: [4, 12],
    bass: (s, first) => s === 0 ? [0, 0.95] : s === 8 ? [7, 0.95] : s === 14 && !first ? [12, 0.4] : null,   // the meadow airfield: oom-pah, root, fifth and a pickup
    chords: [{ bass: 41, pad: [57, 60, 64, 67], keys: [65, 67, 69, 72, 74, 76] }, { bass: 45, pad: [55, 60, 64, 67], keys: [60, 64, 67, 69, 72, 76] },   // Fmaj9, Am7
      { bass: 46, pad: [57, 60, 62, 65], keys: [62, 65, 69, 70, 72, 74] }, { bass: 36, pad: [58, 62, 65, 67], keys: [65, 67, 70, 72, 74, 77] }] },   // Bbmaj9, C9sus4
  'fly-high': { bpm: 76, swing: 0.1, seed: 5, pad: [1000, 1400], lead: 0.5, arp: [3, 1, 2, 0], arpEvery: 2, kick: { 0: 1, 2: 0.6, 8: 1, 10: 0.6 }, tick: [6, 14], echo: [0.75, 0.3, 0.35],
    bass: (s, first) => s === 0 ? [0, first ? 3.6 : 2.6] : s === 12 && !first ? [7, 0.9] : null,   // the night sky: long notes, a pickup into the next chord, a heartbeat kick
    chords: [{ bass: 40, pad: [55, 59, 62, 66], keys: [62, 64, 66, 67, 71, 74] }, { bass: 36, pad: [55, 59, 64, 66], keys: [59, 62, 64, 66, 67, 71] },   // Em9, Cmaj7#11
      { bass: 45, pad: [55, 60, 62, 64], keys: [60, 62, 64, 67, 69, 72] }, { bass: 47, pad: [57, 62, 64, 66], keys: [62, 64, 66, 69, 71, 74] }] },   // Am11, Bm7(11)
  'space-crash': { bpm: 68, swing: 0, seed: 13, pad: [1200, 1500], lead: 0.4, arp: [0, 2, 3, 1], arpEvery: 4, kick: { 0: 1 }, tick: [8], echo: [1, 0.4, 0.45], ping: 82,
    bass: (s, first) => s === 0 ? [first ? 0 : 7, 3.8] : null,   // the nebula: one long bass note a bar, sparse bleeps with a long echo
    chords: [{ bass: 39, pad: [55, 58, 62, 69], keys: [62, 63, 65, 67, 69, 70] }, { bass: 36, pad: [51, 55, 58, 62], keys: [60, 62, 63, 67, 70, 74] },   // Ebmaj7#11, Cm9
      { bass: 44, pad: [55, 60, 63, 70], keys: [60, 63, 67, 68, 70, 72] }, { bass: 46, pad: [55, 60, 62, 65], keys: [60, 62, 65, 67, 70, 74] }] }   // Abmaj9, Bb6/9
};

window.BrainerMusic = (ac, dest, game) => {
  const T = TUNES[game] || TUNES.charge, Q = 60 / T.bpm, S16 = Q / 4, BAR = Q * 4, LEVEL = T.level || 0.055;   // LEVEL: the whole mix, well under the effects
  const out = ac.createGain(); out.gain.value = 0;
  const duckG = ac.createGain(); duckG.gain.value = 1;
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = CLEAR; tone.Q.value = 0.5;   // a lost round sweeps this down
  duckG.connect(tone).connect(out).connect(dest);
  const bus = duckG;
  let echo = null;
  if (T.echo) {   // a soft echo the bleeps feed, darker on every repeat
    const d = ac.createDelay(2), fb = ac.createGain(), lp = ac.createBiquadFilter(), wet = ac.createGain();
    d.delayTime.value = T.echo[0] * Q; fb.gain.value = T.echo[1]; lp.type = 'lowpass'; lp.frequency.value = 2200; wet.gain.value = T.echo[2];
    echo = ac.createGain(); echo.connect(d).connect(lp); lp.connect(fb).connect(d); lp.connect(wet).connect(bus);
  }
  let step = 0, next = 0, timer = 0, running = false, mood = 'idle', fill = 0, rnd = 1;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };   // the same bleep line every time it loops

  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function pad(notes, t, dur) {   // two soft triangles a few cents apart per note, through a gentle low-pass
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = mood === 'round' ? T.pad[1] + fill * 900 : T.pad[0]; f.connect(bus);
    for (const m of notes) for (const det of [-7, 7]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      env(g, t, 0.9, 0.022, dur - 1.2, 1.4); o.connect(g).connect(f); o.start(t); o.stop(t + dur + 0.6);
    }
  }
  function bass(m, t, dur) {
    const o = ac.createOscillator(), s = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'triangle'; s.type = 'sine'; o.frequency.value = hz(m); s.frequency.value = hz(m - 12); f.type = 'lowpass'; f.frequency.value = 380;
    env(g, t, 0.03, 0.15 * (T.bassVol || 1), dur * 0.55, dur * 0.4); o.connect(f); s.connect(f); f.connect(g).connect(bus);
    for (const x of [o, s]) { x.start(t); x.stop(t + dur + 0.1); }
  }
  function bleep(m, t, v) {   // the robot's voice: a hollow two-sine note (the third harmonic) that drops into pitch
    const f = hz(m), o = ac.createOscillator(), o3 = ac.createOscillator(), g = ac.createGain(), g3 = ac.createGain();
    o.type = 'sine'; o3.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.015); o3.frequency.value = f * 3; g3.gain.value = 0.25;
    env(g, t, 0.004, 0.04 * v, 0.06, 0.3); o.connect(g); o3.connect(g3).connect(g); g.connect(bus); if (echo) g.connect(echo);
    for (const x of [o, o3]) { x.start(t); x.stop(t + 0.45); }
  }
  function tick(t) {   // a tiny high tick in a round
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 2100;
    env(g, t, 0.002, 0.01, 0.004, 0.03); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.05);
  }
  function kick(t, v) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.004, 0.12 * v, 0.02, 0.22); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3);
  }
  function ping(t) {   // a sonar ping into the echo: space's own
    const f = hz(T.ping), o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    env(g, t, 0.005, 0.03, 0.01, 1.0); o.connect(g); g.connect(bus); if (echo) g.connect(echo); o.start(t); o.stop(t + 1.2);
  }
  function schedule(i, t) {   // one sixteenth: i counts from the start of the 8-bar loop
    const bar = Math.floor(i / 16) % 8, s16 = i % 16, ch = T.chords[Math.floor(bar / 2)], first = bar % 2 === 0;
    if (s16 === 0 && first) { if (bar === 0) rnd = T.seed; pad(ch.pad, t, BAR * 2); }
    const b = T.bass(s16, first); if (b) bass(ch.bass + b[0], t, Q * b[1]);
    const busy = mood === 'round' ? 0.2 + fill * 0.3 : 0.12, r = rand(), r2 = rand();
    if (s16 % 2 === 0 && r < busy * T.lead) bleep(ch.keys[Math.floor(r2 * ch.keys.length)] + 12, t, 0.7 + 0.3 * r2);
    if (i % T.arpEvery === 0) bleep(ch.pad[T.arp[Math.floor(i / T.arpEvery) % T.arp.length]] + 12, t, 0.6);   // the arpeggio
    if (T.ping && s16 === 0 && !first) ping(t);
    if (mood === 'round') {
      if (T.tick.includes(s16)) tick(t);
      const k = T.kick[s16] || (T.ghost && s16 === 10 && r2 < 0.35 ? 1 : 0); if (k) kick(t, k);
    }
  }
  function pump(until) {   // schedules every sixteenth up to `until` (the audio clock), with the tune's swing
    while (next < until) {
      schedule(step, next + (step % 2 ? S16 * T.swing : 0));
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
