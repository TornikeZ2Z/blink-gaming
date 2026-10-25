/* The Brainer as a three.js rig, built from the Blender model (models/brainer.glb). The website showcase and both
   games use it. A rig grows to any of the ten stages: size, longer legs, colour and the accessory of its pair of
   stages, popping in. It takes poses on its joints (Body, Head, ArmL, ArmR, LegL, LegR) and paints its LED visor and
   chest number live, switching the screen on and off and changing faces dot by dot.
   loadBrainer() resolves to the shared model; new BrainerRig(model) makes one character from it. */
import * as THREE from 'three';
import { loadGLB } from './glb-lite.js';
import { draw as drawFace, drawNumber } from './led-face.js';

export const MODEL_URL = new URL('./models/brainer.glb', import.meta.url).href;
// pose angles are Blender's (x, y, z) rotations, as in the Blender kit; lift is in model units
export const STAGES = [
  { name: 'Baby', face: 'amazed', colour: '#58B7FF', pose: { legL: [-1.45, 0, 0], legR: [-1.45, 0, 0], lift: -0.25, armL: [-0.5, 0.45, 0], armR: [-0.5, -0.45, 0], head: [0, 0.12, 0] } },
  { name: 'Toddler', face: 'love', colour: '#16C79A', pose: { armL: [-0.9, 1.75, 0], armR: [-0.9, -1.75, 0], head: [-0.12, 0, 0] } },
  { name: 'Kid', face: 'wink', colour: '#F2703F', pose: { armR: [-0.5, -2.0, 0], head: [0, 0.12, -0.1] } },
  { name: 'School kid', face: 'happy', colour: '#F59A2A', pose: { armR: [-0.15, -2.45, 0], armL: [0, 0.15, 0], body: [0, -0.06, 0] } },
  { name: 'Teen', face: 'excited', colour: '#E3488F', pose: { lift: 0.35, legL: [0, 0.35, 0], legR: [0, -0.35, 0], armL: [0, 2.15, 0], armR: [0, -2.15, 0] } },
  { name: 'Student', face: 'proud', colour: '#8447FB', pose: { legL: [-0.45, 0, 0], legR: [0.45, 0, 0], armL: [0.5, 0, 0], armR: [-0.5, 0, 0], body: [0, 0, 0.12] } },
  { name: 'Young pro', face: 'rest', colour: '#5A3FFC', pose: { armR: [-0.3, -1.3, 0], armL: [0, 0.1, 0], head: [0, 0, 0.25] } },
  { name: 'Pro', face: 'think', colour: '#3B3A8F', pose: { armR: [-1.7, -0.6, 0], armL: [-1.0, -0.4, 0], head: [-0.06, -0.12, 0.1] } },
  { name: 'Expert', face: 'calm', colour: '#9B2C5A', pose: { armL: [0.7, 0.1, 0], armR: [0.7, -0.1, 0], body: [-0.06, 0, 0], head: [-0.08, 0, 0] } },
  { name: 'Master', face: 'wise', colour: '#4A1C9E', pose: { armL: [0, 1.25, 0], armR: [0, -1.25, 0], lift: 0.25, aura: true, head: [-0.08, 0, 0] } }
];
export const ACCESSORY = [null, 'Scarf', 'Cap', 'BowTie', 'GradCap'];   // one per pair of stages
export const JOINTS = { Body: 'body', Head: 'head', ArmL: 'armL', ArmR: 'armR', LegL: 'legL', LegR: 'legR' };
export const blenderEuler = ([a, b, c] = [0, 0, 0]) => new THREE.Euler(a, c, -b, 'YZX');   // Blender's z-up angles in three's y-up frame
const OWN = ['Accent', 'AccCap', 'AccBowTie', 'AccTassel', 'Screen', 'ChestScreen', 'White', 'Joint', 'AntennaTip'];   // materials each rig changes for itself
const easeBack = q => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2;
const clamp01 = v => Math.max(0, Math.min(1, v));

let model = null;
export const loadBrainer = (url = MODEL_URL) => model || (model = loadGLB(url, THREE));

