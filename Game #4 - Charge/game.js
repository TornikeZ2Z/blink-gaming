(() => {
'use strict';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';
const fxShort = m => (m < 1000 ? m.toFixed(2) : m < 1e6 ? Math.floor(m).toLocaleString('en-US') : (Math.floor(m / 1e5) / 10) + 'M') + '×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const backOut = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const cents = v => Math.round(v * 100) / 100;   // the balance stays in whole cents, so it matches every amount shown
const SC = window.CHARGE_SCENE;   // assets/scene.js: where the station's parts and each Brainer sprite sit in the 1920 × 1080 renders

/* ---------- config & math ---------- */
// Chicken Road's ladder, as Plane Crash plays it, with a CHARGE for each step (Tornike, 2026-10-26): 25 charges hide 1, 3,
// 5 or 10 overloads and each charge uses up one more, so the chance of surviving n charges is C(25-n, b) / C(25, b). After
// n safe charges the multiplier is the RTP divided by that chance, rounded down to the cent, so cashing out after any
// charge returns up to the RTP: less where a payout rounds down to the cent, or where the $10,000 max win ends a long or
// high-bet round early.
const cfg = {
  rtp: 98, minBet: 0.1, maxBet: 200, maxWin: 10000, startBalance: 1000,
  brain: { perRound: 10 }   // each round played adds the same brain cells when it ends, whatever the bet (Marketing's rule)
};
const LEVELS = [
  { key: 'easy', name: 'Easy', bombs: 1 }, { key: 'medium', name: 'Medium', bombs: 3 },
  { key: 'hard', name: 'Hard', bombs: 5 }, { key: 'hardcore', name: 'Hardcore', bombs: 10 }
];
for (const d of LEVELS) {
  d.steps = 25 - d.bombs; d.safe = []; d.cum = [1];   // cum[n] = chance of surviving the first n charges
  for (let n = 1; n <= d.steps; n++) { const sv = (25 - d.bombs - (n - 1)) / (25 - (n - 1)); d.safe.push(sv); d.cum.push(d.cum[n - 1] * sv); }
}
const multAt = (d, n, rtp = cfg.rtp) => n <= 0 ? 1 : Math.floor(rtp / 100 / d.cum[n] * 100 + 1e-7) / 100;
const capAt = (d, n, stake, rtp = cfg.rtp) => Math.min(multAt(d, n, rtp), Math.floor(cfg.maxWin / stake * 100 + 1e-7) / 100);   // what n charges really pay at this bet: the max win caps it
const payAt = (r, n) => Math.min(Math.floor(r.stake * multAt(r.d, n, r.rtp) * 100 + 1e-6) / 100, cfg.maxWin);   // cashing out after n charges pays this, rounded down to the cent
// What a round can really reach: the max win cashes it out on the first charge that pays that much, so even at the
// minimum bet Hardcore never offers charge 15. Every top shown before a bet uses d.reach, at the minimum bet.
const reachAt = (d, stake, rtp = cfg.rtp) => { let n = 1; while (n < d.steps && stake * multAt(d, n, rtp) < cfg.maxWin) n++; return n; };
for (const d of LEVELS) d.reach = reachAt(d, cfg.minBet);
const topOf = d => capAt(d, d.reach, cfg.minBet);
// The looks are spread evenly over the charges a round can reach (Tornike, 2026-10-26): the baby at the start, the caped
// master on the last one, so every difficulty grows through all eleven. A safe charge that brings no new look snaps a
// random piece of gear on instead (bot.js), so every charge changes something. 1-10 are the Grows up stages; 11 adds the cape.
const LOOKS = [
  { name: 'Baby', acc: '' }, { name: 'Toddler', acc: '' }, { name: 'Kid', acc: 'scarf' }, { name: 'School kid', acc: 'scarf' },
  { name: 'Teen', acc: 'cap' }, { name: 'Student', acc: 'cap' }, { name: 'Young pro', acc: 'bow tie' }, { name: 'Pro', acc: 'bow tie' },
  { name: 'Expert', acc: 'graduation cap' }, { name: 'Master', acc: 'graduation cap' }, { name: 'Master', acc: 'graduation cap and cape' }
];
const lookAt = (n, reach) => n >= reach ? LOOKS.length : 1 + Math.floor(n * (LOOKS.length - 1) / reach);   // 1-11 after n of reach charges
const lookImg = k => `assets/brainer-${k}.png`;
// Brain cells, shared by every Brainer game: quick levels at first, then slower; ten stages of ten levels.
const CELLS = (() => { const c = [0, 0]; for (let n = 1; n < 100; n++) c.push(c[n] + Math.round(10 + 8 * Math.pow(n, 1.4))); return c; })();
const brainLevel = cells => { let L = 1; while (L < 100 && cells >= CELLS[L + 1]) L++; return L; };
const stageOf = L => Math.ceil(L / 10);

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, stake: 10, level: 1, nonce: 1, client: '', seed: '', hash: '', cells: Math.max(0, parseFloat(store.get('brainer.xp', '0')) || 0) };
// round.status: ready (waiting for Charge or Cash out), charging, broken (overcharged: lost), cashed
let round = null, lastRound = null, starting = false, booted = false;
const live = () => !!round && (round.status === 'ready' || round.status === 'charging');
const myLevel = () => brainLevel(S.cells);
const TEST = new URLSearchParams(location.search).has('test');   // ?test: window.chargeTest.next = 'safe' or 'boom' forces the next charge (marked in the fairness sheet)
if (TEST) window.chargeTest = { next: null };

/* ---------- fairness ---------- */
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// Every charge rolls HMAC-SHA256(server seed, "client seed:nonce:charge"), read as a fraction from its first 52 bits. The
// charge overloads when its roll is at or above that charge's safe chance, so it is safe with exactly that chance.
async function drawRolls(seed, client, nonce, d) {
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Promise.all(Array.from({ length: d.steps }, async (_, i) => parseInt(hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${client}:${nonce}:${i + 1}`))).slice(0, 13), 16) / 2 ** 52));
}
// The game commits first: the next round's server seed is drawn and hashed before the player sets a client seed or a
// bet. Seed and hash change together, and a round waits for them, so none starts on a seed whose hash wasn't shown.
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
  const noise = (dur, vol, f0, f1, delay, type) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t);
  };
  return {
    get on() { return on; },
    toggle() { on = !on; store.set('brainer.sound', on ? 'on' : 'off'); if (on) ctxA(); return on; },
    place() { tone(520, 780, 0.1, 'triangle', 0.09); tone(180, 360, 0.35, 'sawtooth', 0.02, 0.05); },   // the pad powers up
    hum(ms) { const s = ms / 1000; tone(70, 240, s, 'sawtooth', 0.035); tone(140, 480, s, 'square', 0.012); noise(s, 0.06, 300, 3000, 0, 'bandpass'); },   // the coils winding up
    zap() { noise(0.16, 0.08, 7000, 1500, 0, 'highpass'); tone(1600, 600, 0.14, 'triangle', 0.03); },
    gear() { tone(330, 0, 0.06, 'square', 0.035); [784, 1175].forEach((f, i) => tone(f, f * 1.5, 0.14, 'triangle', 0.08, 0.06 + i * 0.07)); },
    safe() { tone(880, 0, 0.14, 'sine', 0.12, 0.05); tone(1320, 0, 0.22, 'sine', 0.1, 0.13); },
    look() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.2, 'triangle', 0.09, 0.15 + i * 0.07)); },
    overcharge() { tone(500, 1700, 0.65, 'sine', 0.05); tone(1000, 2600, 0.65, 'triangle', 0.02); noise(0.2, 0.12, 2600, 600, 0.7); tone(720, 90, 1.0, 'sine', 0.06, 0.8); },   // the battery whines up, pops, and the Brainer powers down
    cash() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0, 0.16, 'triangle', 0.09, i * 0.06)); },
    level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.22, 'sine', 0.1, i * 0.08)); }
  };
})();

/* ---------- round flow ---------- */
const CHARGE_MS = reduced ? 700 : 1150, STRIKE = 0.62;   // the coils feed the battery for 62% of a charge, then it's decided
async function play() {
  if (!booted || live() || starting || sheetOpen()) return;
  const d = LEVELS[S.level];
  if (S.stake < cfg.minBet || S.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)}.`); return; }
  if (S.stake > S.balance) { toast('Not enough demo balance for this bet. Lower it or press Reset.'); return; }
  starting = true; renderControls(); flushLevelUp();
  const r = { stake: S.stake, d, n: 0, rtp: cfg.rtp, reach: reachAt(d, S.stake), client: S.client, nonce: S.nonce++, status: 'ready', payout: 0, forced: [] };   // the client seed in effect as it starts
  try { await commit; r.seed = S.seed; r.hash = S.hash; r.rolls = await drawRolls(r.seed, r.client, r.nonce, d); }
  catch (e) { S.nonce--; toast(window.isSecureContext ? 'Could not start the round. Please try again.' : 'This demo needs https (or localhost) for its provably fair draw.'); return; }
  finally { starting = false; renderControls(); }
  S.balance = cents(S.balance - r.stake); round = r;
  sceneReset(performance.now()); sound.place();
  renderBalance(); renderControls(); renderBattery(); renderNextLook();
}
function charge() {
  const r = round;
  if (!r || r.status !== 'ready' || sheetOpen()) return;
  const now = performance.now();
  r.status = 'charging'; r.t0 = now; r.struck = false;
  r.hit = r.rolls[r.n] >= r.d.safe[r.n];
  if (TEST && window.chargeTest.next) { r.hit = window.chargeTest.next === 'boom'; r.forced[r.n] = true; window.chargeTest.next = null; }
  sceneCharge(now); sound.hum(CHARGE_MS * STRIKE);
  renderControls(); renderBattery();
}
function cashOut(auto) {
  const r = round;
  if (!r || r.status !== 'ready' || r.n < 1) return;
  const m = capAt(r.d, r.n, r.stake, r.rtp);
  r.payout = payAt(r, r.n); r.status = 'cashed'; r.auto = auto;   // auto: the game cashed out (last charge or max win), so no charge was skipped
  S.balance = cents(S.balance + r.payout);
  sceneCash(performance.now(), m); sound.cash();
  if (auto) toast(r.n >= r.d.steps ? 'Last charge done, so your win was cashed out automatically.' : `Max win of ${money(cfg.maxWin)} reached, so your win was cashed out automatically.`);
  settle();
}
function settle() {
  lastRound = round; earnCells(cfg.brain.perRound);
  rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); });
  renderBalance(); renderControls(); renderBattery(); renderNextLook();
  clearTimeout(luDelay); luDelay = setTimeout(flushLevelUp, 1700);   // a brain level-up waits until the result has played out
}
function advance(now) {
  const r = round;
  if (!r || r.status !== 'charging') return;
  const p = (now - r.t0) / CHARGE_MS;
  if (!r.struck && p >= STRIKE) {
    r.struck = true;
    if (r.hit) {
      r.status = 'broken'; sceneBoom(now); sound.overcharge();
      if (navigator.vibrate) navigator.vibrate(40);
      settle(); return;
    }
    const before = lookAt(r.n, r.reach); r.n++; const after = lookAt(r.n, r.reach);
    sceneSafe(now, after !== before ? after : 0); sound.zap(); sound.safe();
    r.popAt = now; renderBattery(); renderNextLook();
  }
  if (p >= 1) {
    r.status = 'ready';
    if (r.n >= r.reach || r.stake * multAt(r.d, r.n, r.rtp) >= cfg.maxWin) { cashOut(true); return; }
    renderControls(); renderBattery();
  }
}

