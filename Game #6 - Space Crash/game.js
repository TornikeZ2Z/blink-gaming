(() => {
'use strict';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';
const fxShort = m => (m < 1000 ? m.toFixed(2) : m < 1e6 ? Math.floor(m).toLocaleString('en-US') : (Math.floor(m / 1e5) / 10) + 'M') + '×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- config & math ---------- */
// Chicken Road's ladder, one to one: 25 tiles hide 1, 3, 5 or 10 bombs and each step uncovers one more tile, so the
// chance of surviving n steps is C(25-n, b) / C(25, b). After n safe paths the multiplier is the RTP divided by that
// chance, rounded down to the cent, so a jump at any step returns up to the RTP: less where a payout rounds down to the
// cent, or where the $10,000 max win ends a long or high-bet flight early. Every path at a step has the same odds.
const cfg = {
  rtp: 97, minBet: 0.1, maxBet: 200, maxWin: 10000, startBalance: 1000, paths: 5,
  // Brain levels are the Brainer's growth only and never change the odds. Each flight earns the same brain cells when
  // it ends, whatever the bet or difficulty, so progress never asks for bigger bets (Marketing's responsible-gambling
  // advice, pending legal review). perFlight: false would earn the bet times the difficulty factor instead.
  brain: { max: 100, perFlight: 10, factor: { easy: 0.5, medium: 1, hard: 1.5, hardcore: 2 } }
};
const LEVELS = [
  { key: 'easy', name: 'Easy', bombs: 1 }, { key: 'medium', name: 'Medium', bombs: 3 },
  { key: 'hard', name: 'Hard', bombs: 5 }, { key: 'hardcore', name: 'Hardcore', bombs: 10 }
];
for (const d of LEVELS) {
  d.steps = 25 - d.bombs; d.safe = []; d.cum = [1];   // cum[n] = chance of surviving the first n paths
  for (let n = 1; n <= d.steps; n++) { const sv = (25 - d.bombs - (n - 1)) / (25 - (n - 1)); d.safe.push(sv); d.cum.push(d.cum[n - 1] * sv); }
}
const PATHS = [['Far left', -60], ['Left', -30], ['Ahead', 0], ['Right', 30], ['Far right', 60]];
// Space Crash (Tornike, 2026-10-27): Plane Crash's maths with a different game on top. Each row is five shield drones
// and the player picks one to shoot: a safe roll breaks it and the pod jet flies on through the pieces; a bomb roll
// means its shield holds and the pod powers down. Each drone uses its path's roll, so the fairness scheme is Plane
// Crash's. It began as Plane Crash's "Aim & Break" mode; AIM keeps the code that is Space Crash's own easy to find,
// and the paths-mode code it shares stays switched off.
const AIM = true;
const offC = k => k - 2;   // how far a path (or target) lies left or right of centre
// Brain cells needed to reach each brain level (CELLS[L]): quick at first, then slower. At 10 cells a flight, level 10
// takes about 80 flights and level 100 about 20,000. Ten stages of ten levels; each stage is one look from the brand book.
const CELLS = (() => { const c = [0, 0]; for (let n = 1; n < 100; n++) c.push(c[n] + Math.round(10 + 8 * Math.pow(n, 1.4))); return c; })();
const brainLevel = cells => { let L = 1; while (L < 100 && cells >= CELLS[L + 1]) L++; return L; };
const stageOf = L => Math.ceil(L / 10);
const UNLOCKS = [{ at: 20, world: 'clouds', name: 'Cloud sea' }, { at: 40, world: 'city', name: 'City at dusk' }];
const rtpOf = () => cfg.rtp;
const multAt = (d, n, rtp = cfg.rtp) => n <= 0 ? 1 : Math.floor(rtp / 100 / d.cum[n] * 100 + 1e-7) / 100;
const capAt = (d, n, stake, rtp = cfg.rtp) => Math.min(multAt(d, n, rtp), Math.floor(cfg.maxWin / stake * 100 + 1e-7) / 100);   // what a path really pays at this bet: the max win caps it, rounded down like every multiplier
const payAt = (r, n) => Math.min(Math.floor(r.stake * multAt(r.d, n, r.rtp) * 100 + 1e-6) / 100, cfg.maxWin);   // a jump after n paths pays this, rounded down to the cent
const cents = v => Math.round(v * 100) / 100;   // the balance stays in whole cents, so it matches every amount shown
// What a flight can really reach: the max win ends it on the first path that pays that much (the auto-jump's test), so
// even at the minimum bet Hardcore never offers path 15. Every top shown before a bet uses d.reach, at the minimum bet;
// once a bet is placed, the flight counts and draws its own reach (r.reach) and capAt caps at its stake.
const reachAt = (d, stake, rtp = cfg.rtp) => { let n = 1; while (n < d.steps && stake * multAt(d, n, rtp) < cfg.maxWin) n++; return n; };
for (const d of LEVELS) d.reach = reachAt(d, cfg.minBet);
const topOf = d => capAt(d, d.reach, cfg.minBet);

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, stake: 10, level: 0, nonce: 1, client: '', seed: '', hash: '', cells: Math.max(0, parseFloat(store.get('brainer.xp', '0')) || 0) };   // brain cells, shared by every Brainer game on this site
let round = null, lastRound = null, starting = false, booted = false;   // round: the flight in play, or the last one settled; lastRound: the last settled, for the fairness check; booted: the intro has gone (no bets before the 18+ check)
const inFlight = () => !!round && (round.status === 'takeoff' || round.status === 'choose' || round.status === 'flying');
const myLevel = () => brainLevel(S.cells);

/* ---------- fairness ---------- */
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// Every path at every step rolls HMAC-SHA256(server seed, "client seed:nonce:step:path"), read as a fraction.
// A path is bombed when its roll is at or above that step's survival chance, so whichever path the player
// picks survives with exactly that chance.
async function drawBombs(seed, client, nonce, d) {
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const roll = async msg => parseInt(hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg))).slice(0, 13), 16) / 2 ** 52;
  return Promise.all(Array.from({ length: d.steps }, (_, i) =>
    Promise.all(Array.from({ length: cfg.paths }, (_, k) => roll(`${client}:${nonce}:${i + 1}:${k + 1}`).then(u => u >= d.safe[i])))));
}
// The game commits first: the next flight's server seed is drawn and hashed before the player sets a client seed or
// a bet. Seed and hash change together, and a flight waits for them, so none starts on a seed whose hash wasn't shown.
let commit = null;
function rotateSeed() { const s = randHex(32); return (commit = sha256(s).then(h => { S.seed = s; S.hash = h; })); }

/* ---------- sound ---------- */
// Made live with Web Audio by ../shared/sound.js, the calm set every game shares (Tornike, 2026-10-27), so there are no
// files to load. Starts on the first tap or key; the HUD button mutes it. The background music (../shared/music.js)
// plays under it all, very low, and every sound ducks it a little.
const sound = BrainerSound(store, v => ({
  takeoff() { v.whoosh(0.9, 0.07, 200, 1100); v.soft(90, 150, 0.8, 0.04); },
  fire() { v.soft(880, 330, 0.18, 0.06); v.whoosh(0.05, 0.03, 2000, 800); },   // a short soft "pew"
  warp() { v.whoosh(1.0, 0.07, 200, 1600); v.soft(110, 220, 0.8, 0.05); },   // the launch kick
  down() { v.soft(330, 98, 1.1, 0.06); v.whoosh(0.6, 0.035, 500, 80, 0.1); },   // engines winding down
  clang() { v.soft(523, 494, 0.25, 0.09, 0, 'triangle'); v.soft(784, 0, 0.18, 0.035, 0.01); },   // a muted "tunk" off the shield
  gear() { v.bell(784, 0.035); },
  shatter(n) { v.whoosh(0.35, 0.05, 1500, 250, 0.02); v.thud(0.08); v.bell(v.step(n), 0.045, 0.06); },   // a bell one note higher for every shield broken
  jump() { v.whoosh(0.4, 0.04, 500, 1600); [523, 659, 784, 1047].forEach((f, i) => v.bell(f, 0.05, 0.12 + i * 0.09)); }
}));

for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, () => sound.wake(), true);

