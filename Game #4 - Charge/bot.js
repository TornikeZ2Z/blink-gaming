/* Charge's Brainer, live in 3D on the Blender set (Tornike, 2026-10-26: "always in motion"). The shared rig
   (shared/brainer-model.js) stands on the pad, seen through the Blender camera of the set (charge_assets.py), so it sits
   exactly where the renders put it. While it waits for the player it breathes, looks round and picks a new little act
   every few seconds; a charge makes it brace and look up at its battery; a safe one sets off a celebration and either
   grows it into its next look or snaps a random piece of gear on; an overcharge makes it dizzy, then it sits down and
   dozes off. window.ChargeBot is what game.js drives; game.js draws the battery, the arcs and the sparkles in 2D. */
import * as THREE from 'three';
import { RoomEnvironment } from '../shared/vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '../shared/vendor/RoundedBoxGeometry.js';
import { loadBrainer, BrainerRig, STAGES, blenderEuler } from '../shared/brainer-model.js';
import { guardRenderer } from '../shared/gl-guard.js';

const REG = { x: 560, y: 60, w: 800, h: 960 };   // the part of the 1920 × 1080 set the Brainer can reach, jumps and wings included
const PAD = 0.24;   // the pad's top, where it stands (Blender z, three y)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const W = Math.sin, rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = v => Math.max(0, Math.min(1, v)), smooth = q => q * q * (3 - 2 * q);
const backOut = q => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2;
const env = q => W(Math.PI * clamp01(q));   // in and out over an act

/* ---------- the stage: the set's camera and light ---------- */
const scene = new THREE.Scene(); scene.environmentIntensity = 0.45;
let size = [0, 0], failed = false;
const gl = guardRenderer(() => {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
  r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const pm = new THREE.PMREMGenerator(r), room = new RoomEnvironment(); scene.environment = pm.fromScene(room, 0.04).texture; pm.dispose(); room.dispose();
  return r;
}, () => { size = [0, 0]; }, () => { failed = true; });
// Blender's camera: (0, −9.6, 3.0) looking at (0, 0, 1.8), 35 mm on a 36 mm sensor across 16:9; y up here, so (x, z, −y)
const camera = new THREE.PerspectiveCamera(2 * Math.atan(18 / 35 * 9 / 16) * 180 / Math.PI, 16 / 9, 0.1, 100);
camera.position.set(0, 3.0, 9.6); camera.lookAt(0, 1.8, 0); camera.setViewOffset(1920, 1080, REG.x, REG.y, REG.w, REG.h);
scene.add(new THREE.HemisphereLight(0xe8eeff, 0x71894c, 1.15));
const sun = new THREE.DirectionalLight(0xffd8a6, 2.7);   // the golden-hour sun, low behind its left shoulder
sun.position.set(-0.512 * 14, 0.259 * 14 + PAD, -0.819 * 14); sun.target.position.set(0, PAD, 0); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5;
Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 4, far: 26 });
const fill = new THREE.DirectionalLight(0xfff1e2, 1.35); fill.position.set(3.5, 4.5, 8.5); scene.add(fill);   // the soft light from the camera's side
const catcher = new THREE.Mesh(new THREE.CircleGeometry(1.3, 72), new THREE.ShadowMaterial({ color: 0x1b2140, opacity: 0.34 }));
catcher.rotation.x = -Math.PI / 2; catcher.position.y = PAD + 0.002; catcher.receiveShadow = true; scene.add(catcher);
const holder = new THREE.Group(); holder.position.y = PAD; scene.add(holder);

