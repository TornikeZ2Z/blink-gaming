/* The Brainer's LED face: a dot-matrix panel of glowing dots on an even blue screen, drawn on a canvas.
   Everything is drawn centred, in screen units: the visor is 360 x 200. Also here: the screen switching on (and off),
   a dot-by-dot change from one face to another, and the stage number for the chest screen. */
// roundRect for browsers before Chrome 99, Safari 16 and Firefox 112 (some run import maps but lack it): the 3D Brainer's
// visor, chest and badge paint with it, on the site (which never loads face.js) and in the games; it runs before them all
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  r = Math.max(0, Math.min(+r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
};
const P = 11;   // dot pitch
const BLUE = '#3550f0', OFF = '#0b1030', WHITE = '#ffffff', PINK = '#ff7aa8', TEAR = '#a9ecff', GOLD = '#ffd56b';
const BM = {   // eye and mouth bitmaps; '#' lights a dot, 'p' lights it pink
  open: ['.###.', '#####', '#####', '#####', '#####', '#####', '.###.'],
  blink: ['#####'],
  upeye: ['.###.', '#####', '#####', '#####', '.....', '.....', '.....'],
  happy: ['..###..', '.#####.', '##...##', '#.....#'],
  closed: ['#.....#', '.#####.'],
  focus: ['....##', '..##..', '......', '.###..', '.###..'],
  sad: ['##....', '..##..', '......', '.###..', '.###..'],
  wide: ['..###..', '.#...#.', '#..##.#', '#..##.#', '#.....#', '.#...#.', '..###..'],
  tiny: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
  half: ['#####', '#####', '.###.'],
  star: ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  spiral: ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#..#.', '#..##..', '.#.....'],
  m_smile: ['#.........#', '.#.......#.', '..#######..'],
  m_smirk: ['.........#', '#.......#.', '.#######..'],
  m_flat: ['#####'],
  m_think: ['....##', '####..'],
  m_big: ['#########', '#.......#', '.#.ppp.#.', '..#####..'],
  m_O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  m_o: ['.#.', '#.#', '.#.'],
  m_wavy: ['##..##..##..', '..##..##..##'],
  m_frown: ['..#####..', '.#.....#.', '#.......#'],
  z: ['####', '..#.', '.#..', '####'],
  plus: ['.#.', '###', '.#.']
};
export const EXPR = {   // the faces the games and the site use
  rest: { eyes: 'open', mouth: 'smile' },
  happy: { eyes: 'happy', mouth: 'smile', fx: ['blush'] },
  focus: { eyes: 'focus', mouth: 'flat', look: 1 },
  wink: { eyes: ['happy', 'closed'], mouth: 'smirk', fx: ['sparkles'] },
  gulp: { eyes: 'wide', mouth: 'wavy', fx: ['sweat'] },
  phew: { eyes: 'closed', mouth: 'smile', fx: ['sweat', 'blush'] },
  excited: { eyes: 'star', mouth: 'big', fx: ['sparkles', 'blush'] },
  amazed: { eyes: 'wide', mouth: 'O', fx: ['sparkles'] },
  ecstatic: { eyes: 'star', mouth: 'big', fx: ['sparkles', 'blush'] },
  shock: { eyes: 'tiny', mouth: 'O' },
  sad: { eyes: 'sad', mouth: 'frown', fx: ['tears'] },
  dizzy: { eyes: 'spiral', mouth: 'wavy' },
  love: { eyes: 'heart', mouth: 'big', fx: ['blush'] },
  sleepy: { eyes: 'half', mouth: 'o', fx: ['zz'] },
  calm: { eyes: 'closed', mouth: 'smile' },
  proud: { eyes: 'happy', mouth: 'smirk', fx: ['blush'] },
  think: { eyes: 'upeye', mouth: 'think' },
  wise: { eyes: 'closed', mouth: 'smile', fx: ['sparkles'] },
  boot: { eyes: 'closed', mouth: 'flat' },   // the power-on faces: eyes shut, then open
  wake: { eyes: 'open', mouth: 'flat' }
};
const clamp01 = v => Math.max(0, Math.min(1, v)), seg = (p, a, b) => clamp01((p - a) / (b - a)), easeOut = q => 1 - (1 - q) ** 3;
const hash = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };

function dots(g, rows, ci, cj, col, mirror, keep) {   // one bitmap, centred on dot (ci, cj); keep(i, j) decides which dots light
  const h = rows.length, w = rows[0].length, i0 = ci - Math.floor(w / 2), j0 = cj - Math.floor(h / 2);
  rows.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '.') return;
    const ii = mirror ? i0 + (w - 1 - i) : i0 + i;
    if (!keep(ii, j0 + j)) return;
    g.fillStyle = c === 'p' ? PINK : col; g.beginPath(); g.arc(ii * P, (j0 + j) * P, 4.3, 0, 7); g.fill();
  }));
}
function grid(g, a = () => 1) {   // the unlit dots, so the panel always reads as LEDs
  g.save(); g.shadowBlur = 0;
  for (let i = -16; i <= 16; i++) for (let j = -9; j <= 9; j++) {
    const k = a(i, j); if (k <= 0) continue;
    g.fillStyle = `rgba(255,255,255,${0.09 * k})`; g.beginPath(); g.arc(i * P, j * P, 3.2, 0, 7); g.fill();
  }
  g.restore();
}
function face(g, ex, t, o, keep) {   // the lit dots of one expression
  const sp = EXPR[ex] || EXPR.rest, fx = sp.fx || [];
  g.save(); g.shadowColor = 'rgba(190,235,255,.9)'; g.shadowBlur = 16 * o.k;
  const lx = sp.look ? Math.round(Math.sin(t / 900)) : 0;
  [-1, 1].forEach((sd, n) => {
    let e = Array.isArray(sp.eyes) ? sp.eyes[n] : sp.eyes; if (e === 'open' && o.blink) e = 'blink';
    dots(g, BM[e] || BM.open, sd * 6 + lx, -2, WHITE, sd < 0 && (e === 'focus' || e === 'sad'), keep);
  });
  dots(g, BM['m_' + sp.mouth] || BM.m_smile, 0, 5, WHITE, false, keep);
  if (fx.includes('blush')) for (const sd of [-1, 1]) dots(g, ['ppp'], sd * 11, 3, PINK, false, keep);
  if (fx.includes('tears')) { const q = Math.floor(t / 250) % 3; for (const sd of [-1, 1]) dots(g, ['#'], sd * 7, 2 + q, TEAR, false, keep); }
  if (fx.includes('sweat')) dots(g, BM.plus, 12, -5 + Math.floor(t / 400) % 2, TEAR, false, keep);
  if (fx.includes('sparkles')) [[-13, -6], [13, -6], [-13, 6], [13, 6]].forEach(([i, j], n) => { if ((Math.floor(t / 300) + n) % 2) dots(g, BM.plus, i, j, n % 2 ? GOLD : WHITE, false, keep); });
  if (fx.includes('zz')) dots(g, BM.z, 12, -5, WHITE, false, keep);
  g.restore();
}
function drawOff(g, sheen) {   // the dark glass of a switched-off screen, with a soft reflection
  g.fillStyle = OFF; g.fillRect(-180, -100, 360, 200);
  const s = g.createLinearGradient(-180, -100, 60, 100);
  s.addColorStop(0, `rgba(255,255,255,${0.13 * sheen})`); s.addColorStop(0.42, `rgba(255,255,255,${0.03 * sheen})`); s.addColorStop(0.43, 'rgba(255,255,255,0)');
  g.fillStyle = s; g.fillRect(-180, -100, 360, 200);
}

