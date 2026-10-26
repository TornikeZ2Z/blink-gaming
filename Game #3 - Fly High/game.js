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
// hand and foot jets, and the multiplier climbs until the battery runs out at a point fixed before take-off; then a
// parachute brings the Brainer down. A bet cashed out at x pays x, so with the power-out point 0.98 ÷ (1 − u)
// (u uniform, rounded down to the cent) every cash-out point returns 98% before rounding down and the $10,000 max win,
// which lower it in some rounds: "RTP up to 98%".
const cfg = {
  rtp: 98, minBet: 0.1, maxBet: 200, maxWin: 10000, maxMult: 10000, startBalance: 1000,
  waitMs: 6000, endMs: 3200, rate: 0.09,   // the multiplier is e^(rate × seconds): 2× after 7.7 s, 10× after 26 s
  brain: { perRound: 10 }   // each round you play adds the same brain cells, whatever you bet (Marketing's rule)
};
const multAt = t => Math.floor(Math.exp(cfg.rate * Math.max(0, t) / 1000) * 100 + 1e-7) / 100;   // t ms after take-off, rounded down to the cent
const payOf = (stake, m) => Math.min(Math.floor(stake * m * 100 + 1e-6) / 100, cfg.maxWin);
const CELLS = (() => { const c = [0, 0]; for (let n = 1; n < 100; n++) c.push(c[n] + Math.round(10 + 8 * Math.pow(n, 1.4))); return c; })();
const brainLevel = cells => { let L = 1; while (L < 100 && cells >= CELLS[L + 1]) L++; return L; };
const stageOf = L => Math.ceil(L / 10);

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, nonce: 1, client: '', seed: '', hash: '', cells: Math.max(0, parseFloat(store.get('brainer.xp', '0')) || 0) };   // brain cells, shared by every Brainer game on this site
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
// Synthesised with Web Audio, so there are no files to load. Starts on the first tap; the HUD button mutes it.
const sound = (() => {
  let ac = null, on = store.get('brainer.sound', 'on') !== 'off';
  const ctxA = () => {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  const tone = (f0, f1, dur, type, vol, delay) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  const noise = (dur, vol, f0, f1, delay) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t);
  };
  return {
    get on() { return on; },
    toggle() { on = !on; store.set('brainer.sound', on ? 'on' : 'off'); if (on) ctxA(); return on; },
    place() { tone(520, 780, 0.1, 'triangle', 0.09); },
    takeoff() { noise(0.9, 0.1, 500, 2800); tone(120, 260, 0.8, 'sawtooth', 0.025); },
    cash() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0, 0.16, 'triangle', 0.09, i * 0.06)); },
    away() { tone(520, 60, 1.0, 'sawtooth', 0.04); noise(0.5, 0.1, 1200, 200); noise(0.25, 0.14, 2400, 500, 1.0); },   // the power dies, then the parachute pops
    gear() { tone(220, 0, 0.08, 'square', 0.05); tone(880, 1320, 0.18, 'triangle', 0.08, 0.06); },   // a piece of gear clanks on
    sputter() { noise(0.5, 0.12, 1200, 200); tone(180, 60, 0.3, 'square', 0.03); },
    glitch() { noise(0.25, 0.08, 6000, 3000); tone(1400, 300, 0.15, 'square', 0.02); },
    dip() { tone(400, 120, 0.35, 'sawtooth', 0.03); tone(120, 400, 0.3, 'sawtooth', 0.03, 0.55); },
    spin() { noise(0.7, 0.08, 800, 2400); }
  };
})();