/* ---------- brain cells and levels ---------- */
let luT = 0, luDelay = 0, pendingLevel = 0, levelFrom = 0;
function earnCells(k) {
  const saved = parseFloat(store.get('brainer.xp', ''));
  if (saved >= 0) S.cells = saved;   // another Brainer game open in another tab may have added cells since this one loaded
  const before = myLevel();
  S.cells = Math.round((S.cells + k) * 10) / 10;
  store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(myLevel()));   // the website reads brainer.level
  earnFloat(k); renderPilot();
  if (myLevel() > before) { if (!pendingLevel) levelFrom = before; pendingLevel = myLevel(); }
}
function flushLevelUp() {
  if (!pendingLevel) return;
  const L = pendingLevel, from = levelFrom, el = $('#levelup'); pendingLevel = 0;
  const newStage = stageOf(L) > stageOf(from);
  $('#luImg').src = lookImg(stageOf(L)); $('#luTitle').textContent = `Brain level ${L}`;
  $('#luSub').textContent = newStage ? `New look: stage ${stageOf(L)} of 10` : L - from > 1 ? `Up ${L - from} levels` : 'Your Brainer grew new brain cells';
  el.classList.toggle('lu-big', newStage);
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(luT); luT = setTimeout(() => { el.hidden = true; }, 2800);
  sound.level();
}
function setBrainLevel(L) {   // demo picker: jump straight to a brain level
  S.cells = CELLS[L]; store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(L));
  pendingLevel = 0; renderPilot(); renderPicker();
}
function earnFloat(k) {
  if (reduced || W < 10 || getComputedStyle($('#pilot')).display === 'none') return;
  const sr = stage.getBoundingClientRect(), pr = $('#pilot .ava').getBoundingClientRect();
  const el = document.createElement('span'); el.className = 'earn';
  el.innerHTML = `<i></i>+${k < 10 ? k.toFixed(1) : Math.round(k).toLocaleString('en-US')} brain cells`;
  const x0 = W / 2 - 60, y0 = H * 0.3;
  el.style.left = x0 + 'px'; el.style.top = y0 + 'px';
  stage.appendChild(el);
  const dx = pr.left - sr.left + pr.width / 2 - x0, dy = pr.top - sr.top + pr.height / 2 - y0;
  el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 0 }, { transform: 'translate(0,-24px) scale(1)', opacity: 1, offset: 0.25 }, { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0.2 }], { duration: 1100, delay: 900, fill: 'backwards', easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => { el.remove(); const p = $('#pilot'); p.classList.remove('r-gain'); void p.offsetWidth; p.classList.add('r-gain'); };
}
function renderPilot() {
  const L = myLevel(), next = L < 100 ? CELLS[L + 1] : null, have = S.cells - CELLS[L], cells = Math.floor(S.cells);
  $('#lvnum').textContent = L; $('#plv').textContent = `Brain level ${L}`; $('#pilotImg').src = lookImg(stageOf(L));
  $('#pilot').setAttribute('aria-label', `Brain level ${L}, ${cells.toLocaleString('en-US')} brain cells. Open your Brainer.`);
  $('#pbar').style.width = (next == null ? 100 : Math.round(have / (next - CELLS[L]) * 100)) + '%';
  $('#pnote').textContent = next == null ? `${cells.toLocaleString('en-US')} brain cells · top level` : `${Math.floor(have).toLocaleString('en-US')} / ${(next - CELLS[L]).toLocaleString('en-US')} cells to level ${L + 1}`;
}

