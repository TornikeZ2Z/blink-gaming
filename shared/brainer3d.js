/* The Brainer in 3D for the games: the character modelled in Blender (models/brainer.glb, through brainer-model.js)
   with its LED visor face, growing through the ten stages of its brain level. This class keeps the games' long-standing
   API (root, body, hands, feet, shadow, setLevel, update(t, ex, o)): expressions become poses of its joints, and the
   model streams in a moment after construction (ready turns true), so callers can build it straight away.
   Also here: the plane, the parachute and the one WebGL stage that draws them all. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { loadBrainer, BrainerRig, STAGES } from './brainer-model.js';
import { guardRenderer } from './gl-guard.js';

let model = null;
export const brainerReady = loadBrainer().then(m => (model = m));
const pearl = () => new THREE.MeshPhysicalMaterial({ color: 0xf7f5ff, roughness: 0.36, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 1, sheenColor: new THREE.Color(0xc4b5ff), sheenRoughness: 0.45 });
const FEET = -1.18;   // where the feet sit in the old frame the games' cameras and props were tuned for
const W = Math.sin;

// An expression as a pose, in Blender's joint angles; t animates it. Cheers and frights lift the arms, sadness droops.
function poseFor(ex, t, stagePose) {
  switch (ex) {
    case 'rest': return stagePose;
    case 'happy': return { armL: [0, 0.8 + W(t / 300) * 0.15, 0], armR: [0, -0.8 - W(t / 300 + 1) * 0.15, 0], head: [0, W(t / 300) * 0.1, 0] };
    case 'wink': return { armR: [-0.5, -2.0 + W(t / 120) * 0.25, 0], head: [0, 0.14, 0] };
    case 'focus': return { body: [0.1, 0, 0], armL: [-0.3, 0.2, 0], armR: [-0.3, -0.2, 0] };
    case 'gulp': return { armL: [-1.15, -0.35, 0], armR: [-1.15, 0.35, 0], body: [0.06, W(t / 28) * 0.02, 0], head: [0.08, 0, 0] };
    case 'phew': return { armL: [0, 2.0, 0], armR: [0, -2.0, 0], hop: 0.12 };
    case 'excited': return { armL: [0, 2.25 + W(t / 90) * 0.1, 0], armR: [0, -2.25 - W(t / 90 + 1) * 0.1, 0], hop: 0.16 };
    case 'ecstatic': return { armL: [0, 2.4, 0], armR: [0, -2.4, 0], body: [0, 0, W(t / 220) * 0.35], hop: 0.2 };
    case 'amazed': return { armL: [0, 1.4, 0], armR: [0, -1.4, 0], body: [-0.12, 0, 0], head: [-0.1, 0, 0] };
    case 'shock': return { armL: [-0.3, 2.4, 0], armR: [-0.3, -2.4, 0], body: [-0.18, 0, 0], lift: 0.06 };
    case 'sad': return { body: [0.2, 0, 0], head: [0.25, W(t / 900) * 0.05, 0], armL: [-0.2, 0.08, 0], armR: [-0.2, -0.08, 0] };
    case 'dizzy': return { body: [0, W(t / 180) * 0.18, W(t / 240) * 0.3], armL: [0, 1.0 + W(t / 200) * 0.3, 0], armR: [0, -1.0 + W(t / 200) * 0.3, 0] };
    case 'love': return { armL: [-1.2, -0.5, 0], armR: [-1.2, 0.5, 0], head: [0, W(t / 400) * 0.12, 0], hop: 0.05 };
    case 'sleepy': return { head: [0.15, 0.25, 0], body: [0.06, 0, 0], armL: [0, 0.05, 0], armR: [0, -0.05, 0] };
    default: return {};
  }
}

export class Brainer {
  constructor(L = 1) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.visible = false; this.root.add(this.body);   // things it carries (FogRush's backpack) ride on its back
    this.hands = [new THREE.Object3D(), new THREE.Object3D()]; this.feet = [new THREE.Object3D(), new THREE.Object3D()];   // kept for old callers; walking is o.walk now
    this.mats = [];
    // a soft contact shadow for standalone views
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sg = sc.getContext('2d'), gr = sg.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(30,16,90,.45)'); gr.addColorStop(1, 'rgba(30,16,90,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = FEET - 0.06; this.root.add(this.shadow);
    // the level badge (FogRush puts it on the backpack), and the old brain-chamber floor and light, which FogRush still tints
    this.badgeCanvas = document.createElement('canvas'); this.badgeCanvas.width = 128; this.badgeCanvas.height = 64;
    this.badgeTex = new THREE.CanvasTexture(this.badgeCanvas); this.badgeTex.colorSpace = THREE.SRGBColorSpace;
    this.floorCanvas = document.createElement('canvas'); this.floorCanvas.width = this.floorCanvas.height = 128;
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(this.floorCanvas) }));
    this.domeLight = new THREE.PointLight(0xffffff, 0);
    this.rig = null; this.neckY = 0; this.last = 0; this.L = 0; this.lift = 0;
    this.setLevel(L);
    if (model) this.attach(); else brainerReady.then(() => this.attach());
  }
  get ready() { return !!this.rig; }
  attach() {
    this.rig = new BrainerRig(model); this.rig.root.position.y = FEET; this.root.add(this.rig.root);
    this.rig.setStage(this.stage - 1, true); this.rig.setPose(STAGES[this.stage - 1].pose); this.rig.update(performance.now(), 0, { instant: true, noFace: true });
    // the carry slot sits on its back, scaled from the old barrel body to the new torso
    this.rig.nodes.Body.add(this.body); this.body.position.set(0, 0.26, 0); this.body.scale.setScalar(0.62); this.body.visible = true;
  }
  setLevel(L) {
    if (L === this.L) return;
    this.L = L; this.stage = Math.ceil(L / 10);
    if (this.rig) this.rig.setStage(this.stage - 1);
    const g = this.badgeCanvas.getContext('2d'); g.clearRect(0, 0, 128, 64);
    const bgr = g.createLinearGradient(0, 0, 128, 0); bgr.addColorStop(0, '#4b36fc'); bgr.addColorStop(1, '#8447fb');
    g.fillStyle = bgr; g.beginPath(); g.roundRect(14, 6, 100, 52, 26); g.fill();
    g.fillStyle = '#ffffff'; g.font = `800 ${L < 100 ? 36 : 30}px FiraGO, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(L), 64, 34);
    this.badgeTex.needsUpdate = true;
    this.domeLight.color.set(STAGES[this.stage - 1].colour);
  }
  /* Poses it for an expression and paints its face. o.seat: in the cockpit, legs away and hands on the rim (o.side
     lifts one toward the hovered path), the head raised to clear the rim; o.walk (0..1): a step of a walk; o.soot: singed
     after a crash; o.noFace: skip the screen (seen from behind); o.power (0..1): the screen switching on; o.reduced. */
  update(t, ex, o = {}) {
    const dt = this.last && t > this.last ? Math.min(0.05, (t - this.last) / 1000) : 0.016; this.last = t;
    const rig = this.rig;
    if (!rig) return;
    const stagePose = STAGES[this.stage - 1].pose, still = o.reduced;
    let p = { ...poseFor(ex, still ? 0 : t, stagePose) };
    if (p.lift > 0 && !p.aura && ex === 'rest' && !still) p.lift *= Math.abs(W(t / 300));   // the teen's jump bounces
    const hop = p.hop && !still ? Math.abs(W(t / 140)) * p.hop : 0;
    if (o.seat) {   // in the cockpit: no hops or sitting, hands on the rim unless it cheers or startles
      const arms = ['phew', 'wink', 'excited', 'ecstatic', 'amazed', 'shock'].includes(ex);
      p = { head: p.head, body: p.body && [p.body[0] * 0.5, p.body[1], p.body[2] * 0.5], armL: arms ? p.armL : [-1.3, 0.25, 0], armR: arms ? p.armR : [-1.3, -0.25, 0] };
      if (!arms && o.side) p[o.side < 0 ? 'armL' : 'armR'] = [-0.4, o.side < 0 ? 1.6 + W(t / 140) * 0.1 : -1.6 - W(t / 140) * 0.1, 0];
    }
    const extra = {};
    if (o.walk != null && !still) {   // a step: legs and arms swing, it leans into the hop
      const sw = W(o.walk * Math.PI * 2), up = W(o.walk * Math.PI);
      Object.assign(extra, { legL: [sw * 0.5, 0, 0], legR: [-sw * 0.5, 0, 0], armL: [-sw * 0.6, 0, 0], armR: [sw * 0.6, 0, 0], body: [0.18 * up, 0, 0] });
    }
    rig.setPose(p); rig.setExtra(extra); rig.setFace(ex); rig.soot(!!o.soot);
    for (const leg of [rig.nodes.LegL, rig.nodes.LegR]) leg.visible = !o.seat;
    rig.update(t, dt, { noFace: o.noFace, power: o.power, bob: o.seat ? 0 : hop + (still ? 0 : W(t / 520) * 0.02), ease: still ? 60 : 8 });
    // where its neck is, for the cockpit and the parachute harness
    this.root.updateMatrixWorld(true);
    const v = rig.nodes.Head.getWorldPosition(new THREE.Vector3()); this.neckY = this.root.worldToLocal(v).y;
    if (o.seat) { this.lift += (-0.25 - (this.neckY - this.lift) - this.lift) * Math.min(1, dt * 10); rig.root.position.y = FEET + this.lift; }   // the head clears the rim whatever its size
    else if (this.lift) { this.lift = 0; rig.root.position.y = FEET; }
    this.shadow.material.opacity = 1 - Math.max(0, rig.lift + hop) * 2;
  }
  // the bottom and top of the figure in root units, for framing portraits
  span() {
    if (!this.rig) return [FEET, 1.3];
    this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(this.rig.root); b.applyMatrix4(this.root.matrixWorld.clone().invert());
    return [b.min.y, b.max.y];
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
// The plane's livery per stage: the pilot's own stage colour.
const LIVERY = STAGES.map(s => s.colour);
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
    this.rigging = new THREE.Group(); this.root.add(this.rigging);   // canopy and lines, raised or lowered to meet the pilot's shoulders
    this.canopy = new THREE.Group(); this.canopy.position.y = 3.3; this.rigging.add(this.canopy);
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
      this.rigging.add(l); this.lines.push(l);
    }
    this.shadow = brainer.shadow;
  }
  update(t, o = {}) {
    const open = o.open ?? 1, fold = o.fold || 0, sway = o.reduced ? 0 : Math.sin(t / 700) * 0.12 * (1 - fold);
    this.rigging.position.y = this.brainer.neckY + 0.12 - 0.55;
    this.root.rotation.z = sway;
    const sc = Math.max(0.05, open);
    this.canopy.scale.set(sc * (1 - fold * 0.3), sc * (1 - fold * 0.75), sc * (1 - fold * 0.3));
    this.canopy.position.set(fold * 2.0, 3.3 - fold * 3.0, -fold * 0.8); this.canopy.rotation.z = -fold * 1.2;
    for (const l of this.lines) l.visible = open > 0.35 && fold < 0.3;
    this.canopy.visible = open > 0.02;
  }
}

