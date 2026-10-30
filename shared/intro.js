/* The Brainer Games intro, shared by every game. It's about the player's Brainer: it stands big in the middle, doing
   the game's thing (flying its plane, standing on a plot in the foggy valley), and wakes up as the game loads: sleepy, then
   focused, then excited, then a wink at 100%. Under it are the game's wordmark and a 0-100% counter; the studio logo
   sits small in the corner. It opens on black with only the Brainer's visor: its screen lights up, the eyes blink open,
   the light floods out into the game's world and the view pulls back from the visor, which stays the Brainer's own LED
   screen, until the whole robot shows; it holds still there a moment, then starts doing the game's thing. It plays in full once a visit and short after that; a tap or key skips it once loaded.
   A game opened inside brainer.games skips it and starts as soon as it has loaded; ?intro plays it anyway.
   BrainerIntro.start({ title, mark, theme, what, progress, actor, fallback }) returns a promise that resolves when the
   intro has left.
     mark: 'plane', 'fly' or 'fog' picks the wordmark (BrainerIntro.wordmark builds it for the game's own top bar too).
     actor(ctx, w, h, t, ex): the game draws its 3D Brainer into the canvas and returns true, or false while its 3D
     isn't ready yet. After a moment a still stands in: fallback, or else the player's own stage, assets/brainer-N.png
     for the brain level every game keeps in localStorage brainer.level.
     face: [x, y, width, tilt] of the robot's lit screen in the actor's square, as fractions of its side, and its lean in degrees
     (FACES has each game's). */