/* ---------- gear: a random piece snaps on with a charge that brings no new look ---------- */
const M = {
  glow: new THREE.MeshStandardMaterial({ color: 0xc9f9ff, emissive: 0x55e6ff, emissiveIntensity: 1.5, roughness: 0.3 }),
  violet: new THREE.MeshPhysicalMaterial({ color: 0x5a3ffc, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
  navy: new THREE.MeshPhysicalMaterial({ color: 0x2b2452, roughness: 0.4, metalness: 0.3 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 1, roughness: 0.22, emissive: 0x6b4a00, emissiveIntensity: 0.25 }),
  wing: new THREE.MeshStandardMaterial({ color: 0xbff7ff, emissive: 0x55e6ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.72, roughness: 0.2, depthWrite: false }),
  velvet: new THREE.MeshPhysicalMaterial({ color: 0x4a1c9e, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0xb7a2ff), sheenRoughness: 0.4, side: THREE.DoubleSide })
};
const mesh = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; return m; };
const torus = (R, r, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 14, 48, arc);
const ball = () => new THREE.SphereGeometry(1, 32, 18);
const boltGeo = (() => { const s = new THREE.Shape(); [[0.1, 0.5], [-0.24, -0.04], [0.02, -0.04], [-0.12, -0.5], [0.26, 0.08], [0.0, 0.08]].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }); })();
const capStage = s => [4, 5, 8, 9].includes(s);   // stages that wear a cap or a graduation cap: no headphones over it
// each: the joint it rides on, its parts in that joint's frame (the Blender model's units), and which side it is on
const GEAR = [
  { key: 'bands', name: 'Power bands', on: 'Arm', side: 0, make: sd => [mesh(torus(0.1, 0.032), M.glow, [sd * 0.165, -0.37, 0.02], [Math.PI / 2, 0, -sd * 0.3])] },
  { key: 'pads', name: 'Shoulder pads', on: 'Arm', side: 0, make: sd => [mesh(new RoundedBoxGeometry(0.3, 0.13, 0.3, 3, 0.05), M.violet, [sd * 0.04, 0.12, 0], [0, 0, -sd * 0.35])] },
  { key: 'gloves', name: 'Power gloves', on: 'Arm', side: 0, make: sd => [mesh(ball(), M.violet, [sd * 0.18, -0.48, 0.03], [0, 0, 0], [0.145, 0.165, 0.13])] },
  { key: 'rings', name: 'Knee rings', on: 'Leg', side: 0, make: sd => [mesh(torus(0.105, 0.03), M.glow, [sd * 0.005, -0.1, 0.01], [Math.PI / 2, 0, 0])] },
  { key: 'soles', name: 'Glow soles', on: 'Leg', side: 0, make: sd => [mesh(new RoundedBoxGeometry(0.4, 0.04, 0.5, 2, 0.02), M.glow, [sd * 0.01, -0.36, 0.05])] },
  { key: 'belt', name: 'Power belt', on: 'Body', side: 0, make: () => [mesh(torus(1, 0.045), M.navy, [0, 0.06, 0], [Math.PI / 2, 0, 0], [0.485, 0.415, 1]), mesh(new RoundedBoxGeometry(0.17, 0.12, 0.05, 2, 0.02), M.gold, [0, 0.06, 0.42])] },
  { key: 'badge', name: 'Bolt badge', on: 'Body', side: 1, make: () => [mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 32), M.violet, [-0.3, 0.33, 0.395], [Math.PI / 2, 0, -0.55]), mesh(boltGeo, M.gold, [-0.3, 0.33, 0.405], [0, -0.55, 0], [0.22, 0.22, 0.4])] },
  { key: 'wings', name: 'Energy wings', on: 'Body', side: 0, make: () => [-1, 1].map(sd => mesh(ball(), M.wing, [sd * 0.62, 0.66, -0.5], [0, sd * 0.35, sd * 0.55], [0.55, 0.2, 0.035])) },
  { key: 'bolt', name: 'Antenna bolt', on: 'Head', side: -1, make: () => [mesh(boltGeo, M.gold, [1.03, 1.08, -0.03], [0, 0, -0.2], [0.42, 0.42, 0.6])] },
  { key: 'phones', name: 'Headphones', on: 'Head', side: 0, ok: s => !capStage(s), make: () => [mesh(torus(0.9, 0.045, Math.PI), M.navy, [0, 0.52, -0.02], [0, 0, 0], [1, 0.6, 1]), ...[-1, 1].map(sd => mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.13, 32), M.violet, [sd * 0.99, 0.52, -0.02], [0, 0, Math.PI / 2]))] }
];

