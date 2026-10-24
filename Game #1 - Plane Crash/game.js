(() => {
'use strict';
const $ = s => document.querySelector(s);
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => m.toFixed(2) + '×';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

/* ---------- config & state ---------- */
const cfg = {
  rtp: 96,
  diffs: [
    { key: 'easy', name: 'Easy', short: 'E', paths: 5, safe: 4, max: 12 },
    { key: 'medium', name: 'Medium', short: 'M', paths: 5, safe: 3, max: 10 },
    { key: 'hard', name: 'Hard', short: 'H', paths: 4, safe: 2, max: 9 },
    { key: 'extreme', name: 'Extreme', short: 'X', paths: 5, safe: 1, max: 5 }
  ],
  fallback: 'land', minBet: 0.1, maxBet: 500, maxWin: 25000,
  betSec: 8, takeoffSec: 2.6, decSec: 6, resolveSec: 1.7, cruiseSec: 1.1, resultSec: 4.5
};
const DOC = [{ p: 0.8, lo: 1.15, hi: 1.35 }, { p: 0.6, lo: 1.3, hi: 1.7 }, { p: 0.5, lo: 1.6, hi: 2.4 }, { p: 0.2, lo: 2.5, hi: 5 }];
const pOf = d => d.safe / d.paths;
const ladder = (d, n, rtp) => n <= 0 ? 1 : Math.floor((rtp || cfg.rtp) / 100 / Math.pow(pOf(d), n) * 100 + 1e-7) / 100;
const S = { balance: 1000, nonce: 1, roundId: 5120, rounds: [], mine: [] };

let R = null, nextP = null, phase = 'init', t0 = 0, step = 0, winMs = 0, busy = false, bots = [];
const me = { stake: 10, diff: 1, autoLand: false, autoN: 3, autoBet: false, queued: false, run: null };
const FLY = ['takeoff', 'deciding', 'chosen', 'flying'];
const isFlying = e => e && FLY.includes(e.status);

