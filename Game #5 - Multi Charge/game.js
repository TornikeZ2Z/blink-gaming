(() => {
'use strict';
const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';
const fxShort = m => (m < 1000 ? m.toFixed(2) : m < 1e6 ? Math.floor(m).toLocaleString('en-US') : (Math.floor(m / 1e5) / 10) + 'M') + '×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const cents = v => Math.round(v * 100) / 100;   // the balance stays in whole cents, so it matches every amount shown
const SC = window.CHARGE_SCENE, SG = SC.set;   // assets/scene.js: the five pillars, and Charge's frame inside this one (ox, oy), where the Brainer stands
const tipOf = q => q.tip || q.term;   // a pillar's top (its crystal's point): its number floats over it

/* ---------- config & math ---------- */
// Plane Crash's game, one to one, on Charge's station (Tornike, 2026-10-27: "visually i want charge and contentwise i want
// plane crash"). 25 charges hide 1, 3, 5 or 10 overloads and each charge uses up one more, so the chance of surviving n
// charges is C(25-n, b) / C(25, b). At every charge the player picks one of five pillars, as Plane Crash's five paths, and
// one roll says yes or no, so no pillar is better than another. After n safe charges
// the multiplier is the RTP divided by the chance of surviving them, rounded down to the cent, so cashing out after any
// charge returns up to the RTP: less where a payout rounds down to the cent, or where the $10,000 max win ends a long or
// high-bet round early.
const cfg = {
  rtp: 97, minBet: 0.1, maxBet: 200, maxWin: 10000, startBalance: 1000, pillars: 5,
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
const PILLARS = ['far left', 'left', 'middle', 'right', 'far right'];
const multAt = (d, n, rtp = cfg.rtp) => n <= 0 ? 1 : Math.floor(rtp / 100 / d.cum[n] * 100 + 1e-7) / 100;
const capAt = (d, n, stake, rtp = cfg.rtp) => Math.min(multAt(d, n, rtp), Math.floor(cfg.maxWin / stake * 100 + 1e-7) / 100);   // what n charges really pay at this bet: the max win caps it
const payAt = (r, n) => Math.min(Math.floor(r.stake * multAt(r.d, n, r.rtp) * 100 + 1e-6) / 100, cfg.maxWin);   // cashing out after n charges pays this, rounded down to the cent
// What a round can really reach: the max win cashes it out on the first charge that pays that much, so even at the
// minimum bet Hardcore never offers charge 15. Every top shown before a bet uses d.reach, at the minimum bet.
const reachAt = (d, stake, rtp = cfg.rtp) => { let n = 1; while (n < d.steps && stake * multAt(d, n, rtp) < cfg.maxWin) n++; return n; };
for (const d of LEVELS) d.reach = reachAt(d, cfg.minBet);
const topOf = d => capAt(d, reachAt(d, S.stake), S.stake);   // what a difficulty can really pay at the bet set
// Charge's looks, spread evenly over the charges a round can reach: the baby at the start, the caped master on the last
// one. A safe charge that brings no new look snaps a random piece of gear on instead (bot.js), so every charge changes
// something. 1-10 are the Grows up stages; 11 adds the cape.
const LOOKS = [
  { name: 'Baby', acc: '' }, { name: 'Toddler', acc: '' }, { name: 'Kid', acc: 'scarf' }, { name: 'School kid', acc: 'scarf' },
  { name: 'Teen', acc: 'cap' }, { name: 'Student', acc: 'cap' }, { name: 'Young pro', acc: 'bow tie' }, { name: 'Pro', acc: 'bow tie' },
  { name: 'Expert', acc: 'graduation cap' }, { name: 'Master', acc: 'graduation cap' }, { name: 'Master', acc: 'graduation cap and cape' }
];
const lookAt = (n, reach) => n >= reach ? LOOKS.length : 1 + Math.floor(n * (LOOKS.length - 1) / reach);   // 1-11 after n of reach charges
const lookImg = k => `assets/look/${k}.webp`;   // 256 px pictures of the eleven looks (13 KB each)
// Brain cells, shared by every Brainer game: quick levels at first, then slower; ten stages of ten levels.
const CELLS = (() => { const c = [0, 0]; for (let n = 1; n < 100; n++) c.push(c[n] + Math.round(10 + 8 * Math.pow(n, 1.4))); return c; })();
const brainLevel = cells => { let L = 1; while (L < 100 && cells >= CELLS[L + 1]) L++; return L; };

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, stake: 10, level: 1, nonce: 1, client: '', seed: '', hash: '', cells: Math.max(0, parseFloat(store.get('brainer.xp', '0')) || 0) };
// round.status: ready (waiting for a pillar or Cash out), charging, broken (an overloaded pillar: lost), cashed
let round = null, lastRound = null, starting = false, booted = false;
const live = () => !!round && (round.status === 'ready' || round.status === 'charging');
const TEST = new URLSearchParams(location.search).has('test');   // ?test: window.chargeTest.next = 'safe' or 'boom' forces the next pillar picked (marked in the fairness sheet)
if (TEST) window.chargeTest = { next: null };

/* ---------- fairness ---------- */
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// Every charge is one yes or no, as in Chicken Road and Charge (Tornike, 2026-10-30): HMAC-SHA256(server seed, "client
// seed:nonce:charge"), read as a fraction, is a no at or above that charge's survival chance. It's fixed before the player
// picks and no pillar can change it: the pillar picked only shows the answer.
async function drawSteps(seed, client, nonce, d) {
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const roll = async msg => parseInt(hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg))).slice(0, 13), 16) / 2 ** 52;
  const ns = Array.from({ length: d.steps }, (_, i) => i + 1), ks = Array.from({ length: cfg.pillars + 1 }, (_, k) => k);
  return { rolls: await Promise.all(ns.map(n => roll(`${client}:${nonce}:${n}`))), show: await Promise.all(ns.map(n => Promise.all(ks.map(k => roll(`${client}:${nonce}:${n}:show:${k}`))))) };
}
// What a charge shows with pillar k picked. The others are for show (Tornike: "some random 2 win and some random 3 loose"): one
// to three of them look overloaded at random and the rest look like winners, the same on a win and a loss. show[0] says how many
// and the other show rolls say which.
const rowAt = (show, k, hit) => {
  const [many, ...cells] = show, others = cells.map((u, j) => [u, j]).filter(o => o[1] !== k).sort((a, b) => a[0] - b[0]), row = cells.map(() => false);
  for (const [, j] of others.slice(0, 1 + Math.floor(many * 3))) row[j] = true;
  row[k] = hit; return row;
};
// The game commits first: the next round's server seed is drawn and hashed before the player sets a client seed or a
// bet. Seed and hash change together, and a round waits for them, so none starts on a seed whose hash wasn't shown.
let commit = null;
function rotateSeed() { const s = randHex(32); return (commit = sha256(s).then(h => { S.seed = s; S.hash = h; })); }