/* ---------- round flow ---------- */
const FLY_MS = 1100, IMPACT = 0.68;
async function play() {
  if (!booted || inFlight() || starting || sheetOpen()) return;
  const d = LEVELS[S.level];
  if (S.stake < cfg.minBet || S.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)}.`); return; }
  if (S.stake > S.balance) { toast('Not enough demo balance for this bet. Lower it or press Reset.'); return; }
  starting = true; renderControls();
  const r = { stake: S.stake, d, n: 0, rtp: cfg.rtp, reach: reachAt(d, S.stake), client: S.client, nonce: S.nonce++, status: 'choose', payout: 0, pick: -1, picks: [] };   // the client seed in effect as it starts
  try { await commit; r.seed = S.seed; r.hash = S.hash; r.bombs = await drawBombs(r.seed, r.client, r.nonce, d); }
  catch (e) { S.nonce--; toast(window.isSecureContext ? 'Could not start the flight. Please try again.' : 'This demo needs https (or localhost) for its provably fair draw.'); return; }   // e.g. no crypto.subtle on plain http
  finally { starting = false; renderControls(); }
  S.balance = cents(S.balance - r.stake); round = r;
  sceneStart(d);
  feel('wink', 900); sound.takeoff(); sound.mood('round', 0);
  renderBalance(); renderControls(); renderLadder();
}
function choose(k) {
  const r = round;
  if (!r || r.status !== 'choose' || k < 0 || k >= cfg.paths || sheetOpen()) return;
  r.pick = k; r.picks[r.n] = k; r.status = 'flying'; r.t0 = performance.now(); r.hit = r.bombs[r.n][k]; r.struck = false; r.landed = false;
  if (window.pcTest && window.pcTest.next) { r.hit = window.pcTest.next === 'boom'; r.forced = true; window.pcTest.next = ''; }   // ?test only: force this step, to show either outcome on demand
  sceneFly(k, r.bombs[r.n], r.t0);
  sound.fire();
  renderControls();
}
function jump(auto) {
  const r = round;
  if (!r || r.status !== 'choose' || r.n < 1) return;
  const m = capAt(r.d, r.n, r.stake, r.rtp);
  r.payout = payAt(r, r.n); r.status = 'cashed'; r.auto = auto;   // auto: the game jumped (last path or max win), so no step was skipped
  S.balance = cents(S.balance + r.payout);
  sceneJump(performance.now(), m);
  if (m >= 10) feel('amazed', 1700); sound.jump(); sound.mood('idle');
  if (auto) toast(r.n >= r.d.steps ? 'Last row broken, so your Brainer cashed out automatically.' : `Max win of ${money(cfg.maxWin)} reached, so your Brainer cashed out automatically.`);
  settle();
}
function settle() { lastRound = round; round.endAt = performance.now(); earnCells(cfg.brain.perFlight || round.stake * cfg.brain.factor[round.d.key]); rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); }); renderBalance(); renderControls(); renderLadder(); }
function advance(now) {
  const r = round;
  if (!r || r.status !== 'flying') return;
  const p = (now - r.t0) / FLY_MS;
  if (AIM && !r.landed && p >= SHOT) { r.landed = true; shotLands(now, r.hit); }
  if (!r.struck && p >= IMPACT) {
    r.struck = true; sceneImpact(now);
    if (r.hit) {
      r.status = 'crashed'; sceneCrash(now); sound.down(); sound.dip();
      if (navigator.vibrate) navigator.vibrate(120);
      settle(); return;
    }
    sound.shatter(r.n); sound.mood('round', (r.n + 1) / r.reach);
  }
  if (p >= 1) {
    r.n++; r.status = 'choose'; r.pick = -1; r.popAt = now;
    scenePassed(now); feel('phew', 1000); kitUp(now);
    if (r.n >= r.d.steps || r.stake * multAt(r.d, r.n, r.rtp) >= cfg.maxWin) jump(true);
    renderControls(); renderLadder();
  }
}

/* ---------- brain cells ---------- */
// No level card in the games (Tornike, 2026-10-27): each round still adds brain cells for the website, as Fly High does.
function earnCells(k) {
  const saved = parseFloat(store.get('brainer.xp', ''));
  if (saved >= 0) S.cells = saved;   // another Brainer game open in another tab may have added cells since this one loaded
  S.cells = Math.round((S.cells + k) * 10) / 10;
  store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(myLevel()));   // the website reads brainer.level
}

/* ---------- scene ---------- */
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
const NAVY = '#0a1322', VIOLET = '#532aff', LINE = 'rgba(10,19,34,.32)';
const sootCache = {};
function sootyRobot(L) {
  L = stageOf(L);
  const im = artOf(L);
  if (sootCache[L] || !im) return sootCache[L] || null;
  const c = document.createElement('canvas'); c.width = c.height = 500; const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 500, 500); g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 0, 0, 500); sh.addColorStop(0, 'rgba(40,30,60,.38)'); sh.addColorStop(1, 'rgba(40,30,60,.12)');
  g.fillStyle = sh; g.fillRect(0, 0, 500, 500);   // singed from the top, where the bomb hit
  for (const [x, y, r] of [[176, 92, 26], [318, 140, 20], [150, 330, 16], [350, 360, 18], [244, 60, 14]]) {   // a few soft soot smudges
    const s = g.createRadialGradient(x, y, 0, x, y, r); s.addColorStop(0, 'rgba(20,14,28,.55)'); s.addColorStop(1, 'rgba(20,14,28,0)');
    g.fillStyle = s; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return (sootCache[L] = c);
}
/* ---------- the 2D Brainer ---------- */
// The stage stills (assets/brainer-N.png, as in the picker): Blender renders with the stage's face baked in. A render
// leaves room round the robot and a faint floor, so artOf crops it to the robot and drops the floor (alpha under 60):
// it fills its spot, and nothing grey hangs under it in the air.
const ART = Array.from({ length: 10 }, (_, i) => { const im = new Image(); im.src = `assets/brainer-${i + 1}.png`; return im; });
const artCache = {};
function artOf(L) {   // stage L's still on a 500 px canvas, or null until it has loaded
  const im = ART[L - 1];
  if (artCache[L] || !im.complete || !im.naturalWidth) return artCache[L] || null;
  const t = document.createElement('canvas'), c = document.createElement('canvas'); t.width = t.height = c.width = c.height = 500;
  const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, 500, 500);
  let x0 = 0, y0 = 0, x1 = 500, y1 = 500;
  try {
    const px = g.getImageData(0, 0, 500, 500), a = px.data; x0 = y0 = 500; x1 = y1 = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] < 60) a[i] = 0; else { const p = i >> 2, x = p % 500, y = p / 500 | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    g.putImageData(px, 0, 0);
  } catch (e) {}   // a canvas the browser will not read back (file://) keeps the whole render
  const s = Math.max(x1 - x0, y1 - y0) * 1.06;
  c.getContext('2d').drawImage(t, (x0 + x1 - s) / 2, (y0 + y1 - s) / 2, s, s, 0, 0, 500, 500);
  return (artCache[L] = c);
}
const { faceAround, EXPR } = window.BrainerFace;
// Draws the Brainer centred at (x, y), `size` px tall, with the effects of expression `ex` round its head (sparkles,
// hearts, zZ…); the face itself is the still's. o.img swaps the art (e.g. the sooty one).
function drawBrainer(g, x, y, size, L, ex, t, o = {}) {   // the 2D stand-in, used until the 3D Brainer is ready or without WebGL
  const im = o.img || artOf(stageOf(L));   // the art comes in ten looks, one per stage
  if (!im) return;
  const s = size / 500;
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(-250, -250);
  g.drawImage(im, 0, 0, 500, 500);
  faceAround(g, fxOf(ex), t);
  g.restore();
}
const fxOf = ex => (EXPR[ex] && EXPR[ex].fx) || [];

/* The 3D actors (brainer3d.js, loaded as a module, sets window.Brainer3D, or false if it fails). One renderer draws three views each frame
   into regions of one canvas: A, the plane from behind with the Brainer in its cockpit; B, the Brainer from the front
   for the portrait and the crash spotlight; C, the Brainer under its parachute (only after a jump). Without WebGL the
   2D drawings stand in. */
let b3 = null;
function init3D() {
  if (b3 !== null || !window.Brainer3D) return b3;
  try {
    const { Brainer, BrainerStage, Plane3D, Chute3D } = window.Brainer3D, seat = new Brainer(myLevel()), para = new Brainer(myLevel());
    b3 = { stage: new BrainerStage(), seat, plane: new Plane3D(seat), front: new Brainer(myLevel()), para, chute: new Chute3D(para), wA: 0, hA: 0, B: 0, C: 0, ok: false };
    if (window.Brainer3D.PodJet) { b3.podSeat = new Brainer(myLevel()); b3.pod = new window.Brainer3D.PodJet(b3.podSeat); }   // Aim & Break's ship, with its own pilot
  } catch (e) { b3 = false; }
  return b3;
}
function render3D(now) {
  const k = init3D();
  if (!k) return;
  const wA = Math.round(clamp(700 * PS * dpr, 240, 1400)), hA = Math.round(wA * 0.62), B = Math.round(clamp(Math.min(W, H) * 0.56 * dpr, 160, 900)), C = Math.round(clamp(400 * PS * dpr, 160, 900));
  if (wA !== k.wA || B !== k.B || C !== k.C) { Object.assign(k, { wA, hA, B, C }); k.stage.setSize(wA + B + C, Math.max(hA, B, C)); }
  const m = moodNow(now), side = round && round.status === 'choose' && view.hover >= 0 ? Math.sign(offC(view.hover)) : 0;
  const tk = view.takeoff ? now - view.takeoff.t0 : -1, gear = view.parked ? 1 : tk >= 0 ? 1 - clamp((tk - 1500) / 600, 0, 1) : 0, pitch = tk >= 0 ? -0.14 * Math.sin(clamp((tk - 800) / 1400, 0, 1) * Math.PI) : 0;
  if (AIM && k.pod) {   // the pod jet: the win stands its Brainer up facing you, cheering; the loss powers everything down
    const t = now - plane.t0, win = plane.state === 'exit', down = plane.state === 'sink';
    const stand = win ? easeBack(clamp((t - 250) / 450, 0, 1)) * (1 - ease(clamp((t - EXIT_STAND) / 300, 0, 1))) : 0;
    const ln = view.launch ? now - view.launch.t0 : -1, power = down ? 1 - clamp(t / 450, 0, 1) : 1;
    const boost = win ? clamp((t - EXIT_STAND - 150) / 400, 0, 1) : ln >= 0 ? (ln < 520 ? 0.3 * ln / 520 : 1 - 0.7 * clamp((ln - 900) / 900, 0, 1)) : 0;   // the launch burn
    k.podSeat.setLevel(plane.brain);
    k.podSeat.update(now, stand > 0.3 ? 'ecstatic' : m.ex, { seat: stand < 0.3, side: stand > 0.3 ? 0 : side, lookX: stand > 0.3 ? 0 : lookNow(now), noFace: stand < 0.3, power: down ? power : 1, reduced });
    k.pod.update(now, { yaw: view.bank * 0.5, pitch: down ? 0.55 * ease(clamp(t / 1800, 0, 1)) : 0, bank: down ? 0.25 * ease(clamp(t / 1800, 0, 1)) : 0, tier: kit.on, popT: kit.t0, power, stand, boost, pilot: plane.state !== 'gone', reduced });
    k.stage.draw(k.pod, 0, 0, wA, hA, 'plane');
  } else {
    k.seat.setLevel(plane.brain); k.seat.update(now, m.ex, { seat: true, side, lookX: lookNow(now), noFace: true, reduced });
    k.plane.update(now, { yaw: view.bank * 0.5, pitch, gear, idle: view.parked, level: plane.brain, soot: plane.state === 'fall', pilot: plane.state !== 'empty' && plane.state !== 'gone', reduced });
    k.stage.draw(k.plane, 0, 0, wA, hA, 'plane');
  }
  const dazed = !!iris, L = dazed ? iris.brain : myLevel();
  k.front.setLevel(L); k.front.update(now, dazed ? 'dizzy' : m.ex, { since: m.t0, lookX: lookNow(now), soot: dazed, glow: clamp(1 - (now - (view.glowT || -1e9)) / 700, 0, 1), reduced });
  k.stage.draw(k.front, wA, 0, B, B, 'hero');
  if (chute && chute.st) {
    const st = chute.st, landedFor = st.landed ? now - chute.t0 - 3000 : -1;
    k.para.setLevel(chute.brain); k.para.update(now, landedFor > 700 ? 'wink' : m.ex, { since: m.t0, lookX: Math.sin(now / 1200) * 0.4, reduced });
    k.chute.update(now, { open: st.open, fold: st.fold, reduced });
    k.stage.draw(k.chute, wA + B, 0, C, C, 'chute');
  }
  k.ok = k.seat.ready && k.front.ready && k.stage.alive && (!AIM || !k.podSeat || k.podSeat.ready);   // the model streams in, and a dropped context comes back; meanwhile the 2D art stands in
}
function blit3D(g, region, x, y, size) {   // copies region B (front view) or C (parachute), centred at (x, y), size px square
  const [sx, sw] = region === 'C' ? [b3.wA + b3.B, b3.C] : [b3.wA, b3.B];
  g.drawImage(b3.stage.canvas, sx, 0, sw, sw, x - size / 2, y - size / 2, size, size);
}
const has3D = () => b3 && b3.ok;

// What the Brainer feels right now: a reaction set by an event for a moment, or else what the flight implies.
const mood = { ex: 'rest', t0: 0, set: '', until: 0 };
let lastInput = performance.now();
function feel(ex, ms) { mood.set = ex; mood.until = performance.now() + ms; }
function moodNow(now) {
  let ex;
  if (mood.set && now < mood.until) ex = mood.set;
  else {
    const r = round, ended = r && r.endAt && now - r.endAt > 6000;
    if (r && r.status === 'choose') ex = 'focus';
    else if (r && r.status === 'flying') ex = 'gulp';
    else if (r && r.status === 'crashed' && !ended) ex = 'sad';
    else if (r && r.status === 'cashed' && !ended) { const m = multAt(r.d, r.n, r.rtp); ex = m >= 10 ? 'ecstatic' : m >= 3 ? 'excited' : 'happy'; }
    else ex = now - lastInput > 25000 ? 'sleepy' : 'rest';
  }
  if (ex !== mood.ex) { mood.ex = ex; mood.t0 = now; }
  return mood;
}
const lookNow = now => round && round.status === 'choose' ? (view.hover >= 0 ? offC(view.hover) / 2 : Math.sin(now / 1700) * 0.5) : round && round.status === 'flying' ? offC(view.pick) / 2 : Math.sin(now / 2300) * 0.4;

const ZP = 2.2, Z_WAIT = 9, Z_FAR = 40, G_CRUISE = 5;   // depths: plane, waiting gates, new gates; ground drop in the air
let G_H = G_CRUISE;   // the ground's drop below the camera: low while the plane is parked on the runway, G_CRUISE in flight
let W = 0, H = 0, dpr = 1, F = 500, HY = 200, PX = 0, PY = 0, PS = 0.8, SPREAD = 2, RING = 1, last = 0;
let shake = 0, flashAt = -1e9, flashCol = '255,255,255', nextDropAt = 0, sky = null;
const view = { d: LEVELS[0], n: 0, rtp: cfg.rtp, camX: 0, gz: Z_WAIT, introT: -1e9, pick: -1, row: null, struck: false, scroll: 0, fieldX: 0, speed: 1, bank: 0, hit: [], hover: -1 };
const plane = { state: 'cruise', t0: 0, x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, brain: 1 };
let chute = null, iris = null, outro = null, wipe = null, parts = [], booms = [], drops = [], texts = [];
let clouds = [];

function layout() {
  W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  F = H * 0.95; HY = H * 0.4; PX = W / 2; PY = H * 0.74;
  PS = clamp(Math.min(W / 900, H / 560), 0.45, 1.25);
  const dx = Math.min(W * 0.17, 170);   // gap between waiting gates on screen
  SPREAD = dx * Z_WAIT / F; RING = Math.min(dx * 0.34, 56) * Z_WAIT / F;
  stage.classList.toggle('slim', H < 520);   // a short stage: the readout shrinks to one line (style.css), or it covers the hoops; by the stage's own height, so the site's frame and full screen get it too. 520, not FogRush's 480: at 761-1299 px wide the full readout and the hoops are both bigger and meet up to ~510 px
  paintSky();
}
new ResizeObserver(layout).observe(stage);

function paintSky() {
  sky = document.createElement('canvas'); sky.width = Math.max(1, Math.round(W * dpr)); sky.height = Math.max(1, Math.round((HY + 2) * dpr));
  const g = sky.getContext('2d'); g.scale(dpr, dpr); world.sky(g);
}

/* ---------- worlds: what the flight passes over ---------- */
// The meadow is the game's world: the Brainer world's countryside, the same land FogRush is played in. Two other
// directions stay reachable for comparison: ?world=clouds (a sea of clouds at sunset) and ?world=city (Brainer city at
// dusk); ?worlds adds a switcher to the stage.
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix = (a, b, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const groundY = z => altY(G_H, z);
const halfSpan = z => (W / 2) * z / F + 4;   // half the visible ground width at depth z, in world units, plus a margin
const gpt = (u, z, alt = G_H) => [projX(u + view.fieldX, z), altY(alt, z)];   // a point on the ground grid
function poly(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } }
function forRows(D, maxZ, fn) {   // ground rows from far to near; z0 is a row's near edge, z1 its far edge
  const base = Math.floor(view.scroll / D);
  for (let k = Math.ceil(maxZ / D) + 1; k >= 0; k--) {
    const row = base + k, z0 = row * D - view.scroll, z1 = z0 + D;
    if (z1 > 0.6) fn(row, Math.max(0.6, z0), z1);
  }
}
function sprite(w, h, paint) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); return c; }
function puffCloud(top, mid, under) {   // a cumulus lit from the upper left, with a flat, soft base
  return sprite(300, 170, g => {
    const blob = (x, y, r, c0, c1) => { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    const P = [[66, 112, 38], [112, 86, 52], [172, 76, 58], [226, 100, 44], [146, 112, 46], [258, 118, 30], [92, 120, 34]];
    P.forEach(([x, y, r]) => blob(x, y + 8, r, mid, under));
    P.forEach(([x, y, r]) => blob(x - 7, y - 6, r * 0.84, top, mid));
    g.globalCompositeOperation = 'destination-out';
    const f = g.createLinearGradient(0, 120, 0, 150); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = f; g.fillRect(0, 120, 300, 50);
  });
}
function skyBase(g, stops) { const gr = g.createLinearGradient(0, 0, 0, HY); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, W, HY + 2); }
function skySun(g, x, y, r, halo, core) {
  const h = g.createRadialGradient(x, y, r * 0.5, x, y, r * 6); h.addColorStop(0, halo); h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h; g.fillRect(0, 0, W, HY + 2);
  g.fillStyle = core; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
function skyHills(g, col, amp, f, seed) {   // a band of rolling hills standing on the horizon
  g.beginPath(); g.moveTo(0, HY + 2);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, HY - amp * (0.55 + 0.3 * Math.sin(x * f + seed) + 0.15 * Math.sin(x * f * 2.7 + seed * 3)));
  g.lineTo(W, HY + 2); g.closePath(); g.fillStyle = col; g.fill();
}
function haze(col, depth) { const g = ctx.createLinearGradient(0, HY - 1, 0, HY + H * depth); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); ctx.fillStyle = g; ctx.fillRect(0, HY - 1, W, H * depth + 1); }

// The country road keeps a few unit left of the plane's course: each time the course shifts, the road bends toward it
// beyond the horizon, so the bend never appears in view.
let roadPts = [[-1e9, -3.5]];
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function roadBase(zw) {
  let i = roadPts.length - 1; while (i > 0 && roadPts[i][0] > zw) i--;
  const [z0, u0] = roadPts[i], nx = roadPts[i + 1];
  return nx ? lerp(u0, nx[1], smooth01((zw - z0) / (nx[0] - z0))) : u0;
}
function roadAt(zw) { return roadBase(zw) + 1.4 * Math.sin(zw * 0.03); }
function rerouteRoad() {
  const target = -view.fieldX - 3.5, far = view.scroll + 66;
  if (Math.abs(roadBase(far + 30) - target) < 0.5) return;
  const near = view.scroll - 20, keep = roadPts.filter(q => q[0] > near && q[0] < far);
  roadPts = [[near, roadBase(near)], ...keep, [far, roadBase(far)], [far + 30, target]];   // the visible road stays put; only the far end bends
}
// Where a parachute lands in each world: the road, the avenue, or the cloud tops under the camera.
const landOn = { fields: zw => ({ u: roadAt(zw), alt: G_H }), night: zw => ({ u: roadAt(zw), alt: G_H }), space: () => ({ u: view.camX - view.fieldX, alt: G_H }), city: () => ({ u: 0, alt: G_H }), clouds: () => ({ u: view.camX - view.fieldX, alt: G_H - 0.35 }) };

/* The valley (Tornike's pick, 2026-10-26): a sky and horizon rendered in Blender (physical sky, golden hour, real
   clouds), and below it the valley's farmland, woods and lakes, a top-down Blender render laid onto the ground in
   perspective so it streams under the plane. On it: the country road (where the parachute lands), the airfield's
   asphalt runway where the plane parks, a plain hangar and the tower, and the drifting clouds' shadows. */
const AIRFIELD = { hangar: new Image(), tower: new Image() };

let airfield = null;   // where the plane last parked: { zw, u } on the ground
const VALLEY_SKY = new Image(), VALLEY_GROUND = new Image(), SKY_HORIZON = 0.553;   // the horizon's row in the sky render, as a fraction of its height
VALLEY_SKY.onload = () => { if (worldKey === 'fields') paintSky(); };

let groundPat = null, groundFar = null;   // the farmland as a seamless pattern (mirrored 2 × 2), and a softened copy for the far rows
VALLEY_GROUND.onload = () => {
  const w = VALLEY_GROUND.naturalWidth, h = VALLEY_GROUND.naturalHeight, tile = sprite(w * 2, h * 2, g => {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.save(); g.translate(sx < 0 ? w * 2 : 0, sy < 0 ? h * 2 : 0); g.scale(sx, sy); g.drawImage(VALLEY_GROUND, 0, 0); g.restore(); }
  });
  const soft = sprite(w / 2, h / 2, g => g.drawImage(tile, 0, 0, w / 2, h / 2));   // a quarter-size copy: far rows sample it, so the fields don't shimmer
  groundPat = Object.assign(ctx.createPattern(tile, 'repeat'), { tw: w * 2, th: h * 2 });
  groundFar = Object.assign(ctx.createPattern(soft, 'repeat'), { tw: w / 2, th: h / 2 });
};
const TEX_U = 64;   // world units one mirrored tile spans: its fields come out about as big as the old patchwork's
// The ground, one thin band per screen row (finer near the horizon): each band shows the texture's row at that band's
// depth, stretched across the screen as the perspective there needs (as a mode 7 floor).
function groundTexture() {
  if (!groundPat) { ctx.fillStyle = '#7fa94f'; ctx.fillRect(0, HY, W, H - HY); return; }
  const cx = view.camX - view.fieldX;
  for (let y = Math.ceil(HY) + 1; y < H;) {
    const bh = y - HY < 40 ? 1 : y - HY < 140 ? 2 : 3, z = G_H * F / (y + bh / 2 - HY), far = z > 26, pat = far ? groundFar : groundPat;
    const a = z / F * pat.tw / TEX_U, b = (cx - W / 2 * z / F) / TEX_U * pat.tw, ty = (z + view.scroll) / TEX_U * pat.th;
    pat.setTransform(new DOMMatrix([1 / a, 0, 0, bh, -b / a, y - ty * bh]));   // texture x = a·x + b along the band; the band shows texture row ty
    ctx.fillStyle = pat; ctx.fillRect(0, y, W, bh); y += bh;
  }
}
const tint = document.createElement('canvas'), tg = tint.getContext('2d');
// A sprite standing on the ground at (u, z), wUnits wide. It is drawn after the horizon haze and takes the haze its
// feet stand in evenly ([colour, depth] as passed to haze()), so the haze never cuts a hard line across it.
function standing(img, u, z, wUnits, hz) {
  if (!img.complete || !img.naturalWidth || z < 0.8) return;
  const [x, y] = gpt(u, z), w = wUnits * F / z, h = w * img.naturalHeight / img.naturalWidth;
  if (x + w / 2 < 0 || x - w / 2 > W) return;
  const k = hz ? clamp(1 - (y - HY) / (H * hz[1]), 0, 1) * parseFloat(hz[0].match(/([\d.]+)\)$/)[1]) : 0;
  if (k < 0.01) { ctx.drawImage(img, x - w / 2, y - h, w, h); return; }
  const tw = Math.max(1, Math.ceil(w * dpr)), th = Math.max(1, Math.ceil(h * dpr));
  if (tint.width < tw) tint.width = tw;
  if (tint.height < th) tint.height = th;
  tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, tint.width, tint.height); tg.drawImage(img, 0, 0, tw, th);   // all of it: smoothing samples past the edges
  tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = hz[0].replace(/[\d.]+\)$/, k.toFixed(3) + ')'); tg.fillRect(0, 0, tw, th);
  ctx.drawImage(tint, 0, 0, tw, th, x - w / 2, y - h, w, h);
}
function groundFields() {
  const D = 3.2, road = roadAt, HAZE = ['rgba(226,232,246,.92)', 0.2], tall = [];
  groundTexture();
  forRows(D, 64, (row, z0, z1) => {
    if (groundY(z1) > H) return;
    const zm = (z0 + z1) / 2, near = zm < 28;
    const d0 = road(z0 + view.scroll), d1 = road(z1 + view.scroll);
    poly([gpt(d0 - 0.55, z0), gpt(d0 + 0.55, z0), gpt(d1 + 0.55, z1), gpt(d1 - 0.55, z1)], 'rgba(214,198,160,.95)');   // the gravel country road
    if (airfield) {   // the airfield: the road widens into an asphalt runway where the plane parks; the hangar and tower beside it
      const a = airfield, w0 = z0 + view.scroll, w1 = z1 + view.scroll;
      if (w1 > a.zw - 5 && w0 < a.zw + 40) {
        const za = Math.max(z0, a.zw - 5 - view.scroll), zb = Math.min(z1, a.zw + 40 - view.scroll);
        poly([gpt(d0 - 1.3, za), gpt(d0 + 1.3, za), gpt(d1 + 1.3, zb), gpt(d1 - 1.3, zb)], '#44474f');
        if (row % 2 === 0) { const [x, y] = gpt(d0, z0 + D * 0.3), [x2, y2] = gpt(d0, z0 + D * 0.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.lineWidth = Math.max(1, 0.12 * F / zm); ctx.strokeStyle = '#f2f2f2'; ctx.stroke(); }
        for (const sd of [-1, 1]) { const [x, y] = gpt(d0 + sd * 1.42, z0), r = Math.max(1, 0.06 * F / zm); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#bff8ff'; ctx.fill(); }   // runway lights
      }
      for (const [img, du, dz, wu] of [[AIRFIELD.tower, 3.2, 8, 1.3], [AIRFIELD.hangar, -3.8, 3.2, 3.4]]) {
        const zh = a.zw + dz - view.scroll; if (zh >= z0 && zh < z1) tall.push([img, a.u + du, zh, wu]);   // drawn after the haze
      }
    }
    if (near && row % 2 === 0) { const za = z0 + D * 0.15, zb = z0 + D * 0.55, ra = road(za + view.scroll), rb = road(zb + view.scroll); ctx.beginPath(); ctx.moveTo(...gpt(ra, za)); ctx.lineTo(...gpt(rb, zb)); ctx.lineWidth = Math.max(1, 0.05 * F / zm); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke(); }
  });
  for (const c of clouds) {   // the drifting clouds' shadows on the land
    if (c.alt < 0.5 || c.z < 1.5) continue;
    const rx = c.s * 1.25 * F / c.z, x = projX(c.x, c.z), y = groundY(c.z), ry = rx * Math.min(1, G_H / c.z);
    if (x + rx < 0 || x - rx > W || y - ry > H) continue;
    ctx.globalAlpha = clamp((60 - c.z) / 14, 0, 1); ell(x, y, rx, ry); ctx.fillStyle = 'rgba(20,30,60,.16)'; ctx.fill(); ctx.globalAlpha = 1;
  }
  haze(...HAZE);
  for (const t of tall) standing(...t, HAZE);   // far to near, as the rows were
}
function skyFields(g) {
  if (VALLEY_SKY.complete && VALLEY_SKY.naturalWidth) {   // the rendered sky, scaled so its horizon lands on the game's (HY)
    const iw = VALLEY_SKY.naturalWidth, ih = VALLEY_SKY.naturalHeight, k = Math.max(W / iw, (HY + 2) / (SKY_HORIZON * ih));
    g.drawImage(VALLEY_SKY, (W - iw * k) / 2, HY - SKY_HORIZON * ih * k, iw * k, ih * k); return;
  }
  skyBase(g, [[0, '#5b4af6'], [0.5, '#8f88ff'], [0.85, '#cdd0ff'], [1, '#eef1ff']]);
  skySun(g, W * 0.8, HY * 0.34, clamp(H * 0.045, 16, 30), 'rgba(255,240,250,.7)', '#fffaf2');
  skyHills(g, '#cfccf7', H * 0.05, 0.004, 1);
  skyHills(g, '#bcd2b6', H * 0.028, 0.009, 2);
}

/* A sea of clouds at sunset: rows of lit cloud tops rolling toward the plane, with peaks breaking through. */
let spires = [];
function spawnSpire(s, far) {
  const sd = Math.random() < 0.5 ? -1 : 1;
  return Object.assign(s || {}, { x: view.camX + sd * (6 + Math.random() * 11), z: far ? 58 + Math.random() * 14 : 10 + Math.random() * 56, h: 2.6 + Math.random() * 2.4, w: 2 + Math.random() * 1.6 });
}
function drawSpire(s) {
  if (s.z < 1.4) return;
  const P = (u, alt) => [projX(u, s.z), altY(alt, s.z)], base = G_H + 0.5, top = G_H - s.h;
  const L = P(s.x - s.w, base), R = P(s.x + s.w, base), A = P(s.x + s.w * 0.08, top), M1 = P(s.x - s.w * 0.5, G_H - s.h * 0.45), M2 = P(s.x + s.w * 0.55, G_H - s.h * 0.5), B = P(s.x + s.w * 0.15, base);
  if (Math.max(L[0], R[0]) < 0 || Math.min(L[0], R[0]) > W) return;
  ctx.globalAlpha = clamp((72 - s.z) / 16, 0, 1);
  poly([L, M1, A, B], '#b9a0f1'); poly([A, M2, R, B], '#7457c9');
  const q = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  poly([A, q(A, M1, 0.42), q(A, B, 0.22), q(A, M2, 0.36)], '#fff1fb');   // snow on the peak
  ctx.globalAlpha = 1;
}
function groundClouds() {
  const D = 2.3, P = 1.55, cx = view.camX - view.fieldX;
  const base = ctx.createLinearGradient(0, HY, 0, H); base.addColorStop(0, '#ffd8e2'); base.addColorStop(0.45, '#e8c6f1'); base.addColorStop(1, '#a28cef');
  ctx.fillStyle = base; ctx.fillRect(0, HY, W, H - HY);
  const sp = spires.slice().sort((a, b) => b.z - a.z); let si = 0;
  forRows(D, 66, (row, z0, z1) => {
    while (si < sp.length && sp[si].z >= z0) drawSpire(sp[si++]);
    if (groundY(z1) > H + 60) return;
    const y0 = groundY(z0), f = Math.pow(clamp(z0 / 66, 0, 1), 0.7), hs = halfSpan(z0), k0 = Math.floor((cx - hs) / P) - 1, k1 = Math.ceil((cx + hs) / P) + 1;
    let maxR = 0; ctx.beginPath();
    for (let k = k0; k <= k1; k++) {
      const R = 0.9 + hash(k, row) * 0.8, u = k * P + (hash(row, k) - 0.5) * 0.6, rx = R * F / z0, ry = rx * 0.6;
      const x = projX(u + view.fieldX, z0), y = y0 - ry * (0.1 + 0.3 * hash(k + 9, row));
      if (x + rx < 0 || x - rx > W) continue;
      ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); maxR = Math.max(maxR, ry);
    }
    const g = ctx.createLinearGradient(0, y0 - maxR * 1.35, 0, y0 + maxR * 0.7);
    g.addColorStop(0, mix('#fff9f3', '#ffd9e3', f)); g.addColorStop(0.5, mix('#f6def3', '#f2cde6', f)); g.addColorStop(1, mix('#b29ef1', '#e3c4ee', f));
    ctx.fillStyle = g; ctx.fill();
  });
  while (si < sp.length) drawSpire(sp[si++]);
  haze('rgba(255,214,226,.9)', 0.16);
}
function skyClouds(g) {
  skyBase(g, [[0, '#2b1fa0'], [0.36, '#6a3fe2'], [0.64, '#cf68d6'], [0.84, '#ff9fb5'], [1, '#ffd7aa']]);
  skySun(g, W * 0.3, HY * 0.88, clamp(H * 0.06, 22, 44), 'rgba(255,214,170,.8)', '#fff4de');
  let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = 'rgba(255,225,240,.22)';
  for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(rnd() * W, HY * (0.15 + rnd() * 0.5), W * (0.06 + rnd() * 0.12), 2 + rnd() * 3, 0, 0, 7); g.fill(); }   // high cirrus
  for (let i = 0; i < 5; i++) {   // distant peaks on the horizon
    const x = W * (0.08 + i * 0.22 + rnd() * 0.08), w = W * (0.05 + rnd() * 0.05), h = H * (0.03 + rnd() * 0.04);
    g.beginPath(); g.moveTo(x - w, HY + 2); g.lineTo(x, HY - h); g.lineTo(x + w, HY + 2); g.closePath(); g.fillStyle = '#b39be6'; g.fill();
    g.beginPath(); g.moveTo(x, HY - h); g.lineTo(x + w, HY + 2); g.lineTo(x + w * 0.2, HY + 2); g.closePath(); g.fillStyle = '#9a80dc'; g.fill();
    g.beginPath(); g.moveTo(x, HY - h); g.lineTo(x - w * 0.3, HY - h * 0.7); g.lineTo(x + w * 0.25, HY - h * 0.68); g.closePath(); g.fillStyle = '#fff0fa'; g.fill();
  }
}

/* Brainer city at dusk: lit blocks either side of a wide avenue under the flight path, with streetlights and traffic. */
const CITY = [['#45329a', '#2e2270', '#241a5a'], ['#3b2b86', '#291e63', '#1f1650'], ['#52389f', '#35267a', '#281d61']];
function groundCity(now) {
  const D = 4.4, CW = 4.4, cx = view.camX - view.fieldX, sc = view.scroll;
  ctx.fillStyle = '#1d1550'; ctx.fillRect(0, HY, W, H - HY);
  poly([gpt(-3.5, 1), gpt(3.5, 1), gpt(3.5, 64), gpt(-3.5, 64)], '#2a1f68');   // the avenue
  const dot = (u, z, alt, r, col) => { if (z < 2.5) return; const [x, y] = gpt(u, z, alt), rr = clamp(r * F / z, 1, 16); if (x < -rr || x > W + rr || y > H + rr) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); };
  for (let k = 0; k < 30; k++) {   // streetlights along both kerbs, and headlights and tail lights in the lanes
    const z = ((k * 2.2 - sc) % 66 + 66) % 66 + 1;
    for (const u of [-3.6, 3.6]) { if (z < 16) dot(u, z, G_H - 0.02, 0.5, 'rgba(255,195,107,.16)'); dot(u, z, G_H - 0.02, 0.14, '#ffc36b'); }
    const zo = ((k * 5.3 - sc * 1.7) % 66 + 66) % 66 + 1, zs = ((k * 4.1 + 2 - sc * 0.45) % 66 + 66) % 66 + 1;
    if (k < 14) { dot(-1.5, zo, G_H, 0.1, '#fff6d8'); dot(-1.0, zo, G_H, 0.1, '#fff6d8'); dot(1.0, zs, G_H, 0.09, '#ff4d6d'); dot(1.5, zs, G_H, 0.09, '#ff4d6d'); }
  }
  forRows(D, 62, (row, z0) => {
    const zn = row * D - sc + 0.7, zf = zn + 3;
    if (zf < 1.2 || groundY(zf) > H) return;
    const zN = Math.max(1, zn), hs = halfSpan(zN), c0 = Math.floor((cx - hs) / CW), c1 = Math.ceil((cx + hs) / CW), list = [];
    for (let c = c0; c <= c1; c++) if (c !== -1 && c !== 0) list.push(c);
    list.sort((a, b) => Math.abs(b * CW + 2.2 - cx) - Math.abs(a * CW + 2.2 - cx));   // outer blocks first, so nearer ones overlap them
    const warm = new Path2D(), cool = new Path2D();
    for (const c of list) {
      const ua = c * CW + 0.7, ub = ua + 3, hh = hash(c, row), h = hh > 0.93 ? 3.3 : 0.5 + 2.3 * hh * hh, top = G_H - h, pal = CITY[Math.floor(hash(row, c) * CITY.length)];
      const side = (ua + ub) / 2 > cx ? ua : ub;
      poly([gpt(side, zN), gpt(side, zN, top), gpt(side, zf, top), gpt(side, zf)], pal[2]);
      poly([gpt(ua, zN, top), gpt(ub, zN, top), gpt(ub, zf, top), gpt(ua, zf, top)], pal[0]);
      poly([gpt(ua, zN), gpt(ub, zN), gpt(ub, zN, top), gpt(ua, zN, top)], pal[1]);
      if (zN < 24) {
        const floors = Math.max(1, Math.round(h * 2)), fh = (h - 0.25) / floors;
        for (let fy = 0; fy < floors; fy++) for (let fx = 0; fx < 3; fx++) {
          const v = hash(c * 31 + fx, row * 17 + fy); if (v < 0.42) continue;
          const [x0, y0] = gpt(ua + 0.4 + fx * 0.85, zN, G_H - 0.15 - fy * fh), [x1, y1] = gpt(ua + 0.85 + fx * 0.85, zN, G_H - 0.15 - fy * fh - fh * 0.55);
          (v > 0.9 ? cool : warm).rect(x0, y1, x1 - x0, y0 - y1);
        }
      }
      const nv = hash(c + 5, row);
      if (nv < 0.14) { ctx.beginPath(); ctx.moveTo(...gpt(ua, zN, top)); ctx.lineTo(...gpt(ub, zN, top)); ctx.lineWidth = Math.max(1.5, 0.09 * F / zN); ctx.strokeStyle = nv < 0.07 ? '#ff5fb3' : '#55e6ff'; ctx.stroke(); }   // neon roof edge
      if (h > 3 && (now / 600 | 0) % 2) { const [x, y] = gpt((ua + ub) / 2, (zN + zf) / 2, top - 0.15); ctx.fillStyle = '#ff3b58'; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, 0.12 * F / zN), 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#ffd27a'; ctx.fill(warm); ctx.fillStyle = '#8fe8ff'; ctx.fill(cool);
  });
  haze('rgba(223,95,174,.5)', 0.15);
}
function skyCity(g) {
  skyBase(g, [[0, '#0c0a2c'], [0.42, '#271b6e'], [0.72, '#6c35c9'], [0.9, '#df5fae'], [1, '#ff9c7d']]);
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) { const y = rnd() * HY * 0.62; g.fillStyle = `rgba(255,255,255,${(0.9 - y / HY) * (0.4 + rnd() * 0.6)})`; g.fillRect(rnd() * W, y, 1 + rnd() * 1.2, 1 + rnd() * 1.2); }
  skySun(g, W * 0.78, HY * 0.3, clamp(H * 0.032, 12, 24), 'rgba(255,220,240,.35)', '#fff2df');
  for (const [col, hmax, lit] of [['#4a2f99', 0.06, 0], ['#2f2170', 0.1, 1]]) {   // two layers of skyline
    for (let x = -10; x < W + 10;) {
      const w = W * (0.012 + rnd() * 0.03), h = H * (0.015 + rnd() * hmax);
      g.fillStyle = col; g.fillRect(x, HY - h, w, h + 2);
      if (lit) { g.fillStyle = 'rgba(255,207,122,.75)'; for (let wy = HY - h + 3; wy < HY - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (rnd() < 0.3) g.fillRect(wx, wy, 1.5, 1.5); }
      x += w + rnd() * 3;
    }
  }
}

// Night airspace, Aim & Break's world: the same valley and airfield after dark, its towns lit, a last orange glow on
// the horizon (Tornike's storyboard, 2026-10-27).
function skyNight(g) {
  skyBase(g, [[0, '#040a1a'], [0.55, '#0a1733'], [0.84, '#17264d'], [0.95, '#4a3552'], [1, '#d9733a']]);
  let s = 23; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) { const y = rnd() * HY * 0.75; g.fillStyle = `rgba(220,230,255,${(0.95 - y / HY) * (0.3 + rnd() * 0.7)})`; g.fillRect(rnd() * W, y, 0.8 + rnd() * 1.3, 0.8 + rnd() * 1.3); }
  const glow = g.createRadialGradient(W * 0.5, HY, 0, W * 0.5, HY, W * 0.6); glow.addColorStop(0, 'rgba(255,140,60,.28)'); glow.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, HY + 2);
  skyHills(g, '#1a2647', H * 0.05, 0.006, 2); skyHills(g, '#111a33', H * 0.028, 0.011, 5);
}
function groundNight(now) {
  groundFields(now);
  ctx.fillStyle = 'rgba(3,8,24,.8)'; ctx.fillRect(0, HY - 1, W, H - HY + 1);   // dusk falls over the valley
  forRows(1.6, 60, (row, z0, z1) => {   // town lights, in clusters, fading into the distance
    const zm = (z0 + z1) / 2; if (groundY(zm) > H) return;
    for (let i = 0; i < 26; i++) {
      const u = (hash(row, i) - 0.5) * 2 * halfSpan(zm) - view.fieldX;
      if (hash(row >> 2, Math.floor(u / 9) + 977) < 0.62 || Math.abs(u - roadAt(zm + view.scroll)) < 2.5) continue;   // in towns, never on the road
      const [x, y] = gpt(u, z0 + (z1 - z0) * hash(i, row + 5)); if (x < -4 || x > W + 4) continue;
      const r = clamp(0.03 * F / zm, 0.7, 2.6), warm = hash(row, i + 50) < 0.8;
      ctx.globalAlpha = clamp((62 - zm) / 20, 0, 1) * (0.55 + 0.45 * hash(i, row));
      ctx.fillStyle = warm ? '#ffb45a' : '#cfe3ff'; ctx.fillRect(x - r / 2, y - r / 2, r, r);
      if (r > 1.4) { ell(x, y, r * 2.2, r * 2.2); ctx.fillStyle = warm ? 'rgba(255,160,70,.18)' : 'rgba(180,210,255,.15)'; ctx.fill(); }
    }
  });
  ctx.globalAlpha = 1;
  if (airfield) forRows(3.2, 64, (row, z0) => {   // the runway's edge lights, lit again over the dark
    const a = airfield, w0 = z0 + view.scroll; if (w0 < a.zw - 5 || w0 > a.zw + 40) return;
    const d0 = roadAt(w0);
    for (const sd of [-1, 1]) { const [x, y] = gpt(d0 + sd * 1.42, z0), r = Math.max(1.2, 0.07 * F / Math.max(1, z0)); ell(x, y, r * 3, r * 3); ctx.fillStyle = 'rgba(255,170,70,.25)'; ctx.fill(); ell(x, y, r, r); ctx.fillStyle = '#ffd08a'; ctx.fill(); }
  });
}

// Deep space, Aim & Break's world (Tornike, 2026-10-27): a nebula, a ringed planet, and stars streaming past.
function skySpace(g) {
  skyBase(g, [[0, '#04020d'], [0.55, '#0c0828'], [1, '#160f3a']]);
  for (const [x, y, rad, col] of [[0.22, 0.4, 0.55, 'rgba(120,50,220,.32)'], [0.78, 0.75, 0.45, 'rgba(30,170,210,.2)'], [0.55, 0.15, 0.35, 'rgba(220,60,170,.16)']]) {
    const n = g.createRadialGradient(W * x, HY * y, 0, W * x, HY * y, W * rad); n.addColorStop(0, col); n.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = n; g.fillRect(0, 0, W, HY + 2);
  }
  const fade = g.createLinearGradient(0, HY * 0.6, 0, HY + 2); fade.addColorStop(0, 'rgba(22,15,58,0)'); fade.addColorStop(1, '#160f3a'); g.fillStyle = fade; g.fillRect(0, HY * 0.6, W, HY * 0.4 + 2);   // meets the lower half without a seam
  let s = 41; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { const b = rnd(); g.fillStyle = `rgba(${b < 0.15 ? '255,220,200' : b < 0.3 ? '190,220,255' : '255,255,255'},${0.3 + rnd() * 0.7})`; g.fillRect(rnd() * W, rnd() * (HY + 2), 0.7 + rnd() * 1.4, 0.7 + rnd() * 1.4); }
  const pr = clamp(H * 0.085, 26, 70), px = W * 0.8, py = HY * 0.36;   // a ringed planet
  g.save(); g.translate(px, py); g.rotate(-0.35);
  g.beginPath(); g.ellipse(0, 0, pr * 2, pr * 0.5, 0, Math.PI, Math.PI * 2); g.lineWidth = pr * 0.16; g.strokeStyle = 'rgba(255,200,150,.55)'; g.stroke();
  const pg = g.createRadialGradient(-pr * 0.4, -pr * 0.4, pr * 0.1, 0, 0, pr); pg.addColorStop(0, '#ffcf9a'); pg.addColorStop(0.55, '#d06a7a'); pg.addColorStop(1, '#3a1a5a');
  g.beginPath(); g.arc(0, 0, pr, 0, 7); g.fillStyle = pg; g.fill();
  g.beginPath(); g.ellipse(0, 0, pr * 2, pr * 0.5, 0, 0, Math.PI); g.stroke();
  g.restore();
}
// Tornike's pick on the second board: "Nebula cathedral", a painted backdrop with cyan and violet nebula walls at the
// sides and calm space in the middle. It fills the stage, drifting and breathing very slowly, with stars streaking past.
const SPACE_BG = new Image(); SPACE_BG.src = 'assets/aim/space.webp';
// Things pass now and then (Tornike: "can you make background more moving?"): asteroids tumbling across at different
// now and then, fast, along the top or bottom edge; frequent shooting stars; stars twinkling. All behind the drones and the pod.
const ROCKS = [1, 2, 3, 4, 5].map(n => { const im = new Image(); im.src = `assets/aim/rock${n}.webp`; return im; });
const fx2 = { rocks: [], comets: [], nextRock: 0, nextComet: 0 };
function spaceLife(now, dt) {
  if (reduced) return;
  if (now > fx2.nextRock) {   // now and then an asteroid flies by along the top or bottom edge, behind everything (Tornike: fewer, faster)
    const sd = Math.random() < 0.5 ? -1 : 1, band = Math.random() < 0.6 ? 0.06 + Math.random() * 0.16 : 0.66 + Math.random() * 0.14;
    const size = (34 + Math.random() * 46) * clamp(PS * 1.3, 0.6, 1.4);
    fx2.rocks.push({ img: ROCKS[Math.floor(Math.random() * ROCKS.length)], x: sd < 0 ? -size : W + size, y: H * band, vx: -sd * (0.32 + Math.random() * 0.22) * (W / 900), vy: (Math.random() - 0.3) * 0.05, size, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.004, near: false, a: 0.8 + 0.2 * Math.random() });
    fx2.nextRock = now + 7000 + Math.random() * 7000;
  }
  if (now > fx2.nextComet) {   // shooting stars, often, sometimes two together
    for (let n = Math.random() < 0.3 ? 2 : 1; n > 0; n--) {
      const sd = Math.random() < 0.5 ? -1 : 1, sp = (0.7 + Math.random() * 0.6) * (W / 900);
      fx2.comets.push({ x: W * (0.1 + Math.random() * 0.8), y: H * (0.02 + Math.random() * 0.3), vx: sd * sp, vy: sp * (0.25 + Math.random() * 0.3), t0: now + n * 140, dur: 650 + Math.random() * 450, w: 1.5 + Math.random() * 1.5 });
    }
    fx2.nextComet = now + 1200 + Math.random() * 2200;
  }
  for (const q of fx2.rocks) { q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; }
  fx2.rocks = fx2.rocks.filter(q => q.x > -q.size * 2 && q.x < W + q.size * 2);
  fx2.comets = fx2.comets.filter(c => now - c.t0 < c.dur);   // (a comet waiting for its t0 counts as live)
}
function drawSpaceLife(now, near) {
  if (reduced) return;
  if (!near) {
    for (let i = 0; i < 26; i++) {   // twinkles
      const tw = Math.sin(now / (500 + 400 * hash(i, 2)) + i * 1.7); if (tw < 0.55) continue;
      const x = hash(i, 5) * W, y = hash(i, 9) * H * 0.85, r = (1.5 + 2.5 * hash(i, 4)) * (tw - 0.55) / 0.45;
      ctx.globalAlpha = (tw - 0.55) / 0.45 * 0.9; star(x, y, r * 2.2, 4, 0.25); ctx.fillStyle = hash(i, 8) < 0.3 ? '#bfe9ff' : '#ffffff'; ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of fx2.comets) {
      const t = now - c.t0; if (t < 0) continue;
      const q = t / c.dur, x = c.x + c.vx * t, y = c.y + c.vy * t, a = Math.sin(q * Math.PI);
      const tx = x - c.vx * 220, ty = y - c.vy * 220, g = ctx.createLinearGradient(tx, ty, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(220,245,255,${0.9 * a})`);
      ctx.lineCap = 'round'; ctx.lineWidth = c.w; ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = a; ell(x, y, c.w * 1.3, c.w * 1.3); ctx.fillStyle = '#ffffff'; ctx.fill(); const hg = ctx.createRadialGradient(x, y, 0, x, y, 10 * c.w); hg.addColorStop(0, 'rgba(190,240,255,.55)'); hg.addColorStop(1, 'rgba(190,240,255,0)'); ctx.fillStyle = hg; ctx.fillRect(x - 10 * c.w, y - 10 * c.w, 20 * c.w, 20 * c.w); ctx.globalAlpha = 1;
    }
  }
  for (const q of fx2.rocks) {
    if (q.near !== !!near || !q.img.complete || !q.img.naturalWidth) continue;
    ctx.save(); ctx.globalAlpha = q.a; ctx.translate(q.x, q.y); ctx.rotate(q.rot);
    const w = q.size, h = q.size * q.img.naturalHeight / q.img.naturalWidth;
    if (!q.near) ctx.filter = 'brightness(.8) saturate(.8)';
    ctx.drawImage(q.img, -w / 2, -h / 2, w, h); ctx.restore();
  }
}
function groundSpace(now) {
  if (SPACE_BG.complete && SPACE_BG.naturalWidth) {
    const iw = SPACE_BG.naturalWidth, ih = SPACE_BG.naturalHeight, k = Math.max(W / iw, H / ih) * (1.06 + (reduced ? 0 : 0.03 * Math.sin(now / 9000)));
    const dx = reduced ? 0 : Math.sin(now / 13000) * W * 0.012 - view.bank * W * 0.02, dy = reduced ? 0 : Math.cos(now / 11000) * H * 0.008;
    ctx.drawImage(SPACE_BG, (W - iw * k) / 2 + dx, (H - ih * k) / 2 + dy, iw * k, ih * k);
    drawSpaceLife(now, false);
  } else {
    const gr = ctx.createLinearGradient(0, HY, 0, H); gr.addColorStop(0, '#160f3a'); gr.addColorStop(1, '#06040f'); ctx.fillStyle = gr; ctx.fillRect(0, HY - 1, W, H - HY + 1);
  }
  ctx.lineCap = 'round';
  forRows(2.4, 56, (row, z0, z1) => {   // stars all round, streaking past as the plane flies
    for (let i = 0; i < 9; i++) {
      const z = z0 + (z1 - z0) * hash(i, row + 3); if (z < 1) continue;
      const u = (hash(row, i) - 0.5) * 2.2 * halfSpan(z) + view.camX, alt = lerp(-HY, H - HY, hash(i + 40, row)) * z / F;
      const x = projX(u, z), y = altY(alt, z), zb = z + 0.12 + view.speed * 0.18;
      let x2 = projX(u, zb), y2 = altY(alt, zb); const len = Math.hypot(x - x2, y - y2), cap = 28 * PS;
      if (len > cap) { x2 = x + (x2 - x) * cap / len; y2 = y + (y2 - y) * cap / len; }   // short streaks, even right by the camera
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      ctx.globalAlpha = clamp((56 - z) / 16, 0, 1) * clamp(z / 4, 0.25, 0.9) * 0.7; ctx.lineWidth = clamp(F / z / 60, 0.6, 1.8);
      ctx.strokeStyle = hash(row, i + 9) < 0.2 ? '#bfe6ff' : '#ffffff'; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}

const WORLDS = {
  fields: { name: 'Meadow', sky: skyFields, ground: groundFields, shade: 'rgba(75,54,252,.2)',
    clouds: { n: 14, alt: () => Math.random() < 0.6 ? 2 + Math.random() * 1.8 : -2.8 + Math.random() * 1.6, alpha: 0.95, img: () => puffCloud('#ffffff', '#efeaff', '#c9bdf2') } },
  clouds: { name: 'Cloud sea', sky: skyClouds, ground: groundClouds, shade: 'rgba(75,54,252,.18)',
    clouds: { n: 9, alt: () => -0.9 + Math.random() * 2.2, alpha: 0.85, img: () => puffCloud('#fff6f4', '#f8d9ea', '#d6b5ee') } },
  city: { name: 'City at dusk', sky: skyCity, ground: groundCity, shade: 'rgba(8,6,30,.4)', rim: true,
    clouds: { n: 6, alt: () => -3.2 + Math.random() * 1.4, alpha: 0.55, img: () => puffCloud('#8a6ad8', '#5a3fb0', '#c35fbf') } },
  space: { name: 'Deep space', sky: skySpace, ground: groundSpace, shade: 'rgba(2,0,12,.35)', rim: true,
    clouds: { n: 0, alt: () => 0, alpha: 0, img: () => puffCloud('#6a3ad0', '#3a2290', '#1c1250') } },   // the backdrop has its own clouds
  night: { name: 'Night airspace', sky: skyNight, ground: groundNight, shade: 'rgba(2,6,20,.5)', rim: true,
    clouds: { n: 8, alt: () => Math.random() < 0.6 ? 2 + Math.random() * 1.8 : -2.8 + Math.random() * 1.6, alpha: 0.45, img: () => puffCloud('#33456f', '#223258', '#141e3c') } }
};
const onLand = () => worldKey === 'fields' || worldKey === 'night';   // worlds over the valley, with its road and airfield
let world = WORLDS.fields, worldKey = 'fields', cloudImg = null;
function setWorld(key) {
  worldKey = WORLDS[key] ? key : 'fields'; world = WORLDS[worldKey];
  cloudImg = world.cloudImg || (world.cloudImg = world.clouds.img());
  clouds = Array.from({ length: world.clouds.n }, () => ({ x: view.camX + (Math.random() - 0.5) * 34, alt: world.clouds.alt(), z: 4 + Math.random() * 56, s: 0.9 + Math.random() * 1.4 }));
  spires = worldKey === 'clouds' ? Array.from({ length: 5 }, () => spawnSpire(null, false)) : [];
  roadPts = [[-1e9, -view.fieldX - 3.5]];
  if (W) paintSky();
  if (W && !inFlight() && !outro) park();
  }

const gateX = k => offC(k) * SPREAD;
const projX = (x, z) => W / 2 + (x - view.camX) * F / z;
const altY = (alt, z) => HY + alt * F / z;
const H_GATE = () => (PY - HY) * ZP / F;   // gates fly at the plane's height
const gatePos = k => { const z = view.gz; return { x: projX(gateX(k), z), y: altY(H_GATE(), z), r: RING * F / z, z }; };

function setTrack(d, n, rtp) { Object.assign(view, { d, n, rtp, pick: -1, row: null, struck: false, introT: performance.now(), camX: 0 }); }
function recenter() { for (const c of clouds) c.x -= view.camX; for (const p of spires) p.x -= view.camX; view.fieldX -= view.camX; view.camX = 0; if (onLand()) rerouteRoad(); }
function sceneStart(d) {
  const now = performance.now();
  kitReset();
  recenter(); setTrack(d, 0, round.rtp); plane.brain = myLevel();
  view.launch = { t0: now, warp: false }; round.status = 'takeoff';   // the pod charges, kicks off into a short warp, and the drones fly in
  if (plane.state !== 'cruise') { plane.state = 'enter'; plane.t0 = now; }
  chute = null; outro = null; wipe = null;
  if (iris) iris.out = iris.out || now;
  drops = drops.filter(b => !b.real);
  parts = parts.filter(q => q.type !== 'confetti' && q.type !== 'coin');   // last flight's celebration ends here
}
function sceneFly(k, row, t0) {
  view.pick = k; view.row = row; view.struck = false; view.pickT = t0;
  if (!AIM) row.forEach((bombed, j) => { if (bombed) drops.push({ real: true, k: j, t0 }); });
}
function sceneImpact(now) {
  view.struck = true;
  if (AIM) { if (!round.hit) shatter(now); return; }
  drops = drops.filter(b => !b.real);
  view.row.forEach((bombed, j) => {
    if (!bombed || j === view.pick) return;
    const g = gatePos(j); booms.push({ x: g.x, y: g.y, r: g.r * 1.5, t0: now, dur: 900, rot: Math.random() * 7, text: Math.random() < 0.5 ? 'BOOM!' : 'POW!' });
  });
  if (!round.hit) { const g = gatePos(view.pick); burst(g.x, g.y, 18, ['#33d66d', '#00ebc0', '#ffffff'], 0.35); }
}
function sceneCrash(now) {
  if (AIM) {   // power down: no blast and no sad face; its lights and visor go dark and it sinks away
    Object.assign(plane, { state: 'sink', t0: now }); outro = { kind: 'crash', t0: now };
    burst(PX, PY - 30 * PS, 14, ['#ffc147', '#ff9a3d', '#ffffff'], 0.3); flashAt = now; flashCol = '255,120,130'; shake = reduced ? 0 : 4;
    return;
  }
  const g = gatePos(view.pick);
  booms.push({ x: AIM ? PX : (g.x + PX) / 2, y: PY - 40 * PS, r: 230 * PS, t0: now, dur: 1200, rot: Math.random() * 7, text: 'KA-BOOM!', front: true });
  burst(PX, PY - 40 * PS, 40, ['#ffc147', '#fa7b5b', '#ed2b4b', NAVY], 0.6);
  flashAt = now; flashCol = '255,240,245'; shake = reduced ? 0 : 16;
  Object.assign(plane, { state: 'fall', t0: now, x: PX, y: PY, rot: view.bank, vx: 0.05 * (view.bank >= 0 ? 1 : -1), vy: -0.25, vr: 0.0028 });
  iris = { t0: now + 380, brain: myLevel() };
  outro = { kind: 'crash', t0: now };
}
function scenePassed(now) {
  recenter(); setTrack(view.d, round.n, round.rtp);
  burst(PX, PY - 50 * PS, 22, ['#33d66d', '#00ebc0', '#ffffff'], 0.4);
  texts.push({ text: fx(capAt(round.d, round.n, round.stake, round.rtp)), x: PX, y: PY - 175 * PS, t0: now, col: '#7dffcf', size: 30, dur: 1300 });
}
function sceneJump(now, m) {
  if (AIM) {   // no parachute here: the Brainer turns, gives you a thumbs-up, and flies off to the left with the win
    outro = { kind: 'exit', t0: now }; Object.assign(plane, { state: 'exit', t0: now });
    for (let i = 0; i < (m >= 10 ? 40 : 26); i++) parts.push({ type: 'coin', x: PX, y: PY - 70 * PS, vx: (Math.random() - 0.5) * 0.7, vy: -0.4 - Math.random() * 0.5, g: 0.0011, life: 0, max: 1500 + Math.random() * 600, r: 5 + Math.random() * 4 });
    for (let i = 0; i < (m >= 100 ? 160 : m >= 10 ? 110 : 70); i++) parts.push({ type: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 0.08, vy: 0.08 + Math.random() * 0.12, g: 0, life: 0, max: 3200, r: 5 + Math.random() * 4, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 0.02, c: ['#4b36fc', '#8447fb', '#33d66d', '#ffc147', '#ffffff', '#7ff3ff'][i % 6] });
    feel('excited', 2400); return;
  }
  const zw = view.scroll + 12.5;   // where it will land: a little ahead, while the world glides to a stop
  chute = { t0: now, x0: PX, y0: PY - 60 * PS, brain: myLevel(), zw, spot: landOn[worldKey](zw) };
  outro = { kind: 'jump', t0: now };
  Object.assign(plane, { state: 'empty', t0: now });
  const big = m >= 10, huge = m >= 100;
  for (let i = 0; i < (big ? 40 : 26); i++) parts.push({ type: 'coin', x: PX, y: PY - 70 * PS, vx: (Math.random() - 0.5) * 0.7, vy: -0.4 - Math.random() * 0.5, g: 0.0011, life: 0, max: 1500 + Math.random() * 600, r: 5 + Math.random() * 4 });
  for (let i = 0; i < (huge ? 160 : big ? 110 : 70); i++) parts.push({ type: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 0.08, vy: 0.08 + Math.random() * 0.12, g: 0, life: 0, max: 3200, r: 5 + Math.random() * 4, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 0.02, c: ['#4b36fc', '#8447fb', '#33d66d', '#ffc147', '#ffffff', '#ed6b6b'][i % 6] });
  flashAt = now; flashCol = '200,180,255';
}
// Parked on the runway between flights, where the world has ground (the cloud sea has none, so there the plane waits
// in the air). The camera drops so the plane's wheels stand on the road, which is moved under it.
const LAUNCH_MS = 1900, TAKEOFF_MS = 2600, EXIT_MS = 2900, EXIT_STAND = 1900;   // the win: the Brainer stands for EXIT_STAND ms, then the pod boosts away
const parkAlt = () => (PY + 58 * PS - HY) * ZP / F;
function park() {
  view.takeoff = null; view.parked = worldKey !== 'clouds' && worldKey !== 'space';   // no ground in these: the plane waits in the air
  if (!view.parked) return;
  const zp = view.scroll + ZP;
  roadPts = [[-1e9, roadBase(zp)]];   // the road runs straight on from where the plane stands
  view.camX = 0; view.fieldX = onLand() ? -roadAt(zp) : 0; view.speed = 0;
  airfield = onLand() ? { zw: zp, u: roadAt(zp) } : null;   // the plane stands at the start of the runway
}
// The parachute from the jump to the landing: the Brainer's feet at (x, y), its height h on screen, how far the canopy
// is open, and how far it has folded after touchdown.
function chuteState(now) {
  const c = chute, t = now - c.t0, z = Math.max(1.5, c.zw - view.scroll);
  const Lx = projX(c.spot.u + view.fieldX, z), Ly = altY(c.spot.alt, z), hEnd = Math.max(62 * PS, 1.5 * F / z), h0 = 112 * PS;
  const x1 = c.x0 + 20 * PS, y1 = c.y0 - 70 * PS, open = t < 220 ? 0 : easeBack(clamp((t - 220) / 520, 0, 1));
  if (t < 420) { const q = easeOut(t / 420); return { x: lerp(c.x0, x1, q), y: lerp(c.y0 + 40 * PS, y1, q), h: h0, open, fold: 0, landed: false }; }   // pops out of the cockpit
  if (t < 3000) { const q = ease((t - 420) / 2580); return { x: lerp(x1, Lx, q) + (reduced ? 0 : Math.sin(t / 900) * 14 * PS * (1 - q)), y: lerp(y1, Ly, q), h: lerp(h0, hEnd, q), open, fold: 0, landed: false }; }   // floats down to the road
  const tl = t - 3000, hop = tl < 520 ? Math.sin(tl / 520 * Math.PI) * 10 * PS : 0;
  return { x: Lx, y: Ly - hop, h: hEnd, open, fold: easeOut(clamp(tl / 700, 0, 1)), landed: true };   // touchdown, a little hop, the canopy folds
}
// Back to the start screen after a flight: the plane flies back in with the Brainer aboard, and any level-up is shown.
function resetToStart(now) {
  kitReset(); outro = null; chute = null; round = null; park();
  if (iris) iris.out = iris.out || now;
  plane.state = 'enter'; plane.t0 = now; plane.brain = myLevel();
  recenter(); setTrack(LEVELS[S.level], 0, cfg.rtp);
  renderControls(); renderLadder(); renderLevels();
}
function burst(x, y, n, cols, sp) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 7, v = sp * (0.4 + Math.random()); parts.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.1, g: 0.0009, life: 0, max: 600 + Math.random() * 500, r: 3 + Math.random() * 4, c: cols[i % cols.length] }); }
}