/* ---------- the cape: the top look's royal velvet, hung from the shoulders, its hem moving ---------- */
function makeCape() {
  const h = 1.05, geo = new THREE.CylinderGeometry(0.67, 1.0, h, 64, 18, true, Math.PI / 2, Math.PI), p = geo.attributes.position, base = Float32Array.from(p.array);
  const g = new THREE.Group(), cape = mesh(geo, M.velvet); g.add(cape);
  for (const sd of [-1, 1]) g.add(mesh(ball(), M.gold, [sd * 0.6, h / 2 - 0.04, 0.1], [0, 0, 0], [0.065, 0.065, 0.04]));
  g.position.set(0, 0.52 - h / 2, 0.02);
  g.userData.wave = t => {   // folds that widen to the hem, the hem lifting back, and a slow billow
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], f = (h / 2 - y) / h, a = Math.atan2(x, z), k = 1 + 0.09 * f * W(a * 11);
      p.setXYZ(i, x * k, y, z * k * 0.72 - (0.3 + 0.05 * W(t / 650 + y * 3)) * f * f);
    }
    p.needsUpdate = true; geo.computeVertexNormals();
  };
  g.userData.wave(0);
  return g;
}

/* ---------- acts: idle ones while it waits, cheers after a safe charge ---------- */
// Each returns a pose (eased by the rig), extras (added on top, for quick moves), and hop, spin and a face. Angles are
// Blender's: arms y raises them sideways (left +, right −), x swings them forward (−); head z turns it to its left (−)
// or right (+) of the picture, x nods (− up); legs x kicks forward (−).
const IDLE = {
  wave: { ms: 1900, face: 'wink', f: (q, t) => ({ pose: { armR: [-0.4, -1.55, 0], head: [0, -0.1, -0.12] }, extra: { armR: [0, W(t / 110) * 0.28 * env(q), 0] } }) },
  lookL: { ms: 1700, face: 'think', f: () => ({ pose: { head: [-0.05, 0, -0.55], body: [0, 0, -0.18], armL: [0, 0.2, 0], armR: [0, -0.2, 0] } }) },
  lookR: { ms: 1700, face: 'focus', f: () => ({ pose: { head: [-0.05, 0, 0.55], body: [0, 0, 0.18], armL: [0, 0.2, 0], armR: [0, -0.2, 0] } }) },
  battery: { ms: 1900, face: 'think', f: () => ({ pose: { head: [-0.42, 0, 0.05], body: [-0.06, 0, 0], armR: [-1.6, -0.55, 0], armL: [0, 0.15, 0] } }) },
  dance: { ms: 2600, face: 'happy', f: (q, t) => ({ pose: { armL: [0, 0.95, 0], armR: [0, -0.95, 0] }, extra: { body: [0, W(t / 190) * 0.16 * env(q), W(t / 380) * 0.22 * env(q)], armL: [W(t / 190) * 0.45 * env(q), 0, 0], armR: [-W(t / 190) * 0.45 * env(q), 0, 0], head: [0, -W(t / 190) * 0.12 * env(q), 0] }, hop: Math.abs(W(t / 190)) * 0.06 * env(q) }) },
  stretch: { ms: 1900, face: 'calm', f: () => ({ pose: { armL: [0, 1.75, 0], armR: [0, -1.75, 0], body: [-0.1, 0, 0], head: [-0.15, 0, 0] } }) },
  tap: { ms: 2000, face: 'focus', f: (q, t) => ({ pose: { armL: [0, 0.12, 0], armR: [0, -0.12, 0], body: [0, 0.06, 0] }, extra: { legR: [-Math.abs(W(t / 150)) * 0.32 * env(q), 0, 0] } }) },
  point: { ms: 1600, face: 'wink', f: () => ({ pose: { armR: [-1.45, -0.15, 0], head: [0.04, 0, 0.05], body: [0.04, 0, 0.08] } }) },
  shrug: { ms: 1500, face: 'think', f: q => ({ pose: { armL: [-0.25, 1.0, 0], armR: [-0.25, -1.0, 0], head: [0, 0.2, 0] }, hop: 0.03 * env(q) }) },
  spin: { ms: 1400, face: 'excited', move: true, f: q => ({ pose: { armL: [0, 1.25, 0], armR: [0, -1.25, 0] }, spin: smooth(q) }) },
  hops: { ms: 1300, face: 'excited', move: true, f: q => ({ pose: { armL: [0, 1.6, 0], armR: [0, -1.6, 0] }, hop: Math.abs(W(q * Math.PI * 3)) * 0.16 }) },
  hug: { ms: 1700, face: 'love', f: (q, t) => ({ pose: { armL: [-1.2, -0.5, 0], armR: [-1.2, 0.5, 0] }, extra: { head: [0, W(t / 400) * 0.14 * env(q), 0] } }) },
  sit: { ms: 3000, face: 'rest', f: () => ({ pose: { legL: [-1.45, 0, 0], legR: [-1.45, 0, 0], lift: -0.25, armL: [-0.5, 0.45, 0], armR: [-0.5, -0.45, 0], head: [0, 0.12, 0] } }) }
};
const CHEER = {
  jump: { ms: 1250, face: 'excited', f: q => ({ pose: { armL: [0, 1.75, 0], armR: [0, -1.75, 0] }, extra: { legL: [-0.7 * env(q), 0, 0], legR: [-0.7 * env(q), 0, 0] }, hop: env(q) * 0.5 }) },
  spin: { ms: 1250, face: 'ecstatic', f: q => ({ pose: { armL: [0, 1.3, 0], armR: [0, -1.3, 0] }, spin: smooth(q), hop: env(q) * 0.12 }) },
  pump: { ms: 1250, face: 'proud', f: (q, t) => ({ pose: { armR: [-0.3, -1.75, 0], armL: [0, 0.3, 0], head: [0, -0.08, 0.08] }, extra: { armR: [0, W(t / 85) * 0.3 * env(q), 0] }, hop: Math.abs(W(q * Math.PI * 2)) * 0.08 }) },
  flex: { ms: 1250, face: 'love', f: (q, t) => ({ pose: { armL: [-0.7, 1.35, 0], armR: [-0.7, -1.35, 0], body: [-0.05, 0, 0] }, extra: { body: [0, 0, W(t / 160) * 0.18 * env(q)] } }) },
  cheer: { ms: 1250, face: 'happy', f: (q, t) => ({ pose: { armL: [0, 1.55, 0], armR: [0, -1.55, 0] }, extra: { armL: [0, W(t / 95) * 0.22, 0], armR: [0, W(t / 95 + 1.5) * 0.22, 0] }, hop: Math.abs(W(q * Math.PI * 2)) * 0.1 }) },
  bounce: { ms: 1250, face: 'excited', f: (q, t) => ({ pose: { armL: [0, 0.9, 0], armR: [0, -0.9, 0] }, extra: { body: [0, W(t / 120) * 0.12, 0] }, hop: Math.abs(W(q * Math.PI * 3)) * 0.2 }) }
};
const pickOther = (list, avoid) => { const c = list.filter(k => !avoid.includes(k)); return c[Math.floor(Math.random() * c.length)]; };