// One WebGL renderer for every view of the Brainer; views are drawn into regions of its canvas and copied out. If the
// browser drops its context (too many open on a phone), it is rebuilt on the next draw; dispose() lets it go for good.
export class BrainerStage {
  constructor() {
    this.scene = new THREE.Scene(); this.scene.environmentIntensity = 0.5;
    this.gl = guardRenderer(() => {
      const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
      r.setPixelRatio(1); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
      r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0); r.setScissorTest(true);
      this.scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
      return r;
    }, next => { const [w, h] = this.size; this.size = [0, 0]; if (w) this.setSize(w, h); });
    this.scene.add(new THREE.HemisphereLight(0xf6f2ff, 0x4a37c9, 0.85));
    const key = new THREE.DirectionalLight(0xfff2e6, 2.3); key.position.set(-2.8, 3.4, 3.0); this.scene.add(key);
    const rimL = new THREE.DirectionalLight(0x9a85ff, 2.4); rimL.position.set(3.0, 1.8, -2.6); this.scene.add(rimL);
    const rimC = new THREE.DirectionalLight(0x7fe9ff, 0.6); rimC.position.set(-3, 0.5, -2.5); this.scene.add(rimC);
    const back = new THREE.DirectionalLight(0xf3eeff, 1.3); back.position.set(-1, 3, -4); this.scene.add(back);   // keeps its back lit when it is seen from behind in the plane
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.size = [0, 0];
  }
  get renderer() { return this.gl.renderer; }
  get alive() { return !this.gl.lost; }   // false while its context is gone: the games draw their 2D stand-ins
  get canvas() { return this.gl.renderer.domElement; }
  setSize(w, h) { if (this.size[0] !== w || this.size[1] !== h) { this.renderer.setSize(w, h, false); this.size = [w, h]; } }
  dispose() { this.gl.stop(); this.renderer.dispose(); this.renderer.forceContextLoss(); }
  // Renders `brainer` into the region (x, y, w, h) of the canvas (y from the top), seen from `view`.
  draw(actor, x, y, w, h, view = 'front') {   // actor: a Brainer, the plane or the parachute
    if (!this.gl.check()) return;
    for (const ch of this.scene.children) if (ch.userData.actor) ch.visible = ch === actor.root;
    if (!actor.root.parent) { actor.root.userData.actor = true; this.scene.add(actor.root); }
    actor.root.visible = true;
    const c = this.camera, V = {
      front: [[0.0, 0.25, 7.2], [0, 0.05, 0]], hero: [[1.5, 0.7, 6.9], [0, 0.0, 0]], three: [[2.4, 0.9, 6.6], [0, 0.05, 0]], back: [[0, 1.15, -6.7], [0, 0.3, 0]],
      plane: [[0, 1.85, -8.4], [0, 0.4, 0.6]], chute: [[0.6, 1.7, 13.5], [0, 1.4, 0]],
      planeHero: [[1.3, 1.6, 6.1], [0, 0.5, 0.2]], islandHero: [[2.0, 1.3, 8.2], [0, -0.45, 0]]
    }[view] || [[0, 0.25, 7.2], [0, 0.05, 0]];
    let [eye, at] = V;
    if (actor.span && ['front', 'hero', 'three', 'back'].includes(view)) {   // portraits frame a baby as well as a master
      const [lo, hi] = actor.span(), s = actor.root.scale.y, mid = (lo + hi) / 2 * s, k = Math.max(0.55, (hi - lo) * s / 2.55);
      eye = [eye[0] * k, mid + (eye[1] - 0.05) * k, eye[2] * k]; at = [at[0] * k, mid, at[2] * k];
    }
    c.position.set(...eye); c.lookAt(...at); c.aspect = w / h; c.updateProjectionMatrix();
    if (actor.shadow) actor.shadow.visible = view !== 'back' && view !== 'plane';
    const H = this.size[1];
    this.renderer.setViewport(x, H - y - h, w, h); this.renderer.setScissor(x, H - y - h, w, h);
    this.renderer.render(this.scene, c);
  }
}