/* drawing helpers */
function ell(x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); }
function lin(x0, y0, x1, y1, c0, c1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
function star(x, y, r, n, inner) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
function brandText(text, x, y, size, fill, rot, shadow) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.font = `800 ${Math.round(size)}px FiraGO, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = shadow || 'rgba(75,54,252,.75)'; ctx.fillText(text, 0, size * 0.08);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0); ctx.restore();
}

/* the player's Brainer in the cockpit (rim centre at 0,0): its stage still, turned round to look back at you, the
   near lip hiding its legs. It lights up as new brain cells arrive. */
function robotSeat(t, L) {
  const bob = reduced ? 0 : Math.sin(t / 260) * 1.5, glow = clamp(1 - (t - (view.glowT || -1e9)) / 700, 0, 1);
  if (glow > 0) { const gg = ctx.createRadialGradient(0, -70, 10, 0, -70, 90); gg.addColorStop(0, 'rgba(0,235,192,.8)'); gg.addColorStop(1, 'rgba(0,235,192,0)'); ctx.globalAlpha = glow; ctx.fillStyle = gg; ctx.fillRect(-90, -160, 180, 180); ctx.globalAlpha = 1; }
  ctx.save(); ctx.beginPath(); ctx.rect(-130, -240, 260, 244); ctx.clip();   // nothing below the rim
  drawBrainer(ctx, 0, -32 + bob, 170, L, moodNow(t).ex, t);
  ctx.restore();
}
function robotHands(t) {   // hands on the cockpit rim; the one on the side you're hovering lifts toward that path
  const side = round && round.status === 'choose' && view.hover >= 0 ? Math.sign(offC(view.hover)) : 0, cheer = mood.ex === 'phew' || mood.ex === 'wink';
  for (const sd of [-1, 1]) {
    const lift = cheer ? -34 + Math.sin(t / 90 + sd) * 6 : side === sd ? -16 : 0, hb = (reduced ? 0 : Math.sin(t / 300 + sd) * 1.5) + lift;
    ctx.save(); ctx.translate(sd * (cheer ? 66 : 58), 0 + hb); ctx.rotate(sd * (cheer ? 0.5 : side === sd ? 0.8 : 0.25));
    ell(sd * 2, 6, 12, 5); ctx.fillStyle = 'rgba(30,16,90,.25)'; ctx.fill();
    const hg = ctx.createRadialGradient(-sd * 4 - 2, -5, 1, 0, 0, 15); hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.55, '#e4ddff'); hg.addColorStop(1, '#9c8fe2');
    ell(0, 0, 12, 14); ctx.fillStyle = hg; ctx.fill();
    ctx.restore();
  }
}

/* the plane from behind and a little above; origin at the cockpit rim. A rounded fuselage tapering to the tail,
   wings with dihedral and a visible trailing edge, a twin tail nearest the camera, and the propeller spinning out
   ahead of the nose. Shaded as solids lit from the upper left. */
function planeBack(x, y, s, rot, t, pilot, soot, L) {
  if (has3D()) {   // the 3D plane, posed in render3D; its cockpit sits at (x, y)
    const w = 700 * s, h = w * b3.hA / b3.wA;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(b3.stage.canvas, 0, 0, b3.wA, b3.hA, -w / 2, -h * 0.5 + 24 * s, w, h); ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  if (soot) ctx.filter = 'brightness(.45) saturate(.5)';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (!soot && !reduced) for (const sd of [-1, 1]) {   // short contrails from the wingtips
    const w = Math.sin(t / 140 + sd) * 2, tr = ctx.createLinearGradient(0, -10, 0, 52);
    tr.addColorStop(0, 'rgba(255,255,255,.5)'); tr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.moveTo(sd * 229, -10); ctx.quadraticCurveTo(sd * (236 + w), 20, sd * (244 + w), 52); ctx.lineTo(sd * (249 + w), 52); ctx.quadraticCurveTo(sd * (241 + w), 20, sd * 235, -10); ctx.closePath(); ctx.fillStyle = tr; ctx.fill();
  }
  // propeller disc out ahead of the nose, seen around the fuselage
  const disc = ctx.createRadialGradient(0, -10, 30, 0, -10, 100); disc.addColorStop(0, 'rgba(255,255,255,.05)'); disc.addColorStop(0.85, 'rgba(255,255,255,.22)'); disc.addColorStop(1, 'rgba(255,255,255,0)');
  ell(0, -10, 100, 100); ctx.fillStyle = disc; ctx.fill();
  if (!reduced) {
    const pa = t / 16, bl = ctx.createRadialGradient(0, -10, 20, 0, -10, 96); bl.addColorStop(0, 'rgba(27,22,64,0)'); bl.addColorStop(1, 'rgba(27,22,64,.08)');
    for (const o of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) { ctx.beginPath(); ctx.moveTo(0, -10); ctx.arc(0, -10, 96, pa + o, pa + o + 0.32); ctx.closePath(); ctx.fillStyle = bl; ctx.fill(); }
  }
  // main wing: the top surface, then the trailing edge facing the camera
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * 56, 0); ctx.lineTo(sd * 222, -18); ctx.quadraticCurveTo(sd * 236, -17, sd * 236, -6); ctx.lineTo(sd * 224, 4); ctx.lineTo(sd * 56, 38); ctx.closePath();
    const wg = ctx.createLinearGradient(0, -18, 0, 36); wg.addColorStop(0, '#ffffff'); wg.addColorStop(0.5, '#f1edff'); wg.addColorStop(1, '#c9bdf7');
    ctx.fillStyle = wg; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sd * 56, 38); ctx.lineTo(sd * 224, 4); ctx.lineTo(sd * 224, 10); ctx.lineTo(sd * 56, 47); ctx.closePath();
    ctx.fillStyle = lin(0, 4, 0, 45, '#a395e6', '#7a6bd0'); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sd * 132, -6); ctx.lineTo(sd * 196, -14); ctx.lineTo(sd * 198, -4); ctx.lineTo(sd * 134, 6); ctx.closePath();   // brand stripe near the tip
    ctx.fillStyle = lin(sd * 132, 0, sd * 198, 0, '#4b36fc', '#8447fb'); ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,180,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sd * 120, 20); ctx.lineTo(sd * 210, 6); ctx.stroke();   // aileron hinge
    ctx.beginPath(); ctx.moveTo(sd * 222, -18); ctx.quadraticCurveTo(sd * 236, -17, sd * 236, -6); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
    ell(sd * 232, -14, 6, 4); ctx.fillStyle = lin(0, -18, 0, -10, '#ffffff', '#c9bdf7'); ctx.fill();   // wingtip light housing
    ell(sd * 232, -15, 2.6, 2.6); ctx.fillStyle = (t / 500 | 0) % 2 ? '#ffffff' : (sd < 0 ? '#ff3b58' : '#33d66d'); ctx.fill();
  }
  // fuselage, a lit cylinder tapering to the tail cone
  const hull = () => { ctx.beginPath(); ctx.moveTo(-70, 8); ctx.bezierCurveTo(-74, 50, -38, 92, -14, 106); ctx.quadraticCurveTo(0, 113, 14, 106); ctx.bezierCurveTo(38, 92, 74, 50, 70, 8); ctx.bezierCurveTo(68, -18, -68, -18, -70, 8); ctx.closePath(); };
  hull(); const fg = ctx.createLinearGradient(-72, 0, 72, 0);
  fg.addColorStop(0, '#a093e4'); fg.addColorStop(0.2, '#e4defe'); fg.addColorStop(0.38, '#ffffff'); fg.addColorStop(0.66, '#ebe6ff'); fg.addColorStop(1, '#9284dc');
  ctx.fillStyle = fg; ctx.fill();
  const fsh = ctx.createLinearGradient(0, 40, 0, 112); fsh.addColorStop(0, 'rgba(50,30,150,0)'); fsh.addColorStop(1, 'rgba(50,30,150,.3)'); ctx.fillStyle = fsh; ctx.fill();
  ctx.save(); hull(); ctx.clip();
  ctx.beginPath(); ctx.moveTo(-9, 40); ctx.lineTo(9, 40); ctx.lineTo(4, 112); ctx.lineTo(-4, 112); ctx.closePath(); ctx.fillStyle = lin(0, 40, 0, 112, '#8447fb', '#4b36fc'); ctx.fill();   // spine stripe
  ell(-38, 36, 10, 32, 0.25); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();   // highlight
  ctx.restore();
  // windscreen ahead of the pilot
  ctx.beginPath(); ctx.moveTo(-50, -2); ctx.quadraticCurveTo(-48, -34, 0, -38); ctx.quadraticCurveTo(48, -34, 50, -2); ctx.closePath();
  ctx.fillStyle = 'rgba(200,225,255,.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.stroke();
  // cockpit: a dark opening, the pilot inside, then the padded near lip
  ell(0, 2, 56, 18); ctx.fillStyle = lin(0, -16, 0, 20, '#120d33', '#2a2163'); ctx.fill();
  if (pilot) robotSeat(t, L);
  ctx.beginPath(); ctx.ellipse(0, 2, 56, 18, 0, 0, Math.PI); ctx.lineWidth = 10; ctx.strokeStyle = lin(0, 2, 0, 24, '#ffffff', '#c3b6f5'); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 2, 56, 18, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  if (pilot) robotHands(t);
  // twin tail, nearest the camera: the tailplane, then a fin at each tip
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * 12, 84); ctx.lineTo(sd * 92, 72); ctx.quadraticCurveTo(sd * 102, 72, sd * 100, 80); ctx.lineTo(sd * 92, 86); ctx.lineTo(sd * 12, 98); ctx.closePath();
    ctx.fillStyle = lin(0, 72, 0, 98, '#ffffff', '#cbbff7'); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sd * 12, 98); ctx.lineTo(sd * 92, 86); ctx.lineTo(sd * 92, 91); ctx.lineTo(sd * 12, 104); ctx.closePath(); ctx.fillStyle = '#8e80dc'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sd * 54, 86); ctx.lineTo(sd * 96, 80); ctx.lineTo(sd * 118, 38); ctx.quadraticCurveTo(sd * 114, 28, sd * 98, 30); ctx.closePath();   // fins canted outward, so their inner face shows
    ctx.fillStyle = lin(sd * 54, 86, sd * 112, 30, sd < 0 ? '#6a4dff' : '#5a3ffc', sd < 0 ? '#b79bff' : '#9a7cff'); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sd * 76, 82); ctx.lineTo(sd * 104, 34); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sd * 98, 30); ctx.quadraticCurveTo(sd * 114, 28, sd * 118, 38); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ell(sd * 113, 31, 2.6, 2.6); ctx.fillStyle = (t / 700 | 0) % 2 ? '#ffc147' : '#ffffff'; ctx.fill();
  }
  ell(0, 106, 10, 7); ctx.fillStyle = lin(0, 100, 0, 113, '#ffffff', '#b6a9ef'); ctx.fill();   // tail cone
  ell(0, 107, 3.5, 3.5); ctx.fillStyle = (t / 400 | 0) % 2 ? '#ffc147' : '#ffffff'; ctx.fill();
  ctx.restore();
}
function chuteDraw(x, y, s, t, open, alpha, L) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(reduced ? 0 : Math.sin(t / 700) * 0.1); ctx.scale(s, s);
  if (open > 0.02) {
    ctx.save(); ctx.scale(open, open); ctx.translate(0, -120 * (1 - open));
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.85)';
    for (const px of [-138, -70, 70, 138]) { ctx.beginPath(); ctx.moveTo(px, -150); ctx.lineTo(px < 0 ? -62 : 62, -10); ctx.stroke(); }
    const dome = () => { ctx.beginPath(); ctx.moveTo(-150, -150); ctx.bezierCurveTo(-150, -272, 150, -272, 150, -150); for (let i = 5; i >= 0; i--) { const xa = -150 + i * 50; ctx.quadraticCurveTo(xa + 25, -136, xa, -150); } ctx.closePath(); };
    const cg = ctx.createRadialGradient(-55, -250, 10, 0, -190, 200); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.6, '#f2eeff'); cg.addColorStop(1, '#c6baf5');
    dome(); ctx.fillStyle = cg; ctx.fill();
    ctx.save(); dome(); ctx.clip(); ctx.fillStyle = lin(-150, -260, 150, -140, '#6a52ff', '#5a2fe0');
    for (let i = 0; i < 6; i += 2) { ctx.beginPath(); ctx.moveTo(0, -290); ctx.lineTo(-150 + i * 50, -130); ctx.lineTo(-100 + i * 50, -130); ctx.closePath(); ctx.fill(); }
    const sh = ctx.createRadialGradient(-55, -250, 30, 0, -190, 190); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(40,20,120,.3)');
    ctx.fillStyle = sh; ctx.fillRect(-160, -290, 320, 170);   // the canopy as a lit dome
    const lip = ctx.createLinearGradient(0, -172, 0, -134); lip.addColorStop(0, 'rgba(40,20,120,0)'); lip.addColorStop(1, 'rgba(40,20,120,.32)');
    ctx.fillStyle = lip; ctx.fillRect(-160, -172, 320, 40);   // its lower edge curls into shadow
    ctx.restore();
    ctx.restore();
  }
  const m = moodNow(t);
  drawBrainer(ctx, 0, 40, 220, L, m.ex, t);
  ctx.restore();
}

function bomb(x, y, r, rot, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.quadraticCurveTo(r * 0.5, -r * 1.5, r * 0.3, -r * 1.85); ctx.strokeStyle = '#c9a06a'; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-r * 0.32, -r * 1.2, r * 0.64, r * 0.36, r * 0.08); ctx.fillStyle = '#3a3f58'; ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); g.addColorStop(0, '#3a4366'); g.addColorStop(1, NAVY);
  ell(0, 0, r, r); ctx.fillStyle = g; ctx.fill();
  if (world.rim) { ell(0, 0, r, r); ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke(); }
  ell(-r * 0.38, -r * 0.38, r * 0.28, r * 0.17, -0.7); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
  if ((t / 70 | 0) % 2 === 0 || reduced) { star(r * 0.3, -r * 1.9, r * 0.45, 5, 0.45); ctx.fillStyle = '#ffc147'; ctx.fill(); }
  ctx.restore();
}
function drawBoom(b, now) {
  const a = (now - b.t0) / b.dur;
  if (a < 0 || a >= 1) return;
  const R = Math.min(b.r, Math.min(W, H) * (b.front ? 0.42 : 0.24)), grow = easeOut(Math.min(1, a * 3)), fade = a < 0.55 ? 1 : 1 - (a - 0.55) / 0.45;
  ctx.save(); ctx.translate(b.x, b.y);
  if (a < 0.5) { const q = a / 0.5; ell(0, 0, R * (0.5 + q), R * (0.5 + q) * 0.88); ctx.lineWidth = R * 0.07 * (1 - q); ctx.strokeStyle = `rgba(255,238,210,${0.75 * (1 - q)})`; ctx.stroke(); }   // shockwave
  for (let i = 0; i < 7; i++) {   // smoke, lit from above
    const an = b.rot + i * 0.9, d = R * (0.22 + 0.5 * a), px = Math.cos(an) * d, py = Math.sin(an) * d * 0.6 - a * R * 0.45, pr = R * (0.2 + 0.24 * a);
    const sg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.4, pr * 0.1, px, py, pr); sg.addColorStop(0, '#9b93ba'); sg.addColorStop(1, 'rgba(62,56,92,.9)');
    ctx.globalAlpha = 0.8 * fade * clamp(a * 4, 0, 1); ell(px, py, pr, pr * 0.92); ctx.fillStyle = sg; ctx.fill();
  }
  if (a < 0.6) {   // fireball
    const k = 1 - a / 0.6;
    for (let i = 0; i < 5; i++) {
      const an = b.rot * 2 + i * 1.26, d = R * 0.2 * grow, px = Math.cos(an) * d, py = Math.sin(an) * d * 0.8, fr = R * (0.3 + 0.24 * grow) * (0.7 + 0.3 * k);
      const fg = ctx.createRadialGradient(px, py, 0, px, py, fr); fg.addColorStop(0, '#fffbe6'); fg.addColorStop(0.3, '#ffd45a'); fg.addColorStop(0.65, '#ff7a3d'); fg.addColorStop(1, 'rgba(237,43,75,0)');
      ctx.globalAlpha = Math.sqrt(k); ell(px, py, fr, fr); ctx.fillStyle = fg; ctx.fill();
    }
  }
  if (a < 0.18) { const fl = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.8); fl.addColorStop(0, 'rgba(255,255,255,.95)'); fl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.globalAlpha = 1 - a / 0.18; ell(0, 0, R * 0.8, R * 0.8); ctx.fillStyle = fl; ctx.fill(); }
  ctx.restore();
  if (b.text && a < 0.75) { const sz = R * 0.36 * (0.7 + 0.3 * grow), hw = sz * 0.34 * b.text.length + 8; brandText(b.text, clamp(b.x, hw, W - hw), b.y - R * (0.15 + 0.2 * a), sz, '#ffffff', -0.1); }   // the words stay on screen even when the blast is at the edge
}
function drawGate(k, now, front) {
  const r = round, choosing = r && r.status === 'choose';
  const g0 = gatePos(k), g = { ...g0, y: g0.y + (choosing && !reduced ? Math.sin(now / 520 + k * 1.3) * g0.r * 0.05 : 0) };   // hoops drift a little while you decide
  if (g.r < 3 || g.x + g.r < -40 || g.x - g.r > W + 40) return;
  if (r && r.status === 'crashed' && k === view.pick) return;   // the explosion takes its place
  const intro = clamp((now - view.introT) / 450, 0, 1);
  const passing = g.z < ZP ? clamp((g.z / ZP - 0.45) / 0.45, 0, 1) : 1;
  let st = 'idle';
  if (view.struck && view.row) st = view.row[k] ? 'boom' : k === view.pick ? 'safe' : 'idle';
  else if (k === view.pick) st = 'picked';
  const hov = choosing && view.hover === k;
  const others = view.row && k !== view.pick ? clamp((now - view.pickT) / 250, 0, 1) : 0;   // the paths not taken shrink back and fade
  g.r *= 1 - 0.12 * others;
  ctx.save(); ctx.globalAlpha = easeOut(intro) * passing * (1 - 0.6 * others);
  const lw = Math.max(4, g.r * 0.2);
  if (!front) {
    if (st === 'picked' || hov) { const gl = ctx.createRadialGradient(g.x, g.y, g.r * 0.5, g.x, g.y, g.r * 1.5); gl.addColorStop(0, 'rgba(132,71,251,.45)'); gl.addColorStop(1, 'rgba(132,71,251,0)'); ctx.fillStyle = gl; ctx.fillRect(g.x - g.r * 1.6, g.y - g.r * 1.6, g.r * 3.2, g.r * 3.2); }
    if (st === 'picked' && !reduced) {   // lock-on: two ripples run out from the chosen hoop
      for (let i = 0; i < 2; i++) { const q = ((now - view.pickT) / 420 + i * 0.5) % 1; ell(g.x, g.y, g.r * (1 + q * 0.55), g.r * (1 + q * 0.55)); ctx.lineWidth = lw * 0.45 * (1 - q); ctx.strokeStyle = `rgba(132,71,251,${0.7 * (1 - q)})`; ctx.stroke(); }
    }
    ell(g.x, g.y + lw * 0.35, g.r, g.r); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(10,19,34,.16)'; ctx.stroke();
    if (st !== 'boom') { const gf = ctx.createRadialGradient(g.x, g.y - g.r * 0.3, 0, g.x, g.y, g.r); gf.addColorStop(0, 'rgba(255,255,255,.22)'); gf.addColorStop(1, 'rgba(255,255,255,.04)'); ell(g.x, g.y, g.r - lw / 2, g.r - lw / 2); ctx.fillStyle = gf; ctx.fill(); }   // glass
    ell(g.x, g.y, g.r, g.r);
    ctx.lineWidth = lw; ctx.strokeStyle = st === 'boom' ? '#2a2540' : st === 'safe' ? lin(g.x - g.r, 0, g.x + g.r, 0, '#33d66d', '#00ebc0') : st === 'picked' || hov ? lin(g.x - g.r, 0, g.x + g.r, 0, '#4b36fc', '#8447fb') : lin(0, g.y - g.r, 0, g.y + g.r, '#ffffff', '#d9cffc'); ctx.stroke();
    if (st !== 'boom') {   // the ring's volume: a lit upper-left edge and a shaded lower-right edge
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + lw * 0.22, Math.PI * 0.95, Math.PI * 1.7); ctx.lineWidth = lw * 0.28; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r + lw * 0.22, Math.PI * 0.05, Math.PI * 0.75); ctx.lineWidth = lw * 0.3; ctx.strokeStyle = st === 'idle' && !hov ? 'rgba(83,42,255,.28)' : 'rgba(10,19,34,.25)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r - lw * 0.5, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = lw * 0.18; ctx.strokeStyle = 'rgba(30,20,90,.18)'; ctx.stroke();
    }
    if (st === 'idle' || st === 'picked') {
      ctx.setLineDash([g.r * 0.18, g.r * 0.32]); ctx.lineDashOffset = reduced ? 0 : -now / (st === 'picked' ? 8 : hov ? 15 : 40);
      ctx.lineWidth = lw * 0.32; ctx.strokeStyle = st === 'picked' || hov ? '#ffffff' : '#8447fb'; ctx.stroke(); ctx.setLineDash([]);
      if (!reduced) { const a0 = now / 900 + k * 1.7; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, a0, a0 + 0.7); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); }   // a highlight circling the rim
    }
  }
  if (front || g.z >= ZP) {   // the path number in the hoop; every safe path pays the same, so the multiplier lives in the readout
    view.hit[k] = g;
    if (g.r > 14 && st !== 'boom' && g.z > ZP * 1.2) {
      const lit = st === 'picked' || hov;
      brandText(String(k + 1), g.x, g.y + g.r * 0.04, g.r * 0.62, lit ? '#ffffff' : VIOLET, 0, lit ? 'rgba(75,54,252,.75)' : 'rgba(255,255,255,.9)');
    }
  }
  ctx.restore();
}

/* ---------- Aim & Break: the pod jet upgrades as it breaks through, as the Brainer does in Charge ---------- */
// Every round starts with the plain pod; each row broken through switches on its next built-in upgrade (aim3d.js), and
// after the last one each row repaints its trim. Cosmetic only.
const kit = { on: 0, t0: 0 };
function kitReset() { kit.on = 0; kit.t0 = 0; }
function kitUp(now) {
  if (!AIM || !window.Brainer3D || !window.Brainer3D.POD_UPGRADES) return;
  const U = window.Brainer3D.POD_UPGRADES, P = window.Brainer3D.POD_PAINTS;
  kit.on++; kit.t0 = now; sound.gear();
  const name = kit.on <= U.length ? U[kit.on - 1] : P[Math.min(P.length - 1, kit.on - U.length - 1)][1];
  texts.push({ text: `+ ${name}`, x: clamp(PX + 250 * PS, 90, W - 90), y: PY - 60 * PS, t0: now, col: '#c9f8ff', size: 20, dur: 1400 });   // beside the ship, clear of the multiplier
  burst(PX, PY - 30 * PS, 22, ['#c9f8ff', '#3fb8ff', '#ffffff', '#ffd45a'], 0.4);
}

/* ---------- Aim & Break: the target, the shot, and what happens where it lands ---------- */
const SHOT = 0.38;   // the shot lands at this point of the step; the target breaks (or the return fire hits) at IMPACT
const targetPos = k => { const g = gatePos(k); return { ...g, r: g.r * 1.05 }; };
const muzzle = () => ({ x: PX + view.bank * 60 * PS, y: PY - 92 * PS });   // just above the Brainer's head
function shotLands(now, blocked) {
  const g = targetPos(view.pick);
  if (blocked) {   // it glances off the armour, and the core turns red
    burst(g.x, g.y, 14, ['#ffffff', '#ffd0d6', '#ff3a52'], 0.45); flashAt = now; flashCol = '255,200,210'; sound.clang();
  } else { burst(g.x, g.y, 10, ['#c9f8ff', '#3fb8ff', '#ffffff'], 0.3); shake = reduced ? 0 : 5; }   // it bites in, and cracks spread
}
function shatter(now) {   // the shield bursts into its hex tiles, which tumble out past the camera; the drone powers down
  const g = targetPos(view.pick), cell = g.r * HEX;
  for (let q = -3; q <= 3; q++) for (let rr = -3; rr <= 3; rr++) {
    const x = cell * Math.sqrt(3) * (q + rr / 2), y = cell * 1.5 * rr, d = Math.hypot(x, y); if (d > g.r * 0.95) continue;
    const a = Math.atan2(y, x || 0.01), v = 0.12 + Math.random() * 0.2 + d / g.r * 0.12;
    parts.push({ type: 'hex', x: g.x + x, y: g.y + y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.06, g: 0.0004, life: 0, max: 750 + Math.random() * 300, r: cell * 0.9, rot: Math.random(), vr: (Math.random() - 0.5) * 0.02 });
  }
  burst(g.x, g.y, 26, ['#c9f8ff', '#3fe6ff', '#ffffff'], 0.55);
  flashAt = now; flashCol = '170,240,255'; shake = reduced ? 0 : 6;
  view.downAt = now;
  const t0 = tierOf(round.n + 1), t1 = tierOf(round.n + 2);
  if (t1 > t0 && round.n + 1 < round.reach) setTimeout(() => toast(['', 'Double shields ahead', 'Gold shields ahead', 'Elite drones ahead'][t1]), 700);   // the next row is tougher (a toast, clear of the readout and the drones)
}
// The targets are shield drones (Tornike's pick B, 2026-10-27): Blender stills of a pearl drone behind a hex shield.
// The deeper the row, the tougher its shield looks (his pick A on the second board): cyan for rows 1-3, a double violet
// shield for 4-7, gold with armour for 8-12, a red-and-black elite with spikes from 13 on. Looks only: every row's odds
// are the maths' own. A drone that would hold glows red; one shot through goes dark and drops away.
const TIERS = [1, 2, 3, 4].map(n => { const on = new Image(), off = new Image(); on.src = `assets/aim/tier${n}.webp`; off.src = `assets/aim/tier${n}-off.webp`; return { on, off, red: null }; });
const tierOf = row => row <= 3 ? 0 : row <= 7 ? 1 : row <= 12 ? 2 : 3;   // row counts from 1
function redOf(t) {   // the tier's still tinted red, made once it has loaded
  if (t.red || !t.on.complete || !t.on.naturalWidth) return t.red;
  const c = document.createElement('canvas'); c.width = t.on.naturalWidth; c.height = t.on.naturalHeight; const g = c.getContext('2d');
  g.drawImage(t.on, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,40,72,.5)'; g.fillRect(0, 0, c.width, c.height);
  return (t.red = c);
}
const HEX = 0.27;   // a shield tile's size, as a fraction of the drone's radius
function hexPath(r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
function drawTarget(k, now) {
  const r = round, g = targetPos(k), st = r ? r.status : '';
  if (g.r < 3 || plane.state === 'empty' || g.x + g.r * 1.3 < -40 || g.x - g.r * 1.3 > W + 40) return;
  const shot = !!view.row && (st === 'flying' || st === 'crashed'), mine = shot && k === view.pick;
  const p = shot ? (now - view.pickT) / FLY_MS : -1, blocked = mine ? !!r.hit : !!(view.row && view.row[k]);
  const broken = mine && view.struck && !blocked, down = broken ? clamp((now - (view.downAt || now)) / 380, 0, 1) : 0;
  const landed = mine && p >= SHOT, crack = landed && !blocked ? clamp((p - SHOT) / (IMPACT - SHOT), 0, 1) : 0;
  const angry = mine ? (landed && blocked ? clamp((p - SHOT) / 0.12, 0, 1) : 0) : view.struck && blocked ? 1 : 0;   // once the shot is decided, the drones that would have held show red too
  const others = shot && !mine ? clamp((now - view.pickT) / 250, 0, 1) : 0, hov = st === 'choose' && view.hover === k;
  const R = g.r * (1 - 0.1 * others) * (hov ? 1.06 : 1), jit = crack && !reduced ? R * 0.04 * crack : 0;
  const bob = !reduced ? Math.sin(now / 700 + k * 1.3) * R * 0.05 : 0;
  const x = g.x + (Math.random() - 0.5) * jit, y = g.y + bob + down * down * R * 0.9 + (Math.random() - 0.5) * jit;
  view.hit[k] = { x, y, r: R, z: g.z };
  const arrive = easeOut(clamp((now - view.introT - k * 70) / 450, 0, 1));   // they fly in one after another
  ctx.save(); ctx.globalAlpha = arrive * (1 - 0.45 * others * (1 - angry)) * (1 - down); ctx.translate(x, y + (1 - arrive) * -R * 1.5); ctx.scale(0.6 + 0.4 * arrive, 0.6 + 0.4 * arrive);
  const T = TIERS[tierOf((r ? r.n : 0) + 1)], S = R * 3.1;
  const img = broken ? T.off : angry > 0.5 ? redOf(T) || T.on : crack && !reduced && (now / 45 | 0) % 2 ? T.off : T.on;   // under fire the shield flickers out
  if (img && (img.naturalWidth || img instanceof HTMLCanvasElement)) { ctx.rotate(broken ? down * 0.3 : 0); ctx.drawImage(img, -S / 2, -S / 2, S, S); ctx.rotate(broken ? -down * 0.3 : 0); }
  else { hexPath(R * 0.8); ctx.fillStyle = 'rgba(56,216,255,.2)'; ctx.fill(); ctx.strokeStyle = '#3fe6ff'; ctx.lineWidth = 2; ctx.stroke(); }   // until the stills load
  if (hov || (mine && st === 'flying' && !landed)) {   // the reticle on the target you point at; it tightens as the shot goes
    const lock = st === 'flying' ? 1 : 0.6, cr = R * (0.27 - 0.06 * lock);
    ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = Math.max(1.5, R * 0.03);
    ell(0, 0, cr, cr); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * cr * 0.45, Math.sin(a) * cr * 0.45); ctx.lineTo(Math.cos(a) * cr * 1.55, Math.sin(a) * cr * 1.55); ctx.stroke(); }
    if (!reduced && st === 'choose') { const q = (now / 1100) % 1, rr = R * (0.3 + 0.8 * q); ell(0, 0, rr, rr); ctx.strokeStyle = `rgba(150,240,255,${0.5 * (1 - q)})`; ctx.stroke(); }
  }
  ctx.restore();
  if (!shot && g.r > 14) brandText(String(k + 1), x, y + R * 1.22, Math.max(13, R * 0.42), hov ? '#ffd08a' : '#ffffff', 0, 'rgba(10,19,34,.85)');   // its number, as on the Fire buttons
}
function drawShot(now) {   // the Brainer's shot out to the target; if the target holds, the ricochet and its return fire
  const r = round; if (!r || !view.row || !(r.status === 'flying' || r.status === 'crashed')) return;
  const p = (now - view.pickT) / FLY_MS, m = muzzle(), g = targetPos(view.pick);
  const glowAt = (x, y, rad, c0, c1) => { const gg = ctx.createRadialGradient(x, y, 0, x, y, rad); gg.addColorStop(0, c0); gg.addColorStop(1, c1); ctx.fillStyle = gg; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  const bolt = (x0, y0, x1, y1, w, col) => { const lg = ctx.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, col.replace(/[\d.]+\)$/, '0)')); lg.addColorStop(1, col); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w; ctx.strokeStyle = lg; ctx.stroke(); };
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  if (p < 0.14) { const k = 1 - p / 0.14; glowAt(m.x, m.y, 46 * PS * (0.6 + k), `rgba(255,236,190,${k})`, 'rgba(255,140,40,0)'); }   // muzzle flash
  if (p >= 0.03 && p < SHOT) {   // the bolt, slowing as it goes away from the camera
    const q = easeOut((p - 0.03) / (SHOT - 0.03)), t0 = Math.max(0, q - 0.3), hx = lerp(m.x, g.x, q), hy = lerp(m.y, g.y, q);
    bolt(lerp(m.x, g.x, t0), lerp(m.y, g.y, t0), hx, hy, lerp(9, 3, q) * PS + 1, 'rgba(255,190,90,.95)');
    glowAt(hx, hy, lerp(26, 10, q) * PS + 4, 'rgba(255,250,220,1)', 'rgba(255,150,50,0)');
  }
  if (r.hit && p >= SHOT && p < SHOT + 0.22) {   // the ricochet, off to the side
    const q = (p - SHOT) / 0.22, hx = g.x + q * W * 0.45, hy = g.y - q * H * 0.18;
    bolt(g.x + q * W * 0.3, g.y - q * H * 0.12, hx, hy, 4 * PS + 1, 'rgba(255,200,120,.9)'); glowAt(hx, hy, 12 * PS + 3, 'rgba(255,240,210,1)', 'rgba(255,150,50,0)');
  }
  if (r.hit && p >= 0.5 && p < IMPACT) {   // the target fires back, a red fireball growing as it comes at the plane
    const q = (p - 0.5) / (IMPACT - 0.5), e = q * q, hx = lerp(g.x, m.x, e), hy = lerp(g.y, m.y + 40 * PS, e);
    bolt(lerp(g.x, m.x, Math.max(0, e - 0.25)), lerp(g.y, m.y + 40 * PS, Math.max(0, e - 0.25)), hx, hy, lerp(4, 16, e) * PS + 1, 'rgba(255,90,60,.9)');
    glowAt(hx, hy, lerp(14, 60, e) * PS + 4, 'rgba(255,235,210,1)', 'rgba(255,60,40,0)');
  }
  ctx.restore();
}

/* ---------- loop ---------- */
function update(now, dt) {
  const r = round, flying = r && r.status === 'flying', choosing = r && r.status === 'choose';
  const tk = view.takeoff ? now - view.takeoff.t0 : -1;
  const ln = view.launch ? now - view.launch.t0 : -1;
  if (ln >= 0 && !view.launch.warp && ln > 520) { view.launch.warp = true; sound.warp(); shake = reduced ? 0 : 5; }
  if (ln >= LAUNCH_MS) { view.launch = null; if (r && r.status === 'takeoff') { r.status = 'choose'; view.introT = now; renderControls(); renderLadder(); } }
  if (tk >= TAKEOFF_MS) { view.takeoff = null; if (r && r.status === 'takeoff') { r.status = 'choose'; view.introT = now; renderControls(); renderLadder(); } }
  G_H = view.parked ? parkAlt() : tk >= 0 ? lerp(parkAlt(), G_CRUISE, ease(clamp((tk - 900) / 1500, 0, 1))) : G_CRUISE;   // the ground falls away as it climbs
  view.speed += ((ln >= 0 ? (ln < 520 ? 0.15 : ln < 1300 ? 9 : 2.6) : !r && !outro ? 0.45 : view.parked ? 0 : tk >= 0 ? (tk < 1200 ? 0.4 + 2.6 * tk / 1200 : 2.4) : outro && outro.kind === 'jump' ? 0 : flying || (outro && outro.kind === 'exit') ? 2.6 : 1) - view.speed) * Math.min(1, dt * (ln >= 0 ? 0.006 : outro ? 0.0028 : 0.005));   // after a jump the world glides to a stop; a launch kicks it into a warp
  if (chute) { const tx = chute.spot.u + view.fieldX; view.camX += (tx - view.camX) * Math.min(1, dt * 0.0022); }   // and the camera drifts over the landing spot
  if (outro) {
    const t = now - outro.t0;
    if (outro.kind === 'exit' && t > EXIT_MS && !wipe) wipe = { t0: now, x: W / 2, y: H * 0.5 };
    if (outro.kind === 'jump' && t > 4700 && !wipe) wipe = { t0: now, x: chute && chute.st ? chute.st.x : W / 2, y: chute && chute.st ? chute.st.y - chute.st.h * 0.5 : H * 0.6 };
    if (outro.kind === 'crash' && t > (AIM ? 3000 : 3600)) resetToStart(now);
  }
  if (wipe && !wipe.done && now - wipe.t0 > 430) { wipe.done = true; resetToStart(now); }
  if (wipe && now - wipe.t0 > 950) wipe = null;
  if (chute) chute.st = chuteState(now);
  spaceLife(now, dt);
  const ds = view.speed * dt * 0.0035 * (reduced ? 0.5 : 1);
  view.scroll += ds;
  for (const c of clouds) { c.z -= ds; if (c.z < 1) { c.z = 46 + Math.random() * 14; c.x = view.camX + (Math.random() - 0.5) * 34; c.alt = world.clouds.alt(); } }
  for (const p of spires) { p.z -= ds; if (p.z < 1) spawnSpire(p, true); }
  if (flying && AIM) { view.gz = Z_WAIT; view.camX = gateX(view.pick) * 0.5 * ease(clamp((now - r.t0) / FLY_MS / 0.8, 0, 1)); }   // the row holds its place; the plane turns toward the chosen target
  else if (flying) {
    const p = clamp((now - r.t0) / FLY_MS, 0, 1), pp = r.hit ? Math.min(p, IMPACT) : p;
    view.gz = lerp(Z_WAIT, ZP * 0.45, ease(pp)); view.camX = gateX(view.pick) * ease(clamp(pp / 0.8, 0, 1));
  } else if (!(r && r.status === 'crashed')) view.gz = lerp(Z_FAR, Z_WAIT, easeOut(clamp((now - view.introT) / 450, 0, 1)));
  // the plane leans toward the path you're about to take, and toward the hoop you're hovering while you decide
  const bankTo = flying ? clamp((gateX(view.pick) - view.camX) / SPREAD * 0.22, -0.45, 0.45) : choosing && view.hover >= 0 ? offC(view.hover) * 0.07 : 0;
  view.bank += (bankTo - view.bank) * Math.min(1, dt * 0.008);
  // bombs keep falling far behind the hoops while the pilot decides; never in line with a hoop, so they hint nothing
  if (!AIM && (!r || choosing) && !view.parked && !view.takeoff && now > nextDropAt && W) {
    nextDropAt = now + 650 + Math.random() * 1100;
    const z = 22 + Math.random() * 22;
    for (let i = 0; i < 8; i++) {
      const sx = Math.random() * W;
      if ([0, 1, 2, 3, 4].some(k => Math.abs(W / 2 + gateX(k) * F / Z_WAIT - sx) < RING * F / Z_WAIT * 1.9)) continue;   // the hoops' resting spots
      drops.push({ real: false, x: view.camX + (sx - W / 2) * z / F, z, t0: now, dur: 900 + Math.random() * 500 });
      break;
    }
  }
  drops = drops.filter(b => {
    if (b.real) return true;
    if (now - b.t0 < b.dur) return true;
    booms.push({ x: projX(b.x, b.z), y: altY(H_GATE() + 0.25, b.z), r: 1.1 * F / b.z, t0: now, dur: 700, rot: Math.random() * 7 });
    return false;
  });
  if (plane.state === 'fall') {
    plane.vy += 0.0012 * dt; plane.x += plane.vx * dt; plane.y += plane.vy * dt; plane.rot += plane.vr * dt * (plane.vx >= 0 ? 1 : -1);
    if (!reduced && Math.random() < 0.8) parts.push({ type: 'smoke', x: plane.x + (Math.random() - 0.5) * 30 * PS, y: plane.y - 20 * PS, vx: 0, vy: -0.03, g: 0, life: 0, max: 1100, r: (10 + Math.random() * 14) * PS });
    if (plane.y > H + 260 * PS) plane.state = 'gone';
  }
  parts = parts.filter(q => (q.life += dt) < q.max);
  for (const q of parts) { q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.type === 'smoke') q.r += dt * 0.02; if (q.vr) q.rot += q.vr * dt; }
  booms = booms.filter(b => now - b.t0 < b.dur);
  texts = texts.filter(f => now - f.t0 < f.dur);
  if (iris && iris.out && now - iris.out > 500) iris = null;
  shake *= Math.pow(0.9, dt / 16);
}

function drawWarp(now) {   // the launch's warp: light streaks rushing out from the centre
  const ln = view.launch ? now - view.launch.t0 : -1; if (ln < 450 || ln > 1500 || reduced) return;
  const k = Math.sin(clamp((ln - 450) / 1050, 0, 1) * Math.PI), cx = W / 2, cy = HY + (PY - HY) * 0.25;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a = hash(i, 3) * Math.PI * 2, d0 = (hash(i, 7) * 0.9 + ((ln / 260 + hash(i, 11)) % 1)) * Math.hypot(W, H) * 0.5, len = (40 + 160 * hash(i, 13)) * k;
    ctx.globalAlpha = 0.65 * k; ctx.lineWidth = 1 + 2 * hash(i, 17); ctx.strokeStyle = hash(i, 19) < 0.3 ? '#7ff3ff' : '#ffffff';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); ctx.lineTo(cx + Math.cos(a) * (d0 + len), cy + Math.sin(a) * (d0 + len)); ctx.stroke();
  }
  ctx.restore();
}
function drawGround(now) {
  world.ground(now);
  drawWarp(now);
  const v = ctx.createLinearGradient(0, H * 0.6, 0, H);   // shade at the bottom so the white plane stands out
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, world.shade);
  ctx.fillStyle = v; ctx.fillRect(0, H * 0.6, W, H * 0.4);
}
function drawCloud(c, near) {
  if (c.z < 1) return;
  const w = c.s * 2.6 * F / c.z, h = w * 170 / 300, x = projX(c.x, c.z), y = altY(c.alt - (G_CRUISE - G_H), c.z);
  if (x + w / 2 < 0 || x - w / 2 > W || y - h > H || y + h < 0) return;
  ctx.globalAlpha = clamp((c.z - 1) / 2.5, 0, 1) * clamp((60 - c.z) / 14, 0, 1) * world.clouds.alpha * (near === true ? 0.45 : 1);
  const lift = G_CRUISE - G_H;   // clouds keep their height above the ground while the camera is low
  ctx.drawImage(cloudImg, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
}
function drawPlane(now) {
  const bob = reduced ? 0 : Math.sin(now / 420) * 5 * PS;
  const st = plane.state, L = plane.brain;
  const ground = view.parked || (view.takeoff && now - view.takeoff.t0 < 900), rattle = view.takeoff && !reduced && now - view.takeoff.t0 < 900 ? Math.sin(now / 25) * 1.2 * PS : 0;
  const ln = view.launch ? now - view.launch.t0 : -1;   // the launch: it sinks a little as it charges, then surges up and on
  const lift = ln < 0 ? 0 : ln < 520 ? Math.sin(ln / 520 * Math.PI / 2) * 14 * PS : -Math.sin(clamp((ln - 520) / 900, 0, 1) * Math.PI) * 34 * PS + 14 * PS * (1 - clamp((ln - 520) / 300, 0, 1));
  if (st === 'cruise') planeBack(PX + view.bank * 60 * PS, PY + lift + (ground ? rattle : bob), PS * (ln > 520 && ln < 1400 ? 1 - 0.06 * Math.sin((ln - 520) / 880 * Math.PI) : 1), ground ? 0 : view.bank * 0.9 + (reduced ? 0 : Math.sin(now / 900) * 0.02), now, true, false, L);
  else if (st === 'enter') {
    const p = clamp((now - plane.t0) / 450, 0, 1);
    planeBack(PX, lerp(H + 160 * PS, PY, easeOut(p)), PS, 0, now, true, false, L);
    if (p >= 1) plane.state = 'cruise';
  } else if (st === 'fall') planeBack(plane.x, plane.y, PS, plane.rot, now, true, true, L);
  else if (st === 'exit') {   // the win: it hovers while the Brainer stands up and cheers, then boosts away into the distance
    const t = now - plane.t0, a = ease(clamp(t / 500, 0, 1)), b = clamp((t - EXIT_STAND - 150) / 700, 0, 1), bb = b * b;
    const x = lerp(PX, W * 0.42, a) - bb * W * 0.12, y = lerp(PY, PY - 30 * PS, a) - bb * (PY - HY) * 0.85, s = PS * (1 - 0.85 * bb);
    planeBack(x, y, s, (reduced ? 0 : Math.sin(t / 300) * 0.03) * (1 - bb), now, true, false, L);
    if (t > EXIT_MS) plane.state = 'gone';
  }
  else if (st === 'sink') {   // the loss: dark, nose down, it sinks away and fades
    const t = now - plane.t0, q = ease(clamp(t / 2600, 0, 1));
    ctx.save(); ctx.globalAlpha = 1 - clamp((t - 1800) / 900, 0, 1);
    planeBack(PX + q * 40 * PS, PY + q * H * 0.42, PS * (1 - 0.25 * q), q * 0.2, now, true, false, L);
    ctx.restore();
    if (!reduced && Math.random() < 0.12 && t < 2000) parts.push({ type: 'spark', x: PX + q * 40 * PS + (Math.random() - 0.5) * 120 * PS, y: PY + q * H * 0.42 - 20 * PS, vx: (Math.random() - 0.5) * 0.15, vy: -0.05, g: 0.0006, life: 0, max: 500, r: 2 + Math.random() * 2, c: '#ffc147' });
    if (t > 2800) plane.state = 'gone';
  }
  else if (st === 'empty') {
    const p = clamp((now - plane.t0) / 1700, 0, 1);
    planeBack(PX + Math.sin(p * 8) * 12 * PS, lerp(PY, HY + 8, ease(p)), PS * lerp(1, 0.1, ease(p)), Math.sin(p * 9) * 0.1, now, false, false, L);
    if (p >= 1) plane.state = 'gone';
  }
}
function draw(now) {
  const r = round;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.drawImage(sky, 0, 0, W, HY + 2);
  drawGround(now);
  const far = clouds.filter(c => c.z >= view.gz).sort((a, b) => b.z - a.z), near = clouds.filter(c => c.z < view.gz).sort((a, b) => b.z - a.z);
  far.forEach(c => drawCloud(c));
  for (const b of drops) if (!b.real) {   // distant bombs
    const p = clamp((now - b.t0) / b.dur, 0, 1), alt = lerp(H_GATE() - 3.5, H_GATE() + 0.25, p * p);
    ctx.globalAlpha = clamp(p * 4, 0, 1); bomb(projX(b.x, b.z), altY(alt, b.z), 0.32 * F / b.z, 0.3, now); ctx.globalAlpha = 1;
  }
  for (const b of booms) if (!b.front) drawBoom(b, now);
  const showGates = !!r && (r.status === 'choose' || r.status === 'flying' || r.status === 'crashed');   // the drones arrive with the launch; between rounds space is clear
  if (AIM) { if (showGates && !(r && r.status === 'takeoff')) for (let k = 0; k < cfg.paths; k++) drawTarget(k, now); }
  else if (showGates && plane.state !== 'empty') {
    if (r && (r.status === 'choose' || r.status === 'flying') && view.gz > ZP) {   // the five paths
      const sx = PX + view.bank * 60 * PS, sy = PY - 30 * PS;
      for (let k = 0; k < cfg.paths; k++) {
        const g = gatePos(k); if (g.r < 3) continue;
        ctx.save(); ctx.lineCap = 'round';
        if (k === view.pick || (r.status === 'choose' && view.hover === k)) { ctx.lineWidth = 9; ctx.strokeStyle = lin(sx, sy, g.x, g.y, '#4b36fc', '#8447fb'); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + g.x) / 2, sy - 20, g.x, g.y); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
        else if (!view.row) { ctx.lineWidth = 3; ctx.setLineDash([8, 10]); ctx.lineDashOffset = reduced ? 0 : -now / 25; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + g.x) / 2, sy - 20, g.x, g.y); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (view.gz >= ZP) for (let k = 0; k < cfg.paths; k++) drawGate(k, now, false);
    for (const b of drops) if (b.real) {   // the bombs that decide this step
      const p = clamp((now - b.t0) / (FLY_MS * IMPACT), 0, 1), g = gatePos(b.k), by = g.y - (1 - Math.pow(p, 1.6)) * H * 0.85;
      bomb(g.x, by, g.r * 0.34, Math.sin(now / 90 + b.k) * 0.15, now);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
      for (const o of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(g.x + o * g.r * 0.3, by - g.r * 0.7); ctx.lineTo(g.x + o * g.r * 0.3, by - g.r * 1.3); ctx.stroke(); }
      ctx.restore();
    }
  }
  for (const q of parts) if (q.type === 'smoke') { ctx.globalAlpha = 0.6 * (1 - q.life / q.max); ell(q.x, q.y, q.r, q.r * 0.85); ctx.fillStyle = '#5e5878'; ctx.fill(); }
  ctx.globalAlpha = 1;
  drawPlane(now);
  if (AIM) drawShot(now);
  if (!AIM && showGates && view.gz < ZP && plane.state !== 'empty') for (let k = 0; k < cfg.paths; k++) { drawGate(k, now, false); drawGate(k, now, true); }
  near.forEach(c => drawCloud(c, true));
  for (const b of booms) if (b.front) drawBoom(b, now);
  for (const q of parts) {
    const a = 1 - q.life / q.max;
    if (q.type === 'spark') { ctx.globalAlpha = a; star(q.x, q.y, q.r, 4, 0.4); ctx.fillStyle = q.c; ctx.fill(); }
    else if (q.type === 'hex') {   // a tile of a burst shield, growing as it tumbles past the camera
      const k = 1 + 1.6 * (q.life / q.max);
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(k, k);
      hexPath(q.r); ctx.fillStyle = 'rgba(56,216,255,.22)'; ctx.fill(); ctx.lineWidth = Math.max(1, q.r * 0.08); ctx.strokeStyle = '#7ff3ff'; ctx.stroke();
      ctx.restore();
    }
    else if (q.type === 'coin') { ctx.globalAlpha = a; ell(q.x, q.y, q.r * Math.abs(Math.cos(q.life / 90)) + 1, q.r); ctx.fillStyle = '#ffc147'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#e09a1f'; ctx.stroke(); }
    else if (q.type === 'confetti') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.c; ctx.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  if (chute && chute.st) {
    const st = chute.st;
    if (st.landed) { ctx.globalAlpha = 0.3; ell(st.x, st.y + 2, st.h * 0.4, st.h * 0.09); ctx.fillStyle = '#1d1458'; ctx.fill(); ctx.globalAlpha = 1; }   // its shadow on the road
    if (has3D()) { const D = st.h / 0.376; blit3D(ctx, 'C', st.x, st.y - 0.388 * D, D); }   // in the chute view the Brainer fills 37.6% of the height, feet 38.8% below centre
    else chuteDraw(st.x, st.y - st.h * 0.55, st.h / 160, now, st.open * (1 - st.fold), 1, chute.brain);
  }
  for (const f of texts) {
    const p = (now - f.t0) / f.dur; if (p < 0) continue;
    const pop = f.still ? easeBack(clamp(p * 4, 0, 1)) : 1;
    ctx.globalAlpha = p > 0.75 ? (1 - p) / 0.25 : 1;
    brandText(f.text, f.x, f.y - (f.still ? 0 : p * 60), f.size * clamp(PS * 1.4, 0.75, 1.2) * pop, f.col, -0.06);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (iris) {   // closing iris on the sooty, dazed Brainer
    const cx = W / 2, cy = H * 0.56, R0 = Math.hypot(W, H) * 0.6, R1 = Math.min(W, H) * 0.3;
    let k = clamp((now - iris.t0) / 500, 0, 1);
    if (iris.out) k = Math.min(k, 1 - clamp((now - iris.out) / 500, 0, 1));
    if (k > 0) {
      const R = lerp(R0, R1, easeOut(k));
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, R, 0, Math.PI * 2, true); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      const g = ctx.createRadialGradient(cx, cy - R * 0.1, R * 0.05, cx, cy, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#e7dcff'); g.addColorStop(0.75, '#a688ff'); g.addColorStop(1, '#6a4cf5');
      ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);   // solid backdrop: nothing from the scene shows behind the robot
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      for (let i = 0; i < 14; i++) { const a0 = (reduced ? 0 : now / 2600) + i * Math.PI / 7; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + Math.PI / 16); ctx.closePath(); ctx.fill(); }   // cartoon rays
      const pop = clamp((now - iris.t0 - 120) / 380, 0, 1), img = sootyRobot(iris.brain);
      if (pop > 0 && img) {
        const sz = R1 * 1.75 * easeBack(pop);
        ctx.translate(cx, cy); ctx.rotate(reduced ? 0 : Math.sin(now / 300) * 0.05);
        for (let i = 0; i < 3; i++) {   // smoke over its head
          const q = ((now / 900 + i / 3) % 1);
          ctx.globalAlpha = 0.5 * (1 - q); ell(-R1 * 0.3 + i * R1 * 0.3, -R1 * 0.75 - q * R1 * 0.4, R1 * (0.08 + q * 0.12), R1 * (0.07 + q * 0.1)); ctx.fillStyle = '#6b6585'; ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (has3D()) blit3D(ctx, 'B', 0, 0, sz * 1.15); else drawBrainer(ctx, 0, 0, sz, iris.brain, 'dizzy', now, { img });
        for (let i = 0; i < 4; i++) {   // stars circling its head
          const an = now / 380 + i * Math.PI / 2;
          star(Math.cos(an) * R1 * 0.55, -R1 * 0.58 + Math.sin(an) * R1 * 0.12, R1 * 0.08, 5, 0.45); ctx.fillStyle = '#ffc147'; ctx.fill();
        }
      }
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(132,71,251,.8)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (wipe) {   // a quick iris from the landed Brainer back to the start screen
    const t = now - wipe.t0, k = t < 430 ? easeOut(t / 430) : 1 - easeOut(clamp((t - 430) / 500, 0, 1)), R = lerp(Math.hypot(W, H), 0, k);
    const cx = t < 430 ? wipe.x : W / 2, cy = t < 430 ? wipe.y : H * 0.62;
    ctx.fillStyle = NAVY; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, Math.max(0.1, R), 0, Math.PI * 2, true); ctx.fill();
  }
  if (now - flashAt < 260 && !reduced) { ctx.fillStyle = `rgba(${flashCol},${0.75 * (1 - (now - flashAt) / 260)})`; ctx.fillRect(0, 0, W, H); }
}

function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (W && H) { advance(now); update(now, dt); render3D(now); draw(now); updateUI(now); }
  requestAnimationFrame(loop);
}

/* ---------- readout & controls ---------- */
const cache = {};
const put = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = document.getElementById(id); if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else if (prop === 'hidden') el.hidden = v; else el.setAttribute(prop, v); };
function updateUI(now) {
  const r = round, d = r ? r.d : LEVELS[S.level];
  let label, big, bigCls = 'mult', sub = '', subCls = 'sub';
  if (!r || (!inFlight() && starting)) { label = `${d.name} · ${d.reach < d.steps ? 'up to ' : ''}${d.reach} ${AIM ? 'rows' : 'paths'} · top win`; big = fxShort(topOf(d)); bigCls = 'mult idle'; sub = 'Set your bet and press Play'; }
  else if (r.status === 'choose') {
    const cur = capAt(r.d, r.n, r.stake, r.rtp), next = capAt(r.d, r.n + 1, r.stake, r.rtp);
    label = AIM ? (r.n ? `Row ${r.n} of ${r.reach} broken through · fire or jump` : 'Targets ahead! Pick one and fire') : r.n ? `Path ${r.n} of ${r.reach} cleared · fly on or jump` : 'Bombs ahead! Pick a path';
    big = fx(cur); sub = r.n ? `Cash out now: ${money(payAt(r, r.n))} · next ${fx(next)}` : `${AIM ? 'A broken target' : 'A safe path'} pays ${fx(next)}`;
  } else if (r.status === 'takeoff') { label = 'Launching…'; big = fx(1); sub = `${AIM ? 'A broken target' : 'A safe path'} pays ${fx(capAt(r.d, 1, r.stake, r.rtp))}`;
  } else if (r.status === 'flying') { label = AIM ? `Target ${r.pick + 1} · firing…` : `Path ${r.pick + 1} · bombs away…`; big = fx(capAt(r.d, r.n, r.stake, r.rtp)); sub = `${AIM ? 'Breaking it pays' : 'Safe path pays'} ${fx(capAt(r.d, r.n + 1, r.stake, r.rtp))}`; }
  else if (r.status === 'crashed') { label = AIM ? 'Shield held' : 'Ka-boom!'; big = AIM ? 'Powered down' : 'Crashed'; bigCls = 'mult bust'; sub = AIM ? `Target ${r.pick + 1} held · −${money(r.stake)}` : `Bomb on path ${r.pick + 1} · −${money(r.stake)}`; subCls = 'sub bad'; }
  else { const m = capAt(r.d, r.n, r.stake, r.rtp); label = m >= 100 ? 'Huge win!' : m >= 10 ? 'Big win!' : AIM ? `Cashed out after ${r.n} row${r.n === 1 ? '' : 's'}!` : `Jumped after ${r.n} ${AIM ? 'row' : 'path'}${r.n === 1 ? '' : 's'}!`; big = fx(m); bigCls = m >= 10 ? 'mult win gold' : 'mult win'; sub = `You won ${money(r.payout)}`; subCls = 'sub ok'; }
  if (r && r.popAt && now - r.popAt < 400 && r.status === 'choose') bigCls += ' pop';
  put('label', 'text', label); put('label', 'class', /win!$/.test(label) ? 'label gold' : 'label'); put('mult', 'text', big); put('mult', 'class', bigCls);
  put('sub', 'hidden', !sub); put('sub', 'text', sub); put('sub', 'class', subCls);
  if (r && inFlight()) {
    put('jump', 'aria-disabled', String(!(r.status === 'choose' && r.n >= 1)));
    put('jumpSub', 'text', r.n < 1 ? (AIM ? 'after the first row' : 'after the first path') : money(payAt(r, r.n)));
  }
}
// Play, the paths and Jump go inert with aria-disabled, not disabled: Chrome drops focus from a disabled button (and
// from a hidden one), so keyboard and screen-reader players would lose their place three times a flight. play(),
// choose() and jump() already ignore presses they cannot take.
function renderControls() {
  const fl = inFlight(), from = $(fl ? '#setup' : '#flight'), had = !from.hidden && from.contains(document.activeElement);   // focus in the panel about to hide
  $('#setup').hidden = fl; $('#flight').hidden = !fl;
  $('#playSub').textContent = starting ? 'Taking off…' : `${money(S.stake)} · ${LEVELS[S.level].name}`;
  $('#play').setAttribute('aria-disabled', String(starting));
  document.querySelectorAll('#paths button').forEach((b, k) => { b.setAttribute('aria-disabled', String(!round || round.status !== 'choose')); b.setAttribute('aria-pressed', String(!!round && round.pick === k)); });
  if (had) { $(fl ? '#paths button' : '#play').focus({ preventScroll: true }); ptrFocus = true; }   // to the first path as a flight starts, to Play as it ends; moved by the game, so Space stays the game's
}
function renderLevels() {   // built once, as the tops never change; after that only the pressed one moves, so focus stays on the button
  const bs = document.querySelectorAll('#levels button[data-l]');
  if (bs.length === LEVELS.length) { bs.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.l === S.level))); return; }
  $('#levels').innerHTML = LEVELS.map((d, i) => `<button type="button" data-l="${i}" aria-pressed="${i === S.level}"><b>${d.name}</b><span>up to ${fxShort(topOf(d))}</span></button>`).join('');
}
function renderPaths() {
  $('#paths').classList.toggle('aim', AIM);
  if (AIM) { $('#paths').innerHTML = PATHS.map(([nm], k) => `<button type="button" class="fire" data-p="${k}" aria-label="Fire at target ${k + 1}, ${nm}"><span class="n"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>${k + 1}</span><span class="nm">Fire</span></button>`).join(''); return; }
  $('#paths').innerHTML = PATHS.map(([nm, deg], k) => `<button type="button" data-p="${k}" aria-label="Path ${k + 1}, ${nm}"><span class="n"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g transform="rotate(${deg} 12 12)"><path d="M12 20V5M6 11l6-6 6 6" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></svg>${k + 1}</span><span class="nm">${nm}</span></button>`).join('');
}
function renderLadder() {
  const r = round, d = r ? r.d : LEVELS[S.level], rtp = cfg.rtp, n = r && r.status !== 'crashed' ? r.n : 0, live = inFlight();
  const el = $('#ladder');
  el.innerHTML = Array.from({ length: r ? r.reach : d.reach }, (_, i) => `<span class="rung ${i < n ? 'done' : i === n && live ? 'next' : ''}">${fxShort(capAt(d, i + 1, r ? r.stake : cfg.minBet, rtp))}</span>`).join('');   // what each path pays at the bet placed, or at most before one
  const nx = el.querySelector('.next') || el.querySelectorAll('.done')[n - 1];
  el.scrollLeft = nx ? nx.offsetLeft - el.clientWidth / 2 + nx.offsetWidth / 2 : 0;
}
function renderBalance() { $('#balance').textContent = money(S.balance); $('.hud').classList.toggle('long', S.balance >= 1e5); }   // six figures and up: a phone's top bar tightens (style.css), so the wallet stays on the stage
function renderSound() { const b = $('#sound'); b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', sound.on ? 'Sound on, tap to mute' : 'Sound off, tap to unmute'); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- provably fair: the next flight's commit, and the last flight revealed and re-checked ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);   // client seeds are the player's own text
const kv = (k, v) => `<div class="kv"><span>${k}</span><code>${esc(v)}</code></div>`;
function renderFair() {
  const live = inFlight() ? round : null, r = lastRound, off = live ? ' disabled' : '';
  let h = `<h4>${live ? 'This flight' : 'Your next flight'}</h4>${kv('Server seed hash', live ? live.hash : S.hash)}`
    + `<div class="kv"><label for="seedIn">Your client seed</label><div class="seed-row"><input id="seedIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="seedMsg"${off}><button type="button" id="seedNew"${off}>New random</button></div><p class="seed-msg" id="seedMsg" aria-live="polite"></p></div>`
    + `${kv('Nonce', live ? live.nonce : S.nonce)}`
    + `<p class="sheet-note">${live ? 'The server seed is revealed when this flight ends. You can change your client seed after it.' : 'This hash is fixed now, before you set your client seed or choose a bet. A new client seed applies from your next flight and is kept for this visit only.'}</p>`;
  if (r) h += `<h4>Last round: ${r.d.name}, ${r.status === 'crashed' ? 'shield held' : `cashed out at ${fx(capAt(r.d, r.n, r.stake, r.rtp))}`}</h4>`
    + `${kv('Server seed hash', r.hash)}${kv('Server seed, revealed', r.seed)}${kv('Client seed', r.client)}${kv('Nonce', r.nonce)}`
    + '<button type="button" class="big ghost" id="fairCheck">Check this flight</button><div id="fairOut" aria-live="polite"></div>';
  $('#fairBody').innerHTML = h; $('#seedIn').value = live ? live.client : S.client;
}
function setClient(v) {   // the player's client seed: 1–64 characters (code points, as in FogRush, so an emoji is one), trimmed; anything else keeps the last valid one
  const s = v.trim(), n = [...s].length, ok = n >= 1 && n <= 64;
  if (ok && !inFlight()) S.client = s;
  $('#seedIn').setAttribute('aria-invalid', String(!ok));
  $('#seedMsg').textContent = ok ? '' : `Use 1 to 64 characters${n ? ` (this is ${n})` : ''}. Your last valid seed stays in use.`;
  return ok;
}
async function checkFair() {
  const r = lastRound;
  if (!r) return;
  const hashOk = (await sha256(r.seed)) === r.hash;
  const bombs = await drawBombs(r.seed, r.client, r.nonce, r.d);
  const bombsOk = JSON.stringify(bombs) === JSON.stringify(r.bombs);
  const played = r.status === 'crashed' ? r.n + 1 : r.n, shown = r.status === 'cashed' && !r.auto ? played + 1 : played;   // after the player's own jump, also show the step they skipped
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  const rows = Array.from({ length: shown }, (_, i) => {
    const hit = bombs[i].flatMap((b, k) => b ? [k + 1] : []), s = hit.length > 1 ? 's' : '';   // each row also reads out in words: the colours alone tell a screen reader nothing
    const say = `Step ${i + 1}${i >= played ? ', skipped by jumping' : ''}: ${hit.length ? `bomb${s} on path${s} ${hit.join(', ')}` : 'no bombs'}${r.picks[i] != null ? `; you picked path ${r.picks[i] + 1}` : ''}`;
    return `<div class="frow${i >= played ? ' next' : ''}" role="img" aria-label="${say}"><span class="st">${i + 1}</span>`
      + bombs[i].map((b, k) => `<i class="${b ? 'bomb' : ''}${r.picks[i] === k ? ' pick' : ''}"></i>`).join('') + '</div>';
  }).join('');
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before the flight' : 'The seed does not match the hash')
    + ok(bombsOk, bombsOk ? 'Bombs recomputed from the seeds match your flight' : 'Recomputed bombs differ from the flight')
    + `<div class="fgrid" role="group" aria-label="Bombs at each step">${rows}</div>`
    + `<p class="sheet-note">Red: a drone whose shield would hold. White ring: the drone you shot.${shown > played ? ' The faded row is the next row you skipped by cashing out.' : ''}</p>`;
}