(() => {
'use strict';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const full = new URLSearchParams(location.search).has('intro');   // ?intro plays it in full every time, to look at it
const seen = !full && (() => { try { return sessionStorage.getItem('brainer.intro') === '1'; } catch (e) { return false; } })();
// in a frame on our own site (an operator's frame is another origin, and keeps the intro)
const onSite = !full && (() => { try { return window.parent !== window && window.parent.location.origin === location.origin; } catch (e) { return false; } })();
// where each game's Brainer has its visor in the actor's square, in the pose it holds as the view pulls back to it
// (measured from the drawn frame; FogRush's is an estimate, it isn't on the site yet)
const FACES = { plane: [0.49, 0.352, 0.236], fog: [0.5, 0.33, 0.2], fly: [0.5, 0.367, 0.295], CHARGE: [0.511, 0.583, 0.32, 10], 'MULTI CHARGE': [0.511, 0.583, 0.32, 10], 'SPACE CRASH': [0.5, 0.347, 0.17] };
const W0 = 36755;   // the clock the robot holds its pose at (see actorClock): a moment the plane flies level and the head looks straight on
// the Brainer's visor, the studio logo (version B, Tornike's pick, 2026-10-27; Marketing kit/logo/brainer-visor.svg): the
// robot's own screen shape, 80 x 44 with corners a third of its height, in screen blue inside a white rim, inline so its
// screen and eyes can light up. small: without the rim (brainer-visor-small.svg), for under 48 px wide, where a rim blurs.
const SCREEN = 74 / 80;   // the screen's share of the rimmed visor's width: the part that lands on the robot's lit screen
const visor = (cls, small) => `<svg class="${cls}" viewBox="0 0 80 44" aria-hidden="true">`
  + (small ? '<rect class="screen" width="80" height="44" rx="15.5" fill="#3550F0"/>'
    : '<rect class="rim" width="80" height="44" rx="15.5" fill="#fff"/>' + (cls === 'boot-visor' ? '<rect class="off" x="3" y="3" width="74" height="38" rx="12.5" fill="#0d1830"/>' : '')
      + '<rect class="screen" x="3" y="3" width="74" height="38" rx="12.5" fill="#3550F0"/>')
  + '<path class="gloss" d="M24 10H56" stroke="#fff" stroke-width="3" stroke-linecap="round"/><rect class="eye" x="21.6" y="15" width="10" height="17" rx="4.6" fill="#fff"/><rect class="eye" x="48.4" y="15" width="10" height="17" rx="4.6" fill="#fff"/></svg>';

function wordmark(mark) {
  if (mark === 'plane') return `<span class="wm wm-plane" role="img" aria-label="Plane Crash"><span class="wm-w wm-top" data-t="PLANE"><b>PLANE</b></span><span class="wm-w wm-main" data-t="CRASH"><b>CRASH</b></span>`
    + '<svg class="wm-swoosh" viewBox="0 0 220 70" aria-hidden="true"><path class="wm-trail" d="M6 60 C 70 68, 140 46, 196 14"/><path class="wm-jet" d="M0 0 L 18 5 L 0 10 L 5 5 Z" transform="translate(192 4) rotate(-28)"/></svg></span>';
  if (mark === 'fly') return `<span class="wm wm-plane" role="img" aria-label="Fly High"><span class="wm-w wm-top" data-t="FLY"><b>FLY</b></span><span class="wm-w wm-main" data-t="HIGH"><b>HIGH</b></span>`
    + '<svg class="wm-swoosh" viewBox="0 0 220 70" aria-hidden="true"><path class="wm-trail" d="M6 64 C 90 64, 150 40, 196 8"/><path class="wm-jet" d="M0 0 L 18 5 L 0 10 L 5 5 Z" transform="translate(192 0) rotate(-36)"/></svg></span>';   // the Aviator-style game, in Plane Crash's lettering
  if (mark === 'fog') return '<span class="wm wm-fog" role="img" aria-label="FogRush"><span class="wm-w wm-cloud" data-t="Fog"><b>Fog</b></span><span class="wm-w wm-gold" data-t="Rush"><b>Rush</b></span><i class="wm-spark" aria-hidden="true"></i></span>';
  return `<span class="wm"><span class="wm-w wm-main" data-t="${mark}"><b>${mark}</b></span></span>`;
}

function start(cfg) {
  // opened on brainer.games the game just starts (Tornike, 2026-10-30): it only waits for what it needs to load
  if (onSite) return new Promise(resolve => { (function wait() { if (cfg.progress() >= 1) resolve(); else setTimeout(wait, 60); })(); });
  const root = document.createElement('div');
  root.className = `intro t-${cfg.theme || cfg.mark || 'plane'}`;
  root.innerHTML = `<div class="intro-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="intro-mark">${visor('mark-visor', true)}<span>BRAINER</span></div>
    <div class="intro-center">
      <canvas class="intro-actor" aria-hidden="true"></canvas>
      <div class="intro-title">${wordmark(cfg.mark || cfg.title)}</div>
      <div class="intro-pct" aria-hidden="true"><b>0</b><span>%</span></div>
      <div class="intro-cells" aria-hidden="true">${'<i></i>'.repeat(12)}</div>
      <small class="intro-note" role="status">Waking up your Brainer…</small>
    </div>
    <button type="button" class="intro-skip" hidden>Skip</button>
    <div class="intro-boot" aria-hidden="true"><i class="boot-dark"></i><i class="boot-light"></i>${visor('boot-visor')}</div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('.intro-actor'), g = cv.getContext('2d'), pctEl = root.querySelector('.intro-pct b'), cells = [...root.querySelectorAll('.intro-cells i')], note = root.querySelector('.intro-note'), skip = root.querySelector('.intro-skip');
  const short = seen || reduced, bootT = reduced ? 400 : short ? 650 : 1200, pullT = reduced ? 0 : short ? 450 : 750, holdT = reduced ? 0 : short ? 100 : 250;
  const actT = bootT + pullT + holdT, minT = actT + (short ? 500 : 900), face = cfg.face || FACES[cfg.mark] || [0.5, 0.32, 0.17], fallback = new Image();
  const boot = root.querySelector('.intro-boot'), bootV = boot.querySelector('.boot-visor');
  const level = (() => { try { return parseInt(localStorage.getItem('brainer.level'), 10) || 1; } catch (e) { return 1; } })();
  fallback.src = cfg.fallback || `assets/brainer-${clamp(Math.ceil(level / 10), 1, 10)}.png`;   // the player's own stage, not always the Baby
  if (short) root.classList.add('short');
  root.style.setProperty('--k', short ? 0.55 : 1);   // a repeat visit plays the same opening at about half the length
  if (reduced) root.classList.add('still');
  let t = 0, prev = 0, shown = 0, leaving = 0, finished = false, booted = false, acting = false, resolve;
  const done = new Promise(r => { resolve = r; });
  function size() { const d = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth; if (w && cv.width !== Math.round(w * d)) { cv.width = cv.height = Math.round(w * d); } }
  /* The robot's own clock. While the logo boots it runs fast (so the 3D screen has switched fully on by the time it shows),
     then it stops at W0, so the robot holds one pose while the view pulls back to it, then it eases into real time. */
  function actorClock() {
    if (!booted) return W0 - 3000 * (1 - clamp(t / bootT, 0, 1));
    const a = t - actT, ramp = 500;
    return W0 + (a <= 0 ? 0 : a < ramp ? a * a / (2 * ramp) : a - ramp / 2);
  }
  function lightsUp() {   // the light floods out, and the view pulls back from the visor to the robot whose screen it is
    if (booted) return;
    booted = true;
    root.classList.add('lit');
    const r = cv.getBoundingClientRect(), b = bootV.getBoundingClientRect();
    const fx = r.left + face[0] * r.width, fy = r.top + face[1] * r.height, vx = b.left + b.width / 2, vy = b.top + b.height / 2;
    const s0 = b.width * SCREEN / (face[2] * r.width), opts = { duration: pullT, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' };
    if (reduced || !cv.animate || !r.width || !b.width) { cv.style.opacity = 1; setTimeout(() => boot.remove(), 250); return; }
    // the robot starts so big its screen is exactly the logo's (the white rim sits on the head's rim round it), and the
    // logo shrinks with it: the same easing keeps them locked
    cv.style.transformOrigin = `${face[0] * 100}% ${face[1] * 100}%`;
    const tilt = face[3] || 0;   // a robot that leans its head: the logo turns with it, the robot starts turned upright
    cv.animate([{ transform: `translate(${vx - fx}px,${vy - fy}px) scale(${s0}) rotate(${-tilt}deg)`, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 }], opts);
    bootV.animate([{ transform: 'translate(0,0) scale(1) rotate(0deg)' }, { transform: `translate(${fx - vx}px,${fy - vy}px) scale(${1 / s0}) rotate(${tilt}deg)` }], opts);
    setTimeout(() => bootV.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }), pullT);   // landed: the 3D screen takes over
    setTimeout(() => boot.remove(), pullT + 400);
  }
  function frame(now) {
    if (finished) return;
    t += Math.min(50, now - (prev || now)); prev = now;   // the clock advances on frames that draw, so a busy start never skips the animation
    size();
    const real = clamp(cfg.progress(), 0, 1) * 100;
    shown = Math.min(real, shown + (short ? 3 : 1.1) * (reduced ? 10 : 1));   // counts up smoothly, never ahead of the real progress
    const p = shown / 100, ready = shown >= 100 && t >= minT;
    const ex = leaving || ready ? 'wink' : p < 0.35 ? 'sleepy' : p < 0.8 ? 'focus' : 'excited';
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const clock = actorClock(), drew = cfg.actor ? cfg.actor(g, cv.width, cv.height, clock, ex) : false;
    if (!booted && t >= bootT) lightsUp();
    if (!acting && t >= actT) { acting = true; root.classList.add('run'); }   // the robot gets going and the game's name pops up
    if (!drew && t > bootT - 200 && fallback.complete && fallback.naturalWidth) {
      const s = cv.width * 0.8, x = (cv.width - s) / 2, y = (cv.height - s) / 2 + (reduced ? 0 : Math.sin(clock / 420) * cv.width * 0.015);
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
  const tap = () => { if (!booted) { t = Math.max(t, bootT); lightsUp(); } else if (cfg.progress() >= 1) { leave(); return true; } return false; };   // the first tap skips the opening
  root.addEventListener('click', tap);
  addEventListener('keydown', function k() { if (tap()) removeEventListener('keydown', k); });
  requestAnimationFrame(() => { root.classList.add('boot'); requestAnimationFrame(frame); });
  return done;
}
window.BrainerIntro = { start, wordmark };
})();