/* ---------- the round ---------- */
function openRound() {   // betting opens on the seed committed (and hashed) at the end of the last round
  R = { nonce: S.nonce++, seed: S.seed, hash: S.hash, phase: 'bet', waitT0: performance.now(), m: 1 };
  for (const b of bets) {
    if (b.st === 'cashed' || b.st === 'lost') b.st = 'idle';
    if (b.st === 'queued' || (b.st === 'idle' && b.autoBet)) place(b);
  }
  view.suit = 1; view.gearT0 = 0; scare.kind = ''; say('Betting is open. Take-off in 6 seconds.');
  renderBets(); renderReadout(true); if (!$('#fairSheet').hidden) renderFair();
}
async function takeOff() {
  R.phase = 'starting'; R.client = S.client;   // the client seed in effect at take-off is the one this round uses
  try { R.crash = await crashOf(R.seed, R.client, R.nonce); }
  catch (e) { toast(isSecureContext ? 'Could not start the round. Reload to try again.' : 'This demo needs https (or localhost) to draw its rounds.'); return; }
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
  rounds.unshift({ nonce: R.nonce, seed: R.seed, hash: R.hash, client: R.client, crash: R.crash, mine: bets.filter(b => b.st === 'lost' || b.st === 'cashed').map(b => ({ i: b.i, stake: b.stake, st: b.st, at: b.at, payout: b.payout })) });
  rounds.length = Math.min(rounds.length, 30);
  for (const b of bets) if (b.st === 'lost' || b.st === 'cashed') recordBet(b, R.crash);   // for My bets and the board
  if (played) earnCells(cfg.brain.perRound);
  sound.away(); say(`Power out at ${fx(R.crash)}.`);
  rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); });   // the next round's commit, before its betting opens
  renderHist(); renderBets(); if (!$('#fairSheet').hidden) renderFair(); if (!$('#topSheet').hidden) renderBoard();
}
function tick(now) {
  if (!R) return;
  if (R.phase === 'bet' && now - R.waitT0 >= cfg.waitMs) takeOff();
  else if (R.phase === 'fly') {
    const m = multAt(now - R.t0);
    for (const b of bets) {   // auto cash-outs and the max win first: the multiplier passed them before the power went
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
  if (!R || R.phase === 'bet' || R.phase === 'starting') return 'rest';
  if (R.phase === 'end') return 'sleep';
  return R.m < 2 ? 'focus' : 'happy';
}

/* ---------- the Iron Brainer: the design board's option A, "Gear up", drawn in 2D ---------- */
// Every round starts from the same bare Brainer at suit level 1; gear bolts on as the multiplier passes each level's
// mark. Robot space is the board's 200 × 280 frame; feet at y 220, head top at 36.
const SUIT = [
  { at: 1, name: 'Hand and foot jets' }, { at: 1.5, name: 'Shoulder pads' }, { at: 2, name: 'Back rockets' }, { at: 3, name: 'Wrist rockets' }, { at: 5, name: 'Wings' },
  { at: 10, name: 'Head fin' }, { at: 25, name: 'Leg boosters' }, { at: 50, name: 'Big rockets' }, { at: 100, name: 'Gold trim' }, { at: 1000, name: 'Energy aura' }
];
const suitOf = m => { let L = 1; while (L < SUIT.length && m >= SUIT[L].at) L++; return L; };
const C = { white: '#ffffff', edge: '#c9d2ea', cyan: '#2e9bea', blue: '#3550f0', led: '#d6e4ff', gold: '#f2b53a', pod: '#eef1fa', steel: '#7a84a8' };
const P2 = s => new Path2D(s);
function rr(g, x, y, w, h, r, fill, stroke, lw) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw || 2; g.strokeStyle = stroke; g.stroke(); }
}
function seg(g, x1, y1, x2, y2, w, col) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = col; g.stroke(); }
function dot(g, x, y, r, col) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
const FLAME = [P2('M-8 0 Q-11 22 0 46 Q11 22 8 0 Z'), P2('M-5 0 Q-7 16 0 32 Q7 16 5 0 Z'), P2('M-2.5 0 Q-3.5 9 0 18 Q3.5 9 2.5 0 Z')];
const FLAME_C = { o: ['#ff8a1f', '#ffc93c', '#fff6d6'], b: ['#3b8bff', '#8ec5ff', '#ffffff'] };
function flame(g, x, y, s, rot, col, now, seed) {
  if (s <= 0.02) return;
  const j = reduced ? 1 : 0.82 + 0.36 * hsh(Math.floor(now / 45) * 7 + seed);   // a flicker, new every 45 ms
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s * j);
  FLAME.forEach((p, i) => { g.fillStyle = FLAME_C[col][i]; g.fill(p); }); g.restore();
}
// the LED faces, as dot lists on the visor (the board's faces, built the same way)
const arcD = (cx, cy, R, a0, a1, n) => Array.from({ length: n }, (_, i) => { const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
const ringD = (cx, cy, R, n) => Array.from({ length: n }, (_, i) => [cx + R * Math.cos(i / n * Math.PI * 2), cy + R * Math.sin(i / n * Math.PI * 2)]);
const lineD = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);
const FACES = {
  rest: [...lineD(72, 80, 88, 80, 4), ...lineD(112, 80, 128, 80, 4), ...arcD(100, 88, 10, 30, 150, 5)],
  focus: [...lineD(70, 72, 90, 78, 4), ...lineD(110, 78, 130, 72, 4), [80, 82], [120, 82], ...lineD(88, 97, 112, 97, 5)],
  happy: [...arcD(80, 82, 10, 200, 340, 5), ...arcD(120, 82, 10, 200, 340, 5), ...arcD(100, 86, 14, 25, 155, 7)],
  wink: [...arcD(80, 82, 10, 200, 340, 5), ...lineD(111, 80, 129, 80, 4), ...arcD(100, 86, 14, 25, 155, 7)],
  shock: [...ringD(80, 74, 8, 9), ...ringD(120, 74, 8, 9), ...ringD(100, 97, 5, 7)],
  glitch: [...ringD(80, 76, 8, 9), ...lineD(110, 70, 130, 82, 5), ...lineD(110, 82, 130, 70, 5), ...lineD(86, 98, 114, 98, 5)],
  sleep: [...lineD(71, 80, 89, 80, 4), ...lineD(111, 80, 129, 80, 4), ...arcD(100, 90, 8, 30, 150, 4)]
};
// gear for one side; drawn again mirrored for the other
function sideBack(g, L, o, now, sd) {
  if (L >= 8) {   // big rockets
    flame(g, 15, 147, 1.1 * o.thrust, 0, 'o', now, 11 + sd);
    g.fillStyle = C.blue; g.fill(P2('M4 128 L-6 146 L4 142 Z')); g.fill(P2('M26 128 L36 146 L26 142 Z'));
    rr(g, 4, 66, 22, 76, 9, C.pod, C.edge); g.fillStyle = '#ff8a1f'; g.fill(P2('M4 76 Q15 40 26 76 Z')); rr(g, 7, 140, 16, 7, 2, C.steel);
  }
  if (L >= 5) { g.fillStyle = C.blue; g.fill(P2('M72 146 L14 168 L20 178 L72 162 Z')); }   // wings
  if (L >= 3) {   // back rockets
    flame(g, 37, 164, 0.7 * o.thrust, 0, 'o', now, 21 + sd);
    rr(g, 30, 112, 14, 46, 6, C.pod, C.edge); g.fillStyle = C.blue; g.fill(P2('M30 118 Q37 96 44 118 Z')); rr(g, 32, 156, 10, 6, 2, C.steel);
    seg(g, 44, 128, 68, 132, 4, C.edge);   // its strap to the back
  }
  if (L >= 7) flame(g, 70.5, 211, 0.55 * o.thrust, 0, 'o', now, 31 + sd);   // leg boosters' flames
  const col = L >= 2 ? 'o' : 'b', fs = (L >= 2 ? 0.85 + L * 0.05 : 0.75) * (L >= 10 ? 1.3 : 1);
  flame(g, 88, 219, fs * o.thrust * (sd ? o.footR : o.footL), 0, col, now, 41 + sd);   // foot jet
  flame(g, 46, 191, (L >= 2 ? 0.8 : 0.6) * o.thrust, 18 * Math.PI / 180, col, now, 51 + sd);   // hand jet, angled out
}
function sideBody(g, L, acc) {
  rr(g, 80, 180, 16, 34, 7, C.white, C.edge); rr(g, 77, 206, 22, 14, 6, acc);
  seg(g, 72, 136, 50, 180, 17, C.edge); seg(g, 72, 136, 50, 180, 13, C.white); dot(g, 48, 185, 8.5, acc);
}
function sideFront(g, L) {
  if (L >= 7) rr(g, 65, 184, 11, 28, 5, C.blue);   // leg boosters
  if (L >= 2) { g.beginPath(); g.ellipse(70, 129, 13, 9, 0, 0, Math.PI * 2); g.fillStyle = C.cyan; g.fill(); }   // shoulder pads
  if (L >= 4) seg(g, 62, 158, 55, 172, 7, C.blue);   // wrist rockets
}
const both = (g, fn) => { fn(0); g.save(); g.translate(200, 0); g.scale(-1, 1); fn(1); g.restore(); };
// o: { L, face, thrust, footL, footR, dim, glitch, batt, chute, now }
function drawBot(g, o) {
  const L = o.L, now = o.now, acc = L >= 9 ? C.gold : C.cyan;
  if (L >= 10) {   // energy aura, its dashes turning
    g.beginPath(); g.arc(100, 140, 108, 0, Math.PI * 2); g.fillStyle = 'rgba(125,249,255,.22)'; g.fill();
    g.save(); g.setLineDash([4, 8]); g.lineDashOffset = reduced ? 0 : -now / 40; g.beginPath(); g.arc(100, 140, 118, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#7df9ff'; g.stroke(); g.restore();
  }
  if (o.chute > 0) {   // the parachute grows out of the back and rises over the head
    const s = 0.25 + 0.75 * o.chute, cy = lerp(118, -38, o.chute);
    g.lineWidth = 1.5; g.strokeStyle = '#8a93b5';
    for (const [ex, sx, sy] of [[34, 70, 128], [76, 84, 124], [124, 116, 124], [166, 130, 128]]) { g.beginPath(); g.moveTo(100 + (ex - 100) * s, cy); g.lineTo(sx, sy); g.stroke(); }
    g.save(); g.translate(100, cy); g.scale(s, s); g.translate(-100, 38);
    g.fillStyle = C.blue; g.fill(P2('M30 -38 Q100 -150 170 -38 Q155 -50 140 -38 Q125 -50 110 -38 Q100 -46 90 -38 Q75 -50 60 -38 Q45 -50 30 -38 Z'));
    g.fillStyle = C.white; g.fill(P2('M84 -40 Q90 -94 100 -94 Q110 -94 116 -40 Q108 -48 100 -42 Q92 -48 84 -40 Z'));
    g.restore();
  }
  if (L >= 6) { g.fillStyle = C.cyan; g.fill(P2('M90 40 Q100 10 112 40 Z')); }   // head fin, behind the head
  both(g, sd => sideBack(g, L, o, now, sd));
  seg(g, 136, 44, 146, 22, 3, C.edge); dot(g, 146, 20, 4.5, C.cyan);
  both(g, () => sideBody(g, L, acc));
  rr(g, 90, 112, 20, 14, 4, '#dde3f3');
  rr(g, 68, 122, 64, 64, 24, C.white, C.edge);
  rr(g, 86, 142, 28, 22, 4, o.dim ? '#1c2566' : C.blue);
  if (L >= 9) rr(g, 83.5, 139.5, 33, 27, 6, null, C.gold, 2.5);
  rr(g, 36, 62, 12, 30, 6, acc); rr(g, 152, 62, 12, 30, 6, acc);
  rr(g, 44, 36, 112, 84, 40, C.white, C.edge);
  const jx = o.glitch && !reduced ? (hsh(Math.floor(now / 60)) - 0.5) * 6 : 0;
  rr(g, 52 + jx, 46, 96, 64, 28, o.dim ? '#1c2566' : C.blue);
  const fc = o.dim ? '#7f8fd8' : C.led;
  for (const [x, y] of FACES[o.face] || FACES.focus) dot(g, x + jx, y, 2.3, fc);
  if (o.glitch) { g.fillStyle = 'rgba(159,179,255,.6)'; g.fillRect(52, 58 + hsh(Math.floor(now / 80)) * 30, 96, 5); g.fillStyle = 'rgba(13,21,80,.7)'; g.fillRect(58, 86, 84, 3); }
  both(g, () => sideFront(g, L));
  g.font = `700 ${L >= 10 ? 13 : 14}px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center'; g.fillStyle = L >= 9 ? '#ffd66b' : o.dim ? '#7f8fd8' : C.led;
  g.fillText(String(L), 100, 158);
  if (o.batt && (reduced || Math.floor(now / 200) % 2 === 0)) {   // the empty battery, blinking over the head
    rr(g, 83, -4, 30, 16, 3, C.white, '#e5484d', 3); rr(g, 113, 1, 4, 6, 1, '#e5484d');
    if (o.batt === 'low') rr(g, 87, 0, 6, 8, 1, '#e5484d');
  }
}

/* ---------- scares: pure show, random and independent of the round ---------- */
// A boot sputters, the visor glitches, the power dips or a gust spins the Brainer. They come from Math.random, never
// from the round's seed, so they say nothing about when the power really runs out, and the multiplier never pauses.
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

/* ---------- the suit chip: the level, what it adds and what comes next ---------- */
let lastSuit = '';
function renderSuit(L, m) {
  const next = SUIT[L], key = L + '|' + (next ? Math.round(m * 50) : '');
  if (key === lastSuit) return; lastSuit = key;
  const lo = SUIT[L - 1].at, p = next ? clamp(Math.log(Math.max(m, lo) / lo) / Math.log(next.at / lo), 0, 1) : 1;
  $('#suitLv').textContent = `Suit level ${L}`; $('#suitName').textContent = SUIT[L - 1].name;
  $('#suitBar').style.width = Math.round(p * 100) + '%';
  $('#suitNext').textContent = next ? `Next: ${next.name.toLowerCase()} at ${fx(next.at)}` : 'Fully suited up';
}

/* ---------- the scene: the meadow world, the climb and the Iron Brainer ---------- */
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, HY = 0;
const view = { gx: 0, speed: 0, flyT0: 0, awayT0: 0, wins: [], park: null, lift: null, suit: 1, gearT0: 0 };
const clouds = Array.from({ length: 9 }, (_, i) => ({ x: (i * 0.137 % 1), y: 0.08 + (i * 0.29 % 0.5), s: 0.6 + (i * 0.43 % 0.8), p: 0.3 + (i * 0.17 % 0.7) }));
const TAU = Math.PI * 2;
const hsh = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // a fixed scatter for trees and houses
const wrapX = (x, span) => ((x % span) + span) % span;
const lin = (y0, y1, stops) => { const l = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => l.addColorStop(o, c)); return l; };
function layout() {
  W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); HY = H * 0.74;
}
new ResizeObserver(layout).observe(stage);
// The countryside (Tornike's pick, 2026-10-26): layered rolling hills, round trees, a village with windmills, and a
// plain barrel hangar in brand stripes beside the runway (no letters). Nearer layers stream past faster.
function puff(x, y, s) {   // a cartoon cumulus: lit top, soft violet base
  ctx.fillStyle = '#d9d3ff'; for (const [dx, dy, r] of [[-1, 0.3, 0.75], [0, 0.35, 0.9], [1, 0.3, 0.75]]) { ctx.beginPath(); ctx.arc(x + dx * 30 * s, y + dy * 30 * s, r * 30 * s, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#ffffff'; for (const [dx, dy, r] of [[-0.95, 0.1, 0.7], [0, -0.25, 1], [0.95, 0.05, 0.72], [0.45, -0.55, 0.62]]) { ctx.beginPath(); ctx.arc(x + dx * 30 * s, y + dy * 30 * s, r * 30 * s, 0, TAU); ctx.fill(); }
}
function hills(y0, amp, f, ph, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, y0 - amp * (0.6 + 0.4 * Math.sin((x + ph) * f) * Math.cos((x + ph) * f * 0.37)));
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}
function tree(x, y, r, dark, light) {
  ctx.fillStyle = 'rgba(40,60,30,.18)'; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.15, r, r * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x - r * 0.12, y - r * 0.6, r * 0.24, r * 0.7);
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y - r * 1.1, r, 0, TAU); ctx.fill();
  ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 1.35, r * 0.5, 0, TAU); ctx.fill();
}
function house(x, y, w, roof) {
  const h = w * 0.7; ctx.fillStyle = '#fff6ee'; ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - w * 0.62, y - h); ctx.lineTo(x, y - h - w * 0.55); ctx.lineTo(x + w * 0.62, y - h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x - w * 0.22, y - h * 0.62, w * 0.18, w * 0.18); ctx.fillRect(x + w * 0.06, y - h * 0.62, w * 0.18, w * 0.18);
}
function windmill(x, y, s, now) {
  ctx.fillStyle = '#fff6ee'; ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x - 5 * s, y - 46 * s); ctx.lineTo(x + 5 * s, y - 46 * s); ctx.lineTo(x + 9 * s, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8447fb'; ctx.beginPath(); ctx.arc(x, y - 46 * s, 7 * s, Math.PI, 0); ctx.fill();
  ctx.save(); ctx.translate(x, y - 44 * s); ctx.rotate(reduced ? 0.4 : now / 900); ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.fillRect(-3 * s, 0, 6 * s, 30 * s); } ctx.restore();
  ctx.fillStyle = '#5a3ffc'; ctx.beginPath(); ctx.arc(x, y - 44 * s, 3 * s, 0, TAU); ctx.fill();
}
function hangar(x, y, w) {   // a barrel hangar in the brand's violet stripe, door open; no letters
  const h = w * 0.55; ctx.fillStyle = '#f4f2ff'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h * 0.4); ctx.quadraticCurveTo(x + w / 2, y - h * 1.45, x + w, y - h * 0.4); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8447fb'; ctx.fillRect(x, y - h * 0.42, w, h * 0.1); ctx.fillStyle = '#2b2452'; ctx.fillRect(x + w * 0.3, y - h * 0.32, w * 0.4, h * 0.32);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 1; i < 4; i++) ctx.fillRect(x + w * 0.3 + w * 0.1 * i, y - h * 0.32, 2, h * 0.32);
}
function runway(x, y, w) {
  ctx.fillStyle = '#e7e4f6'; ctx.fillRect(x, y - 5, w, 16); ctx.fillStyle = '#8447fb'; ctx.fillRect(x, y + 9, w, 3);
  ctx.fillStyle = '#ffffff'; for (let k = x + 18; k < x + w - 20; k += 46) ctx.fillRect(k, y + 2, 22, 2.5);
  ctx.fillStyle = '#7ff3ff'; for (let k = x + 6; k < x + w; k += 34) { ctx.beginPath(); ctx.arc(k, y - 6, 2.2, 0, TAU); ctx.fill(); }
}
function countryside(now, gx) {
  ctx.fillStyle = lin(0, HY, [[0, '#6f5cff'], [0.5, '#a49cff'], [0.85, '#ffd9e8'], [1, '#fff1df']]); ctx.fillRect(0, 0, W, HY + 2);
  const sr = Math.min(W, H) * 0.045, sx = W * 0.8, sy = HY * 0.42, sg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 3);
  sg.addColorStop(0, '#fffaf0'); sg.addColorStop(0.25, 'rgba(255,214,170,.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
  const k = W < 600 ? 0.7 : 1;
  for (let i = 0; i < 6; i++) puff(wrapX(i * 260 - gx * 0.12, W + 300) - 150, HY * (0.16 + 0.12 * (i % 3)), (0.8 + 0.25 * (i % 2)) * k);
  hills(HY - H * 0.02, H * 0.05, 0.004, gx * 0.15, '#b9c7f2');
  hills(HY + H * 0.02, H * 0.05, 0.006, gx * 0.3 + 400, '#9fdc86');
  for (let i = 0; i < 9; i++) { const x = wrapX(i * 190 - gx * 0.3, W + 200) - 100, y = HY; if (i % 3 === 0) windmill(x, y, Math.min(1.1, W / 900), now); else if (i % 3 === 1) house(x, y + 2, (18 + 4 * (i % 2)) * k, ['#ff7a93', '#8447fb', '#ffb347'][i % 3]); }
  hills(HY + H * 0.1, H * 0.05, 0.009, gx * 0.6 + 900, '#7fd36a');
  for (let i = 0; i < 14; i++) tree(wrapX(i * 110 + hsh(i) * 60 - gx * 0.6, W + 160) - 80, HY + H * 0.1 + hsh(i + 7) * H * 0.04, (9 + hsh(i) * 7) * k, '#3fbf5a', '#6ad36d');
  ctx.fillStyle = lin(HY + H * 0.12, H, [[0, '#6fcb5c'], [1, '#56b84a']]); ctx.fillRect(0, HY + H * 0.12, W, H);
  const rx = W * 0.02 - gx; if (rx + W > 0) { runway(rx, HY, W * 0.9); hangar(rx + W * 0.6, HY - 4, Math.min(170, W * 0.24)); }   // the airfield slides away once the plane is up
  for (let i = 0; i < 18; i++) tree(wrapX(i * 80 + hsh(i + 3) * 40 - gx * 1.1, W + 120) - 60, HY + H * 0.22 + hsh(i + 11) * (H - HY) * 0.55, (12 + hsh(i) * 9) * k, '#2fb850', '#5fd26a');
}
/* ---------- the climb's world: five altitude backdrops rendered in Blender, crossfaded as the multiplier rises ---------- */
// Altitude follows the multiplier (Tornike's pick, 2026-10-26): the runway at 1.00×, over the fields by 1.6×, in the
// clouds by 3.5×, above them by 12× and the edge of space from 120×. Each step slides the old view down and fades the
// next in from above, and soft clouds stream past, thickest in the cloud layer, so the plane always feels it climbs.
// The backdrops come from Brainer 3D/blender (concepts: the valley look, views ground, low, clouds, above, space).
const SKY = ['ground', 'low', 'clouds', 'above', 'space'].map(n => { const im = new Image(); im.src = `assets/sky/${n}.webp`; return im; });
const ALT = [1, 1.6, 3.5, 12, 120];
const altOf = m => { if (m <= ALT[0]) return 0; for (let i = 1; i < ALT.length; i++) if (m < ALT[i]) return i - 1 + Math.log(m / ALT[i - 1]) / Math.log(ALT[i] / ALT[i - 1]); return ALT.length - 1; };
const PARK = { x: 0.26, y: 0.73 };   // where the plane stands on the runway in the ground backdrop, as fractions of the image
const smooth = f => f * f * (3 - 2 * f);
function cover(im, ox, oy, a, fx = 0.5, sx = 0.5) {   // the image filling the stage, a little over-sized so it can drift; image x fx sits at stage x sx where the crop allows
  if (!im.complete || !im.naturalWidth || a <= 0.002) return null;
  const k = Math.max(W * 1.06 / im.naturalWidth, H * 1.42 / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k, x = clamp(W * sx - w * fx, W - w, 0) + ox, y = (H - h) / 2 + oy;   // tall enough to slide 0.2 of the stage either way with no gap
  ctx.globalAlpha = a; ctx.drawImage(im, x, y, w, h); ctx.globalAlpha = 1;
  return { x, y, w, h };
}
let alt = 0, lastSky = 0;
const passing = Array.from({ length: 12 }, (_, i) => ({ x: (i * 0.37) % 1, y: (i * 0.61) % 1.3 - 0.15, s: 0.6 + (i * 0.29) % 0.9, v: 0.7 + (i * 0.53) % 0.8 }));
function sky(now) {
  const dt = Math.min(50, now - (lastSky || now)); lastSky = now;
  const goal = R && (R.phase === 'fly' || R.phase === 'end') ? altOf(R.phase === 'end' ? R.crash : R.m) : 0;
  alt += (goal - alt) * Math.min(1, dt * (goal < alt ? 0.004 : 0.006));   // eases to the multiplier's height; between rounds back down to the runway
  const i = Math.min(SKY.length - 2, Math.floor(alt)), e = smooth(clamp(alt - i, 0, 1)), drift = reduced ? 0 : Math.sin(now / 9000) * W * 0.02;
  ctx.fillStyle = '#6f5cff'; ctx.fillRect(0, 0, W, H);
  const base = i === 0 ? cover(SKY[0], drift, e * H * 0.2, 1, 0.3, 0.38) : cover(SKY[i], drift, e * H * 0.2, 1);   // the runway view keeps the runway in frame on narrow screens
  cover(SKY[i + 1], drift, -(1 - e) * H * 0.2, e);
  if (!base) { countryside(now, view.gx); view.park = { x: W * 0.08 + 80, y: HY - 6 }; return; }   // until the backdrops have loaded
  view.park = i === 0 ? { x: base.x + base.w * PARK.x, y: base.y + base.h * PARK.y } : { x: base.x + base.w * PARK.x, y: H + H * 0.4 };   // the runway falls away below as it climbs
  // soft clouds streaming past the plane, thickest in the cloud layer
  const thick = clamp(1 - Math.abs(alt - 1.9) / 1.3, 0, 1) * (R && R.phase === 'fly' ? 1 : 0.35);
  if (thick > 0.02 && !reduced) for (const c of passing) {
    c.y += dt * 0.00035 * c.v * (0.4 + view.speed); c.x -= dt * 0.00008 * c.v * view.speed;
    if (c.y > 1.2) { c.y = -0.25; c.x = Math.random() * 1.1; }
    if (c.x < -0.2) c.x += 1.3;
    const r = c.s * H * 0.22, x = c.x * W, y = c.y * H, g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.55 * thick})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
// Where the Brainer is: standing on the runway while bets are open; in flight it lifts straight off and rises to a hover
// spot under the multiplier (p, 0 to 1 over 3.5 s), then bobs there while the world streams past.
function hoverAt(t) {
  const pk = view.lift || view.park || { x: W * 0.3, y: H * 0.8 }, p = clamp(t / 3500, 0, 1), e = easeOut(p);
  const hx = W * (W < 600 ? 0.5 : 0.66), hy = H * (W < 600 ? 0.68 : 0.62);
  const bob = p >= 1 && !reduced ? Math.sin(t / 650) * H * 0.015 : 0;
  return { x: lerp(pk.x, hx, e), y: lerp(pk.y, hy, e * (2 - e)) + bob };
}
function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = R && (R.phase === 'fly' || R.phase === 'end') ? (R.phase === 'end' ? R.endT0 : now) - R.t0 : 0;
  const goal = R && R.phase === 'fly' ? 1 : R && R.phase === 'end' ? 0.6 : 0;
  view.speed += (goal - view.speed) * 0.04; view.gx += view.speed * (reduced ? 1.2 : 3.2);
  sky(now);
  const size = clamp(Math.min(W, H) * 0.6, 180, 380), k = size / 280, inAir = R && (R.phase === 'fly' || R.phase === 'end');
  // on the runway: feet on the ground at the park spot; the spot is kept at take-off so the climb starts from it
  const ground = view.park ? { x: view.park.x, y: view.park.y - 80 * k } : { x: W * 0.3, y: H * 0.7 };
  if (!inAir) view.lift = ground;
  const o = { L: 1, face: exNow(now), thrust: 1, footL: 1, footR: 1, dim: false, glitch: false, batt: '', chute: 0, now };
  let X = ground.x, Y = ground.y + (reduced ? 0 : Math.sin(now / 900) * 2), rot = 0;
  if (!inAir) o.thrust = R && R.phase === 'starting' ? 0.6 : 0;   // jets light as it takes off
  else {
    const hp = hoverAt(t); X = hp.x; Y = hp.y;
    o.L = suitOf(R.phase === 'end' ? R.crash : R.m);
    if (R.phase === 'fly' && o.L > view.suit) {   // a new piece of gear bolts on
      view.suit = o.L; view.gearT0 = now; sound.gear();
      view.wins.push({ t0: now, text: SUIT[o.L - 1].name + '!', col: '#ffd56b' });
    }
    const sc = scareFx(now);
    Object.assign(o, { thrust: sc.thrust, footL: sc.footL, footR: sc.footR, glitch: sc.glitch, batt: sc.batt });
    if (sc.face) o.face = sc.face;
    rot = sc.rot; Y += sc.dy * H;
    if (R.phase === 'end') {   // power out: the jets splutter and die, the screens go dark, it drops, the parachute pops
      const a = (now - view.awayT0) / 1000;
      o.batt = a < 1.2 ? 'empty' : ''; o.face = a < 0.4 ? 'shock' : 'sleep'; o.dim = a >= 0.4;
      o.thrust = a < 0.4 ? 0.3 * (1 - a / 0.4) : 0;
      o.chute = clamp((a - 1) / 0.35, 0, 1);
      Y += a < 0.4 ? 0 : a < 1 ? Math.pow((a - 0.4) / 0.6, 2) * H * 0.12 : H * 0.12 + (a - 1) * H * 0.05;
      rot = a < 0.4 ? 0 : o.chute > 0 ? (reduced ? 0 : Math.sin(a * 2.4) * 0.08) : 0.15 * (a - 0.4) / 0.6;
    }
    // wind streaks for the spin-out, smoke for the sputtering boot
    if (sc.wind > 0.05) { ctx.strokeStyle = `rgba(255,255,255,${0.7 * sc.wind})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { const yy = Y - size * 0.25 + i * size * 0.18, x0 = X - scare.side * size * (0.95 - i * 0.05); ctx.beginPath(); ctx.moveTo(x0 - size * 0.25, yy); ctx.quadraticCurveTo(x0, yy - 14, x0 + size * 0.2 * scare.side, yy + 4); ctx.stroke(); } }
    if (sc.smoke > 0.05) for (let i = 0; i < 4; i++) { const q = ((now - scare.t0) / 260 + i / 4) % 1; ctx.fillStyle = `rgba(190,196,214,${0.75 * sc.smoke * (1 - q)})`; ctx.beginPath(); ctx.arc(X + scare.side * size * 0.06 + Math.sin(i * 2.1) * 10, Y + size * 0.32 + q * size * 0.35, size * (0.03 + q * 0.06), 0, TAU); ctx.fill(); }
  }
  // the gear flash: a ring bursting from the Brainer when a level bolts on
  const gq = view.gearT0 ? (now - view.gearT0) / 600 : 1;
  if (gq < 1) { ctx.strokeStyle = `rgba(255,213,107,${1 - gq})`; ctx.lineWidth = 6 * (1 - gq) + 1; ctx.beginPath(); ctx.arc(X, Y, size * (0.3 + gq * 0.5), 0, TAU); ctx.stroke(); }
  ctx.save(); ctx.translate(X, Y); ctx.rotate(rot); ctx.scale(k, k); ctx.translate(-100, -140);
  drawBot(ctx, o);
  ctx.restore();
  renderSuit(o.L, R && R.phase !== 'bet' && R.phase !== 'starting' ? R.m : 1);
  // wins and new gear float up from the Brainer
  view.wins = view.wins.filter(w => now - w.t0 < 1400);
  view.wins.forEach((w, i) => {
    const q = (now - w.t0) / 1400, ty = Y - size * 0.62 - q * 60 - i * 26; ctx.globalAlpha = 1 - q; ctx.font = '800 22px FiraGO, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,19,34,.55)'; ctx.strokeText(w.text, X, ty); ctx.fillStyle = w.col || '#7dffcf'; ctx.fillText(w.text, X, ty);
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
  else { l = 'Power out!'; m = fx(R.crash); cls = 'mult flew'; key = 'e' + m; }
  if (!force && key === lastRO) return; lastRO = key;
  lab.textContent = l; lab.hidden = !l; mult.textContent = m; mult.className = cls; wait.hidden = !w;
}
function histCls(c) { return c >= 10 ? 'hi' : c >= 2 ? 'mid' : ''; }
function renderHist() {
  $('#hist').innerHTML = rounds.slice(0, 20).map((r, k) => `<button type="button" class="${histCls(r.crash)}" data-k="${k}" aria-label="Round ${r.nonce}: power out at ${fx(r.crash)}. Check it.">${fx(r.crash)}</button>`).join('');
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
      + `<h4>Round ${r.nonce}: power out at ${fx(r.crash)}${r.mine.length ? ` · ${r.mine.map(m => m.st === 'cashed' ? `bet ${m.i + 1} cashed out at ${fx(m.at)}` : `bet ${m.i + 1} lost`).join(', ')}` : ''}</h4>`
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
  const hashOk = (await sha256(r.seed)) === r.hash, c = await crashOf(r.seed, r.client, r.nonce), crashOk = c === r.crash;
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before take-off' : 'The seed does not match the hash')
    + ok(crashOk, crashOk ? `Recomputed from the seeds, the power runs out at ${fx(c)}, as it did` : `Recomputed: ${fx(c)}, but the power ran out at ${fx(r.crash)}`);
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
    rows = myBets.length ? myBets.map((m, i) => row(i + 1, me, when(m.t, 'month'), `Bet ${money(m.stake)} · power out at ${fx(m.crash)}`, m.at ? money(m.win) : 'Lost', m.at ? `at ${fx(m.at)}` : `bet ${money(m.stake)}`, m.at ? '' : 'lost')).join('') : '<li class="empty">No bets yet. Your bets show here once a round ends.</li>';
    $('#boardNote').textContent = 'Your last 50 bets, kept on this device only.';
  } else {
    let list = demoRows(period).map(r => ({ ...r, you: false }));
    const mine = myBets.filter(m => m.at && m.t >= t0).map(m => ({ name: 'You', stage: me, stake: m.stake, at: m.at, win: m.win, crash: m.crash, t: m.t, you: true }));
    if (tab === 'rounds') {
      list = list.concat(rounds.map(r => ({ name: `Round ${r.nonce}`, stage: me, crash: r.crash, t: Date.now(), you: true, round: true }))).sort((a, b) => b.crash - a.crash).slice(0, 20);
      rows = list.map((r, i) => row(i + 1, r.stage, r.round ? `${r.name}, this visit` : `Round ${(Math.floor(r.t / 1000) % 900000 + 100000)}`, when(r.t, period), fx(r.crash), 'power out', r.you ? 'you' : '')).join('');
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

/* ---------- loop and boot ---------- */
function loop(now) {
  if (W && H) { tick(now); draw(now); renderReadout(); if (flying()) renderCash(); }
  requestAnimationFrame(loop);
}
S.client = randHex(8);
rotateSeed().catch(() => {});   // without crypto.subtle (plain http) the round says why instead
layout(); renderBalance(); renderBets(); renderSound(); renderHist(); renderReadout(true); syncSide();
const bootT = performance.now();
function loadProgress() {   // the fonts and the sky backdrops; a slow network never holds the player past 9 s
  if (performance.now() - bootT > 9000) return 1;
  const sky = SKY.filter(im => im.complete).length / SKY.length, font = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0;
  return (sky + font) / 2;
}
function introActor(g, w, h, now, ex) {   // the intro's actor: the Iron Brainer hovering on its jets, suit level 1
  const k = Math.min(w, h) / 330;
  g.save(); g.translate(w / 2, h / 2 + (reduced ? 0 : Math.sin(now / 520) * 8 * k)); g.scale(k, k); g.translate(-100, -130);
  drawBot(g, { L: 1, face: ex === 'wink' || ex === 'happy' ? 'happy' : 'focus', thrust: 1, footL: 1, footR: 1, dim: false, glitch: false, batt: '', chute: 0, now });
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
