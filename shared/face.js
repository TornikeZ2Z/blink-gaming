/* The effects round the Brainer's head (sparkles, hearts, '!' and zZ), drawn in 2D over the stage stills and the
   3D portrait, in the 500 px art's units. The face itself is the still's, or the LED visor's (led-face.js). */
// roundRect for browsers before Safari 16 and Chrome 99 (iOS 15 phones): both games' 2D drawing uses it, and can run
// before any module; led-face.js carries the same for the 3D Brainer, on the site too
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  r = Math.max(0, Math.min(+r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
};
(() => {
'use strict';
const EXPR = {   // the effects each expression shows round the head; the other expressions show none
  wink: { fx: ['sparkles'] },
  excited: { fx: ['sparkles'] },
  amazed: { fx: ['sparkles', 'excl'] },
  ecstatic: { fx: ['sparkles', 'hearts'] },
  love: { fx: ['sparkles'] },
  sleepy: { fx: ['zz'] }
};
function starOn(g, x, y, r, n, inner) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
function heartPath(g, r) { g.beginPath(); g.moveTo(0, r * 0.9); g.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.7, -r * 1.25, 0, -r * 0.45); g.bezierCurveTo(r * 0.7, -r * 1.25, r * 1.5, -r * 0.1, 0, r * 0.9); g.closePath(); }
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
window.BrainerFace = { faceAround, EXPR };
})();
