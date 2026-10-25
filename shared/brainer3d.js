/* The Brainer in 3D, inspired by the brand art rather than copied from it: a pearl barrel body with a clear coat, a
   curved screen that shows the live face (window.BrainerFace, 14 expressions), a glass dome holding a brain of neurons
   and synapses that grows with the brain level, a ribbed collar, and floating mitten hands and feet. Built from
   primitives, lit like a studio product shot, and posed by expression. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

// Per stage (ten levels each): neuron colours and count (as in the brand book), and the screen's base and glow colours.
const LEVEL = [
  ['#33d66d', '#00ebc0', 2, ['#2f6cf0', '#4b3cf5'], '#18d6e8'], ['#33d66d', '#00ebc0', 3, ['#3d55f5', '#4b36fc'], '#18d6e8'],
  ['#fa7b5b', '#ffc147', 5, ['#2b1fff', '#3a26f2'], '#ffa45c'], ['#fa7b5b', '#ffc147', 7, ['#2b1fff', '#3a26f2'], '#ffa45c'],
  ['#9433ed', '#e36072', 9, ['#4a3bf5', '#5a2ef0'], '#e36fd0'], ['#9433ed', '#e36072', 11, ['#4a3bf5', '#5a2ef0'], '#e36fd0'],
  ['#ed2b4b', '#ed6b6b', 14, ['#4a3bf5', '#5235ee'], '#ff3d5e'], ['#ed2b4b', '#ed6b6b', 17, ['#4a3bf5', '#5235ee'], '#ff3d5e'],
  ['#4b36fc', '#8447fb', 20, ['#7c4bf6', '#6a3ff5'], '#c58bff'], ['#4b36fc', '#8447fb', 24, ['#7c4bf6', '#6a3ff5'], '#c58bff']
];
const SCREEN_W = 600, SCREEN_H = 244;

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const pearl = () => new THREE.MeshPhysicalMaterial({ color: 0xf7f5ff, roughness: 0.36, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 1, sheenColor: new THREE.Color(0xc4b5ff), sheenRoughness: 0.45 });
function rimMaterial(color, power, strength) {   // a fresnel glow that brightens toward the silhouette, for glass edges
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(color) }, p: { value: power }, s: { value: strength } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 c; uniform float p; uniform float s; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), p) * s; gl_FragColor = vec4(c * f, f); }'
  });
}

export class Brainer {
  constructor(L = 1) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const mat = pearl(); this.mats = [mat];
    // barrel body, turned from a profile
    const R = y => 0.87 * Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.08) / 1.02, 4)));   // a soft barrel: full in the middle, rounding off top and bottom
    const prof = [];
    for (let y = -0.94; y <= 0.6001; y += 0.04) prof.push(new THREE.Vector2(Math.max(0.001, R(y)), y));
    prof.push(new THREE.Vector2(0.6, 0.6), new THREE.Vector2(0, 0.6));
    this.torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), mat); this.body.add(this.torso);
    const band = (y0, y1, off, phi0, phiLen) => { const pts = []; for (let i = 0; i <= 16; i++) { const y = y0 + (y1 - y0) * i / 16; pts.push(new THREE.Vector2(R(y) + off, y)); } return new THREE.LatheGeometry(pts, 64, phi0, phiLen); };
    // the face screen: a band of a cylinder hugging the front, painted live from a canvas
    this.screenCanvas = document.createElement('canvas'); this.screenCanvas.width = SCREEN_W; this.screenCanvas.height = SCREEN_H;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas); this.screenTex.colorSpace = THREE.SRGBColorSpace; this.screenTex.anisotropy = 4;
    this.screen = new THREE.Mesh(band(-0.36, 0.48, 0.008, -1.2, 2.4), new THREE.MeshBasicMaterial({ map: this.screenTex, transparent: true, toneMapped: false }));
    this.body.add(this.screen);
    const gloss = new THREE.Mesh(band(-0.34, 0.46, 0.014, -1.15, 2.3), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4, depthWrite: false }));
    this.body.add(gloss);   // glass over the screen catches the light
    // ribbed collar
    const collarMat = pearl(); this.mats.push(collarMat);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.075, 20, 96), collarMat); collar.rotation.x = Math.PI / 2; collar.position.y = 0.6; this.body.add(collar);
    const ribMat = new THREE.MeshPhysicalMaterial({ color: 0xd6ccff, roughness: 0.4, clearcoat: 0.6 });
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, rib = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.08, 4, 8), ribMat); rib.position.set(Math.sin(a) * 0.852, 0.6, Math.cos(a) * 0.852); this.body.add(rib); }   // shallow ribs set into the collar
    // back plate with the level badge, and vents
    const plate = new THREE.Mesh(band(-0.14, 0.3, 0.006, Math.PI - 0.42, 0.84), new THREE.MeshPhysicalMaterial({ color: 0xe6e0ff, roughness: 0.3, clearcoat: 1, side: THREE.DoubleSide }));
    this.body.add(plate);
    this.badgeCanvas = document.createElement('canvas'); this.badgeCanvas.width = 128; this.badgeCanvas.height = 64;
    this.badgeTex = new THREE.CanvasTexture(this.badgeCanvas); this.badgeTex.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(band(0.08, 0.28, 0.012, Math.PI - 0.27, 0.54), new THREE.MeshBasicMaterial({ map: this.badgeTex, transparent: true, toneMapped: false }));
    this.body.add(badge);
    for (let i = 0; i < 3; i++) { const v = new THREE.Mesh(band(-0.03 - i * 0.045, -0.012 - i * 0.045, 0.01, Math.PI - 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x8f80d8, roughness: 0.6, side: THREE.DoubleSide })); this.body.add(v); }
    // glass dome with a fresnel rim, and the brain inside
    this.brain = new THREE.Group(); this.brain.position.y = 0.6; this.body.add(this.brain);
    const fc = document.createElement('canvas'); fc.width = fc.height = 128; this.floorCanvas = fc;   // the floor of the brain chamber, glowing in the level's colour
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(0.74, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), toneMapped: false }));
    this.floor.material.map.colorSpace = THREE.SRGBColorSpace; this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = 0.603; this.body.add(this.floor);
    const domeGeo = new THREE.SphereGeometry(0.775, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, new THREE.MeshPhysicalMaterial({ color: 0xf2eeff, transparent: true, opacity: 0.26, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4, depthWrite: false }));
    dome.position.y = 0.6; dome.scale.y = 0.94; dome.renderOrder = 2; this.body.add(dome);
    const rim = new THREE.Mesh(domeGeo, rimMaterial(0xe9e2ff, 2.4, 1.6)); rim.position.y = 0.6; rim.scale.set(1.002, 0.942, 1.002); rim.renderOrder = 3; this.body.add(rim);
    const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const streak = new THREE.Mesh(new THREE.SphereGeometry(0.79, 32, 6, Math.PI / 2 - 1.05, 0.7, 0.42, 0.2), shine); streak.position.y = 0.6; streak.scale.y = 0.94; streak.renderOrder = 4; this.body.add(streak);   // a window reflection across the glass
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.79, 12, 4, Math.PI / 2 + 0.5, 0.12, 0.5, 0.09), shine); dot.position.y = 0.6; dot.scale.y = 0.94; dot.renderOrder = 4; this.body.add(dot);
    this.mist = new THREE.Mesh(new THREE.SphereGeometry(0.52, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mist.position.y = 0.86; this.mist.scale.y = 0.72; this.mist.renderOrder = 1; this.body.add(this.mist);   // the brain's glow fills the dome
    this.domeLight = new THREE.PointLight(0xffffff, 1.2, 1.6, 2); this.domeLight.position.set(0, 0.95, 0); this.body.add(this.domeLight);
    // floating mitten hands and feet
    const handGeo = new THREE.SphereGeometry(0.17, 32, 24);
    const thumbGeo = new THREE.SphereGeometry(0.075, 20, 14);
    this.hands = [-1, 1].map(sd => {
      const h = new THREE.Mesh(handGeo, mat); h.scale.set(0.9, 1.3, 0.78); h.userData.sd = sd; this.root.add(h);
      const th = new THREE.Mesh(thumbGeo, mat); th.position.set(-sd * 0.1, -0.02, 0.12); th.scale.set(0.85, 0.7, 1); h.add(th);   // a mitten thumb on the inner side
      return h;
    });
    const footGeo = new THREE.SphereGeometry(0.2, 32, 16);
    this.feet = [-1, 1].map(sd => { const f = new THREE.Mesh(footGeo, mat); f.scale.set(1.25, 0.46, 0.92); f.position.set(sd * 0.33, -1.12, 0.06); this.root.add(f); return f; });
    // a soft contact shadow for standalone views
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sg = sc.getContext('2d'), gr = sg.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(30,16,90,.45)'); gr.addColorStop(1, 'rgba(30,16,90,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -1.3; this.root.add(this.shadow);
    this.pose = { y: 0, lean: 0, tilt: 0, turn: 0, sq: 1, hl: [-1.0, -0.08, 0.05, 0.35], hr: [1.0, -0.08, 0.05, -0.35] };
    this.last = 0; this.L = 0; this.setLevel(L);
  }
  setLevel(L) {
    if (L === this.L) return;
    this.L = L; this.stage = Math.ceil(L / 10);
    const [c1, c2] = LEVEL[this.stage - 1], n = Math.round(2 + (L - 1) * 22 / 99);   // the brain gains a neuron every few levels
    for (const ch of [...this.brain.children]) { this.brain.remove(ch); ch.geometry.dispose(); ch.material.dispose(); }
    const rnd = rng(7 + this.stage * 13), nodes = [];   // same layout within a stage, so growth adds neurons rather than reshuffling
    const nm = new THREE.MeshPhysicalMaterial({ color: c1, emissive: new THREE.Color(c2), emissiveIntensity: 0.35, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 });
    while (nodes.length < n) {   // neurons fill the dome, bigger as the brain grows
      const p = new THREE.Vector3((rnd() * 2 - 1) * 0.6, 0.1 + rnd() * 0.55, (rnd() * 2 - 1) * 0.6);
      if (p.length() > 0.62) continue;
      const r = 0.06 + rnd() * (0.06 + L * 0.0008);
      nodes.push({ p, r });
    }
    this.links = [];
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    nodes.forEach((a, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(a.r, 24, 16), nm); m.position.copy(a.p); m.userData.base = a.r; m.userData.i = i; this.brain.add(m);
      if (i === 0) return;
      let best = 0, bd = 1e9; for (let j = 0; j < i; j++) { const d = nodes[j].p.distanceTo(a.p); if (d < bd) { bd = d; best = j; } }
      const b = nodes[best].p, mid = a.p.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a.p);
      const syn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, dir.length(), 8), new THREE.MeshStandardMaterial({ color: c1, emissive: new THREE.Color(c1), emissiveIntensity: 0.4, roughness: 0.4 }));
      syn.position.copy(mid); syn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); this.brain.add(syn);
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), sparkMat); this.brain.add(sp); this.links.push({ a: a.p, b, sp, ph: i * 0.37 });   // a spark running along it
    });
    this.domeLight.color.set(c2); this.mist.material.color.set(c2); this.mist.material.opacity = 0.07 + L * 0.012;
    const fg = this.floorCanvas.getContext('2d'), fr = fg.createRadialGradient(64, 64, 2, 64, 64, 64);
    fr.addColorStop(0, '#3b2f8f'); fr.addColorStop(0.6, '#241a63'); fr.addColorStop(1, '#140e40');
    fg.fillStyle = fr; fg.fillRect(0, 0, 128, 128);
    const gl = fg.createRadialGradient(64, 64, 2, 64, 64, 44); gl.addColorStop(0, c2 + '88'); gl.addColorStop(1, c2 + '00');
    fg.fillStyle = gl; fg.fillRect(0, 0, 128, 128); this.floor.material.map.needsUpdate = true;   // a dark chamber with a glow of the level's colour
    const g = this.badgeCanvas.getContext('2d'); g.clearRect(0, 0, 128, 64);
    const bgr = g.createLinearGradient(0, 0, 128, 0); bgr.addColorStop(0, '#4b36fc'); bgr.addColorStop(1, '#8447fb');
    g.fillStyle = bgr; g.beginPath(); g.roundRect(14, 6, 100, 52, 26); g.fill();
    g.fillStyle = '#ffffff'; g.font = `800 ${L < 100 ? 36 : 30}px FiraGO, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(L), 64, 34);
    this.badgeTex.needsUpdate = true;
  }
  paintScreen(ex, t, o) {
    const g = this.screenCanvas.getContext('2d'), [, , , base, glow] = LEVEL[this.stage - 1], W = SCREEN_W, H = SCREEN_H;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.save(); g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 58); g.clip();
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, base[0]); bg.addColorStop(1, base[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gl = g.createRadialGradient(W * 0.56, -20, 10, W * 0.56, -20, W * 0.5); gl.addColorStop(0, glow); gl.addColorStop(1, glow + '00'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    const edge = g.createLinearGradient(0, 0, 0, H); edge.addColorStop(0, 'rgba(10,6,50,.25)'); edge.addColorStop(0.18, 'rgba(10,6,50,0)'); edge.addColorStop(0.82, 'rgba(10,6,50,0)'); edge.addColorStop(1, 'rgba(10,6,50,.35)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);   // the screen sits a little into the body
    g.translate(W / 2, H / 2 + 2); g.scale(1.4, 1.4);   // the face gets a roomy area on the bigger screen, so nothing is clipped
    if (window.BrainerFace) window.BrainerFace.drawScreenFace(g, this.stage, ex, t, { ...o, visorCol: base[1], clip: [380, 164] });
    g.restore();
    this.screenTex.needsUpdate = true;
  }
  // Poses the body for an expression. o.lookX (-1..1) turns it toward a path; o.seat poses it in the cockpit with its
  // hands on the rim (o.side lifts one toward the hovered path); o.soot singes it after a crash; o.noFace skips the screen.
  update(t, ex, o = {}) {
    const dt = this.last && t > this.last ? Math.min(0.05, (t - this.last) / 1000) : 0.016; this.last = t;   // never negative, so the easing cannot overshoot
    const s = Math.sin, look = o.lookX || 0, k = 1 - Math.exp(-dt * 9);
    const T = { y: s(t / 520) * 0.04, lean: 0.02, tilt: s(t / 1300) * 0.03, turn: look * 0.18, sq: 1, hl: [-1.0, -0.08 + s(t / 430) * 0.04, 0.05, 0.35], hr: [1.0, -0.08 + s(t / 430 + 1) * 0.04, 0.05, -0.35] };
    const up = (h, x, y, z, r) => { h[0] = x; h[1] = y; h[2] = z; h[3] = r; };
    switch (ex) {
      case 'rest': up(T.hr, 1.02, 0.42 + s(t / 260) * 0.05, 0.05, -0.9 + s(t / 260) * 0.25); break;   // a wave, like the art
      case 'focus': T.lean = 0.1; T.turn = look * 0.38; break;
      case 'wink': T.tilt = 0.14; up(T.hr, 1.0, 0.55 + s(t / 120) * 0.06, 0.1, -1.1 + s(t / 120) * 0.3); break;
      case 'gulp': T.sq = 0.95; T.y -= 0.05; T.tilt = s(t / 28) * 0.015; up(T.hl, -0.62, 0.28, 0.55, 0.6); up(T.hr, 0.62, 0.28, 0.55, -0.6); break;
      case 'phew': T.y = Math.abs(s(t / 170)) * 0.12; up(T.hl, -1.05, 0.6, 0.1, 1.1); up(T.hr, 1.05, 0.6, 0.1, -1.1); break;
      case 'happy': T.tilt = s(t / 300) * 0.09; up(T.hl, -1.0, 0.15, 0.1, 0.6); up(T.hr, 1.0, 0.15, 0.1, -0.6); break;
      case 'excited': T.y = Math.abs(s(t / 130)) * 0.14; up(T.hl, -1.08, 0.7 + s(t / 90) * 0.06, 0.1, 1.2); up(T.hr, 1.08, 0.7 + s(t / 90 + 1) * 0.06, 0.1, -1.2); break;
      case 'amazed': T.lean = -0.16; T.sq = 1.05; up(T.hl, -1.18, 0.62, 0.2, 1.3); up(T.hr, 1.18, 0.62, 0.2, -1.3); break;
      case 'ecstatic': T.y = Math.abs(s(t / 140)) * 0.16; T.turn = s(t / 220) * 0.3; up(T.hl, -1.1, 0.75, 0.1, 1.3); up(T.hr, 1.1, 0.75, 0.1, -1.3); break;
      case 'shock': T.lean = -0.2; T.y = 0.06; T.sq = 1.06; up(T.hl, -1.15, 0.5, 0.25, 1.4); up(T.hr, 1.15, 0.5, 0.25, -1.4); break;
      case 'sad': T.lean = 0.24; T.y = -0.08; T.tilt = s(t / 900) * 0.05; up(T.hl, -0.92, -0.42, 0.15, 0.15); up(T.hr, 0.92, -0.42, 0.15, -0.15); break;
      case 'dizzy': T.tilt = s(t / 180) * 0.2; T.turn = s(t / 240) * 0.35; up(T.hl, -1.02, -0.2 + s(t / 200) * 0.1, 0.1, 0.8); up(T.hr, 1.02, -0.2 - s(t / 200) * 0.1, 0.1, -0.8); break;
      case 'love': T.y = Math.abs(s(t / 260)) * 0.07; T.tilt = s(t / 400) * 0.08; up(T.hl, -0.7, -0.3, 0.62, 0.5); up(T.hr, 0.7, -0.3, 0.62, -0.5); break;
      case 'sleepy': T.tilt = 0.2; T.y = -0.04 + s(t / 1200) * 0.02; T.lean = 0.08; up(T.hl, -0.95, -0.38, 0.1, 0.1); up(T.hr, 0.95, -0.38, 0.1, -0.1); break;
    }
    if (o.seat) {   // in the cockpit: no hops, hands on the rim unless it is cheering or startled
      T.y *= 0.35; T.lean *= 0.6; T.sq = 1 + (T.sq - 1) * 0.5;
      const arms = ['phew', 'wink', 'excited', 'ecstatic', 'amazed', 'shock'].includes(ex);
      if (!arms) {
        const lift = sd => o.side === sd ? 0.42 + s(t / 140) * 0.04 : -0.04 + s(t / 430 + sd) * 0.02;
        up(T.hl, -0.98, lift(-1), 0.28, o.side === -1 ? 1.0 : 0.3); up(T.hr, 0.98, lift(1), 0.28, o.side === 1 ? -1.0 : -0.3);
        if (ex === 'gulp') { up(T.hl, -0.9, -0.1 + s(t / 30) * 0.015, 0.3, 0.2); up(T.hr, 0.9, -0.1 - s(t / 30) * 0.015, 0.3, -0.2); }
      }
    }
    const soot = o.soot ? 1 : 0;
    if (this.soot !== soot) { this.soot = soot; for (const m of this.mats) m.color.set(soot ? 0x8d8799 : 0xf7f5ff); }
    for (const f of this.feet) f.visible = !o.seat;
    const P = this.pose;
    for (const key of ['y', 'lean', 'tilt', 'turn', 'sq']) P[key] += (T[key] - P[key]) * k;
    for (const key of ['hl', 'hr']) for (let i = 0; i < 4; i++) P[key][i] += (T[key][i] - P[key][i]) * k;
    this.body.position.y = P.y; this.body.rotation.set(P.lean, P.turn, P.tilt); this.body.scale.set(2 - P.sq, P.sq, 2 - P.sq);
    this.hands.forEach((h, i) => { const q = i ? P.hr : P.hl; h.position.set(q[0], q[1] + P.y, q[2]); h.rotation.z = q[3]; });
    this.feet.forEach((f, i) => { f.position.y = -1.12 + Math.max(0, P.y) * 0.4 + s(t / 520 + i) * 0.01; });
    this.shadow.material.opacity = 1 - Math.max(0, P.y) * 2;
    const pulse = o.reduced ? 1 : 1 + s(t / 300) * 0.06;
    for (const m of this.brain.children) if (m.userData.base) { const q = pulse + s(t / 400 + m.userData.i) * 0.04; m.scale.setScalar(q); }
    for (const l of this.links || []) { const q = ((t / 900) + l.ph) % 1; l.sp.position.lerpVectors(l.a, l.b, q); l.sp.material.opacity = Math.sin(q * Math.PI); }
    this.domeLight.intensity = 1.1 + (o.glow || 0) * 2.5;
    if (!o.noFace) this.paintScreen(ex, t, o);
  }
}

// The plane, from behind and a little above in the game: a glossy fuselage, wings with thickness and dihedral, a
// canted twin tail, a spinning propeller, wingtip lights and contrails. The stripes and fins wear the colour of the
// pilot's stage. The pilot (a Brainer) sits in the cockpit as part of the model.
export class Plane3D {
  constructor(pilot) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const white = pearl(); this.mats = [white];
    this.accent = new THREE.MeshPhysicalMaterial({ color: 0x5a3ffc, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    const wingMat = pearl(); wingMat.side = THREE.DoubleSide; this.mats.push(wingMat);
    const prof = [[0.0, -1.5], [0.12, -1.44], [0.28, -1.15], [0.44, -0.72], [0.56, -0.28], [0.61, 0.1], [0.6, 0.5], [0.53, 0.86], [0.4, 1.1], [0.2, 1.24], [0.0, 1.27]].map(([r, y]) => new THREE.Vector2(r, y));   // a chubby toy fuselage
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), white); hull.rotation.x = Math.PI / 2; this.body.add(hull);   // nose toward +z
    const stripe = new THREE.Mesh(new THREE.LatheGeometry(prof.map(v => new THREE.Vector2(v.x + 0.004, v.y)).slice(1, -1), 48, Math.PI * 0.94, Math.PI * 0.12), this.accent);
    stripe.rotation.x = Math.PI / 2; this.body.add(stripe);   // a racing stripe along the spine
    // cockpit: a padded rim and a dark tub; the pilot sits inside, its lower half hidden by the hull
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.075, 16, 48), white); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.2, 1); rim.position.set(0, 0.56, 0.08); this.body.add(rim);
    const tub = new THREE.Mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshStandardMaterial({ color: 0x1a1240, roughness: 0.9 })); tub.rotation.x = -Math.PI / 2; tub.scale.set(1.05, 1.25, 1); tub.position.set(0, 0.55, 0.08); this.body.add(tub);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16, -0.9, 1.8, 0.35, 0.75), new THREE.MeshPhysicalMaterial({ color: 0xd9f2ff, transparent: true, opacity: 0.32, roughness: 0.03, clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set(0, 0.5, 0.48); this.body.add(glass);   // windscreen ahead of the pilot
    this.pilot = pilot; pilot.root.scale.setScalar(0.4); pilot.root.position.set(0, 0.62, 0.06); this.body.add(pilot.root);
    // wings: a tapered planform, extruded for thickness and bevelled
    const wing = new THREE.Shape(); wing.moveTo(0, -0.46); wing.lineTo(1.85, -0.16); wing.quadraticCurveTo(2.12, -0.02, 1.88, 0.24); wing.lineTo(0, 0.5); wing.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 4, curveSegments: 14 });
    wingGeo.rotateX(Math.PI / 2); wingGeo.translate(0, 0.05, 0);
    const stripeShape = new THREE.Shape(); stripeShape.moveTo(1.2, -0.24); stripeShape.lineTo(1.5, -0.2); stripeShape.lineTo(1.5, 0.3); stripeShape.lineTo(1.2, 0.36); stripeShape.closePath();
    const stripeGeo = new THREE.ShapeGeometry(stripeShape); stripeGeo.rotateX(-Math.PI / 2);
    this.wingtips = [];
    for (const sd of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sd * 0.4, -0.12, 0.1); w.rotation.z = sd * 0.12; w.scale.x = sd; this.body.add(w);
      w.add(new THREE.Mesh(wingGeo, wingMat));
      const st = new THREE.Mesh(stripeGeo, this.accent); st.position.y = 0.105; w.add(st);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: sd < 0 ? 0xff3b58 : 0x33d66d })); lamp.position.set(2.02, 0.06, 0.06); w.add(lamp);
      const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.6), contrailMat()); trail.rotation.x = -Math.PI / 2; trail.position.set(2.02, 0.06, -0.85); w.add(trail);   // a contrail streaming back
      this.wingtips.push(lamp);
    }
    // tail: a small tailplane and two canted fins in the accent colour
    const tp = new THREE.Shape(); tp.moveTo(0, -0.2); tp.lineTo(0.85, -0.05); tp.quadraticCurveTo(0.95, 0.02, 0.85, 0.12); tp.lineTo(0, 0.22); tp.closePath();
    const tpGeo = new THREE.ExtrudeGeometry(tp, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }); tpGeo.rotateX(Math.PI / 2);
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.4, 0); fin.lineTo(0.12, 0.4); fin.quadraticCurveTo(0.04, 0.45, -0.02, 0.38); fin.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }); finGeo.rotateY(-Math.PI / 2);
    for (const sd of [-1, 1]) {
      const t = new THREE.Group(); t.position.set(sd * 0.1, 0.06, -1.2); t.scale.x = sd; this.body.add(t);
      t.add(new THREE.Mesh(tpGeo, wingMat));
      const f = new THREE.Mesh(finGeo, this.accent); f.position.set(0.8, 0.02, -0.2); f.rotation.z = -0.22; t.add(f);
    }
    // propeller: a spinner, three blades and a blur disc
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 32), this.accent); spinner.rotation.x = Math.PI / 2; spinner.position.z = 1.38; this.body.add(spinner);
    const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 14, 48), this.accent); cowl.position.z = 1.05; this.body.add(cowl);   // a coloured ring round the nose
    this.prop = new THREE.Group(); this.prop.position.z = 1.33; this.body.add(this.prop);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2a2163, roughness: 0.5, transparent: true, opacity: 0.38, depthWrite: false });   // see-through, like blades spinning too fast to see
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.02), bladeMat); b.position.y = 0.31; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI * 2 / 3; arm.add(b); this.prop.add(arm); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.66, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })); disc.position.z = 1.34; this.body.add(disc);
    // landing gear: two main wheels on struts and a tail wheel; it folds away after take-off
    this.gear = new THREE.Group(); this.body.add(this.gear);
    const tyre = new THREE.MeshStandardMaterial({ color: 0x241c4a, roughness: 0.75 }), hubMat = new THREE.MeshStandardMaterial({ color: 0xd9d2ff, roughness: 0.3, metalness: 0.4 });
    for (const sd of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), white); strut.position.set(sd * 0.56, -0.5, 0.32); strut.rotation.z = sd * 0.16; this.gear.add(strut);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.07, 14, 28), tyre); wheel.rotation.y = Math.PI / 2; wheel.position.set(sd * 0.6, -0.72, 0.32); this.gear.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 16), hubMat); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); this.gear.add(hub);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), tyre); tail.position.set(0, -0.32, -1.32); this.gear.add(tail);
    this.soot = 0; this.stage = 0;
  }
  // Poses the plane: bank (roll), yaw toward the path, a gentle bob; soot darkens it after a crash.
  update(t, o = {}) {
    this.root.rotation.set(o.pitch || 0, o.yaw || 0, -(o.bank || 0));
    this.body.position.y = o.reduced ? 0 : Math.sin(t / 420) * 0.025;
    this.prop.rotation.z = o.idle ? t / 110 : t / 22;   // idling on the ground, full speed in the air
    const g = o.gear ?? 0; this.gear.visible = g > 0.02; this.gear.scale.set(1, Math.max(0.02, g), 1); this.gear.position.y = (1 - g) * 0.35;
    const blink = (t / 500 | 0) % 2; this.wingtips.forEach((l, i) => { l.material.color.set(blink ? 0xffffff : i ? 0x33d66d : 0xff3b58); });
    const soot = o.soot ? 1 : 0; if (soot !== this.soot) { this.soot = soot; for (const m of this.mats) m.color.set(soot ? 0x8d8799 : 0xf7f5ff); }
    const st = Math.ceil((o.level || 1) / 10); if (st !== this.stage) { this.stage = st; this.accent.color.set(LIVERY[st - 1]); }
    this.pilot.root.visible = o.pilot !== false;
  }
}
// The plane's livery per stage, from the brand book's level colours.
const LIVERY = [0x5a3ffc, 0x1fbf6e, 0xf2703f, 0xff9f2e, 0xb23be6, 0xd94d8a, 0xe8304f, 0xf05a5a, 0x4b36fc, 0x8447fb];
function contrailMat() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.75)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// The parachute: a fabric canopy in brand-coloured panels and suspension lines down to the Brainer's harness. open
// (0..1) unfurls it; fold (0..1) collapses it to the side after landing.
export class Chute3D {
  constructor(brainer) {
    this.root = new THREE.Group(); this.brainer = brainer; this.root.add(brainer.root);
    const c = document.createElement('canvas'); c.width = 512; c.height = 16; const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#5a3ffc'; g.fillRect(i * 64, 0, 64, 16); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.canopy = new THREE.Group(); this.canopy.position.y = 3.3; this.root.add(this.canopy);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.3, 48, 20, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.7, sheen: 1, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide }));
    cap.scale.y = 0.6; cap.position.y = -0.9; this.canopy.add(cap);   // a canopy much wider than its pilot, like a real one
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2eeff, transparent: true, opacity: 0.8 });
    this.lines = [];
    const rimR = 2.3 * Math.sin(Math.PI * 0.42), rimY = 3.3 - 0.9 + 2.3 * Math.cos(Math.PI * 0.42) * 0.6;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      const top = new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR), bot = new THREE.Vector3(Math.cos(a) * 0.32, 0.55, Math.sin(a) * 0.2);
      const len = top.distanceTo(bot), l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), lineMat);
      l.position.copy(top).add(bot).multiplyScalar(0.5); l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      this.root.add(l); this.lines.push(l);
    }
    this.shadow = brainer.shadow;
  }
  update(t, o = {}) {
    const open = o.open ?? 1, fold = o.fold || 0, sway = o.reduced ? 0 : Math.sin(t / 700) * 0.12 * (1 - fold);
    this.root.rotation.z = sway;
    const sc = Math.max(0.05, open);
    this.canopy.scale.set(sc * (1 - fold * 0.3), sc * (1 - fold * 0.75), sc * (1 - fold * 0.3));
    this.canopy.position.set(fold * 2.0, 3.3 - fold * 3.0, -fold * 0.8); this.canopy.rotation.z = -fold * 1.2;
    for (const l of this.lines) l.visible = open > 0.35 && fold < 0.3;
    this.canopy.visible = open > 0.02;
  }
}

// One WebGL renderer for every view of the Brainer; views are drawn into regions of its canvas and copied out.
export class BrainerStage {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setScissorTest(true);
    this.canvas = this.renderer.domElement;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.5;
    this.scene.add(new THREE.HemisphereLight(0xf6f2ff, 0x4a37c9, 0.85));
    const key = new THREE.DirectionalLight(0xfff2e6, 2.3); key.position.set(-2.8, 3.4, 3.0); this.scene.add(key);
    const rimL = new THREE.DirectionalLight(0x9a85ff, 2.4); rimL.position.set(3.0, 1.8, -2.6); this.scene.add(rimL);
    const rimC = new THREE.DirectionalLight(0x7fe9ff, 0.6); rimC.position.set(-3, 0.5, -2.5); this.scene.add(rimC);
    const back = new THREE.DirectionalLight(0xf3eeff, 1.3); back.position.set(-1, 3, -4); this.scene.add(back);   // keeps its back lit when it is seen from behind in the plane
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.size = [0, 0];
  }
  setSize(w, h) { if (this.size[0] !== w || this.size[1] !== h) { this.renderer.setSize(w, h, false); this.size = [w, h]; } }
  // Renders `brainer` into the region (x, y, w, h) of the canvas (y from the top), seen from `view`.
  draw(actor, x, y, w, h, view = 'front') {   // actor: a Brainer, the plane or the parachute
    for (const ch of this.scene.children) if (ch.userData.actor) ch.visible = ch === actor.root;
    if (!actor.root.parent) { actor.root.userData.actor = true; this.scene.add(actor.root); }
    actor.root.visible = true;
    const c = this.camera, V = {
      front: [[0.0, 0.25, 7.2], [0, 0.05, 0]], hero: [[1.5, 0.7, 6.9], [0, 0.0, 0]], three: [[2.4, 0.9, 6.6], [0, 0.05, 0]], back: [[0, 1.15, -6.7], [0, 0.3, 0]],
      plane: [[0, 1.85, -8.4], [0, 0.4, 0.6]], chute: [[0.6, 1.7, 13.5], [0, 1.4, 0]],
      planeHero: [[1.3, 1.6, 6.1], [0, 0.5, 0.2]], islandHero: [[2.0, 1.3, 8.2], [0, -0.45, 0]]
    }[view] || [[0, 0.25, 7.2], [0, 0.05, 0]];
    c.position.set(...V[0]); c.lookAt(...V[1]); c.aspect = w / h; c.updateProjectionMatrix();
    if (actor.shadow) actor.shadow.visible = view !== 'back' && view !== 'plane';
    const H = this.size[1];
    this.renderer.setViewport(x, H - y - h, w, h); this.renderer.setScissor(x, H - y - h, w, h);
    this.renderer.render(this.scene, c);
  }
}