/* ---------- crypto ---------- */
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function layoutFrom(h, n, safe) {
  const idx = [...Array(n).keys()];
  for (let i = n - 1, c = 0; i > 0; i--, c++) { const u = parseInt(h.slice(c * 8, c * 8 + 8), 16) / 2 ** 32, j = Math.floor(u * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const out = Array(n).fill(false); for (let k = 0; k < safe; k++) out[idx[k]] = true; return out;
}
async function layoutsFor(seed, nonce, d) {
  const hs = await Promise.all(Array.from({ length: d.max }, (_, i) => hmac(seed, `route:${nonce}:${d.key}:${i + 1}`)));
  return [null].concat(hs.map(h => layoutFrom(h, d.paths, d.safe)));
}
async function drawRound() {
  const serverSeed = randHex(32), nonce = S.nonce++, diffs = cfg.diffs.map(d => Object.assign({}, d)), rtp = cfg.rtp;
  const hash = await sha256(serverSeed), layouts = {};
  await Promise.all(diffs.map(async d => { layouts[d.key] = await layoutsFor(serverSeed, nonce, d); }));
  return { id: S.roundId++, serverSeed, hash, nonce, diffs, rtp, layouts, maxStep: Math.max(...diffs.map(d => d.max)), steps: 0 };
}

/* ---------- bots ---------- */
const LET = 'abcdefghjkmnprstvwz';
const pick = a => a[Math.floor(Math.random() * a.length)];
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
function makeBots() {
  const n = 16 + Math.floor(Math.random() * 22), out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.random(), di = u < 0.35 ? 0 : u < 0.7 ? 1 : u < 0.9 ? 2 : 3, d = R.diffs[di];
    let stake = clamp(Math.exp(1.5 + gauss() * 1.2), 0.5, 1500); stake = stake > 10 ? Math.round(stake) : Math.round(stake * 2) / 2;
    const autoN = 1 + Math.floor(Math.random() * [6, 4, 3, 2][di]);
    out.push({ name: pick(LET) + '***' + pick(LET) + Math.floor(Math.random() * 10), stake, di, d, autoN: Math.min(autoN, d.max), n: 0, mult: 1, status: 'confirmed', choice: null, chooseAt: 1, payout: 0, joinAt: Math.random() * 0.85 });
  }
  return out;
}

/* ---------- betting ---------- */
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
function setStake(v) { me.stake = clampStake(v); $('#amt').value = me.stake.toFixed(2); }
function setAutoBet(on) { me.autoBet = on; $('#ab').checked = on; }
function validStake() {
  if (me.stake < cfg.minBet || me.stake > cfg.maxBet) { toast(`Stake must be between ${fmt(cfg.minBet)} and ${fmt(cfg.maxBet)} FUN.`); return false; }
  if (me.stake > S.balance) { toast('Not enough balance for this stake. Lower it or reset the demo balance.'); return false; }
  return true;
}
function place() {
  if (!validStake()) { setAutoBet(false); return false; }
  S.balance -= me.stake;
  me.run = { id: R.id, stake: me.stake, di: me.diff, d: R.diffs[me.diff], n: 0, mult: 1, status: 'confirmed', choice: null, payout: 0, you: true, name: 'You' };
  me.queued = false; renderBalance(); renderList(); renderLadder(); return true;
}
function onGo() {
  const r = me.run;
  if (phase === 'betting') { if (r) { S.balance += r.stake; me.run = null; setAutoBet(false); renderBalance(); renderLadder(); } else place(); }
  else if (isFlying(r)) return;
  else if (me.queued) { me.queued = false; setAutoBet(false); }
  else if (validStake()) me.queued = true;
  renderList();
}
function canLand(r) { return isFlying(r) && r.n >= 1 && (phase === 'cruise' || (phase === 'decide' && r.choice == null)); }
function land(e, now) {
  e.payout = Math.min(e.stake * e.mult, cfg.maxWin); e.status = 'landed';
  if (e.you) {
    S.balance += e.payout;
    S.mine.unshift({ round: e.id, diff: e.d.name, short: e.d.short, stake: e.stake, n: e.n, mult: e.mult, payout: e.payout });
    plane.state = 'landing'; plane.t = now || performance.now();
    floats.push({ text: '+' + fmt(e.payout - e.stake), x: 0.5, y: 0.55, t0: plane.t, col: '#3FD17A' });
    renderBalance(); renderMine(); renderHistory();
  }
}
function choose(i) {
  const r = me.run;
  if (phase !== 'decide' || !r || r.status !== 'deciding' || i < 0 || i >= r.d.paths) return;
  r.choice = i; r.status = 'chosen'; renderRoutes(); renderList();
}

/* ---------- round flow ---------- */
async function startBetting() {
  R = await (nextP || drawRound()); nextP = null;
  phase = 'betting'; t0 = performance.now(); step = 0;
  me.run = null; bots = makeBots();
  if (me.queued || me.autoBet) { me.queued = false; place(); }
  plane.state = 'parked'; world.camX = 0; gates = null;
  $('#banner').hidden = true;
  renderFair(); renderList(); renderLadder(); showPanels();
}
function startTakeoff(now) {
  phase = 'takeoff'; t0 = now;
  bots.forEach(b => { b.status = 'takeoff'; });
  if (me.run) me.run.status = 'takeoff'; else plane.state = 'gone';
  if (me.run) plane.state = 'takeoff';
  renderList(); showPanels();
}
function startDecide(now) {
  phase = 'decide'; t0 = now; step++; R.steps = step;
  for (const b of bots) {
    if (!isFlying(b)) continue;
    if (b.n >= b.autoN) { land(b); continue; }
    b.status = 'deciding'; b.choice = null; b.chooseAt = 0.15 + Math.random() * 0.75;
  }
  const r = me.run;
  if (isFlying(r)) { r.status = 'deciding'; r.choice = null; }
  winMs = (isFlying(r) ? cfg.decSec : 1.8) * 1000;
  const d = (r && r.d) || R.diffs[me.diff];
  gates = { d, n: d.paths, xs: Array.from({ length: d.paths }, (_, i) => (i - (d.paths - 1) / 2) * GATE_SP), safe: null };
  renderRoutes(); renderList(); showPanels();
}
function startResolve(now) {
  phase = 'resolve'; t0 = now;
  const lay = R.layouts;
  const settle = e => {
    if (!isFlying(e)) return;
    if (e.choice == null) {
      if (e.you && cfg.fallback === 'land' && e.n >= 1) { land(e, now); toast('Time ran out, so you landed automatically.'); return; }
      e.choice = Math.floor(Math.random() * e.d.paths);
      if (e.you) toast(`Time ran out, so route ${e.choice + 1} was picked for you.`);
    }
    if (lay[e.d.key][step][e.choice]) { e.n++; e.mult = ladder(e.d, e.n, R.rtp); e.status = 'flying'; e.passed = true; }
    else { e.status = 'crashed'; e.passed = false; e.crashedAt = step; }
  };
  bots.forEach(settle); settle(me.run);
  const r = me.run;
  if (r && r.status === 'crashed' && r.crashedAt === step) S.mine.unshift({ round: r.id, diff: r.d.name, short: r.d.short, stake: r.stake, n: r.n, mult: 0, payout: 0, crashedAt: step });
  gates.safe = lay[gates.d.key][step];
  renderRoutes(); renderList(); renderLadder(); renderMine();
}
function afterResolve(now) {
  const r = me.run;
  if (r && r.status === 'flying') {
    if (r.n >= r.d.max || r.stake * r.mult >= cfg.maxWin || (me.autoLand && r.n >= me.autoN)) land(r, now);
  }
  for (const b of bots) if (b.status === 'flying' && (b.n >= b.d.max || b.stake * b.mult >= cfg.maxWin)) land(b);
  gates = null;
  world.recenter();
  const anyone = bots.some(isFlying) || isFlying(r);
  if (!anyone || step >= R.maxStep) finish(now);
  else { phase = 'cruise'; t0 = now; }
  renderList(); renderHistory(); showPanels();
}
function finish(now) {
  phase = 'result'; t0 = now;
  for (const b of bots) if (isFlying(b)) land(b);
  if (isFlying(me.run)) land(me.run, now);
  S.rounds.unshift(R); if (S.rounds.length > 60) S.rounds.length = 60;
  if (S.mine.length > 200) S.mine.length = 200;
  const all = bots.concat(me.run ? [me.run] : []), landed = all.filter(e => e.status === 'landed');
  $('#bLanded').textContent = landed.length; $('#bCrashed').textContent = all.filter(e => e.status === 'crashed').length;
  const best = landed.reduce((a, e) => e.mult > a.mult ? e : a, { mult: 0 });
  $('#bBest').textContent = best.mult ? `${fx(best.mult)} · ${best.d.name}` : '—';
  const r = me.run, y = $('#bYou');
  if (!r) { y.textContent = 'You watched this round.'; y.className = 'you'; }
  else if (r.status === 'landed') { y.textContent = `You landed at ${fx(r.mult)} after ${r.n} safe route${r.n === 1 ? '' : 's'} · +${fmt(r.payout - r.stake)} FUN`; y.className = 'you ok'; }
  else { y.textContent = `You crashed at intersection ${r.n + 1} · −${fmt(r.stake)} FUN`; y.className = 'you bad'; }
  $('#banner').hidden = false;
  nextP = drawRound();
  renderList(); renderMine(); renderHistory(); renderFairRows(); showPanels();
}

/* ---------- loop ---------- */
let listAt = 0;
function loop(now) {
  const t = now - t0;
  if (phase === 'betting') { if (t >= cfg.betSec * 1000) startTakeoff(now); }
  else if (phase === 'takeoff') { if (t >= cfg.takeoffSec * 1000) startDecide(now); }
  else if (phase === 'decide') {
    let changed = false;
    for (const b of bots) if (b.status === 'deciding' && t >= b.chooseAt * winMs) { b.choice = Math.floor(Math.random() * b.d.paths); b.status = 'chosen'; changed = true; }
    if (changed) renderList();
    if (t >= winMs) startResolve(now);
  } else if (phase === 'resolve') { if (t >= cfg.resolveSec * 1000) afterResolve(now); }
  else if (phase === 'cruise') { if (t >= cfg.cruiseSec * 1000) startDecide(now); }
  else if (phase === 'result' && t >= cfg.resultSec * 1000 && !busy) { busy = true; startBetting().finally(() => { busy = false; }); }
  if (phase === 'betting' && now - listAt > 300) { listAt = now; renderList(); }
  updateUI(now);
  draw(now);
  requestAnimationFrame(loop);
}

/* ---------- readout & controls ---------- */
const cache = {};
const put = (id, prop, v) => { const k = id + prop; if (cache[k] === v) return; cache[k] = v; const el = document.getElementById(id); if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else if (prop === 'hidden') el.hidden = v; else if (prop === 'disabled') el.disabled = v; else if (prop === 'width') el.style.width = v; };
const STATUS = { confirmed: 'Bet confirmed', takeoff: 'Taking off', deciding: 'Decision pending', chosen: 'Route locked', flying: 'Flying', landed: 'Landed', crashed: 'Crashed' };
function updateUI(now) {
  const t = now - t0, r = me.run, mine = r && r.id === (R && R.id);
  let label = '', big = '—', bigCls = 'big wait', sub = '', subCls = 'sub', timer = null;
  const d = (r && r.d) || (R ? R.diffs[me.diff] : cfg.diffs[me.diff]);
  if (phase === 'betting') { label = 'Bets open · takeoff in'; big = Math.max(0, cfg.betSec - t / 1000).toFixed(1) + 's'; sub = `${d.name}: ${d.safe} of ${d.paths} routes are safe`; }
  else if (phase === 'takeoff') { label = 'Taking off'; big = '1.00×'; bigCls = 'big'; sub = 'First intersection ahead'; }
  else if (phase === 'decide') {
    label = `Intersection ${step}` + (r && (r.status === 'deciding') ? ' · choose a route' : '');
    timer = 1 - t / winMs;
    if (isFlying(r)) { big = fx(r.mult); bigCls = 'big'; const nx = ladder(r.d, r.n + 1, R.rtp); sub = `Safe route pays ${fx(nx)} · ${fmt(Math.min(r.stake * nx, cfg.maxWin))} FUN`; }
  } else if (phase === 'resolve') {
    if (r && r.status === 'crashed' && r.id === R.id && r.crashedAt === step) { label = 'Storm cloud!'; big = 'CRASH'; bigCls = 'big bust'; }
    else if (r && r.status === 'flying') { label = 'Safe passage'; const p = clamp(t / 600, 0, 1), prev = ladder(r.d, r.n - 1, R.rtp); big = fx(prev + (r.mult - prev) * p); bigCls = 'big win'; }
    else { label = 'Revealing routes'; big = r && isFlying(r) ? fx(r.mult) : '—'; }
  } else if (phase === 'cruise') { label = isFlying(r) ? 'Flying · land now or fly on' : 'Next intersection ahead'; if (isFlying(r)) { big = fx(r.mult); bigCls = 'big'; } }
  else if (phase === 'result') { label = 'Round complete'; }
  if (mine && r.status === 'landed') { sub = `Landed at ${fx(r.mult)} · +${fmt(r.payout - r.stake)} FUN`; subCls = 'sub ok'; if (phase !== 'betting') { big = fx(r.mult); bigCls = 'big win'; } }
  else if (mine && r.status === 'crashed') { sub = `Crashed at intersection ${r.n + 1} · −${fmt(r.stake)} FUN`; subCls = 'sub bad'; if (phase !== 'resolve' || r.crashedAt !== step) { big = 'Crashed'; bigCls = 'big bust wait'; } }
  else if (!r && phase !== 'betting' && phase !== 'init') sub = 'Watching this round · bets reopen after it';
  put('phase', 'text', label); put('big', 'text', big); put('big', 'class', bigCls);
  put('sub', 'hidden', !sub); put('sub', 'text', sub); put('sub', 'class', subCls);
  put('timer', 'hidden', timer == null); if (timer != null) put('tbar', 'width', Math.round(clamp(timer, 0, 1) * 100) + '%');

  put('status', 'text', r ? STATUS[r.status] : me.queued ? 'Queued for next round' : 'Waiting');
  put('status', 'class', 'chip ' + (r ? r.status : me.queued ? 'confirmed' : ''));

  // setup button
  let cls = 'go bet', l1 = 'Start flight', l2 = fmt(me.stake) + ' FUN · ' + cfg.diffs[me.diff].name;
  if (phase === 'betting') { if (r) { cls = 'go cancel'; l1 = 'Cancel'; l2 = `Bet in · ${fmt(r.stake)} FUN · ${r.d.name}`; } }
  else if (me.queued) { cls = 'go cancel'; l1 = 'Cancel'; l2 = 'Queued for next round'; }
  else l1 = 'Bet next round';
  put('go', 'class', cls);
  const go = $('#go'); go.firstElementChild.textContent = l1; go.lastElementChild.textContent = l2;
  const lock = !!(r && phase === 'betting') || me.queued;
  ['amt', 'dec', 'inc'].forEach(id => put(id, 'disabled', lock));
  document.querySelectorAll('#chips button, #diffs button').forEach(b => { b.disabled = lock; });

  // land button
  if (isFlying(r)) {
    const ok = canLand(r), lb = $('#land');
    put('land', 'disabled', !ok); put('land', 'class', ok ? 'go land' : 'go wait');
    lb.firstElementChild.textContent = 'Land';
    lb.lastElementChild.textContent = r.n < 1 ? 'Pass the first route to unlock landing' : !ok && phase === 'decide' ? 'Route locked · landing reopens after it' : fmt(Math.min(r.stake * r.mult, cfg.maxWin)) + ' FUN';
  }
}
function showPanels() {
  const fl = isFlying(me.run);
  $('#setup').hidden = fl; $('#flight').hidden = !fl;
  requestAnimationFrame(layout);
}
function arrowFor(i, n) {
  const c = (n - 1) / 2, off = i - c;
  if (Math.abs(off) < 0.01) return ['↑', 'Ahead'];
  if (off < 0) return Math.abs(off) >= 1.5 ? ['⇖', 'Far left'] : ['↖', 'Left'];
  return off >= 1.5 ? ['⇗', 'Far right'] : ['↗', 'Right'];
}
function renderRoutes() {
  const r = me.run; if (!r) return;
  const n = r.d.paths, el = $('#routes');
  el.style.gridTemplateColumns = `repeat(${n},minmax(0,1fr))`;
  el.innerHTML = Array.from({ length: n }, (_, i) => {
    const [a, nm] = arrowFor(i, n);
    let cls = '';
    if (phase === 'resolve' && gates && gates.safe) cls = gates.safe[i] ? 'safe' : 'storm';
    return `<button type="button" data-r="${i}" class="${cls}" aria-pressed="${r.choice === i}" ${phase === 'decide' && r.status === 'deciding' ? '' : 'disabled'}><span class="ar">${a}</span><span class="nm">${i + 1} · ${nm}</span></button>`;
  }).join('');
}
$('#routes').addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (b && !b.disabled) choose(+b.dataset.r); });
$('#land').addEventListener('click', () => { const r = me.run; if (canLand(r)) { land(r); renderList(); showPanels(); } });
function renderLadder() {
  const r = me.run, d = r ? r.d : cfg.diffs[me.diff], n = r ? r.n : 0, rtp = R ? R.rtp : cfg.rtp;
  $('#ladder').innerHTML = Array.from({ length: d.max }, (_, i) => `<span class="rung ${i < n ? 'done' : i === n && isFlying(r) ? 'next' : ''}">${i + 1} · ${fx(ladder(d, i + 1, rtp))}</span>`).join('');
  const lad = $('#ladder'), done = lad.querySelectorAll('.done'), nx = lad.querySelector('.next') || done[done.length - 1];
  lad.scrollLeft = nx ? nx.offsetLeft - lad.offsetLeft - lad.clientWidth / 2 + nx.offsetWidth / 2 : 0;
}
function renderDiffs() {
  $('#diffs').innerHTML = cfg.diffs.map((d, i) => `<button type="button" data-d="${i}" aria-pressed="${i === me.diff}"><b>${d.name}</b><span>${d.safe}/${d.paths} safe</span></button>`).join('');
  const sel = $('#alN'); const mx = cfg.diffs[me.diff].max;
  sel.innerHTML = Array.from({ length: mx }, (_, i) => `<option value="${i + 1}" ${i + 1 === Math.min(me.autoN, mx) ? 'selected' : ''}>${i + 1}</option>`).join('');
  me.autoN = Math.min(me.autoN, mx);
}
$('#diffs').addEventListener('click', e => { const b = e.target.closest('button[data-d]'); if (!b || b.disabled) return; me.diff = +b.dataset.d; renderDiffs(); renderLadder(); });