/* ---------- sheets: brain-level picker, fairness and how to play ---------- */
const sheetOpen = () => !$('#tutorial').hidden || !$('#agegate').hidden || !$('#fairSheet').hidden;
let lastFocus = null;
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; const f = $(id).querySelector('button[aria-pressed=true], button'); if (f) f.focus({ preventScroll: true }); }   // no scroll: inside the website's frame it would scroll the parent page
function closeSheet(id) { $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('#help').addEventListener('click', () => openSheet('#tutorial'));
$('#fair').addEventListener('click', () => { renderFair(); openSheet('#fairSheet'); });
$('#fairClose').addEventListener('click', () => closeSheet('#fairSheet'));
$('#fairBody').addEventListener('click', e => { if (e.target.closest('#fairCheck')) checkFair(); if (e.target.closest('#seedNew') && !inFlight()) { $('#seedIn').value = randHex(8); setClient($('#seedIn').value); } });
$('#fairBody').addEventListener('input', e => { if (e.target.id === 'seedIn') setClient(e.target.value); });
$('#fairBody').addEventListener('change', e => { if (e.target.id === 'seedIn' && setClient(e.target.value)) e.target.value = S.client; });   // on leaving the field an accepted seed shows as it is used, trimmed, as in FogRush
$('#tutGo').addEventListener('click', () => { store.set('brainer.sc.tutorial', 'seen'); closeSheet('#tutorial'); });
// 18+ check, shared with the website (same key), so a visitor who confirmed there is not asked again
$('#ageYes').addEventListener('click', () => { store.set('brainer.age-ok', '1'); closeSheet('#agegate'); if (store.get('brainer.sc.tutorial', '') !== 'seen') openSheet('#tutorial'); });
$('#ageNo').addEventListener('click', () => { $('#ageSorry').hidden = false; $('.age-actions').hidden = true; });
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s && s.id !== 'agegate') { if (s.id === 'tutorial') store.set('brainer.sc.tutorial', 'seen'); closeSheet('#' + s.id); } }));