/* ---------- the Brainer ---------- */
let rig = null, cape = null;
const gear = {};   // key → { def, parts: [{ o, s }], at, gold }
const B = { look: 1, mode: 'idle', t0: 0, act: '', actT0: 0, actMs: 0, nextAct: 0, recent: [], spin: 0, change: null, changeAt: 0, pops: [] };
// the model (about 570 KB on the wire) is fetched again if a flaky line drops it: three more tries, 1.5, 3 and 6 s apart
const fetchModel = (n = 0) => loadBrainer().catch(e => n >= 3 ? Promise.reject(e) : new Promise(r => setTimeout(r, 1500 * 2 ** n)).then(() => fetchModel(n + 1)));
fetchModel().then(model => {
  rig = new BrainerRig(model); holder.add(rig.root);
  rig.setStage(0, true); rig.face = STAGES[0].face; rig.update(performance.now(), 0, { instant: true });
  cape = makeCape(); rig.nodes.Body.add(cape); cape.visible = false;
  for (const def of GEAR) {
    const parts = [];
    for (const sd of def.on === 'Arm' || def.on === 'Leg' ? [-1, 1] : [0]) {
      const node = rig.nodes[def.on === 'Arm' ? (sd < 0 ? 'ArmL' : 'ArmR') : def.on === 'Leg' ? (sd < 0 ? 'LegL' : 'LegR') : def.on];
      for (const o of def.make(sd)) { node.add(o); o.visible = false; parts.push({ o, s: o.scale.clone(), mat: o.material }); }
    }
    gear[def.key] = { def, parts, on: false, at: -1e9, gold: false };
  }
}).catch(() => { failed = true; });