/* ---------- the scene: the Blender set, the live 3D Brainer on it (bot.js), and the station's power drawn in 2D ---------- */
// The coils charge a battery that floats over the Brainer's head, never the Brainer itself. A safe charge tops the
// battery up and the Brainer cheers, growing into its next look or snapping on a piece of gear; an overload overfills
// the battery until it pops in a puff of steam, and the Brainer gets dizzy, sits down and dozes off (Tornike: polite,
// no lightning at the robot). Without WebGL the Blender stills stand in for the 3D Brainer.
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, K = 1, OX = 0, OY = 0, last = 0;
const load = src => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; };
const SET = load('assets/set.webp');
const STILL = {};   // the Blender stills, loaded only if the 3D Brainer can't run
const stillOf = look => STILL[look] || (STILL[look] = load(`assets/bot/${look}-ok.webp`));
const bot = () => window.ChargeBot && window.ChargeBot.ready ? window.ChargeBot : null;
const noBot = () => window.ChargeBotFailed || (window.ChargeBot && window.ChargeBot.failed);
function layout() {
  const b = stage.getBoundingClientRect(); W = b.width; H = b.height; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  K = Math.max(W / SC.set.w, H / SC.set.h); OX = (W - SC.set.w * K) * 0.5; OY = (H - SC.set.h * K) * (W > 760 ? 0.62 : 0.5);   // a wide stage crops the sky more than the pad
  renderBattery();
}
const P = (x, y) => [x * K + OX, y * K + OY];   // a point of the render, on the stage
const view = { look: 1, chargeT0: 0, strikeT: 0, struckOk: false, boomT: 0, cashT: 0, parts: [], arcs: null, arcT: 0, bx: 0, by: 0, fill: 0, flash: null, nlT: 0 };
function banner(kind, text, gold) {   // NEW LOOK or GEAR UP, over the pad
  const el = $('#newlook'); el.querySelector('small').textContent = kind; $('#newlookName').textContent = text;
  el.classList.toggle('cape', !!gold); el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(view.nlT); view.nlT = setTimeout(() => { el.hidden = true; }, 1600);
}
function sceneReset(now) { view.look = 1; view.boomT = 0; view.cashT = 0; view.strikeT = 0; view.parts = []; const b = window.ChargeBot; if (b && b.ready) b.reset(now); }
function sceneCharge(now) { view.chargeT0 = now; view.strikeT = 0; const b = bot(); if (b) b.charge(now, CHARGE_MS * STRIKE); }
function sceneSafe(now, newLook) {
  view.strikeT = now; view.struckOk = true; flash(now, '220,250,255', 0.28, 200);
  const b = bot();
  if (newLook) { view.look = newLook; banner('NEW LOOK', LOOKS[newLook - 1].name + (LOOKS[newLook - 1].acc ? ' · ' + LOOKS[newLook - 1].acc : ''), newLook === LOOKS.length); sound.look(); }
  else sound.gear();
  if (b) { b.onGear = g => banner(g.name.startsWith('Gold') ? 'GEAR UPGRADE' : 'GEAR UP', g.name, g.name.startsWith('Gold')); b.win(now, newLook ? { look: newLook } : { gear: true }); }
  for (let i = 0; i < 22; i++) spark(view.bx, view.by + 14 * K, 'cyan');   // energy sprinkles from the battery onto the Brainer
}
function sceneBoom(now) { view.strikeT = now; view.struckOk = false; view.boomT = now; const b = bot(); if (b) b.boom(now); }
function sceneCash(now, m) { view.cashT = now; flash(now, '120,255,200', 0.22, 260); const b = bot(); if (b) b.cash(now); for (let i = 0; i < (m >= 10 ? 60 : 28); i++) spark(view.bx, view.by + 40 * K, 'gold'); }
function flash(now, col, a, ms) { if (!reduced) view.flash = { t: now, col, a, ms }; }
function spark(x, y, kind) {   // cyan sprinkles on a safe charge, gold on a cash-out, steam and little stars when the battery pops
  if (reduced) return;
  const up = kind === 'cyan' ? Math.PI / 2 : -Math.PI / 2, a = up + (Math.random() - 0.5) * (kind === 'cyan' ? 1.4 : 2.2), v = (kind === 'gold' ? 380 : kind === 'steam' ? 70 : kind === 'star' ? 260 : 160) * (0.4 + Math.random()) * K;
  view.parts.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: kind === 'steam' ? 1.4 + Math.random() * 0.8 : 0.6 + Math.random() * 0.6, r: (kind === 'steam' ? 14 + Math.random() * 14 : 4) * K });
}
// A wisp of electricity from a to b: midpoint displacement, a new shape on every flicker
function bolt(a, b, rough, gens) {
  let pts = [a, b];
  for (let g = 0; g < gens; g++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, o = (Math.random() - 0.5) * rough * L;
      out.push([(p[0] + q[0]) / 2 - dy / L * o, (p[1] + q[1]) / 2 + dx / L * o], q);
    }
    pts = out;
  }
  return pts;
}
function strokeBolt(pts, col, w, a) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${col},${0.2 * a})`; ctx.lineWidth = w * 5; ctx.stroke();
  ctx.strokeStyle = `rgba(${col},${0.55 * a})`; ctx.lineWidth = w * 2; ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.lineWidth = w * 0.8; ctx.stroke();
}
function makeArcs(phase) {   // wind: crawling on the coils' rings, then streaming into the battery; feed: a last bright burst into it
  const T = SC.set.term.map(t => P(t[0], t[1])), out = [], bw = 40 * K;
  for (let s = 0; s < 2; s++) {
    const r = SC.set.toroid[s], ang = Math.random() * Math.PI * 2, e = P(r.cx + Math.cos(ang) * r.rx * 1.1, r.cy + Math.sin(ang) * r.ry * 1.4 + 6);
    out.push({ pts: bolt(T[s], e, 0.5, 4), col: '140,235,255', w: 1.1 });
    if (phase !== 'crawl') out.push({ pts: bolt(T[s], [view.bx + (s ? bw : -bw), view.by], 0.3, 6), col: '120,230,255', w: phase === 'feed' ? 2.2 : 1.4 });
  }
  return out;
}
function ellipseGlow(r, col, a, w) {
  if (a <= 0.01) return;
  const [x, y] = P(r.cx, r.cy);
  ctx.beginPath(); ctx.ellipse(x, y, r.rx * K, r.ry * K, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${0.25 * a})`; ctx.lineWidth = w * 4 * K; ctx.stroke();
  ctx.strokeStyle = `rgba(${col},${0.7 * a})`; ctx.lineWidth = w * 1.4 * K; ctx.stroke();
}
// The battery over the Brainer's head: it fills with the round (a full one is the last charge the round can reach)
function drawBattery(now) {
  const r = round, reach = r ? r.reach : LEVELS[S.level].reach, n = r ? r.n : 0, charging = r && r.status === 'charging';
  let goal = n / reach, col = [85, 230, 255], s = 1, dx = 0, popped = false, dead = false;
  const sinceBoom = view.boomT ? now - view.boomT : -1;
  if (charging && !r.struck) goal = (n + clamp((now - r.t0) / (CHARGE_MS * STRIKE), 0, 1) * 0.8) / reach;   // topping up as the coils feed it
  if (view.boomT && r && r.status === 'broken') {
    if (sinceBoom < 700) { const q = sinceBoom / 700; goal = n / reach + q * 0.7; col = [255, Math.round(lerp(181, 52, q)), Math.round(lerp(71, 72, q))]; s = 1 + 0.32 * q; dx = reduced ? 0 : Math.sin(now / 22) * 3 * q * K; }
    else { popped = true; dead = true; goal = 0; }
    if (sinceBoom >= 700 && !view.popped) { view.popped = true; for (let i = 0; i < 16; i++) spark(view.bx, view.by, 'steam'); for (let i = 0; i < 10; i++) spark(view.bx, view.by, 'star'); flash(now, '255,214,150', 0.2, 260); }
  } else view.popped = false;
  if (r && r.status === 'cashed') col = [51, 214, 109];
  view.fill += (goal - view.fill) * Math.min(1, (charging || view.boomT ? 0.25 : 0.12));
  const z = Math.max(1.35, 0.9 / K), x = view.bx + dx, y = view.by, w = 76 * K * s * z, h = 34 * K * s * z, rr = 8 * K * s * z, lw = Math.max(2, 3 * K);   // big enough to read on a phone too
  if (dead && now - view.boomT > 1300 && !reduced && Math.floor(now / 600) % 2) return;   // the empty battery blinks, as a flat one does
  ctx.save();
  ctx.fillStyle = 'rgba(10,19,34,.72)'; ctx.strokeStyle = dead ? 'rgba(255,120,130,.95)' : 'rgba(255,255,255,.95)'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, rr); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dead ? 'rgba(255,120,130,.95)' : 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.roundRect(x + w / 2 + lw * 0.3, y - h * 0.22, 6 * K * s * z, h * 0.44, 2 * K); ctx.fill();
  const pad = 5 * K * s * z, iw = w - pad * 2, f = clamp(view.fill, 0, 1.6);
  if (!popped && f > 0.001) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x - w / 2 + pad, y - h / 2 + pad, iw, h - pad * 2, rr * 0.6); ctx.clip();
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, `rgba(${col},.75)`); g.addColorStop(1, `rgb(${col})`);
    ctx.fillStyle = g; ctx.fillRect(x - w / 2 + pad, y - h / 2 + pad, iw * Math.min(1, f), h - pad * 2);
    if (charging && !reduced) { const st = 22 * K * s; ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let sx = x - w / 2 + pad - st + (now / 14) % 22 * K * s; sx < x + w / 2; sx += st) ctx.fillRect(sx, y - h / 2, 6 * K * s, h); }   // charge flowing in
    ctx.restore();
    if (f > 1) { ctx.fillStyle = `rgba(${col},.85)`; ctx.fillRect(x + w / 2 + 8 * K * s, y - h * 0.3, (f - 1) * iw * 0.6, h * 0.6); }   // overfilling past the end
    ctx.strokeStyle = 'rgba(10,19,34,.5)'; ctx.lineWidth = Math.max(1, 1.5 * K);   // five cells
    for (let i = 1; i < 5; i++) { const sx = x - w / 2 + pad + iw * i / 5; ctx.beginPath(); ctx.moveTo(sx, y - h / 2 + pad); ctx.lineTo(sx, y + h / 2 - pad); ctx.stroke(); }
  }
  if (r && r.status === 'cashed') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5 * K; ctx.beginPath(); ctx.moveTo(x - 10 * K, y); ctx.lineTo(x - 2 * K, y + 8 * K); ctx.lineTo(x + 12 * K, y - 8 * K); ctx.stroke(); }
  if (view.boomT && sinceBoom > 250 && sinceBoom < 700) { ctx.fillStyle = '#ffd56b'; ctx.font = `800 ${Math.round(26 * K * s)}px FiraGO, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', x, y - h / 2 - 8 * K); }
  if (dead) { ctx.strokeStyle = 'rgba(255,120,130,.95)'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x - w * 0.2, y + h * 0.28); ctx.lineTo(x + w * 0.2, y - h * 0.28); ctx.stroke(); }
  ctx.restore();
}
function draw(now, dt) {
  const r = round;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#9fb7c9'; ctx.fillRect(0, 0, W, H);
  if (SET.complete && SET.naturalWidth) ctx.drawImage(SET, OX, OY, SC.set.w * K, SC.set.h * K);
  const charging = r && r.status === 'charging', p = charging ? (now - r.t0) / CHARGE_MS : 0, asleep = !!(r && r.status === 'broken');
  // the station's glow: the coils hum while waiting and wind up on a charge; after an overload they rest a while
  const wind = charging && !r.struck ? clamp(p / STRIKE, 0, 1) : 0, after = view.strikeT && view.struckOk ? Math.max(0, 1 - (now - view.strikeT) / 450) : 0;
  const rest = view.boomT ? clamp((now - view.boomT - 1200) / 3000, 0, 1) : 1;
  const coil = Math.max((0.22 + 0.06 * Math.sin(now / 380)) * rest, wind * wind, after);
  ctx.globalCompositeOperation = 'lighter';
  for (const side of SC.set.coils) side.forEach((ring, k) => ellipseGlow(ring, '85,230,255', coil * (charging ? clamp(wind * 6 - k * 0.8, 0.25, 1) : 1), 1.2));
  const cashGlow = view.cashT ? Math.max(0, 1 - (now - view.cashT) / 1400) : 0;
  const pulse = asleep ? (0.18 + 0.08 * Math.sin(now / 900)) : 0.35 + 0.15 * Math.sin(now / 520) + wind * 0.65 + after * 0.6;
  const padCol = cashGlow ? '90,255,170' : asleep ? '255,181,71' : '85,230,255';
  ellipseGlow(SC.set.pad, padCol, Math.max(pulse, cashGlow), 1.6); ellipseGlow(SC.set.pad2, padCol, Math.max(pulse * 0.8, cashGlow), 1.2);
  ctx.globalCompositeOperation = 'source-over';
  // the Brainer: live in 3D, or the Blender still for its look
  const b = bot(), f = b ? b.frame(now, dt, K, OX, OY, Math.min(DPR, 1.75)) : null;
  let top;
  if (f) { ctx.drawImage(f.canvas, f.x, f.y, f.w, f.h); top = f.a.top; }
  else {
    const look = view.look, s = SC.sprites[`${look}-ok`], im = noBot() ? stillOf(look) : null;
    if (s && im && im.complete && im.naturalWidth) {
      const bob = reduced ? 0 : Math.sin(now / 640) * 2.2 * K;
      ctx.save(); if (asleep) ctx.filter = 'grayscale(.5) brightness(.85)'; ctx.drawImage(im, s.x * K + OX, s.y * K + OY + bob, s.w * K, s.h * K); ctx.restore();
    }
    const a = s ? s.a : SC.sprites['1-ok'].a; top = P(a.head[0], a.head[1] - 150);
  }
  // the battery floats over its head; a tall Brainer would push it into the multiplier, so then it moves beside the head
  if (now - (view.measT || 0) > 400) { view.measT = now; const rb = $('#readout').getBoundingClientRect(), sb = stage.getBoundingClientRect(); view.minY = rb.bottom - sb.top + 34 * Math.max(K, 0.6); }
  let tx = top[0], ty = top[1] - 46 * K;
  if (ty < view.minY) { ty = Math.max(view.minY, top[1] + 40 * K); tx = top[0] - 185 * K; }
  if (!view.bx) { view.bx = tx; view.by = ty; }
  view.bx += (tx - view.bx) * Math.min(1, dt / 90); view.by += (ty - view.by) * Math.min(1, dt / 90);
  // the coils feed the battery: crawling arcs first, then streams into it
  ctx.globalCompositeOperation = 'lighter';
  let phase = '';
  if (charging && !r.struck) phase = p < STRIKE * 0.35 ? 'crawl' : 'stream';
  else if (view.strikeT && view.struckOk && now - view.strikeT < 220) phase = 'feed';
  if (phase) {
    if (!view.arcs || view.arcs.phase !== phase || now - view.arcT > 70) { view.arcs = makeArcs(phase); view.arcs.phase = phase; view.arcT = now; }
    const a = phase === 'feed' ? 1 - (now - view.strikeT) / 220 * 0.6 : 0.35 + 0.65 * wind;
    for (const bo of view.arcs) strokeBolt(bo.pts, bo.col, bo.w * K, a);
  } else view.arcs = null;
  ctx.globalCompositeOperation = 'source-over';
  drawBattery(now);
  // sprinkles, sparkles, steam and stars
  const s = dt / 1000;
  view.parts = view.parts.filter(q => (q.age += s) < q.life);
  for (const q of view.parts) {
    const fade = 1 - q.age / q.life;
    if (q.kind === 'steam') {
      q.x += q.vx * s; q.y += q.vy * s - 20 * K * s; q.vx *= 0.97; const rr = q.r * (1 + q.age * 1.3);
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr); g.addColorStop(0, `rgba(255,255,255,${0.55 * fade})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(q.x - rr, q.y - rr, rr * 2, rr * 2); continue;
    }
    q.vy += (q.kind === 'cyan' ? 160 : q.kind === 'star' ? 420 : 900) * K * s; q.x += q.vx * s; q.y += q.vy * s;
    if (q.kind === 'star') { ctx.fillStyle = `rgba(255,214,107,${fade})`; ctx.font = `800 ${Math.round(18 * K)}px FiraGO, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', q.x, q.y); continue; }
    ctx.globalCompositeOperation = 'lighter';
    const col = q.kind === 'gold' ? '255,214,107' : '140,235,255';
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
    ctx.strokeStyle = `rgba(${col},${fade})`; ctx.lineWidth = (q.kind === 'gold' ? 3 : 2) * Math.max(0.6, K); ctx.lineCap = 'round'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (view.flash) { const q = (now - view.flash.t) / view.flash.ms; if (q >= 1) view.flash = null; else { ctx.fillStyle = `rgba(${view.flash.col},${view.flash.a * (1 - q)})`; ctx.fillRect(0, 0, W, H); } }
}
function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (W && H) { advance(now); draw(now, dt); updateUI(now); }
  requestAnimationFrame(loop);
}

/* ---------- readout, battery and controls ---------- */
const cache = {};
const put = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = document.getElementById(id); if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else if (prop === 'hidden') el.hidden = v; else el.setAttribute(prop, v); };
function updateUI(now) {
  const r = round, d = r ? r.d : LEVELS[S.level];
  let lvl = 'LVL 1', name = LOOKS[0].name, lvlCls = 'lvl', big, bigCls = 'mult', sub = '', subCls = 'sub';
  if (!r || (!live() && starting)) { lvl = d.name; name = `up to ${d.reach} charges`; big = fxShort(topOf(d)); bigCls = 'mult idle'; sub = 'Top win · set your bet and press Play'; }
  else {
    const cur = capAt(r.d, r.n, r.stake, r.rtp), lk = lookAt(r.n, r.reach);
    lvl = `LVL ${r.n + 1}`; name = LOOKS[lk - 1].name; big = fx(cur);
    if (r.status === 'ready') { const nx = capAt(r.d, r.n + 1, r.stake, r.rtp); sub = r.n < r.reach ? `Next charge: ${fx(nx)} · ${pct(r.d.safe[r.n])} safe` : ''; }
    else if (r.status === 'charging') sub = r.struck ? 'Charged!' : 'Charging…';
    else if (r.status === 'broken') { lvl = 'OVERCHARGED'; lvlCls = 'lvl bust'; name = `at LVL ${r.n + 1}`; big = 'Battery flat'; bigCls = 'mult bust'; sub = `Charge ${r.n + 1} overloaded · −${money(r.stake)}`; subCls = 'sub bad'; }
    else { lvlCls = 'lvl won'; big = fx(cur); bigCls = cur >= 10 ? 'mult win gold' : 'mult win'; sub = `Cashed out: you won ${money(r.payout)}`; subCls = 'sub ok'; }
  }
  if (r && r.popAt && now - r.popAt < 400 && r.status !== 'broken') bigCls += ' pop';
  put('lvlN', 'text', lvl); put('lookName', 'text', name); put('lvlPill', 'class', lvlCls);
  put('mult', 'text', big); put('mult', 'class', bigCls); put('sub', 'hidden', !sub); put('sub', 'text', sub); put('sub', 'class', subCls);
  if (r && live()) put('cashSub', 'text', r.n < 1 ? 'after the first charge' : money(payAt(r, r.n)));
}
const pct = v => (Math.round(v * 1000) / 10).toLocaleString('en-US') + '%';
// Charge, Cash out and Play go inert with aria-disabled, not disabled: Chrome drops focus from a disabled button, so
// keyboard and screen-reader players would lose their place every round. play(), charge() and cashOut() ignore presses
// they cannot take.
function renderControls() {
  const lv = live(), r = round, setup = $('#setup'), had = setup.contains(document.activeElement) && document.activeElement;
  setup.classList.toggle('live', lv); $('#cash').hidden = !lv;
  $('#go').classList.toggle('zap', lv);
  $('#goL1').textContent = lv ? '⚡ Charge' : 'Play';
  $('#goL2').textContent = starting ? 'Powering up…' : lv ? (r.status === 'charging' ? 'Charging…' : r.n < r.reach ? `to ${fx(capAt(r.d, r.n + 1, r.stake, r.rtp))}` : '') : `${money(S.stake)} · ${LEVELS[S.level].name}`;
  $('#go').setAttribute('aria-disabled', String(starting || (lv && r.status !== 'ready')));
  $('#cash').setAttribute('aria-disabled', String(!lv || r.status !== 'ready' || r.n < 1));
  for (const el of ['#amt', '#dec', '#inc']) $(el).disabled = lv;
  document.querySelectorAll('#chips button, #levels button').forEach(b => b.setAttribute('aria-disabled', String(lv)));
  if (had && had.hidden) $('#go').focus({ preventScroll: true });
}
function renderLevels() {   // built once, as the tops never change; after that only the pressed one moves, so focus stays on the button
  const bs = document.querySelectorAll('#levels button[data-l]');
  if (bs.length === LEVELS.length) { bs.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.l === S.level))); return; }
  $('#levels').innerHTML = LEVELS.map((d, i) => `<button type="button" data-l="${i}" aria-pressed="${i === S.level}"><b>${d.name}</b><span>up to ${fxShort(topOf(d))}</span></button>`).join('');
}
function renderBattery() {
  const r = round, d = r ? r.d : LEVELS[S.level], stake = r ? r.stake : cfg.minBet, reach = r ? r.reach : d.reach, n = r ? r.n : 0, st = r ? r.status : '';
  const rows = [];
  for (let i = 0; i <= reach; i++) {
    const lk = lookAt(i, reach), newLook = i === 0 || lk !== lookAt(i - 1, reach);
    let cls = 'cell', extra = '';
    if (r && i < n) cls += ' done';
    if (i === n) cls += !r ? ' now' : st === 'cashed' ? ' won' : ' now';
    if (r && i === n + 1 && st === 'broken') cls += ' boom';
    if (i === n + 1 && (!r || st === 'ready' || st === 'charging')) { cls += ' next'; extra = `<span class="safe">${pct(d.safe[n])} safe</span>`; }
    rows.push(`<div class="${cls}" role="listitem" aria-label="Level ${i + 1}: ${fx(capAt(d, i, stake))}${newLook ? `, ${LOOKS[lk - 1].name} look` : ''}">LVL ${i + 1}${extra}<b>${fxShort(capAt(d, i, stake))}</b>${newLook ? `<img src="${lookImg(lk)}" alt="">` : ''}</div>`);
  }
  const bat = $('#battery');
  if (!bat.firstChild) bat.innerHTML = '<div class="cells"><div class="cells-in"></div></div>';
  const inner = bat.querySelector('.cells-in'), html = rows.join('');
  if (inner._html !== html) { inner.innerHTML = html; inner._html = html; }
  // keep the current level in view: the battery shows the levels round it, scrolling up (or along, on a phone) as it fills
  const box = bat.querySelector('.cells'), cur = inner.children[Math.min(n, inner.children.length - 1)];
  if (!cur) return;
  const across = getComputedStyle(inner).flexDirection.startsWith('row');
  if (across) { const want = cur.offsetLeft + cur.offsetWidth / 2 - box.clientWidth * 0.4; inner.style.transform = `translateX(${-clamp(want, 0, Math.max(0, inner.scrollWidth - box.clientWidth))}px)`; }
  else { const fromBottom = inner.offsetHeight - cur.offsetTop - cur.offsetHeight, want = fromBottom - box.clientHeight * 0.3; inner.style.transform = `translateY(${clamp(want, 0, Math.max(0, inner.offsetHeight - box.clientHeight))}px)`; }
}
function renderNextLook() {   // the next look ahead, how many charges away it is, and that gear comes on the charges between
  const r = round, d = r ? r.d : LEVELS[S.level], reach = r ? r.reach : d.reach, stake = r ? r.stake : cfg.minBet, n = r && r.status !== 'broken' ? r.n : 0;
  const cur = lookAt(n, reach), el = $('#nextlook');
  let c = 0;
  for (let i = n + 1; i <= reach; i++) if (lookAt(i, reach) > cur) { c = i; break; }
  el.classList.toggle('top', !c);
  if (c) {
    const L = LOOKS[cur], away = c - n, gear = away - 1;
    $('#nlHead').textContent = `Next look at ${fxShort(capAt(d, c, stake))}`; $('#nlImg').src = lookImg(cur + 1); $('#nlName').textContent = L.name;
    $('#nlSub').textContent = (r && live() ? `${away} charge${away === 1 ? '' : 's'} away` : `at charge ${c}`) + (gear > 0 ? ` · ${gear} gear-up${gear === 1 ? '' : 's'} first` : '');
  } else {
    $('#nlHead').textContent = 'Top look'; $('#nlImg').src = lookImg(cur); $('#nlName').textContent = LOOKS[cur - 1].name;
    $('#nlSub').textContent = 'Graduation cap and cape';
  }
}
function renderPicker() {   // your Brainer: brain level, progress and the ten stages
  const L = myLevel(), st = stageOf(L), f = document.activeElement, keep = f && f.dataset && f.dataset.b ? `#levelsGrid [data-b="${f.dataset.b}"]` : '';
  $('#pickLevel').textContent = L; $('#pickSlider').value = L;
  $('#pickNote').textContent = L < 100 ? `${Math.floor(S.cells - CELLS[L]).toLocaleString('en-US')} of ${(CELLS[L + 1] - CELLS[L]).toLocaleString('en-US')} brain cells to level ${L + 1}.` : 'Top level reached.';
  $('#levelsGrid').innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" data-b="${i * 10 + 1}" aria-pressed="${i + 1 === st}"${i + 1 > st ? ' class="ahead"' : ''}><img src="${lookImg(i + 1)}" alt=""><b>Stage ${i + 1}</b><span>Levels ${i * 10 + 1}–${i * 10 + 10}</span></button>`).join('');
  if (keep && $(keep)) $(keep).focus({ preventScroll: true });
}
function renderBalance() { $('#balance').textContent = money(S.balance); $('.hud').classList.toggle('long', S.balance >= 1e5); }
function renderSound() { const b = $('#sound'); b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', sound.on ? 'Sound on, tap to mute' : 'Sound off, tap to unmute'); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

/* ---------- provably fair: the next round's commit, and the last round revealed and re-checked ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);   // client seeds are the player's own text
const kv = (k, v) => `<div class="kv"><span>${k}</span><code>${esc(v)}</code></div>`;
function renderFair() {
  const lv = live() ? round : null, r = lastRound, off = lv ? ' disabled' : '';
  let h = `<h4>${lv ? 'This round' : 'Your next round'}</h4>${kv('Server seed hash', lv ? lv.hash : S.hash)}`
    + `<div class="kv"><label for="seedIn">Your client seed</label><div class="seed-row"><input id="seedIn" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="seedMsg"${off}><button type="button" id="seedNew"${off}>New random</button></div><p class="seed-msg" id="seedMsg" aria-live="polite"></p></div>`
    + `${kv('Nonce', lv ? lv.nonce : S.nonce)}`
    + `<p class="sheet-note">${lv ? 'The server seed is revealed when this round ends. You can change your client seed after it.' : 'This hash is fixed now, before you set your client seed or choose a bet. A new client seed applies from your next round and is kept for this visit only.'}</p>`;
  if (r) h += `<h4>Last round: ${r.d.name}, ${r.status === 'broken' ? `overcharged on charge ${r.n + 1}` : `cashed out at ${fx(capAt(r.d, r.n, r.stake, r.rtp))}`}</h4>`
    + `${kv('Server seed hash', r.hash)}${kv('Server seed, revealed', r.seed)}${kv('Client seed', r.client)}${kv('Nonce', r.nonce)}`
    + '<button type="button" class="big ghost" id="fairCheck">Check this round</button><div id="fairOut" aria-live="polite"></div>';
  $('#fairBody').innerHTML = h; $('#seedIn').value = lv ? lv.client : S.client;
}
function setClient(v) {   // the player's client seed: 1–64 characters (code points, so an emoji is one), trimmed; anything else keeps the last valid one
  const s = v.trim(), n = [...s].length, ok = n >= 1 && n <= 64;
  if (ok && !live()) S.client = s;
  $('#seedIn').setAttribute('aria-invalid', String(!ok));
  $('#seedMsg').textContent = ok ? '' : `Use 1 to 64 characters${n ? ` (this is ${n})` : ''}. Your last valid seed stays in use.`;
  return ok;
}
async function checkFair() {
  const r = lastRound;
  if (!r) return;
  const hashOk = (await sha256(r.seed)) === r.hash;
  const rolls = await drawRolls(r.seed, r.client, r.nonce, r.d);
  const played = r.status === 'broken' ? r.n + 1 : r.n, shown = Math.min(r.d.steps, r.status === 'cashed' && !r.auto ? played + 1 : played);   // after the player's own cash-out, also show the charge they skipped
  const rollsOk = rolls.slice(0, played).every((u, i) => r.forced[i] || u === r.rolls[i]) && rolls.slice(0, played).every((u, i) => r.forced[i] || (u >= r.d.safe[i]) === (r.status === 'broken' && i === r.n));
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  const rows = Array.from({ length: shown }, (_, i) => {
    const u = rolls[i], sv = r.d.safe[i], boom = u >= sv, skipped = i >= played;
    const say = `Charge ${i + 1}${skipped ? ', skipped by cashing out' : ''}: safe chance ${pct(sv)}, roll ${u.toFixed(4)}, ${boom ? 'overload' : 'safe'}${r.forced[i] ? ' (forced in test mode)' : ''}`;
    return `<div class="frow${boom ? ' boom' : ''}${skipped ? ' next' : ''}" role="img" aria-label="${say}"><span class="st">${i + 1}</span><span class="bar2"><i style="width:${sv * 100}%"></i><u style="left:calc(${u * 100}% - 1px)"></u></span><span>${u.toFixed(4)}</span><span class="res">${boom ? 'Overload' : 'Safe'}${r.forced[i] ? ' · test' : ''}</span></div>`;
  }).join('');
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before the round' : 'The seed does not match the hash')
    + ok(rollsOk, rollsOk ? 'Rolls recomputed from the seeds match your round' : 'Recomputed rolls differ from the round')
    + `<div class="fgrid" role="group" aria-label="Each charge's roll">${rows}</div>`
    + `<p class="sheet-note">The cyan bar is each charge's safe chance and the white mark its roll: a roll inside the bar is safe.${shown > played ? ' The faded row is the next charge you skipped by cashing out.' : ''}</p>`;
}

/* ---------- sheets: brain-level picker, fairness and how to play ---------- */
const sheetOpen = () => !$('#picker').hidden || !$('#tutorial').hidden || !$('#agegate').hidden || !$('#fairSheet').hidden;
let lastFocus = null;
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; const f = $(id).querySelector('button[aria-pressed=true], button'); if (f) f.focus({ preventScroll: true }); }   // no scroll: inside the website's frame it would scroll the parent page
function closeSheet(id) { $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
$('#pilot').addEventListener('click', () => { renderPicker(); openSheet('#picker'); });
$('#pickerClose').addEventListener('click', () => closeSheet('#picker'));
$('#levelsGrid').addEventListener('click', e => { const b = e.target.closest('button[data-b]'); if (b) setBrainLevel(+b.dataset.b); });
$('#pickSlider').addEventListener('input', e => setBrainLevel(+e.target.value));
$('#help').addEventListener('click', () => openSheet('#tutorial'));
$('#fair').addEventListener('click', () => { renderFair(); openSheet('#fairSheet'); });
$('#fairClose').addEventListener('click', () => closeSheet('#fairSheet'));
$('#fairBody').addEventListener('click', e => { if (e.target.closest('#fairCheck')) checkFair(); if (e.target.closest('#seedNew') && !live()) { $('#seedIn').value = randHex(8); setClient($('#seedIn').value); } });
$('#fairBody').addEventListener('input', e => { if (e.target.id === 'seedIn') setClient(e.target.value); });
$('#fairBody').addEventListener('change', e => { if (e.target.id === 'seedIn' && setClient(e.target.value)) e.target.value = S.client; });
$('#tutGo').addEventListener('click', () => { store.set('brainer.ch.tutorial', 'seen'); closeSheet('#tutorial'); });
// 18+ check, shared with the website (same key), so a visitor who confirmed there is not asked again
$('#ageYes').addEventListener('click', () => { store.set('brainer.age-ok', '1'); closeSheet('#agegate'); if (store.get('brainer.ch.tutorial', '') !== 'seen') openSheet('#tutorial'); });
$('#ageNo').addEventListener('click', () => { $('#ageSorry').hidden = false; $('.age-actions').hidden = true; });
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s && s.id !== 'agegate') { if (s.id === 'tutorial') store.set('brainer.ch.tutorial', 'seen'); closeSheet('#' + s.id); } }));

