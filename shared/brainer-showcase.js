/* The Brainer showcase: the 3D character for the website. It switches its screen on, then grows through its ten
   stages, each with its own pose, LED face, colour and accessory; visitors can pick a stage, try faces, switch it off
   and on, and turn it round.
   mountShowcase(el, { model, ui, autoplay, step }) returns { setStage, setFace, setPower, destroy }; step is the autoplay's ms per stage.
   The page maps 'three' to shared/vendor/three.module.min.js with an import map, as the games do. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { loadGLB } from './glb-lite.js';
import { draw as drawFace, drawNumber } from './led-face.js';

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
const ACCESSORY = [null, 'Scarf', 'Cap', 'BowTie', 'GradCap'];   // one per pair of stages
export const FACES = [['happy', 'Happy'], ['wink', 'Wink'], ['excited', 'Excited'], ['love', 'Love'], ['amazed', 'Wow'], ['think', 'Thinking'], ['shock', 'Shock'], ['sad', 'Sad'], ['dizzy', 'Dizzy'], ['sleepy', 'Sleepy']];
const JOINTS = ['Body', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR'];
const POSE_KEY = { Body: 'body', Head: 'head', ArmL: 'armL', ArmR: 'armR', LegL: 'legL', LegR: 'legR' };
const blenderEuler = ([a, b, c] = [0, 0, 0]) => new THREE.Euler(a, c, -b, 'YZX');   // Blender's z-up angles in three's y-up frame
const easeBack = q => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2;
const clamp01 = v => Math.max(0, Math.min(1, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CSS = `
.bsc{position:relative;width:100%;height:100%;min-height:360px;touch-action:pan-y;user-select:none}
.bsc canvas{display:block;width:100%;height:100%;cursor:grab}.bsc canvas:active{cursor:grabbing}
.bsc-ui{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:0 12px 14px;pointer-events:none}
.bsc-cap{font:700 15px/1.3 inherit;color:#fff;text-align:center;text-shadow:0 2px 12px rgba(20,10,80,.45)}
.bsc-cap small{display:block;font-weight:500;opacity:.8;font-size:13px}
.bsc-row{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;pointer-events:auto}
.bsc button{font:600 13px/1 inherit;color:#fff;background:rgba(30,18,110,.42);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 11px;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:background .2s,transform .2s}
.bsc button:hover{background:rgba(70,50,230,.6)}.bsc button:active{transform:scale(.96)}
.bsc button[aria-pressed=true]{background:#5a3ffc;border-color:#fff}
.bsc .bsc-n{width:34px;height:34px;padding:0;border-radius:50%}
.bsc .bsc-power{position:absolute;top:12px;right:12px;width:40px;height:40px;padding:0;border-radius:50%;pointer-events:auto;display:grid;place-items:center}
.bsc .bsc-play{position:absolute;top:12px;left:12px;pointer-events:auto}
@media (max-width:560px){.bsc .bsc-n{width:30px;height:30px}.bsc button{font-size:12px;padding:7px 9px}}
`;

export async function mountShowcase(el, opts = {}) {
  const o = { model: new URL('./models/brainer.glb', import.meta.url).href, ui: true, autoplay: true, step: 3400, ...opts };
  if (!document.getElementById('bsc-css')) { const s = document.createElement('style'); s.id = 'bsc-css'; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add('bsc');

  // ---------- renderer, light and stage ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.75;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xfff6ee, 2.2); key.position.set(-3, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3.5, bottom: -1, near: 1, far: 20 });
  scene.add(key, new THREE.HemisphereLight(0xe8e4ff, 0x6a5cff, 0.6));
  const rim = new THREE.DirectionalLight(0xa58bff, 1.4); rim.position.set(3, 3, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const aura = new THREE.Group(); scene.add(aura);   // the master's glow rings
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  [0.62, 0.42].forEach((r, k) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 12, 96), auraMat); m.rotation.x = Math.PI / 2; m.position.y = 0.03 + 0.05 * k; aura.add(m); });

  const { scene: model, nodes, materials } = await loadGLB(o.model, THREE);
  const turn = new THREE.Group(); turn.add(model); scene.add(turn);
  model.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const root = nodes.Brainer, base = {};
  for (const n of [...JOINTS, 'Brainer']) base[n] = { p: nodes[n].position.clone(), q: nodes[n].quaternion.clone() };
  const legParts = {};
  for (const sd of ['L', 'R'])   // the parts of each leg that move when it grows longer
    legParts[sd] = [['Boot', 'Boot' + sd], ['Sole', 'Sole' + sd], ['Thigh', 'Thigh' + sd], ['Ankle', `Thigh${sd}_end1`]]
      .filter(([, name]) => nodes[name]).map(([k, name]) => ({ k, n: nodes[name], y: nodes[name].position.y, sy: nodes[name].scale.y }));
  const acc = {};   // accessory groups, each a list of its parts
  for (const [name, n] of Object.entries(nodes)) { const m = /^Acc(\w+?)_/.exec(name); if (m) (acc[m[1]] = acc[m[1]] || []).push({ n, s: n.scale.clone() }); }

  // ---------- the two screens, painted live ----------
  const screen = (w, h, matName, round) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
    const mat = materials[matName];
    Object.assign(mat, { color: new THREE.Color(0x000000), map: tex, emissiveMap: tex, alphaTest: 0.5, toneMapped: false });
    mat.emissive.set(0xffffff); mat.emissiveIntensity = 1;
    return { c, g: c.getContext('2d'), tex, mat, round, key: '' };
  };
  const visor = screen(1024, 569, 'Screen', 73), chest = screen(512, 284, 'ChestScreen', 40);
  const paint = (s, fn) => {
    const g = s.g, k = s.c.width / 360; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, s.c.width, s.c.height);
    g.setTransform(k, 0, 0, k, s.c.width / 2, s.c.height / 2); g.save(); g.beginPath(); g.roundRect(-180, -100, 360, 200, s.round); g.clip(); fn(g, k); g.restore();
    s.tex.needsUpdate = true;
  };

  // ---------- state ----------
  const st = { stage: 0, face: STAGES[0].face, from: null, mixAt: -1, power: 0, powerTo: 1, auto: o.autoplay && !reduced, autoAt: 0,
    grow: { a: 0 }, lift: 0, poseFrom: {}, poseAt: -1, accAt: -1, accFrom: null, yaw: 0, drag: null, idleAt: 0, look: [0, 0], faceHold: 0 };
  const poseTarget = {};
  const setPoseTargets = s => {
    for (const n of JOINTS) st.poseFrom[n] = nodes[n].quaternion.clone();
    for (const n of JOINTS) poseTarget[n] = base[n].q.clone().multiply(new THREE.Quaternion().setFromEuler(blenderEuler(STAGES[s].pose[POSE_KEY[n]])));
    st.poseAt = performance.now();
  };
  const tint = s => {
    const c = new THREE.Color(STAGES[s].colour);
    for (const m of ['Accent', 'AccCap', 'AccBowTie', 'AccTassel']) if (materials[m]) materials[m].color.copy(c);
  };

  // ---------- UI ----------
  let ui = null;
  if (o.ui) {
    ui = document.createElement('div'); ui.className = 'bsc-ui';
    ui.innerHTML = `<div class="bsc-cap" aria-live="polite"></div><div class="bsc-row bsc-stages" role="group" aria-label="Brainer stage"></div><div class="bsc-row bsc-faces" role="group" aria-label="Try a face"></div>`;
    const stages = ui.querySelector('.bsc-stages'), faces = ui.querySelector('.bsc-faces');
    STAGES.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bsc-n'; b.textContent = i + 1; b.title = `Stage ${i + 1}: ${s.name}`; b.onclick = () => { stopAuto(); setStage(i); }; stages.appendChild(b); });
    FACES.forEach(([ex, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { stopAuto(); setFace(ex, 6000); }; faces.appendChild(b); });
    const power = document.createElement('button'); power.type = 'button'; power.className = 'bsc-power'; power.setAttribute('aria-label', 'Switch the screen off or on');
    power.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
    power.onclick = () => { stopAuto(); setPower(st.powerTo < 1); };
    const play = document.createElement('button'); play.type = 'button'; play.className = 'bsc-play'; play.onclick = () => { st.auto = !st.auto; st.autoAt = performance.now(); refreshUI(); };
    el.append(ui, power, play);
  }
  function refreshUI() {
    if (!ui) return;
    const s = STAGES[st.stage];
    ui.querySelector('.bsc-cap').innerHTML = `Stage ${st.stage + 1} · ${s.name}<small>Brain levels ${st.stage * 10 + 1}–${st.stage * 10 + 10}</small>`;
    ui.querySelectorAll('.bsc-n').forEach((b, i) => b.setAttribute('aria-pressed', i === st.stage));
    el.querySelector('.bsc-play').textContent = st.auto ? 'Pause' : 'Watch it grow';
  }
  const stopAuto = () => { if (st.auto) { st.auto = false; refreshUI(); } };

  // ---------- the API ----------
  function setStage(s) {
    s = Math.max(0, Math.min(9, s | 0));
    const pairBefore = Math.ceil((st.stage + 1) / 2) - 1, pairAfter = Math.ceil((s + 1) / 2) - 1;
    if (pairAfter !== pairBefore || st.accAt < 0) { st.accFrom = ACCESSORY[pairBefore]; st.accAt = performance.now(); }
    st.stage = s; st.faceHold = 0; setPoseTargets(s); tint(s); setFace(STAGES[s].face); refreshUI();
  }
  function setFace(ex, hold = 0) {
    if (ex === st.face && !hold) return;
    st.from = st.face; st.face = ex; st.mixAt = performance.now(); st.faceHold = hold ? performance.now() + hold : 0;
  }
  function setPower(on) { st.powerTo = on ? 1 : 0; }

  // ---------- input: drag to turn, the head follows the pointer ----------
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, yaw: st.yaw }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(); st.look = [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1]; st.idleAt = performance.now();
    if (st.drag) st.yaw = st.drag.yaw + (e.clientX - st.drag.x) / r.width * 4;
  });
  const endDrag = () => { st.drag = null; st.idleAt = performance.now(); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { st.look = [0, 0]; });

  const fit = () => {   // frame the Brainer in the space above the buttons, the master (cap and all) included, in any shape
    const w = el.clientWidth, h = Math.max(el.clientHeight, 1), uiH = ui ? ui.offsetHeight + 8 : 0, hEff = Math.max(h - uiH, h * 0.5);
    renderer.setSize(w, h, false); camera.aspect = w / h;
    let dist = 8.2 * h / hEff; if (w / hEff < 0.95) dist *= 0.95 / (w / hEff);
    camera.position.set(0, 1.7, dist); camera.lookAt(0, 1.3, 0);
    camera.setViewOffset(w, h, 0, uiH / 2, w, h); camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit); ro.observe(el); fit();
  let visible = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(el);

  // ---------- each frame ----------
  setStage(0); st.face = STAGES[0].face; st.from = null; st.power = 0; st.autoAt = performance.now() + 5200;   // a moment as a baby once the screen is on
  let last = performance.now(), raf = 0;
  const frame = now => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // power: up slowly, down quicker
    if (st.power !== st.powerTo) st.power = st.powerTo > st.power ? Math.min(1, st.power + dt / (reduced ? 0.6 : 2.8)) : Math.max(0, st.power - dt / 1.2);
    // autoplay: once awake, step through the stages
    if (st.auto && st.power >= 1 && now > st.autoAt) { setStage((st.stage + 1) % 10); st.autoAt = now + o.step; }
    if (st.faceHold && now > st.faceHold) { st.faceHold = 0; setFace(STAGES[st.stage].face); }
    // growth towards the stage's age
    const age = st.stage / 9;
    st.grow.a += (age - st.grow.a) * (1 - Math.exp(-dt * 5));
    const a = st.grow.a, dz = 0.3 * a, s = STAGES[st.stage].pose;
    root.scale.setScalar(0.74 + 0.26 * a);
    nodes.Head.scale.setScalar(1.14 - 0.22 * a);
    nodes.Body.position.y = base.Body.p.y + dz;
    for (const sd of ['L', 'R']) {   // longer legs: the hips rise, the boots stay on the ground, the thighs stretch
      const leg = nodes['Leg' + sd]; leg.position.y = base['Leg' + sd].p.y + dz;
      for (const part of legParts[sd]) {
        if (part.k === 'Thigh') { part.n.scale.y = part.sy * (0.1616 + dz) / 0.1616; part.n.position.y = part.y - dz / 2; }
        else part.n.position.y = part.y - dz;
      }
    }
    // pose: ease from the last pose to this stage's
    const q = clamp01((now - st.poseAt) / 650), e = reduced ? 1 : 1 - (1 - q) ** 3;
    for (const n of JOINTS) if (poseTarget[n]) nodes[n].quaternion.slerpQuaternions(st.poseFrom[n] || poseTarget[n], poseTarget[n], e);
    st.lift += ((s.lift || 0) * root.scale.x - st.lift) * (1 - Math.exp(-dt * 6));   // sit, jump or float, eased
    const bob = reduced ? 0 : Math.sin(now / 700) * (s.aura ? 0.06 : 0.015);
    root.position.y = base.Brainer.p.y + st.lift + (s.lift > 0 ? bob : Math.max(0, bob));
    nodes.Body.scale.y = 1 + (reduced ? 0 : Math.sin(now / 600) * 0.008);
    // the head looks towards the pointer
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(st.look[1] * 0.12, st.look[0] * 0.3, 0));
    nodes.Head.quaternion.multiply(look);
    // the accessory for this pair of stages pops in, the old one pops out
    const ka = clamp01((now - st.accAt) / 550), now_acc = ACCESSORY[Math.ceil((st.stage + 1) / 2) - 1];
    for (const [name, parts] of Object.entries(acc)) {
      const k = name === now_acc ? easeBack(ka) : name === st.accFrom ? 1 - clamp01(ka * 2) : 0;
      for (const { n, s: sc } of parts) { n.visible = k > 0.001; n.scale.copy(sc).multiplyScalar(Math.max(0.001, k)); }
    }
    auraMat.opacity += ((s.aura ? 0.9 : 0) - auraMat.opacity) * (1 - Math.exp(-dt * 4));
    aura.rotation.y = now / 2400; aura.scale.setScalar(root.scale.x);
    // turning: drag, then drift back to the front
    if (!st.drag && now - st.idleAt > 2500) st.yaw *= Math.exp(-dt * 1.5);
    turn.rotation.y = st.yaw + (reduced ? 0 : Math.sin(now / 3000) * 0.12);
    // the screens
    const mix = st.mixAt < 0 ? 1 : clamp01((now - st.mixAt) / 420), blink = (now % 3800) < 130;
    const fk = `${st.face}|${st.from}|${mix.toFixed(2)}|${st.power.toFixed(3)}|${blink}|${Math.floor(now / 250)}`;
    if (fk !== visor.key) { visor.key = fk; paint(visor, (g, k) => drawFace(g, st.face, now, { k, power: st.power, from: st.from, mix, blink })); }
    const ck = `${st.stage}|${st.power.toFixed(2)}`;
    if (ck !== chest.key) { chest.key = ck; paint(chest, (g, k) => drawNumber(g, st.stage + 1, { k, power: st.power })); }
    const off = 1 - clamp01((st.power - 0.3) / 0.2);   // off: dark glass that reflects; on: an even glow
    for (const m of [visor.mat, chest.mat]) { m.roughness = 1 - 0.88 * off; m.clearcoat = off; m.specularIntensity = 0.6 * off; }
    if (materials.AntennaTip) materials.AntennaTip.emissiveIntensity = 3 + 2 * Math.sin(now / 400);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  refreshUI();
  return {
    setStage: s => { stopAuto(); setStage(s); }, setFace: (ex, hold) => setFace(ex, hold), setPower,
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); pmrem.dispose(); el.replaceChildren(); el.classList.remove('bsc'); }
  };
}
