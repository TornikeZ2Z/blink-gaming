(() => {
'use strict';
const $ = s => document.querySelector(s);
const money = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';
const fxShort = m => m < 1000 ? m.toFixed(2) + '×' : m < 1e6 ? Math.floor(m).toLocaleString('en-US') + '×' : (m / 1e6).toFixed(2) + 'M×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- config & math ---------- */
// Levels follow Chicken Road: same step counts, first and top multipliers, and 98% RTP. The chance of a
// bomb rises with every step; after n safe paths the multiplier is RTP ÷ (chance of surviving all n),
// rounded down to the cent, so jumping out at any step returns the same RTP.
const cfg = {
  rtp: 98, minBet: 0.1, maxBet: 200, maxWin: 10000, paths: 5,
  // Brain cells: one for every path flown. thresholds = cells needed for brain levels 1-10. boost = extra X in
  // percent that each brain level adds to every multiplier, locked in when a flight starts. Pending legal review:
  // boostOn false leaves the certified 98% untouched and keeps the levels as looks only.
  brain: { thresholds: [0, 10, 25, 45, 70, 100, 140, 190, 250, 320], boost: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1], boostOn: true }
};
const LEVELS = [
  { key: 'easy', name: 'Easy', steps: 24, first: 1.02, top: 24.5 },
  { key: 'medium', name: 'Medium', steps: 22, first: 1.11, top: 2254 },
  { key: 'hard', name: 'Hard', steps: 20, first: 1.22, top: 52067 },
  { key: 'hardcore', name: 'Hardcore', steps: 15, first: 1.6, top: 3203385 }
];
for (const d of LEVELS) {
  const r = cfg.rtp / 100, N = d.steps, a = Math.log(d.first / r), b = 2 * (Math.log(d.top / r) - N * a) / (N * (N - 1));
  d.safe = []; d.mult = [1];
  for (let n = 1; n <= N; n++) {
    d.safe.push(Math.exp(-(a + b * (n - 1))));
    d.mult.push(Math.floor(r * Math.exp(n * a + b * n * (n - 1) / 2) * 100 + 1e-7) / 100);
  }
}
const PATHS = [['Far left', -60], ['Left', -30], ['Ahead', 0], ['Right', 30], ['Far right', 60]];
const brainLevel = cells => { let L = 1; cfg.brain.thresholds.forEach((t, i) => { if (cells >= t) L = i + 1; }); return L; };
const boostOf = L => cfg.brain.boostOn ? cfg.brain.boost[L - 1] : 0;
const multAt = (d, n, boost) => n <= 0 ? 1 : Math.floor(d.mult[n] * (1 + boost / 100) * 100 + 1e-7) / 100;

/* ---------- state ---------- */
const S = { balance: 1000, stake: 10, level: 1, nonce: 1, client: '', seed: '', hash: '', cells: 0 };
try { S.cells = Math.max(0, parseInt(localStorage.getItem('brainer.cells'), 10) || 0); } catch (e) {}   // shared by every Brainer game on this site
let round = null, starting = false;   // round: the flight in play, or the last one settled
const inFlight = () => !!round && (round.status === 'choose' || round.status === 'flying');
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
async function rotateSeed() { S.seed = randHex(32); S.hash = await sha256(S.seed); }

/* ---------- round flow ---------- */
const FLY_MS = 1100, IMPACT = 0.68;
async function play() {
  if (inFlight() || starting) return;
  const d = LEVELS[S.level];
  if (S.stake < cfg.minBet || S.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)} FUN.`); return; }
  if (S.stake > S.balance) { toast('Not enough FUN for this bet. Lower it or reset the demo balance.'); return; }
  starting = true; renderControls();
  const r = { stake: S.stake, d, n: 0, boost: boostOf(myLevel()), seed: S.seed, hash: S.hash, client: S.client, nonce: S.nonce++, status: 'choose', payout: 0, pick: -1 };
  try { r.bombs = await drawBombs(r.seed, r.client, r.nonce, d); } finally { starting = false; }
  S.balance -= r.stake; round = r;
  sceneStart(d);
  $('#pilot').classList.remove('sooty'); react('hop', "Let's fly!");
  renderBalance(); renderControls(); renderLadder();
}
function choose(k) {
  const r = round;
  if (!r || r.status !== 'choose' || k < 0 || k >= cfg.paths) return;
  r.pick = k; r.status = 'flying'; r.t0 = performance.now(); r.hit = r.bombs[r.n][k]; r.struck = false;
  sceneFly(k, r.bombs[r.n], r.t0);
  react('shake', 'Gulp…');
  addCells(1);
  renderControls();
}
function jump(auto) {
  const r = round;
  if (!r || r.status !== 'choose' || r.n < 1) return;
  r.payout = Math.min(r.stake * multAt(r.d, r.n, r.boost), cfg.maxWin); r.status = 'cashed';
  S.balance += r.payout;
  sceneJump(performance.now());
  react('pop', 'Wheee!');
  if (auto) toast(r.n >= r.d.steps ? 'Last path cleared, so your Brainer jumped automatically.' : 'Max win reached, so your Brainer jumped automatically.');
  settle();
}
function settle() { rotateSeed(); renderBalance(); renderControls(); renderLadder(); }
function advance(now) {
  const r = round;
  if (!r || r.status !== 'flying') return;
  const p = (now - r.t0) / FLY_MS;
  if (!r.struck && p >= IMPACT) {
    r.struck = true; sceneImpact(now);
    if (r.hit) { r.status = 'crashed'; sceneCrash(now); $('#pilot').classList.add('sooty'); react('shake', 'Ouch!'); settle(); flushLevelUp(); return; }
  }
  if (p >= 1) {
    r.n++; r.status = 'choose'; r.pick = -1; r.popAt = now;
    scenePassed(now); react('hop', 'Phew!'); flushLevelUp();
    if (r.n >= r.d.steps || r.stake * multAt(r.d, r.n, r.boost) >= cfg.maxWin) jump(true);
    renderControls(); renderLadder();
  }
}

/* ---------- brain cells ---------- */
let luT = 0, bubT = 0, pendingLevel = 0;
function addCells(k) {
  const before = myLevel();
  S.cells += k;
  try { localStorage.setItem('brainer.cells', String(S.cells)); } catch (e) {}
  const after = myLevel();
  renderPilot();
  if (after > before) { renderLevels(); pendingLevel = after; }   // shown once this path is decided
}
function flushLevelUp() {
  if (!pendingLevel) return;
  const L = pendingLevel, el = $('#levelup'); pendingLevel = 0;
  plane.brain = L;   // the dome shows the new brain at once; the X boost waits for the next flight
  $('#luImg').src = `assets/brainer-${L}.png`; $('#luTitle').textContent = `Brain level ${L}`;
  $('#luSub').textContent = cfg.brain.boostOn ? `X boost +${boostOf(L)}% from your next flight` : 'Your Brainer grew new brain cells';
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(luT); luT = setTimeout(() => { el.hidden = true; }, 2600);
}
function renderPilot() {
  const L = myLevel(), t = cfg.brain.thresholds, next = t[L];
  $('#pilotImg').src = `assets/brainer-${L}.png`; $('#pilotImg').alt = `Your Brainer, brain level ${L}`;
  $('#lvnum').textContent = L; $('#plv').textContent = `Brain level ${L}`;
  $('#pbar').style.width = (next == null ? 100 : Math.round((S.cells - t[L - 1]) / (next - t[L - 1]) * 100)) + '%';
  $('#pnote').textContent = (next == null ? `${S.cells} brain cells` : `${S.cells} / ${next} brain cells`) + (cfg.brain.boostOn ? ` · X +${boostOf(L)}%` : '');
}
function react(kind, text) {
  const p = $('#pilot'), b = $('#bubble');
  p.classList.remove('r-hop', 'r-shake', 'r-pop'); void p.offsetWidth; p.classList.add('r-' + kind);
  b.textContent = text; b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(bubT); bubT = setTimeout(() => { b.hidden = true; }, 1300);
}

/* ---------- scene ---------- */
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
const NAVY = '#0a1322', VIOLET = '#532aff', LINE = 'rgba(10,19,34,.32)';
const ROBOT = Array.from({ length: 10 }, (_, i) => { const im = new Image(); im.src = `assets/brainer-${i + 1}.png`; return im; });
// Brain inside the dome, per level: two colours from the brand book and how many neurons glow.
const BRAIN = [['#33d66d', '#00ebc0', 2], ['#33d66d', '#00ebc0', 3], ['#fa7b5b', '#ffc147', 5], ['#fa7b5b', '#ffc147', 7], ['#9433ed', '#e36072', 9], ['#9433ed', '#e36072', 11], ['#ed2b4b', '#ed6b6b', 14], ['#ed2b4b', '#ed6b6b', 17], ['#4b36fc', '#8447fb', 20], ['#4b36fc', '#8447fb', 24]];
const NEURONS = (() => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = [];
  while (out.length < 24) { const x = (rnd() * 2 - 1) * 40, y = -96 + (rnd() * 2 - 1) * 30; if ((x / 42) ** 2 + ((y + 92) / 34) ** 2 < 1 && y < -62) out.push({ x, y, r: 4 + rnd() * 5, link: -1 }); }
  out.forEach((n, i) => { let best = -1, bd = 1e9; for (let j = 0; j < i; j++) { const dd = (n.x - out[j].x) ** 2 + (n.y - out[j].y) ** 2; if (dd < bd) { bd = dd; best = j; } } n.link = best; });
  return out;
})();
const sootCache = {};
function sootyRobot(L) {
  const im = ROBOT[L - 1];
  if (sootCache[L] || !im.complete || !im.naturalWidth) return sootCache[L] || null;
  const c = document.createElement('canvas'); c.width = c.height = 500; const g = c.getContext('2d');
  g.drawImage(im, 0, 0, 500, 500); g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(28,22,40,.45)'; g.fillRect(0, 0, 500, 500);
  g.fillStyle = 'rgba(12,8,18,.55)';
  for (const [x, y, r] of [[170, 120, 58], [330, 200, 66], [220, 390, 52], [360, 80, 40], [120, 300, 44], [270, 290, 36]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0.4, 0, 7); g.fill(); }
  return (sootCache[L] = c);
}

const ZP = 2.2, Z_WAIT = 9, Z_FAR = 40, G_H = 5;   // depths: plane, waiting gates, new gates; ground drop
let W = 0, H = 0, dpr = 1, F = 500, HY = 200, PX = 0, PY = 0, PS = 0.8, SPREAD = 2, RING = 1, last = 0;
let shake = 0, flashAt = -1e9, flashCol = '255,255,255', nextDropAt = 0, sky = null;
const view = { d: LEVELS[1], n: 0, boost: 0, camX: 0, gz: Z_WAIT, introT: -1e9, pick: -1, row: null, struck: false, scroll: 0, fieldX: 0, speed: 1, bank: 0, hit: [], hover: -1 };
const plane = { state: 'cruise', t0: 0, x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, brain: 1 };
let chute = null, iris = null, parts = [], booms = [], drops = [], texts = [];
const clouds = Array.from({ length: 16 }, () => ({ x: (Math.random() - 0.5) * 34, alt: -2.6 + Math.random() * 4.2, z: 4 + Math.random() * 56, s: 0.9 + Math.random() * 1.4 }));

function layout() {
  W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  F = H * 0.95; HY = H * 0.4; PX = W / 2; PY = H * 0.8;
  PS = clamp(Math.min(W / 900, H / 560), 0.45, 1);
  const dx = Math.min(W * 0.17, 170);   // gap between waiting gates on screen
  SPREAD = dx * Z_WAIT / F; RING = Math.min(dx * 0.34, 56) * Z_WAIT / F;
  paintSky();
}
new ResizeObserver(layout).observe(stage);

function paintSky() {
  sky = document.createElement('canvas'); sky.width = Math.max(1, Math.round(W * dpr)); sky.height = Math.max(1, Math.round((HY + 2) * dpr));
  const g = sky.getContext('2d'); g.scale(dpr, dpr);
  const gr = g.createLinearGradient(0, 0, 0, HY);
  gr.addColorStop(0, '#4b36fc'); gr.addColorStop(0.45, '#8447fb'); gr.addColorStop(0.8, '#c8a9ff'); gr.addColorStop(1, '#f1e9ff');
  g.fillStyle = gr; g.fillRect(0, 0, W, HY + 2);
  const sx = W * 0.82, sy = HY * 0.36, sr = clamp(H * 0.045, 16, 30);
  const halo = g.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 4.5);
  halo.addColorStop(0, 'rgba(255,214,240,.7)'); halo.addColorStop(1, 'rgba(255,214,240,0)');
  g.fillStyle = halo; g.fillRect(0, 0, W, HY);
  g.fillStyle = '#fff4fb'; g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
}
const cloudImg = (() => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 170; const g = c.getContext('2d');
  const P = [[78, 108, 46], [128, 80, 58], [190, 92, 50], [112, 120, 42], [170, 122, 44], [232, 116, 36], [48, 124, 30]];
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, col); gr.addColorStop(0.78, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  P.forEach(([x, y, r]) => blob(x, y + 10, r, 'rgba(201,184,255,.95)'));
  P.forEach(([x, y, r]) => blob(x - 3, y - 3, r * 0.9, 'rgba(255,255,255,.98)'));
  return c;
})();

const gateX = k => (k - 2) * SPREAD;
const projX = (x, z) => W / 2 + (x - view.camX) * F / z;
const altY = (alt, z) => HY + alt * F / z;
const H_GATE = () => (PY - HY) * ZP / F;   // gates fly at the plane's height
const gatePos = k => { const z = view.gz; return { x: projX(gateX(k), z), y: altY(H_GATE(), z), r: RING * F / z, z }; };

function setTrack(d, n, boost) { Object.assign(view, { d, n, boost, pick: -1, row: null, struck: false, introT: performance.now(), camX: 0 }); }
function recenter() { for (const c of clouds) c.x -= view.camX; view.fieldX -= view.camX; view.camX = 0; }
function sceneStart(d) {
  const now = performance.now();
  recenter(); setTrack(d, 0, round.boost); plane.brain = myLevel();
  if (plane.state !== 'cruise') { plane.state = 'enter'; plane.t0 = now; }
  if (chute) chute.leave = chute.leave || now;
  if (iris) iris.out = iris.out || now;
  drops = drops.filter(b => !b.real);
}
function sceneFly(k, row, t0) {
  view.pick = k; view.row = row; view.struck = false;
  row.forEach((bombed, j) => { if (bombed) drops.push({ real: true, k: j, t0 }); });
}
function sceneImpact(now) {
  view.struck = true;
  drops = drops.filter(b => !b.real);
  view.row.forEach((bombed, j) => {
    if (!bombed || j === view.pick) return;
    const g = gatePos(j); booms.push({ x: g.x, y: g.y, r: g.r * 1.5, t0: now, dur: 900, rot: Math.random() * 7, text: Math.random() < 0.5 ? 'BOOM!' : 'POW!' });
  });
  if (!round.hit) { const g = gatePos(view.pick); burst(g.x, g.y, 18, ['#33d66d', '#00ebc0', '#ffffff'], 0.35); }
}
function sceneCrash(now) {
  const g = gatePos(view.pick);
  booms.push({ x: (g.x + PX) / 2, y: PY - 40 * PS, r: 230 * PS, t0: now, dur: 1200, rot: Math.random() * 7, text: 'KA-BOOM!', front: true });
  burst(PX, PY - 40 * PS, 40, ['#ffc147', '#fa7b5b', '#ed2b4b', NAVY], 0.6);
  flashAt = now; flashCol = '255,240,245'; shake = reduced ? 0 : 16;
  Object.assign(plane, { state: 'fall', t0: now, x: PX, y: PY, rot: view.bank, vx: 0.05 * (view.bank >= 0 ? 1 : -1), vy: -0.25, vr: 0.0028 });
  iris = { t0: now + 450, brain: myLevel() };
}
function scenePassed(now) {
  recenter(); setTrack(view.d, round.n, round.boost);
  burst(PX, PY - 50 * PS, 22, ['#33d66d', '#00ebc0', '#ffffff'], 0.4);
  texts.push({ text: fx(multAt(round.d, round.n, round.boost)), x: PX, y: PY - 175 * PS, t0: now, col: '#7dffcf' });
}
function sceneJump(now) {
  chute = { t0: now, x: PX, y0: PY - 70 * PS, leave: 0, brain: myLevel() };
  Object.assign(plane, { state: 'empty', t0: now });
  for (let i = 0; i < 26; i++) parts.push({ type: 'coin', x: PX, y: PY - 70 * PS, vx: (Math.random() - 0.5) * 0.7, vy: -0.4 - Math.random() * 0.5, g: 0.0011, life: 0, max: 1500 + Math.random() * 600, r: 5 + Math.random() * 4 });
  for (let i = 0; i < 70; i++) parts.push({ type: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 0.08, vy: 0.08 + Math.random() * 0.12, g: 0, life: 0, max: 3200, r: 5 + Math.random() * 4, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 0.02, c: ['#4b36fc', '#8447fb', '#33d66d', '#ffc147', '#ffffff', '#ed6b6b'][i % 6] });
  flashAt = now; flashCol = '200,180,255';
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
  ctx.font = `900 ${Math.round(size)}px FiraGO, "Fira Sans", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = shadow || 'rgba(75,54,252,.75)'; ctx.fillText(text, 0, size * 0.08);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0); ctx.restore();
}