function setLook(look, now) {
  B.look = look; if (!rig) return;
  rig.setStage(Math.min(look, 10) - 1);
  cape.visible = look >= 11; cape.userData.at = now;
  for (const g of Object.values(gear)) if (g.on && g.def.ok && !g.def.ok(Math.min(look, 10) - 1)) wear(g, false, now);   // headphones come off when a cap goes on
}
function wear(g, on, now) { g.on = on; g.at = now; if (!on) g.gold = false; for (const p of g.parts) p.o.material = p.mat; }
function addGear(now) {   // a piece not worn yet that fits this look; once all are on, one turns gold
  const s = Math.min(B.look, 10) - 1, free = Object.values(gear).filter(g => !g.on && (!g.def.ok || g.def.ok(s)));
  if (free.length) { const g = free[Math.floor(Math.random() * free.length)]; wear(g, true, now); return { name: g.def.name, key: g.def.key, side: g.def.side }; }
  const worn = Object.values(gear).filter(g => g.on && !g.gold);
  if (!worn.length) return null;
  const g = worn[Math.floor(Math.random() * worn.length)]; g.gold = true; g.at = now;
  for (const p of g.parts) p.o.material = M.gold;
  return { name: `Gold ${g.def.name.toLowerCase()}`, key: g.def.key, side: g.def.side };
}
function clearGear(now) { for (const g of Object.values(gear)) if (g.on) wear(g, false, now); }

// where things are on the stage, in the set's 1920 × 1080 pixels
const V = new THREE.Vector3();
function px(o, local) { V.set(...(local || [0, 0, 0])); o.localToWorld(V); V.project(camera); return [REG.x + (V.x + 1) / 2 * REG.w, REG.y + (1 - V.y) / 2 * REG.h]; }

