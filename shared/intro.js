/* The Brainer Games intro, shared by every game. It's about the player's Brainer: it stands big in the middle, doing
   the game's thing (flying its plane, standing on a plot in the foggy valley), and wakes up as the game loads: sleepy, then
   focused, then excited, then a wink at 100%. Under it are the game's wordmark and a 0-100% counter; the studio logo
   sits small in the corner. It plays in full once a visit and short after that; a tap or key skips it once loaded.
   BrainerIntro.start({ title, mark, theme, what, progress, actor, fallback }) returns a promise that resolves when the
   intro has left.
     mark: 'plane', 'fly' or 'fog' picks the wordmark (BrainerIntro.wordmark builds it for the game's own top bar too).
     actor(ctx, w, h, t, ex): the game draws its 3D Brainer into the canvas and returns true, or false while its 3D
     isn't ready yet. After a moment a still stands in: fallback, or else the player's own stage, assets/brainer-N.png
     for the brain level every game keeps in localStorage brainer.level. */
(() => {
'use strict';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const seen = (() => { try { return sessionStorage.getItem('brainer.intro') === '1'; } catch (e) { return false; } })();

function wordmark(mark) {
  if (mark === 'plane') return `<span class="wm wm-plane" role="img" aria-label="Plane Crash"><span class="wm-w wm-top" data-t="PLANE"><b>PLANE</b></span><span class="wm-w wm-main" data-t="CRASH"><b>CRASH</b></span>`
    + '<svg class="wm-swoosh" viewBox="0 0 220 70" aria-hidden="true"><path class="wm-trail" d="M6 60 C 70 68, 140 46, 196 14"/><path class="wm-jet" d="M0 0 L 18 5 L 0 10 L 5 5 Z" transform="translate(192 4) rotate(-28)"/></svg></span>';
  if (mark === 'fly') return `<span class="wm wm-plane" role="img" aria-label="Fly High"><span class="wm-w wm-top" data-t="FLY"><b>FLY</b></span><span class="wm-w wm-main" data-t="HIGH"><b>HIGH</b></span>`
    + '<svg class="wm-swoosh" viewBox="0 0 220 70" aria-hidden="true"><path class="wm-trail" d="M6 64 C 90 64, 150 40, 196 8"/><path class="wm-jet" d="M0 0 L 18 5 L 0 10 L 5 5 Z" transform="translate(192 0) rotate(-36)"/></svg></span>';   // the Aviator-style game, in Plane Crash's lettering
  if (mark === 'fog') return '<span class="wm wm-fog" role="img" aria-label="FogRush"><span class="wm-w wm-cloud" data-t="Fog"><b>Fog</b></span><span class="wm-w wm-gold" data-t="Rush"><b>Rush</b></span><i class="wm-spark" aria-hidden="true"></i></span>';
  return `<span class="wm"><span class="wm-w wm-main" data-t="${mark}"><b>${mark}</b></span></span>`;
}

function start(cfg) {
  const root = document.createElement('div');
  root.className = `intro t-${cfg.theme || cfg.mark || 'plane'}`;
  root.innerHTML = `<div class="intro-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="intro-mark"><img src="${cfg.logo || 'assets/logo-white.png'}" alt=""><span>BRAINER<small>GAMES</small></span></div>
    <div class="intro-center">
      <canvas class="intro-actor" aria-hidden="true"></canvas>
      <div class="intro-title">${wordmark(cfg.mark || cfg.title)}</div>
      <div class="intro-pct" aria-hidden="true"><b>0</b><span>%</span></div>
      <div class="intro-cells" aria-hidden="true">${'<i></i>'.repeat(12)}</div>
      <small class="intro-note" role="status">Waking up your Brainer…</small>
    </div>
    <button type="button" class="intro-skip" hidden>Skip</button>`;
  document.body.appendChild(root);
  const cv = root.querySelector('.intro-actor'), g = cv.getContext('2d'), pctEl = root.querySelector('.intro-pct b'), cells = [...root.querySelectorAll('.intro-cells i')], note = root.querySelector('.intro-note'), skip = root.querySelector('.intro-skip');
  const short = seen || reduced, minT = short ? 1100 : 2600, fallback = new Image();
  const level = (() => { try { return parseInt(localStorage.getItem('brainer.level'), 10) || 1; } catch (e) { return 1; } })();
  fallback.src = cfg.fallback || `assets/brainer-${clamp(Math.ceil(level / 10), 1, 10)}.png`;   // the player's own stage, not always the Baby
  if (short) root.classList.add('short');
  if (reduced) root.classList.add('still');
  let t = 0, prev = 0, shown = 0, leaving = 0, finished = false, resolve;
  const done = new Promise(r => { resolve = r; });
  function size() { const d = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth; if (w && cv.width !== Math.round(w * d)) { cv.width = cv.height = Math.round(w * d); } }
  function frame(now) {
    if (finished) return;
    t += Math.min(50, now - (prev || now)); prev = now;   // the clock advances on frames that draw, so a busy start never skips the animation
    size();
    const real = clamp(cfg.progress(), 0, 1) * 100;
    shown = Math.min(real, shown + (short ? 3 : 1.1) * (reduced ? 10 : 1));   // counts up smoothly, never ahead of the real progress
    const p = shown / 100, ready = shown >= 100 && t >= minT;
    const ex = leaving || ready ? 'wink' : p < 0.35 ? 'sleepy' : p < 0.8 ? 'focus' : 'excited';
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const drew = cfg.actor ? cfg.actor(g, cv.width, cv.height, now, ex) : false;
    if (!drew && t > 900 && fallback.complete && fallback.naturalWidth) {
      const s = cv.width * 0.8, x = (cv.width - s) / 2, y = (cv.height - s) / 2 + (reduced ? 0 : Math.sin(now / 420) * cv.width * 0.015);
      g.drawImage(fallback, x, y, s, s);
      const m = g.createRadialGradient(cv.width / 2, y + s * 0.42, 0, cv.width / 2, y + s * 0.42, s * 0.56); m.addColorStop(0.84, '#000'); m.addColorStop(1, 'transparent');
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = m; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over';   // the still's soft floor shadow fades out before its square edge shows
    }
    const pct = String(Math.floor(shown)); if (pctEl.textContent !== pct) pctEl.textContent = pct;
    cells.forEach((c, i) => c.classList.toggle('on', i < Math.round(p * cells.length)));
    const nt = shown >= 100 ? 'Ready!' : p < 0.35 ? 'Waking up your Brainer…' : p < 0.8 ? `Getting ${cfg.what || 'the game'} ready…` : 'Almost there…';
    if (note.textContent !== nt) note.textContent = nt;   // the note is the live region: it speaks on each new step, not every frame
    skip.hidden = !(real >= 100 && !ready);
    if (ready && !leaving) setTimeout(leave, short ? 200 : 650);
    if (ready && !leaving) leaving = -1;
    requestAnimationFrame(frame);
  }
  function leave() {
    if (leaving > 0) return;
    leaving = performance.now(); root.classList.add('out');
    try { sessionStorage.setItem('brainer.intro', '1'); } catch (e) { /* storage blocked: it just plays in full again */ }
    setTimeout(() => { finished = true; root.remove(); resolve(); }, reduced ? 200 : 700);
  }
  root.addEventListener('click', () => { if (cfg.progress() >= 1) leave(); });
  addEventListener('keydown', function k() { if (cfg.progress() >= 1) { leave(); removeEventListener('keydown', k); } });
  requestAnimationFrame(() => { root.classList.add('run'); requestAnimationFrame(frame); });
  return done;
}
window.BrainerIntro = { start, wordmark };
})();