/* ---------- sound ---------- */
// Made live with Web Audio by ../shared/sound.js, the calm set every game shares (Tornike, 2026-10-27), so there are no
// files to load. Starts on the first tap or key; the HUD button mutes it. The background music (../shared/music.js)
// plays under it all, very low, and every sound ducks it a little.
const sound = BrainerSound(store, v => ({   // the neon lab in A minor: lock-on blips, an electric tink for the spark, a faster-wobbling coil
  place() { v.chatter([440, 523, 659], 0.08, 0.045); },   // the pad powers up, A-C-E
  pick() { v.beep(880, 0.05, 0.05); v.beep(1175, 0.06, 0.045, 0.06); },   // a pillar is chosen: a lock-on
  hum(ms) { const s = ms / 1000; v.servo(s, 0.035, 130, 290, 0, 36); v.chatter([440, 523, 587, 659], s * 0.23, 0.018, 0.05); },   // the pillar winding up: a whir with rising ticks
  zap() { v.ring(1047, 0.06, 0.03); },   // the spark: an electric tink
  fizz() { v.blips(0.22, 0.02, 0.02, 250, 800); },   // the pillars that were overloaded crackle faintly
  gear() { v.chirp(587, 1175, 0.08, 0.035, 0.15); v.beep(880, 0.09, 0.03, 0.25); },   // a part clicks on
  safe(n) { v.beep(v.step(n), 0.08, 0.045, 0.04); v.beep(v.step(n + 2), 0.1, 0.035, 0.13); },   // a two-tone beep one note higher for every safe charge
  look() { v.chatter([880, 659, 784, 1047, 1175], 0.07, 0.06, 0.15); },   // happy robot chatter
  overcharge() { v.servo(0.55, 0.05, 180, 470, 0, 36); v.ring(622, 0.18, 0.06, 0.58); v.steps(659, 165, 5, 0.6, 0.045, 0.72); },   // a rising whir, a darker tink, and the Brainer powers down
  cash() { v.chatter([440, 523, 659, 880], 0.08, 0.065); v.beep(1047, 0.16, 0.035, 0.34); }
}), 'multi-charge');

