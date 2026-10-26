/* Aim & Break's ship: the pod jet Tornike picked on the design board (2026-10-27). A rounded pearl pod with short swept
   wings and two ring thrusters, the player's Brainer in an open cockpit. Its upgrades are built in, one per row broken:
   the thrusters light up, then grow, wingtip pods and fins appear, edge and hull lights switch on, the cockpit ring and
   then the spine turn gold; after that each row repaints its trim. Same API as Plane3D (root, body, accent, update). */
import * as THREE from 'three';

const pearl = () => new THREE.MeshPhysicalMaterial({ color: 0xf7f5ff, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 1, sheenColor: new THREE.Color(0xc4b5ff), sheenRoughness: 0.45 });
const glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, side: THREE.DoubleSide });
const additive = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const VIOLET = 0x5a3ffc, CYAN = 0x7ff3ff, GOLD = 0xffc147;
export const POD_UPGRADES = ['Thrusters online', 'Big thrusters', 'Wingtip pods', 'Wing fins', 'Edge lights', 'Hull lights', 'Gold cockpit ring', 'Gold spine'];
export const POD_PAINTS = [[0x19c3ff, 'Ice trim'], [0xff3a7a, 'Neon trim'], [0x2bd67a, 'Emerald trim'], [0xffb020, 'Gold trim']];
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);