/* ---------- scene ---------- */
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, F = 600, HY = 250, PY = 450, last = 0;
const GATE_SP = 1.9, GATE_R = 0.78;
let gates = null;
function layout() {
  W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  F = H * 0.9; HY = H * 0.36;
  const ctrl = $('#controls').offsetHeight;
  PY = clamp(H - ctrl - 78, HY + 90, H - 120);
}
new ResizeObserver(layout).observe(stage);
new ResizeObserver(layout).observe($('#controls'));

const world = {
  scroll: 0, speed: 0.4, camH: 0.55, camX: 0, fieldX: 0,
  clouds: Array.from({ length: 26 }, () => ({ x: (Math.random() - 0.5) * 18, dy: -1.2 + Math.random() * 3.6, z: 6 + Math.random() * 80, s: 0.8 + Math.random() * 1.2 })),
  recenter() { for (const c of this.clouds) c.x -= this.camX; this.fieldX -= this.camX; this.camX = 0; }
};
const plane = { state: 'parked', t: 0, x: 0, bank: 0, prop: 0 };
let smoke = [], sparks = [], floats = [], flashAt = -1e9;

const cloudImg = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 150; const g = c.getContext('2d');
  const puffs = [[70, 92, 44], [122, 68, 56], [178, 88, 46], [106, 104, 40], [152, 106, 42], [210, 108, 30], [44, 110, 28]];
  g.fillStyle = '#C6DCF2'; puffs.forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y + 9, r, 0, 7); g.fill(); });
  g.fillStyle = '#FFFFFF'; puffs.forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
  return c;
})();
const FIELD = ['#6FAE52', '#83BE5C', '#C9B46C', '#5E9C4A', '#A8C86A', '#7DA84E', '#D4BF78'];
const proj = (x, dy, z) => ({ x: W / 2 + (x - world.camX) * F / z, y: HY - dy * F / z });

