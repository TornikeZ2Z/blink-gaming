(() => {
'use strict';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const cents = v => Math.round(v * 100) / 100;   // the balance stays in whole cents, so it matches every amount shown

/* ---------- config & math ---------- */
// Aviator's rules with the Iron Brainer (Tornike, 2026-10-26): rounds run on their own, a betting window, take-off on
// hand and foot jets, and the multiplier climbs until the Brainer flies away at a point fixed before take-off. A bet
// cashed out at x pays x, so with the fly-away point 0.98 ÷ (1 − u)
// (u uniform, rounded down to the cent) every cash-out point returns 98% before rounding down and the $10,000 max win,
// which lower it in some rounds: "RTP up to 98%".
const cfg = {
  rtp: 98, minBet: 0.1, maxBet: 200, maxWin: 10000, maxMult: 10000, startBalance: 1000,
  waitMs: 6000, endMs: 3200,
  // The climb speeds up the higher it goes (Tornike, 2026-10-26: "the higher the X, the faster"): ln(multiplier) =
  // a·s + b·s², s seconds after take-off. 2× at 3.5 s, 10× at 9 s, 100× at 14.6 s, 1,000× at 19 s, 10,000× at 23 s.
  grow: [0.161, 0.0105],
  preMs: 2000,   // the Brainer lights its jets and lifts off this long before the betting window closes, so the flight starts at speed
  brain: { perRound: 10 }   // each round you play adds the same brain cells, whatever you bet (Marketing's rule)
};
const lnAt = t => { const s = Math.max(0, t) / 1000; return cfg.grow[0] * s + cfg.grow[1] * s * s; };   // ln of the multiplier, t ms after take-off
const speedAt = t => cfg.grow[0] + 2 * cfg.grow[1] * Math.max(0, t) / 1000;   // how fast it climbs then, in ln units a second
const multAt = t => Math.floor(Math.exp(lnAt(t)) * 100 + 1e-7) / 100;   // rounded down to the cent
const payOf = (stake, m) => Math.min(Math.floor(stake * m * 100 + 1e-6) / 100, cfg.maxWin);
const CELLS = (() => { const c = [0, 0]; for (let n = 1; n < 100; n++) c.push(c[n] + Math.round(10 + 8 * Math.pow(n, 1.4))); return c; })();
const brainLevel = cells => { let L = 1; while (L < 100 && cells >= CELLS[L + 1]) L++; return L; };
const stageOf = L => Math.ceil(L / 10);

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, nonce: 1, client: '', seed: '', hash: '', force: 0, cells: Math.max(0, parseFloat(store.get('brainer.xp', '0')) || 0) };   // brain cells, shared by every Brainer game on this site
// Each panel's bet. st: idle, placed (in this round, before take-off), queued (pressed during a flight: for the next
// round), live (flying), cashed or lost (this round, until the next one opens).
const bets = [0, 1].map(i => ({ i, stake: i ? 2 : 1, st: 'idle', tab: 'bet', autoBet: false, autoCo: false, coX: 2, payout: 0, at: 0 }));
let R = null;   // the round: { nonce, seed, hash, client, crash, phase: bet | starting | fly | end, waitT0, t0, endT0, m }
const rounds = [];   // settled rounds, newest first: the history pills and the fairness sheet
let booted = false, shown = null;   // shown: the round the fairness sheet is checking
const myLevel = () => brainLevel(S.cells);
const flying = () => R && R.phase === 'fly';

/* ---------- fairness ---------- */
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// The round rolls HMAC-SHA256(server seed, "client seed:nonce"), read as a fraction u from its first 52 bits, and flies
// away at 0.98 ÷ (1 − u) rounded down to the cent: 1.00× at least (about 3 rounds in 100 fly away at once), 10,000× at most.
async function crashOf(seed, client, nonce) {
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const u = parseInt(hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${client}:${nonce}`))).slice(0, 13), 16) / 2 ** 52;
  return clamp(Math.floor(cfg.rtp / (1 - u) + 1e-9) / 100, 1, cfg.maxMult);
}
// The game commits first: the next round's server seed is drawn and hashed before betting opens, so the hash is on
// show before the player sets a client seed or bets. Seed and hash change together.
let commit = null;
function rotateSeed() { const s = randHex(32); return (commit = sha256(s).then(h => { S.seed = s; S.hash = h; })); }

/* ---------- sound ---------- */
// Synthesised with Web Audio, so there are no files to load. Starts on the first tap or key; the HUD button mutes it.
// Every sound goes through one master: lifted 12 dB into a compressor that keeps the peaks under full scale. Without it
// the mix peaked near -22 dBFS, fine on a phone at full volume but barely audible on desktop speakers (2026-10-27).
const sound = (() => {
  let ac = null, out = null, on = store.get('brainer.sound', 'on') !== 'off';
  const ctxA = () => {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      out = ac.createGain(); out.gain.value = 4; out.connect(comp).connect(ac.destination);
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume();
    return ac;
  };
  const tone = (f0, f1, dur, type, vol, delay) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  };
  const noise = (dur, vol, f0, f1, delay) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out); src.start(t);
  };
  return {
    get on() { return on; },
    toggle() { on = !on; store.set('brainer.sound', on ? 'on' : 'off'); if (on) ctxA(); return on; },
    wake() { if (on) ctxA(); },   // browsers let a page make sound only after a tap or a key, so the first one unlocks it
    place() { tone(520, 780, 0.1, 'triangle', 0.09); },
    ignite() { noise(0.5, 0.08, 300, 1600); tone(80, 160, 0.5, 'sawtooth', 0.02); },   // the jets light on the pad
    takeoff() { noise(0.9, 0.1, 500, 2800); tone(120, 260, 0.8, 'sawtooth', 0.025); },
    cash() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0, 0.16, 'triangle', 0.09, i * 0.06)); },
    away() { noise(0.9, 0.14, 700, 5000); tone(300, 1800, 0.7, 'sawtooth', 0.03); },   // a rising whoosh as it flies away
    gear() { tone(220, 0, 0.08, 'square', 0.05); [660, 990, 1320].forEach((f, i) => tone(f, f * 1.5, 0.16, 'triangle', 0.08, 0.06 + i * 0.07)); },   // a piece of gear clanks on, then a rising chime
    sputter() { noise(0.5, 0.12, 1200, 200); tone(180, 60, 0.3, 'square', 0.03); },
    glitch() { noise(0.25, 0.08, 6000, 3000); tone(1400, 300, 0.15, 'square', 0.02); },
    dip() { tone(400, 120, 0.35, 'sawtooth', 0.03); tone(120, 400, 0.3, 'sawtooth', 0.03, 0.55); },
    spin() { noise(0.7, 0.08, 800, 2400); }
  };
})();

for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, () => sound.wake(), true);

/* ---------- the round ---------- */
function openRound() {   // betting opens on the seed committed (and hashed) at the end of the last round
  const now = performance.now();
  R = { nonce: S.nonce++, seed: S.seed, hash: S.hash, phase: 'bet', waitT0: now, liftT0: now + cfg.waitMs - cfg.preMs, lit: false, m: 1 };
  for (const b of bets) {
    if (b.st === 'cashed' || b.st === 'lost') b.st = 'idle';
    if (b.st === 'queued' || (b.st === 'idle' && b.autoBet)) place(b);
  }
  R.build = newBuild(); view.suit = 1; view.gearT0 = 0; view.arrive = view.react = null; scare.kind = ''; say('Betting is open. Take-off in 6 seconds.');
  renderBets(); renderReadout(true); if (!$('#fairSheet').hidden) renderFair();
}
async function takeOff() {
  R.phase = 'starting'; R.client = S.client;   // the client seed in effect at take-off is the one this round uses
  try { R.crash = R.seedCrash = await crashOf(R.seed, R.client, R.nonce); }
  catch (e) { toast(isSecureContext ? 'Could not start the round. Reload to try again.' : 'This demo needs https (or localhost) to draw its rounds.'); return; }
  if (S.force) { R.crash = S.force; R.forced = true; }   // a test flight: the fly-away point typed in by hand
  R.phase = 'fly'; R.t0 = performance.now(); view.flyT0 = R.t0; scheduleScare(R.t0, true);
  for (const b of bets) if (b.st === 'placed') b.st = 'live';
  sound.takeoff(); say('Take-off.');
  renderBets(); if (!$('#fairSheet').hidden) renderFair();
}
function place(b) {
  if (b.stake > S.balance) { b.st = 'idle'; b.autoBet = false; toast('Not enough demo balance for this bet. Lower it or press Reset.'); return false; }
  S.balance = cents(S.balance - b.stake); b.st = 'placed'; renderBalance(); return true;
}
function cashOut(b, m) {
  if (b.st !== 'live') return;
  b.payout = payOf(b.stake, m); b.at = Math.min(m, Math.floor(cfg.maxWin / b.stake * 100 + 1e-7) / 100); b.st = 'cashed';
  S.balance = cents(S.balance + b.payout); renderBalance();
  sound.cash(); feel('wink', 1200);
  say(`Bet ${b.i + 1} cashed out at ${fx(b.at)}: you won ${money(b.payout)}.`);
  view.wins.push({ t0: performance.now(), text: `+${money(b.payout)}`, x: b.i });
  renderBets();
}
function flyAway(now) {
  R.phase = 'end'; R.endT0 = now; R.m = R.crash; view.awayT0 = now; scare.kind = '';
  let played = false;
  for (const b of bets) { if (b.st === 'live') b.st = 'lost'; if (b.st === 'lost' || b.st === 'cashed') played = true; }
  rounds.unshift({ nonce: R.nonce, seed: R.seed, hash: R.hash, client: R.client, crash: R.crash, forced: !!R.forced, seedCrash: R.seedCrash, mine: bets.filter(b => b.st === 'lost' || b.st === 'cashed').map(b => ({ i: b.i, stake: b.stake, st: b.st, at: b.at, payout: b.payout })) });
  rounds.length = Math.min(rounds.length, 30);
  for (const b of bets) if (b.st === 'lost' || b.st === 'cashed') recordBet(b, R.crash);   // for My bets and the board
  if (played) earnCells(cfg.brain.perRound);
  sound.away(); say(`Flew away at ${fx(R.crash)}.`);
  rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); });   // the next round's commit, before its betting opens
  renderHist(); renderBets(); if (!$('#fairSheet').hidden) renderFair(); if (!$('#topSheet').hidden) renderBoard();
}
function tick(now) {
  if (!R) return;
  if (R.phase === 'bet' && !R.lit && now >= R.liftT0) { R.lit = true; sound.ignite(); }   // the jets light before the timer runs out
  if (R.phase === 'bet' && now - R.waitT0 >= cfg.waitMs) takeOff();
  else if (R.phase === 'fly') {
    const m = multAt(now - R.t0);
    for (const b of bets) {   // auto cash-outs and the max win first: the multiplier passed them before it flew away
      if (b.st !== 'live') continue;
      if (b.autoCo && b.coX <= R.crash && m >= b.coX) cashOut(b, b.coX);
      else if (b.stake * Math.min(m, R.crash) >= cfg.maxWin) { cashOut(b, Math.min(m, R.crash)); toast(`Max win of ${money(cfg.maxWin)} reached, so bet ${b.i + 1} cashed out.`); }
    }
    if (m >= R.crash) flyAway(now); else R.m = m;
  } else if (R.phase === 'end' && now - R.endT0 >= cfg.endMs) commit.then(() => { if (R.phase === 'end') openRound(); });
}

/* ---------- brain cells: still earned for the site, never shown here (no player character in Fly High) ---------- */
function earnCells(k) {
  const saved = parseFloat(store.get('brainer.xp', ''));
  if (saved >= 0) S.cells = saved;   // another Brainer game open in another tab may have added cells since this one loaded
  S.cells = Math.round((S.cells + k) * 10) / 10;
  store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(myLevel()));   // the website reads brainer.level
}
const mood = { set: '', until: 0 };
function feel(ex, ms) { mood.set = ex; mood.until = performance.now() + ms; }
function exNow(now) {
  if (mood.set && now < mood.until) return mood.set;
  if (!R || ((R.phase === 'bet' || R.phase === 'starting') && !R.lit)) return 'smile';
  return R.phase === 'fly' && R.m >= 3 ? 'joy' : 'happy';   // happy faces only (Tornike: "face is always angry")
}

/* ---------- the Iron Brainer, drawn in 2D ---------- */
// Every round starts from the same bare Brainer at suit level 1. Each later level adds one piece of gear, drawn at random
// for the round from a pool of 24 (Tornike, 2026-10-26: "the gear up can be randomized from pool"): plain pieces at
// levels 2–4, rarer ones from 5, the showiest from 8. A new piece can replace an older one in its slot (rocket boots
// over leg boosters, gold over chrome). Each piece arrives its own way and the Brainer reacts. Robot space is a
// 200 × 280 frame: feet at y 220, head top at 36.
const LV_AT = [1, 1.5, 2, 3, 5, 10, 25, 50, 100, 1000];   // the multiplier each suit level starts at
const suitOf = m => { let L = 1; while (L < LV_AT.length && m >= LV_AT[L]) L++; return L; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const C = { white: '#ffffff', edge: '#c9d2ea', cyan: '#2e9bea', blue: '#3550f0', led: '#d6e4ff', gold: '#f2b53a', pod: '#eef1fa', steel: '#7a84a8', dark: '#4b5675', orange: '#ff8a1f', red: '#e5484d', ice: '#5ce1ff' };
const P2 = s => new Path2D(s);
function rr(g, x, y, w, h, r, fill, stroke, lw) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw || 2; g.strokeStyle = stroke; g.stroke(); }
}
function seg(g, x1, y1, x2, y2, w, col) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = col; g.stroke(); }
function dot(g, x, y, r, col) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
function oval(g, x, y, rx, ry, rot, fill, stroke, lw) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.lineWidth = lw || 2; g.strokeStyle = stroke; g.stroke(); } }
const FLAME = [P2('M-8 0 Q-11 22 0 46 Q11 22 8 0 Z'), P2('M-5 0 Q-7 16 0 32 Q7 16 5 0 Z'), P2('M-2.5 0 Q-3.5 9 0 18 Q3.5 9 2.5 0 Z')];
// the jets heat up with the suit: orange, then white-hot from level 4, blue plasma from 7, violet at 10
const FLAME_C = { o: ['#ff8a1f', '#ffc93c', '#fff6d6'], h: ['#ffb020', '#fff07a', '#ffffff'], b: ['#3b8bff', '#8ec5ff', '#ffffff'], v: ['#a855ff', '#ff8ef0', '#ffffff'] };
const jetOf = L => L >= 10 ? 'v' : L >= 7 ? 'b' : L >= 4 ? 'h' : 'o';
const GLOW = { o: '255,170,60', h: '255,214,90', b: '90,170,255', v: '190,110,255' };
function flame(g, x, y, s, rot, col, now, seed) {
  if (s <= 0.02) return;
  const j = reduced ? 1 : 0.82 + 0.36 * hsh(Math.floor(now / 45) * 7 + seed);   // a flicker, new every 45 ms
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s * j);
  FLAME.forEach((p, i) => { g.fillStyle = FLAME_C[col][i]; g.fill(p); }); g.restore();
}
// the LED faces, as dot lists on the visor; only happy, surprised and sleepy ones (no frowning brows)
const arcD = (cx, cy, R, a0, a1, n) => Array.from({ length: n }, (_, i) => { const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
const ringD = (cx, cy, R, n) => Array.from({ length: n }, (_, i) => [cx + R * Math.cos(i / n * Math.PI * 2), cy + R * Math.sin(i / n * Math.PI * 2)]);
const lineD = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);
const starD = (cx, cy) => [[cx, cy], ...Array.from({ length: 10 }, (_, i) => { const a = (-90 + 36 * i) * Math.PI / 180, r = i % 2 ? 4.5 : 10; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; })];
const bitD = (rows, cx, cy, p) => { const out = [], w = rows[0].length, h = rows.length; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '1') out.push([cx + (x - (w - 1) / 2) * p, cy + (y - (h - 1) / 2) * p]); })); return out; };
const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
const FACES = {
  smile: [...ringD(80, 76, 6, 8), [80, 76], ...ringD(120, 76, 6, 8), [120, 76], ...arcD(100, 86, 14, 25, 155, 7)],
  happy: [...arcD(80, 82, 10, 200, 340, 5), ...arcD(120, 82, 10, 200, 340, 5), ...arcD(100, 86, 14, 25, 155, 7)],
  joy: [...arcD(80, 82, 10, 200, 340, 5), ...arcD(120, 82, 10, 200, 340, 5), ...lineD(88, 90, 112, 90, 5), ...arcD(100, 90, 12, 20, 160, 7)],
  star: [...starD(80, 76), ...starD(120, 76), ...lineD(88, 92, 112, 92, 5), ...arcD(100, 92, 12, 20, 160, 7)],
  hearts: [...bitD(HEART, 80, 74, 2.9), ...bitD(HEART, 120, 74, 2.9), ...arcD(100, 92, 11, 20, 160, 6)],
  wink: [...arcD(80, 82, 10, 200, 340, 5), ...lineD(111, 80, 129, 80, 4), ...arcD(100, 86, 14, 25, 155, 7)],
  shock: [...ringD(80, 74, 8, 9), ...ringD(120, 74, 8, 9), ...ringD(100, 97, 5, 7)],
  glitch: [...ringD(80, 76, 8, 9), ...lineD(110, 70, 130, 82, 5), ...lineD(110, 82, 130, 70, 5), ...lineD(86, 98, 114, 98, 5)],
  sleep: [...lineD(71, 80, 89, 80, 4), ...lineD(111, 80, 129, 80, 4), ...arcD(100, 90, 8, 30, 150, 4)]
};
const FACE_COL = { hearts: '#ff9be0' };
// LED letters for words on the visor, 5 × 7 dots (the exclamation mark is one dot wide)
const GLYPH = {
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  '!': ['1', '1', '1', '1', '1', '0', '1']
};
const visorCache = {};
function visorD(text) {
  if (visorCache[text]) return visorCache[text];
  const p = 3.6, out = [], cols = [...text].reduce((n, ch) => n + GLYPH[ch][0].length, 0) + text.length - 1;
  let x0 = 100 - (cols - 1) * p / 2;
  for (const ch of text) { const gl = GLYPH[ch]; gl.forEach((r, y) => [...r].forEach((c, x) => { if (c === '1') out.push([x0 + x * p, 78 + (y - 3) * p]); })); x0 += (gl[0].length + 1) * p; }
  return (visorCache[text] = out);
}
// easings for the ways a piece arrives
const backOut = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const bounceOut = x => { const n = 7.5625, d = 2.75; return x < 1 / d ? n * x * x : x < 2 / d ? n * (x -= 1.5 / d) * x + 0.75 : x < 2.5 / d ? n * (x -= 2.25 / d) * x + 0.9375 : n * (x -= 2.625 / d) * x + 0.984375; };
const elasticOut = x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
const STYLES = ['fly', 'drop', 'spin', 'zap', 'grow'];
function enter(g, o, it, fn) {   // fly: in from outside; drop: falls from above and bounces; spin: twirls in; zap: flickers into being; grow: pops up
  const a = o.arrive;
  if (!a || a.it !== it || a.q >= 1) { fn(); return; }
  const q = clamp(a.q, 0, 1), cx = it.cx, cy = it.cy;
  g.save();
  if (a.style === 'fly') { const e = backOut(q), d = Math.hypot(cx - 100, cy - 140) || 1, k = (1 - e) * 150 / d, s = 1 + (1 - e) * 0.9; g.globalAlpha = clamp(q * 4, 0, 1); g.translate(cx + (cx - 100) * k, cy + (cy - 140) * k); g.scale(s, s); g.translate(-cx, -cy); }
  else if (a.style === 'drop') { g.translate(0, -(1 - bounceOut(q)) * 260); g.globalAlpha = clamp(q * 5, 0, 1); }
  else if (a.style === 'spin') { const e = backOut(q); g.translate(cx, cy); g.rotate((1 - e) * Math.PI * 3); g.scale(Math.max(0.01, e), Math.max(0.01, e)); g.translate(-cx, -cy); }
  else if (a.style === 'grow') { const e = Math.max(0.01, elasticOut(q)); g.translate(cx, cy); g.scale(e, e); g.translate(-cx, -cy); }
  else g.globalAlpha = q < 0.6 ? (Math.floor(q * 25) % 2 ? 0.2 : 1) : 1;
  fn(); g.restore();
  if (a.style === 'zap' && q < 0.9) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7 * (1 - q); fn(); g.restore(); }   // a white-hot flash as it forms
}
// The pool. layers: where it is drawn (aura behind all, back behind the body, front on the body, headback behind the
// head, headpaint on the head under the visor, top over everything). sym: drawn on the left and mirrored. cx, cy: its
// middle, for the arrival. tier 1 = levels 2–4, 2 = 5–7, 3 = 8–10.
const GEAR = [
  { id: 'pads', name: 'Shoulder pads', tier: 1, slot: 'shoulder', layers: ['front'], sym: true, cx: 70, cy: 129, draw(g) {
    oval(g, 70, 129, 13, 9, 0, C.cyan); oval(g, 66, 126, 6, 3, -0.3, 'rgba(255,255,255,.55)'); } },
  { id: 'wrist', name: 'Wrist rockets', tier: 1, slot: 'wrist', layers: ['front'], sym: true, cx: 58, cy: 165, draw(g, o, l, sd) {
    flame(g, 54, 176, 0.38 * o.thrust, 0.35, jetOf(o.L), o.now, 61 + sd); seg(g, 62, 158, 55, 172, 7, C.blue); dot(g, 54, 174, 3, C.orange); } },
  { id: 'backrockets', name: 'Back rockets', tier: 1, slot: 'back', layers: ['back'], sym: true, cx: 37, cy: 135, draw(g, o, l, sd) {
    flame(g, 37, 164, 0.75 * o.thrust, 0, jetOf(o.L), o.now, 21 + sd);
    rr(g, 30, 112, 14, 46, 6, C.pod, C.edge); g.fillStyle = C.blue; g.fill(P2('M30 118 Q37 96 44 118 Z'));
    g.fillStyle = C.orange; g.fillRect(31, 134, 12, 5); rr(g, 32, 156, 10, 6, 2, C.steel); seg(g, 44, 128, 68, 132, 4, C.edge); } },
  { id: 'fin', name: 'Head fin', tier: 1, slot: 'head', layers: ['headback'], cx: 101, cy: 25, draw(g) {
    g.fillStyle = C.cyan; g.fill(P2('M90 40 Q100 10 112 40 Z')); g.fillStyle = 'rgba(255,255,255,.5)'; g.fill(P2('M96 38 Q100 22 104 38 Z')); } },
  { id: 'antenna', name: 'Power antenna', tier: 1, slot: 'antenna', layers: ['top'], cx: 148, cy: 12, draw(g, o) {
    seg(g, 136, 44, 150, 8, 3.5, C.edge);
    const gl = g.createRadialGradient(150, 6, 2, 150, 6, 18); gl.addColorStop(0, 'rgba(92,225,255,.8)'); gl.addColorStop(1, 'rgba(92,225,255,0)'); g.fillStyle = gl; g.fillRect(130, -14, 40, 40);
    dot(g, 150, 6, 6, C.ice); dot(g, 148, 4, 2, '#fff');
    if (!reduced && Math.floor(o.now / 150) % 3 === 0) { seg(g, 158, 0, 164, -6, 2, '#bff4ff'); seg(g, 142, 0, 136, -6, 2, '#bff4ff'); } } },
  { id: 'stripes', name: 'Racing stripes', tier: 1, slot: 'paint', paint: 'stripes', layers: ['front', 'headpaint'], cx: 100, cy: 150, draw(g, o, l) {
    if (l === 'front') { rr(g, 75, 128, 6, 50, 3, C.orange); rr(g, 119, 128, 6, 50, 3, C.orange); }
    else rr(g, 93, 37, 14, 10, 4, C.orange); } },
  { id: 'legb', name: 'Leg boosters', tier: 1, slot: 'legs', layers: ['front'], sym: true, cx: 70, cy: 198, draw(g, o, l, sd) {
    flame(g, 70.5, 211, 0.6 * o.thrust, 0, jetOf(o.L), o.now, 31 + sd); rr(g, 65, 184, 11, 28, 5, C.blue); g.fillStyle = C.cyan; g.fillRect(65, 192, 11, 4); } },
  { id: 'propeller', name: 'Propeller cap', tier: 1, slot: 'head', layers: ['top'], cx: 100, cy: 22, draw(g, o) {
    g.beginPath(); g.arc(100, 40, 14, Math.PI, 0); g.fillStyle = C.orange; g.fill(); seg(g, 100, 27, 100, 14, 3, C.dark);
    oval(g, 100, 13, 40, 5, 0, 'rgba(53,80,240,.16)');
    const a = reduced ? 0.6 : o.now / 35; for (const b of [0, Math.PI]) { const c = Math.cos(a + b); oval(g, 100 + c * 20, 13, Math.abs(c) * 20 + 2, 3, 0, C.blue); }
    dot(g, 100, 13, 3, C.dark); } },
  { id: 'wings', name: 'Wings', tier: 2, slot: 'wings', layers: ['back'], sym: true, cx: 43, cy: 162, draw(g) {
    g.fillStyle = C.blue; g.fill(P2('M72 146 L14 168 L20 178 L72 162 Z')); g.fillStyle = C.cyan; g.fill(P2('M72 151 L24 169 L26 173 L72 157 Z')); } },
  { id: 'cape', name: 'Hero cape', tier: 2, slot: 'wings', layers: ['back'], cx: 100, cy: 190, draw(g, o) {
    const t = reduced ? 0 : o.now / 220, s = Math.sin;
    g.beginPath(); g.moveTo(70, 126); g.quadraticCurveTo(100, 118, 130, 126); g.lineTo(142 + 6 * s(t), 246);
    g.quadraticCurveTo(121, 256 + 6 * s(t + 1), 100, 248); g.quadraticCurveTo(79, 256 + 6 * s(t + 2), 58 + 6 * s(t + 0.5), 246); g.closePath();
    g.fillStyle = C.red; g.fill(); seg(g, 100, 132, 100 + 4 * s(t + 1), 242, 2, 'rgba(120,20,40,.35)'); seg(g, 84, 132, 78 + 4 * s(t + 2), 240, 1.5, 'rgba(120,20,40,.25)'); } },
  { id: 'energywings', name: 'Energy wings', tier: 2, slot: 'wings', layers: ['back'], sym: true, cx: 40, cy: 145, draw(g, o) {
    const f = reduced ? 1 : 0.85 + 0.15 * Math.sin(o.now / 110);
    g.save(); g.translate(70, 150); g.scale(f, 1); g.translate(-70, -150);
    oval(g, 34, 126, 40, 19, -0.55, 'rgba(92,225,255,.4)', 'rgba(170,245,255,.95)', 2); oval(g, 44, 172, 27, 13, 0.45, 'rgba(169,112,255,.4)', 'rgba(215,190,255,.95)', 2);
    seg(g, 70, 150, 14, 112, 1.5, 'rgba(255,255,255,.7)'); seg(g, 70, 152, 24, 178, 1.5, 'rgba(255,255,255,.6)'); g.restore(); } },
  { id: 'boots', name: 'Rocket boots', tier: 2, slot: 'legs', layers: ['front'], sym: true, cx: 87, cy: 212, draw(g, o, l, sd) {
    flame(g, 87, 226, (1 + o.L * 0.06) * o.thrust * (sd ? o.footR : o.footL), 0, jetOf(o.L), o.now, 71 + sd);
    rr(g, 72, 196, 30, 30, 9, C.orange); g.fillStyle = '#fff'; g.fillRect(72, 206, 30, 5); rr(g, 80, 222, 14, 6, 2, C.dark); } },
  { id: 'missiles', name: 'Missile pods', tier: 2, slot: 'shoulder', layers: ['top'], sym: true, cx: 30, cy: 110, draw(g) {
    seg(g, 44, 118, 70, 128, 4, C.dark); rr(g, 16, 106, 30, 20, 6, C.dark);
    for (let i = 0; i < 3; i++) { const x = 19 + i * 8.5; rr(g, x, 92, 7, 16, 3, '#fff', C.edge, 1); g.fillStyle = C.red; g.fill(P2(`M${x} 95 Q${x + 3.5} 84 ${x + 7} 95 Z`)); } } },
  { id: 'drones', name: 'Helper drones', tier: 2, slot: 'drones', layers: ['aura', 'top'], cx: 100, cy: 150, draw(g, o, l) {
    const a = reduced ? 0.8 : o.now / 600;
    for (const i of [0, 1]) {
      const ang = a + i * Math.PI, x = 100 + 102 * Math.cos(ang), y = 150 + 30 * Math.sin(ang), front = Math.sin(ang) > 0, s = front ? 1 : 0.8;
      if ((l === 'top') !== front) continue;
      flame(g, x, y + 9 * s, 0.32 * s, 0, 'b', o.now, 81 + i); dot(g, x, y, 10 * s, '#e9edf7'); oval(g, x, y, 10 * s, 10 * s, 0, null, C.edge, 2); dot(g, x, y, 4 * s, C.ice);
    } } },
  { id: 'chrome', name: 'Chrome finish', tier: 2, slot: 'paint', paint: 'chrome', layers: ['front', 'headpaint'], cx: 100, cy: 120, draw(g, o, l) {
    g.fillStyle = 'rgba(255,255,255,.8)';
    if (l === 'front') g.fill(P2('M78 172 L90 130 L97 130 L85 172 Z'));
    else { g.beginPath(); g.arc(100, 80, 50, 3.55, 4.25); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke(); } } },
  { id: 'jetpack', name: 'Jetpack', tier: 2, slot: 'back', layers: ['back'], cx: 100, cy: 140, draw(g, o) {
    const j = jetOf(o.L); flame(g, 62, 180, 1.0 * o.thrust, 0, j, o.now, 91); flame(g, 138, 180, 1.0 * o.thrust, 0, j, o.now, 92);
    rr(g, 52, 102, 96, 74, 22, '#5a4fcf', '#3d33a8', 2); rr(g, 55, 172, 14, 9, 2, C.dark); rr(g, 131, 172, 14, 9, 2, C.dark);
    dot(g, 60, 112, 3, C.ice); dot(g, 140, 112, 3, C.ice); } },
  { id: 'bigrockets', name: 'Big rockets', tier: 3, slot: 'side', layers: ['back'], sym: true, cx: 15, cy: 105, draw(g, o, l, sd) {
    flame(g, 15, 147, 1.15 * o.thrust, 0, jetOf(o.L), o.now, 11 + sd);
    g.fillStyle = C.blue; g.fill(P2('M4 128 L-6 146 L4 142 Z')); g.fill(P2('M26 128 L36 146 L26 142 Z'));
    rr(g, 4, 66, 22, 76, 9, C.pod, C.edge); g.fillStyle = C.orange; g.fill(P2('M4 76 Q15 40 26 76 Z'));
    g.fillRect(5, 104, 20, 6); dot(g, 15, 90, 4, C.cyan); rr(g, 7, 140, 16, 7, 2, C.steel); } },
  { id: 'gold', name: 'Gold plating', tier: 3, slot: 'paint', paint: 'gold', layers: ['front', 'headpaint'], cx: 100, cy: 120, draw(g, o, l) {
    const pts = l === 'front' ? [[80, 136], [118, 168], [92, 176]] : [[58, 44], [146, 48]];
    pts.forEach(([x, y], i) => { const r = reduced ? 3 : 3 + 3 * Math.max(0, Math.sin(o.now / 260 + i * 2)); g.fillStyle = '#fff'; g.fill(P2(`M${x} ${y - r * 2} L${x + r * 0.5} ${y} L${x} ${y + r * 2} L${x - r * 0.5} ${y} Z M${x - r * 2} ${y} L${x} ${y + r * 0.5} L${x + r * 2} ${y} L${x} ${y - r * 0.5} Z`)); }); } },
  { id: 'crown', name: 'Crown', tier: 3, slot: 'head', layers: ['top'], cx: 100, cy: 26, draw(g) {
    g.beginPath(); g.moveTo(76, 42); g.lineTo(78, 18); g.lineTo(89, 30); g.lineTo(100, 12); g.lineTo(111, 30); g.lineTo(122, 18); g.lineTo(124, 42); g.closePath();
    g.fillStyle = '#ffc93c'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#d49a1c'; g.stroke();
    dot(g, 100, 31, 3.5, C.red); dot(g, 86, 35, 2.5, C.ice); dot(g, 114, 35, 2.5, C.ice); } },
  { id: 'aura', name: 'Energy aura', tier: 3, slot: 'aura', layers: ['aura'], cx: 100, cy: 140, draw(g, o) {
    oval(g, 100, 140, 108, 108, 0, 'rgba(200,140,255,.2)');
    g.save(); g.setLineDash([4, 8]); g.lineDashOffset = reduced ? 0 : -o.now / 40; oval(g, 100, 140, 118, 118, 0, null, '#e3b8ff', 4); g.restore(); } },
  { id: 'rainbow', name: 'Rainbow trail', tier: 3, slot: 'trail', layers: ['aura'], cx: 100, cy: 260, draw(g, o) {
    ['#ff5a5a', '#ffa13d', '#ffe14d', '#4fe07a', '#4fb3ff', '#a970ff'].forEach((c, i) => {
      const x = 79 + i * 7 + (reduced ? 0 : Math.sin(o.now / 300 + i * 0.4) * 2), gr = g.createLinearGradient(0, 200, 0, 640);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, 205, 7.5, 435); }); } },
  { id: 'shield', name: 'Shield bubble', tier: 3, slot: 'shield', layers: ['top'], cx: 100, cy: 140, draw(g, o) {
    const p = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(o.now / 300), gr = g.createRadialGradient(100, 140, 88, 100, 140, 128);
    gr.addColorStop(0, 'rgba(120,220,255,0)'); gr.addColorStop(1, `rgba(120,220,255,${0.25 + 0.15 * p})`);
    oval(g, 100, 140, 128, 128, 0, gr, 'rgba(190,240,255,.85)', 2.5);
    g.beginPath(); g.arc(100, 140, 116, 3.6, 4.3); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.6)'; g.stroke(); } },
  { id: 'halo', name: 'Golden halo', tier: 3, slot: 'halo', layers: ['top'], cx: 100, cy: 16, draw(g, o) {
    const y = 14 + (reduced ? 0 : Math.sin(o.now / 400) * 2);
    g.save(); g.shadowColor = '#ffd56b'; g.shadowBlur = 12; oval(g, 100, y, 30, 8, 0, null, '#ffd56b', 4); g.restore(); } },
  { id: 'bolt', name: 'Lightning', tier: 3, slot: 'bolt', layers: ['top'], cx: 100, cy: 140, draw(g, o) {
    const s0 = Math.floor(o.now / 70);
    g.save(); g.shadowColor = C.ice; g.shadowBlur = 10; g.lineWidth = 2.5; g.strokeStyle = '#d9f8ff'; g.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      if (hsh(s0 * 13 + i) < 0.45) continue;
      const a = hsh(s0 * 7 + i) * Math.PI * 2; let x = 100 + 46 * Math.cos(a), y = 150 + 52 * Math.sin(a);
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += Math.cos(a) * 14 + (hsh(s0 + i * 5 + j) - 0.5) * 16; y += Math.sin(a) * 14 + (hsh(s0 + i * 9 + j + 3) - 0.5) * 16; g.lineTo(x, y); }
      g.stroke();
    }
    g.restore(); } }
];
// one round's build: a piece for each level 2–10, at random (cosmetic only, never from the round's seed)
function newBuild() {
  const b = [null], slots = {};
  for (let L = 2; L <= 10; L++) {
    let tier = L <= 4 ? 1 : L <= 7 ? 2 : 3;
    if (tier > 1 && Math.random() < 0.2) tier--;   // now and then a piece from the tier below
    let pool = GEAR.filter(it => it.tier === tier && !b.includes(it) && (!slots[it.slot] || slots[it.slot].tier < it.tier));
    const fresh = pool.filter(it => !slots[it.slot]);
    if (fresh.length && Math.random() < 0.7) pool = fresh;   // mostly new slots, sometimes an upgrade of one already worn
    if (!pool.length) pool = GEAR.filter(it => !b.includes(it) && !slots[it.slot]);
    const it = pick(pool); b.push(it); slots[it.slot] = it;
  }
  return b;
}
function gearAt(build, L) {   // what is worn at level L: the latest piece in each slot
  const by = {};
  for (let i = 1; i < L && build; i++) by[build[i].slot] = { it: build[i], lv: i + 1 };
  return Object.values(by);
}
const PAINT = { none: { body: '#ffffff', edge: '#c9d2ea' }, stripes: { body: '#ffffff', edge: '#c9d2ea' }, chrome: { body: '#e1e7f2', edge: '#93a0bf' }, gold: { body: '#ffd978', edge: '#cf961c' } };
const both = (g, fn) => { fn(0); g.save(); g.translate(200, 0); g.scale(-1, 1); fn(1); g.restore(); };
function sideBody(g, pc, acc) {
  rr(g, 80, 180, 16, 34, 7, pc.body, pc.edge); rr(g, 77, 206, 22, 14, 6, acc);
  seg(g, 72, 136, 50, 180, 17, pc.edge); seg(g, 72, 136, 50, 180, 13, pc.body); dot(g, 48, 185, 8.5, acc);
}
// o: { L, gear, face, visor, thrust, footL, footR, dim, glitch, batt, arrive, now }
function drawBot(g, o) {
  const L = o.L, now = o.now, gear = o.gear || [], pt = gear.find(x => x.it.paint), paint = pt ? pt.it.paint : 'none', pc = PAINT[paint], acc = paint === 'gold' ? C.gold : C.cyan;
  const layer = name => { for (const x of gear) if (x.it.layers.includes(name)) { const one = sd => enter(g, o, x.it, () => x.it.draw(g, o, name, sd)); if (x.it.sym) both(g, one); else one(0); } };
  if (L >= 4 && !o.dim) {   // a glow behind the Brainer in its jets' colour
    const c = GLOW[jetOf(L)], gl = g.createRadialGradient(100, 150, 20, 100, 150, 135); gl.addColorStop(0, `rgba(${c},.38)`); gl.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gl; g.fillRect(-35, 15, 270, 270);
  }
  layer('aura'); layer('back');
  const jet = jetOf(L), boots = gear.some(x => x.it.id === 'boots');
  both(g, sd => {
    if (!boots) flame(g, 88, 219, (0.8 + L * 0.07) * o.thrust * (sd ? o.footR : o.footL), 0, jet, now, 41 + sd);   // foot jet, longer every level
    flame(g, 46, 191, (0.62 + L * 0.04) * o.thrust, 18 * Math.PI / 180, jet, now, 51 + sd);   // hand jet, angled out
  });
  seg(g, 136, 44, 146, 22, 3, C.edge); dot(g, 146, 20, 4.5, C.cyan);
  both(g, () => sideBody(g, pc, acc));
  rr(g, 90, 112, 20, 14, 4, '#dde3f3');
  rr(g, 68, 122, 64, 64, 24, pc.body, pc.edge);
  rr(g, 86, 142, 28, 22, 4, o.dim ? '#1c2566' : C.blue);
  layer('front'); layer('headback');
  rr(g, 36, 62, 12, 30, 6, acc); rr(g, 152, 62, 12, 30, 6, acc);
  rr(g, 44, 36, 112, 84, 40, pc.body, pc.edge);
  layer('headpaint');
  const jx = o.glitch && !reduced ? (hsh(Math.floor(now / 60)) - 0.5) * 6 : 0;
  rr(g, 52 + jx, 46, 96, 64, 28, o.dim ? '#1c2566' : C.blue);
  const fc = o.dim ? '#7f8fd8' : FACE_COL[o.face] || C.led;
  for (const [x, y] of o.visor ? visorD(o.visor) : FACES[o.face] || FACES.smile) dot(g, x + jx, y, o.visor ? 1.7 : 2.3, fc);
  if (o.glitch) { g.fillStyle = 'rgba(159,179,255,.6)'; g.fillRect(52, 58 + hsh(Math.floor(now / 80)) * 30, 96, 5); g.fillStyle = 'rgba(13,21,80,.7)'; g.fillRect(58, 86, 84, 3); }
  layer('top');
  g.font = `700 ${L >= 10 ? 13 : 14}px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center'; g.fillStyle = paint === 'gold' ? '#ffd66b' : o.dim ? '#7f8fd8' : C.led;
  g.fillText(String(L), 100, 158);
  if (o.batt && (reduced || Math.floor(now / 200) % 2 === 0)) {   // a battery over the head, blinking, during a power-dip scare
    rr(g, 83, -4, 30, 16, 3, C.white, C.red, 3); rr(g, 113, 1, 4, 6, 1, C.red); rr(g, 87, 0, 6, 8, 1, C.red);
  }
}

/* ---------- scares: pure show, random and independent of the round ---------- */
// A boot sputters, the visor glitches, the power dips or a gust spins the Brainer. They come from Math.random, never
// from the round's seed, so they say nothing about when it will fly away, and the multiplier never pauses.
const scare = { kind: '', t0: 0, dur: 0, next: 0, side: 1 };
const SCARES = { boot: 1100, glitch: 800, dip: 900, spin: 1300 };
function scheduleScare(now, first) { scare.next = now + (first ? 2200 : 4000) - Math.log(1 - Math.random()) * 11000; }   // about one per 15 s of flight, never two in a row
function scareFx(now) {
  const fx0 = { rot: 0, dy: 0, face: '', thrust: 1, footL: 1, footR: 1, glitch: false, batt: '', wind: 0, smoke: 0 };
  if (!flying()) return fx0;
  if (!scare.kind && now >= scare.next) {
    const kinds = Object.keys(SCARES); scare.kind = kinds[Math.floor(Math.random() * kinds.length)];
    scare.t0 = now; scare.dur = SCARES[scare.kind]; scare.side = Math.random() < 0.5 ? -1 : 1; sound[scare.kind === 'boot' ? 'sputter' : scare.kind]();
  }
  if (!scare.kind) return fx0;
  const q = (now - scare.t0) / scare.dur;
  if (q >= 1) { scare.kind = ''; scheduleScare(now); return fx0; }
  const env = Math.sin(Math.PI * q);
  if (scare.kind === 'boot') Object.assign(fx0, { rot: -0.22 * env * scare.side, dy: 0.04 * env, face: 'shock', smoke: env, [scare.side > 0 ? 'footR' : 'footL']: q < 0.75 ? 0 : 1 });
  else if (scare.kind === 'glitch') Object.assign(fx0, { face: 'glitch', glitch: true });
  else if (scare.kind === 'dip') Object.assign(fx0, { thrust: q < 0.7 ? 0.3 : 1, dy: 0.05 * env, face: 'shock', batt: 'low' });
  else Object.assign(fx0, { rot: (reduced ? 0.1 : 0.9) * env * scare.side, face: 'shock', wind: env });
  return fx0;
}

/* ---------- the scene: from the launch pad, through the clouds and out into space ---------- */
// Tornike, 2026-10-26: simple, drawn, and ending in space. Layers with depth: far mountains and hills round the pad
// (with its tower and launch smoke), birds and a balloon, three layers of shaded clouds (the near one passing in front),
// high cirrus, an aurora at the edge of space, then nebulae, three depths of stars, shooting stars, a satellite, the
// curve of the Earth, the Moon, a ringed planet, a galaxy and asteroids. Everything moves on the climb's own curve.
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
const view = { awayT0: 0, wins: [], suit: 1, gearT0: 0, arrive: null, react: null, sparks: [], smoke: [], shoot: [], alt: 0, last: 0 };
const TAU = Math.PI * 2;
const hsh = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // a fixed scatter
const smooth = f => f * f * (3 - 2 * f);
const band = (h, a, b, c, d) => smooth(clamp((h - a) / (b - a), 0, 1)) * (1 - smooth(clamp((h - c) / (d - c), 0, 1)));   // 0 → 1 over a–b, back to 0 over c–d
const lin = (y0, y1, stops) => { const l = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => l.addColorStop(o, c)); return l; };
let nebula = null;
function layout() {
  W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  nebula = document.createElement('canvas'); nebula.width = Math.max(1, Math.round(W / 2)); nebula.height = Math.max(1, Math.round(H / 2));   // soft colour clouds, drawn once at half size
  const n = nebula.getContext('2d'), nw = nebula.width, nh = nebula.height;
  [['150,80,255', 0.2, 0.3, 0.55, 0.45], ['60,140,255', 0.75, 0.2, 0.5, 0.4], ['255,90,180', 0.6, 0.75, 0.45, 0.28], ['80,220,255', 0.15, 0.85, 0.4, 0.22]].forEach(([c, x, y, r, a]) => {
    const g = n.createRadialGradient(x * nw, y * nh, 0, x * nw, y * nh, r * Math.max(nw, nh)); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); n.fillStyle = g; n.fillRect(0, 0, nw, nh);
  });
}
new ResizeObserver(layout).observe(stage);
// Height: 0 on the pad, 1 at the edge of space (30×), on the log of the multiplier; the lift-off before the timer adds 0.06.
const SPACE = 30, PRE_H = 0.06, PX = 7;   // PX: stage heights scrolled per unit of height
const SKY_STOPS = [   // [height, top, middle, horizon]
  [0, '#4aa8ff', '#8fd0ff', '#e3f6ff'], [0.25, '#3f8cff', '#7cbcff', '#cfe9ff'], [0.5, '#2a5fd8', '#4f88ee', '#9cc4ff'],
  [0.7, '#162a7a', '#2a46b0', '#5f7fe0'], [0.85, '#0a1240', '#18246e', '#3a3f9e'], [1, '#04061a', '#0a0f34', '#1a1d5c'], [1.6, '#02030f', '#060a26', '#0c1038']
];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixC = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
function skyAt(h) {
  let i = 0; while (i < SKY_STOPS.length - 2 && h > SKY_STOPS[i + 1][0]) i++;
  const A = SKY_STOPS[i], B = SKY_STOPS[i + 1], t = smooth(clamp((h - A[0]) / (B[0] - A[0]), 0, 1));
  return [mixC(A[1], B[1], t), mixC(A[2], B[2], t), mixC(A[3], B[3], t)];
}
function heightNow(now) {
  if (!R || (R.phase === 'bet' && !R.lit)) return 0;
  const pre = PRE_H * smooth(clamp((now - R.liftT0) / cfg.preMs, 0, 1));
  if (R.phase === 'bet' || R.phase === 'starting') return pre;
  return PRE_H + lnAt((R.phase === 'end' ? R.endT0 : now) - R.t0) / Math.log(SPACE);   // it holds where the Brainer flew away
}
// shaded cartoon clouds, drawn once: a row of puffs on a flat base, a soft blue underside
const CLOUDS = Array.from({ length: 6 }, (_, k) => {
  const c = document.createElement('canvas'); c.width = 520; c.height = 280; const g = c.getContext('2d'); g.scale(2, 2);
  g.fillStyle = '#fff'; const n = 5 + Math.floor(hsh(k + 40) * 3);
  for (let i = 0; i < n; i++) { const t = i / (n - 1), r = 20 + Math.sin(t * Math.PI) * (24 + hsh(k * 9 + i) * 20); g.beginPath(); g.arc(40 + t * 180, 104 - r * 0.7 + hsh(k * 5 + i) * 8, r, 0, Math.PI * 2); g.fill(); }
  rr(g, 24, 88, 212, 32, 16, '#fff');
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 30, 0, 120); sh.addColorStop(0, 'rgba(255,252,240,.9)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(130,165,225,.6)');
  g.fillStyle = sh; g.fillRect(0, 0, 260, 140);
  return c;
});
const CLOUD_LAYERS = [   // far, mid, near: size, how fast it passes (parallax), spacing in height, opacity
  { s: 0.45, par: 0.45, step: 0.03, a: 0.55 }, { s: 0.9, par: 1, step: 0.035, a: 0.95 }, { s: 1.9, par: 1.9, step: 0.07, a: 0.8 }
];
const cloudDens = hc => hc < 0.04 ? 0 : hc < 0.14 ? (hc - 0.04) / 0.1 : hc < 0.48 ? 1 : hc < 0.7 ? (0.7 - hc) / 0.22 : 0;
function clouds(h, li, fast) {
  const Lr = CLOUD_LAYERS[li], gy0 = H * 0.86, span = H * PX * Lr.par, cs = Lr.s * Math.min(1.25, Math.max(0.6, W / 820)), stretch = 1 + fast * (0.4 + li * 0.4);
  const lo = h - (H + 300 - gy0) / span, hi = h + (gy0 + 300) / span;
  for (let j = Math.max(1, Math.floor(lo / Lr.step)); j <= Math.ceil(hi / Lr.step); j++) {
    const hc = j * Lr.step, seed = j * 31 + li * 977;
    if (hsh(seed) > cloudDens(hc) * (li === 2 ? 0.35 : 0.85)) continue;
    const s = cs * (0.65 + hsh(seed + 1) * 0.7), x = (hsh(seed + 2) * 1.3 - 0.15) * W, y = gy0 + (h - hc) * span, im = CLOUDS[Math.floor(hsh(seed + 3) * CLOUDS.length)];
    ctx.globalAlpha = Lr.a * (li === 2 ? 1 - fast * 0.3 : 1);
    ctx.drawImage(im, x - 130 * s, y - 120 * s * stretch, 260 * s, 140 * s * stretch);
  }
  ctx.globalAlpha = 1;
}
function mountains(gy) {   // far peaks with snow, in the haze
  if (gy - H * 0.25 > H) return;
  ctx.fillStyle = '#a7c4ec'; ctx.beginPath(); ctx.moveTo(0, gy);
  const n = 7, pts = [];
  for (let i = 0; i <= n; i++) { const x = i / n * W, y = gy - H * (0.12 + hsh(i + 70) * 0.13); pts.push([x, y]); ctx.lineTo(x - W / n / 2, gy - H * 0.05); ctx.lineTo(x, y); }
  ctx.lineTo(W, gy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4f8ff';
  for (const [x, y] of pts) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - W * 0.018, y + H * 0.03); ctx.lineTo(x + W * 0.018, y + H * 0.03); ctx.closePath(); ctx.fill(); }
}
function hills(gy, now) {   // rolling hills with round trees
  if (gy - H * 0.12 > H) return;
  ctx.fillStyle = '#97d886';
  for (let i = -1; i < 7; i++) { ctx.beginPath(); ctx.ellipse(i * W / 5 + (hsh(i + 9) - 0.5) * 60, gy + 4, W * 0.17, H * 0.1 * (0.7 + hsh(i + 3) * 0.6), 0, Math.PI, 0); ctx.fill(); }
  for (let i = 0; i < 14; i++) { const x = hsh(i + 120) * W, y = gy - H * 0.01 - hsh(i + 140) * H * 0.04, r = 5 + hsh(i + 160) * 6; dot(ctx, x, y - r, r, '#4fb35c'); dot(ctx, x - r * 0.3, y - r * 1.25, r * 0.5, '#6fcc6e'); }
}
function ground(gy, padX, k, now) {   // the grass, the launch pad and its tower
  if (gy - 200 * k > H) return;
  ctx.fillStyle = '#74cd63'; ctx.fillRect(0, gy, W, H); ctx.fillStyle = '#66c057'; ctx.fillRect(0, gy + H * 0.06, W, H);
  rr(ctx, padX - 70 * k, gy - 8 * k, 140 * k, 16 * k, 8 * k, '#e3e8f6', '#c3cbe2', 2);
  ctx.fillStyle = C.blue; for (let i = -2; i <= 2; i++) ctx.fillRect(padX + (i * 24 - 6) * k, gy - 3 * k, 12 * k, 4 * k);
  const tx = padX + 100 * k, top = gy - 190 * k;   // the gantry: a striped lattice tower with a blinking light
  ctx.fillStyle = '#ffffff'; ctx.fillRect(tx - 9 * k, top, 18 * k, 190 * k);
  ctx.fillStyle = C.orange; for (let y = top; y < gy; y += 30 * k) ctx.fillRect(tx - 9 * k, y, 18 * k, 15 * k);
  ctx.strokeStyle = 'rgba(80,90,120,.45)'; ctx.lineWidth = 1.5; for (let y = top; y < gy - 15 * k; y += 15 * k) { ctx.beginPath(); ctx.moveTo(tx - 9 * k, y); ctx.lineTo(tx + 9 * k, y + 15 * k); ctx.stroke(); }
  const arm = R && R.lit ? clamp(1 - (performance.now() - R.liftT0) / 500, 0, 1) : 1;   // the arm swings back as the jets light
  if (arm > 0) { ctx.fillStyle = '#c3cbe2'; ctx.fillRect(tx - 9 * k - 40 * k * arm, gy - 120 * k, 40 * k * arm, 6 * k); }
  if (reduced || Math.floor(now / 500) % 2) dot(ctx, tx, top - 5 * k, 5 * k, C.red);
}
function smokeAt(gy, padX, k, now, lifting) {   // launch smoke billowing out over the pad as it lifts off
  if (lifting && !reduced && view.alt < 0.07 && view.smoke.length < 90) for (const side of [-1, 1]) view.smoke.push({ x: padX + side * (10 + Math.random() * 30) * k, vx: side * (0.04 + Math.random() * 0.1) * k, t0: now });
  view.smoke = view.smoke.filter(p => now - p.t0 < 1800);
  for (const p of view.smoke) {
    const q = (now - p.t0) / 1800, r = (14 + q * 46) * k;
    ctx.globalAlpha = 0.85 * (1 - q); dot(ctx, p.x + p.vx * (now - p.t0), gy - 6 * k - q * 18 * k, r, q < 0.3 ? '#fff6e6' : '#eef1f7');
  }
  ctx.globalAlpha = 1;
}
function sun(h) {
  const x = W * 0.82, y = H * 0.16 + h * H * 0.05, r = Math.min(W, H) * (h > 0.9 ? 0.03 : 0.045), glow = Math.min(W, H) * 0.4, g = ctx.createRadialGradient(x, y, r * 0.5, x, y, glow);
  g.addColorStop(0, 'rgba(255,250,225,.85)'); g.addColorStop(0.25, 'rgba(255,236,190,.25)'); g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g; ctx.fillRect(x - glow, y - glow, glow * 2, glow * 2); dot(ctx, x, y, r, '#fffdf2');
  if (h > 0.75) { ctx.globalAlpha = smooth(clamp((h - 0.75) / 0.3, 0, 1)) * 0.7; ctx.fillStyle = '#fffdf2'; ctx.fillRect(x - r * 7, y - 1, r * 14, 2); ctx.fillRect(x - 1, y - r * 7, 2, r * 14); ctx.globalAlpha = 1; }   // in space, a lens-flare cross
}
function birds(h, now) {   // a flock crossing low down
  const a = band(h, 0.02, 0.06, 0.2, 0.3); if (a < 0.01) return;
  ctx.strokeStyle = `rgba(43,58,103,${a})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = ((now * 0.05 + i * 38 + hsh(i) * 40) % (W + 300)) - 150, y = H * 0.86 + (h - 0.13 - (i % 3) * 0.01) * H * PX + Math.sin(i * 1.7) * 14, f = reduced ? 4 : Math.sin(now / 110 + i) * 5;
    ctx.beginPath(); ctx.moveTo(x - 9, y - f); ctx.quadraticCurveTo(x - 4, y - 2, x, y); ctx.quadraticCurveTo(x + 4, y - 2, x + 9, y - f); ctx.stroke();
  }
}
function balloon(h, now) {   // a hot-air balloon in Brainer colours
  const y = H * 0.86 + (h - 0.3) * H * PX * 0.8, x = W * 0.17 + (reduced ? 0 : Math.sin(now / 2500) * 12), s = Math.min(1.2, Math.max(0.7, W / 900));
  if (y < -120 || y > H + 120) return;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, 28 * s, 0, TAU); ctx.clip(); ctx.fillStyle = C.blue; ctx.fillRect(x - 30 * s, y - 30 * s, 60 * s, 60 * s);
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 6 * s, y - 30 * s, 12 * s, 60 * s); ctx.fillStyle = C.orange; ctx.fillRect(x - 30 * s, y - 30 * s, 8 * s, 60 * s); ctx.fillRect(x + 22 * s, y - 30 * s, 8 * s, 60 * s); ctx.restore();
  seg(ctx, x - 10 * s, y + 25 * s, x - 6 * s, y + 40 * s, 1.5, '#6b4a2e'); seg(ctx, x + 10 * s, y + 25 * s, x + 6 * s, y + 40 * s, 1.5, '#6b4a2e');
  rr(ctx, x - 8 * s, y + 39 * s, 16 * s, 11 * s, 3 * s, '#a0703e');
}
function cirrus(h) {   // thin high streaks
  const a = band(h, 0.38, 0.5, 0.68, 0.8); if (a < 0.01) return;
  ctx.fillStyle = `rgba(255,255,255,${0.3 * a})`;
  for (let j = 10; j < 30; j++) { const hc = j * 0.03, y = H * 0.86 + (h - hc) * H * PX * 0.8; if (y < -20 || y > H + 20) continue; oval(ctx, hsh(j + 300) * W, y, W * (0.12 + hsh(j + 320) * 0.12), 3 + hsh(j) * 3, 0, ctx.fillStyle); }
}
function aurora(h, now) {   // green-to-violet ribbons at the edge of space
  const a = band(h, 0.62, 0.78, 1.05, 1.3); if (a < 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let r = 0; r < 2; r++) {
    const base = H * (0.25 + r * 0.18) + (h - 0.9) * H * 1.2, t = reduced ? 0 : now / 1400;
    ctx.beginPath();
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, base + Math.sin(x * 0.007 + t + r * 2) * H * 0.05);
    for (let x = W + 20; x >= 0; x -= 20) ctx.lineTo(x, base + Math.sin(x * 0.007 + t + r * 2) * H * 0.05 + H * (0.13 + 0.05 * Math.sin(x * 0.011 + t * 1.3)));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, base - H * 0.05, 0, base + H * 0.2); g.addColorStop(0, 'rgba(169,112,255,0)'); g.addColorStop(0.5, `rgba(169,112,255,${0.22 * a})`); g.addColorStop(1, `rgba(61,255,158,${0.32 * a})`);
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}
const STARS = [[140, 0.25, 0.5, 1], [70, 0.5, 1, 1.6], [20, 1, 1.6, 2.4]].map(([n, par, r0, r1], l) => Array.from({ length: n }, (_, i) => ({ x: hsh(i + l * 500 + 1), y: hsh(i + l * 500 + 101), r: r0 + hsh(i + l * 500 + 201) * (r1 - r0), tw: hsh(i + l * 500 + 301) * TAU, par, c: ['#ffffff', '#cfe0ff', '#ffe9c4'][i % 3] })));
function space(h, now, dt, pushing) {
  const sa = smooth(clamp((h - 0.5) / 0.35, 0, 1)); if (sa < 0.01) return;
  if (nebula) { const y = ((h - 0.8) * H * 0.3) % H; ctx.globalAlpha = sa; ctx.drawImage(nebula, 0, y, W, H); ctx.drawImage(nebula, 0, y - H, W, H); ctx.globalAlpha = 1; }
  for (const layer of STARS) for (const s of layer) {
    const y = ((s.y + h * s.par) % 1) * H, x = s.x * W; ctx.globalAlpha = sa * (reduced ? 0.85 : 0.6 + 0.4 * Math.sin(now / 600 + s.tw)); dot(ctx, x, y, s.r, s.c);
    if (s.r > 1.8) { ctx.fillStyle = s.c; ctx.fillRect(x - s.r * 3, y - 0.5, s.r * 6, 1); ctx.fillRect(x - 0.5, y - s.r * 3, 1, s.r * 6); }
  }
  ctx.globalAlpha = 1;
  if (pushing && !reduced && h > 0.9 && Math.random() < dt / 1800) view.shoot.push({ x: Math.random() * W, y: Math.random() * H * 0.5, t0: now, d: Math.random() < 0.5 ? -1 : 1 });   // shooting stars
  view.shoot = view.shoot.filter(s => now - s.t0 < 700);
  for (const s of view.shoot) { const q = (now - s.t0) / 700, x = s.x + s.d * q * W * 0.3, y = s.y + q * H * 0.18, g = ctx.createLinearGradient(x, y, x - s.d * 80, y - 48); g.addColorStop(0, `rgba(255,255,255,${1 - q})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.d * 80, y - 48); ctx.stroke(); }
  const ga = band(h, 1.9, 2.2, 9, 10);   // a far galaxy
  if (ga > 0.01) { const x = W * 0.74, y = H * 0.22 + (h - 1.9) * H * 0.2; ctx.save(); ctx.globalAlpha = ga; ctx.translate(x, y); ctx.rotate(-0.4); const g = ctx.createRadialGradient(0, 0, 2, 0, 0, W * 0.09); g.addColorStop(0, 'rgba(255,240,220,.9)'); g.addColorStop(0.3, 'rgba(190,150,255,.35)'); g.addColorStop(1, 'rgba(120,90,255,0)'); ctx.scale(1, 0.35); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, W * 0.09, 0, TAU); ctx.fill(); ctx.restore(); }
  const ma = band(h, 1.05, 1.2, 9, 10), my = H * 0.12 + (h - 1.15) * H * 0.55;   // the Moon
  if (ma > 0.01 && my < H + 80) { const x = W * 0.84, r = Math.min(W, H) * 0.06; ctx.globalAlpha = ma; dot(ctx, x, my, r, '#dfe2ec'); dot(ctx, x - r * 0.3, my - r * 0.2, r * 0.22, '#c4c8d6'); dot(ctx, x + r * 0.35, my + r * 0.25, r * 0.16, '#c4c8d6'); dot(ctx, x + r * 0.1, my - r * 0.45, r * 0.1, '#c4c8d6'); ctx.globalAlpha = 1; }
  const pa = band(h, 1.4, 1.6, 9, 10), py = H * 0.2 + (h - 1.45) * H * 0.35;   // a ringed planet
  if (pa > 0.01 && py < H + 100) { const x = W * 0.15, r = Math.min(W, H) * 0.075; ctx.globalAlpha = pa; ctx.beginPath(); ctx.ellipse(x, py, r * 1.9, r * 0.45, -0.35, Math.PI, TAU); ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = '#ffe2c4'; ctx.stroke(); const g = ctx.createLinearGradient(x, py - r, x, py + r); g.addColorStop(0, '#ffb98a'); g.addColorStop(1, '#e0703f'); dot(ctx, x, py, r, g); ctx.fillStyle = 'rgba(255,230,200,.5)'; ctx.fillRect(x - r * 0.95, py - r * 0.2, r * 1.9, r * 0.25); ctx.beginPath(); ctx.ellipse(x, py, r * 1.9, r * 0.45, -0.35, 0, Math.PI); ctx.stroke(); ctx.globalAlpha = 1; }
  const sx = ((now * 0.045) % (W + 400)) - 200, sy = H * 0.34;   // a satellite drifting across
  if (h > 1 && h < 2.2) { ctx.globalAlpha = band(h, 1, 1.15, 2, 2.2); rr(ctx, sx - 7, sy - 6, 14, 12, 2, '#ffc93c'); ctx.fillStyle = '#3550f0'; ctx.fillRect(sx - 32, sy - 4, 22, 8); ctx.fillRect(sx + 10, sy - 4, 22, 8); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; for (const ox of [-25, -18, 17, 24]) { ctx.beginPath(); ctx.moveTo(sx + ox, sy - 4); ctx.lineTo(sx + ox, sy + 4); ctx.stroke(); } ctx.globalAlpha = 1; }
  const aa = band(h, 2, 2.3, 9, 10);   // asteroids tumbling past
  if (aa > 0.01) for (let j = 30; j < 60; j++) { const hc = j * 0.06, y = H * 0.86 + (h - hc) * H * PX * 1.2; if (y < -40 || y > H + 40) continue; const x = hsh(j + 700) * W, r = 6 + hsh(j + 720) * 14, rot = now / 900 + j; ctx.save(); ctx.globalAlpha = aa; ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rr0 = r * (0.75 + hsh(j * 7 + i) * 0.4); ctx.lineTo(Math.cos(a) * rr0, Math.sin(a) * rr0); } ctx.closePath(); ctx.fillStyle = '#8a8296'; ctx.fill(); dot(ctx, r * 0.2, -r * 0.1, r * 0.25, '#6f6880'); ctx.restore(); }
}
function earth(h) {   // the curve of the Earth rises from below at the edge of space, then sinks away
  const ea = smooth(clamp((h - 0.8) / 0.3, 0, 1)); if (ea < 0.01) return;
  const R0 = W * 1.3, top = H - ea * H * 0.24 + smooth(clamp((h - 1.7) / 0.8, 0, 1)) * H * 0.3, cy = top + R0;
  const at = ctx.createRadialGradient(W / 2, cy, R0, W / 2, cy, R0 + H * 0.09); at.addColorStop(0, 'rgba(110,190,255,.6)'); at.addColorStop(1, 'rgba(110,190,255,0)');
  ctx.fillStyle = at; ctx.beginPath(); ctx.arc(W / 2, cy, R0 + H * 0.09, 0, TAU); ctx.fill();
  const oc = ctx.createLinearGradient(0, top, 0, top + H * 0.3); oc.addColorStop(0, '#4fa6ff'); oc.addColorStop(1, '#1a4fa8');
  ctx.fillStyle = oc; ctx.beginPath(); ctx.arc(W / 2, cy, R0, 0, TAU); ctx.fill();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 5; i++) oval(ctx, W * (0.08 + i * 0.22), top + H * 0.05 + hsh(i + 800) * H * 0.04, W * 0.07, H * 0.025, 0.25 * i, '#4cbf6a');
  for (let i = 0; i < 6; i++) oval(ctx, W * hsh(i + 820), top + H * 0.02 + hsh(i + 840) * H * 0.07, W * 0.06, H * 0.008, 0.1, 'rgba(255,255,255,.75)');
  ctx.restore();
}
function world(now, dt, h, padX, k, fast, lifting, pushing) {
  const [t, m, b] = skyAt(h);
  ctx.fillStyle = lin(0, H, [[0, t], [0.55, m], [1, b]]); ctx.fillRect(0, 0, W, H);
  space(h, now, dt, pushing); aurora(h, now); sun(h); earth(h);
  const gy = H * 0.86 + h * H * PX;
  mountains(H * 0.86 + h * H * PX * 0.35); hills(H * 0.86 + h * H * PX * 0.65, now);
  cirrus(h); clouds(h, 0, fast); balloon(h, now); birds(h, now); clouds(h, 1, fast);
  ground(gy, padX, k, now); smokeAt(gy, padX, k, now, lifting);
}
// Speed streaks: thin lines rushing down while the jets push, faster and longer as the climb speeds up (v: 0 to 1).
const streaks = Array.from({ length: 22 }, (_, i) => ({ x: hsh(i + 50), y: hsh(i + 70) }));
function speedLines(dt, v, h) {
  ctx.strokeStyle = h > 0.6 ? 'rgba(200,220,255,.5)' : 'rgba(255,255,255,.6)'; ctx.lineCap = 'round';
  for (const s of streaks) {
    s.y += dt * (0.0014 + v * 0.0034); if (s.y > 1.15) { s.y = -0.15; s.x = Math.random(); }
    ctx.globalAlpha = 0.3 + v * 0.35; ctx.lineWidth = 2 + v; ctx.beginPath(); ctx.moveTo(s.x * W, s.y * H); ctx.lineTo(s.x * W, s.y * H + H * (0.06 + v * 0.16)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// Where the Brainer is: on the pad until the jets light 2 s before the timer ends, then straight up to its hover spot
// under the multiplier in 2.2 s, then a gentle bob while the world streams past.
function hoverAt(tl, standY) {
  const p = clamp(tl / 2200, 0, 1), e = smooth(p);
  const bob = p >= 1 && !reduced ? Math.sin(tl / 650) * H * 0.012 : 0;
  return lerp(standY, H * (W < 600 ? 0.66 : 0.64), e) + bob;
}
function burst(x, y, L) {   // sparks flying off a new piece of gear
  const c = ['#ffd56b', '#ffffff', `rgb(${GLOW[jetOf(L)]})`];
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + Math.random() * 0.3, v = 0.25 + Math.random() * 0.35; view.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: performance.now(), c: c[i % 3] }); }
}
let gearT = 0;
function showGear(L, name) {   // the banner under the multiplier: "Level 5 · Hero cape"
  const el = $('#gearup'); el.textContent = `Level ${L} · ${name}`;
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(gearT); gearT = setTimeout(() => { el.hidden = true; }, 1700);
}
const REACTS = [{ face: 'star' }, { face: 'hearts' }, { face: 'joy' }, { visor: 'WOW' }, { visor: 'YES!' }, { visor: 'GO!' }, { visor: 'COOL' }];   // no flips: Tornike didn't like it spinning round (2026-10-27)
function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dt = Math.min(50, now - (view.last || now)); view.last = now;
  const goal = heightNow(now);
  view.alt = goal >= view.alt ? goal : view.alt + (goal - view.alt) * Math.min(1, dt * 0.005);   // between rounds it sinks back to the pad
  const size = clamp(Math.min(W, H) * 0.6, 120, 380), k = size / 280, X = W / 2;   // centred on every screen (Tornike, 2026-10-26)
  const lifting = R && (R.lit || R.phase !== 'bet'), pushing = lifting && R.phase !== 'end';
  const fast = R && R.phase === 'fly' ? clamp((speedAt(now - R.t0) - cfg.grow[0]) / (2 * cfg.grow[1] * 23), 0, 1) : 0;   // 0 at take-off, 1 by 10,000×
  world(now, dt, view.alt, X, k, fast, lifting, pushing);
  const gy = H * 0.86 + view.alt * H * PX, standY = gy - 88 * k;
  const o = { L: 1, gear: null, face: exNow(now), visor: '', thrust: 1, footL: 1, footR: 1, dim: false, glitch: false, batt: '', arrive: null, now };
  let Y = standY + (reduced ? 0 : Math.sin(now / 900) * 2), rot = 0, pop = 1, away = 0;
  if (!lifting) o.thrust = 0;
  else {
    Y = hoverAt((R.phase === 'end' ? R.endT0 : now) - R.liftT0, standY);
    if (R.phase === 'bet' || R.phase === 'starting') o.thrust = 0.6 + 0.4 * clamp((now - R.liftT0) / 600, 0, 1);   // the jets roar up on the pad
    else {
      o.L = suitOf(R.phase === 'end' ? R.crash : R.m); o.gear = gearAt(R.build, o.L);
      if (R.phase === 'fly' && o.L > view.suit) {   // a new piece: it arrives its own way, sparks, a banner, and the Brainer reacts
        const it = R.build[o.L - 1];
        view.suit = o.L; view.gearT0 = now; view.arrive = { it, style: pick(STYLES) }; view.react = pick(REACTS);
        sound.gear(); burst(X, Y, o.L); showGear(o.L, it.name);
      }
    }
    const gq = view.gearT0 ? (now - view.gearT0) / 550 : 1;
    if (gq < 1 && view.arrive) { o.arrive = { ...view.arrive, q: gq }; pop = 1 + 0.1 * Math.sin(Math.PI * clamp(gq * 1.3, 0, 1)); }
    const rq = view.gearT0 ? (now - view.gearT0) / 1200 : 1;
    if (rq < 1 && view.react) { if (view.react.visor) o.visor = view.react.visor; else o.face = view.react.face; }
    const sc = scareFx(now);
    Object.assign(o, { footL: sc.footL, footR: sc.footR, glitch: sc.glitch, batt: sc.batt }); o.thrust *= sc.thrust * (1 + 0.4 * fast);
    if (sc.face) { o.face = sc.face; o.visor = ''; }
    rot += sc.rot; Y += sc.dy * H;
    if (R.phase === 'end') {   // it flies away: full power, and up out of sight
      const a = (now - view.awayT0) / 1000; away = clamp(1 - a / 1.4, 0, 1);
      o.thrust = 1.6 + Math.min(a, 1); o.face = 'joy'; o.visor = ''; rot = 0;
      Y -= (a * a * 2.4 + a * 0.4) * H;
    }
    if (pushing && !reduced) speedLines(dt, fast, view.alt);
    if ((pushing && o.L >= 3) || away > 0) {   // exhaust trails under the feet; a bright streak behind it as it flies away
      const c = GLOW[jetOf(Math.max(o.L, away > 0 ? 4 : 0))], al = away > 0 ? 0.8 * away : 0.45, w = away > 0 ? 16 : 10;
      for (const dx of [-12, 12]) { const x = X + dx * k, y0 = Y + 120 * k, g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, `rgba(${c},${al})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(x - w / 2 * k, y0, w * k, Math.max(0, H - y0)); }
    }
    // wind streaks for the spin-out, smoke for the sputtering boot
    if (sc.wind > 0.05) { ctx.strokeStyle = `rgba(255,255,255,${0.7 * sc.wind})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { const yy = Y - size * 0.25 + i * size * 0.18, x0 = X - scare.side * size * (0.95 - i * 0.05); ctx.beginPath(); ctx.moveTo(x0 - size * 0.25, yy); ctx.quadraticCurveTo(x0, yy - 14, x0 + size * 0.2 * scare.side, yy + 4); ctx.stroke(); } }
    if (sc.smoke > 0.05) for (let i = 0; i < 4; i++) { const q = ((now - scare.t0) / 260 + i / 4) % 1; ctx.fillStyle = `rgba(190,196,214,${0.75 * sc.smoke * (1 - q)})`; ctx.beginPath(); ctx.arc(X + scare.side * size * 0.06 + Math.sin(i * 2.1) * 10, Y + size * 0.32 + q * size * 0.35, size * (0.03 + q * 0.06), 0, TAU); ctx.fill(); }
  }
  // the gear flash: a ring bursting from the Brainer as a piece lands
  const fq = view.gearT0 ? (now - view.gearT0) / 600 : 1;
  if (fq < 1) { ctx.strokeStyle = `rgba(255,213,107,${1 - fq})`; ctx.lineWidth = 8 * (1 - fq) + 1; ctx.beginPath(); ctx.arc(X, Y, size * (0.3 + fq * 0.6), 0, TAU); ctx.stroke(); }
  const shake = reduced ? 0 : fast * 3 * k;   // a rattle at top speed
  ctx.save(); ctx.translate(X + (hsh(Math.floor(now / 40)) - 0.5) * shake, Y + (hsh(Math.floor(now / 40) + 9) - 0.5) * shake); ctx.rotate(rot); ctx.scale(k * pop, k * pop); ctx.translate(-100, -140);
  drawBot(ctx, o);
  ctx.restore();
  clouds(view.alt, 2, fast);   // the near clouds pass in front of the Brainer
  view.sparks = view.sparks.filter(s => now - s.t0 < 800);
  for (const s of view.sparks) {
    const q = (now - s.t0) / 800, x = s.x + s.vx * (now - s.t0) * k, y = s.y + s.vy * (now - s.t0) * k, r = 5 * k * (1 - q);
    ctx.globalAlpha = 1 - q; ctx.fillStyle = s.c; ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.6, y); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.6, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - r * 2, y); ctx.lineTo(x, y + r * 0.6); ctx.lineTo(x + r * 2, y); ctx.lineTo(x, y - r * 0.6); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // wins float up from the Brainer
  view.wins = view.wins.filter(w => now - w.t0 < 1400);
  view.wins.forEach((w, i) => {
    const q = (now - w.t0) / 1400, ty = Math.max(60, Y - size * 0.62) - q * 60 - i * 26; ctx.globalAlpha = 1 - q; ctx.font = '800 22px FiraGO, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,19,34,.55)'; ctx.strokeText(w.text, X, ty); ctx.fillStyle = '#7dffcf'; ctx.fillText(w.text, X, ty);
    ctx.globalAlpha = 1;
  });
}

