/* The Brainer's screen face, shared by the game's 2D drawing and the 3D model: 14 expressions drawn with canvas strokes.
   drawScreenFace draws it centred on the screen in the 500 px art's units (the screen is about 280 x 128).
   At rest each level keeps the face of its art: a ring eye and a wink (1-2), happy arcs (3-4), a grin (5-6),
   heart eyes (7-8), glasses (9-10). */
(() => {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
function drawScreenFace(g, L, ex, t, o = {}) {
  const spec = ex === 'rest' ? restFace(L) : EXPR[ex] || restFace(L), k = Math.abs(g.getTransform().a);
  const pop = o.since == null ? 1 : easeBack(clamp((t - o.since) / 220, 0, 1));
  const [cw, ch] = o.clip || [280, 128], glasses = L >= 9;
  g.save(); g.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
  g.save(); g.beginPath(); g.roundRect(-cw / 2, -ch / 2, cw, ch, 30); g.clip();
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineWidth = 13; g.lineCap = g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,.75)'; g.shadowBlur = 18 * k;
  const visorCol = o.visorCol || (L >= 9 ? '#7c4bf6' : L >= 3 ? '#3a26f2' : '#3d4cf2');
  const blink = OPEN_EYES.includes(Array.isArray(spec.eyes) ? spec.eyes[0] : spec.eyes) && !reduced && (t + L * 997) % 3800 < 130;
  const eo = { lookX: spec.look ? o.lookX || 0 : o.lookX * 0.4 || 0, lookY: spec.lookUp ? -0.9 : spec.look ? o.lookY || 0 : 0, pupil: spec.pupil, visorCol };
  [-1, 1].forEach((sd, i) => { const e = Array.isArray(spec.eyes) ? spec.eyes[i] : spec.eyes; faceEye(g, blink && OPEN_EYES.includes(e) ? 'blink' : e, sd, t, eo); });
  if (spec.brows) { g.save(); if (glasses) g.translate(0, -16); faceBrows(g, spec.brows, t); g.restore(); }   // above the frames
  g.save(); if (glasses) g.translate(0, 10); faceMouth(g, spec.mouth, t); g.restore();   // below the frames
  faceFx(g, spec.fx || [], t, k);
  g.restore();
  if (L >= 9) {   // the glasses of the top levels; they slip when the Brainer gets a fright
    g.save(); if (spec.tilt) { g.rotate(0.14); g.translate(0, 8); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 11; g.shadowColor = 'rgba(255,255,255,.75)'; g.shadowBlur = 14 * k;
    for (const sd of [-1, 1]) { g.beginPath(); g.roundRect(sd * 76 - 54, -54, 108, 86, 28); g.stroke(); }   // frames roomy enough for wide or starry eyes
    g.beginPath(); g.moveTo(-22, -24); g.quadraticCurveTo(0, -38, 22, -24); g.stroke();
    g.restore();
  }
  g.restore();
}
window.BrainerFace = { drawScreenFace, faceAround, EXPR, restFace };
})();