/* ---------- input ---------- */
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
function setStake(v) { if (live()) return; S.stake = clampStake(v); $('#amt').value = S.stake.toFixed(2); renderControls(); }
$('#amt').addEventListener('change', () => setStake(parseFloat($('#amt').value)));
$('#dec').addEventListener('click', () => setStake(S.stake - (S.stake > 10 ? 1 : 0.5)));
$('#inc').addEventListener('click', () => setStake(S.stake + (S.stake >= 10 ? 1 : 0.5)));
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || live()) return; const c = b.dataset.chip; setStake(c === 'min' ? cfg.minBet : c === 'max' ? Math.min(cfg.maxBet, Math.floor(S.balance * 100 + 1e-6) / 100) : c === 'half' ? S.stake / 2 : S.stake * 2); });
$('#levels').addEventListener('click', e => {
  const b = e.target.closest('button[data-l]'); if (!b || live()) return;
  S.level = +b.dataset.l; store.set('brainer.ch.level', String(S.level)); renderLevels(); renderControls();
  if (round && !live()) { round = null; sceneReset(performance.now()); }   // the last result clears: the baby is back on the pad
  renderBattery(); renderNextLook();
});
$('#go').addEventListener('click', () => { if (live()) charge(); else play(); });
$('#cash').addEventListener('click', () => cashOut(false));
$('#sound').addEventListener('click', () => { sound.toggle(); renderSound(); });
$('#refill').addEventListener('click', () => { if (live()) { toast('Finish this round first.'); return; } S.balance = cfg.startBalance; renderBalance(); toast(`Demo balance reset to ${money(cfg.startBalance)}.`); });
cv.addEventListener('click', () => { if (round && round.status === 'ready') charge(); });   // a tap on the station charges, as Charge does
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {   // Tab stays inside the open sheet (the last one in the page is on top)
    const s = [...document.querySelectorAll('.sheet')].filter(x => !x.hidden).pop();
    if (s) { const f = [...s.querySelectorAll('button, input')].filter(b => !b.disabled && b.getClientRects().length), i = f.indexOf(document.activeElement); if (!f.length) e.preventDefault(); else if (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus({ preventScroll: true }); } }
    return;
  }
  if (e.key === 'Escape') { for (const id of ['#picker', '#fairSheet', '#tutorial']) if (!$(id).hidden) { if (id === '#tutorial') store.set('brainer.ch.tutorial', 'seen'); closeSheet(id); } return; }
  if (!booted) { if (e.code === 'Space') e.preventDefault(); return; }   // no game keys under the intro (the 18+ check comes first)
  if (sheetOpen()) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;   // browser shortcuts stay theirs, and a held key never charges twice
  if (e.code === 'KeyC') { cashOut(false); return; }   // by the key's place, so it works on Georgian and other layouts
  if (e.code !== 'Space' || (tag === 'BUTTON' && !ptrFocus)) return;   // a button reached with Tab takes Space itself; one just clicked does not
  e.preventDefault();
  if (live()) charge(); else play();
});