function frame(now, dt) {
  const t = reduced ? 0 : now, s = Math.min(B.look, 10) - 1;
  let pose = { armL: [0.05, 0.24, 0], armR: [0.05, -0.24, 0] }, extra = {}, face = STAGES[s].face, hop = 0, spin = 0, shake = 0;
  // always: breathing, a slow look round, arms swaying a little
  if (!reduced) extra = { body: [W(t / 900) * 0.025, 0, W(t / 2300) * 0.06], head: [W(t / 1700) * 0.04, 0, W(t / 2900) * 0.14], armL: [W(t / 820) * 0.06, 0, 0], armR: [-W(t / 820) * 0.06, 0, 0] };
  const run = (a, q) => { const r = a.f(q, t); Object.assign(pose, r.pose || {}); for (const [k, v] of Object.entries(r.extra || {})) extra[k] = extra[k] ? extra[k].map((x, i) => x + v[i]) : v; hop += r.hop || 0; spin = r.spin || spin; if (a.face) face = a.face; };
  const since = now - B.t0;
  if (B.mode === 'idle' || B.mode === 'cash') {
    if (B.mode === 'cash' && since > 1700) B.mode = 'idle';
    if (B.mode === 'cash') run(CHEER[B.act] || CHEER.cheer, clamp01(since / 1600));
    else {
      if (B.act && now - B.actT0 >= B.actMs) { B.act = ''; B.nextAct = now + rnd(700, 2000); }
      if (!B.act && now >= B.nextAct && !reduced) {
        const pool = Object.keys(IDLE).filter(k => k !== 'sit' || Math.random() < 0.3);
        B.act = pickOther(pool, B.recent); B.recent = [B.act, ...B.recent].slice(0, 3); B.actT0 = now; B.actMs = IDLE[B.act].ms;
      }
      if (B.act) run(IDLE[B.act], (now - B.actT0) / B.actMs);
    }
  } else if (B.mode === 'charge') {   // braced, looking up at the battery as it fills
    const q = clamp01(since / B.chargeMs);
    pose = { armL: [-0.15, 1.6, 0], armR: [-0.15, -1.6, 0], body: [-0.1, 0, 0], head: [-0.32, 0, 0] };
    if (!reduced) extra.body = [0, W(t / 24) * 0.03 * q, 0];
    face = q < 0.55 ? 'focus' : 'gulp';
  } else if (B.mode === 'win') {
    const q = clamp01(since / CHEER[B.act].ms);
    run(CHEER[B.act], q);
    if (B.change && !B.changed && since > 120) {   // the new look grows in, or the gear snaps on, just as it cheers
      B.changed = true;
      if (B.change.look) setLook(B.change.look, now); else { B.gearNow = addGear(now); if (B.gearNow && window.ChargeBot.onGear) window.ChargeBot.onGear(B.gearNow); }
    }
    if (B.change && B.change.look && since < 450) face = 'amazed';
    if (q >= 1) { B.mode = 'idle'; B.act = ''; B.nextAct = now + rnd(500, 1200); }
  } else if (B.mode === 'boom') {   // overcharged: alarmed, then dizzy, then it sits down and dozes off
    if (since < 700) { pose = { armL: [-0.3, 1.8, 0], armR: [-0.3, -1.8, 0], body: [-0.16, 0, 0], head: [-0.35, 0, 0] }; face = 'shock'; if (!reduced) shake = W(t / 18) * 0.035 * (since / 700); }
    else if (since < 1600) { const q = (since - 700) / 900; pose = { armL: [0, 1.0, 0], armR: [0, -1.0, 0] }; if (!reduced) extra = { body: [0, W(t / 170) * 0.2 * (1 - q * 0.5), W(t / 230) * 0.3 * (1 - q * 0.5)] }; face = 'dizzy'; }
    else B.mode = 'off';
  }
  if (B.mode === 'off') {
    pose = { legL: [-1.45, 0, 0.12], legR: [-1.45, 0, -0.12], lift: -0.25, armL: [0.15, 0.2, 0], armR: [0.15, -0.2, 0], body: [0.16, 0, 0], head: [0.32, 0.2, 0] };
    extra = reduced ? {} : { body: [W(t / 1400) * 0.03, 0, 0], head: [W(t / 1400) * 0.04, 0, 0] };
    face = 'sleepy';
  }
  if (B.mode === 'wake') {
    pose = { armL: [0, 1.2, 0], armR: [0, -1.2, 0] }; face = since < 500 ? 'boot' : since < 800 ? 'wake' : 'happy';
    if (since > 1100) { B.mode = 'idle'; B.act = ''; B.nextAct = now + 600; }
  }
  rig.setPose(pose); rig.setExtra(extra); rig.setFace(face);
  rig.update(now, dt, { ease: reduced ? 60 : 9, power: B.mode === 'wake' ? clamp01(since / 900) : 1 });
  B.spin = spin; holder.rotation.y = spin * Math.PI * 2; holder.position.set(shake, PAD + hop, 0);
  // gear pops on (or turns gold) with a bounce; the cape billows
  for (const g of Object.values(gear)) {
    const k = clamp01((now - g.at) / 480), v = g.on ? (g.gold ? 1 + 0.25 * env(k) : backOut(k)) : 1 - clamp01((now - g.at) / 250);
    for (const p of g.parts) { p.o.visible = v > 0.002; p.o.scale.copy(p.s).multiplyScalar(Math.max(0.001, v)); }
  }
  if (cape.visible) { const k = clamp01((now - cape.userData.at) / 600); cape.scale.set(1, backOut(k), 1); if (!reduced) cape.userData.wave(now); }
}