function drawGround() {
  const D = 3, CW = 3.2, h = world.camH, base = Math.floor(world.scroll / D);
  for (let k = 0; k < 34; k++) {
    const row = base + k, z0 = Math.max(0.5, row * D - world.scroll), z1 = row * D + D - world.scroll;
    if (z1 <= 0.5) continue;
    const y0 = HY + h * F / z0, y1 = HY + h * F / z1;
    if (y1 > H) continue;
    const c0 = Math.floor((world.camX - world.fieldX - 9 * CW) / CW), c1 = c0 + 18;
    for (let c = c0; c <= c1; c++) {
      const xa = c * CW + world.fieldX, xb = xa + CW;
      const p = [W / 2 + (xa - world.camX) * F / z0, W / 2 + (xb - world.camX) * F / z0, W / 2 + (xb - world.camX) * F / z1, W / 2 + (xa - world.camX) * F / z1];
      if (Math.max(...p) < 0 || Math.min(...p) > W) continue;
      ctx.fillStyle = FIELD[((row * 7 + c * 13) % FIELD.length + FIELD.length) % FIELD.length];
      ctx.beginPath(); ctx.moveTo(p[0], Math.min(H, y0)); ctx.lineTo(p[1], Math.min(H, y0)); ctx.lineTo(p[2], y1); ctx.lineTo(p[3], y1); ctx.closePath(); ctx.fill();
    }
  }
  // runway for the takeoff scene
  if (phase === 'betting' || phase === 'takeoff' || phase === 'init') {
    const zA = Math.max(0.5, 0.4 - world.scroll + world.runway0), zB = 60 - world.scroll + world.runway0;
    if (zB > 0.5) {
      const yA = Math.min(H, HY + h * F / zA), yB = HY + h * F / zB, w = 0.75;
      const xa = W / 2 + (-w - world.camX) * F / zA, xb = W / 2 + (w - world.camX) * F / zA, xc = W / 2 + (w - world.camX) * F / zB, xd = W / 2 + (-w - world.camX) * F / zB;
      ctx.fillStyle = '#5C6470'; ctx.beginPath(); ctx.moveTo(xa, yA); ctx.lineTo(xb, yA); ctx.lineTo(xc, yB); ctx.lineTo(xd, yB); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F4F1E6';
      for (let z = Math.ceil((zA + world.scroll) / 2.5) * 2.5 - world.scroll; z < zB; z += 2.5) {
        if (z < 0.6) continue;
        const za = z, zb = z + 1.1, ya = HY + h * F / za, yb = HY + h * F / zb, ww = 0.05;
        ctx.beginPath(); ctx.moveTo(W / 2 + (-ww - world.camX) * F / za, ya); ctx.lineTo(W / 2 + (ww - world.camX) * F / za, ya); ctx.lineTo(W / 2 + (ww - world.camX) * F / zb, yb); ctx.lineTo(W / 2 + (-ww - world.camX) * F / zb, yb); ctx.closePath(); ctx.fill();
      }
    }
  }
  const g = ctx.createLinearGradient(0, HY, 0, HY + H * 0.22);
  g.addColorStop(0, 'rgba(206,229,248,.95)'); g.addColorStop(1, 'rgba(206,229,248,0)');
  ctx.fillStyle = g; ctx.fillRect(0, HY - 1, W, H * 0.22);
}
function drawCloud(c) {
  if (c.z < 0.9) return;
  const p = proj(c.x, c.dy, c.z), w = c.s * 2.6 * F / c.z, h = w * 150 / 256;
  if (p.x + w / 2 < 0 || p.x - w / 2 > W || p.y - h > H) return;
  ctx.globalAlpha = clamp((c.z - 0.9) / 2.5, 0, 1) * clamp((90 - c.z) / 20, 0, 1) * 0.95;
  ctx.drawImage(cloudImg, p.x - w / 2, p.y - h / 2, w, h);
  ctx.globalAlpha = 1;
}
function gateZ(t) {
  if (!gates) return 0;
  const zDec = Math.max(5.5, (gates.n - 1) * GATE_SP * F / (0.8 * W));
  gates.zDec = zDec;
  if (phase === 'decide') return 70 + (zDec - 70) * ease(clamp(t / winMs, 0, 1));
  if (phase === 'resolve') return zDec + (0.35 - zDec) * clamp(t / (cfg.resolveSec * 1000 * 0.85), 0, 1);
  return 0;
}
function bolt(x, y0, y1, w) {
  ctx.strokeStyle = '#FFE36E'; ctx.lineWidth = w; ctx.lineJoin = 'miter'; ctx.shadowColor = '#FFF3A6'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(x, y0); const segs = 6;
  for (let i = 1; i <= segs; i++) ctx.lineTo(x + (i % 2 ? 1 : -1) * w * 3 * (0.6 + Math.random() * 0.6), y0 + (y1 - y0) * i / segs);
  ctx.stroke(); ctx.shadowBlur = 0;
}
function drawGates(z, now) {
  if (!gates || z < 0.45) return;
  const r = me.run, counts = Array(gates.n).fill(0);
  for (const b of bots) if (b.d.key === gates.d.key && b.choice != null && (b.status === 'chosen' || phase === 'resolve')) counts[b.choice]++;
  const gdy = -(PY - HY) / F * 1.05;
  gates.hit = [];
  for (let i = 0; i < gates.n; i++) {
    const p = proj(gates.xs[i], gdy, z), rad = GATE_R * F / z;
    gates.hit[i] = { x: p.x, y: p.y, r: rad };
    if (p.x + rad * 1.4 < 0 || p.x - rad * 1.4 > W) continue;
    const state = gates.safe ? (gates.safe[i] ? 'safe' : 'storm') : 'idle';
    const a = clamp((70 - z) / 15, 0, 1); ctx.globalAlpha = a;
    const inner = ctx.createRadialGradient(p.x, p.y, rad * 0.1, p.x, p.y, rad);
    if (state === 'safe') { inner.addColorStop(0, 'rgba(160,255,200,.75)'); inner.addColorStop(1, 'rgba(63,209,122,.25)'); }
    else if (state === 'storm') { inner.addColorStop(0, 'rgba(30,34,48,.85)'); inner.addColorStop(1, 'rgba(60,66,84,.6)'); }
    else { inner.addColorStop(0, 'rgba(255,255,255,.5)'); inner.addColorStop(1, 'rgba(190,225,255,.15)'); }
    ctx.fillStyle = inner; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 0.86, 0, 7); ctx.fill();
    const K = 14;
    for (const pass of [0, 1]) {
      ctx.fillStyle = state === 'storm' ? (pass ? '#5A6276' : '#3A4152') : (pass ? '#FFFFFF' : '#C6DCF2');
      for (let k = 0; k < K; k++) {
        const an = k / K * Math.PI * 2 + (state === 'storm' && !reduced ? Math.sin(now / 90 + k) * 0.04 : 0);
        const pr = rad * 0.27 * (1 + 0.14 * Math.sin(k * 1.7));
        ctx.beginPath(); ctx.arc(p.x + Math.cos(an) * rad, p.y + Math.sin(an) * rad * 0.94 + (pass ? 0 : pr * 0.22), pr, 0, 7); ctx.fill();
      }
    }
    if (state === 'storm' && (reduced || Math.random() < 0.35)) bolt(p.x, p.y - rad * 0.7, p.y + rad * 0.7, Math.max(1.5, rad * 0.05));
    if (r && r.choice === i && r.id === R.id) { ctx.strokeStyle = '#FFC23D'; ctx.lineWidth = Math.max(2, rad * 0.06); ctx.beginPath(); ctx.arc(p.x, p.y, rad * 1.24, 0, 7); ctx.stroke(); }
    if (rad > 14) {
      const by = p.y - rad * 1.42, br = clamp(rad * 0.24, 9, 22);
      ctx.fillStyle = state === 'safe' ? '#3FD17A' : state === 'storm' ? '#E8463A' : '#FFF4DC';
      ctx.beginPath(); ctx.arc(p.x, by, br, 0, 7); ctx.fill();
      ctx.fillStyle = state === 'idle' ? '#0A1F33' : '#fff'; ctx.font = `800 ${Math.round(br * 1.1)}px Archivo, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, by + 1);
      if (counts[i]) {
        const t = counts[i] + (counts[i] === 1 ? ' pilot' : ' pilots'); ctx.font = `700 ${Math.round(clamp(rad * 0.17, 10, 13))}px Archivo, sans-serif`;
        const tw = ctx.measureText(t).width + 12, ty = p.y + rad * 1.36;
        ctx.fillStyle = 'rgba(10,31,51,.75)'; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, ty - 9, tw, 18, 9); ctx.fill();
        ctx.fillStyle = '#FFF4DC'; ctx.fillText(t, p.x, ty);
      }
    }
    ctx.globalAlpha = 1;
  }
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function drawPlane(x, y, s, a, now, alpha) {
  const RED = '#D7322B', DARK = '#8E1B17', OUT = '#2A1414';
  ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = OUT;
  ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(0, -6, 52, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -6, 52, (now / 30) % 7, (now / 30) % 7 + 0.9); ctx.stroke();
  ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-22, 22); ctx.lineTo(-30, 42); ctx.moveTo(22, 22); ctx.lineTo(30, 42); ctx.stroke();
  ctx.fillStyle = '#2B2B2B'; ctx.beginPath(); ctx.arc(-30, 46, 7, 0, 7); ctx.arc(30, 46, 7, 0, 7); ctx.fill();
  rr(-94, 10, 188, 14, 7); ctx.fillStyle = RED; ctx.fill(); ctx.stroke();
  rr(-100, -42, 200, 14, 7); ctx.fillStyle = RED; ctx.fill(); ctx.stroke();
  for (const sx of [-64, -84, 64, 84]) { ctx.beginPath(); ctx.moveTo(sx, -28); ctx.lineTo(sx, 10); ctx.stroke(); }
  for (const sx of [-74, 74]) { ctx.beginPath(); ctx.arc(sx, -35, 5, 0, 7); ctx.fillStyle = '#FFF4DC'; ctx.fill(); ctx.beginPath(); ctx.arc(sx, -35, 2.4, 0, 7); ctx.fillStyle = '#1F5FA8'; ctx.fill(); }
  const g = ctx.createRadialGradient(-8, -14, 4, 0, -6, 28); g.addColorStop(0, '#F0584F'); g.addColorStop(1, DARK);
  ctx.beginPath(); ctx.arc(0, -6, 26, 0, 7); ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  // wolf pilot
  const flap = Math.sin(now / 70) * 6;
  ctx.fillStyle = '#FFF4DC'; ctx.beginPath(); ctx.moveTo(6, -40); ctx.quadraticCurveTo(34, -52 + flap, 58, -44 + flap * 1.4); ctx.quadraticCurveTo(34, -40 + flap, 8, -34); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#7E8A9A'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-14, -52); ctx.lineTo(-10, -72); ctx.lineTo(-2, -56); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -52); ctx.lineTo(10, -72); ctx.lineTo(2, -56); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -46, 14, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6B3E1F'; ctx.fillRect(-14, -49, 28, 5);
  ctx.fillStyle = '#5E1A16'; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(0, -40); ctx.lineTo(4, -8); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
  rr(-44, 2, 88, 9, 4.5); ctx.fillStyle = DARK; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function draw(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (!W || !H) return;
  const t = now - t0, r = me.run;
  // world motion
  const target = phase === 'betting' || phase === 'init' ? 0.5 : phase === 'takeoff' ? 4 + 14 * ease(clamp(t / (cfg.takeoffSec * 1000), 0, 1)) : 16 + (isFlying(r) ? Math.min(12, (r.mult - 1) * 0.6) : 2);
  world.speed += (target - world.speed) * Math.min(1, dt * 0.004);
  const camTarget = phase === 'betting' || phase === 'init' ? 0.55 : phase === 'takeoff' ? 0.55 + 3.6 * ease(clamp((t / (cfg.takeoffSec * 1000) - 0.25) / 0.75, 0, 1)) : 4.2;
  if (phase === 'betting' && world.camH > 1) { world.camH = 0.55; world.runway0 = world.scroll; }
  world.camH += (camTarget - world.camH) * Math.min(1, dt * (phase === 'takeoff' ? 0.01 : 0.004));
  if (world.runway0 == null) world.runway0 = world.scroll;
  const ds = reduced && phase !== 'takeoff' ? world.speed * 0.4 : world.speed;
  world.scroll += ds * dt / 1000;
  for (const c of world.clouds) { c.z -= ds * dt / 1000; if (c.z < 0.6) { c.z = 70 + Math.random() * 20; c.x = world.camX + (Math.random() - 0.5) * 18; c.dy = -1.2 + Math.random() * 3.6; } }
  // camera follows the chosen route
  let camTgt = 0;
  if (gates && r && r.choice != null && r.id === R.id) camTgt = gates.xs[r.choice] * (phase === 'resolve' ? 1 : 0.3);
  world.camX += (camTgt - world.camX) * Math.min(1, dt * (phase === 'resolve' ? 0.006 : 0.003));
  plane.bank += (clamp((camTgt - world.camX) * 0.5, -0.45, 0.45) - plane.bank) * Math.min(1, dt * 0.008);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let shake = 0;
  if (now - flashAt < 500 && !reduced) shake = 8 * (1 - (now - flashAt) / 500);
  ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const sky = ctx.createLinearGradient(0, 0, 0, HY);
  sky.addColorStop(0, '#1F6FC0'); sky.addColorStop(0.6, '#3E9BE3'); sky.addColorStop(1, '#BFE3FA');
  ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, HY + 11);
  ctx.fillStyle = 'rgba(255,240,190,.55)'; ctx.beginPath(); ctx.arc(W * 0.82, HY * 0.32, 26, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,190,.18)'; ctx.beginPath(); ctx.arc(W * 0.82, HY * 0.32, 48, 0, 7); ctx.fill();
  drawGround();

  const gz = gateZ(t);
  const far = world.clouds.filter(c => c.z >= gz).sort((a, b) => b.z - a.z), near = world.clouds.filter(c => c.z < gz).sort((a, b) => b.z - a.z);
  far.forEach(drawCloud);
  drawGates(gz, now);
  near.forEach(drawCloud);

  // speed lines
  if (!reduced && (phase === 'decide' || phase === 'resolve' || phase === 'cruise')) {
    const n = 10 + (isFlying(r) ? Math.min(14, Math.floor(r.mult)) : 0);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const an = (i * 2.399) % (Math.PI * 2), ph = ((now / 600 + i * 0.37) % 1), r0 = 60 + ph * Math.max(W, H) * 0.7;
      ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(an) * r0, HY + Math.sin(an) * r0 * 0.7); ctx.lineTo(W / 2 + Math.cos(an) * (r0 + 40 + ph * 60), HY + Math.sin(an) * (r0 + 40 + ph * 60) * 0.7); ctx.stroke();
    }
  }

  // plane
  const s = clamp(W / 480, 0.72, 1.05);
  if (phase === 'resolve' && r && r.status === 'crashed' && r.id === R.id && r.crashedAt === step && plane.state !== 'crashing' && plane.state !== 'gone' && gz < 1.6) { plane.state = 'crashing'; plane.t = now; flashAt = now; for (let i = 0; i < 20; i++) sparks.push({ x: W / 2, y: PY, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.7) * 0.5, life: 0, max: 700, c: '#FFE36E' }); }
  if (phase === 'resolve' && r && r.status === 'flying' && r.passed && gz < 1.2 && !r.sparked) { r.sparked = true; for (let i = 0; i < 26; i++) sparks.push({ x: W / 2, y: PY - 20, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.8) * 0.5, life: 0, max: 900, c: Math.random() < 0.5 ? '#FFC23D' : '#3FD17A' }); }
  if (phase === 'decide' && r) r.sparked = false;
  const bob = reduced ? 0 : Math.sin(now / 380) * 4;
  if (plane.state === 'parked') drawPlane(W / 2, PY + 26 + (reduced ? 0 : Math.sin(now / 60) * 0.8), s * 1.05, 0, now);
  else if (plane.state === 'takeoff' || (plane.state !== 'crashing' && plane.state !== 'landing' && plane.state !== 'gone')) {
    const p = phase === 'takeoff' ? ease(clamp(t / (cfg.takeoffSec * 1000), 0, 1)) : 1;
    drawPlane(W / 2, PY + 26 - 26 * p + bob * p, s * (1.05 - 0.05 * p), plane.bank + (phase === 'takeoff' ? -0.05 * Math.sin(p * Math.PI) : 0), now);
  } else if (plane.state === 'crashing') {
    const p = clamp((now - plane.t) / 1700, 0, 1);
    if (p < 1) {
      const x = W / 2 + p * 60, y = PY + p * p * (H * 0.5);
      if (!reduced && Math.random() < 0.7) smoke.push({ x, y: y - 10, r: 8 + Math.random() * 10, vy: -0.03, life: 0, max: 1200 });
      drawPlane(x, y, s * (1 - 0.55 * p), p * 7, now);
    } else plane.state = 'gone';
  } else if (plane.state === 'landing') {
    const p = clamp((now - plane.t) / 1600, 0, 1);
    if (p < 1) drawPlane(W / 2, PY + p * (H - PY) * 0.55, s * (1 - 0.5 * p), plane.bank * (1 - p), now, 1 - p * 0.6);
    else plane.state = 'gone';
  }

  // particles
  smoke = smoke.filter(q => (q.life += dt) < q.max);
  for (const q of smoke) { q.y += q.vy * dt; q.r += dt * 0.02; ctx.fillStyle = `rgba(70,74,84,${0.55 * (1 - q.life / q.max)})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); }
  sparks = sparks.filter(q => (q.life += dt) < q.max);
  for (const q of sparks) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.0007 * dt; ctx.globalAlpha = 1 - q.life / q.max; ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 4, 4); }
  ctx.globalAlpha = 1;
  floats = floats.filter(f => now - f.t0 < 1600);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '30px "Alfa Slab One", Georgia, serif';
  for (const f of floats) { const p = (now - f.t0) / 1600; ctx.globalAlpha = 1 - p; ctx.lineWidth = 6; ctx.strokeStyle = '#0B4527'; ctx.strokeText(f.text, W * f.x, H * f.y - p * 70); ctx.fillStyle = f.col; ctx.fillText(f.text, W * f.x, H * f.y - p * 70); }
  ctx.globalAlpha = 1;
  if (now - flashAt < 260) { ctx.fillStyle = `rgba(255,250,210,${0.7 * (1 - (now - flashAt) / 260)})`; ctx.fillRect(-10, -10, W + 20, H + 20); }
}
cv.addEventListener('click', e => {
  if (phase !== 'decide' || !gates || !gates.hit || !me.run || me.run.status !== 'deciding') return;
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  gates.hit.forEach((h, i) => { if (h && Math.hypot(h.x - x, h.y - y) < h.r * 1.25) choose(i); });
});

