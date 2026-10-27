/* Brainer's game sounds: the calm set every game plays (Tornike, 2026-10-27, after the sound board: "only calmer sounds
   for now", and the background music in all games). Everything is made live with Web Audio, so there is nothing to
   download. The voices are soft on purpose: sines and triangles only (no sawtooth or square), noise only band-passed
   and below about 2 kHz, one sound per action rather than a stack, and a gentle master. Wins ring as warm bells, and
   a safe step rings one note higher than the last.
   BrainerSound(store, recipes) returns { on, toggle(), wake(), hide(hidden), mood('idle' | 'round', fill), dip(), and
   each of the game's own sounds }. recipes(v) gets the voices v = { soft, pluck, bell, whoosh, thud, step(n) } and returns
   the game's sounds by name. When ../shared/music.js is loaded too, its music plays under it all from the first tap,
   and every sound ducks it a little. */
(() => {
'use strict';
const STEP = [523, 587, 659, 784, 880, 1047, 1175, 1319];   // C major pentatonic, C5 up to E6: the climbing safe steps

window.BrainerSound = (store, recipes) => {
  let ac = null, out = null, on = store.get('brainer.sound', 'on') !== 'off', music = null, mood = ['idle', 0];
  const ctxA = () => {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A();
      // the master: a little lift, the very top rolled off, a soft compressor (the loud set used +12 dB and a hard limiter)
      out = ac.createGain(); out.gain.value = 1.4;
      const top = ac.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 6500; top.Q.value = 0.5;
      const comp = ac.createDynamicsCompressor(); Object.entries({ threshold: -20, knee: 12, ratio: 3, attack: 0.01, release: 0.3 }).forEach(([k, v]) => { comp[k].value = v; });
      out.connect(top).connect(comp).connect(ac.destination);
      if (window.BrainerMusic) { music = window.BrainerMusic(ac, out); music.mood(...mood); }
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume();
    if (on && music && !music.running && !document.hidden) music.start();
    return ac;
  };
  const at = delay => ac.currentTime + (delay || 0);
  const duck = delay => { if (music && !delay) music.duck(); };
  const osc = (type, f, t, stopAt) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stopAt); return o; };
  const v = {
    soft(f0, f1, dur, vol, delay, type) {   // a tone that swells in (up to 0.12 s) and fades; f1 glides it there
      const t = at(delay), o = osc(type || 'sine', f0, t, t + dur + 0.05), g = ac.createGain();
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.12, dur * 0.25)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); duck(delay);
    },
    pluck(f, vol, delay) {   // a soft wooden tap, like a marimba: the note and a faint, quick overtone two octaves up
      const t = at(delay);
      for (const [k, a, d] of [[1, 1, 0.42], [4, 0.18, 0.1]]) {
        const o = osc('sine', f * k, t, t + d + 0.05), g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(out);
      }
      duck(delay);
    },
    bell(f, vol, delay) {   // a warm bell: a sine whose bright overtone (FM at 3.5×) fades over half a second
      const t = at(delay), c = osc('sine', f, t, t + 1.3), m = osc('sine', f * 3.5, t, t + 1.3), mg = ac.createGain(), g = ac.createGain();
      mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.6); m.connect(mg).connect(c.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      c.connect(g).connect(out); duck(delay);
    },
    whoosh(dur, vol, f0, f1, delay) {   // band-passed air that swells and fades, its pitch sweeping f0 to f1
      const t = at(delay), len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
    },
    thud(vol, delay) {   // a low, soft thump
      v.soft(120, 50, 0.35, vol, delay);
      const t = at(delay), len = Math.floor(ac.sampleRate * 0.25), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(320, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.25);
      g.gain.setValueAtTime(vol * 0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.3);
    },
    step: n => STEP[Math.max(0, Math.min(STEP.length - 1, n || 0))]
  };
  const api = {
    get on() { return on; },
    toggle() { on = !on; store.set('brainer.sound', on ? 'on' : 'off'); if (on) ctxA(); else if (music) music.stop(); return on; },
    wake() { if (on) ctxA(); },   // browsers let a page make sound only after a tap or a key: the music starts on the first one
    hide(hidden) { if (!ac) return; if (hidden) { if (music) music.stop(); ac.suspend(); } else if (on) ctxA(); },   // quiet while the tab is away
    mood(m, f = 0) { mood = [m, f]; if (music) music.mood(m, f); },   // the music: 'idle' between rounds, 'round' with how far it has got
    dip() { mood = ['idle', 0]; if (music) music.dip(); }   // a lost round: the music muffles for a bar
  };
  const own = recipes(v);
  for (const k of Object.keys(own)) api[k] = (...a) => { if (on && ctxA()) own[k](...a); };
  document.addEventListener('visibilitychange', () => api.hide(document.hidden));
  return api;
};
})();