window.ChargeBot = {
  get ready() { return !!rig && !failed; },
  get failed() { return failed; },
  get look() { return B.look; },
  reset(now) { clearGear(now); setLook(1, now); B.mode = B.mode === 'off' || B.mode === 'boom' ? 'wake' : 'idle'; B.t0 = now; B.act = ''; B.nextAct = now + 900; },   // a new round: the gear comes off and it shrinks back to the baby (waking first if it dozed off)
  charge(now, ms) { B.mode = 'charge'; B.t0 = now; B.chargeMs = ms; B.act = ''; },
  // a safe charge: { look } grows it into that look; { gear: true } snaps a random piece on. Returns the gear's name later.
  win(now, change) { B.mode = 'win'; B.t0 = now; B.act = pickOther(Object.keys(CHEER), [B.lastCheer]); B.lastCheer = B.act; B.change = change; B.changed = false; B.gearNow = null; },
  get gearNow() { return B.gearNow; },
  cash(now) { B.mode = 'cash'; B.t0 = now; B.act = Math.random() < 0.5 ? 'cheer' : 'jump'; },
  boom(now) { B.mode = 'boom'; B.t0 = now; },
  get asleep() { return B.mode === 'off'; },
  // the 3D Brainer arrived mid-round (a slow line): it starts out exactly as the still showed it, in its look and gear
  sync(now, look, gears, asleep) {
    if (!rig) return;
    setLook(look, -1e9); rig.setStage(Math.min(look, 10) - 1, true); rig.update(now, 0, { instant: true }); cape.userData.at = -1e9;
    for (let i = 0; i < gears; i++) addGear(-1e9);
    B.mode = asleep ? 'off' : 'idle'; B.t0 = now; B.act = ''; B.nextAct = now + 800;
  },
  // Renders the Brainer for a stage drawn at scale k with the set's top left at (ox, oy), at pixel ratio pr; returns the
  // canvas and where to draw it, and its anchors in stage pixels (head top for the battery, antenna, chest, gear).
  frame(now, dt, k, ox, oy, pr) {
    if (!rig || failed || !gl.check()) return null;
    frame(now, dt);
    const w = Math.max(1, Math.round(REG.w * k * pr)), h = Math.max(1, Math.round(REG.h * k * pr));
    if (size[0] !== w || size[1] !== h) { gl.renderer.setSize(w, h, false); size = [w, h]; }
    gl.renderer.render(scene, camera);
    const P = p => [p[0] * k + ox, p[1] * k + oy], n = rig.nodes;
    const a = { top: P(px(n.HeadShell, [0, 0.62, 0])), head: P(px(n.HeadShell)), tip: P(px(n.AntennaTip1)), chest: P(px(n.ChestScreen)), feet: P(px(holder)) };
    const g = B.gearNow && gear[B.gearNow.key]; if (g) a.gear = P(px(g.parts[0].o));
    return { canvas: gl.renderer.domElement, x: REG.x * k + ox, y: REG.y * k + oy, w: REG.w * k, h: REG.h * k, a };
  }
};