/* ---------- side panels ---------- */
function renderBalance() { $('#balance').textContent = fmt(S.balance); }
function renderHistory() {
  $('#history').innerHTML = S.mine.slice(0, 30).map(b => b.payout ? `<span class="pill ${b.mult >= 10 ? 'hi' : b.mult >= 2 ? 'mid' : ''}">${b.short || b.diff[0]} · ${fx(b.mult)}</span>` : `<span class="pill">${b.short || b.diff[0]} · crash</span>`).join('') || '<span class="pill">Your landings appear here</span>';
}
function renderList() {
  if (!R) return;
  const frac = phase === 'betting' ? (performance.now() - t0) / (cfg.betSec * 1000) : 1;
  const vis = bots.filter(b => b.joinAt <= frac).sort((a, b) => b.stake - a.stake);
  const r = me.run, all = (r ? [r] : []).concat(vis);
  $('#lvN').textContent = all.length;
  $('#lvF').textContent = all.filter(isFlying).length;
  $('#lvL').textContent = all.filter(e => e.status === 'landed').length;
  $('#lvC').textContent = all.filter(e => e.status === 'crashed').length;
  const stakes = $('#showStakes').checked, showPick = phase === 'decide' || phase === 'resolve';
  $('#lvRows').className = 'rows' + (stakes ? ' stakes' : '');
  $('#lvRows').innerHTML = `<div class="row head"><span class="nm">Pilot</span>${stakes ? '<span>Stake</span>' : ''}<span>Lvl</span><span>×</span><span>Pick</span><span>Status</span></div>` +
    all.map(e => {
      const pk = showPick && e.choice != null && (e.status === 'chosen' || e.status === 'flying' || e.status === 'crashed') ? arrowFor(e.choice, e.d.paths)[0] : showPick && e.status === 'deciding' ? '…' : '–';
      const mx = e.status === 'crashed' ? '<span class="bad">0.00</span>' : `<span class="${e.status === 'landed' ? 'ok' : ''}">${e.mult.toFixed(2)}</span>`;
      return `<div class="row${e.you ? ' you' : ''}"><span class="nm">${e.name}</span>${stakes ? `<span>${fmt(e.stake)}</span>` : ''}<span class="dz d${e.di}">${e.d.short}</span>${mx}<span>${pk}</span><span class="chip ${e.status}">${STATUS[e.status]}</span></div>`;
    }).join('');
}
$('#showStakes').addEventListener('change', renderList);
function renderMine() {
  let wag = 0, ret = 0; S.mine.forEach(b => { wag += b.stake; ret += b.payout; });
  $('#myWag').textContent = fmt(wag); $('#myRet').textContent = fmt(ret);
  const pl = ret - wag; $('#myPl').textContent = (pl >= 0 ? '+' : '') + fmt(pl); $('#myPl').className = pl > 0 ? 'ok' : pl < 0 ? 'bad' : '';
  $('#myRtp').textContent = wag ? (ret / wag * 100).toFixed(2) + '%' : '—';
  $('#myEmpty').hidden = S.mine.length > 0;
  $('#myRows').innerHTML = S.mine.slice(0, 100).map(b => `<tr><td>#${b.round}</td><td>${b.diff}</td><td>${fmt(b.stake)}</td><td>${b.n}</td><td class="${b.payout ? 'ok' : 'bad'}">${b.payout ? 'Landed ' + fx(b.mult) : 'Crashed'}</td><td>${fmt(b.payout)}</td></tr>`).join('');
}
function renderFair() { $('#fRound').textContent = '#' + R.id; $('#fHash').textContent = R.hash; $('#fNonce').textContent = R.nonce; }
function renderFairRows() { $('#fRows').innerHTML = S.rounds.slice(0, 40).map((rd, i) => `<tr><td>#${rd.id}</td><td>${rd.nonce}</td><td>${rd.steps}</td><td><button type="button" data-v="${i}">Verify</button></td></tr>`).join(''); }
$('#fRows').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; const rd = S.rounds[+b.dataset.v]; $('#vSeed').value = rd.serverSeed; $('#vNonce').value = rd.nonce; verify(); });
async function verify() {
  const seed = $('#vSeed').value.trim(), n = $('#vNonce').value.trim(), di = +$('#vDiff').value, out = $('#vOut'); out.hidden = false;
  if (!seed || !n) { out.innerHTML = '<span class="bad">Fill in the server seed and the nonce.</span>'; return; }
  const commit = await sha256(seed), match = S.rounds.find(rd => rd.hash === commit);
  const d = (match ? match.diffs : cfg.diffs)[di], lays = await layoutsFor(seed, n, d);
  const played = match ? match.steps : d.max;
  out.innerHTML = `<div class="note">SHA-256(server seed)</div><div class="mono">${commit}</div>
    ${match ? `<div class="ok">Matches the commit of round #${match.id}, published before bets opened.</div>` : '<div class="note">No round in this session used that commit. The current route settings are used.</div>'}
    <div class="note">${d.name}: safe routes at each intersection (1 = far left)</div>
    <div class="tbl"><table><thead><tr><th>Step</th><th>Safe routes</th><th>Storm</th></tr></thead><tbody>
    ${lays.slice(1).map((l, i) => `<tr style="${i >= played ? 'opacity:.45' : ''}"><td>${i + 1}</td><td class="ok">${l.map((s, j) => s ? j + 1 : null).filter(Boolean).join(', ')}</td><td class="bad">${l.map((s, j) => s ? null : j + 1).filter(Boolean).join(', ')}</td></tr>`).join('')}
    </tbody></table></div>${match && played < d.max ? `<p class="note">Faded rows were committed but not reached this round.</p>` : ''}`;
}
$('#vGo').addEventListener('click', verify);

/* ---------- math panel ---------- */
function renderMathTable() {
  $('#mTable').innerHTML = cfg.diffs.map((d, i) => `<tr><td>${d.name}</td><td><input id="mp${i}" type="number" min="2" max="6" step="1" value="${d.paths}"></td><td><input id="ms${i}" type="number" min="1" max="5" step="1" value="${d.safe}"></td><td id="mw${i}"></td><td><input id="mx${i}" type="number" min="1" max="20" step="1" value="${d.max}"></td><td id="mt${i}"></td></tr>`).join('');
  $('#vDiff').innerHTML = cfg.diffs.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
}
function renderMathStats() {
  cfg.diffs.forEach((d, i) => { $('#mw' + i).textContent = (pOf(d) * 100).toFixed(0) + '%'; $('#mt' + i).textContent = fx(ladder(d, d.max)); });
  $('#mLadder').innerHTML = cfg.diffs.map(d => `<tr><td>${d.name}</td>${[1, 2, 3, 4, 5, 6].map(n => `<td>${n <= d.max ? ladder(d, n).toFixed(2) : '–'}</td>`).join('')}</tr>`).join('');
}
function readMath() {
  cfg.rtp = parseFloat($('#mRtp').value); $('#mRtpV').textContent = cfg.rtp.toFixed(1) + '%';
  let msg = '';
  const next = cfg.diffs.map((d, i) => Object.assign({}, d, { paths: parseInt($('#mp' + i).value, 10), safe: parseInt($('#ms' + i).value, 10), max: parseInt($('#mx' + i).value, 10) }));
  for (const d of next) {
    if (![d.paths, d.safe, d.max].every(Number.isFinite)) { msg = `${d.name}: every field needs a whole number.`; break; }
    if (d.paths < 2 || d.paths > 6) { msg = `${d.name}: use 2 to 6 routes.`; break; }
    if (d.safe < 1 || d.safe >= d.paths) { msg = `${d.name}: safe routes must be at least 1 and fewer than the routes.`; break; }
    if (d.max < 1 || d.max > 20) { msg = `${d.name}: max steps must be 1 to 20.`; break; }
    if (ladder(d, 1) < 1.01) { msg = `${d.name}: the first safe route would pay less than 1.01×. Lower the safe routes or raise the RTP.`; break; }
  }
  $('#mWarn').hidden = !msg; $('#mWarn').textContent = msg ? msg + ' The last valid settings stay in use.' : '';
  if (!msg) cfg.diffs = next;
  renderMathStats(); renderDiffs(); if (!me.run) renderLadder();
}
$('#mTable').addEventListener('input', readMath);
$('#mRtp').addEventListener('input', readMath);
const num = (id, lo, hi, d) => { const v = parseFloat($(id).value); const r = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; $(id).value = r; return r; };
$('#mDec').addEventListener('change', () => { cfg.decSec = num('#mDec', 3, 15, 6); });
$('#mBet').addEventListener('change', () => { cfg.betSec = num('#mBet', 3, 20, 8); });
$('#mWin').addEventListener('change', () => { cfg.maxWin = num('#mWin', 10, 1e8, 25000); });
$('#mMin').addEventListener('change', () => { cfg.minBet = num('#mMin', 0.1, cfg.maxBet, 0.1); });
$('#mMax').addEventListener('change', () => { cfg.maxBet = num('#mMax', cfg.minBet, 1e6, 500); });
$('#mFall').addEventListener('change', e => { cfg.fallback = e.target.value; });

$('#sGo').addEventListener('click', () => {
  const N = Math.round(num('#sN', 1e4, 1e6, 2e5)), t1 = performance.now();
  const strat = [['Early landing (1)', () => 1], ['Fixed auto land (3)', () => 3], ['Aggressive (to max)', d => d.max], ['Mixed (1 to max)', d => 1 + Math.floor(Math.random() * d.max)]];
  const rows = cfg.diffs.map((d, di) => {
    const p = pOf(d), doc = DOC[di];
    return strat.map(([nm, k]) => {
      let lad = 0, dr = 0;
      for (let i = 0; i < N; i++) {
        const goal = Math.min(k(d), d.max);
        let n = 0; while (n < goal && Math.random() < p) n++;
        if (n === goal) lad += ladder(d, n);
        let m = 1, ok = true; for (let s = 0; s < goal; s++) { if (Math.random() < doc.p) m *= doc.lo + Math.random() * (doc.hi - doc.lo); else { ok = false; break; } }
        if (ok) dr += m;
      }
      return { d: d.name, nm, lad: lad / N * 100, dr: dr / N * 100 };
    });
  }).flat();
  const out = $('#sOut'); out.hidden = false;
  out.innerHTML = `<div class="note">${N.toLocaleString('en-US')} flights per cell in ${(performance.now() - t1).toFixed(0)} ms. The doc model uses its own win chances (80 / 60 / 50 / 20%) and step ranges.</div>
    <div class="tbl"><table><thead><tr><th>Level · strategy</th><th>Fixed ladder</th><th>Doc ranges</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.d} · ${r.nm}</td><td>${r.lad.toFixed(2)}%</td><td class="${r.dr > 100 ? 'bad' : r.dr < 85 ? 'gold' : ''}">${r.dr.toFixed(2)}%</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">The fixed ladder lands near ${cfg.rtp.toFixed(1)}% in every row; rounding each multiplier down to the cent takes a little more off long flights. The doc ranges give away money on Easy and Hard and fall steeply on Medium and Extreme the longer a pilot flies.</p>`;
});