function tube(a, b, r, mat) {   // a thin rod from a to b
  const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

export class PodJet {
  constructor(pilot) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body); this.body.scale.setScalar(0.86);
    const white = pearl(), wingMat = pearl(); wingMat.side = THREE.DoubleSide;
    this.accent = new THREE.MeshPhysicalMaterial({ color: VIOLET, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    this.gold = new THREE.MeshPhysicalMaterial({ color: GOLD, roughness: 0.22, metalness: 0.85, clearcoat: 1 });
    this.lights = [];   // every glowing material, dimmed together when it powers down: [material, its lit colour]
    const lit = (mat, c) => { this.lights.push([mat, new THREE.Color(c)]); return mat; };
    // the pod: a chubby egg, nose toward +z
    const prof = [[0, -1.35], [0.3, -1.26], [0.55, -0.95], [0.68, -0.42], [0.71, 0.12], [0.64, 0.6], [0.47, 0.95], [0.24, 1.19], [0, 1.27]].map(([r, y]) => new THREE.Vector2(r, y));
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), white); hull.rotation.x = Math.PI / 2; this.body.add(hull);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.045, 12, 64), this.accent); band.position.z = -0.32; this.body.add(band);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12), this.accent); nose.position.z = 1.2; nose.scale.z = 0.8; this.body.add(nose);
    // the open cockpit: a dark tub, a padded rim (gold at tier 7), the Brainer inside
    const tub = new THREE.Mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshStandardMaterial({ color: 0x1a1240, roughness: 0.9 })); tub.rotation.x = -Math.PI / 2; tub.scale.set(1.05, 1.2, 1); tub.position.set(0, 0.6, 0.18); this.body.add(tub);
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 16, 48), white); this.rim.rotation.x = Math.PI / 2; this.rim.scale.set(1, 1.18, 1); this.rim.position.set(0, 0.61, 0.18); this.body.add(this.rim);
    this.rimWhite = white;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16, -0.9, 1.8, 0.35, 0.75), new THREE.MeshPhysicalMaterial({ color: 0xd9f2ff, transparent: true, opacity: 0.3, roughness: 0.03, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set(0, 0.55, 0.55); this.body.add(glass);
    this.pilot = pilot; pilot.root.scale.setScalar(0.47); pilot.root.position.set(0, 0.66, 0.14); this.body.add(pilot.root);
    // short swept wings
    const wing = new THREE.Shape(); wing.moveTo(0, 0.35); wing.lineTo(1.26, -0.38); wing.quadraticCurveTo(1.44, -0.44, 1.38, -0.62); wing.lineTo(0, -0.42); wing.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4, curveSegments: 12 });
    wingGeo.rotateX(Math.PI / 2); wingGeo.translate(0, 0.04, 0);
    this.parts = Array.from({ length: POD_UPGRADES.length }, () => new THREE.Group());   // what each tier adds
    this.parts.forEach(g => this.body.add(g));
    this.thrusters = []; this.exhaust = [];
    const discBase = lit(glow(VIOLET), VIOLET), discLit = lit(glow(CYAN), CYAN), edge = lit(glow(CYAN), CYAN), hullLight = lit(glow(CYAN), CYAN);
    this.discBase = discBase; this.discLit = discLit;
    for (const sd of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sd * 0.55, -0.16, -0.05); w.rotation.z = sd * 0.1; w.scale.x = sd; this.body.add(w);
      w.add(new THREE.Mesh(wingGeo, wingMat));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.5), this.accent); stripe.position.set(0.85, 0.105, -0.25); stripe.rotation.y = 0.5; w.add(stripe);
      // a ring thruster on a short pylon at the back of each side
      const th = new THREE.Group(); th.position.set(sd * 0.78, 0.06, -1.02); this.body.add(th); this.thrusters.push(th);
      th.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 16, 48), this.accent));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), discBase); disc.rotation.y = Math.PI; disc.position.z = -0.1; th.add(disc); th.userData.disc = disc;
      this.body.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.34), white), sd * 0.56, 0.05, -0.98));   // the pylon
      const ex = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.0, 24, 1, true), additive(CYAN)); ex.rotation.x = -Math.PI / 2; ex.position.set(sd * 0.78, 0.06, -1.55); this.parts[1].add(ex); this.exhaust.push(ex);
      // tier 3: little ring pods on the wingtips; tier 4: fins rising from them
      const pod = new THREE.Group(); pod.position.set(sd * 1.95, -0.03, -0.42); this.parts[2].add(pod);
      pod.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 12, 32), this.accent));
      const pd = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), discLit); pd.rotation.y = Math.PI; pod.add(pd);
      pod.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 20), white), 0, 0, 0.16, Math.PI / 2));
      const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.42, 0); fin.lineTo(0.1, 0.42); fin.quadraticCurveTo(0.02, 0.46, -0.03, 0.38); fin.closePath();
      const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }); finGeo.rotateY(-Math.PI / 2);
      const f = new THREE.Mesh(finGeo, this.accent); f.position.set(sd * 1.95, 0.05, -0.2); f.rotation.z = -sd * 0.18; this.parts[3].add(f);
      // tier 5: a light along each wing's leading edge; tier 6: a light strip down each side of the hull
      const a = new THREE.Vector3(sd * 0.6, -0.08, 0.3), b = new THREE.Vector3(sd * 1.82, -0.02, -0.38);
      this.parts[4].add(tube(a, b, 0.018, edge));
      const hl = new THREE.Mesh(new THREE.TorusGeometry(0.705, 0.018, 8, 48, 1.3), hullLight); hl.rotation.set(0, 0, sd < 0 ? Math.PI - 0.65 : -0.65); hl.position.z = 0.32; this.parts[5].add(hl);
      const hl2 = hl.clone(); hl2.position.z = 0.0; hl2.scale.setScalar(1.0); this.parts[5].add(hl2);
    }
    // tier 8: a gold line along the spine, from the cockpit back to the tail
    const spine = [[0, 0.66, -0.2], [0, 0.6, -0.6], [0, 0.42, -1.0], [0, 0.2, -1.28]].map(p => new THREE.Vector3(...p));
    for (let i = 0; i < spine.length - 1; i++) this.parts[7].add(tube(spine[i], spine[i + 1], 0.03, this.gold));
    this.parts.forEach(g => { g.visible = false; });
    this.tier = 0; this.popT = 0; this.paint = -1;
  }
  // o: yaw, pitch, bank, tier (rows broken), popT (when the newest arrived), power (0..1, dark when it powers down),
  // stand (0..1, the Brainer up and facing you), boost (0..1, the exit burn), pilot (false hides it), reduced, now
  update(t, o = {}) {
    this.root.rotation.set(o.pitch || 0, o.yaw || 0, -(o.bank || 0));
    this.body.position.y = 0.14 + (o.reduced ? 0 : Math.sin(t / 420) * 0.03);   // the pod is rounder than the plane: lifted so its belly stays in frame
    const tier = Math.min(o.tier || 0, POD_UPGRADES.length), pop = o.popT ? Math.min(1, (t - o.popT) / 450) : 1;
    this.parts.forEach((g, i) => { g.visible = i < tier; if (i === tier - 1) g.scale.setScalar(Math.max(0.01, easeBack(pop))); else g.scale.setScalar(1); });
    this.parts[1].scale.set(1, 1, 1);   // the exhaust grows with the thrusters instead of popping
    const big = tier >= 2 ? 1 + 0.28 * (tier === 2 ? easeBack(pop) : 1) : 1;
    for (const th of this.thrusters) { th.scale.setScalar(big); th.userData.disc.material = tier >= 1 ? this.discLit : this.discBase; }
    this.rim.material = tier >= 7 ? this.gold : this.rimWhite;
    const paint = (o.tier || 0) > POD_UPGRADES.length ? Math.min(POD_PAINTS.length - 1, o.tier - POD_UPGRADES.length - 1) : -1;
    if (paint !== this.paint) { this.paint = paint; this.accent.color.set(paint >= 0 ? POD_PAINTS[paint][0] : VIOLET); }
    const power = o.power ?? 1, boost = o.boost || 0;
    for (const [m, c] of this.lights) m.color.copy(c).multiplyScalar(0.08 + 0.92 * power);
    this.exhaust.forEach((e, i) => { e.visible = power > 0.05; const f = o.reduced ? 1 : 0.85 + 0.25 * Math.random(); e.scale.set(1 + boost * 0.4, f * (1 + boost * 2.2) * (0.6 + 0.4 * big), 1 + boost * 0.4); e.position.z = -1.02 - 0.5 * e.scale.y; e.material.opacity = 0.75 * power; });
    // the Brainer: turned round and standing up for the win, seated otherwise
    const st = o.stand || 0;
    this.pilot.root.rotation.y = Math.PI * Math.min(1, st * 1.4);
    this.pilot.root.position.y = 0.66 + 0.75 * st;
    this.pilot.root.scale.setScalar(0.47 + 0.4 * st);   // it grows as it stands, so the cheer reads from the game camera
    this.pilot.root.visible = o.pilot !== false;
  }
}