/* the player's Brainer from behind in the cockpit (rim at 0,0); its brain shows the brain level */
function robotBack(t, L) {
  const [c1, c2, n] = BRAIN[L - 1];
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.roundRect(-44, -50, 88, 56, 22); ctx.fillStyle = lin(0, -50, 0, 6, '#ffffff', '#d6cefa'); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#c9c0f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, 2); ctx.stroke();
  for (const sd of [-1, 1]) {   // arms resting on the rim
    ctx.beginPath(); ctx.moveTo(sd * 34, -32); ctx.quadraticCurveTo(sd * 60, -22, sd * 56, -2);
    ctx.lineWidth = 17; ctx.strokeStyle = '#c9c0f5'; ctx.stroke(); ctx.lineWidth = 12; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }
  const bob = reduced ? 0 : Math.sin(t / 260) * 1.5;
  ctx.save(); ctx.translate(0, bob);
  ell(0, -88, 52, 46); ctx.fillStyle = 'rgba(196,182,255,.5)'; ctx.fill();
  ctx.save(); ell(0, -88, 50, 44); ctx.clip();
  ctx.lineWidth = 2.5; ctx.strokeStyle = c1;
  for (let i = 1; i < n; i++) { const a = NEURONS[i], b = NEURONS[a.link]; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  const pulse = reduced ? 1 : 1 + Math.sin(t / 300) * 0.08;
  for (let i = 0; i < n; i++) { const a = NEURONS[i], g = ctx.createRadialGradient(a.x - a.r * 0.3, a.y - a.r * 0.3, 0, a.x, a.y, a.r * pulse); g.addColorStop(0, c2); g.addColorStop(1, c1); ell(a.x, a.y, a.r * pulse, a.r * pulse); ctx.fillStyle = g; ctx.fill(); }
  ctx.restore();
  ell(0, -88, 53, 47); ctx.strokeStyle = 'rgba(83,42,255,.45)'; ctx.lineWidth = 2; ctx.stroke();
  ell(0, -88, 51, 45); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -88, 40, 34, 0, Math.PI * 1.08, Math.PI * 1.42); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 5; ctx.stroke();
  ell(0, -50, 50, 10); ctx.fillStyle = lin(0, -60, 0, -40, '#ffffff', '#ddd6fb'); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

/* the plane from behind; origin at the cockpit rim */
function planeBack(x, y, s, rot, t, pilot, soot, L) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  if (soot) ctx.filter = 'brightness(.45) saturate(.5)';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = LINE; ctx.lineWidth = 2;
  ell(0, 22, 96, 96); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();   // propeller disc
  ctx.save(); ctx.strokeStyle = 'rgba(10,19,34,.25)'; ctx.lineWidth = 7; const pa = t / 20;
  for (const o of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(Math.cos(pa + o) * 22, 22 + Math.sin(pa + o) * 22); ctx.lineTo(Math.cos(pa + o) * 92, 22 + Math.sin(pa + o) * 92); ctx.stroke(); }
  ctx.restore();
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * 40, 24); ctx.lineTo(sd * 198, 8); ctx.quadraticCurveTo(sd * 226, 8, sd * 224, 22); ctx.quadraticCurveTo(sd * 222, 34, sd * 198, 34); ctx.lineTo(sd * 40, 48); ctx.closePath();
    ctx.fillStyle = lin(0, 8, 0, 48, '#ffffff', '#d4ccf8'); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sd * 182, 10); ctx.lineTo(sd * 198, 8); ctx.quadraticCurveTo(sd * 226, 8, sd * 224, 22); ctx.quadraticCurveTo(sd * 222, 34, sd * 198, 34); ctx.lineTo(sd * 182, 36); ctx.closePath();
    ctx.fillStyle = lin(sd * 182, 0, sd * 226, 0, '#4b36fc', '#8447fb'); ctx.fill();
    ctx.strokeStyle = '#8d86b8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sd * 54, 46); ctx.lineTo(sd * 64, 82); ctx.stroke();
    ell(sd * 66, 90, 11, 15); ctx.fillStyle = NAVY; ctx.fill();
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
  }
  const body = ctx.createRadialGradient(-18, 6, 6, 0, 28, 70); body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#cfc6f7');
  ell(0, 28, 62, 50); ctx.fillStyle = body; ctx.fill(); ctx.stroke();
  ctx.save(); ctx.strokeStyle = lin(-50, 0, 50, 0, '#4b36fc', '#8447fb'); ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(0, 28, 50, 39, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); ctx.restore();
  ell(0, -4, 50, 15); ctx.fillStyle = '#1b1640'; ctx.fill();   // cockpit
  if (pilot) robotBack(t, L);
  ctx.strokeStyle = '#c9c0f5'; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(0, -4, 50, 15, 0, 0, Math.PI); ctx.stroke();
  ctx.strokeStyle = LINE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-116, 64); ctx.quadraticCurveTo(-128, 71, -116, 78); ctx.lineTo(116, 78); ctx.quadraticCurveTo(128, 71, 116, 64); ctx.closePath(); ctx.fillStyle = lin(0, 64, 0, 78, '#ffffff', '#d4ccf8'); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, 88); ctx.lineTo(-5, 36); ctx.quadraticCurveTo(0, 26, 5, 36); ctx.lineTo(8, 88); ctx.closePath(); ctx.fillStyle = lin(0, 30, 0, 88, '#8447fb', '#4b36fc'); ctx.fill();
  ctx.restore();
}
function chuteDraw(x, y, s, t, open, alpha, L) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(reduced ? 0 : Math.sin(t / 700) * 0.1); ctx.scale(s, s);
  if (open > 0.02) {
    ctx.save(); ctx.scale(open, open); ctx.translate(0, -120 * (1 - open));
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.85)';
    for (const px of [-138, -70, 70, 138]) { ctx.beginPath(); ctx.moveTo(px, -150); ctx.lineTo(px < 0 ? -62 : 62, -10); ctx.stroke(); }
    const dome = () => { ctx.beginPath(); ctx.moveTo(-150, -150); ctx.bezierCurveTo(-150, -272, 150, -272, 150, -150); for (let i = 5; i >= 0; i--) { const xa = -150 + i * 50; ctx.quadraticCurveTo(xa + 25, -136, xa, -150); } ctx.closePath(); };
    dome(); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save(); dome(); ctx.clip(); ctx.fillStyle = lin(-150, -260, 150, -140, '#4b36fc', '#8447fb');
    for (let i = 0; i < 6; i += 2) { ctx.beginPath(); ctx.moveTo(0, -290); ctx.lineTo(-150 + i * 50, -130); ctx.lineTo(-100 + i * 50, -130); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  }
  const im = ROBOT[L - 1];
  if (im.complete && im.naturalWidth) ctx.drawImage(im, -110, -70, 220, 220);
  ctx.restore();
}