/* ---------- boot ---------- */
let ptrFocus = false;   // focus last moved by a click, not by Tab
document.addEventListener('pointerdown', () => { ptrFocus = true; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Tab') ptrFocus = false; }, true);
window.addEventListener('resize', layout);
if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
S.level = clamp(parseInt(store.get('brainer.ch.level', '1'), 10) || 0, 0, LEVELS.length - 1);
S.client = randHex(8);
rotateSeed().catch(() => {});   // without crypto.subtle (plain http) Play says why instead
setStake(S.stake); renderLevels(); renderBalance(); renderControls(); renderPilot(); renderSound(); layout(); renderBattery(); renderNextLook();
const bootT = performance.now();
function loadProgress() {   // fonts, the set and the 3D Brainer (or word that it can't run); a slow network never holds the player past 9 s
  if (performance.now() - bootT > 9000) return 1;
  const art = SET.complete ? 1 : 0, font = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0, b3 = window.ChargeBot ? (window.ChargeBot.ready || window.ChargeBot.failed ? 1 : 0.5) : noBot() ? 1 : 0;
  return (art * 2 + font + b3 * 2) / 5;
}
$('.brand .t1').textContent = 'Charge';
(window.BrainerIntro ? window.BrainerIntro.start({ title: 'Charge', mark: 'CHARGE', theme: 'plane', what: 'the charging station', progress: loadProgress }) : Promise.resolve()).then(() => {
  booted = true;
  if (store.get('brainer.age-ok', '') !== '1') openSheet('#agegate');
  else if (store.get('brainer.ch.tutorial', '') !== 'seen') openSheet('#tutorial');
});
requestAnimationFrame(loop);
})();
