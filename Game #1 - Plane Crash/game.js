(() => {
'use strict';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';
const fxShort = m => (m < 1000 ? m.toFixed(2) : Math.floor(m).toLocaleString('en-US')) + '×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- config & math ---------- */
// Each difficulty is fixed by its first and top multiplier at the 98% reference RTP. The chance of a bomb rises with
// every step; after n safe paths the multiplier is RTP ÷ (chance of surviving all n), rounded down to the cent, so
// jumping out at any step returns that RTP. The odds are the same for every player; only the RTP differs by brain level.
const cfg = {
  refRtp: 98, minBet: 0.1, maxBet: 200, maxWin: 10000, startBalance: 1000, paths: 5,
  brain: {
    // RTP by brain level: below Chicken Road at level 1, level with it (98%) at level 5, a little above at level 10.
    // Locked in when a flight starts. Pending test-lab and legal review: on false keeps every player at refRtp.
    on: true,
    rtp: [96.5, 96.9, 97.3, 97.65, 98.0, 98.15, 98.3, 98.45, 98.6, 98.75],
    // Brain cells needed for levels 1-10. Each path flown earns stake × that step's bomb chance × rate, so cells follow
    // the risk taken: a $10 Easy path earns about 6, a $10 Hardcore path about 40, and grinding Easy is slow.
    cells: [0, 50, 150, 300, 550, 900, 1400, 2100, 3000, 4200],
    rate: 10
  }
};
const LEVELS = [
  { key: 'easy', name: 'Easy', steps: 24, first: 1.04, top: 25 },
  { key: 'medium', name: 'Medium', steps: 22, first: 1.11, top: 400 },
  { key: 'hard', name: 'Hard', steps: 20, first: 1.22, top: 2500 },
  { key: 'hardcore', name: 'Hardcore', steps: 15, first: 1.6, top: 10000 }
];
for (const d of LEVELS) {
  const r = cfg.refRtp / 100, N = d.steps, a = Math.log(d.first / r), b = 2 * (Math.log(d.top / r) - N * a) / (N * (N - 1));
  d.safe = []; d.cum = [1];   // cum[n] = chance of surviving the first n paths
  for (let n = 1; n <= N; n++) { d.safe.push(Math.exp(-(a + b * (n - 1)))); d.cum.push(d.cum[n - 1] * d.safe[n - 1]); }
}
const PATHS = [['Far left', -60], ['Left', -30], ['Ahead', 0], ['Right', 30], ['Far right', 60]];
const brainLevel = cells => { let L = 1; cfg.brain.cells.forEach((t, i) => { if (cells >= t) L = i + 1; }); return L; };
const rtpOf = L => cfg.brain.on ? cfg.brain.rtp[L - 1] : cfg.refRtp;
const multAt = (d, n, rtp) => n <= 0 ? 1 : Math.floor(rtp / 100 / d.cum[n] * 100 + 1e-7) / 100;

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, stake: 10, level: 0, nonce: 1, client: '', seed: '', hash: '', cells: Math.max(0, parseFloat(store.get('brainer.cells', '0')) || 0) };   // cells are shared by every Brainer game on this site
let round = null, lastRound = null, starting = false;   // round: the flight in play, or the last one settled; lastRound: the last settled, for the fairness check
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
    takeoff() { noise(0.7, 0.1, 500, 2600); tone(120, 240, 0.6, 'sawtooth', 0.025); },
    pick() { tone(520, 780, 0.1, 'triangle', 0.1); tone(1500, 480, 0.75, 'sine', 0.035, 0.05); },
    safe() { tone(880, 0, 0.12, 'sine', 0.12); tone(1320, 0, 0.2, 'sine', 0.1, 0.08); },
    boom() { noise(1, 0.45, 1000, 50); tone(95, 38, 0.7, 'sine', 0.25); },
    jump() { noise(0.25, 0.12, 3000, 700); [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0, 0.16, 'triangle', 0.09, 0.12 + i * 0.07)); },
    level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.22, 'sine', 0.1, i * 0.08)); }
  };
})();