/* ---------- readout, history and the bet panels ---------- */
const sayEl = Object.assign(document.createElement('span'), { className: 'sr' }); sayEl.setAttribute('aria-live', 'polite');
sayEl.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap'; stage.appendChild(sayEl);
function say(text) { sayEl.textContent = text; }   // the phase changes, read out once each (the multiplier itself is not)
let lastRO = '';
function renderReadout(force) {
  const now = performance.now(), lab = $('#label'), mult = $('#mult'), wait = $('#wait');
  let key, l = '', m = '', cls = 'mult', w = false;
  if (!R) { key = 'none'; }
  else if (R.phase === 'bet' || R.phase === 'starting') { const left = Math.max(0, cfg.waitMs - (now - R.waitT0)); l = R.phase === 'starting' ? 'Take-off' : 'Place your bets'; m = R.phase === 'starting' ? '' : (left / 1000).toFixed(1) + 's'; cls = 'mult idle'; w = true; key = 'b' + m; $('#waitBar').style.transform = `scaleX(${left / cfg.waitMs})`; }
  else if (R.phase === 'fly') { m = fx(R.m); key = 'f' + m; }
  else { l = 'Flew away!'; m = fx(R.crash); cls = 'mult flew'; key = 'e' + m; }
  if (!force && key === lastRO) return; lastRO = key;
  lab.textContent = l; lab.hidden = !l; mult.textContent = m; mult.className = cls; wait.hidden = !w;
}
function histCls(c) { return c >= 10 ? 'hi' : c >= 2 ? 'mid' : ''; }
function renderHist() {
  $('#hist').innerHTML = rounds.slice(0, 20).map((r, k) => `<button type="button" class="${histCls(r.crash)}${r.forced ? ' test' : ''}" data-k="${k}" aria-label="Round ${r.nonce}: flew away at ${fx(r.crash)}${r.forced ? ', a test round' : ''}. Check it.">${fx(r.crash)}</button>`).join('');
}
function panelHTML(b) {
  const n = b.i + 1;
  return `<div class="bet" id="b${b.i}" data-i="${b.i}">
    <div class="tabs" role="tablist" aria-label="Bet ${n}"><button type="button" role="tab" data-act="tab" data-tab="bet" aria-selected="true">Bet</button><button type="button" role="tab" data-act="tab" data-tab="auto" aria-selected="false">Auto</button></div>
    <div class="bet-main">
      <div class="bet-left">
        <div class="bet-row"><button type="button" class="step" data-act="dec" aria-label="Lower bet ${n}">−</button><span class="money-in"><span aria-hidden="true">$</span><input type="number" inputmode="decimal" step="0.1" data-act="amt" aria-label="Bet ${n}, USD"></span><button type="button" class="step" data-act="inc" aria-label="Raise bet ${n}">+</button></div>
        <div class="chips">${[1, 2, 5, 10].map(v => `<button type="button" data-act="chip" data-v="${v}" aria-label="Bet ${n}: ${money(v)}">${v}</button>`).join('')}</div>
      </div>
      <button type="button" class="big act" data-act="go"><span class="l1"></span><span class="l2"></span><span class="l3"></span></button>
    </div>
    <div class="auto-row" hidden>
      <label class="sw"><input type="checkbox" data-act="autobet"> Auto bet</label>
      <label class="sw"><input type="checkbox" data-act="autoco"> Auto cash out at</label>
      <span class="xin"><input type="number" inputmode="decimal" step="0.01" min="1.01" data-act="cox" aria-label="Bet ${n}: auto cash out at this multiplier"><span aria-hidden="true">×</span></span>
    </div>
  </div>`;
}
$('#bets').innerHTML = bets.map(panelHTML).join('');
function renderBets() {
  for (const b of bets) {
    const el = $('#b' + b.i), go = el.querySelector('[data-act=go]'), lock = b.st === 'placed' || b.st === 'live' || b.st === 'queued';
    let cls, l1, l2 = money(b.stake), l3 = '';
    if (b.st === 'live') { cls = 'cash'; l1 = 'Cash out'; l2 = money(payOf(b.stake, R ? R.m : 1)); }
    else if (b.st === 'placed') { cls = 'cancel'; l1 = 'Cancel'; l3 = R && R.phase === 'starting' ? 'taking off…' : ''; }
    else if (b.st === 'queued') { cls = 'cancel'; l1 = 'Cancel'; l3 = 'waiting for next round'; }
    else { cls = 'bet-go'; l1 = 'Bet'; l3 = b.st === 'cashed' ? `won ${money(b.payout)} at ${fx(b.at)}` : R && R.phase !== 'bet' ? 'for the next round' : ''; }
    go.className = 'big act ' + cls; go.querySelector('.l1').textContent = l1; go.querySelector('.l2').textContent = l2; go.querySelector('.l3').textContent = l3;
    go.setAttribute('aria-disabled', String(b.st === 'placed' && R && R.phase === 'starting'));
    el.classList.toggle('on', lock);
    el.querySelectorAll('[data-act=dec],[data-act=inc],[data-act=chip],[data-act=amt]').forEach(x => { x.disabled = lock; });
    const amt = el.querySelector('[data-act=amt]'); if (document.activeElement !== amt) amt.value = b.stake.toFixed(2);
    const cox = el.querySelector('[data-act=cox]'); if (document.activeElement !== cox) cox.value = b.coX.toFixed(2);
    el.querySelector('[data-act=autobet]').checked = b.autoBet; el.querySelector('[data-act=autoco]').checked = b.autoCo;
    el.querySelectorAll('[data-act=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === b.tab)));
    el.querySelector('.auto-row').hidden = b.tab !== 'auto';
  }
}
let lastCash = '';
function renderCash() {   // the live Cash out amounts, every frame they change
  const k = bets.map(b => b.st === 'live' ? payOf(b.stake, R.m) : '').join('|');
  if (k === lastCash) return; lastCash = k;
  for (const b of bets) if (b.st === 'live') $('#b' + b.i).querySelector('.l2').textContent = money(payOf(b.stake, R.m));
}
function act(b) {   // the panel's big button
  if (!booted || sheetOpen()) return;
  if (b.st === 'live') { if (flying()) cashOut(b, R.m); return; }
  if (b.st === 'placed') { if (R.phase !== 'bet') return; S.balance = cents(S.balance + b.stake); b.st = 'idle'; b.autoBet = false; renderBalance(); renderBets(); return; }
  if (b.st === 'queued') { b.st = 'idle'; b.autoBet = false; renderBets(); return; }
  if (b.stake < cfg.minBet || b.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)}.`); return; }
  if (R && R.phase === 'bet') { if (place(b)) sound.place(); }
  else { if (b.stake > S.balance) { toast('Not enough demo balance for this bet. Lower it or press Reset.'); return; } b.st = 'queued'; sound.place(); }
  renderBets();
}
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
$('#bets').addEventListener('click', e => {
  const x = e.target.closest('[data-act]'), el = e.target.closest('.bet'); if (!x || !el) return;
  const b = bets[+el.dataset.i], a = x.dataset.act;
  if (a === 'go') act(b);
  else if (a === 'tab') { b.tab = x.dataset.tab; renderBets(); }
  else if (a === 'dec' || a === 'inc') { b.stake = clampStake(b.stake + (a === 'inc' ? 1 : -1) * (b.stake >= 10 ? 1 : b.stake >= 1 ? 0.5 : 0.1)); renderBets(); }
  else if (a === 'chip') { b.stake = clampStake(+x.dataset.v); renderBets(); }
});
$('#bets').addEventListener('change', e => {
  const x = e.target.closest('[data-act]'), el = e.target.closest('.bet'); if (!x || !el) return;
  const b = bets[+el.dataset.i], a = x.dataset.act;
  if (a === 'amt') b.stake = clampStake(parseFloat(x.value));
  else if (a === 'cox') b.coX = clamp(Math.floor((parseFloat(x.value) || 2) * 100) / 100, 1.01, cfg.maxMult);
  else if (a === 'autobet') { b.autoBet = x.checked; if (b.autoBet && b.st === 'idle') act(b); }
  else if (a === 'autoco') b.autoCo = x.checked;
  renderBets();
});
function renderBalance() { $('#balance').textContent = money(S.balance); $('.hud').classList.toggle('long', S.balance >= 1e5); }   // six figures and up: a phone's top bar tightens (style.css)
function renderSound() { const b = $('#sound'); b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', sound.on ? 'Sound on, tap to mute' : 'Sound off, tap to unmute'); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- provably fair: the next round's commit, and any recent round revealed and re-checked ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);   // client seeds are the player's own text
const kv = (k, v) => `<div class="kv"><span>${k}</span><code>${esc(v)}</code></div>`;
const locked = () => R && R.phase !== 'bet';   // the client seed can change only while bets are open; it is fixed at take-off
function renderFair() {
  const off = locked() ? ' disabled' : '', nextHash = !R || R.phase === 'bet' ? (R ? R.hash : S.hash) : S.hash;
  let h = `<h4>${R && R.phase === 'bet' ? 'This round, before take-off' : 'Your next round'}</h4>${kv('Server seed hash', nextHash)}`
    + `<div class="kv"><label for="seedIn">Your client seed</label><div class="seed-row"><input id="seedIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="seedMsg"${off}><button type="button" id="seedNew"${off}>New random</button></div><p class="seed-msg" id="seedMsg" aria-live="polite"></p></div>`
    + `<p class="sheet-note">${locked() ? 'This round has taken off with your client seed. You can change it once the next round opens for bets.' : 'This hash is fixed now, before you set your client seed. A new client seed applies from the next take-off and is kept for this visit only.'}</p>`;
  if (rounds.length) {
    const r = shown && rounds.includes(shown) ? shown : rounds[0]; shown = r;
    h += `<h4>Recent rounds</h4><div class="rounds">${rounds.slice(0, 12).map(x => `<button type="button" data-n="${x.nonce}" aria-pressed="${x === r}">${fx(x.crash)}</button>`).join('')}</div>`
      + `<h4>Round ${r.nonce}: flew away at ${fx(r.crash)}${r.mine.length ? ` · ${r.mine.map(m => m.st === 'cashed' ? `bet ${m.i + 1} cashed out at ${fx(m.at)}` : `bet ${m.i + 1} lost`).join(', ')}` : ''}</h4>`
      + (r.forced ? `<p class="sheet-note">Test round: the fly-away point was set by hand to ${fx(r.crash)}. The seeds give ${fx(r.seedCrash)}.</p>` : '')
      + `${kv('Server seed hash', r.hash)}${kv('Server seed, revealed', r.seed)}${kv('Client seed', r.client)}${kv('Nonce', r.nonce)}`
      + '<button type="button" class="big ghost" id="fairCheck">Check this round</button><div id="fairOut" aria-live="polite"></div>';
  }
  $('#fairBody').innerHTML = h; $('#seedIn').value = locked() && R.client ? R.client : S.client;
}
function setClient(v) {   // the player's client seed: 1–64 characters (code points, as in Plane Crash), trimmed; anything else keeps the last valid one
  const s = v.trim(), n = [...s].length, ok = n >= 1 && n <= 64;
  if (ok && !locked()) S.client = s;
  $('#seedIn').setAttribute('aria-invalid', String(!ok));
  $('#seedMsg').textContent = ok ? '' : `Use 1 to 64 characters${n ? ` (this is ${n})` : ''}. Your last valid seed stays in use.`;
  return ok;
}
async function checkFair() {
  const r = shown; if (!r) return;
  const hashOk = (await sha256(r.seed)) === r.hash, c = await crashOf(r.seed, r.client, r.nonce), crashOk = c === (r.forced ? r.seedCrash : r.crash);
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before take-off' : 'The seed does not match the hash')
    + ok(crashOk, crashOk ? `Recomputed from the seeds, it flies away at ${fx(c)}, as ${r.forced ? 'the seeds gave (this test round was set by hand)' : 'it did'}` : `Recomputed: ${fx(c)}, but it flew away at ${fx(r.crash)}`);
}

