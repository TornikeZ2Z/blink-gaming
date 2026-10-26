/* The Brainer showcase: the 3D character for the website. It switches its screen on, then grows through its ten
   stages, each with its own pose, LED face, colour and accessory; visitors can pick a stage, try faces, switch it off
   and on, and turn it round.
   mountShowcase(el, { ui, autoplay, step, still }) returns { setStage, setFace, setPower, destroy }; step is the
   autoplay's ms per stage; still(stage 0..9) gives a picture's URL, shown instead if the browser stops allowing WebGL. The page maps 'three' to the vendored three.js with an import map, as the games do; import-map addresses
   must start with ./, ../ or /, e.g. {"imports":{"three":"./shared/vendor/three.module.min.js"}} from the site's root. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { loadBrainer, BrainerRig, STAGES } from './brainer-model.js';
import { guardRenderer } from './gl-guard.js';

export { STAGES };
export const FACES = [['happy', 'Happy'], ['wink', 'Wink'], ['excited', 'Excited'], ['love', 'Love'], ['amazed', 'Wow'], ['think', 'Thinking'], ['shock', 'Shock'], ['sad', 'Sad'], ['dizzy', 'Dizzy'], ['sleepy', 'Sleepy']];
const clamp01 = v => Math.max(0, Math.min(1, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CSS = `
.bsc{position:relative;width:100%;height:100%;min-height:360px;touch-action:pan-y;user-select:none}
.bsc canvas{display:block;width:100%;height:100%;cursor:grab}.bsc canvas:active{cursor:grabbing}
.bsc .bsc-still{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:min(78%,420px);height:auto}
.bsc.bsc-nogl .bsc-faces,.bsc.bsc-nogl .bsc-power{display:none}
.bsc-ui{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:0 12px 14px;pointer-events:none}
.bsc-cap{font-weight:700;font-size:15px;line-height:1.3;color:#fff;text-align:center;text-shadow:0 2px 12px rgba(20,10,80,.45)}
.bsc-cap small{display:block;font-weight:500;opacity:.8;font-size:13px}
.bsc-row{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;pointer-events:auto}
.bsc button{font-family:inherit;font-weight:600;font-size:13px;line-height:1;color:#fff;background:rgba(30,18,110,.42);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 11px;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:background .2s,transform .2s}
.bsc button:hover{background:rgba(70,50,230,.6)}.bsc button:active{transform:scale(.96)}
.bsc button[aria-pressed=true]{background:#5a3ffc;border-color:#fff}
.bsc .bsc-n{width:34px;height:34px;padding:0;border-radius:50%}
.bsc .bsc-power{position:absolute;top:12px;right:12px;width:40px;height:40px;padding:0;border-radius:50%;pointer-events:auto;display:grid;place-items:center}
.bsc .bsc-play{position:absolute;top:12px;left:12px;pointer-events:auto}
@media (max-width:560px){.bsc .bsc-n{width:30px;height:30px}.bsc button{font-size:12px;padding:7px 9px}}
`;

export async function mountShowcase(el, opts = {}) {
  const o = { ui: true, autoplay: true, step: 3400, ...opts };
  if (!document.getElementById('bsc-css')) { const s = document.createElement('style'); s.id = 'bsc-css'; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add('bsc');

  // ---------- renderer, light and stage ----------
  const small = Math.min(innerWidth, innerHeight) < 700;   // phones: a lighter load on the GPU
  const scene = new THREE.Scene(); scene.environmentIntensity = 0.75;
  const make = () => {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, small ? 1.75 : 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(r), room = new RoomEnvironment(); scene.environment = pm.fromScene(room, 0.04).texture; pm.dispose(); room.dispose();   // baked once: free the generator's 6 MB of targets
    return r;
  };
  let still = null, rig = null;   // the picture shown if WebGL is gone for good; the character
  const showStill = () => {
    if (!o.still) return;
    if (!still) { still = document.createElement('img'); still.className = 'bsc-still'; still.alt = ''; gl.renderer.domElement.replaceWith(still); }
    still.src = o.still(rig ? rig.stage : 0);
  };
  const gl = guardRenderer(make, (next, old) => { old.domElement.replaceWith(next.domElement); fit(); }, () => { el.classList.add('bsc-nogl'); showStill(); });   // a dropped context is rebuilt in place
  el.prepend(gl.renderer.domElement);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xfff6ee, 2.2); key.position.set(-3, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); key.shadow.radius = 6; Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3.5, bottom: -1, near: 1, far: 20 });
  scene.add(key, new THREE.HemisphereLight(0xe8e4ff, 0x6a5cff, 0.6));
  const rim = new THREE.DirectionalLight(0xa58bff, 1.4); rim.position.set(3, 3, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const aura = new THREE.Group(); scene.add(aura);   // the master's glow rings
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  [0.62, 0.42].forEach((r, k) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 12, 96), auraMat); m.rotation.x = Math.PI / 2; m.position.y = 0.03 + 0.05 * k; aura.add(m); });

  const giveBack = e => { gl.stop(); gl.renderer.dispose(); gl.renderer.forceContextLoss(); throw e; };   // a failed start gives the context back; the page shows its still
  try { rig = new BrainerRig(await loadBrainer()); } catch (e) { giveBack(e); }   // no model
  const turn = new THREE.Group(); turn.add(rig.root); scene.add(turn);
  rig.power = 0; rig.powerTo = 1;

  // ---------- state ----------
  const st = { auto: o.autoplay && !reduced, autoAt: performance.now() + 5200, faceHold: 0, yaw: 0, drag: null, idleAt: 0, look: [0, 0] };

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
    power.onclick = () => { stopAuto(); setPower(rig.powerTo < 1); };
    const play = document.createElement('button'); play.type = 'button'; play.className = 'bsc-play'; play.onclick = () => { st.auto = !st.auto; st.autoAt = performance.now(); refreshUI(); };
    el.append(ui, power, play);
  }
  function refreshUI() {
    if (!ui) return;
    const s = STAGES[rig.stage];
    const cap = ui.querySelector('.bsc-cap'); cap.setAttribute('aria-live', st.auto ? 'off' : 'polite');   // read out the visitor's picks, not every autoplay step
    cap.innerHTML = `Stage ${rig.stage + 1} · ${s.name}<small>Brain levels ${rig.stage * 10 + 1}–${rig.stage * 10 + 10}</small>`;
    ui.querySelectorAll('.bsc-n').forEach((b, i) => b.setAttribute('aria-pressed', i === rig.stage));
    el.querySelector('.bsc-play').textContent = st.auto ? 'Pause' : 'Watch it grow';
  }
  const stopAuto = () => { if (st.auto) { st.auto = false; refreshUI(); } };

  // ---------- the API ----------
  function setStage(s) { rig.setStage(s); rig.setPose(STAGES[rig.stage].pose); rig.setFace(STAGES[rig.stage].face); st.faceHold = 0; if (still) showStill(); refreshUI(); }
  function setFace(ex, hold = 0) { rig.setFace(ex); st.faceHold = hold ? performance.now() + hold : 0; }
  function setPower(on) { rig.powerTo = on ? 1 : 0; }

  // ---------- input: drag to turn, the head follows the pointer ----------
  // on the box, not the canvas, so they survive a rebuilt renderer; the buttons keep their own clicks
  el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; st.drag = { x: e.clientX, yaw: st.yaw }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect(); st.look = [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1]; st.idleAt = performance.now();
    if (st.drag) st.yaw = st.drag.yaw + (e.clientX - st.drag.x) / r.width * 4;
  });
  const endDrag = () => { st.drag = null; st.idleAt = performance.now(); };
  el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
  el.addEventListener('pointerleave', () => { st.look = [0, 0]; });

  const fit = () => {   // frame the Brainer in the space above the buttons, the master (cap and all) included, in any shape
    const w = el.clientWidth, h = Math.max(el.clientHeight, 1), uiH = ui ? ui.offsetHeight + 8 : 0, hEff = Math.max(h - uiH, h * 0.5);
    gl.renderer.setSize(w, h, false); camera.aspect = w / h;
    let dist = 8.2 * h / hEff; if (w / hEff < 0.95) dist *= 0.95 / (w / hEff);
    camera.position.set(0, 1.7, dist); camera.lookAt(0, 1.3, 0);
    camera.setViewOffset(w, h, 0, uiH / 2, w, h); camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit); ro.observe(el); fit();
  let visible = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(el);

  // ---------- each frame ----------
  try { setStage(0); rig.update(performance.now(), 0, { instant: true }); } catch (e) { ro.disconnect(); io.disconnect(); giveBack(e); }   // its first paint failed (an old browser)
  let last = performance.now(), raf = 0;
  const frame = now => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st.auto && rig.power >= 1 && now > st.autoAt) { setStage((rig.stage + 1) % 10); st.autoAt = now + o.step; }
    if (st.faceHold && now > st.faceHold) { st.faceHold = 0; rig.setFace(STAGES[rig.stage].face); }
    const s = STAGES[rig.stage].pose;
    rig.setExtra({ head: [st.look[1] * 0.12, 0, st.look[0] * 0.3] });   // the head looks towards the pointer
    const bob = reduced ? 0 : Math.sin(now / 700) * (s.aura ? 0.06 : 0.015);
    rig.update(now, dt, { bob: s.lift > 0 ? bob : Math.max(0, bob), ease: reduced ? 60 : 6 });
    rig.nodes.Body.scale.y = 1 + (reduced ? 0 : Math.sin(now / 600) * 0.008);
    auraMat.opacity += ((s.aura ? 0.9 : 0) - auraMat.opacity) * (1 - Math.exp(-dt * 4));
    aura.rotation.y = now / 2400; aura.scale.setScalar(rig.nodes.Brainer.scale.x);
    if (!st.drag && now - st.idleAt > 2500) st.yaw *= Math.exp(-dt * 1.5);   // drift back to the front
    turn.rotation.y = st.yaw + (reduced ? 0 : Math.sin(now / 3000) * 0.12);
    if (gl.check()) gl.renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  refreshUI();
  return {
    setStage: s => { stopAuto(); setStage(s); }, setFace: (ex, hold) => setFace(ex, hold), setPower,
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); gl.stop(); gl.renderer.dispose(); el.replaceChildren(); el.classList.remove('bsc'); }
  };
}