/* ---------- round flow ---------- */
const FLY_MS = 1100, IMPACT = 0.68;
async function play() {
  if (inFlight() || starting || sheetOpen()) return;
  const d = LEVELS[S.level];
  if (S.stake < cfg.minBet || S.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)}.`); return; }
  if (S.stake > S.balance) { toast('Not enough demo balance for this bet. Lower it or press Reset.'); return; }
  starting = true; renderControls();
  const L = myLevel();
  const r = { stake: S.stake, d, n: 0, rtp: rtpOf(L), seed: S.seed, hash: S.hash, client: S.client, nonce: S.nonce++, status: 'choose', payout: 0, pick: -1, picks: [] };
  try { r.bombs = await drawBombs(r.seed, r.client, r.nonce, d); } finally { starting = false; }
  S.balance -= r.stake; round = r;
  sceneStart(d);
  $('#pilot').classList.remove('sooty'); react('hop', "Let's fly!"); feel('wink', 900); sound.takeoff();
  renderBalance(); renderControls(); renderLadder();
}
function choose(k) {
  const r = round;
  if (!r || r.status !== 'choose' || k < 0 || k >= cfg.paths || sheetOpen()) return;
  r.pick = k; r.picks[r.n] = k; r.status = 'flying'; r.t0 = performance.now(); r.hit = r.bombs[r.n][k]; r.struck = false;
  sceneFly(k, r.bombs[r.n], r.t0);
  react('shake', 'Gulp…'); sound.pick();
  addCells(r.stake * (1 - r.d.safe[r.n]) * cfg.brain.rate);
  renderControls();
}
function jump(auto) {
  const r = round;
  if (!r || r.status !== 'choose' || r.n < 1) return;
  const m = multAt(r.d, r.n, r.rtp);
  r.payout = Math.min(r.stake * m, cfg.maxWin); r.status = 'cashed';
  S.balance += r.payout;
  sceneJump(performance.now(), m);
  react('pop', m >= 100 ? 'Whoa!!' : m >= 10 ? 'Big win!' : 'Wheee!'); if (m >= 10) feel('amazed', 1700); sound.jump();
  if (auto) toast(r.n >= r.d.steps ? 'Last path cleared, so your Brainer jumped automatically.' : `Max win of ${money(cfg.maxWin)} reached, so your Brainer jumped automatically.`);
  settle();
}
function settle() { lastRound = round; round.endAt = performance.now(); rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); }); renderBalance(); renderControls(); renderLadder(); }
function advance(now) {
  const r = round;
  if (!r || r.status !== 'flying') return;
  const p = (now - r.t0) / FLY_MS;
  if (!r.struck && p >= IMPACT) {
    r.struck = true; sceneImpact(now);
    if (r.hit) {
      r.status = 'crashed'; sceneCrash(now); $('#pilot').classList.add('sooty'); react('shake', 'Ouch!'); feel('shock', 450); sound.boom();
      if (navigator.vibrate) navigator.vibrate(120);
      settle(); flushLevelUp(); return;
    }
    sound.safe();
  }
  if (p >= 1) {
    r.n++; r.status = 'choose'; r.pick = -1; r.popAt = now;
    scenePassed(now); react('hop', 'Phew!'); feel('phew', 1000); flushLevelUp();
    if (r.n >= r.d.steps || r.stake * multAt(r.d, r.n, r.rtp) >= cfg.maxWin) jump(true);
    renderControls(); renderLadder();
  }
}

/* ---------- brain cells ---------- */
let luT = 0, bubT = 0, pendingLevel = 0;
function addCells(k) {
  const before = myLevel();
  S.cells = Math.round((S.cells + k) * 10) / 10;
  store.set('brainer.cells', String(S.cells));
  earnFloat(k);
  const after = myLevel();
  renderPilot();
  if (after > before) { renderLevels(); pendingLevel = after; }   // shown once this path is decided
}
function flushLevelUp() {
  if (!pendingLevel) return;
  const L = pendingLevel, el = $('#levelup'); pendingLevel = 0;
  plane.brain = L;   // the dome shows the new brain at once; the new RTP starts with the next flight
  $('#luImg').src = brainerURL(L, 'love'); $('#luTitle').textContent = `Brain level ${L}`; feel('love', 1900);
  $('#luSub').textContent = cfg.brain.on ? `RTP ${rtpOf(L).toFixed(2)}%` : 'Your Brainer grew new brain cells';
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(luT); luT = setTimeout(() => { el.hidden = true; }, 2800);
  sound.level();
}
function setBrainLevel(L) {   // demo picker: jump straight to a brain level
  S.cells = cfg.brain.cells[L - 1]; store.set('brainer.cells', String(S.cells));
  pendingLevel = 0; renderPilot(); renderLevels();
  if (!inFlight()) { plane.brain = L; setTrack(view.d, 0, rtpOf(L)); renderLadder(); }
  else plane.brain = L;
  react('pop', `Level ${L}!`);
}
function earnFloat(k) {
  if (reduced || W < 10) return;
  const sr = stage.getBoundingClientRect(), pr = $('#pilot .ava').getBoundingClientRect();
  const el = document.createElement('span'); el.className = 'earn';
  el.innerHTML = `<i></i>+${k < 10 ? k.toFixed(1) : Math.round(k)} brain cells`;
  const x0 = PX + 70 * PS, y0 = PY - 110 * PS;   // starts beside the dome and flies into the portrait
  el.style.left = x0 + 'px'; el.style.top = y0 + 'px';
  stage.appendChild(el);
  const dx = pr.left - sr.left + pr.width / 2 - x0, dy = pr.top - sr.top + pr.height / 2 - y0;
  el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 0 }, { transform: 'translate(0,-24px) scale(1)', opacity: 1, offset: 0.25 }, { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0.2 }], { duration: 1100, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => { el.remove(); const p = $('#pilot'); p.classList.remove('r-gain'); void p.offsetWidth; p.classList.add('r-gain'); };
  view.glowT = performance.now();
}
function renderPilot() {
  const L = myLevel(), t = cfg.brain.cells, next = t[L], cells = Math.floor(S.cells);
  $('#lvnum').textContent = L; $('#plv').textContent = `Brain level ${L}`;
  $('#pilot').setAttribute('aria-label', `Brain level ${L}, ${cells} brain cells. Change brain level (demo).`);
  $('#pbar').style.width = (next == null ? 100 : Math.round((S.cells - t[L - 1]) / (next - t[L - 1]) * 100)) + '%';
  $('#pnote').textContent = (next == null ? `${cells.toLocaleString('en-US')} brain cells` : `${cells.toLocaleString('en-US')} / ${next.toLocaleString('en-US')} cells`) + (cfg.brain.on ? ` · RTP ${rtpOf(L).toFixed(2)}%` : '');
  document.querySelectorAll('#levelsGrid button').forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === L)));
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
  const im = BLANK[L - 1];
  if (sootCache[L] || !im.complete || !im.naturalWidth) return sootCache[L] || null;
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
/* ---------- the Brainer's face ---------- */
// The brand art with its painted face wiped (assets/brainer-N-blank.png); the face is drawn live on the visor, so the
// Brainer reacts to the flight. At rest each level keeps the face of its art: a ring eye and a wink (1–2), happy arcs
// (3–4), a grin (5–6), heart eyes (7–8), glasses (9–10). Coordinates are in the 500 px art, centred on the visor.
const BLANK = Array.from({ length: 10 }, (_, i) => { const im = new Image(); im.src = `assets/brainer-${i + 1}-blank.png`; return im; });
const VISOR = [[252, 278], [253, 278], [251, 282], [255, 284], [252, 282], [253, 282], [244, 282], [246, 286, -0.06], [252, 282], [256, 281]];
const EXPR = {
  focus: { eyes: 'dot', mouth: 'small', brows: 'focus', look: true },
  wink: { eyes: ['dot', 'arc'], mouth: 'grin', fx: ['sparkles'] },
  gulp: { eyes: 'wide', mouth: 'wavy', brows: 'up', fx: ['sweat'], lookUp: true },
  phew: { eyes: 'arc', mouth: 'big', fx: ['sweat', 'blush'] },
  happy: { eyes: 'arc', mouth: 'grin', fx: ['blush'] },
  excited: { eyes: 'star', mouth: 'big', fx: ['sparkles', 'blush'] },
  amazed: { eyes: 'wide', mouth: 'O', brows: 'up', fx: ['sparkles', 'excl'], pupil: 13 },
  ecstatic: { eyes: 'star', mouth: 'big', fx: ['sparkles', 'blush', 'hearts'] },
  shock: { eyes: 'wide', mouth: 'O', brows: 'up', pupil: 6, tilt: true },
  sad: { eyes: 'teary', mouth: 'frown', brows: 'sad', fx: ['tears'] },
  dizzy: { eyes: 'spiral', mouth: 'wavy', tilt: true },
  love: { eyes: 'heart', mouth: 'big', fx: ['blush', 'sparkles'] },
  sleepy: { eyes: 'half', mouth: 'o', fx: ['zz'] }
};
const restFace = L => L <= 2 ? { eyes: ['ring', 'arc'], mouth: 'smile' } : L <= 4 ? { eyes: 'arc', mouth: 'smile' } : L <= 6 ? { eyes: 'arc', mouth: 'grin' } : L <= 8 ? { eyes: 'heartline', mouth: 'smile' } : { eyes: 'dot', mouth: 'small', look: true };
const OPEN_EYES = ['ring', 'dot', 'wide', 'teary'];
function starOn(g, x, y, r, n, inner) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
function heartPath(g, r) { g.beginPath(); g.moveTo(0, r * 0.9); g.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.7, -r * 1.25, 0, -r * 0.45); g.bezierCurveTo(r * 0.7, -r * 1.25, r * 1.5, -r * 0.1, 0, r * 0.9); g.closePath(); }
function faceEye(g, kind, sd, t, o) {
  const lx = o.lookX || 0, ly = o.lookY || 0;
  g.save(); g.translate(sd * 76, -14);
  switch (kind) {
    case 'ring': g.beginPath(); g.arc(0, 0, 19, 0, 7); g.stroke(); break;
    case 'dot': g.beginPath(); g.arc(lx * 7, ly * 6, 15, 0, 7); g.fill(); break;
    case 'wide': {
      g.lineWidth = 10; g.beginPath(); g.arc(0, 4, 24, 0, 7); g.stroke();
      const pr = o.pupil || 10; g.beginPath(); g.arc(lx * (19 - pr), 4 + ly * (17 - pr), pr, 0, 7); g.fill();
      if (pr > 9) { g.save(); g.shadowBlur = 0; g.fillStyle = o.visorCol; g.beginPath(); g.arc(lx * (19 - pr) - pr * 0.35, 4 + ly * (17 - pr) - pr * 0.35, pr * 0.3, 0, 7); g.fill(); g.restore(); }   // a glint
      break;
    }
    case 'arc': g.beginPath(); g.arc(0, 10, 21, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); break;
    case 'blink': g.beginPath(); g.moveTo(-19, 2); g.quadraticCurveTo(0, 9, 19, 2); g.stroke(); break;
    case 'half': g.beginPath(); g.arc(0, 4, 14, 0, Math.PI); g.fill(); g.beginPath(); g.moveTo(-20, 4); g.lineTo(20, 4); g.stroke(); break;
    case 'teary': {
      g.beginPath(); g.arc(0, 6, 15, 0, 7); g.fill();
      g.save(); g.shadowBlur = 0; g.fillStyle = o.visorCol; g.beginPath(); g.arc(-5, 1, 5, 0, 7); g.fill(); g.restore();
      g.lineWidth = 7; g.beginPath(); g.arc(0, 6, 23, Math.PI * 0.2, Math.PI * 0.8); g.stroke();   // brimming lower lid
      break;
    }
    case 'star': { g.rotate(Math.sin(t / 300 + sd) * 0.25); const s = 1 + Math.sin(t / 160) * 0.08; starOn(g, 0, 0, 26 * s, 5, 0.45); g.fill(); break; }
    case 'heart': { const s = 1 + Math.sin(t / 180) * 0.1; heartPath(g, 20 * s); g.fill(); break; }
    case 'heartline': heartPath(g, 19); g.lineWidth = 11; g.stroke(); break;
    case 'spiral': {
      g.rotate(t / 160 * sd); g.lineWidth = 8; g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = 2 + a * 1.55; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.stroke(); break;
    }
  }
  g.restore();
}
function faceMouth(g, kind, t) {
  g.save(); g.translate(0, 38);
  switch (kind) {
    case 'smile': g.beginPath(); g.arc(0, -28, 38, Math.PI * 0.18, Math.PI * 0.82); g.stroke(); break;
    case 'small': g.beginPath(); g.arc(0, -12, 17, Math.PI * 0.18, Math.PI * 0.82); g.stroke(); break;
    case 'grin': g.beginPath(); g.moveTo(-38, -10); g.lineTo(38, -10); g.arc(0, -10, 38, 0, Math.PI); g.closePath(); g.stroke(); break;
    case 'big': {
      const open = 1 + Math.sin(t / 140) * 0.06;
      g.beginPath(); g.moveTo(-44, -16); g.lineTo(44, -16); g.ellipse(0, -16, 44, 34 * open, 0, 0, Math.PI); g.closePath();
      g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(14,8,60,.55)'; g.fill(); g.clip();
      g.fillStyle = '#ff7aa8'; g.beginPath(); g.ellipse(0, 16 * open, 24, 14, 0, 0, Math.PI * 2); g.fill(); g.restore();   // tongue
      g.stroke(); break;
    }
    case 'O': { const s = 1 + Math.sin(t / 200) * 0.06; g.beginPath(); g.ellipse(0, -2, 18 * s, 25 * s, 0, 0, Math.PI * 2); g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(14,8,60,.55)'; g.fill(); g.restore(); g.stroke(); break; }
    case 'o': g.lineWidth = 9; g.beginPath(); g.arc(0, -6, 9 + Math.sin(t / 500) * 1.5, 0, 7); g.stroke(); break;
    case 'flat': g.beginPath(); g.moveTo(-22, -6); g.lineTo(22, -6); g.stroke(); break;
    case 'wavy': {
      g.beginPath(); const ph = t / 90;
      for (let x = -36; x <= 36; x += 3) g.lineTo(x, -6 + Math.sin(x / 7 + ph) * 5);
      g.stroke(); break;
    }
    case 'frown': g.beginPath(); g.arc(0, 18, 30, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); break;
  }
  g.restore();
}
function faceBrows(g, kind, t) {
  g.save(); g.lineWidth = 9;
  for (const sd of [-1, 1]) {
    g.beginPath();
    if (kind === 'up') { const lift = Math.sin(t / 200) * 2; g.arc(sd * 76, -36 + lift, 20, Math.PI * 1.22, Math.PI * 1.78); }
    else if (kind === 'sad') { g.moveTo(sd * 52, -58); g.lineTo(sd * 100, -46); }
    else if (kind === 'focus') { g.moveTo(sd * 54, -46); g.lineTo(sd * 98, -52); }
    g.stroke();
  }
  g.restore();
}
function faceFx(g, fx, t, k) {   // touches around the face, in visor coordinates; k scales the glow
  if (fx.includes('blush')) { g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,120,175,.55)'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 112, 22, 22, 11, 0, 0, Math.PI * 2); g.fill(); } g.restore(); }
  if (fx.includes('sweat')) {
    const q = (t % 1400) / 1400;
    g.save(); g.shadowBlur = 0; g.globalAlpha = 1 - q * 0.6; g.fillStyle = '#a9ecff'; g.translate(118, -44 + q * 26);
    g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(11, 4, 0, 9); g.quadraticCurveTo(-11, 4, 0, -14); g.fill(); g.restore();
  }
  if (fx.includes('tears')) {
    g.save(); g.shadowBlur = 0; g.fillStyle = '#a9ecff';
    for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) {
      const q = ((t / 900) + i * 0.5 + (sd > 0 ? 0.25 : 0)) % 1; g.globalAlpha = 1 - q;
      g.save(); g.translate(sd * 92, 14 + q * 46); g.beginPath(); g.moveTo(0, -9); g.quadraticCurveTo(8, 3, 0, 7); g.quadraticCurveTo(-8, 3, 0, -9); g.fill(); g.restore();
    }
    g.restore();
  }
}
function faceAround(g, fx, t) {   // sparkles, hearts, exclamation marks and zZ around the head, in art coordinates
  g.save(); g.shadowBlur = 0;
  if (fx.includes('sparkles')) for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + t / 1800, r = 205 + Math.sin(t / 300 + i) * 12, tw = 0.5 + 0.5 * Math.sin(t / 160 + i * 2);
    g.globalAlpha = 0.4 + 0.6 * tw; starOn(g, 250 + Math.cos(a) * r, 230 + Math.sin(a) * r * 0.85, 14 + 10 * tw, 4, 0.35); g.fillStyle = i % 2 ? '#ffd56b' : '#ffffff'; g.fill();
  }
  if (fx.includes('hearts')) for (let i = 0; i < 3; i++) {
    const q = ((t / 1400) + i / 3) % 1; g.globalAlpha = 1 - q;
    g.save(); g.translate(120 + i * 130, 120 - q * 90); heartPath(g, 16); g.fillStyle = '#ff6fa8'; g.fill(); g.restore();
  }
  if (fx.includes('excl')) {
    g.globalAlpha = 1; g.font = '800 70px FiraGO, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffd56b';
    const j = Math.sin(t / 90) * 4; g.fillText('!', 420 + j, 110); g.fillText('!', 80 - j, 110);
  }
  if (fx.includes('zz')) {
    g.font = '800 46px FiraGO, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) { const q = ((t / 1600) + i / 3) % 1; g.globalAlpha = Math.sin(q * Math.PI); g.fillText('z', 400 + q * 50 + i * 6, 120 - q * 90); }
  }
  g.restore();
}
// Draws the Brainer centred at (x, y), `size` px tall, with expression `ex`. o.img swaps the art (e.g. the sooty one),
// o.lookX / o.lookY (-1..1) steer the eyes, o.since is when this expression started, for the pop-in.
function drawBrainer(g, x, y, size, L, ex, t, o = {}) {
  const im = o.img || BLANK[L - 1];
  if (!(im instanceof HTMLCanvasElement) && (!im.complete || !im.naturalWidth)) return;   // o.img may be a prepared canvas
  const spec = ex === 'rest' ? restFace(L) : EXPR[ex] || restFace(L), s = size / 500;
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(-250, -250);
  g.drawImage(im, 0, 0, 500, 500);
  const [vx, vy, vr = 0] = VISOR[L - 1], k = Math.abs(g.getTransform().a);
  const pop = o.since == null ? 1 : easeBack(clamp((t - o.since) / 220, 0, 1));
  g.save(); g.translate(vx, vy); g.rotate(vr); g.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
  g.save(); g.beginPath(); g.roundRect(-140, -64, 280, 128, 30); g.clip();
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineWidth = 13; g.lineCap = g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,.75)'; g.shadowBlur = 18 * k;
  const visorCol = L >= 9 ? '#7c4bf6' : L >= 3 ? '#3a26f2' : '#3d4cf2';
  const blink = OPEN_EYES.includes(Array.isArray(spec.eyes) ? spec.eyes[0] : spec.eyes) && !reduced && (t + L * 997) % 3800 < 130;
  const eo = { lookX: spec.look ? o.lookX || 0 : o.lookX * 0.4 || 0, lookY: spec.lookUp ? -0.9 : spec.look ? o.lookY || 0 : 0, pupil: spec.pupil, visorCol };
  [-1, 1].forEach((sd, i) => { const e = Array.isArray(spec.eyes) ? spec.eyes[i] : spec.eyes; faceEye(g, blink && OPEN_EYES.includes(e) ? 'blink' : e, sd, t, eo); });
  if (spec.brows) faceBrows(g, spec.brows, t);
  faceMouth(g, spec.mouth, t);
  faceFx(g, spec.fx || [], t, k);
  g.restore();
  if (L >= 9) {   // the glasses of the top levels; they slip when the Brainer gets a fright
    g.save(); if (spec.tilt) { g.rotate(0.14); g.translate(0, 8); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 11; g.shadowColor = 'rgba(255,255,255,.75)'; g.shadowBlur = 14 * k;
    for (const sd of [-1, 1]) { g.beginPath(); g.roundRect(sd * 76 - 48, -46, 96, 66, 24); g.stroke(); }
    g.beginPath(); g.moveTo(-28, -22); g.quadraticCurveTo(0, -36, 28, -22); g.stroke();
    g.restore();
  }
  g.restore();
  faceAround(g, spec.fx || [], t);
  g.restore();
}

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
const lookNow = now => round && round.status === 'choose' ? (view.hover >= 0 ? (view.hover - 2) / 2 : Math.sin(now / 1700) * 0.5) : round && round.status === 'flying' ? (view.pick - 2) / 2 : Math.sin(now / 2300) * 0.4;
const pcv = $('#pilotCv'), pcx = pcv.getContext('2d');
function drawPilot(now) {   // the live portrait in the HUD
  const w = pcv.clientWidth, h = pcv.clientHeight;
  if (!w) return;
  const d = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(w * d), ch = Math.round(h * d);
  if (pcv.width !== cw || pcv.height !== ch) { pcv.width = cw; pcv.height = ch; }
  pcx.setTransform(d, 0, 0, d, 0, 0); pcx.clearRect(0, 0, w, h);
  const m = moodNow(now);
  drawBrainer(pcx, w / 2, h / 2 + (reduced ? 0 : Math.sin(now / 600) * 1.2), w, myLevel(), m.ex, now, { since: m.t0, lookX: lookNow(now) });
}
function brainerURL(L, ex) { const c = document.createElement('canvas'); c.width = c.height = 200; drawBrainer(c.getContext('2d'), 100, 100, 200, L, ex, performance.now()); return c.toDataURL(); }

const ZP = 2.2, Z_WAIT = 9, Z_FAR = 40, G_H = 5;   // depths: plane, waiting gates, new gates; ground drop
let W = 0, H = 0, dpr = 1, F = 500, HY = 200, PX = 0, PY = 0, PS = 0.8, SPREAD = 2, RING = 1, last = 0;
let shake = 0, flashAt = -1e9, flashCol = '255,255,255', nextDropAt = 0, sky = null;
const view = { d: LEVELS[0], n: 0, rtp: cfg.refRtp, camX: 0, gz: Z_WAIT, introT: -1e9, pick: -1, row: null, struck: false, scroll: 0, fieldX: 0, speed: 1, bank: 0, hit: [], hover: -1 };
const plane = { state: 'cruise', t0: 0, x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, brain: 1 };
let chute = null, iris = null, parts = [], booms = [], drops = [], texts = [];
let clouds = [];

function layout() {
  W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  F = H * 0.95; HY = H * 0.4; PX = W / 2; PY = H * 0.74;
  PS = clamp(Math.min(W / 900, H / 560), 0.45, 1.25);
  const dx = Math.min(W * 0.17, 170);   // gap between waiting gates on screen
  SPREAD = dx * Z_WAIT / F; RING = Math.min(dx * 0.34, 56) * Z_WAIT / F;
  paintSky();
}
new ResizeObserver(layout).observe(stage);

function paintSky() {
  sky = document.createElement('canvas'); sky.width = Math.max(1, Math.round(W * dpr)); sky.height = Math.max(1, Math.round((HY + 2) * dpr));
  const g = sky.getContext('2d'); g.scale(dpr, dpr); world.sky(g);
}

/* ---------- worlds: what the flight passes over ---------- */
// Lavender fields is the game's world. Two other directions stay reachable for comparison: ?world=clouds (a sea of
// clouds at sunset) and ?world=city (Brainer city at dusk); ?worlds adds a switcher to the stage.
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

/* Lavender fields: patchwork farmland in brand-tinted colours, hedges and trees, a river and a country road,
   and clouds drifting below the plane with their shadows on the fields. */
const FIELDS = ['#a6d873', '#8cc95f', '#c4df86', '#e6d585', '#d8bd6b', '#b292e9', '#c8acf3', '#9cd187', '#ece2a6', '#a98ae4'];
function groundFields() {
  const D = 3.2, CW = 3.2, cx = view.camX - view.fieldX;
  ctx.fillStyle = '#b9d98c'; ctx.fillRect(0, HY, W, H - HY);
  const river = zw => 9 + 5 * Math.sin(zw * 0.04) + 2.2 * Math.sin(zw * 0.13 + 1), road = zw => -12 + 2 * Math.sin(zw * 0.025);
  forRows(D, 64, (row, z0, z1) => {
    if (groundY(z1) > H) return;
    const g2 = row >> 1, span = 1 + Math.floor(hash(g2, 3) * 3);   // fields are two rows deep and one to three cells wide
    const hs = halfSpan(z0), c0 = Math.floor((cx - hs) / CW), c1 = Math.ceil((cx + hs) / CW), zm = (z0 + z1) / 2, near = zm < 28;
    const edges = [], stripes = [], trees = [];
    for (let c = c0; c <= c1;) {
      const fc = Math.floor(c / span), ce = (fc + 1) * span, ua = c * CW, ub = ce * CW;
      poly([gpt(ua, z0), gpt(ub, z0), gpt(ub, z1), gpt(ua, z1)], FIELDS[Math.floor(hash(fc * 7 + span, g2) * FIELDS.length)]);
      if (near && hash(fc, g2 * 7 + 1) < 0.55) stripes.push([ua, ub]);
      if (near && hash(fc + 3, g2) < 0.22) trees.push([(ua + ub) / 2 + (hash(fc, row) - 0.5) * CW, z0 + D * 0.5]);
      edges.push(ub); c = ce;
    }
    const lw = Math.max(1, 0.14 * F / zm);
    ctx.beginPath();
    for (const u of edges) { const [xa, ya] = gpt(u, z0), [xb, yb] = gpt(u, z1); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); }
    if (row % 2 === 0) { const [xa, ya] = gpt(cx - hs, z0), [xb] = gpt(cx + hs, z0); ctx.moveTo(xa, ya); ctx.lineTo(xb, ya); }
    ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(74,124,50,.5)'; ctx.stroke();   // hedges
    if (stripes.length) {
      ctx.beginPath();
      for (const [ua, ub] of stripes) for (let i = 1; i < 4; i++) { const z = z0 + D * i / 4, [xa, y] = gpt(ua, z), [xb] = gpt(ub, z); ctx.moveTo(xa, y); ctx.lineTo(xb, y); }
      ctx.lineWidth = Math.max(0.7, 0.05 * F / zm); ctx.strokeStyle = 'rgba(60,70,30,.14)'; ctx.stroke();   // crop rows
    }
    const r0 = river(z0 + view.scroll), r1 = river(z1 + view.scroll), w = 0.75;
    poly([gpt(r0 - w - 0.35, z0), gpt(r0 + w + 0.35, z0), gpt(r1 + w + 0.35, z1), gpt(r1 - w - 0.35, z1)], '#dfcf9c');
    poly([gpt(r0 - w, z0), gpt(r0 + w, z0), gpt(r1 + w, z1), gpt(r1 - w, z1)], mix('#7ab6ef', '#b9d7fb', clamp(zm / 60, 0, 1)));
    poly([gpt(r0 - w * 0.55, z0), gpt(r0 - w * 0.25, z0), gpt(r1 - w * 0.25, z1), gpt(r1 - w * 0.55, z1)], 'rgba(255,255,255,.28)');
    const d0 = road(z0 + view.scroll), d1 = road(z1 + view.scroll);
    poly([gpt(d0 - 0.6, z0), gpt(d0 + 0.6, z0), gpt(d1 + 0.6, z1), gpt(d1 - 0.6, z1)], '#e6dfcf');
    if (near) { const za = z0 + D * 0.15, zb = z0 + D * 0.55, ra = road(za + view.scroll), rb = road(zb + view.scroll); ctx.beginPath(); ctx.moveTo(...gpt(ra, za)); ctx.lineTo(...gpt(rb, zb)); ctx.lineWidth = Math.max(1, 0.07 * F / zm); ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
    if (row % 2 === 0) for (const u of edges) if (hash(u * 13, row) < 0.45) trees.push([u, z0]);   // trees where hedges meet
    if (zm < 40) for (const [u, z] of trees) {
      const zz = Math.max(2, z), rv = river(zz + view.scroll), rd = road(zz + view.scroll);
      if (Math.abs(u - rv) < 1.6 || Math.abs(u - rd) < 1.1) continue;
      const [x, y] = gpt(u, zz), r = 0.48 * F / zz;
      if (x < -r || x > W + r) continue;
      ell(x + r * 0.55, y + r * 0.05, r * 0.95, r * 0.32); ctx.fillStyle = 'rgba(40,60,20,.25)'; ctx.fill();
      ell(x, y - r * 0.8, r, r * 0.95); ctx.fillStyle = '#4c8b3c'; ctx.fill();
      ell(x - r * 0.3, y - r * 1.05, r * 0.55, r * 0.5); ctx.fillStyle = '#76b755'; ctx.fill();
    }
  });
  for (const c of clouds) {   // cloud shadows on the fields
    if (c.alt < 0.5 || c.z < 1.5) continue;
    const rx = c.s * 1.25 * F / c.z, x = projX(c.x, c.z), y = groundY(c.z), ry = rx * Math.min(1, G_H / c.z);
    if (x + rx < 0 || x - rx > W || y - ry > H) continue;
    ctx.globalAlpha = clamp((60 - c.z) / 14, 0, 1); ell(x, y, rx, ry); ctx.fillStyle = 'rgba(40,40,110,.12)'; ctx.fill(); ctx.globalAlpha = 1;
  }
  haze('rgba(238,241,255,.95)', 0.22);
}
function skyFields(g) {
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

const WORLDS = {
  fields: { name: 'Lavender fields', sky: skyFields, ground: groundFields, shade: 'rgba(75,54,252,.2)',
    clouds: { n: 14, alt: () => Math.random() < 0.6 ? 2 + Math.random() * 1.8 : -2.8 + Math.random() * 1.6, alpha: 0.95, img: () => puffCloud('#ffffff', '#efeaff', '#c9bdf2') } },
  clouds: { name: 'Cloud sea', sky: skyClouds, ground: groundClouds, shade: 'rgba(75,54,252,.18)',
    clouds: { n: 9, alt: () => -0.9 + Math.random() * 2.2, alpha: 0.85, img: () => puffCloud('#fff6f4', '#f8d9ea', '#d6b5ee') } },
  city: { name: 'City at dusk', sky: skyCity, ground: groundCity, shade: 'rgba(8,6,30,.4)', rim: true,
    clouds: { n: 6, alt: () => -3.2 + Math.random() * 1.4, alpha: 0.55, img: () => puffCloud('#8a6ad8', '#5a3fb0', '#c35fbf') } }
};
let world = WORLDS.fields, worldKey = 'fields', cloudImg = null;
function setWorld(key) {
  worldKey = WORLDS[key] ? key : 'fields'; world = WORLDS[worldKey];
  cloudImg = world.cloudImg || (world.cloudImg = world.clouds.img());
  clouds = Array.from({ length: world.clouds.n }, () => ({ x: view.camX + (Math.random() - 0.5) * 34, alt: world.clouds.alt(), z: 4 + Math.random() * 56, s: 0.9 + Math.random() * 1.4 }));
  spires = worldKey === 'clouds' ? Array.from({ length: 5 }, () => spawnSpire(null, false)) : [];
  if (W) paintSky();
  document.querySelectorAll('#worlds button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === worldKey)));
}

const gateX = k => (k - 2) * SPREAD;
const projX = (x, z) => W / 2 + (x - view.camX) * F / z;
const altY = (alt, z) => HY + alt * F / z;
const H_GATE = () => (PY - HY) * ZP / F;   // gates fly at the plane's height
const gatePos = k => { const z = view.gz; return { x: projX(gateX(k), z), y: altY(H_GATE(), z), r: RING * F / z, z }; };

function setTrack(d, n, rtp) { Object.assign(view, { d, n, rtp, pick: -1, row: null, struck: false, introT: performance.now(), camX: 0 }); }
function recenter() { for (const c of clouds) c.x -= view.camX; for (const p of spires) p.x -= view.camX; view.fieldX -= view.camX; view.camX = 0; }
function sceneStart(d) {
  const now = performance.now();
  recenter(); setTrack(d, 0, round.rtp); plane.brain = myLevel();
  if (plane.state !== 'cruise') { plane.state = 'enter'; plane.t0 = now; }
  if (chute) chute.leave = chute.leave || now;
  if (iris) iris.out = iris.out || now;
  drops = drops.filter(b => !b.real);
  parts = parts.filter(q => q.type !== 'confetti' && q.type !== 'coin');   // last flight's celebration ends here
}
function sceneFly(k, row, t0) {
  view.pick = k; view.row = row; view.struck = false; view.pickT = t0;
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
  iris = { t0: now + 380, brain: myLevel() };
}
function scenePassed(now) {
  recenter(); setTrack(view.d, round.n, round.rtp);
  burst(PX, PY - 50 * PS, 22, ['#33d66d', '#00ebc0', '#ffffff'], 0.4);
  texts.push({ text: fx(multAt(round.d, round.n, round.rtp)), x: PX, y: PY - 175 * PS, t0: now, col: '#7dffcf', size: 30, dur: 1300 });
}
function sceneJump(now, m) {
  chute = { t0: now, x: PX, y0: PY - 70 * PS, leave: 0, brain: myLevel() };
  Object.assign(plane, { state: 'empty', t0: now });
  const big = m >= 10, huge = m >= 100;
  for (let i = 0; i < (big ? 40 : 26); i++) parts.push({ type: 'coin', x: PX, y: PY - 70 * PS, vx: (Math.random() - 0.5) * 0.7, vy: -0.4 - Math.random() * 0.5, g: 0.0011, life: 0, max: 1500 + Math.random() * 600, r: 5 + Math.random() * 4 });
  for (let i = 0; i < (huge ? 160 : big ? 110 : 70); i++) parts.push({ type: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 0.08, vy: 0.08 + Math.random() * 0.12, g: 0, life: 0, max: 3200, r: 5 + Math.random() * 4, rot: Math.random() * 7, vr: (Math.random() - 0.5) * 0.02, c: ['#4b36fc', '#8447fb', '#33d66d', '#ffc147', '#ffffff', '#ed6b6b'][i % 6] });
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
  ctx.font = `800 ${Math.round(size)}px FiraGO, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = shadow || 'rgba(75,54,252,.75)'; ctx.fillText(text, 0, size * 0.08);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0); ctx.restore();
}