/* ---------- leaderboard: demo players, with your own real results merged in ---------- */
// The demo has no server, so the other players are made up (Tornike, 2026-10-26) and the board says "Demo data". It is
// drawn from a seed per day, month and year, so it stays put through each; your own bets are real, kept on this device,
// and join the board when they rank.
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const seedOf = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const HANDLES = ['g***2', 'n***a', 'l***o', 'd***7', 'b***r', 's***1', 'm***e', 't***9', 'k***i', 'a***5', 'z***3', 'o***y', 'r***8', 'e***x', 'p***4', 'v***6', 'i***u', 'c***0', 'h***t', 'j***w', 'q***m', 'u***k'];
const STAKES = [0.5, 1, 1, 2, 2, 5, 5, 10, 10, 20, 50, 100, 200];
const SPAN = { day: [40, 900], month: [150, 4000], year: [600, 10000] };   // the cash-out multipliers each board reaches
const periodStart = p => { const d = new Date(); return p === 'day' ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : p === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1).getTime() : new Date(d.getFullYear(), 0, 1).getTime(); };
function demoRows(period) {
  const d = new Date(), key = period === 'day' ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : period === 'month' ? `${d.getFullYear()}-${d.getMonth()}` : `${d.getFullYear()}`;
  const rnd = mulberry(seedOf('fly-high:' + key)), [lo, hi] = SPAN[period], t0 = periodStart(period), now = Date.now(), rows = [];
  for (let i = 0; i < 60; i++) {
    const at = Math.floor(Math.min(cfg.maxMult, lo * Math.pow(hi / lo, Math.pow(rnd(), 1.8))) * 100) / 100;   // many near the low end, a few near the top
    const stake = STAKES[Math.floor(rnd() * STAKES.length)];
    rows.push({ name: HANDLES[Math.floor(rnd() * HANDLES.length)], stage: 1 + Math.floor(rnd() * 10), stake, at, win: payOf(stake, at), crash: Math.floor(at * (1 + rnd() * 0.6) * 100) / 100, t: t0 + rnd() * (now - t0) });
  }
  return rows;
}
const myBets = (() => { try { return JSON.parse(store.get('brainer.fh.bets', '[]')) || []; } catch (e) { return []; } })();   // your last 50 bets
function recordBet(b, crash) { myBets.unshift({ t: Date.now(), stake: b.stake, at: b.st === 'cashed' ? b.at : null, win: b.st === 'cashed' ? b.payout : 0, crash }); myBets.length = Math.min(myBets.length, 50); store.set('brainer.fh.bets', JSON.stringify(myBets)); }
const board = { tab: 'huge', period: 'day' };
const when = (t, period) => new Date(t).toLocaleString('en-GB', period === 'day' ? { hour: '2-digit', minute: '2-digit' } : period === 'month' ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' });
function renderBoard() {
  const { tab, period } = board, t0 = periodStart(period), me = stageOf(myLevel());
  document.querySelectorAll('.top-tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === tab)));
  document.querySelectorAll('#periods button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.p === period)));
  $('#periods').hidden = tab === 'mine';
  const row = (k, img, name, sub, amt, amtSub, cls = '') => `<li class="${cls}"><span class="rk">${k}</span><img src="assets/brainer-${img}.png" alt=""><span class="who"><b>${esc(name)}</b><span>${sub}</span></span><span class="amt${cls.includes('lost') ? ' lost' : ''}"><b>${amt}</b><span>${amtSub}</span></span></li>`;
  let rows;
  if (tab === 'mine') {
    rows = myBets.length ? myBets.map((m, i) => row(i + 1, me, when(m.t, 'month'), `Bet ${money(m.stake)} · flew away at ${fx(m.crash)}`, m.at ? money(m.win) : 'Lost', m.at ? `at ${fx(m.at)}` : `bet ${money(m.stake)}`, m.at ? '' : 'lost')).join('') : '<li class="empty">No bets yet. Your bets show here once a round ends.</li>';
    $('#boardNote').textContent = 'Your last 50 bets, kept on this device only.';
  } else {
    let list = demoRows(period).map(r => ({ ...r, you: false }));
    const mine = myBets.filter(m => m.at && m.t >= t0).map(m => ({ name: 'You', stage: me, stake: m.stake, at: m.at, win: m.win, crash: m.crash, t: m.t, you: true }));
    if (tab === 'rounds') {
      list = list.concat(rounds.map(r => ({ name: `Round ${r.nonce}`, stage: me, crash: r.crash, t: Date.now(), you: true, round: true }))).sort((a, b) => b.crash - a.crash).slice(0, 20);
      rows = list.map((r, i) => row(i + 1, r.stage, r.round ? `${r.name}, this visit` : `Round ${(Math.floor(r.t / 1000) % 900000 + 100000)}`, when(r.t, period), fx(r.crash), 'flew away', r.you ? 'you' : '')).join('');
    } else {
      list = list.concat(mine).sort((a, b) => tab === 'huge' ? b.at - a.at : b.win - a.win || b.at - a.at).slice(0, 20);
      rows = list.map((r, i) => row(i + 1, r.stage, r.name, `${when(r.t, period)} · Bet ${money(r.stake)}`, money(r.win), `at ${fx(r.at)}`, r.you ? 'you' : '')).join('');
    }
    $('#boardNote').textContent = 'Demo data: the other players are made up for this demo. Your own results are real and join the board when they rank.';
  }
  $('#board').innerHTML = rows;
}

/* ---------- sheets: fairness, how to play, and the leaderboard (a side panel on wide screens) ---------- */
// From 1100 px the leaderboard stands in its own column beside the game, as Aviator's does; narrower, it opens as a sheet.
const wideQ = matchMedia('(min-width:1100px)');
function syncSide() {
  const el = $('#topSheet');
  if (wideQ.matches) { el.hidden = false; el.setAttribute('role', 'complementary'); el.removeAttribute('aria-modal'); renderBoard(); }
  else { el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); }
}
wideQ.addEventListener('change', syncSide);
const topModal = () => !$('#topSheet').hidden && !wideQ.matches;
const sheetOpen = () => !$('#tutorial').hidden || !$('#agegate').hidden || !$('#fairSheet').hidden || topModal();
let lastFocus = null;
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; const f = $(id).querySelector('button[aria-pressed=true], button'); if (f) f.focus({ preventScroll: true }); }   // no scroll: inside the website's frame it would scroll the parent page
function closeSheet(id) { $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
$('#help').addEventListener('click', () => openSheet('#tutorial'));
$('#top').addEventListener('click', () => { renderBoard(); openSheet('#topSheet'); });
$('#topClose').addEventListener('click', () => closeSheet('#topSheet'));
document.querySelector('.top-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { board.tab = b.dataset.t; renderBoard(); } });
$('#periods').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) { board.period = b.dataset.p; renderBoard(); } });
$('#fair').addEventListener('click', () => { shown = rounds[0] || null; renderFair(); openSheet('#fairSheet'); });
$('#hist').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; shown = rounds[+b.dataset.k]; renderFair(); openSheet('#fairSheet'); });
$('#fairClose').addEventListener('click', () => closeSheet('#fairSheet'));
$('#fairBody').addEventListener('click', e => {
  if (e.target.closest('#fairCheck')) checkFair();
  const rb = e.target.closest('.rounds button[data-n]'); if (rb) { shown = rounds.find(x => x.nonce === +rb.dataset.n); renderFair(); const f = $(`.rounds button[data-n="${rb.dataset.n}"]`); if (f) f.focus({ preventScroll: true }); }
  if (e.target.closest('#seedNew') && !locked()) { $('#seedIn').value = randHex(8); setClient($('#seedIn').value); }
});
$('#fairBody').addEventListener('input', e => { if (e.target.id === 'seedIn') setClient(e.target.value); });
$('#fairBody').addEventListener('change', e => { if (e.target.id === 'seedIn' && setClient(e.target.value)) e.target.value = S.client; });   // an accepted seed shows as it is used, trimmed
$('#tutGo').addEventListener('click', () => { store.set('brainer.fh.tutorial', 'seen'); closeSheet('#tutorial'); });
// 18+ check, shared with the website (same key), so a visitor who confirmed there is not asked again
$('#ageYes').addEventListener('click', () => { store.set('brainer.age-ok', '1'); closeSheet('#agegate'); if (store.get('brainer.fh.tutorial', '') !== 'seen') openSheet('#tutorial'); });
$('#ageNo').addEventListener('click', () => { $('#ageSorry').hidden = false; $('.age-actions').hidden = true; });
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s && s.id !== 'agegate' && (s.id !== 'topSheet' || topModal())) { if (s.id === 'tutorial') store.set('brainer.fh.tutorial', 'seen'); closeSheet('#' + s.id); } }));
$('#sound').addEventListener('click', () => { sound.toggle(); renderSound(); });
$('#refill').addEventListener('click', () => { if (bets.some(b => b.st === 'placed' || b.st === 'live')) { toast('Finish this round first.'); return; } S.balance = cfg.startBalance; renderBalance(); toast(`Demo balance reset to ${money(cfg.startBalance)}.`); });
let ptrFocus = false;   // focus last moved by a click (Chrome focuses clicked buttons), not by Tab
document.addEventListener('pointerdown', () => { ptrFocus = true; }, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {   // Tab stays inside the open sheet (the last one in the page is on top)
    ptrFocus = false;
    const s = [...document.querySelectorAll('.sheet')].filter(x => !x.hidden && (x.id !== 'topSheet' || topModal())).pop();
    if (s) { const f = [...s.querySelectorAll('button, input')].filter(b => !b.disabled && b.getClientRects().length), i = f.indexOf(document.activeElement); if (!f.length) e.preventDefault(); else if (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus({ preventScroll: true }); } }
    return;
  }
  if (e.key === 'Escape') { for (const id of ['#fairSheet', '#topSheet', '#tutorial']) if (!$(id).hidden && (id !== '#topSheet' || topModal())) { if (id === '#tutorial') store.set('brainer.fh.tutorial', 'seen'); closeSheet(id); } return; }
  if (!booted) { if (e.code === 'Space') e.preventDefault(); return; }   // no game keys under the intro (the 18+ check comes first)
  if (sheetOpen() || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || e.code !== 'Space' || (tag === 'BUTTON' && !ptrFocus)) return;   // a button reached with Tab takes Space itself
  e.preventDefault(); act(bets[0]);
});

