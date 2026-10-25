/* The Brainer intro: the studio's logo motion and loading screen, shared by every Brainer game with a twist per game.
   Brain cells fly in and link into a network, the logo tile pops in and absorbs them, a light sweeps across it, the
   wordmark rises letter by letter, then the game's own motif plays (here a little plane drawing a dashed trail under
   the title) while a row of neurons lights up with the loading progress. Once the game is ready it opens like an
   iris. The full version plays once a visit and a short one after; a tap or key skips it once loading is done.
   BrainerIntro.start({ title, motif, progress }) returns a promise that resolves when the intro has left. */
(() => {
'use strict';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const seen = (() => { try { return sessionStorage.getItem('brainer.intro') === '1'; } catch (e) { return false; } })();

function start(cfg) {
  const root = document.createElement('div'); root.className = 'intro'; root.setAttribute('role', 'status'); root.setAttribute('aria-label', `Loading ${cfg.title}`);
  root.innerHTML = `<canvas class="intro-net"></canvas>
    <div class="intro-center">
      <div class="intro-tile"><img src="${cfg.logo || 'assets/logo-white.png'}" alt=""><i class="intro-shine"></i></div>
      <div class="intro-word" aria-hidden="true">${[...'BRAINER'].map((c, i) => `<b style="--i:${i}">${c}</b>`).join('')}<span>GAMES</span></div>
      <div class="intro-game"><svg class="intro-motif" viewBox="0 0 400 80" aria-hidden="true"><path class="intro-trail" d="M10 62 C 90 70, 150 20, 230 38 S 350 66, 390 24" /><g class="intro-plane"><path d="M0 0 L 22 6 L 0 12 L 5 6 Z" /></g></svg><strong>${cfg.title}</strong></div>
      <div class="intro-load"><div class="intro-cells">${'<i></i>'.repeat(12)}</div><small>Warming up your Brainer…</small></div>
    </div>
    <button type="button" class="intro-skip" hidden>Skip</button>`;
  document.body.appendChild(root);
  const cv = root.querySelector('.intro-net'), g = cv.getContext('2d'), cells = [...root.querySelectorAll('.intro-cells i')], note = root.querySelector('.intro-load small');
  const short = seen || reduced, T = short ? { net: 0, tile: 0, word: 250, game: 450, min: 1300 } : { net: 0, tile: 1250, word: 1850, game: 2350, min: 3500 };
  root.classList.toggle('short', short); root.classList.toggle('still', reduced);
  root.style.setProperty('--tileDelay', `${T.tile}ms`); root.style.setProperty('--wordDelay', `${T.word}ms`); root.style.setProperty('--gameDelay', `${T.game}ms`);
  const plane = root.querySelector('.intro-plane'), trail = root.querySelector('.intro-trail'), len = trail.getTotalLength();
  trail.style.strokeDasharray = `6 8`; trail.style.strokeDashoffset = '0';
  // brain cells: dots that fly in from the edges, link up in a ring round the logo, then fall into it
  const N = 22, dots = Array.from({ length: N }, (_, i) => { const a = Math.random() * 7, r = 0.7 + Math.random() * 0.5; return { a0: a, r0: r, a: i / N * Math.PI * 2, d: 0.7 + (i % 3) * 0.12, c: ['#8447fb', '#33d66d', '#ffc147', '#ed6b6b', '#ffffff'][i % 5] }; });
  let W = 0, H = 0, t = 0, prev = 0, leaving = 0, finished = false, resolve;   // t only advances on frames that draw, so a busy start never skips the animation
  const done = new Promise(r => { resolve = r; });
  function size() { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); }
  size(); addEventListener('resize', size);
  function frame(now) {
    if (finished) return;
    t += Math.min(34, now - (prev || now)); prev = now;
    const cx = W / 2, cy = H / 2 - Math.min(H * 0.12, 70), R = Math.min(W, H) * 0.24, p = clamp(cfg.progress(), 0, 1);
    g.clearRect(0, 0, W, H);
    if (!short && t < 1500) {   // the network: fly in (0-700), link (450-1050), get absorbed by the logo (1050-1450)
      const fly = easeOut(clamp(t / 700, 0, 1)), suck = clamp((t - 1050) / 400, 0, 1), spin = t / 2400;
      const pts = dots.map(o => { const tx = cx + Math.cos(o.a + spin) * R * o.d, ty = cy + Math.sin(o.a + spin) * R * o.d * 0.8, sx = cx + Math.cos(o.a0) * Math.max(W, H) * o.r0, sy = cy + Math.sin(o.a0) * Math.max(W, H) * o.r0; return [lerp(lerp(sx, tx, fly), cx, easeOut(suck)), lerp(lerp(sy, ty, fly), cy, easeOut(suck)), o.c]; });
      g.lineWidth = 1.5; g.strokeStyle = `rgba(200,180,255,${0.5 * clamp((t - 450) / 400, 0, 1) * (1 - suck)})`;
      g.beginPath(); pts.forEach((q, i) => { const n = pts[(i + 1) % N], m = pts[(i + 5) % N]; g.moveTo(q[0], q[1]); g.lineTo(n[0], n[1]); if (i % 2) { g.moveTo(q[0], q[1]); g.lineTo(m[0], m[1]); } }); g.stroke();
      if (suck > 0.8) { const f = (suck - 0.8) / 0.2; g.fillStyle = `rgba(160,130,255,${0.45 * (1 - f)})`; g.beginPath(); g.arc(cx, cy, 40 + f * 70, 0, 7); g.fill(); }   // a flash as the cells fall into the logo
      for (const [x, y, c] of pts) { g.globalAlpha = 1 - suck * 0.8; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 12; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
      g.globalAlpha = 1; g.shadowBlur = 0;
    }
    // the motif: a little plane flies along the trail, drawing it
    const q = clamp((t - T.game) / (short ? 600 : 900), 0, 1), e = easeOut(q), pt = trail.getPointAtLength(e * len), ahead = trail.getPointAtLength(Math.min(len, e * len + 1));
    plane.style.opacity = q > 0 && q < 1 ? 1 : q >= 1 ? 0 : 0;
    plane.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI}) translate(-11 -6)`);
    trail.style.clipPath = `inset(0 ${100 - e * 100}% 0 0)`;
    cells.forEach((c, i) => c.classList.toggle('on', i < Math.round(p * cells.length)));
    note.textContent = p < 1 ? `Warming up your Brainer… ${Math.round(p * 100)}%` : 'Ready';
    root.classList.toggle('p-tile', t >= T.tile); root.classList.toggle('p-word', t >= T.word); root.classList.toggle('p-game', t >= T.game);   // each beat starts on the intro's own clock
    const ready = p >= 1 && t >= T.min;
    root.querySelector('.intro-skip').hidden = !(p >= 1 && t < T.min);
    if (ready && !leaving) leave();
    requestAnimationFrame(frame);
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  function leave() {
    if (leaving) return;
    leaving = performance.now(); root.classList.add('out');
    try { sessionStorage.setItem('brainer.intro', '1'); } catch (e) { /* storage blocked: it just plays in full again */ }
    setTimeout(() => { finished = true; root.remove(); removeEventListener('resize', size); resolve(); }, reduced ? 200 : 650);
  }
  root.addEventListener('click', () => { if (cfg.progress() >= 1) leave(); });
  addEventListener('keydown', function k() { if (cfg.progress() >= 1) { leave(); removeEventListener('keydown', k); } });
  requestAnimationFrame(() => { root.classList.add('ready'); requestAnimationFrame(frame); });
  return done;
}
window.BrainerIntro = { start };
})();