/* the player's Brainer from behind, sitting in the cockpit (rim centre at 0,0), built like the Brainer art: a barrel
   body, a ribbed collar, a wide glass dome holding the brain for this brain level, and hands gripping the rim.
   Lit from the upper left like the rest of the scene, so every part reads as a solid. */
function robotBack(t, L) {
  const [c1, c2, n] = BRAIN[L - 1];
  const bob = reduced ? 0 : Math.sin(t / 260) * 1.5;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(0, bob);
  // barrel body, a lit cylinder; its lower half sits inside the cockpit
  ctx.beginPath(); ctx.roundRect(-42, -52, 84, 70, 24);
  const bg = ctx.createLinearGradient(-42, 0, 42, 0);
  bg.addColorStop(0, '#8b7dd8'); bg.addColorStop(0.16, '#cfc6ff'); bg.addColorStop(0.36, '#ffffff'); bg.addColorStop(0.62, '#eeeaff'); bg.addColorStop(0.86, '#b2a6ee'); bg.addColorStop(1, '#8476d2');
  ctx.fillStyle = bg; ctx.fill();
  const ao = ctx.createLinearGradient(0, -52, 0, -28); ao.addColorStop(0, 'rgba(40,22,120,.28)'); ao.addColorStop(1, 'rgba(40,22,120,0)');
  ctx.fillStyle = ao; ctx.fill();   // shade under the collar
  ctx.beginPath(); ctx.roundRect(-22, -38, 44, 30, 9);   // back plate with a bevel
  ctx.fillStyle = lin(0, -38, 0, -8, '#e9e4ff', '#c4b9f6'); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-17, -37); ctx.lineTo(17, -37); ctx.stroke();
  ctx.strokeStyle = 'rgba(70,50,170,.35)'; ctx.beginPath(); ctx.moveTo(-17, -9); ctx.lineTo(17, -9); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-13, -33, 26, 14, 7); ctx.fillStyle = lin(-13, 0, 13, 0, '#4b36fc', '#8447fb'); ctx.fill();   // level badge
  ctx.fillStyle = '#ffffff'; ctx.font = '800 11px FiraGO, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(L), 0, -25.5);
  ctx.fillStyle = 'rgba(70,50,170,.4)';
  for (const vy of [-15, -12]) { ctx.beginPath(); ctx.roundRect(-10, vy, 20, 1.6, 0.8); ctx.fill(); }   // vent slots
  const glow = clamp(1 - (t - (view.glowT || -1e9)) / 700, 0, 1);   // the brain lights up as new cells arrive
  if (glow > 0) { const gg = ctx.createRadialGradient(0, -92, 10, 0, -92, 90); gg.addColorStop(0, c2 + 'cc'); gg.addColorStop(1, c2 + '00'); ctx.globalAlpha = glow; ctx.fillStyle = gg; ctx.fillRect(-90, -182, 180, 180); ctx.globalAlpha = 1; }
  // dome: a glass sphere with the brain inside
  ctx.save(); ctx.beginPath(); ctx.rect(-70, -160, 140, 106); ctx.clip();
  const inner = ctx.createRadialGradient(8, -80, 8, 0, -92, 58); inner.addColorStop(0, 'rgba(226,216,255,.55)'); inner.addColorStop(1, 'rgba(136,108,250,.55)');
  ell(0, -92, 56, 48); ctx.fillStyle = inner; ctx.fill();
  ctx.save(); ell(0, -92, 54, 46); ctx.clip();
  const bglow = ctx.createRadialGradient(0, -90, 4, 0, -90, 50); bglow.addColorStop(0, c2 + '55'); bglow.addColorStop(1, c2 + '00');
  ctx.fillStyle = bglow; ctx.fillRect(-56, -140, 112, 96);
  ctx.lineWidth = 2.5; ctx.strokeStyle = c1;
  for (let i = 1; i < n; i++) { const a = NEURONS[i], b = NEURONS[a.link]; ctx.beginPath(); ctx.moveTo(a.x * 1.15, a.y * 1.04); ctx.lineTo(b.x * 1.15, b.y * 1.04); ctx.stroke(); }
  const pulse = reduced ? 1 : 1 + Math.sin(t / 300) * 0.08;
  for (let i = 0; i < n; i++) {
    const a = NEURONS[i], x = a.x * 1.15, y = a.y * 1.04, rr = a.r * 1.15 * pulse, g = ctx.createRadialGradient(x - rr * 0.4, y - rr * 0.45, 0, x, y, rr);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, c2); g.addColorStop(1, c1); ell(x, y, rr, rr); ctx.fillStyle = g; ctx.fill();
  }
  const fres = ctx.createRadialGradient(-6, -98, 22, 0, -92, 56);   // glass gets brighter toward its rim
  fres.addColorStop(0, 'rgba(255,255,255,0)'); fres.addColorStop(0.72, 'rgba(255,255,255,.08)'); fres.addColorStop(1, 'rgba(255,255,255,.55)');
  ctx.fillStyle = fres; ctx.fillRect(-56, -140, 112, 96);
  ctx.restore();
  ell(0, -92, 55, 47); ctx.strokeStyle = 'rgba(83,42,255,.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -92, 43, 36, 0, Math.PI * 1.08, Math.PI * 1.46); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 7; ctx.stroke();   // window reflection
  ctx.beginPath(); ctx.ellipse(0, -92, 47, 40, 0, Math.PI * 1.55, Math.PI * 1.7); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.stroke();
  ell(24, -121, 4.5, 3); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -92, 50, 42, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.strokeStyle = 'rgba(60,30,170,.18)'; ctx.lineWidth = 5; ctx.stroke();   // the dome's lower edge in shadow
  ctx.restore();
  // ribbed collar, a ring with a lit top
  ell(0, -50, 56, 9); ctx.fillStyle = 'rgba(40,22,120,.25)'; ctx.fill();   // contact shadow under the dome
  ctx.beginPath(); ctx.roundRect(-57, -61, 114, 15, 7.5);
  const cg = ctx.createLinearGradient(0, -61, 0, -46); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, '#e6e0ff'); cg.addColorStop(1, '#a99ce9');
  ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = 'rgba(40,22,120,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(110,90,210,.45)'; ctx.lineWidth = 1.5;
  for (let rx = -45; rx <= 45; rx += 15) { ctx.beginPath(); ctx.moveTo(rx, -58); ctx.lineTo(rx, -49); ctx.stroke(); }
  ctx.restore();
}
function robotHands(t) {   // hands on the cockpit rim; the one on the side you're hovering lifts toward that path
  const side = round && round.status === 'choose' && view.hover >= 0 ? Math.sign(view.hover - 2) : 0, cheer = mood.ex === 'phew' || mood.ex === 'wink';
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
  if (pilot) robotBack(t, L);
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
  const m = moodNow(t); drawBrainer(ctx, 0, 40, 220, L, m.ex, t, { since: m.t0, lookX: Math.sin(t / 1200) * 0.5 });
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

/* ---------- loop ---------- */
function update(now, dt) {
  const r = round, flying = r && r.status === 'flying', choosing = r && r.status === 'choose';
  view.speed += ((flying ? 2.6 : 1) - view.speed) * Math.min(1, dt * 0.005);
  const ds = view.speed * dt * 0.0035 * (reduced ? 0.5 : 1);
  view.scroll += ds;
  for (const c of clouds) { c.z -= ds; if (c.z < 1) { c.z = 46 + Math.random() * 14; c.x = view.camX + (Math.random() - 0.5) * 34; c.alt = world.clouds.alt(); } }
  for (const p of spires) { p.z -= ds; if (p.z < 1) spawnSpire(p, true); }
  if (flying) {
    const p = clamp((now - r.t0) / FLY_MS, 0, 1), pp = r.hit ? Math.min(p, IMPACT) : p;
    view.gz = lerp(Z_WAIT, ZP * 0.45, ease(pp)); view.camX = gateX(view.pick) * ease(clamp(pp / 0.8, 0, 1));
  } else if (!(r && r.status === 'crashed')) view.gz = lerp(Z_FAR, Z_WAIT, easeOut(clamp((now - view.introT) / 450, 0, 1)));
  // the plane leans toward the path you're about to take, and toward the hoop you're hovering while you decide
  const bankTo = flying ? clamp((gateX(view.pick) - view.camX) / SPREAD * 0.22, -0.45, 0.45) : choosing && view.hover >= 0 ? (view.hover - 2) * 0.07 : 0;
  view.bank += (bankTo - view.bank) * Math.min(1, dt * 0.008);
  // bombs keep falling far behind the hoops while the pilot decides; never in line with a hoop, so they hint nothing
  if ((!r || choosing) && now > nextDropAt && W) {
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
  if (chute && chute.leave && now - chute.leave > 1200) chute = null;
  if (iris && iris.out && now - iris.out > 500) iris = null;
  shake *= Math.pow(0.9, dt / 16);
}

function drawGround(now) {
  world.ground(now);
  const v = ctx.createLinearGradient(0, H * 0.6, 0, H);   // shade at the bottom so the white plane stands out
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, world.shade);
  ctx.fillStyle = v; ctx.fillRect(0, H * 0.6, W, H * 0.4);
}
function drawCloud(c, near) {
  if (c.z < 1) return;
  const w = c.s * 2.6 * F / c.z, h = w * 170 / 300, x = projX(c.x, c.z), y = altY(c.alt, c.z);
  if (x + w / 2 < 0 || x - w / 2 > W || y - h > H || y + h < 0) return;
  ctx.globalAlpha = clamp((c.z - 1) / 2.5, 0, 1) * clamp((60 - c.z) / 14, 0, 1) * world.clouds.alpha * (near === true ? 0.45 : 1);
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
  drawGround(now);
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
        for (let i = 0; i < 3; i++) {   // smoke over the dome
          const q = ((now / 900 + i / 3) % 1);
          ctx.globalAlpha = 0.5 * (1 - q); ell(-R1 * 0.3 + i * R1 * 0.3, -R1 * 0.75 - q * R1 * 0.4, R1 * (0.08 + q * 0.12), R1 * (0.07 + q * 0.1)); ctx.fillStyle = '#6b6585'; ctx.fill();
        }
        ctx.globalAlpha = 1;
        drawBrainer(ctx, 0, 0, sz, iris.brain, 'dizzy', now, { img });
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
  if (W && H) { advance(now); update(now, dt); draw(now); updateUI(now); drawPilot(now); }
  requestAnimationFrame(loop);
}

/* ---------- readout & controls ---------- */
const cache = {};
const put = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = document.getElementById(id); if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else if (prop === 'hidden') el.hidden = v; else if (prop === 'disabled') el.disabled = v; };
function updateUI(now) {
  const r = round, d = r ? r.d : LEVELS[S.level];
  let label, big, bigCls = 'mult', sub = '', subCls = 'sub';
  if (!r || (!inFlight() && starting)) { label = `${d.name} · ${d.steps} paths · top win`; big = fxShort(multAt(d, d.steps, rtpOf(myLevel()))); bigCls = 'mult idle'; sub = 'Set your bet and press Play'; }
  else if (r.status === 'choose') {
    const cur = multAt(r.d, r.n, r.rtp), next = multAt(r.d, r.n + 1, r.rtp);
    label = r.n ? `Path ${r.n} of ${r.d.steps} cleared · fly on or jump` : 'Bombs ahead! Pick a path';
    big = fx(cur); sub = r.n ? `Jump now: ${money(Math.min(r.stake * cur, cfg.maxWin))} · next ${fx(next)}` : `A safe path pays ${fx(next)}`;
  } else if (r.status === 'flying') { label = `Path ${r.pick + 1} · bombs away…`; big = fx(multAt(r.d, r.n, r.rtp)); sub = `Safe path pays ${fx(multAt(r.d, r.n + 1, r.rtp))}`; }
  else if (r.status === 'crashed') { label = 'Ka-boom!'; big = 'Crashed'; bigCls = 'mult bust'; sub = `Bomb on path ${r.pick + 1} · −${money(r.stake)}`; subCls = 'sub bad'; }
  else { const m = multAt(r.d, r.n, r.rtp); label = m >= 100 ? 'Huge win!' : m >= 10 ? 'Big win!' : `Jumped after ${r.n} path${r.n === 1 ? '' : 's'}!`; big = fx(m); bigCls = m >= 10 ? 'mult win gold' : 'mult win'; sub = `You won ${money(r.payout)}`; subCls = 'sub ok'; }
  if (r && r.popAt && now - r.popAt < 400 && r.status === 'choose') bigCls += ' pop';
  put('label', 'text', label); put('label', 'class', /win!$/.test(label) ? 'label gold' : 'label'); put('mult', 'text', big); put('mult', 'class', bigCls);
  put('sub', 'hidden', !sub); put('sub', 'text', sub); put('sub', 'class', subCls);
  if (r && inFlight()) {
    put('jump', 'disabled', !(r.status === 'choose' && r.n >= 1));
    put('jumpSub', 'text', r.n < 1 ? 'after the first path' : money(Math.min(r.stake * multAt(r.d, r.n, r.rtp), cfg.maxWin)));
  }
}
function renderControls() {
  const fl = inFlight();
  $('#setup').hidden = fl; $('#flight').hidden = !fl;
  $('#playSub').textContent = starting ? 'Taking off…' : `${money(S.stake)} · ${LEVELS[S.level].name}`;
  $('#play').disabled = starting;
  document.querySelectorAll('#paths button').forEach((b, k) => { b.disabled = !round || round.status !== 'choose'; b.setAttribute('aria-pressed', String(!!round && round.pick === k)); });
}
function renderLevels() {
  const rtp = rtpOf(myLevel());
  $('#levels').innerHTML = LEVELS.map((d, i) => `<button type="button" data-l="${i}" aria-pressed="${i === S.level}"><b>${d.name}</b><span>up to ${fxShort(multAt(d, d.steps, rtp))}</span></button>`).join('');
}
function renderPaths() {
  $('#paths').innerHTML = PATHS.map(([nm, deg], k) => `<button type="button" data-p="${k}" aria-label="Path ${k + 1}, ${nm}"><span class="n"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g transform="rotate(${deg} 12 12)"><path d="M12 20V5M6 11l6-6 6 6" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></svg>${k + 1}</span><span class="nm">${nm}</span></button>`).join('');
}
function renderPicker() {
  $('#levelsGrid').innerHTML = cfg.brain.rtp.map((rtp, i) => `<button type="button" data-b="${i + 1}" aria-pressed="${i + 1 === myLevel()}"><img src="assets/brainer-${i + 1}.png" alt=""><b>Level ${i + 1}</b><span>${cfg.brain.on ? `RTP ${rtp.toFixed(2)}%` : `${cfg.brain.cells[i].toLocaleString('en-US')} cells`}</span></button>`).join('');
}
function renderLadder() {
  const r = round, d = r ? r.d : LEVELS[S.level], rtp = r ? r.rtp : rtpOf(myLevel()), n = r && r.status !== 'crashed' ? r.n : 0, live = inFlight();
  const el = $('#ladder');
  el.innerHTML = Array.from({ length: d.steps }, (_, i) => `<span class="rung ${i < n ? 'done' : i === n && live ? 'next' : ''}">${fxShort(multAt(d, i + 1, rtp))}</span>`).join('');
  const nx = el.querySelector('.next') || el.querySelectorAll('.done')[n - 1];
  el.scrollLeft = nx ? nx.offsetLeft - el.clientWidth / 2 + nx.offsetWidth / 2 : 0;
}
function renderBalance() { $('#balance').textContent = money(S.balance); }
function renderSound() { const b = $('#sound'); b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', sound.on ? 'Sound on, tap to mute' : 'Sound off, tap to unmute'); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- provably fair: the next flight's commit, and the last flight revealed and re-checked ---------- */
const kv = (k, v) => `<div class="kv"><span>${k}</span><code>${v}</code></div>`;
function renderFair() {
  const live = inFlight() ? round : null, r = lastRound;
  let h = `<h4>${live ? 'This flight' : 'Your next flight'}</h4>${kv('Server seed hash', live ? live.hash : S.hash)}${kv('Client seed', S.client)}${kv('Nonce', live ? live.nonce : S.nonce)}`
    + `<p class="sheet-note">${live ? 'The server seed is revealed when this flight ends.' : 'This hash is fixed now, before you choose a bet or a path.'}</p>`;
  if (r) h += `<h4>Last flight: ${r.d.name}, ${r.status === 'crashed' ? 'bomb hit' : `jumped at ${fx(multAt(r.d, r.n, r.rtp))}`}</h4>`
    + `${kv('Server seed hash', r.hash)}${kv('Server seed, revealed', r.seed)}${kv('Client seed', r.client)}${kv('Nonce', r.nonce)}`
    + '<button type="button" class="big ghost" id="fairCheck">Check this flight</button><div id="fairOut" aria-live="polite"></div>';
  $('#fairBody').innerHTML = h;
}
async function checkFair() {
  const r = lastRound;
  if (!r) return;
  const hashOk = (await sha256(r.seed)) === r.hash;
  const bombs = await drawBombs(r.seed, r.client, r.nonce, r.d);
  const bombsOk = JSON.stringify(bombs) === JSON.stringify(r.bombs);
  const played = r.status === 'crashed' ? r.n + 1 : r.n, shown = r.status === 'cashed' ? Math.min(r.d.steps, played + 1) : played;   // after a jump, also show the step you skipped
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  const rows = Array.from({ length: shown }, (_, i) => `<div class="frow${i >= played ? ' next' : ''}"><span class="st">${i + 1}</span>`
    + bombs[i].map((b, k) => `<i class="${b ? 'bomb' : ''}${r.picks[i] === k ? ' pick' : ''}"></i>`).join('') + '</div>').join('');
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before the flight' : 'The seed does not match the hash')
    + ok(bombsOk, bombsOk ? 'Bombs recomputed from the seeds match your flight' : 'Recomputed bombs differ from the flight')
    + `<div class="fgrid" aria-label="Bombs at each step">${rows}</div>`
    + `<p class="sheet-note">Red: a bomb on that path. White ring: the path you picked.${shown > played ? ' The faded row is the next step you skipped by jumping.' : ''}</p>`;
}

/* ---------- sheets: brain-level picker, fairness and how to play ---------- */
const sheetOpen = () => !$('#picker').hidden || !$('#tutorial').hidden || !$('#agegate').hidden || !$('#fairSheet').hidden;
let lastFocus = null;
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; const f = $(id).querySelector('button[aria-pressed=true], button'); if (f) f.focus({ preventScroll: true }); }   // no scroll: inside the website's frame it would scroll the parent page
function closeSheet(id) { $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
$('#pilot').addEventListener('click', () => { renderPicker(); openSheet('#picker'); });
$('#pickerClose').addEventListener('click', () => closeSheet('#picker'));
$('#levelsGrid').addEventListener('click', e => { const b = e.target.closest('button[data-b]'); if (!b) return; setBrainLevel(+b.dataset.b); closeSheet('#picker'); if (inFlight()) toast('This flight keeps the RTP it started with.'); });
$('#help').addEventListener('click', () => openSheet('#tutorial'));
$('#fair').addEventListener('click', () => { renderFair(); openSheet('#fairSheet'); });
$('#fairClose').addEventListener('click', () => closeSheet('#fairSheet'));
$('#fairBody').addEventListener('click', e => { if (e.target.closest('#fairCheck')) checkFair(); });
$('#tutGo').addEventListener('click', () => { store.set('brainer.pc.tutorial', 'seen'); closeSheet('#tutorial'); });
// 18+ check, shared with the website (same key), so a visitor who confirmed there is not asked again
$('#ageYes').addEventListener('click', () => { store.set('blink.age-ok', '1'); closeSheet('#agegate'); if (store.get('brainer.pc.tutorial', '') !== 'seen') openSheet('#tutorial'); });
$('#ageNo').addEventListener('click', () => { $('#ageSorry').hidden = false; $('.age-actions').hidden = true; });
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s && s.id !== 'agegate') { if (s.id === 'tutorial') store.set('brainer.pc.tutorial', 'seen'); closeSheet('#' + s.id); } }));

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
  round = null; recenter(); setTrack(LEVELS[S.level], 0, rtpOf(myLevel())); plane.brain = myLevel();
  if (iris) iris.out = now;
  if (chute) chute.leave = now;
  if (plane.state !== 'cruise') { plane.state = 'enter'; plane.t0 = now; }
  $('#pilot').classList.remove('sooty');
  renderLadder();
});
$('#play').addEventListener('click', play);
$('#paths').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b && !b.disabled) choose(+b.dataset.p); });
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
  if (e.key === 'Escape') { if (!$('#picker').hidden) closeSheet('#picker'); if (!$('#fairSheet').hidden) closeSheet('#fairSheet'); if (!$('#tutorial').hidden) { store.set('brainer.pc.tutorial', 'seen'); closeSheet('#tutorial'); } return; }
  if (sheetOpen()) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (/^[1-5]$/.test(e.key)) { choose(+e.key - 1); return; }
  if (e.code !== 'Space' || e.repeat || tag === 'BUTTON') return;
  e.preventDefault();
  if (inFlight()) jump(false); else play();
});

/* ---------- boot ---------- */
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { lastInput = performance.now(); }, true);
{
  const q = new URLSearchParams(location.search), sw = $('#worlds');
  setWorld(q.get('world'));
  if (q.has('worlds') || q.has('world')) {
    sw.hidden = false;
    sw.addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (!b) return; setWorld(b.dataset.w); q.set('world', worldKey); history.replaceState(null, '', '?' + q.toString()); });
  }
}
S.client = randHex(8);
rotateSeed();
setStake(S.stake); renderLevels(); renderPaths(); renderBalance(); renderControls(); renderPilot(); renderSound();
layout(); plane.brain = myLevel(); setTrack(LEVELS[S.level], 0, rtpOf(myLevel())); renderLadder();
if (store.get('blink.age-ok', '') !== '1') openSheet('#agegate');
else if (store.get('brainer.pc.tutorial', '') !== 'seen') openSheet('#tutorial');
requestAnimationFrame(loop);
})();