export class BrainerRig {
  constructor(tpl) {
    this.root = new THREE.Group();   // feet on y = 0, facing +z
    this.model = tpl.scene.clone(true); this.root.add(this.model);
    const n = this.nodes = {}, own = this.materials = {};
    this.model.traverse(o => {
      if (o.name) n[o.name] = o;
      if (o.isMesh) { o.castShadow = true; if (OWN.includes(o.material.name)) o.material = own[o.material.name] || (own[o.material.name] = o.material.clone()); }
    });
    this.white = own.White.color.clone();
    this.base = {};
    for (const k of [...Object.keys(JOINTS), 'Brainer']) this.base[k] = { p: n[k].position.clone(), q: n[k].quaternion.clone() };
    this.legParts = {};
    for (const sd of ['L', 'R'])   // the parts of each leg that move when it grows longer
      this.legParts[sd] = [['Boot', 'Boot' + sd], ['Sole', 'Sole' + sd], ['Thigh', 'Thigh' + sd], ['Ankle', `Thigh${sd}_end1`]]
        .filter(([, name]) => n[name]).map(([k, name]) => ({ k, n: n[name], y: n[name].position.y, sy: n[name].scale.y }));
    this.acc = {};   // the accessories, each a list of its parts
    for (const [name, o] of Object.entries(n)) { const m = /^Acc(\w+?)_/.exec(name); if (m) (this.acc[m[1]] = this.acc[m[1]] || []).push({ n: o, s: o.scale.clone() }); }
    this.visor = this.screen(1024, 569, 'Screen', 73); this.chest = this.screen(512, 284, 'ChestScreen', 40);
    this.eased = {}; this.target = {}; this.extra = {};
    for (const k of Object.keys(JOINTS)) { this.eased[k] = this.base[k].q.clone(); this.target[k] = this.base[k].q.clone(); }
    Object.assign(this, { stage: 0, age: 0, lift: 0, liftTo: 0, face: 'rest', from: null, mixAt: -1, power: 1, powerTo: 1, accAt: -1, accFrom: null, sooty: false });
    this.setStage(0, true);
  }
  screen(w, h, name, round) {   // a screen painted from a canvas: dark glass when off, an even glow when on
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
    const mat = this.materials[name];
    Object.assign(mat, { color: new THREE.Color(0x000000), map: tex, emissiveMap: tex, alphaTest: 0.5, toneMapped: false });
    mat.emissive.set(0xffffff); mat.emissiveIntensity = 1;
    return { c, g: c.getContext('2d'), tex, mat, round, key: '' };
  }
  paint(s, fn) {
    const g = s.g, k = s.c.width / 360; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, s.c.width, s.c.height);
    g.setTransform(k, 0, 0, k, s.c.width / 2, s.c.height / 2); g.save(); g.beginPath(); g.roundRect(-180, -100, 360, 200, s.round); g.clip(); fn(g, k); g.restore();
    s.tex.needsUpdate = true;
  }
  // stage 0..9: the colour now; size and accessory change over the next frames
  setStage(s, instant = false) {
    s = Math.max(0, Math.min(9, s | 0));
    const pair = k => Math.ceil((k + 1) / 2) - 1;
    if (pair(s) !== pair(this.stage) || this.accAt < 0) { this.accFrom = ACCESSORY[pair(this.stage)]; this.accAt = instant ? -1e9 : performance.now(); }
    this.stage = s; if (instant) this.age = s / 9;
    const c = new THREE.Color(STAGES[s].colour);
    for (const m of ['Accent', 'AccCap', 'AccBowTie', 'AccTassel']) if (this.materials[m]) this.materials[m].color.copy(c);
    this.accent = c.clone(); if (this.sooty) this.soot(true, true);
  }
  // a pose: joint angles in Blender's terms, plus lift; joints left out go back to rest
  setPose(p = {}) {
    for (const [k, key] of Object.entries(JOINTS)) this.target[k].copy(this.base[k].q).multiply(new THREE.Quaternion().setFromEuler(blenderEuler(p[key])));
    this.liftTo = p.lift || 0;
  }
  // small extra turns on top of the eased pose this frame (a wave, a look), in Blender's terms
  setExtra(e = {}) { this.extra = e; }
  setFace(ex) { if (ex && ex !== this.face) { this.from = this.face; this.face = ex; this.mixAt = performance.now(); } }
  soot(on, force = false) {   // singed grey after a crash
    if (on === this.sooty && !force) return; this.sooty = on;
    this.materials.White.color.copy(on ? new THREE.Color(0x8d8799) : this.white);
    this.materials.Accent.color.copy(on ? new THREE.Color(0x6d6880) : this.accent);
  }
  // each frame: dt in seconds; o.instant skips the easing; o.bob lifts it a little
  update(now, dt, o = {}) {
    const k = o.instant ? 1 : 1 - Math.exp(-dt * (o.ease || 8)), n = this.nodes;
    if (this.powerTo !== this.power && o.power == null) this.power = this.powerTo > this.power ? Math.min(1, this.power + dt / 2.8) : Math.max(0, this.power - dt / 1.2);
    if (o.power != null) this.power = o.power;
    this.age += (this.stage / 9 - this.age) * (o.instant ? 1 : 1 - Math.exp(-dt * 5));
    const a = this.age, dz = 0.3 * a, scale = 0.74 + 0.26 * a;
    n.Brainer.scale.setScalar(scale);
    n.Head.scale.setScalar(1.14 - 0.22 * a);
    n.Body.position.y = this.base.Body.p.y + dz;
    for (const sd of ['L', 'R']) {   // longer legs: the hips rise, the boots stay on the ground, the thighs stretch
      n['Leg' + sd].position.y = this.base['Leg' + sd].p.y + dz;
      for (const part of this.legParts[sd]) {
        if (part.k === 'Thigh') { part.n.scale.y = part.sy * (0.1616 + dz) / 0.1616; part.n.position.y = part.y - dz / 2; }
        else part.n.position.y = part.y - dz;
      }
    }
    for (const j of Object.keys(JOINTS)) {
      this.eased[j].slerp(this.target[j], k);
      n[j].quaternion.copy(this.eased[j]);
      if (this.extra[JOINTS[j]]) n[j].quaternion.multiply(new THREE.Quaternion().setFromEuler(blenderEuler(this.extra[JOINTS[j]])));
    }
    this.lift += (this.liftTo * scale - this.lift) * k;
    n.Brainer.position.y = this.base.Brainer.p.y + this.lift + (o.bob || 0);
    const ka = clamp01((now - this.accAt) / 550), cur = ACCESSORY[Math.ceil((this.stage + 1) / 2) - 1];
    for (const [name, parts] of Object.entries(this.acc)) {
      const v = name === cur ? easeBack(ka) : name === this.accFrom ? 1 - clamp01(ka * 2) : 0;
      for (const { n: p, s } of parts) { p.visible = v > 0.001; p.scale.copy(s).multiplyScalar(Math.max(0.001, v)); }
    }
    if (o.noFace) return;
    const mix = this.mixAt < 0 ? 1 : clamp01((now - this.mixAt) / 420), blink = o.blink ?? ((now + this.stage * 997) % 3800 < 130);
    const fk = `${this.face}|${this.from}|${mix.toFixed(2)}|${this.power.toFixed(3)}|${blink}|${Math.floor(now / 250)}`;
    if (fk !== this.visor.key) { this.visor.key = fk; this.paint(this.visor, (g, s) => drawFace(g, this.face, now, { k: s, power: this.power, from: this.from, mix, blink })); }
    const ck = `${this.stage}|${this.power.toFixed(2)}`;
    if (ck !== this.chest.key) { this.chest.key = ck; this.paint(this.chest, (g, s) => drawNumber(g, this.stage + 1, { k: s, power: this.power })); }
    const off = 1 - clamp01((this.power - 0.3) / 0.2);   // off: dark glass that reflects; on: an even glow
    for (const m of [this.visor.mat, this.chest.mat]) { m.roughness = 1 - 0.88 * off; m.clearcoat = off; m.specularIntensity = 0.6 * off; }
    this.materials.AntennaTip.emissiveIntensity = 3 + 2 * Math.sin(now / 400);
  }
}