/* ---------- controls wiring ---------- */
$('#amt').addEventListener('change', () => setStake(parseFloat($('#amt').value)));
$('#dec').addEventListener('click', () => setStake(me.stake - (me.stake > 10 ? 1 : 0.5)));
$('#inc').addEventListener('click', () => setStake(me.stake + (me.stake >= 10 ? 1 : 0.5)));
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const c = b.dataset.chip; setStake(c === 'half' ? me.stake / 2 : c === 'dbl' ? me.stake * 2 : +c); });
$('#alOn').addEventListener('change', e => { me.autoLand = e.target.checked; });
$('#alN').addEventListener('change', e => { me.autoN = +e.target.value; });
$('#ab').addEventListener('change', e => { me.autoBet = e.target.checked; if (me.autoBet && !me.run && !me.queued) onGo(); });
$('#go').addEventListener('click', onGo);
$('#refill').addEventListener('click', () => { S.balance = 1000; renderBalance(); toast('Demo balance reset to 1,000 FUN.'); });
document.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  if (/^[1-6]$/.test(e.key)) { choose(+e.key - 1); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    const r = me.run; if (!r || r.status !== 'deciding') return;
    const n = r.d.paths, c = Math.floor((n - 1) / 2);
    choose(e.key === 'ArrowLeft' ? 0 : e.key === 'ArrowRight' ? n - 1 : c); return;
  }
  if (e.code !== 'Space' || e.repeat || tag === 'BUTTON') return;
  e.preventDefault();
  if (isFlying(me.run)) { if (canLand(me.run)) { land(me.run); renderList(); showPanels(); } }
  else onGo();
});
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  ['live', 'mine', 'fair', 'math'].forEach(t => { $('#p-' + t).hidden = t !== name; });
  try { localStorage.setItem('plane-tab', name); } catch (e) {}
}
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }


/* ---------- boot ---------- */
async function boot() {
  setStake(me.stake);
  $('#mRtp').value = cfg.rtp; $('#mDec').value = cfg.decSec; $('#mBet').value = cfg.betSec; $('#mWin').value = cfg.maxWin; $('#mMin').value = cfg.minBet; $('#mMax').value = cfg.maxBet; $('#mFall').value = cfg.fallback;
  renderMathTable(); readMath(); renderDiffs();
  try { const t = localStorage.getItem('plane-tab'); if (t) showTab(t); } catch (e) {}
  layout(); renderBalance(); renderHistory(); renderMine(); renderFairRows();
  await startBetting();
  requestAnimationFrame(loop);
}
boot();
})();