/* ---------- test flights: set the fly-away point by hand ---------- */
// For testing the demo (Tornike, 2026-10-26): a field under the bets sets where it flies away, and Max flight sets
// 10,000×. While a point is set, every round from the next take-off flies away there instead of at its seeded point,
// and is marked as a test round in the history and the fairness check.
{
  const box = $('#test'), inp = $('#forceIn');
  const setForce = () => {
    const v = parseFloat(inp.value);
    S.force = Number.isFinite(v) && v >= 1 ? clamp(Math.floor(v * 100 + 1e-7) / 100, 1, cfg.maxMult) : 0;
    inp.value = S.force ? S.force.toFixed(2) : ''; box.classList.toggle('on', !!S.force);
    if (S.force) toast(`Test flight: from the next take-off it flies away at ${fx(S.force)}.`);
  };
  inp.addEventListener('change', setForce);
  $('#forceMax').addEventListener('click', () => { inp.value = String(cfg.maxMult); setForce(); });
  $('#forceClear').addEventListener('click', () => { inp.value = ''; setForce(); });
}

/* ---------- loop and boot ---------- */
function loop(now) {
  if (W && H) { tick(now); draw(now); renderReadout(); if (flying()) renderCash(); }
  requestAnimationFrame(loop);
}
S.client = randHex(8);
rotateSeed().catch(() => {});   // without crypto.subtle (plain http) the round says why instead
layout(); renderBalance(); renderBets(); renderSound(); renderHist(); renderReadout(true); syncSide();
const bootT = performance.now();
function loadProgress() {   // the fonts (the world is drawn, nothing else to load); a slow network never holds the player past 9 s
  if (performance.now() - bootT > 9000) return 1;
  return !document.fonts || document.fonts.status === 'loaded' ? 1 : 0;
}
function introActor(g, w, h, now, ex) {   // the intro's actor: the Iron Brainer hovering on its jets, suit level 1
  const k = Math.min(w, h) / 330;
  g.save(); g.translate(w / 2, h / 2 + (reduced ? 0 : Math.sin(now / 520) * 8 * k)); g.scale(k, k); g.translate(-100, -130);
  drawBot(g, { L: 1, face: ex === 'wink' || ex === 'happy' ? 'happy' : 'smile', thrust: 1, footL: 1, footR: 1, dim: false, glitch: false, batt: '', now });
  g.restore();
  return true;
}
$('.brand .t1').innerHTML = window.BrainerIntro ? window.BrainerIntro.wordmark('fly') : 'Fly High';
(window.BrainerIntro ? window.BrainerIntro.start({ title: 'Fly High', mark: 'fly', theme: 'plane', what: 'the jets', actor: introActor, progress: loadProgress }) : Promise.resolve()).then(() => {
  booted = true;
  if (store.get('brainer.age-ok', store.get('blink.age-ok', '')) !== '1') openSheet('#agegate');
  else if (store.get('brainer.fh.tutorial', '') !== 'seen') openSheet('#tutorial');
  (commit || rotateSeed()).then(openRound, () => toast(isSecureContext ? 'Could not start the rounds. Reload to try again.' : 'This demo needs https (or localhost) to draw its rounds.'));
});
requestAnimationFrame(loop);
})();