/* ---------- round flow ---------- */
const CHARGE_MS = reduced ? 700 : 1150, STRIKE = 0.62;   // the pillar feeds the battery for 62% of a charge, then it's decided
async function play() {
  if (!booted || live() || starting || sheetOpen()) return;
  const d = LEVELS[S.level];
  if (S.stake < cfg.minBet || S.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)}.`); return; }
  if (S.stake > S.balance) { toast('Not enough demo balance for this bet. Lower it or press Reset.'); return; }
  starting = true; renderControls();
  const r = { stake: S.stake, d, n: 0, rtp: cfg.rtp, reach: reachAt(d, S.stake), client: S.client, nonce: S.nonce++, status: 'ready', payout: 0, pick: -1, picks: [], forced: [] };   // the client seed in effect as it starts
  try { await commit; r.seed = S.seed; r.hash = S.hash; Object.assign(r, await drawSteps(r.seed, r.client, r.nonce, d)); }
  catch (e) { S.nonce--; toast(window.isSecureContext ? 'Could not start the round. Please try again.' : 'This demo needs https (or localhost) for its provably fair draw.'); return; }
  finally { starting = false; renderControls(); }
  S.balance = cents(S.balance - r.stake); round = r;
  sceneReset(performance.now()); sound.place(); sound.mood('round', 0);
  renderBalance(); renderControls(); renderBattery();
}
function charge(k) {   // charge from pillar k (0-4)
  const r = round;
  if (!r || r.status !== 'ready' || !(k >= 0 && k < cfg.pillars) || sheetOpen()) return;
  const now = performance.now(); let hit = r.rolls[r.n] >= r.d.safe[r.n];   // the charge's answer, as drawn
  if (TEST && window.chargeTest.next) { hit = window.chargeTest.next === 'boom'; r.forced[r.n] = true; window.chargeTest.next = null; }
  if (window.MaxMode && MaxMode.on) { hit = false; r.forced[r.n] = true; }   // Max Mode Test: this charge is safe
  r.status = 'charging'; r.t0 = now; r.struck = false; r.pick = k; r.picks[r.n] = k; r.hit = hit; r.row = rowAt(r.show[r.n], k, hit);
  sceneCharge(now, k); sound.pick(); sound.hum(CHARGE_MS * STRIKE);
  renderControls(); renderBattery();
}
function cashOut(auto) {
  const r = round;
  if (!r || r.status !== 'ready' || r.n < 1) return;
  const m = capAt(r.d, r.n, r.stake, r.rtp);
  r.payout = payAt(r, r.n); r.status = 'cashed'; r.auto = auto;   // auto: the game cashed out (last charge or max win), so no charge was skipped
  S.balance = cents(S.balance + r.payout);
  sceneCash(performance.now(), m); sound.cash(); sound.mood('idle');
  if (auto) toast(r.n >= r.d.steps ? 'Last charge done, so your win was cashed out automatically.' : `Max win of ${money(cfg.maxWin)} reached, so your win was cashed out automatically.`);
  settle();
}
function settle() {
  lastRound = round; earnCells(cfg.brain.perRound);
  rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); });
  renderBalance(); renderControls(); renderBattery();
}
function advance(now) {
  const r = round;
  if (!r || r.status !== 'charging') return;
  const p = (now - r.t0) / CHARGE_MS;
  if (!r.struck && p >= STRIKE) {
    r.struck = true;
    sceneReveal(now, r.row, r.pick);   // the picked pillar shows the answer and the others put on a show, as Plane Crash's bombs
    if (r.hit) {
      r.status = 'broken'; sceneBoom(now); sound.overcharge(); sound.dip();
      if (navigator.vibrate) navigator.vibrate(40);
      settle(); return;
    }
    const before = lookAt(r.n, r.reach); r.n++; const after = lookAt(r.n, r.reach);
    sceneSafe(now, after !== before ? after : 0); sound.zap(); sound.safe(r.n - 1); sound.mood('round', r.n / r.reach);
    r.popAt = now; renderBattery();
  }
  if (p >= 1) {
    r.status = 'ready'; r.pick = -1;
    if (r.n >= r.reach || r.stake * multAt(r.d, r.n, r.rtp) >= cfg.maxWin) { cashOut(true); return; }
    renderControls(); renderBattery();
  }
}

/* ---------- brain cells: still earned for the website's brain level, never shown here ---------- */
// The round's own LVL is the Brainer's growth here, as in Charge, so there is no brain level card. Each round played
// still adds the same brain cells, whatever the bet, shared with the other games.
function earnCells(k) {
  const saved = parseFloat(store.get('brainer.xp', ''));
  if (saved >= 0) S.cells = saved;   // another Brainer game open in another tab may have added cells since this one loaded
  S.cells = Math.round((S.cells + k) * 10) / 10;
  store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(brainLevel(S.cells)));   // the website reads brainer.level
}

/* ---------- the scene: the Blender lab, the live 3D Brainer on it (bot.js), and the pillars' power drawn in 2D ---------- */
// The picked pillar charges a battery that floats over the Brainer's head, never the Brainer itself. A safe charge tops
// the battery up and the Brainer cheers, growing into its next look or snapping on a piece of gear; an overloaded pillar
// overfills the battery until it pops in a puff of steam, and the Brainer gets dizzy, sits down and dozes off (Charge's
// polite bust: no lightning at the robot). As the charge is decided, every pillar lights up: red ones crackle, safe ones
// glow green, and only the picked one counts. Without WebGL Charge's Blender stills stand in for the 3D Brainer.
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, K = 1, OX = 0, OY = 0, last = 0;
const load = src => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; };
// On a slow line the picture comes first: a tiny preview of the set at once, the set itself, the Blender still of the
// Brainer; only then is the 3D Brainer asked for (three.js and the model, about 750 KB on the wire), and until it
// arrives the still stands on the pad. With Data Saver on it is never fetched and the stills play the game.
const SET = load('assets/set.webp'), PRE = load(SC.lqip);
SET.onload = () => { view.setT = performance.now(); };
const STILL = {};   // the Blender stills of the eleven looks, for while the 3D Brainer loads or where it can't run
const stillOf = look => STILL[look] || (STILL[look] = load(`assets/bot/${look}-ok.webp`));
const ready = im => im.complete && im.naturalWidth > 0;
function stillFor(look) {   // the look's still once it's in; until then the nearest look before it that is (a new look on a slow line)
  for (let k = look; k >= 1; k--) if (ready(stillOf(k))) { if (k !== look) stillOf(look); return k; }
  return 0;
}
const bot = () => window.ChargeBot && window.ChargeBot.ready ? window.ChargeBot : null;
const noBot = () => window.ChargeBotFailed || (window.ChargeBot && window.ChargeBot.failed);
let botAsked = false;
function askBot() {
  if (botAsked || !window.loadChargeBot) return;
  botAsked = true;
  if (navigator.connection && navigator.connection.saveData) { window.ChargeBotFailed = true; return; }
  window.loadChargeBot().catch(() => { window.ChargeBotFailed = true; });
}
// The part of the set that must always show: every pillar with its number over it, down to the pad's front ring
const VIEW = (() => {
  const p = SG.pillars;
  return { x0: Math.min(...p.map(q => q.toroid.cx - q.toroid.rx)) - 40, x1: Math.max(...p.map(q => q.toroid.cx + q.toroid.rx)) + 40,
    y0: Math.min(...p.map(q => tipOf(q)[1])) - 70, y1: SG.pad.cy + SG.pad.ry + 10 };
})();
// The picture is scaled to show VIEW as big as the room left by the readout and the ladder allows, centred in that room,
// and never smaller than the stage: on a short stage the readout may then overlap the sky over the pillars. The one
// exception is a tall phone, where filling the stage would push the outer pillars off its sides: there the five pillars
// set the size, the picture stands on the stage's foot, and draw() lets its ceiling fade up into the dark.
function layout() {
  const b = stage.getBoundingClientRect(); W = b.width; H = b.height; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  stage.classList.toggle('tight', H < 560);   // a short stage: a slimmer readout (style.css)
  const ro = $('#readout').getBoundingClientRect(), bat = $('#battery').getBoundingClientRect();
  let x0 = 0, x1 = W, y0 = ro.bottom - b.top + 4, y1 = H;
  if (bat.width > bat.height) y1 = bat.top - b.top - 4;   // the ladder lies along the stage's foot (phones)
  else x0 = bat.right - b.left + 4;
  const side = Math.max(x0, W - x1); x0 = side; x1 = W - side;   // the Brainer stays in the middle of the stage
  const kFit = Math.min((x1 - x0) / (VIEW.x1 - VIEW.x0), (y1 - y0) / (VIEW.y1 - VIEW.y0)), kCover = Math.max(W / SG.w, H / SG.h);
  const cxs = SG.pillars.map(q => q.base[0]), kWide = (W - 16) / (Math.max(...cxs) - Math.min(...cxs) + 200);   // 100: the half width of a pillar's foot in the render
  K = Math.min(Math.max(kCover, Math.min(kFit, 1.2)), kWide);
  OX = clamp((x0 + x1) / 2 - (VIEW.x0 + VIEW.x1) / 2 * K, W - SG.w * K, 0);
  view.badgeR = clamp(22 * K, 12, 20);
  const numbers = Math.min(...SG.pillars.map(q => tipOf(q)[1])) * K - 2 * view.badgeR - Math.max(8, 24 * K) - 4;   // the top of the pillars' numbers, at OY 0
  OY = clamp(Math.max((y0 + y1) / 2 - (VIEW.y0 + VIEW.y1) / 2 * K, y0 - numbers), H - SG.h * K, 0);   // when VIEW is taller than the room, its top (the numbers) stays under the readout
  renderBattery();
}
const P = (x, y) => [x * K + OX, y * K + OY];   // a point of the render, on the stage
const PC = (x, y) => P(x + SG.ox, y + SG.oy);   // a point of Charge's frame (the Brainer stills), on the stage
const view = { look: 1, gears: 0, chargeT0: 0, strikeT: 0, struckOk: false, boomT: 0, cashT: 0, parts: [], arcs: null, arcT: 0, bx: 0, by: 0, fill: 0, flash: null, nlT: 0, botIn: 0, setT: 0, pick: -1, hover: -1, reveal: null, headTop: 0, badgeR: 14 };
function banner(kind, text, gold) {   // NEW LOOK or GEAR UP, over the pad
  const el = $('#newlook'); el.querySelector('small').textContent = kind; $('#newlookName').textContent = text;
  el.classList.toggle('cape', !!gold); el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(view.nlT); view.nlT = setTimeout(() => { el.hidden = true; }, 1600);
}
function sceneReset(now) { view.look = 1; view.gears = 0; view.boomT = 0; view.cashT = 0; view.strikeT = 0; view.parts = []; view.pick = -1; view.reveal = null; const b = window.ChargeBot; if (b && b.ready) b.reset(now); }
function sceneCharge(now, k) { view.chargeT0 = now; view.strikeT = 0; view.pick = k; view.reveal = null; const b = bot(); if (b) b.charge(now, CHARGE_MS * STRIKE); }
function sceneReveal(now, row, pick) {
  view.reveal = { t: now, row, pick };
  const others = row.filter((x, k) => x && k !== pick).length;
  row.forEach((x, k) => {
    if (!x || k === pick) return;
    const p = SG.pillars[k], [cx, cy] = P(p.toroid.cx, p.toroid.cy);
    for (let i = 0; i < 6; i++) spark(cx, cy, 'steam', 0.45);
    for (let i = 0; i < 8; i++) spark(cx, cy, 'ember');
  });
  if (others) sound.fizz();
}
function sceneSafe(now, newLook) {
  view.strikeT = now; view.struckOk = true; flash(now, '220,250,255', 0.28, 200);
  const b = bot();
  if (!bot()) for (const k of [newLook || view.look, (newLook || view.look) + 1, (newLook || view.look) + 2]) if (k <= LOOKS.length) stillOf(k);   // the 3D Brainer isn't here yet: fetch the next stills ahead
  if (newLook) { view.look = newLook; banner('NEW LOOK', LOOKS[newLook - 1].name + (LOOKS[newLook - 1].acc ? ' · ' + LOOKS[newLook - 1].acc : ''), newLook === LOOKS.length); sound.look(); }
  else { sound.gear(); view.gears++; }
  if (b) { b.onGear = g => banner(g.name.startsWith('Gold') ? 'GEAR UPGRADE' : 'GEAR UP', g.name, g.name.startsWith('Gold')); b.win(now, newLook ? { look: newLook } : { gear: true }); }
  for (let i = 0; i < 22; i++) spark(view.bx, view.by + 14 * K, 'cyan');   // energy sprinkles from the battery onto the Brainer
}
function sceneBoom(now) { view.strikeT = now; view.struckOk = false; view.boomT = now; const b = bot(); if (b) b.boom(now); }
function sceneCash(now, m) { view.cashT = now; flash(now, '120,255,200', 0.22, 260); const b = bot(); if (b) b.cash(now); for (let i = 0; i < (m >= 10 ? 60 : 28); i++) spark(view.bx, view.by + 40 * K, 'gold'); }
function flash(now, col, a, ms) { if (!reduced) view.flash = { t: now, col, a, ms }; }
function spark(x, y, kind, size = 1) {   // cyan sprinkles on a safe charge, gold on a cash-out, steam and stars when the battery pops, embers off an overloaded pillar
  if (reduced) return;
  const up = kind === 'cyan' ? Math.PI / 2 : -Math.PI / 2, a = up + (Math.random() - 0.5) * (kind === 'cyan' ? 1.4 : kind === 'ember' ? 2.8 : 2.2), v = (kind === 'gold' ? 380 : kind === 'steam' ? 70 : kind === 'star' ? 260 : kind === 'ember' ? 200 : 160) * (0.4 + Math.random()) * K;
  view.parts.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: kind === 'steam' ? (1.4 + Math.random() * 0.8) * size : 0.6 + Math.random() * 0.6, r: (kind === 'steam' ? 14 + Math.random() * 14 : 4) * K * size });
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
const crownArc = (p, col, w) => {   // a wisp crawling from a pillar's terminal over its crown
  const r = p.toroid, ang = Math.random() * Math.PI * 2;
  return { pts: bolt(P(p.term[0], p.term[1]), P(r.cx + Math.cos(ang) * r.rx * 1.1, r.cy + Math.sin(ang) * r.ry * 1.4 + 6), 0.5, 4), col, w };
};
function makeArcs(phase, k) {   // the picked pillar winds up: wisps crawl over its crown, then stream into the battery; feed: a last bright burst into it
  const p = SG.pillars[k], T = P(p.term[0], p.term[1]), out = [crownArc(p, '140,235,255', 1.1), crownArc(p, '140,235,255', 1.1)];
  if (phase !== 'crawl') {
    const bw = 40 * K, mid = Math.abs(T[0] - view.bx) < 50 * K;   // the middle pillar stands right over the battery: it feeds its top
    for (let s = 0; s < 2; s++) {
      const end = mid ? [view.bx + (s ? 12 : -12) * K, view.by - 20 * K] : [view.bx + Math.sign(T[0] - view.bx) * bw, view.by + (s ? 7 : -7) * K];
      out.push({ pts: bolt(T, end, 0.3, 6), col: '120,230,255', w: phase === 'feed' ? 2.2 : 1.4 });
    }
  }
  return out;
}
function ellipseGlow(r, col, a, w) {
  if (a <= 0.01) return;
  const [x, y] = P(r.cx, r.cy);
  ctx.beginPath(); ctx.ellipse(x, y, r.rx * K, Math.max(0.6, r.ry * K), 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${0.25 * a})`; ctx.lineWidth = w * 4 * K; ctx.stroke();
  ctx.strokeStyle = `rgba(${col},${0.7 * a})`; ctx.lineWidth = w * 1.4 * K; ctx.stroke();
}
// what each pillar shows: its colour and how bright, its badge's state, from the hum while waiting to the reveal of a charge
function pillarState(k, now) {
  const r = round, charging = r && r.status === 'charging' && !r.struck && view.pick === k, rv = view.reveal;
  const rest = view.boomT ? clamp((now - view.boomT - 1200) / 3000, 0, 1) : 1, hum = (0.22 + 0.06 * Math.sin(now / 380 + k * 1.3)) * rest;
  const choosing = r && r.status === 'ready', hov = choosing && view.hover === k;
  if (rv) {
    const age = now - rv.t, held = r && r.status === 'broken' ? 0.4 : 0, f = Math.max(held, age < 300 ? 1 : age < 1500 ? 1 - (age - 300) / 1200 * 0.6 : Math.max(0, 0.4 - (age - 1500) / 600 * 0.4));
    if (f > 0.02) return { col: rv.row[k] ? '255,84,96' : '90,255,170', a: Math.max(hum, f * (k === rv.pick ? 1 : 0.85)), badge: rv.row[k] ? 'boom' : 'safe', wind: 0, crackle: rv.row[k] && age < 900 };
  }
  if (charging) { const wind = clamp((now - r.t0) / (CHARGE_MS * STRIKE), 0, 1); return { col: '85,230,255', a: Math.max(hum, wind * wind), badge: 'pick', wind }; }
  return { col: '85,230,255', a: hov ? Math.max(0.6, hum) : hum, badge: hov ? 'pick' : '', wind: 0 };
}
function badge(k, st, now) {   // the pillar's number over its terminal, as Plane Crash numbers its hoops
  const p = SG.pillars[k], [x, ty] = P(...tipOf(p)), R = view.badgeR, y = ty - R - Math.max(8, 24 * K);
  const fill = st.badge === 'boom' ? '#ff3448' : st.badge === 'safe' ? '#22c47a' : st.badge === 'pick' ? '#5a3ffc' : 'rgba(255,255,255,.94)';
  const pop = st.badge === 'pick' && !reduced ? 1 + 0.06 * Math.sin(now / 90) : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
  ctx.shadowColor = 'rgba(10,19,34,.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1.5, R * 0.12); ctx.strokeStyle = st.badge ? 'rgba(255,255,255,.95)' : 'rgba(90,63,252,.55)'; ctx.stroke();
  ctx.fillStyle = st.badge ? '#ffffff' : '#4b36fc'; ctx.font = `800 ${Math.round(R * 1.15)}px FiraGO, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(st.badge === 'boom' ? '!' : String(k + 1), 0, R * 0.06);
  ctx.restore();
}
// The battery over the Brainer's head: it fills with the round (a full one is the last charge the round can reach)
function drawBattery(now) {
  const r = round, reach = r ? r.reach : LEVELS[S.level].reach, n = r ? r.n : 0, charging = r && r.status === 'charging';
  let goal = n / reach, col = [85, 230, 255], s = 1, dx = 0, popped = false, dead = false;
  const sinceBoom = view.boomT ? now - view.boomT : -1;
  if (charging && !r.struck) goal = (n + clamp((now - r.t0) / (CHARGE_MS * STRIKE), 0, 1) * 0.8) / reach;   // topping up as the pillar feeds it
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
  ctx.fillStyle = '#0d1330'; ctx.fillRect(0, 0, W, H);
  const setA = SET.complete && SET.naturalWidth ? clamp((now - (view.setT || 0)) / 350, 0, 1) : 0;   // the full set fades in over its preview
  if (setA < 1 && PRE.complete && PRE.naturalWidth) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(PRE, OX, OY, SG.w * K, SG.h * K); }
  if (setA > 0) { ctx.globalAlpha = setA; ctx.drawImage(SET, OX, OY, SG.w * K, SG.h * K); ctx.globalAlpha = 1; }
  if (OY > 0) {   // a tall phone: the picture stops short of the stage's top, so its ceiling fades into the dark over it
    const fade = OY + 120 * K * 4, g = ctx.createLinearGradient(0, OY, 0, fade); g.addColorStop(0.05, '#0d1330'); g.addColorStop(1, 'rgba(13,19,48,0)'); ctx.fillStyle = g; ctx.fillRect(0, OY - 2, W, fade - OY + 2);
  }
  const charging = r && r.status === 'charging', p = charging ? (now - r.t0) / CHARGE_MS : 0, asleep = !!(r && r.status === 'broken');
  const wind = charging && !r.struck ? clamp(p / STRIKE, 0, 1) : 0, after = view.strikeT && view.struckOk ? Math.max(0, 1 - (now - view.strikeT) / 450) : 0;
  // the pillars' glow: all five hum while waiting; the picked one winds up ring by ring; then each shows what it was
  const states = SG.pillars.map((_, k) => pillarState(k, now));
  ctx.globalCompositeOperation = 'lighter';
  SG.pillars.forEach((pl, k) => {
    const st = states[k], a = k === view.pick && view.struckOk && after ? Math.max(st.a, after) : st.a;
    pl.rings.forEach((ring, i) => ellipseGlow(ring, st.col, a * (st.wind ? clamp(st.wind * 6 - i * 0.8, 0.25, 1) : 1), 1.2));
    ellipseGlow(pl.toroid, st.col, a * 0.55, 1);
  });
  const cashGlow = view.cashT ? Math.max(0, 1 - (now - view.cashT) / 1400) : 0;
  const pulse = asleep ? (0.18 + 0.08 * Math.sin(now / 900)) : 0.35 + 0.15 * Math.sin(now / 520) + wind * 0.65 + after * 0.6;
  const padCol = cashGlow ? '90,255,170' : asleep ? '255,181,71' : '85,230,255';
  ellipseGlow(SG.pad, padCol, Math.max(pulse, cashGlow), 1.6); ellipseGlow(SG.pad2, padCol, Math.max(pulse * 0.8, cashGlow), 1.2);
  ctx.globalCompositeOperation = 'source-over';
  // the Brainer: live in 3D; the Blender still of its look until the 3D arrives (or where it can't run), then a crossfade
  const b = bot();
  if (b && !view.botIn) { view.botIn = now; b.sync(now, view.look, view.gears, asleep); }   // it takes over already in this round's look and gear
  const f = b ? b.frame(now, dt, K, OX + SG.ox * K, OY + SG.oy * K, Math.min(DPR, 1.75)) : null, fadeIn = f ? clamp((now - view.botIn) / 450, 0, 1) : 0;
  let top;
  if (fadeIn < 1) {
    const look = stillFor(view.look) || view.look, s = SC.sprites[`${look}-ok`], im = stillOf(look);
    if (s && ready(im)) {
      const bob = reduced ? 0 : Math.sin(now / 640) * 2.2 * K, [sx, sy] = PC(s.x, s.y);
      ctx.save(); if (asleep) ctx.filter = 'grayscale(.5) brightness(.85)'; ctx.drawImage(im, sx, sy + bob, s.w * K, s.h * K); ctx.restore();
    }
    const a = s ? s.a : SC.sprites['1-ok'].a; top = PC(a.head[0], a.head[1] - 150);
  }
  if (f) { ctx.globalAlpha = fadeIn; ctx.drawImage(f.canvas, f.x, f.y, f.w, f.h); ctx.globalAlpha = 1; top = f.a.top; }
  view.headTop = top[1];
  // the battery floats over its head; a tall Brainer would push it into the multiplier, so then it moves beside the head
  if (now - (view.measT || 0) > 400) { view.measT = now; const rb = $('#readout').getBoundingClientRect(), sb = stage.getBoundingClientRect(); view.minY = rb.bottom - sb.top + 34 * Math.max(K, 0.6); }
  const bh = 34 * K * Math.max(1.35, 0.9 / K);   // the battery's height: on a small stage it keeps a size that reads, so it floats higher to clear the head
  let tx = top[0], ty = top[1] - Math.max(46 * K, bh / 2 + 10);
  if (ty < view.minY) { const bw = 76 * K * Math.max(1.35, 0.9 / K); ty = Math.max(view.minY, top[1] + 40 * K); tx = top[0] - 145 * K - bw / 2 - 6; }
  if (!view.bx) { view.bx = tx; view.by = ty; }
  view.bx += (tx - view.bx) * Math.min(1, dt / 90); view.by += (ty - view.by) * Math.min(1, dt / 90);
  // the picked pillar feeds the battery: wisps on its crown first, then streams into it; overloaded pillars crackle red
  ctx.globalCompositeOperation = 'lighter';
  let phase = '';
  if (charging && !r.struck) phase = p < STRIKE * 0.35 ? 'crawl' : 'stream';
  else if (view.strikeT && view.struckOk && now - view.strikeT < 220) phase = 'feed';
  if (phase && view.pick >= 0) {
    if (!view.arcs || view.arcs.phase !== phase || now - view.arcT > 70) { view.arcs = makeArcs(phase, view.pick); view.arcs.phase = phase; view.arcT = now; }
    const a = phase === 'feed' ? 1 - (now - view.strikeT) / 220 * 0.6 : 0.35 + 0.65 * wind;
    for (const bo of view.arcs) strokeBolt(bo.pts, bo.col, bo.w * K, a);
  } else view.arcs = null;
  if (!reduced) states.forEach((st, k) => { if (st.crackle && Math.random() < 0.7) strokeBolt(crownArc(SG.pillars[k], '255,96,96', 1).pts, '255,96,96', K, 0.8); });
  ctx.globalCompositeOperation = 'source-over';
  states.forEach((st, k) => badge(k, st, now));
  drawBattery(now);
  // sprinkles, sparkles, steam, embers and stars
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
    const col = q.kind === 'gold' ? '255,214,107' : q.kind === 'ember' ? '255,140,90' : '140,235,255';
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
    ctx.strokeStyle = `rgba(${col},${fade})`; ctx.lineWidth = (q.kind === 'gold' ? 3 : 2) * Math.max(0.6, K); ctx.lineCap = 'round'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (view.flash) { const q = (now - view.flash.t) / view.flash.ms; if (q >= 1) view.flash = null; else { ctx.fillStyle = `rgba(${view.flash.col},${view.flash.a * (1 - q)})`; ctx.fillRect(0, 0, W, H); } }
}
function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (!botAsked && ((SET.complete && stillOf(1).complete) || now - bootT > 12000)) askBot();   // after the picture; or anyway if a picture stalls
  if (W && H) { advance(now); draw(now, dt); updateUI(now); }
  requestAnimationFrame(loop);
}
// Which pillar is under a point of the stage: its crown and number, and its column down to its base. The middle one
// stands behind the Brainer, so only what shows over the Brainer's head counts for it.
function pillarAt(e) {
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  let best = -1, bd = Infinity;
  SG.pillars.forEach((p, k) => {
    const [cx, ty] = P(...tipOf(p)), hw = Math.max(24, (p.toroid.rx + 16) * K), top = ty - view.badgeR * 2 - Math.max(8, 24 * K) - 8;
    let bot = P(p.base[0], p.base[1])[1];
    if (k === 2 && view.headTop) bot = Math.min(bot, view.headTop - 30 * K);
    const d = Math.abs(x - cx);
    if (d < hw && y > top && y < bot && d < bd) { bd = d; best = k; }
  });
  return best;
}

/* ---------- readout, battery and controls ---------- */
const cache = {};
const put = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = document.getElementById(id); if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else if (prop === 'hidden') el.hidden = v; else el.setAttribute(prop, v); };
function updateUI(now) {
  const r = round, d = r ? r.d : LEVELS[S.level];
  let lvl = 'LVL 1', name = '', lvlCls = 'lvl', big, bigCls = 'mult', sub = '', subCls = 'sub';
  if (!r || (!live() && starting)) { lvl = d.name; name = `up to ${fxShort(topOf(d))} at ${money(S.stake)}`; big = ''; bigCls = 'mult idle'; }
  else {
    const cur = capAt(r.d, r.n, r.stake, r.rtp);
    lvl = `LVL ${r.n + 1}`; name = ''; big = fx(cur);   // no look names in play, as in Charge (Tornike, 2026-10-27)
    if (r.status === 'ready') { const nx = capAt(r.d, r.n + 1, r.stake, r.rtp); sub = r.n < r.reach ? `Pick a pillar · next ${fx(nx)} · ${pct(r.d.safe[r.n])} safe` : ''; }
    else if (r.status === 'charging') sub = r.struck ? `Pillar ${r.pick + 1} was safe!` : `Pillar ${r.pick + 1} · charging…`;
    else if (r.status === 'broken') { lvl = 'OVERCHARGED'; lvlCls = 'lvl bust'; name = `at LVL ${r.n + 1}`; big = 'Battery flat'; bigCls = 'mult bust'; sub = `Pillar ${r.pick + 1} was overloaded · −${money(r.stake)}`; subCls = 'sub bad'; }
    else { lvlCls = 'lvl won'; big = fx(cur); bigCls = cur >= 10 ? 'mult win gold' : 'mult win'; sub = `Cashed out: you won ${money(r.payout)}`; subCls = 'sub ok'; }
  }
  if (r && r.popAt && now - r.popAt < 400 && r.status !== 'broken') bigCls += ' pop';
  put('lvlN', 'text', lvl); put('lookName', 'text', name); put('lvlPill', 'class', lvlCls);
  put('mult', 'text', big); put('mult', 'class', bigCls); put('sub', 'text', sub || ' '); put('sub', 'class', subCls + (sub ? '' : ' off'));   // an empty line keeps its place, so the readout never changes height
  if (r && live()) put('cashSub', 'text', r.n < 1 ? 'after the first charge' : money(payAt(r, r.n)));
}
const pct = v => (Math.round(v * 1000) / 10).toLocaleString('en-US') + '%';
// Play, the pillars and Cash out go inert with aria-disabled, not disabled: Chrome drops focus from a disabled button (and
// from a hidden one), so keyboard and screen-reader players would lose their place every round. play(), charge() and
// cashOut() ignore presses they cannot take.
function renderControls() {
  const lv = live(), r = round, from = $(lv ? '#setup' : '#pick'), had = !from.hidden && from.contains(document.activeElement);   // focus in the panel about to hide
  $('#setup').hidden = lv; $('#pick').hidden = !lv;
  $('#goL2').textContent = starting ? 'Powering up…' : `${money(S.stake)} · ${LEVELS[S.level].name}`;
  $('#go').setAttribute('aria-disabled', String(starting));
  document.querySelectorAll('#pillars button').forEach((b, k) => { b.setAttribute('aria-disabled', String(!r || r.status !== 'ready')); b.setAttribute('aria-pressed', String(!!r && lv && r.pick === k)); });
  $('#cash').setAttribute('aria-disabled', String(!lv || r.status !== 'ready' || r.n < 1));
  if (had) { $(lv ? '#pillars button' : '#go').focus({ preventScroll: true }); ptrFocus = true; }   // to the first pillar as a round starts, to Play as it ends; moved by the game, so Space stays the game's
}
function renderLevels() {   // built once; after that the pressed one moves and the tops follow the bet, so focus stays on the button
  const bs = document.querySelectorAll('#levels button[data-l]');
  if (bs.length === LEVELS.length) { bs.forEach(b => { b.setAttribute('aria-pressed', String(+b.dataset.l === S.level)); b.querySelector('span').textContent = `up to ${fxShort(topOf(LEVELS[+b.dataset.l]))}`; }); return; }
  $('#levels').innerHTML = LEVELS.map((d, i) => `<button type="button" data-l="${i}" aria-pressed="${i === S.level}"><b>${d.name}</b><span>up to ${fxShort(topOf(d))}</span></button>`).join('');
}
function renderPillars() {   // a little pillar and its number on each button, as the scene numbers them
  const icon = '<svg viewBox="0 0 24 28" width="20" height="24" aria-hidden="true"><circle cx="12" cy="2.6" r="2" fill="currentColor"/><ellipse cx="12" cy="7" rx="9.5" ry="2.8" fill="currentColor"/><rect x="10.2" y="9.4" width="3.6" height="13" rx="1" fill="currentColor" opacity=".85"/><path d="M8.2 12.6h7.6M8.2 16.2h7.6M8.2 19.8h7.6" stroke="#55e6ff" stroke-width="1.6" stroke-linecap="round"/><rect x="6.5" y="22.2" width="11" height="4" rx="1.2" fill="currentColor"/></svg>';
  $('#pillars').innerHTML = PILLARS.map((nm, k) => `<button type="button" data-p="${k}" aria-label="Pillar ${k + 1}, ${nm}"><span class="n">${icon}${k + 1}</span><span class="nm">${nm}</span></button>`).join('');
}
function renderBattery() {
  const r = round, d = r ? r.d : LEVELS[S.level], stake = r ? r.stake : S.stake, reach = r ? r.reach : reachAt(d, S.stake), n = r ? r.n : 0, st = r ? r.status : '';
  const rows = [];
  for (let i = 0; i <= reach; i++) {
    const lk = lookAt(i, reach), newLook = i === 0 || lk !== lookAt(i - 1, reach);
    let cls = 'cell', extra = '';
    if (r && i < n) cls += ' done';
    if (i === n) cls += !r ? ' now' : st === 'cashed' ? ' won' : ' now';
    if (r && i === n + 1 && st === 'broken') cls += ' boom';
    if (i === n + 1 && (!r || st === 'ready' || st === 'charging')) { cls += ' next'; extra = `<span class="safe">${pct(d.safe[n])} safe</span>`; }
    rows.push(`<div class="${cls}" role="listitem" aria-label="Level ${i + 1}: ${fx(capAt(d, i, stake))}${newLook ? `, ${LOOKS[lk - 1].name} look` : ''}">LVL ${i + 1}${extra}<b>${fxShort(capAt(d, i, stake))}</b>${newLook ? `<img src="${lookImg(lk)}" alt="" loading="lazy" decoding="async">` : ''}</div>`);
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
  if (r) h += `<h4>Last round: ${r.d.name}, ${r.status === 'broken' ? `pillar ${r.pick + 1} overloaded on charge ${r.n + 1}` : `cashed out at ${fx(capAt(r.d, r.n, r.stake, r.rtp))}`}</h4>`
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
  const { rolls, show } = await drawSteps(r.seed, r.client, r.nonce, r.d);
  const played = r.status === 'broken' ? r.n + 1 : r.n, shown = Math.min(r.d.steps, r.status === 'cashed' && !r.auto ? played + 1 : played);   // after the player's own cash-out, also show the charge they skipped
  const rollsOk = JSON.stringify([rolls, show]) === JSON.stringify([r.rolls, r.show]) && rolls.slice(0, played).every((u, i) => r.forced[i] || (u >= r.d.safe[i]) === (r.status === 'broken' && i === r.n));
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  const rows = Array.from({ length: shown }, (_, i) => {
    const u = rolls[i], no = u >= r.d.safe[i], row = r.picks[i] != null ? rowAt(show[i], r.picks[i], r.status === 'broken' && i === r.n) : Array(cfg.pillars).fill(false);
    const say = `Charge ${i + 1}${i >= played ? ', skipped by cashing out' : ''}: roll ${u.toFixed(4)}, ${no ? 'no' : 'yes'}${r.picks[i] != null ? `; you picked pillar ${r.picks[i] + 1}` : ''}${r.forced[i] ? ' (forced in test mode)' : ''}`;   // each row also reads out in words: the colours alone tell a screen reader nothing
    return `<div class="frow${no ? ' no' : ''}${i >= played ? ' next' : ''}" role="img" aria-label="${say}"><span class="st">${i + 1}</span>`
      + row.map((x, k) => `<i class="${x ? 'boom' : ''}${r.picks[i] === k ? ' pick' : ''}"></i>`).join('') + `<span class="roll">${u.toFixed(4)}</span><span class="ans">${no ? 'No' : 'Yes'}</span><span class="res">${r.forced[i] ? 'test' : ''}</span></div>`;
  }).join('');
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before the round' : 'The seed does not match the hash')
    + ok(rollsOk, rollsOk ? 'Answers recomputed from the seeds match your round' : 'Recomputed answers differ from the round')
    + `<div class="fgrid" role="group" aria-label="Yes or no at each charge">${rows}</div>`
    + `<p class="sheet-note">Yes: the charge was safe. No: your pillar overloaded. White ring: the pillar you picked. Red on the other pillars is for show and changed nothing.${shown > played ? ' The faded row is the next charge you skipped by cashing out.' : ''}</p>`;
}

/* ---------- sheets: fairness and how to play ---------- */
const sheetOpen = () => !$('#tutorial').hidden || !$('#agegate').hidden || !$('#fairSheet').hidden;
let lastFocus = null;
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; const card = $(id).querySelector('.sheet-card'), f = id === '#agegate' ? card : $(id).querySelector('button[aria-pressed=true], button'); if (card) card.tabIndex = -1; if (f) f.focus({ preventScroll: true }); }   // no scroll: inside the website's frame it would scroll the parent page
function closeSheet(id) { $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
$('#help').addEventListener('click', () => openSheet('#tutorial'));
$('#fair').addEventListener('click', () => { renderFair(); openSheet('#fairSheet'); });
$('#fairClose').addEventListener('click', () => closeSheet('#fairSheet'));
$('#fairBody').addEventListener('click', e => { if (e.target.closest('#fairCheck')) checkFair(); if (e.target.closest('#seedNew') && !live()) { $('#seedIn').value = randHex(8); setClient($('#seedIn').value); } });
$('#fairBody').addEventListener('input', e => { if (e.target.id === 'seedIn') setClient(e.target.value); });
$('#fairBody').addEventListener('change', e => { if (e.target.id === 'seedIn' && setClient(e.target.value)) e.target.value = S.client; });
$('#tutGo').addEventListener('click', () => { store.set('brainer.mc.tutorial', 'seen'); closeSheet('#tutorial'); });
// 18+ check, shared with the website (same key), so a visitor who confirmed there is not asked again
$('#ageYes').addEventListener('click', () => { store.set('brainer.age-ok', '1'); closeSheet('#agegate'); if (store.get('brainer.mc.tutorial', '') !== 'seen') openSheet('#tutorial'); });
$('#ageNo').addEventListener('click', () => { $('#ageSorry').hidden = false; $('.age-actions').hidden = true; });
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s && s.id !== 'agegate') { if (s.id === 'tutorial') store.set('brainer.mc.tutorial', 'seen'); closeSheet('#' + s.id); } }));

/* ---------- input ---------- */
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
function setStake(v) { if (live()) return; S.stake = clampStake(v); $('#amt').value = S.stake.toFixed(2); renderControls(); renderLevels(); renderBattery(); }
$('#amt').addEventListener('change', () => setStake(parseFloat($('#amt').value)));
$('#dec').addEventListener('click', () => setStake(S.stake - (S.stake > 10 ? 1 : 0.5)));
$('#inc').addEventListener('click', () => setStake(S.stake + (S.stake >= 10 ? 1 : 0.5)));
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || live()) return; const c = b.dataset.chip; setStake(c === 'min' ? cfg.minBet : c === 'max' ? Math.min(cfg.maxBet, Math.floor(S.balance * 100 + 1e-6) / 100) : c === 'half' ? S.stake / 2 : S.stake * 2); });
$('#levels').addEventListener('click', e => {
  const b = e.target.closest('button[data-l]'); if (!b || live()) return;
  S.level = +b.dataset.l; store.set('brainer.mc.level', String(S.level)); renderLevels(); renderControls();
  if (round && !live()) { round = null; sceneReset(performance.now()); sound.mood('idle'); }   // the last result clears: the baby is back on the pad
  renderBattery();
});
$('#go').addEventListener('click', play);
$('#pillars').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) { charge(+b.dataset.p); ptrFocus = true; } });   // focus stays on a picked pillar, which leaves Space to the game: Space cashes out, never charges that pillar again
for (const ev of ['pointerover', 'focusin']) $('#pillars').addEventListener(ev, e => { const b = e.target.closest('button[data-p]'); view.hover = b ? +b.dataset.p : -1; });
for (const ev of ['pointerleave', 'focusout']) $('#pillars').addEventListener(ev, () => { view.hover = -1; });
$('#cash').addEventListener('click', () => cashOut(false));
$('#sound').addEventListener('click', () => { sound.toggle(); renderSound(); });
$('#refill').addEventListener('click', () => { if (live()) { toast('Finish this round first.'); return; } S.balance = cfg.startBalance; renderBalance(); toast(`Demo balance reset to ${money(cfg.startBalance)}.`); });
cv.addEventListener('pointermove', e => { view.hover = round && round.status === 'ready' ? pillarAt(e) : -1; cv.style.cursor = view.hover >= 0 ? 'pointer' : ''; });
cv.addEventListener('pointerleave', () => { view.hover = -1; });
cv.addEventListener('click', e => { if (round && round.status === 'ready') { const k = pillarAt(e); if (k >= 0) charge(k); } });   // a tap on a pillar charges from it
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {   // Tab stays inside the open sheet (the last one in the page is on top)
    const s = [...document.querySelectorAll('.sheet')].filter(x => !x.hidden).pop();
    if (s) { const f = [...s.querySelectorAll('button, input')].filter(b => !b.disabled && b.getClientRects().length), i = f.indexOf(document.activeElement); if (!f.length) e.preventDefault(); else if (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus({ preventScroll: true }); } }
    return;
  }
  if (e.key === 'Escape') { for (const id of ['#fairSheet', '#tutorial']) if (!$(id).hidden) { if (id === '#tutorial') store.set('brainer.mc.tutorial', 'seen'); closeSheet(id); } return; }
  if (!booted) { if (e.code === 'Space') e.preventDefault(); return; }   // no game keys under the intro (the 18+ check comes first)
  if (sheetOpen()) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts stay theirs
  const dk = /^(?:Digit|Numpad)([1-5])$/.exec(e.code) || /^([1-5])$/.exec(e.key);   // by the key's place first, so AZERTY's number row works too, as in Plane Crash
  if (dk) { if (!e.repeat) charge(+dk[1] - 1); return; }   // a held key never charges again by itself
  if (e.repeat) return;
  if (e.code === 'KeyC') { cashOut(false); return; }   // by the key's place, so it works on Georgian and other layouts
  if (e.code !== 'Space' || (tag === 'BUTTON' && !ptrFocus)) return;   // a button reached with Tab takes Space itself; one just clicked does not
  e.preventDefault();
  if (live()) cashOut(false); else play();   // Space plays, and in a round cashes out, as it jumps in Plane Crash
});

/* ---------- boot ---------- */
let ptrFocus = false;   // focus last moved by a click, not by Tab
document.addEventListener('pointerdown', () => { ptrFocus = true; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Tab') ptrFocus = false; }, true);
window.addEventListener('resize', layout);
if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
if (document.fonts) document.fonts.ready.then(layout);   // the readout's height, which the scene sits under, changes with the font
S.level = clamp(parseInt(store.get('brainer.mc.level', '1'), 10) || 0, 0, LEVELS.length - 1);
S.client = randHex(8);
rotateSeed().catch(() => {});   // without crypto.subtle (plain http) Play says why instead
setStake(S.stake); renderLevels(); renderPillars(); renderBalance(); renderControls(); renderSound(); layout(); renderBattery();
const bootT = performance.now();
// The intro waits for what the game needs to be seen: the set, the first still and the fonts; then up to 2.5 s more
// for the 3D Brainer, which takes over from the still whenever it arrives. A slow line never holds the player past 9 s:
// the game starts on the set's preview and the still comes in a moment later.
function loadProgress() {
  const now = performance.now();
  if (now - bootT > 9000) return 1;
  const font = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0, need = (SET.complete ? 1 : 0) + (stillOf(1).complete ? 1 : 0) + font;
  if (need < 3) return need / 3 * 0.8;
  if (!view.needT) view.needT = now;
  if (view.needT - bootT > 3000) return 1;   // a slow line: no waiting for the 3D Brainer, the still plays until it comes
  return bot() || noBot() ? 1 : Math.min(1, 0.8 + 0.2 * (now - view.needT) / 2500);
}
$('.brand .t1').textContent = 'Multi Charge';
for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, () => sound.wake(), true);
if ($('#boot')) $('#boot').remove();   // the page's own loading screen hands over to the intro
(window.BrainerIntro ? window.BrainerIntro.start({ title: 'Multi Charge', mark: 'MULTI CHARGE', theme: 'plane', what: 'the charging pillars', progress: loadProgress, logo: 'assets/visor.svg', fallback: 'assets/look/1-lg.webp' }) : Promise.resolve()).then(() => {   // the intro shows the baby every round starts with
  booted = true;
  if (store.get('brainer.age-ok', '') !== '1') openSheet('#agegate');
  else if (store.get('brainer.mc.tutorial', '') !== 'seen') openSheet('#tutorial');
});
requestAnimationFrame(loop);
})();