function bomb(x, y, r, rot, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.quadraticCurveTo(r * 0.5, -r * 1.5, r * 0.3, -r * 1.85); ctx.strokeStyle = '#c9a06a'; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-r * 0.32, -r * 1.2, r * 0.64, r * 0.36, r * 0.08); ctx.fillStyle = '#3a3f58'; ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); g.addColorStop(0, '#3a4366'); g.addColorStop(1, NAVY);
  ell(0, 0, r, r); ctx.fillStyle = g; ctx.fill();
  ell(-r * 0.38, -r * 0.38, r * 0.28, r * 0.17, -0.7); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
  if ((t / 70 | 0) % 2 === 0 || reduced) { star(r * 0.3, -r * 1.9, r * 0.45, 5, 0.45); ctx.fillStyle = '#ffc147'; ctx.fill(); }
  ctx.restore();
}
function drawBoom(b, now) {
  const a = (now - b.t0) / b.dur;
  if (a < 0 || a >= 1) return;
  const grow = easeOut(Math.min(1, a * 2.6)), fade = a < 0.6 ? 1 : 1 - (a - 0.6) / 0.4;
  ctx.save(); ctx.translate(b.x, b.y); ctx.globalAlpha = fade;
  for (let i = 0; i < 7; i++) {   // smoke
    const an = b.rot + i * 0.9, d = b.r * (0.35 + 0.6 * a);
    ell(Math.cos(an) * d, Math.sin(an) * d * 0.7 - a * b.r * 0.4, b.r * (0.22 + 0.22 * a), b.r * (0.2 + 0.2 * a)); ctx.fillStyle = 'rgba(86,78,118,.7)'; ctx.fill();
  }
  if (a < 0.7) {
    const R = b.r * (0.35 + 0.65 * grow);
    ctx.rotate(b.rot);
    star(0, 0, R, 12, 0.56); ctx.fillStyle = '#ed2b4b'; ctx.fill();
    star(0, 0, R * 0.78, 12, 0.52); ctx.fillStyle = '#fa7b5b'; ctx.fill();
    star(0, 0, R * 0.56, 12, 0.5); ctx.fillStyle = '#ffc147'; ctx.fill();
    ell(0, 0, R * 0.24, R * 0.24); ctx.fillStyle = '#fff6e0'; ctx.fill();
    ctx.rotate(-b.rot);
  }
  ctx.restore();
  if (b.text && a < 0.75) brandText(b.text, b.x, b.y - b.r * (0.15 + 0.2 * a), b.r * 0.4 * (0.7 + 0.3 * grow), '#ffffff', -0.1);
}
function drawGate(k, now, front) {
  const g = gatePos(k);
  if (g.r < 3 || g.x + g.r < -40 || g.x - g.r > W + 40) return;
  const intro = clamp((now - view.introT) / 450, 0, 1);
  const passing = g.z < ZP ? clamp((g.z / ZP - 0.45) / 0.45, 0, 1) : 1;
  let st = 'idle';
  if (view.struck && view.row) st = view.row[k] ? 'boom' : k === view.pick ? 'safe' : 'idle';
  else if (k === view.pick) st = 'picked';
  const r = round, choosing = r && r.status === 'choose';
  ctx.save(); ctx.globalAlpha = easeOut(intro) * passing * (view.struck && st === 'idle' ? 0.5 : 1);
  const lw = Math.max(4, g.r * 0.2);
  if (!front) {
    if (st === 'picked' || (choosing && view.hover === k)) { const gl = ctx.createRadialGradient(g.x, g.y, g.r * 0.5, g.x, g.y, g.r * 1.5); gl.addColorStop(0, 'rgba(132,71,251,.45)'); gl.addColorStop(1, 'rgba(132,71,251,0)'); ctx.fillStyle = gl; ctx.fillRect(g.x - g.r * 1.6, g.y - g.r * 1.6, g.r * 3.2, g.r * 3.2); }
    ell(g.x, g.y + lw * 0.35, g.r, g.r); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(10,19,34,.16)'; ctx.stroke();
    ell(g.x, g.y, g.r, g.r);
    ctx.lineWidth = lw; ctx.strokeStyle = st === 'boom' ? '#2a2540' : st === 'safe' ? lin(g.x - g.r, 0, g.x + g.r, 0, '#33d66d', '#00ebc0') : st === 'picked' ? lin(g.x - g.r, 0, g.x + g.r, 0, '#4b36fc', '#8447fb') : '#ffffff'; ctx.stroke();
    if (st === 'idle' || st === 'picked') {
      ctx.setLineDash([g.r * 0.18, g.r * 0.32]); ctx.lineDashOffset = reduced ? 0 : -now / 40;
      ctx.lineWidth = lw * 0.32; ctx.strokeStyle = st === 'picked' ? '#ffffff' : '#8447fb'; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  if (front || g.z >= ZP) {   // path number in the hoop, the multiplier it leads to above it
    view.hit[k] = g;
    if (g.r > 14 && st !== 'boom' && g.z > ZP * 1.2) {
      brandText(String(k + 1), g.x, g.y + g.r * 0.04, g.r * 0.62, st === 'picked' ? '#ffffff' : VIOLET, 0, st === 'picked' ? 'rgba(75,54,252,.75)' : 'rgba(255,255,255,.9)');
      const tx = fxShort(multAt(view.d, Math.min(view.n + 1, view.d.steps), view.boost)), fs = clamp(g.r * 0.34, 11, 17);
      ctx.font = `800 ${Math.round(fs)}px FiraGO, "Fira Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(tx).width + fs * 1.2, ty = g.y - g.r - fs * 0.9 - 6;
      ctx.beginPath(); ctx.roundRect(g.x - tw / 2, ty - fs * 0.78, tw, fs * 1.56, fs * 0.78);
      ctx.fillStyle = st === 'safe' ? lin(g.x - tw / 2, 0, g.x + tw / 2, 0, '#33d66d', '#00ebc0') : st === 'picked' ? lin(g.x - tw / 2, 0, g.x + tw / 2, 0, '#4b36fc', '#8447fb') : '#ffffff'; ctx.fill();
      ctx.fillStyle = st === 'idle' ? VIOLET : st === 'safe' ? NAVY : '#ffffff'; ctx.fillText(tx, g.x, ty + fs * 0.06);
    }
  }
  ctx.restore();
}

/* ---------- loop ---------- */
function update(now, dt) {
  const r = round, flying = r && r.status === 'flying';
  view.speed += ((flying ? 2.6 : 1) - view.speed) * Math.min(1, dt * 0.005);
  const ds = view.speed * dt * 0.0035 * (reduced ? 0.5 : 1);
  view.scroll += ds;
  for (const c of clouds) { c.z -= ds; if (c.z < 1) { c.z = 46 + Math.random() * 14; c.x = view.camX + (Math.random() - 0.5) * 34; c.alt = -2.6 + Math.random() * 4.2; } }
  if (flying) {
    const p = clamp((now - r.t0) / FLY_MS, 0, 1), pp = r.hit ? Math.min(p, IMPACT) : p;
    view.gz = lerp(Z_WAIT, ZP * 0.45, ease(pp)); view.camX = gateX(view.pick) * ease(clamp(pp / 0.8, 0, 1));
  } else if (!(r && r.status === 'crashed')) view.gz = lerp(Z_FAR, Z_WAIT, easeOut(clamp((now - view.introT) / 450, 0, 1)));
  const bankTo = flying ? clamp((gateX(view.pick) - view.camX) / SPREAD * 0.22, -0.45, 0.45) : 0;
  view.bank += (bankTo - view.bank) * Math.min(1, dt * 0.008);
  // bombs keep falling far behind the hoops while the pilot decides; never in line with a hoop, so they hint nothing
  if ((!r || r.status === 'choose') && now > nextDropAt && W) {
    nextDropAt = now + 650 + Math.random() * 1100;
    const z = 22 + Math.random() * 22;
    for (let i = 0; i < 8; i++) {
      const sx = Math.random() * W;
      if ([0, 1, 2, 3, 4].some(k => Math.abs(W / 2 + gateX(k) * F / Z_WAIT - sx) < RING * F / Z_WAIT * 1.4)) continue;   // the hoops' resting spots
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
  texts = texts.filter(f => now - f.t0 < 1300);
  if (chute && chute.leave && now - chute.leave > 1200) chute = null;
  if (iris && iris.out && now - iris.out > 500) iris = null;
  shake *= Math.pow(0.9, dt / 16);
}

function drawGround() {
  const D = 3.2, CW = 3.4, base = Math.floor(view.scroll / D);
  const FIELD = ['#e6defd', '#ddd3fb', '#efe9ff', '#d4c9f8', '#e9e2fe', '#e0d7fc', '#f3eeff', '#d9cffa'];
  ctx.fillStyle = '#e4dcfd'; ctx.fillRect(0, HY, W, H - HY);
  for (let k = 28; k >= 0; k--) {
    const row = base + k, z0 = Math.max(0.6, row * D - view.scroll), z1 = row * D + D - view.scroll;
    if (z1 <= 0.6) continue;
    const y0 = Math.min(H + 2, altY(G_H, z0)), y1 = altY(G_H, z1);
    if (y1 > H) continue;
    const half = (W / 2) * z0 / F + CW, c0 = Math.floor((view.camX - view.fieldX - half) / CW), c1 = Math.ceil((view.camX - view.fieldX + half) / CW);
    for (let c = c0; c <= c1; c++) {
      const xa = c * CW + view.fieldX, xb = xa + CW;
      ctx.fillStyle = FIELD[((row * 7 + c * 13) % FIELD.length + FIELD.length) % FIELD.length];
      ctx.beginPath(); ctx.moveTo(projX(xa, z0), y0); ctx.lineTo(projX(xb, z0), y0); ctx.lineTo(projX(xb, z1), y1); ctx.lineTo(projX(xa, z1), y1); ctx.closePath(); ctx.fill();
    }
  }
  const g = ctx.createLinearGradient(0, HY, 0, HY + H * 0.24);
  g.addColorStop(0, 'rgba(246,240,255,.95)'); g.addColorStop(1, 'rgba(246,240,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, HY - 1, W, H * 0.24);
  const v = ctx.createLinearGradient(0, H * 0.6, 0, H);   // violet shade so the white plane stands out
  v.addColorStop(0, 'rgba(75,54,252,0)'); v.addColorStop(1, 'rgba(75,54,252,.28)');
  ctx.fillStyle = v; ctx.fillRect(0, H * 0.6, W, H * 0.4);
}
function drawCloud(c, near) {
  if (c.z < 1) return;
  const w = c.s * 2.6 * F / c.z, h = w * 170 / 300, x = projX(c.x, c.z), y = altY(c.alt, c.z);
  if (x + w / 2 < 0 || x - w / 2 > W || y - h > H || y + h < 0) return;
  ctx.globalAlpha = clamp((c.z - 1) / 2.5, 0, 1) * clamp((60 - c.z) / 14, 0, 1) * (near === true ? 0.4 : 0.9);
  ctx.drawImage(cloudImg, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
}
function drawPlane(now) {
  const bob = reduced ? 0 : Math.sin(now / 420) * 5 * PS;
  const st = plane.state, L = plane.brain;
  if (st === 'cruise') planeBack(PX + view.bank * 60 * PS, PY + bob, PS, view.bank * 0.9 + (reduced ? 0 : Math.sin(now / 900) * 0.02), now, true, false, L);
  else if (st === 'enter') {
    const p = clamp((now - plane.t0) / 450, 0, 1);
    planeBack(PX, lerp(H + 160 * PS, PY, easeOut(p)), PS, 0, now, true, false, L);
    if (p >= 1) plane.state = 'cruise';
  } else if (st === 'fall') planeBack(plane.x, plane.y, PS, plane.rot, now, true, true, L);
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
  drawGround();
  const far = clouds.filter(c => c.z >= view.gz).sort((a, b) => b.z - a.z), near = clouds.filter(c => c.z < view.gz).sort((a, b) => b.z - a.z);
  far.forEach(c => drawCloud(c));
  for (const b of drops) if (!b.real) {   // distant bombs
    const p = clamp((now - b.t0) / b.dur, 0, 1), alt = lerp(H_GATE() - 3.5, H_GATE() + 0.25, p * p);
    ctx.globalAlpha = clamp(p * 4, 0, 1); bomb(projX(b.x, b.z), altY(alt, b.z), 0.32 * F / b.z, 0.3, now); ctx.globalAlpha = 1;
  }
  for (const b of booms) if (!b.front) drawBoom(b, now);
  const showGates = r ? (r.status === 'choose' || r.status === 'flying' || r.status === 'crashed') : true;
  if (showGates && plane.state !== 'empty') {
    if (r && (r.status === 'choose' || r.status === 'flying') && view.gz > ZP) {   // the five paths
      const sx = PX + view.bank * 60 * PS, sy = PY - 30 * PS;
      for (let k = 0; k < cfg.paths; k++) {
        const g = gatePos(k); if (g.r < 3) continue;
        ctx.save(); ctx.lineCap = 'round';
        if (k === view.pick) { ctx.lineWidth = 9; ctx.strokeStyle = lin(sx, sy, g.x, g.y, '#4b36fc', '#8447fb'); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + g.x) / 2, sy - 20, g.x, g.y); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
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
  if (showGates && view.gz < ZP && plane.state !== 'empty') for (let k = 0; k < cfg.paths; k++) { drawGate(k, now, false); drawGate(k, now, true); }
  near.forEach(c => drawCloud(c, true));
  for (const b of booms) if (b.front) drawBoom(b, now);
  for (const q of parts) {
    const a = 1 - q.life / q.max;
    if (q.type === 'spark') { ctx.globalAlpha = a; star(q.x, q.y, q.r, 4, 0.4); ctx.fillStyle = q.c; ctx.fill(); }
    else if (q.type === 'coin') { ctx.globalAlpha = a; ell(q.x, q.y, q.r * Math.abs(Math.cos(q.life / 90)) + 1, q.r); ctx.fillStyle = '#ffc147'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#e09a1f'; ctx.stroke(); }
    else if (q.type === 'confetti') { ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.c; ctx.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  if (chute) {
    const t = now - chute.t0, p = clamp(t / 500, 0, 1), open = clamp((t - 280) / 450, 0, 1);
    let y = Math.min(lerp(chute.y0, H * 0.58, easeOut(p)) + Math.max(0, t - 900) * 0.005, H * 0.64), alpha = 1;
    if (chute.leave) { const q = (now - chute.leave) / 1200; y += q * q * H; alpha = 1 - q; }
    chuteDraw(chute.x + (reduced ? 0 : Math.sin(t / 900) * 18 * PS), y, PS * 0.62, now, open > 0 ? easeBack(open) : 0, clamp(alpha, 0, 1), chute.brain);
  }
  for (const f of texts) { const p = (now - f.t0) / 1300; ctx.globalAlpha = 1 - p; brandText(f.text, f.x, f.y - p * 60, 30 * clamp(PS * 1.4, 0.8, 1.2), f.col, -0.06); }
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
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R); g.addColorStop(0, 'rgba(241,233,255,.95)'); g.addColorStop(1, 'rgba(200,169,255,.6)');
      ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      const pop = clamp((now - iris.t0 - 300) / 400, 0, 1), img = sootyRobot(iris.brain);
      if (pop > 0 && img) {
        const sz = R1 * 1.75 * easeBack(pop);
        ctx.translate(cx, cy); ctx.rotate(reduced ? 0 : Math.sin(now / 300) * 0.05);
        for (let i = 0; i < 3; i++) {   // smoke over the dome
          const q = ((now / 900 + i / 3) % 1);
          ctx.globalAlpha = 0.5 * (1 - q); ell(-R1 * 0.3 + i * R1 * 0.3, -R1 * 0.75 - q * R1 * 0.4, R1 * (0.08 + q * 0.12), R1 * (0.07 + q * 0.1)); ctx.fillStyle = '#6b6585'; ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        for (let i = 0; i < 4; i++) {   // stars circling the dome
          const an = now / 380 + i * Math.PI / 2;
          star(Math.cos(an) * R1 * 0.55, -R1 * 0.58 + Math.sin(an) * R1 * 0.12, R1 * 0.08, 5, 0.45); ctx.fillStyle = '#ffc147'; ctx.fill();
        }
      }
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(132,71,251,.8)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (now - flashAt < 260 && !reduced) { ctx.fillStyle = `rgba(${flashCol},${0.75 * (1 - (now - flashAt) / 260)})`; ctx.fillRect(0, 0, W, H); }
}

function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (W && H) { advance(now); update(now, dt); draw(now); updateUI(now); }
  requestAnimationFrame(loop);
}

/* ---------- readout & controls ---------- */
const cache = {};
const put = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = document.getElementById(id); if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else if (prop === 'hidden') el.hidden = v; else if (prop === 'disabled') el.disabled = v; };
function updateUI(now) {
  const r = round, d = r ? r.d : LEVELS[S.level];
  let label, big, bigCls = 'mult', sub = '', subCls = 'sub';
  if (!r || (!inFlight() && starting)) { label = `${d.name} · ${d.steps} paths · top win`; big = fxShort(multAt(d, d.steps, boostOf(myLevel()))); bigCls = 'mult idle'; sub = 'Set your bet and press Play'; }
  else if (r.status === 'choose') {
    const cur = multAt(r.d, r.n, r.boost), next = multAt(r.d, r.n + 1, r.boost);
    label = r.n ? `Path ${r.n} of ${r.d.steps} cleared · fly on or jump` : 'Bombs ahead! Pick a path';
    big = fx(cur); sub = r.n ? `Jump now: ${money(Math.min(r.stake * cur, cfg.maxWin))} FUN · next ${fx(next)}` : `A safe path pays ${fx(next)}`;
  } else if (r.status === 'flying') { label = `Path ${r.pick + 1} · bombs away…`; big = fx(multAt(r.d, r.n, r.boost)); sub = `Safe path pays ${fx(multAt(r.d, r.n + 1, r.boost))}`; }
  else if (r.status === 'crashed') { label = 'Ka-boom!'; big = 'Crashed'; bigCls = 'mult bust'; sub = `Bomb on path ${r.pick + 1} · −${money(r.stake)} FUN`; subCls = 'sub bad'; }
  else { label = `Jumped after ${r.n} path${r.n === 1 ? '' : 's'}!`; big = fx(multAt(r.d, r.n, r.boost)); bigCls = 'mult win'; sub = `You won ${money(r.payout)} FUN`; subCls = 'sub ok'; }
  if (r && r.popAt && now - r.popAt < 400 && r.status === 'choose') bigCls += ' pop';
  put('label', 'text', label); put('mult', 'text', big); put('mult', 'class', bigCls);
  put('sub', 'hidden', !sub); put('sub', 'text', sub); put('sub', 'class', subCls);
  if (r && inFlight()) {
    put('jump', 'disabled', !(r.status === 'choose' && r.n >= 1));
    put('jumpSub', 'text', r.n < 1 ? 'after the first path' : money(Math.min(r.stake * multAt(r.d, r.n, r.boost), cfg.maxWin)) + ' FUN');
  }
}
function renderControls() {
  const fl = inFlight();
  $('#setup').hidden = fl; $('#flight').hidden = !fl;
  $('#playSub').textContent = starting ? 'Taking off…' : `${money(S.stake)} FUN · ${LEVELS[S.level].name}`;
  $('#play').disabled = starting;
  document.querySelectorAll('#paths button').forEach((b, k) => { b.disabled = !round || round.status !== 'choose'; b.setAttribute('aria-pressed', String(!!round && round.pick === k)); });
}
function renderLevels() {
  const b = boostOf(myLevel());
  $('#levels').innerHTML = LEVELS.map((d, i) => `<button type="button" data-l="${i}" aria-pressed="${i === S.level}"><b>${d.name}</b><span>up to ${fxShort(multAt(d, d.steps, b))}</span></button>`).join('');
}
function renderPaths() {
  $('#paths').innerHTML = PATHS.map(([nm, deg], k) => `<button type="button" data-p="${k}"><span class="n"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g transform="rotate(${deg} 12 12)"><path d="M12 20V5M6 11l6-6 6 6" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></svg>${k + 1}</span><span class="nm">${nm}</span></button>`).join('');
}
function renderLadder() {
  const r = round, d = r ? r.d : LEVELS[S.level], b = r ? r.boost : boostOf(myLevel()), n = r && r.status !== 'crashed' ? r.n : 0, live = inFlight();
  const el = $('#ladder');
  el.innerHTML = Array.from({ length: d.steps }, (_, i) => `<span class="rung ${i < n ? 'done' : i === n && live ? 'next' : ''}">${fxShort(multAt(d, i + 1, b))}</span>`).join('');
  const nx = el.querySelector('.next') || el.querySelectorAll('.done')[n - 1];
  el.scrollLeft = nx ? nx.offsetLeft - el.clientWidth / 2 + nx.offsetWidth / 2 : 0;
}
function renderBalance() { $('#balance').textContent = money(S.balance); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- input ---------- */
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
function setStake(v) { S.stake = clampStake(v); $('#amt').value = S.stake.toFixed(2); renderControls(); }
$('#amt').addEventListener('change', () => setStake(parseFloat($('#amt').value)));
$('#dec').addEventListener('click', () => setStake(S.stake - (S.stake > 10 ? 1 : 0.5)));
$('#inc').addEventListener('click', () => setStake(S.stake + (S.stake >= 10 ? 1 : 0.5)));
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const c = b.dataset.chip; setStake(c === 'min' ? cfg.minBet : c === 'max' ? Math.min(cfg.maxBet, Math.floor(S.balance * 100) / 100) : c === 'half' ? S.stake / 2 : S.stake * 2); });
$('#levels').addEventListener('click', e => {
  const b = e.target.closest('button[data-l]'); if (!b || inFlight()) return;
  S.level = +b.dataset.l; renderLevels(); renderControls();
  const now = performance.now();
  round = null; recenter(); setTrack(LEVELS[S.level], 0, boostOf(myLevel())); plane.brain = myLevel();
  if (iris) iris.out = now;
  if (chute) chute.leave = now;
  if (plane.state !== 'cruise') { plane.state = 'enter'; plane.t0 = now; }
  $('#pilot').classList.remove('sooty');
  renderLadder();
});
$('#play').addEventListener('click', play);
$('#paths').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b && !b.disabled) choose(+b.dataset.p); });
$('#jump').addEventListener('click', () => jump(false));
$('#refill').addEventListener('click', () => { if (inFlight()) { toast('Finish this flight first.'); return; } S.balance = 1000; renderBalance(); toast('Demo balance reset to 1,000 FUN.'); });
const gateAt = e => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; return view.hit.findIndex(g => g && Math.hypot(g.x - x, g.y - y) < g.r * 1.2); };
cv.addEventListener('pointermove', e => { view.hover = round && round.status === 'choose' ? gateAt(e) : -1; cv.style.cursor = view.hover >= 0 ? 'pointer' : ''; });
cv.addEventListener('click', e => { if (round && round.status === 'choose') { const k = gateAt(e); if (k >= 0) choose(k); } });
document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (/^[1-5]$/.test(e.key)) { choose(+e.key - 1); return; }
  if (e.code !== 'Space' || e.repeat || tag === 'BUTTON') return;
  e.preventDefault();
  if (inFlight()) jump(false); else play();
});

/* ---------- boot ---------- */
S.client = randHex(8);
rotateSeed();
setStake(S.stake); renderLevels(); renderPaths(); renderBalance(); renderControls(); renderPilot();
layout(); plane.brain = myLevel(); setTrack(LEVELS[S.level], 0, boostOf(myLevel())); renderLadder();
requestAnimationFrame(loop);
})();