/* draw(g, ex, t, o): the whole screen.
   o.power (0..1, default 1): 0 is off; on the way up a power dot flickers, stretches into a line, the line opens into
     the blue, the LEDs ripple out from the middle, the face lights dot by dot with its eyes shut, then they open and blink.
     Run it backwards to switch off. It can follow time, or a loading bar.
   o.from + o.mix (0..1): a face change in progress, the old face's dots going out as the new one's come on.
   o.blink: the open eyes are shut this frame.  o.k: the canvas scale, for the glow. */
export function draw(g, ex, t, o = {}) {
  o = { k: 1, power: 1, ...o };
  const p = o.power;
  if (p >= 1) {
    g.fillStyle = BLUE; g.fillRect(-180, -100, 360, 200); grid(g);
    if (o.from && o.mix != null && o.mix < 1) {   // a face change, dot by dot
      face(g, o.from, t, o, (i, j) => hash(i, j) >= o.mix);
      face(g, ex, t, o, (i, j) => hash(i + 40, j) < o.mix);
    } else face(g, ex, t, o, () => true);
    return;
  }
  const s1 = seg(p, 0.12, 0.22), s2 = seg(p, 0.22, 0.36), s3 = seg(p, 0.36, 0.5), s4 = seg(p, 0.5, 0.7), s5 = seg(p, 0.7, 0.86), s6 = seg(p, 0.86, 1);
  g.save(); drawOff(g, 1 - s3);
  if (s3 > 0) { const h = easeOut(s3) * 200; g.globalAlpha = 0.55 + 0.45 * s3; g.fillStyle = BLUE; g.fillRect(-180, -h / 2, 360, h); g.globalAlpha = 1; }
  g.shadowColor = 'rgba(200,245,255,.95)'; g.shadowBlur = 22 * o.k; g.fillStyle = '#e6f8ff';
  if (s2 > 0 && s3 < 1) {
    const w = 8 + easeOut(s2) * 352, th = 4 + s3 * 16; g.globalAlpha = 1 - s3; g.beginPath(); g.roundRect(-w / 2, -th / 2, w, th, th / 2); g.fill(); g.globalAlpha = 1;
  } else if (s1 > 0 && s2 === 0) {
    if ([1, 0, 1, 0, 0, 1, 1, 1][Math.min(7, Math.floor(s1 * 8))]) { g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); }
  }
  g.restore();
  if (s3 < 1) return;
  grid(g, (i, j) => clamp01((s4 * 1.5 - Math.hypot(i / 16, j / 9) / 1.42) / 0.5));
  if (s5 <= 0) return;
  const shown = s5 < 1 || s6 < 0.35 ? 'boot' : s6 < 0.6 ? 'wake' : s6 < 0.7 ? 'boot' : ex, r = easeOut(s5);
  face(g, shown, t, o, (i, j) => hash(i, j) < r);
}

const DIGITS = {
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..']
};
/* drawNumber(g, n, o): the stage number for the chest screen, in the same dots (360 x 200 units).
   o.power below 1 dims it with the face's screen. */
export function drawNumber(g, n, o = {}) {
  o = { k: 1, power: 1, ...o };
  const Q = 22, str = String(n), cols = str.length * 6 - 1, i0 = -Math.floor(cols / 2), on = seg(o.power, 0.5, 0.8);
  g.fillStyle = on > 0 ? BLUE : OFF; g.fillRect(-180, -100, 360, 200);
  if (on <= 0) return;
  g.save(); g.globalAlpha = on; g.fillStyle = 'rgba(255,255,255,.1)';
  for (let i = -7; i <= 7; i++) for (let j = -4; j <= 4; j++) { g.beginPath(); g.arc(i * Q, j * Q, 6, 0, 7); g.fill(); }
  g.shadowColor = 'rgba(190,235,255,.9)'; g.shadowBlur = 16 * o.k; g.fillStyle = WHITE;
  [...str].forEach((ch, d) => DIGITS[ch].forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '#') { g.beginPath(); g.arc((i0 + d * 6 + i) * Q, (j - 3) * Q, 8.5, 0, 7); g.fill(); }
  })));
  g.restore();
}