/* ---------- input ---------- */
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
function setStake(v) { S.stake = clampStake(v); $('#amt').value = S.stake.toFixed(2); renderControls(); }
$('#amt').addEventListener('change', () => setStake(parseFloat($('#amt').value)));
$('#dec').addEventListener('click', () => setStake(S.stake - (S.stake > 10 ? 1 : 0.5)));
$('#inc').addEventListener('click', () => setStake(S.stake + (S.stake >= 10 ? 1 : 0.5)));
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const c = b.dataset.chip; setStake(c === 'min' ? cfg.minBet : c === 'max' ? Math.min(cfg.maxBet, Math.floor(S.balance * 100 + 1e-6) / 100) : c === 'half' ? S.stake / 2 : S.stake * 2); });
$('#levels').addEventListener('click', e => {
  const b = e.target.closest('button[data-l]'); if (!b || inFlight()) return;
  S.level = +b.dataset.l; renderLevels(); renderControls();
  const now = performance.now();
  round = null; outro = null; chute = null; wipe = null; recenter(); setTrack(LEVELS[S.level], 0, cfg.rtp); plane.brain = myLevel(); park();
  if (iris) iris.out = now;
  if (plane.state !== 'cruise') { plane.state = 'enter'; plane.t0 = now; }
  renderLadder();
});
$('#play').addEventListener('click', play);
$('#paths').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) { choose(+b.dataset.p); ptrFocus = true; } });   // focus stays on a picked path, which leaves Space to the game: Space jumps, never flies that path again
for (const ev of ['pointerover', 'focusin']) $('#paths').addEventListener(ev, e => { const b = e.target.closest('button[data-p]'); view.hover = b ? +b.dataset.p : -1; });
for (const ev of ['pointerleave', 'focusout']) $('#paths').addEventListener(ev, () => { view.hover = -1; });
$('#jump').addEventListener('click', () => jump(false));
$('#sound').addEventListener('click', () => { sound.toggle(); renderSound(); });
$('#refill').addEventListener('click', () => { if (inFlight()) { toast('Finish this flight first.'); return; } S.balance = cfg.startBalance; renderBalance(); toast(`Demo balance reset to ${money(cfg.startBalance)}.`); });
const gateAt = e => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; return view.hit.findIndex(g => g && Math.hypot(g.x - x, g.y - y) < g.r * 1.2); };
cv.addEventListener('pointermove', e => { view.hover = round && round.status === 'choose' ? gateAt(e) : -1; cv.style.cursor = view.hover >= 0 ? 'pointer' : ''; });
cv.addEventListener('pointerleave', () => { view.hover = -1; });
cv.addEventListener('click', e => { if (round && round.status === 'choose') { const k = gateAt(e); if (k >= 0) choose(k); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {   // Tab stays inside the open sheet (the last one in the page is on top)
    const s = [...document.querySelectorAll('.sheet')].filter(x => !x.hidden).pop();
    if (s) { const f = [...s.querySelectorAll('button, input')].filter(b => !b.disabled && b.getClientRects().length), i = f.indexOf(document.activeElement); if (!f.length) e.preventDefault(); else if (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus({ preventScroll: true }); } }
    return;
  }
  if (e.key === 'Escape') { if (!$('#fairSheet').hidden) closeSheet('#fairSheet'); if (!$('#tutorial').hidden) { store.set('brainer.sc.tutorial', 'seen'); closeSheet('#tutorial'); } return; }
  if (!booted) { if (e.code === 'Space') e.preventDefault(); return; }   // no game keys under the intro (the 18+ check comes first); Space only skips it, with no page scroll
  if (sheetOpen()) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave browser shortcuts (Ctrl+1, Alt+Space…) alone
  const dk = /^Digit([1-5])$/.exec(e.code) || /^([1-5])$/.exec(e.key);   // the key's place first, so AZERTY's number row works too (as in FogRush); the numpad by its digit
  if (dk) { if (!e.repeat) choose(+dk[1] - 1); return; }   // a held key never flies the next path by itself
  if (e.code !== 'Space' || e.repeat || (tag === 'BUTTON' && !ptrFocus)) return;   // a button reached with Tab takes Space itself; one just clicked does not
  e.preventDefault();
  if (inFlight()) jump(false); else play();
});

/* ---------- boot ---------- */
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { lastInput = performance.now(); }, true);
let ptrFocus = false;   // focus last moved by a click (Chrome focuses clicked buttons) or by the game, not by Tab
document.addEventListener('pointerdown', () => { ptrFocus = true; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Tab') ptrFocus = false; }, true);
setWorld('space');
if (new URLSearchParams(location.search).has('test')) window.pcTest = { next: '' };   // pcTest.next = 'safe' | 'boom' forces the next step
S.client = randHex(8);
rotateSeed().catch(() => {});   // without crypto.subtle (plain http) Play says why instead
setStake(S.stake); renderLevels(); renderPaths(); renderBalance(); renderControls(); renderSound();
layout(); plane.brain = myLevel(); setTrack(LEVELS[S.level], 0, cfg.rtp); park(); renderLadder();
// The Brainer intro plays first (logo motion and loading); the 18+ check and the tutorial follow it.
const bootT = performance.now();
function loadProgress() {   // fonts, the robot art and the 3D engine; a slow network never holds the player past 9 s
  if (performance.now() - bootT > 9000) return 1;
  const art = ART.filter(im => im.complete).length / ART.length, font = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0;
  const three = b3 === false || window.Brainer3D === false || has3D() ? 1 : window.Brainer3D ? 0.6 : 0;   // false: no WebGL, or the module never loaded (blocked, or no import maps before Safari 16.4)
  return (art + font + three * 2) / 4;
}
// The intro's actor: the player's Brainer flying its 3D plane toward the camera, on its own renderer.
let introA = null;
function introActor(g, w, h, now, ex) {
  if (!window.Brainer3D || introA === false) return false;
  if (!introA) { try { const { Brainer, BrainerStage, PodJet } = window.Brainer3D, pilot = new Brainer(myLevel()); introA = { stage: new BrainerStage(), pilot, plane: new PodJet(pilot) }; introA.stage.setSize(512, 512); } catch (e) { introA = false; return false; } }
  const a = introA;
  if (!a.pilot.ready) return false;
  a.t0 = a.t0 || now;   // its screen switches on while the game loads: slowly, and never ahead of the loading
  a.pilot.update(now, ex, { seat: true, lookX: Math.sin(now / 1300) * 0.3, power: Math.min(loadProgress(), (now - a.t0) / 2800), reduced });
  a.plane.update(now, { bank: reduced ? 0 : Math.sin(now / 900) * 0.16, pitch: reduced ? 0 : Math.sin(now / 700) * 0.04, tier: 3, reduced });
  a.plane.root.position.y = reduced ? 0 : Math.sin(now / 520) * 0.1;
  a.stage.draw(a.plane, 0, 0, 512, 512, 'planeHero');
  g.drawImage(a.stage.canvas, 0, 0, 512, 512, 0, 0, w, h);
  return true;
}
$('.brand .t1').innerHTML = window.BrainerIntro ? window.BrainerIntro.wordmark('SPACE CRASH') : 'Space Crash';
(window.BrainerIntro ? window.BrainerIntro.start({ title: 'Space Crash', mark: 'SPACE CRASH', theme: 'space', what: 'your pod', actor: introActor, progress: loadProgress }) : Promise.resolve()).then(() => {
  booted = true;   // before the 18+ sheet opens, which then holds the game keys
  if (introA) introA.stage.dispose(); introA = false;   // the intro's own WebGL context goes: phones allow only so many
  if (store.get('brainer.age-ok', store.get('blink.age-ok', '')) !== '1') openSheet('#agegate');
  else if (store.get('brainer.sc.tutorial', '') !== 'seen') openSheet('#tutorial');
});
requestAnimationFrame(loop);
})();
