/* FogRush by Brainer Games. The player's 3D Brainer walks a 25 x 25 map of grass plots in a valley hidden under fog. Every
   new tile clears its clouds: most are plain and nudge the multiplier up, some hold a chest (x1.3 to x25), 8% hold a
   bomb that ends the round. Tiles already cleared are safe to cross. Cash out any time. RTP up to 98%, provably fair,
   play money in US dollars. */
import * as THREE from 'three';
import { RoomEnvironment } from '../shared/vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from '../shared/vendor/RoundedBoxGeometry.js';
import { Brainer, BrainerStage, Plane3D } from '../shared/brainer3d.js';
import { guardRenderer } from '../shared/gl-guard.js';

const $ = s => document.querySelector(s);
const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = m => (m < 1000 ? m.toFixed(2) : Math.floor(m).toLocaleString('en-US')) + '×';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- config & math ---------- */
// Each new tile is a bomb with chance `bomb`; otherwise plain or a chest by the weights below. A safe tile multiplies the
// multiplier by BASE x the chest's factor (1 for plain). BASE is set so every step is fair on average:
// (1 - bomb) x BASE x E[factor] = 1. The 98% RTP is applied once, at the start, like Chicken Road's. So the return is
// 98% before two things lower it in some rounds: payouts round down to the cent, and the $10,000 max win ends long or
// high-bet rounds early. Hence "RTP up to 98%".
const cfg = {
  rtp: 98, bomb: 0.08, grid: 25, minBet: 0.1, maxBet: 200, maxWin: 10000, startBalance: 1000, stepMs: 280,
  chests: [
    { name: 'Small chest', f: 1.3, w: 0.03, trim: 0xc98a4e, body: 0x8a5a34, ex: 'happy' },
    { name: 'Silver chest', f: 2, w: 0.012, trim: 0xe3e9f7, body: 0x8a5a34, ex: 'excited' },
    { name: 'Golden chest', f: 4, w: 0.006, trim: 0xffc147, body: 0x9a6038, ex: 'excited' },
    { name: 'Royal chest', f: 10, w: 0.0015, trim: 0xffc147, body: 0x5a3ffc, gem: 0xff5fb3, ex: 'amazed' },
    { name: 'Mythic chest', f: 25, w: 0.0005, trim: 0xffe07a, body: 0x14a596, gem: 0xb79bff, ex: 'ecstatic' }
  ],
  brain: { perRound: 10 }
};
const PLAIN = 1 - cfg.chests.reduce((a, c) => a + c.w, 0);
const BASE = 1 / ((1 - cfg.bomb) * (PLAIN + cfg.chests.reduce((a, c) => a + c.w * c.f, 0)));
const N = cfg.grid, C = (N - 1) / 2, idx = (x, y) => y * N + x;
// A tile's outcome from its roll u in [0, 1): -1 bomb, 0 plain, 1-5 a chest.
function outcome(u) {
  if (u < cfg.bomb) return -1;
  let v = (u - cfg.bomb) / (1 - cfg.bomb);
  if (v < PLAIN) return 0;
  v -= PLAIN;
  for (let i = 0; i < cfg.chests.length; i++) { if (v < cfg.chests[i].w) return i + 1; v -= cfg.chests[i].w; }
  return cfg.chests.length;
}
const multOf = r => Math.floor(r.m * 100 + 1e-7) / 100;   // shown and paid, rounded down to the cent
const payOf = r => Math.min(Math.floor(r.stake * multOf(r) * 100 + 1e-6) / 100, cfg.maxWin);   // the payout, to the cent too, so the balance adds up to the wins shown
const capM = (r, m) => Math.min(m, Math.floor(cfg.maxWin / r.stake * 100) / 100);   // a multiplier as it pays: the max win caps it
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// Brain levels, shared with every Brainer game: 100 levels in 10 stages, cosmetic only, the same cells every round.
const CELLS = (() => { const c = [0, 0]; for (let n = 1; n < 100; n++) c.push(c[n] + Math.round(10 + 8 * Math.pow(n, 1.4))); return c; })();
const brainLevel = cells => { let L = 1; while (L < 100 && cells >= CELLS[L + 1]) L++; return L; };
const stageOf = L => Math.ceil(L / 10);

/* ---------- state ---------- */
const S = { balance: cfg.startBalance, stake: 10, auto: 0, nonce: 1, client: '', seed: '', hash: '', cells: Math.max(0, parseFloat(store.get('brainer.xp', '0')) || 0) };
let round = null, lastRound = null, starting = false;   // round: the one in play or just ended; lastRound: the last ended, for the fairness check
const myLevel = () => brainLevel(S.cells);
const exploring = () => !!round && round.status === 'explore';

/* ---------- fairness ---------- */
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// Every tile rolls HMAC-SHA256(server seed, "client seed:nonce:column:row"), first 52 bits as a fraction. The start
// tile is always safe and plain.
async function drawMap(seed, client, nonce) {
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const map = new Int8Array(N * N), jobs = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) jobs.push(crypto.subtle.sign('HMAC', key, enc.encode(`${client}:${nonce}:${x}:${y}`)).then(b => { map[idx(x, y)] = outcome(parseInt(hex(b).slice(0, 13), 16) / 2 ** 52); }));
  await Promise.all(jobs);
  map[idx(C, C)] = 0;
  return map;
}
async function rotateSeed() { S.seed = randHex(32); S.hash = await sha256(S.seed); }

/* ---------- sound ---------- */
// Synthesised with Web Audio, so there are no files to load. Starts on the first tap; the HUD button mutes it.
const sound = (() => {
  let ac = null, on = store.get('brainer.sound', 'on') !== 'off';
  const ctxA = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); } if (ac.state === 'suspended') ac.resume(); return ac; };
  const tone = (f0, f1, dur, type, vol, delay) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  const noise = (dur, vol, f0, f1, delay) => {
    const a = on && ctxA(); if (!a) return;
    const t = a.currentTime + (delay || 0), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t);
  };
  return {
    get on() { return on; },
    toggle() { on = !on; store.set('brainer.sound', on ? 'on' : 'off'); if (on) ctxA(); return on; },
    start() { [392, 523, 659].forEach((f, i) => tone(f, 0, 0.18, 'triangle', 0.08, i * 0.07)); },
    hop() { tone(300, 520, 0.12, 'sine', 0.06); },
    reveal() { noise(0.35, 0.06, 2400, 500); },
    plain() { tone(880, 0, 0.1, 'sine', 0.07); },
    chest(t) { const base = [523, 587, 659, 784, 880][t - 1]; [1, 1.25, 1.5, 2].slice(0, 2 + Math.min(2, t)).forEach((k, i) => tone(base * k, 0, 0.22, 'triangle', 0.1, i * 0.08)); if (t >= 4) noise(0.6, 0.05, 6000, 2000, 0.1); },
    bump() { tone(160, 90, 0.15, 'square', 0.04); },
    fuse() { noise(0.4, 0.05, 5000, 3000); },
    boom() { noise(1, 0.45, 1000, 50); tone(95, 38, 0.7, 'sine', 0.25); },
    cash() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.18, 'triangle', 0.1, i * 0.07)); },
    level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.22, 'sine', 0.1, i * 0.08)); }
  };
})();

/* ---------- the 3D world ---------- */
const stage = $('#stage');
const phone = matchMedia('(max-width: 860px)').matches;
const scene = new THREE.Scene(); scene.environmentIntensity = 0.55;
function makeRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setClearColor(0x000000, 0);
  r.domElement.className = 'world'; listen(r.domElement);
  const pm = new THREE.PMREMGenerator(r), room = new RoomEnvironment(); scene.environment = pm.fromScene(room, 0.04).texture; pm.dispose(); room.dispose();   // baked once: free the generator's 6 MB of targets
  return r;
}
let gl = null, renderer = null;   // if the browser drops the world's context (too many open on a phone), it is rebuilt in place
const noGL = () => { $('#nogl').hidden = false; document.body.classList.add('no3d'); $('#noglRetry').onclick = () => location.reload(); };   // the controls go too: there is nothing to play
try { gl = guardRenderer(makeRenderer, next => { renderer.domElement.replaceWith(next.domElement); renderer = next; layout(); }, noGL); renderer = gl.renderer; } catch (e) { renderer = null; }
if (!renderer) { noGL(); throw new Error('WebGL unavailable'); }
stage.prepend(renderer.domElement);
scene.fog = new THREE.FogExp2(0xd6dbff, 0.011);
scene.add(new THREE.HemisphereLight(0xf4f2ff, 0x6a8f4a, 0.95));
const sun = new THREE.DirectionalLight(0xfff2e2, 2.2); sun.castShadow = true;
sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 }); sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

const T = 2.1, TOP = 0.11, BS = 1.15;   // tile size, the grass top's height, the Brainer's scale
const wx = x => (x - C) * T, wz = y => (y - C) * T;
const rand01 = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 362437) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const tileH = (x, y) => (rand01(x, y, 1) - 0.5) * 0.05;   // plots sit at very slightly different heights

// the valley: a raised grass plot per tile, coloured per tile, on a dirt floor with paths between the plots
const grass = new THREE.InstancedMesh(new RoundedBoxGeometry(T * 0.9, 0.32, T * 0.9, 2, 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), N * N);
grass.receiveShadow = true; grass.castShadow = true;
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), COL = new THREE.Color();
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) grass.setMatrixAt(idx(x, y), M4.compose(V.set(wx(x), -0.05 + tileH(x, y), wz(y)), Q.identity(), SC.set(1, 1, 1)));
const valley = new THREE.Mesh(new RoundedBoxGeometry(N * T + 3, 0.3, N * T + 3, 2, 0.6), new THREE.MeshStandardMaterial({ color: 0xe8d6b5, roughness: 0.95 }));
valley.position.y = -0.32; valley.receiveShadow = true;
scene.add(grass, valley);
const GRASS = { hidden: [0x62c955, 0x6ccf5c, 0x5bbf50], lit: [0x86e36b, 0x8fe873, 0x7ddc63], start: 0xa6f08a };
function paintGrass(x, y, lit) { grass.setColorAt(idx(x, y), COL.set(x === C && y === C ? GRASS.start : (lit ? GRASS.lit : GRASS.hidden)[Math.floor(rand01(x, y, 3) * 3)])); grass.instanceColor.needsUpdate = true; }

// clouds: three puffs over every hidden tile; they thin at the edge of what's explored and blow away when a tile clears
const PUFFS = 3;
const cloudMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xd8ccff), sheenRoughness: 0.5 });
const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, phone ? 10 : 13, phone ? 7 : 9), cloudMat, N * N * PUFFS);
clouds.castShadow = true; clouds.frustumCulled = false;
scene.add(clouds);
const puff = [], cloudK = new Float32Array(N * N), cloudTo = new Float32Array(N * N), moving = new Set();
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let p = 0; p < PUFFS; p++) {
  const s = 0.62 + rand01(x, y, 10 + p) * 0.35;
  puff.push({ x: wx(x) + (rand01(x, y, 20 + p) - 0.5) * 1.2, y: 0.38 + rand01(x, y, 30 + p) * 0.35 + tileH(x, y), z: wz(y) + (rand01(x, y, 40 + p) - 0.5) * 1.2, sx: s * 1.25, sy: s * 0.72, sz: s * 1.15, a: rand01(x, y, 50 + p) * 6.28 });
}
function placeCloud(i) {
  const k = cloudK[i], gone = 1 - Math.min(1, k);
  for (let p = 0; p < PUFFS; p++) {
    const q = puff[i * PUFFS + p], s = Math.max(0.0001, k), out = gone * 0.9;
    clouds.setMatrixAt(i * PUFFS + p, M4.compose(V.set(q.x + Math.cos(q.a) * out, q.y + gone * 0.9, q.z + Math.sin(q.a) * out), Q.identity(), SC.set(q.sx * s, q.sy * s, q.sz * s)));
  }
}
function setCloud(x, y, k, now) { const i = idx(x, y); if (cloudTo[i] === k) return; cloudTo[i] = k; moving.add(i); }
function stepClouds(dt) {
  for (const i of moving) {
    const d = cloudTo[i] - cloudK[i], sp = cloudTo[i] < cloudK[i] ? 0.0042 : 0.0026;
    if (Math.abs(d) < 0.01) { cloudK[i] = cloudTo[i]; moving.delete(i); } else cloudK[i] += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
    placeCloud(i);
  }
  clouds.instanceMatrix.needsUpdate = true;
}
function resetClouds() {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y), k = x === C && y === C ? 0 : Math.abs(x - C) + Math.abs(y - C) === 1 ? 0.68 : 1;
    cloudK[i] = cloudTo[i] = k; placeCloud(i); paintGrass(x, y, k === 0);
  }
  moving.clear(); clouds.instanceMatrix.needsUpdate = true;
}

// around the valley: the Brainer world's meadow, the land Plane Crash flies over: patchwork fields, woods and far hills,
// and to the west the airfield it takes off from, with a plane parked on the runway
const EDGE = N * T / 2 + 2.5;   // the valley's rim
{
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const F = ['#b5ec5c', '#ffd95c', '#8ee070', '#d4f07a', '#5fcb5a', '#ffc07a', '#74db5e', '#86e36b'];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = F[(x * 7 + y * 13) % F.length]; g.fillStyle = f; g.fillRect(x * 64, y * 64, 64, 64);
    if ((x * 3 + y * 5) % 3 === 0) { g.fillStyle = 'rgba(40,90,20,.12)'; for (let k = 0; k < 64; k += 8) g.fillRect(x * 64 + k, y * 64, 4, 64); }   // crop rows
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3.2, 3.2); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ map: tex })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.36; ground.receiveShadow = true; scene.add(ground);
  // woods: round trees in little clusters, kept out of the valley and off the airfield
  const trees = [], TREE = [0x2fb850, 0x4ccb55, 0x1fa14c];
  for (let w = 0; w < 30 && trees.length < 340; w++) {
    const a = rand01(w, 1, 200) * Math.PI * 2, d = EDGE + 20 + rand01(w, 2, 201) * 90, cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    for (let k = 0; k < 14; k++) {
      const x = cx + (rand01(w, k, 202) - 0.5) * 18, z = cz + (rand01(w, k, 203) - 0.5) * 18;
      if (Math.max(Math.abs(x), Math.abs(z)) < EDGE + 12 || (x < -EDGE - 4 && x > -EDGE - 40 && Math.abs(z) < 50)) continue;   // clear of the rim, where the camera comes close
      trees.push([x, z, 1.1 + rand01(w, k, 204) * 0.9, TREE[k % 3]]);
    }
  }
  const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x8a5a3c }), trees.length);
  crown.castShadow = true;
  trees.forEach(([x, z, s, col], i) => {
    crown.setMatrixAt(i, M4.compose(V.set(x, 1.0 + s * 0.9, z), Q.identity(), SC.set(s, s * 1.1, s))); crown.setColorAt(i, COL.set(col));
    trunk.setMatrixAt(i, M4.compose(V.set(x, 0.35, z), Q.identity(), SC.set(1, 1, 1)));
  });
  scene.add(crown, trunk);
  const hillMat = new THREE.MeshLambertMaterial({ color: 0xc3c6f7 });   // far hills, hazy lavender
  for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2, d = 170 + rand01(k, 1, 210) * 50, r = 30 + rand01(k, 2, 211) * 30, m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), hillMat); m.scale.set(r, r * (0.3 + rand01(k, 3, 212) * 0.2), r * 0.8); m.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); scene.add(m); }
  // the airfield, west of the valley: the runway Plane Crash takes off from, the hangar with the B, the tower and the windsock
  const ax = -EDGE - 18, white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), violet = new THREE.MeshStandardMaterial({ color: 0x5a3ffc, roughness: 0.35 });
  const runway = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 96), new THREE.MeshStandardMaterial({ color: 0xd9d6ee, roughness: 0.85 })); runway.position.set(ax, -0.3, 0); runway.receiveShadow = true; scene.add(runway);
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.04, 3.2), white, 16), lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9ef6ff }), 64);
  for (let k = 0; k < 16; k++) dash.setMatrixAt(k, M4.compose(V.set(ax, -0.22, -45 + k * 6), Q.identity(), SC.set(1, 1, 1)));
  for (let k = 0; k < 64; k++) lamp.setMatrixAt(k, M4.compose(V.set(ax + (k % 2 ? 4.5 : -4.5), -0.12, -46 + (k >> 1) * 3), Q.identity(), SC.set(1, 1, 1)));
  scene.add(dash, lamp);
  const hangar = new THREE.Group(); hangar.position.set(ax - 16, -0.3, -18); hangar.rotation.y = Math.PI / 2; scene.add(hangar);   // its door faces the runway
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 16, 40, 1, false, -Math.PI / 2, Math.PI), white); vault.rotation.x = Math.PI / 2; vault.castShadow = vault.receiveShadow = true; hangar.add(vault);
  const band = new THREE.Mesh(new THREE.TorusGeometry(7.05, 0.35, 10, 48, Math.PI), violet); hangar.add(band);
  const door = new THREE.Mesh(new THREE.CircleGeometry(6.4, 40, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2b2452, roughness: 0.6 })); door.position.z = 8.02; hangar.add(door);
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sg = sc.getContext('2d');
  sg.fillStyle = '#5a3ffc'; sg.beginPath(); sg.roundRect(4, 4, 120, 120, 30); sg.fill(); sg.fillStyle = '#fff'; sg.font = '800 92px FiraGO, system-ui, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('B', 64, 70);
  const signTex = new THREE.CanvasTexture(sc); signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(0, 4.6, 8.1); hangar.add(sign);
  const tower = new THREE.Group(); tower.position.set(ax + 14, -0.3, 22); scene.add(tower);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 9, 20), white); shaft.position.y = 4.5; shaft.castShadow = true; tower.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2, 24), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4fd7ff, emissiveIntensity: 0.4, roughness: 0.1 })); cab.position.y = 10; tower.add(cab);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.5, 24), violet); roof.position.y = 11.25; tower.add(roof);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.6, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a59, side: THREE.DoubleSide })); sock.position.set(ax + 7, 5.4, -30); sock.rotation.z = Math.PI / 2 - 0.15; scene.add(sock);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 8), white); pole.position.set(ax + 5.8, 2.7, -30); scene.add(pole);
}
// a plane parked at the end of the runway, ready for Plane Crash
let parked = null;
try { parked = new Plane3D(new Brainer(1)); parked.root.scale.setScalar(1.9); parked.root.position.set(-EDGE - 18, 1.1, -34); scene.add(parked.root); } catch (e) { parked = null; }
const banks = [];
for (let b = 0; b < 16; b++) {   // clouds drifting along the valley's rim
  const g = new THREE.Group(), a = b / 16 * Math.PI * 2, r = EDGE + 14 + rand01(b, 1, 60) * 36;
  g.position.set(Math.cos(a) * r, 6 + rand01(b, 2, 61) * 5, Math.sin(a) * r);
  for (let p = 0; p < 6; p++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat); const s = 2.2 + rand01(b, p, 62) * 2.4; m.scale.set(s * 1.3, s * 0.7, s); m.position.set((p - 2.5) * 2.4, rand01(b, p, 63) * 1.4, (rand01(b, p, 64) - 0.5) * 3); g.add(m); }
  banks.push(g); scene.add(g);
}

// the player's Brainer, in a holder that walks and hops; the Brainer itself handles its pose and face
const holder = new THREE.Group(); scene.add(holder);
const me = new Brainer(myLevel()); me.root.scale.setScalar(BS); me.root.position.y = 1.18 * BS; holder.add(me.root);
me.shadow.visible = false;
// FogRush's Brainer is an explorer: a violet backpack with a pocket, a compass and its level patch, and a rolled map on top.
{
  const pack = new THREE.Group(); pack.position.set(0, -0.18, -0.9); me.body.add(pack);
  const violet = new THREE.MeshPhysicalMaterial({ color: 0x5a3ffc, roughness: 0.45, clearcoat: 0.6, sheen: 1, sheenColor: new THREE.Color(0xb79bff) });
  const lilac = new THREE.MeshPhysicalMaterial({ color: 0x8f6bff, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0xffffff) });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc147, metalness: 0.7, roughness: 0.25 });
  const bag = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.9, 0.42, 3, 0.16), violet); pack.add(bag);
  const flap = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.3, 0.46, 3, 0.12), lilac); flap.position.set(0, 0.34, -0.02); pack.add(flap);
  const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.4, 0.16, 3, 0.07), lilac); pocket.position.set(0, -0.17, -0.25); pack.add(pocket);
  for (const sx of [-0.2, 0.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), gold); b.position.set(sx, 0.22, -0.25); pack.add(b); }
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 28), gold); compass.rotation.x = Math.PI / 2; compass.position.set(0, -0.15, -0.34); pack.add(compass);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 28), new THREE.MeshBasicMaterial({ color: 0xffffff })); face.position.set(0, -0.15, -0.362); face.rotation.y = Math.PI; pack.add(face);
  const needle = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.13, 4), new THREE.MeshBasicMaterial({ color: 0xe3264a })); needle.position.set(0, -0.12, -0.37); pack.add(needle);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: me.badgeTex, transparent: true, toneMapped: false })); patch.position.set(0, 0.34, -0.255); patch.rotation.y = Math.PI; pack.add(patch);   // its brain level, on the flap
  const map = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.95, 20), new THREE.MeshStandardMaterial({ color: 0xf0dfb0, roughness: 0.8 })); map.rotation.z = Math.PI / 2; map.position.set(0, 0.6, 0.02); pack.add(map);
  for (const sx of [-0.3, 0.3]) { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.025, 8, 20), new THREE.MeshStandardMaterial({ color: 0xe3264a })); tie.rotation.y = Math.PI / 2; tie.position.set(sx, 0.6, 0.02); pack.add(tie); }
}
me.root.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material && !o.material.transparent && 'envMapIntensity' in o.material) o.material.envMapIntensity = 1.35; } });
// in daylight the brain sits on a light lavender glass floor glowing in its level's colour, not the dark chamber of the night views
const lightFloor = () => {
  const g = me.floorCanvas.getContext('2d'), glow = '#' + me.domeLight.color.getHexString(), fr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  fr.addColorStop(0, '#ffffff'); fr.addColorStop(0.55, '#e6defd'); fr.addColorStop(1, '#b3a3f2'); g.fillStyle = fr; g.fillRect(0, 0, 128, 128);
  const gl = g.createRadialGradient(64, 64, 2, 64, 64, 46); gl.addColorStop(0, glow + 'aa'); gl.addColorStop(1, glow + '00'); g.fillStyle = gl; g.fillRect(0, 0, 128, 128);
  me.floor.material.map.needsUpdate = true;
};
{ const setLv = me.setLevel.bind(me); me.setLevel = L => { const was = me.L; setLv(L); if (me.L !== was) lightFloor(); }; lightFloor(); }
// a soft fill light that travels with the Brainer, so it stays bright white whatever the sun does
const fill = new THREE.PointLight(0xfff8ff, 7, 7.5, 1.4); fill.position.set(1.3, 2.6, 2.8); holder.add(fill);
const walker = { x: C, y: C, face: 0.15, faceTo: 0.15, hop: null, idleAt: 0, fly: null };
function placeWalker() { holder.position.set(wx(walker.x), TOP + tileH(walker.x, walker.y), wz(walker.y)); }

// little chevrons on the four tiles the Brainer can step to; they bob, and light up under the pointer
const chevMat = new THREE.MeshBasicMaterial({ color: 0x6a4dff, transparent: true, opacity: 0.85, depthWrite: false });
const chevGeo = (() => { const s = new THREE.Shape(); s.moveTo(-0.32, -0.12); s.lineTo(0, 0.2); s.lineTo(0.32, -0.12); s.lineTo(0.2, -0.12); s.lineTo(0, 0.06); s.lineTo(-0.2, -0.12); s.closePath(); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; })();
const chevs = Object.entries(DIRS).map(([d, [dx, dy]]) => { const m = new THREE.Mesh(chevGeo, chevMat.clone()); m.rotation.y = Math.atan2(-dx, -dy); m.userData = { d, dx, dy }; m.renderOrder = 5; scene.add(m); return m; });

// pieces that come and go with a round: decorations, chests, craters, floating labels
const roundBits = new THREE.Group(); scene.add(roundBits);
const flowerGeo = new THREE.SphereGeometry(0.09, 10, 8), flowerMats = [0xffc147, 0xff7aa8, 0xffffff, 0xb79bff].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
const stoneGeo = new THREE.CylinderGeometry(0.15, 0.17, 0.05, 14), stoneMat = new THREE.MeshStandardMaterial({ color: 0xece2cf, roughness: 0.9 });
function decorate(x, y) {
  const h = TOP + tileH(x, y);
  for (let k = 0; k < 3; k++) if (rand01(x, y, 70 + k) < 0.6) { const f = new THREE.Mesh(flowerGeo, flowerMats[Math.floor(rand01(x, y, 80 + k) * 4)]); f.position.set(wx(x) + (rand01(x, y, 90 + k) - 0.5) * 1.5, h + 0.06, wz(y) + (rand01(x, y, 100 + k) - 0.5) * 1.5); roundBits.add(f); }
  for (let k = 0; k < 2; k++) { const s = new THREE.Mesh(stoneGeo, stoneMat); s.position.set(wx(x) + (k - 0.5) * 0.55, h + 0.02, wz(y) + (k - 0.5) * 0.3); s.receiveShadow = true; roundBits.add(s); }
}
const soft = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
function label(text, col, size) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.font = '800 104px FiraGO, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = 'rgba(40,20,120,.9)'; g.strokeText(text, 256, 84); g.fillStyle = col; g.fillText(text, 256, 80);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); sp.scale.set(size * 3.2, size, 1); sp.renderOrder = 20; return sp;
}

// tweens and particles
let tweens = [];
const tween = (dur, fn, done) => tweens.push({ t0: performance.now(), dur, fn, done });
const coinMat = new THREE.MeshPhysicalMaterial({ color: 0xffc147, metalness: 0.75, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.25 });
const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 18), coinMat, 140); coins.frustumCulled = false; coins.count = 0; scene.add(coins);
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 220); confetti.frustumCulled = false; confetti.count = 0; scene.add(confetti);
let coinP = [], confP = [];
function spray(pos, n, spread, up) { for (let i = 0; i < n && coinP.length < 140; i++) { const a = Math.random() * 6.28, v = spread * (0.4 + Math.random()); coinP.push({ p: pos.clone(), v: new THREE.Vector3(Math.cos(a) * v, up * (0.7 + Math.random() * 0.6), Math.sin(a) * v), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), life: 0, max: 1300 + Math.random() * 500 }); } }
const CONF = [0x4b36fc, 0x8447fb, 0x33d66d, 0xffc147, 0xffffff, 0xed6b6b];
function rain(center, n) { for (let i = 0; i < n && confP.length < 220; i++) confP.push({ p: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 4, (Math.random() - 0.5) * 8)), v: new THREE.Vector3((Math.random() - 0.5) * 0.4, -1.2 - Math.random(), (Math.random() - 0.5) * 0.4), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), c: CONF[i % CONF.length], life: 0, max: 3600 }); }
function stepParticles(dt) {
  const s = dt / 1000;
  coinP = coinP.filter(q => (q.life += dt) < q.max);
  coinP.forEach((q, i) => { q.v.y -= 9 * s; q.p.addScaledVector(q.v, s); if (q.p.y < TOP + 0.05) { q.p.y = TOP + 0.05; q.v.y *= -0.35; q.v.x *= 0.7; q.v.z *= 0.7; } q.r.x += 8 * s; q.r.y += 5 * s; const k = q.life > q.max - 300 ? (q.max - q.life) / 300 : 1; coins.setMatrixAt(i, M4.compose(q.p, Q.setFromEuler(q.r), SC.set(k, k, k))); });
  coins.count = coinP.length; coins.instanceMatrix.needsUpdate = true;
  confP = confP.filter(q => (q.life += dt) < q.max);
  confP.forEach((q, i) => { q.p.addScaledVector(q.v, s); q.p.x += Math.sin(q.life / 300 + i) * 0.01; q.r.x += q.w.x * s; q.r.y += q.w.y * s; confetti.setMatrixAt(i, M4.compose(q.p, Q.setFromEuler(q.r), SC.set(1, 1, 1))); confetti.setColorAt(i, COL.set(q.c)); });
  confetti.count = confP.length; confetti.instanceMatrix.needsUpdate = true; if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
}

// chests: wood with metal trim in the tier's colour; royal and mythic ones get a coloured body and a gem
function chest(x, y, tier, now) {
  const c = cfg.chests[tier - 1], g = new THREE.Group(), h = TOP + tileH(x, y), r0 = round;
  g.position.set(wx(x) - 0.9, h, wz(y) + 0.72); g.rotation.y = 0.35; g.userData.k = 0.85; roundBits.add(g);   // front left of the Brainer, where the camera sees it
  const wood = new THREE.MeshStandardMaterial({ color: c.body, roughness: tier >= 4 ? 0.35 : 0.7, metalness: tier >= 4 ? 0.2 : 0 }), trim = new THREE.MeshPhysicalMaterial({ color: c.trim, metalness: 0.75, roughness: 0.25 });
  const box = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.56, 0.7, 2, 0.06), wood); box.position.y = 0.3; box.castShadow = true; g.add(box);
  for (const sx of [-0.36, 0.36]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.72), trim); b.position.set(sx, 0.3, 0); g.add(b); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), trim); lock.position.set(0, 0.42, 0.37); g.add(lock);
  if (c.gem) { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshPhysicalMaterial({ color: c.gem, emissive: c.gem, emissiveIntensity: 0.6, roughness: 0.1 })); gem.position.set(0, 0.42, 0.42); g.add(gem); }
  const hinge = new THREE.Group(); hinge.position.set(0, 0.58, -0.35); g.add(hinge);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 24, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.set(0, 0, 0.35); hinge.add(lid);
  const lidTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 24, 1, false, 0, Math.PI), trim); lidTrim.rotation.z = Math.PI / 2; lidTrim.position.set(0, 0, 0.35); hinge.add(lidTrim);
  for (let k = 0; k < 8; k++) { const cn = new THREE.Mesh(coins.geometry, coinMat); cn.position.set((Math.random() - 0.5) * 0.7, 0.5 + Math.random() * 0.06, (Math.random() - 0.5) * 0.4); cn.rotation.set(Math.random(), Math.random(), Math.random()); g.add(cn); }
  const glow = new THREE.PointLight(tier >= 4 ? 0xffe07a : 0xffd56b, 0, 6, 2); glow.position.y = 1.0; g.add(glow);
  // it pops up out of the clearing cloud, then the lid flips open, coins fly and the factor floats up
  g.scale.setScalar(0.01);
  tween(420, p => g.scale.setScalar(Math.max(0.01, easeBack(p) * 0.85)));
  setTimeout(() => {
    if (round !== r0) return;   // the next round has begun (a quick skip with reduced motion): its valley stays clean
    tween(500, p => { hinge.rotation.x = -1.9 * easeBack(p); glow.intensity = (tier >= 4 ? 14 : 7) * Math.sin(Math.min(1, p) * Math.PI / 2); });
    spray(g.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 6 + tier * 5, 1.4 + tier * 0.25, 4 + tier * 0.5);
    const lb = label(`×${c.f}`, tier >= 4 ? '#ffe07a' : '#ffd56b', 0.75 + tier * 0.12); lb.position.set(g.position.x, h + 1.8, g.position.z); scene.add(lb);
    tween(1500, p => { lb.position.y = h + 1.8 + p * 1.2; lb.material.opacity = p < 0.7 ? 1 : (1 - p) / 0.3; lb.scale.set((0.75 + tier * 0.12) * 3.2 * (0.6 + 0.4 * easeBack(Math.min(1, p * 4))), (0.75 + tier * 0.12) * (0.6 + 0.4 * easeBack(Math.min(1, p * 4))), 1); }, () => drop(lb));
    if (tier >= 4) {   // royal and mythic: a beam of light, confetti and a flash
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.set(g.position.x, h + 7, g.position.z); scene.add(beam);
      tween(1800, p => { beam.material.opacity = 0.4 * Math.sin(p * Math.PI); beam.scale.set(1 + p * 0.4, 1, 1 + p * 0.4); }, () => drop(beam));
      rain(g.position, tier === 5 ? 200 : 120); flash('255,236,170');
    }
  }, 380);
}

// bombs: a cartoon bomb pops out of the cloud with its fuse fizzing, then blows; the Brainer is thrown and lands sooty
const fireTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.3, '#ffd45a'); gr.addColorStop(0.65, '#ff7a3d'); gr.addColorStop(1, 'rgba(237,43,75,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
// what a round made goes with it: three.js keeps a geometry's buffers and a texture until they're disposed. The pieces
// every round shares stay, and so do materials: they hold no GPU memory, and disposing one recompiles its shader next round.
const keep = new Set([flowerGeo, stoneGeo, coins.geometry, soft, fireTex]);
function drop(o) {
  o.removeFromParent();
  o.traverse(m => {
    if (m.geometry && !m.isSprite && !keep.has(m.geometry)) m.geometry.dispose();
    if (m.material && m.material.map && !keep.has(m.material.map)) m.material.map.dispose();
  });
}
function bombAt(x, y) {
  const r0 = round, h = TOP + tileH(x, y), pos = new THREE.Vector3(wx(x) - 0.85, h, wz(y) + 0.72), g = new THREE.Group(); g.position.copy(pos); roundBits.add(g);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0x1a1640, roughness: 0.25, clearcoat: 1 })); body.position.y = 0.45; body.castShadow = true; g.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0x3a3f58 })); cap.position.y = 0.9; g.add(cap);
  const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 16, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0xc9a06a })); fuse.position.set(0.14, 0.98, 0); fuse.rotation.z = Math.PI * 0.1; g.add(fuse);
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spark.position.set(0.3, 1.12, 0); spark.scale.setScalar(0.4); g.add(spark);
  g.scale.setScalar(0.01); tween(300, p => g.scale.setScalar(Math.max(0.01, easeBack(p))));
  tween(520, p => { spark.scale.setScalar(0.3 + Math.random() * 0.25); body.scale.setScalar(1 + p * 0.12 * Math.abs(Math.sin(p * 30))); });
  sound.fuse();
  setTimeout(() => {   // the blast, unless the next round has already begun
    if (round !== r0) return;
    drop(g); sound.boom(); flash('255,240,245'); shake = reduced ? 0 : 0.5;
    if (navigator.vibrate) navigator.vibrate(120);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, h + 0.08, pos.z); scene.add(ring);
    tween(700, p => { ring.scale.setScalar(1 + p * 5); ring.material.opacity = 0.8 * (1 - p); }, () => drop(ring));
    for (let i = 0; i < 9; i++) {
      const fire = i < 5, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fire ? fireTex : soft, color: fire ? 0xffffff : 0x6b6585, transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending }));
      const a = i * 1.3, d = fire ? 0.3 : 0.6; sp.position.set(pos.x + Math.cos(a) * d, h + 0.7 + (fire ? 0 : 0.4), pos.z + Math.sin(a) * d); scene.add(sp);
      tween(fire ? 650 : 1400, p => { const s = (fire ? 1.6 : 1.2) + p * (fire ? 2.4 : 2.6); sp.scale.set(s, s, 1); sp.position.y += fire ? 0.004 : 0.012; sp.material.opacity = fire ? 1 - p : 0.75 * (1 - p); }, () => drop(sp));
    }
    const crater = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ map: soft, color: 0x2a2236, transparent: true, opacity: 0.75, depthWrite: false })); crater.rotation.x = -Math.PI / 2; crater.position.set(pos.x, h + 0.012, pos.z); roundBits.add(crater);
    walker.fly = { t0: performance.now(), from: holder.position.clone(), to: new THREE.Vector3(wx(x) + 0.55, TOP + tileH(x, y), wz(y) - 0.25) };
    feel('shock', 900);
  }, 560);
}

let shake = 0, flashAt = -1e9, flashCol = '255,255,255';
function flash(col) { if (reduced) return; flashAt = performance.now(); flashCol = col; }

/* ---------- the portrait and level-up pictures: a second renderer draws the Brainer from the front ---------- */
let pstage = null, pfront = null, psnap = null;
try { pstage = new BrainerStage(); pfront = new Brainer(myLevel()); pstage.setSize(220, 220); } catch (e) { pstage = null; }
const pcv = $('#pilotCv'), pcx = pcv.getContext('2d');
function drawPilot(now, m) {
  const w = pcv.clientWidth; if (!w || !pstage) return;
  const d = Math.min(2, devicePixelRatio || 1); if (pcv.width !== Math.round(w * d)) { pcv.width = pcv.height = Math.round(w * d); }
  pfront.setLevel(myLevel()); pfront.update(now, m.ex, { since: m.t0, lookX: Math.sin(now / 2300) * 0.4, soot: round && round.status === 'bust', reduced });
  pstage.draw(pfront, 0, 0, 220, 220, 'hero');
  pcx.setTransform(1, 0, 0, 1, 0, 0); pcx.clearRect(0, 0, pcv.width, pcv.height); pcx.drawImage(pstage.canvas, 0, 0, 220, 220, -pcv.width * 0.06, -pcv.width * 0.06, pcv.width * 1.12, pcv.width * 1.12);
}
function brainerURL(L, ex) {
  const c = document.createElement('canvas'); c.width = c.height = 200; const g = c.getContext('2d'), now = performance.now();
  if (pstage) { psnap = psnap || new Brainer(L); psnap.setLevel(L); for (let i = 0; i < 30; i++) psnap.update(now + i * 16, ex, { reduced }); pstage.draw(psnap, 0, 0, 220, 220, 'hero'); g.drawImage(pstage.canvas, 0, 0, 220, 220, -10, -10, 220, 220); }
  else { const im = new Image(); im.src = `assets/brainer-${stageOf(L)}.png`; g.drawImage(im, 0, 0, 200, 200); }
  return c.toDataURL();
}

/* ---------- mood: what the Brainer feels right now ---------- */
const mood = { ex: 'rest', t0: 0, set: '', until: 0 };
let lastInput = performance.now();
function feel(ex, ms) { mood.set = ex; mood.until = performance.now() + ms; }
function moodNow(now) {
  let ex;
  if (mood.set && now < mood.until) ex = mood.set;
  else if (round && round.status === 'explore') ex = walker.hop && walker.hop.fresh ? 'gulp' : 'focus';
  else if (round && round.status === 'bust') ex = now - round.endAt < 2200 ? 'dizzy' : 'sad';
  else if (round && round.status === 'cashed') { const m = multOf(round); ex = m >= 10 ? 'ecstatic' : m >= 3 ? 'excited' : 'happy'; }
  else ex = now - lastInput > 25000 ? 'sleepy' : 'rest';
  if (ex !== mood.ex) { mood.ex = ex; mood.t0 = now; }
  return mood;
}

/* ---------- round flow ---------- */
async function play() {
  if (booting || round || starting || sheetOpen()) return;   // booting: a tap through the leaving intro would bet before the 18+ check
  if (S.stake < cfg.minBet || S.stake > cfg.maxBet) { toast(`Bet between ${money(cfg.minBet)} and ${money(cfg.maxBet)}.`); return; }
  if (S.stake > S.balance) { toast('Not enough demo balance for this bet. Lower it or press Reset.'); return; }
  starting = true; flushLevelUp(); renderControls();
  const r = { stake: S.stake, auto: S.auto, seed: S.seed, hash: S.hash, client: S.client, nonce: S.nonce++, status: 'explore', m: cfg.rtp / 100, tiles: 0, chests: 0, found: [0, 0, 0, 0, 0], path: [[C, C]], seen: new Set([idx(C, C)]), payout: 0 };
  try { r.map = await drawMap(r.seed, r.client, r.nonce); }
  catch (e) { S.nonce--; toast(window.isSecureContext ? 'Could not start the round. Please try again.' : 'This demo needs https (or localhost) for its provably fair draw.'); return; }
  finally { starting = false; renderControls(); }
  S.balance = Math.round((S.balance - r.stake) * 100) / 100; round = r;
  if (!$('#fairSheet').hidden) renderFair();   // opened while the map was drawn: it now shows this round, its seed locked
  react('hop', "Let's explore!"); feel('wink', 900); sound.start();
  renderAll();
}
function move(dir) {
  const r = round;
  if (!r || r.status !== 'explore' || walker.hop || sheetOpen()) return;
  const [dx, dy] = DIRS[dir], nx = walker.x + dx, ny = walker.y + dy;
  walker.faceTo = Math.atan2(dx, dy);
  if (nx < 0 || ny < 0 || nx >= N || ny >= N) { sound.bump(); walker.bump = performance.now(); toast("That's the edge of the valley."); return; }
  const fresh = !r.seen.has(idx(nx, ny));
  walker.hop = { t0: performance.now(), fx: walker.x, fy: walker.y, tx: nx, ty: ny, fresh };
  if (fresh) { setCloud(nx, ny, 0); sound.reveal(); } else sound.hop();
  lastInput = performance.now();
}
function land(x, y, fresh) {
  const r = round; walker.x = x; walker.y = y; r.path.push([x, y]);
  if (!fresh) { if (r.cashAfter) cashOut(false); return; }
  r.seen.add(idx(x, y)); paintGrass(x, y, true);
  for (const [dx, dy] of Object.values(DIRS)) { const ax = x + dx, ay = y + dy; if (ax >= 0 && ay >= 0 && ax < N && ay < N && !r.seen.has(idx(ax, ay))) setCloud(ax, ay, 0.68); }
  const out = r.map[idx(x, y)], now = performance.now();
  if (out < 0) { bust(x, y); return; }
  decorate(x, y);
  r.tiles++; r.m *= BASE * (out > 0 ? cfg.chests[out - 1].f : 1);
  if (out > 0) { r.chests++; chest(x, y, out, now); sound.chest(out); feel(cfg.chests[out - 1].ex, out >= 4 ? 1800 : 1100); react('pop', `${cfg.chests[out - 1].name}! ×${cfg.chests[out - 1].f}`); r.found[out - 1]++; say(`${cfg.chests[out - 1].name}! ×${cfg.chests[out - 1].f}`, 1800); }
  else { sound.plain(); feel('phew', 500); sparkle(x, y); }
  bumpMult();
  const pay = r.stake * multOf(r);
  if (pay >= cfg.maxWin) { cashOut(true, 'max'); return; }
  if (r.auto && multOf(r) >= r.auto) { cashOut(true, 'auto'); return; }
  if (r.cashAfter) { cashOut(false); return; }   // asked for mid-hop: this tile was safe, so it cashes out now
  renderAll();
}
function sparkle(x, y) {
  const h = TOP + tileH(x, y);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: i % 2 ? 0xffffff : 0xb4ef84, transparent: true, depthWrite: false })); const a = i / 6 * 6.28;
    sp.position.set(wx(x) + Math.cos(a) * 0.6, h + 0.3, wz(y) + Math.sin(a) * 0.6); sp.scale.setScalar(0.25); scene.add(sp);
    tween(700, p => { sp.position.y = h + 0.3 + p * 1.1; sp.material.opacity = 1 - p; }, () => drop(sp));
  }
}
function cashOut(auto, why) {
  const r = round;
  if (!r || r.status !== 'explore') return;
  if (walker.hop) { if (!auto) { r.cashAfter = true; held.clear(); } return; }   // mid-hop: the step is committed, so it cashes out when it lands
  if (r.tiles < 1) return;
  const m = multOf(r);
  r.payout = payOf(r); r.status = 'cashed'; S.balance = Math.round((S.balance + r.payout) * 100) / 100;
  sound.cash(); react('pop', m >= 10 ? 'Whoa!!' : 'Yay!'); feel(m >= 10 ? 'amazed' : 'happy', 1500);
  spray(holder.position.clone().add(new THREE.Vector3(0, 1.4, 0)), m >= 10 ? 40 : 24, 1.8, 5);
  if (m >= 10) rain(holder.position, m >= 100 ? 200 : 130);
  if (auto) toast(why === 'max' ? `Max win of ${money(cfg.maxWin)} reached, so your Brainer cashed out.` : `Auto cash-out at ${fx(r.auto)}.`);
  settle(3400);
}
function bust(x, y) {
  const r = round; r.status = 'bust';
  bombAt(x, y);
  $('#pilot').classList.add('sooty'); setTimeout(() => { if (round === r) react('shake', 'Ouch!'); }, 560);
  settle(3900);
}
let resetT = 0;
function settle(wait) {
  const r = round; r.endAt = performance.now(); lastRound = r;
  rotateSeed().then(() => { if (!$('#fairSheet').hidden) renderFair(); });
  earnCells(cfg.brain.perRound);
  renderAll();
  clearTimeout(resetT); resetT = setTimeout(nextRound, wait);
}
// The cloud curtain rolls in, the valley is covered again, and the Brainer is back on the start tile.
let curtainT = 0;
function nextRound() {
  if (!round || round.status === 'explore') return;
  clearTimeout(resetT);
  const c = $('#curtain'); c.classList.remove('roll'); void c.offsetWidth; c.classList.add('roll');
  clearTimeout(curtainT);
  curtainT = setTimeout(() => {
    round = null; [...roundBits.children].forEach(drop); coinP = []; confP = [];
    walker.x = walker.y = C; walker.hop = walker.fly = null; walker.faceTo = 0.15; placeWalker();
    resetClouds(); $('#pilot').classList.remove('sooty'); mood.set = '';
    me.setLevel(myLevel()); renderAll(); flushLevelUp();   // cells another tab added can change the level too
  }, reduced ? 50 : 650);
  setTimeout(() => c.classList.remove('roll'), reduced ? 100 : 1500);
}

/* ---------- brain cells and levels ---------- */
let luT = 0, bubT = 0, pendingLevel = 0, levelFrom = 0;
function earnCells(k) {
  const saved = parseFloat(store.get('brainer.xp', ''));   // another Brainer game open in another tab may have added cells since
  if (saved >= 0) S.cells = saved;
  const before = myLevel();
  S.cells = Math.round((S.cells + k) * 10) / 10;
  store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(myLevel()));
  renderPilot(); earnFloat(k);
  if (myLevel() > before) { if (!pendingLevel) levelFrom = before; pendingLevel = myLevel(); }
}
function flushLevelUp() {
  if (!pendingLevel) return;
  const L = pendingLevel, from = levelFrom, el = $('#levelup'); pendingLevel = 0;
  const newStage = stageOf(L) > stageOf(from);
  me.setLevel(L);
  $('#luImg').src = brainerURL(L, 'love'); $('#luTitle').textContent = `Brain level ${L}`; feel('love', 1900);
  $('#luSub').textContent = newStage ? `New look: stage ${stageOf(L)} of 10` : L - from > 1 ? `Up ${L - from} levels` : 'Your Brainer grew new brain cells';
  el.classList.toggle('lu-big', newStage); el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(luT); luT = setTimeout(() => { el.hidden = true; }, newStage ? 3600 : 2800);
  sound.level();
}
function setBrainLevel(L) {
  S.cells = CELLS[L]; store.set('brainer.xp', String(S.cells)); store.set('brainer.level', String(L));
  pendingLevel = 0; me.setLevel(L); renderPilot(); renderPicker(); react('pop', `Level ${L}!`);
}
function earnFloat(k) {
  if (reduced) return;
  const sr = stage.getBoundingClientRect(), pr = $('#pilot .ava').getBoundingClientRect();
  const el = document.createElement('span'); el.className = 'earn'; el.textContent = `+${k} brain cells`;
  const x0 = sr.width / 2 - 50, y0 = sr.height * 0.5; el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; stage.appendChild(el);
  const dx = pr.left - sr.left + pr.width / 2 - x0, dy = pr.top - sr.top + pr.height / 2 - y0;
  el.animate([{ transform: 'translate(0,0)', opacity: 0 }, { transform: 'translate(0,-24px)', opacity: 1, offset: 0.25 }, { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0.2 }], { duration: 1200, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => el.remove();
}

/* ---------- the loop ---------- */
let last = 0, W = 0, H = 0;
function layout() {
  W = stage.clientWidth; H = stage.clientHeight; if (!W || !H) return;
  renderer.setSize(W, H, false); cam.aspect = W / H; cam.fov = W / H < 0.95 ? 50 : 40;
  // The readout covers the top of the stage. Where there is room under it, the picture drops until the tallest Brainer
  // (stage 10: its head at 0.22 of the height, the feet of any stage above 0.65) stands below the readout, and pulls
  // back where it would not fit above the ladder. A short landscape stage has no room under it: there the card sits at
  // the right (style.css), and the Brainer is centred between the Brainer card and it. Any other stage under 480 px
  // (a phone, the site's game page in an in-app browser, full screen there) gets the slim one-line readout.
  cam.zoom = 1; cam.clearViewOffset();
  const land = matchMedia('(orientation: landscape) and (max-height: 500px)').matches;   // the same query as style.css's
  // By the stage's own height (the framed page and full screen too), as a round leaves it: in full screen the round's pad
  // is taller than the bet row, so #explore is measured out of the flow, or the readout would change as Play is pressed.
  let roundH = H; const su = $('#setup'), ex = $('#explore');
  if (!land && !su.hidden && document.documentElement.classList.contains('focus')) {
    ex.style.cssText = `position:absolute;visibility:hidden;width:${su.offsetWidth}px`; ex.hidden = false;
    roundH = H - Math.max(0, ex.offsetHeight - su.offsetHeight); ex.hidden = true; ex.style.cssText = '';
  }
  stage.classList.toggle('slim', !land && roundH < 480);
  const ro = $('#readout'), top = ro.offsetTop + ro.offsetHeight + 10, fit = (H - 40 - top) / (0.43 * H);   // 10: a round's bigger multiplier; 40: the ladder
  if (land) {
    const pl = $('#pilot'), l = pl.offsetLeft + pl.offsetWidth, r = ro.offsetLeft;
    cam.setViewOffset(W, H, W / 2 - (l + r) / 2, 0, W, H);
  } else if (fit >= 0.75) {
    cam.zoom = Math.min(1, fit);
    const lift = top - H * (0.5 - 0.28 * cam.zoom);
    if (lift > 0) cam.setViewOffset(W, H, 0, -lift, W, H);
  }
  cam.updateProjectionMatrix();
}
new ResizeObserver(layout).observe(stage);
if (document.fonts) document.fonts.ready.then(layout);   // the readout's height, in its own font
const camAt = new THREE.Vector3(), camGoal = new THREE.Vector3();
function update(now, dt) {
  tweens = tweens.filter(t => { const p = clamp((now - t.t0) / t.dur, 0, 1); t.fn(p); if (p >= 1) { if (t.done) t.done(); return false; } return true; });
  // walking: a hop from tile to tile, a little squash on landing; the Brainer turns to face where it goes
  const h = walker.hop;
  if (h) {
    const p = clamp((now - h.t0) / cfg.stepMs, 0, 1), x = lerp(wx(h.fx), wx(h.tx), ease(p)), z = lerp(wz(h.fy), wz(h.ty), ease(p));
    holder.position.set(x, lerp(TOP + tileH(h.fx, h.fy), TOP + tileH(h.tx, h.ty), p) + Math.sin(p * Math.PI) * 0.7, z);
    holder.scale.set(1, 1, 1);
    if (p >= 1) { walker.hop = null; walker.idleAt = now; holder.scale.set(1.08, 0.88, 1.08); tween(220, q => holder.scale.set(lerp(1.08, 1, q), lerp(0.88, 1, easeBack(q)), lerp(1.08, 1, q))); land(h.tx, h.ty, h.fresh); }
  } else if (walker.fly) {   // thrown by a blast: up, a spin, and down beside the crater
    const f = walker.fly, p = clamp((now - f.t0) / 1100, 0, 1);
    holder.position.lerpVectors(f.from, f.to, ease(p)); holder.position.y += Math.sin(p * Math.PI) * 3.2; holder.rotation.z = Math.sin(p * Math.PI) * 1.4;
    if (p >= 1) { walker.fly = null; holder.rotation.z = 0; holder.scale.set(1.15, 0.8, 1.15); tween(300, q => holder.scale.set(lerp(1.15, 1, q), lerp(0.8, 1, easeBack(q)), lerp(1.15, 1, q))); }
  }
  if (walker.bump && now - walker.bump < 300) holder.rotation.x = Math.sin((now - walker.bump) / 300 * Math.PI * 3) * 0.12 * (1 - (now - walker.bump) / 300); else holder.rotation.x = 0;
  if (!h && !walker.fly && now - walker.idleAt > 450) walker.faceTo = 0.15;   // turns back to face you whenever it stops
  let df = walker.faceTo - walker.face; df = Math.atan2(Math.sin(df), Math.cos(df)); walker.face += df * Math.min(1, dt * 0.012); holder.rotation.y = walker.face;
  const m = moodNow(now);
  const walk = h ? clamp((now - h.t0) / cfg.stepMs, 0, 1) : null;   // walking: it leans into the hop and swings its arms and legs
  me.update(now, m.ex, { since: m.t0, lookX: Math.sin(now / 1700) * 0.4, soot: round && round.status === 'bust', walk, reduced });
  // chevrons on the tiles you can step to
  const show = exploring() && !walker.hop;
  for (const c of chevs) { const tx = walker.x + c.userData.dx, ty = walker.y + c.userData.dy, ok = show && tx >= 0 && ty >= 0 && tx < N && ty < N; c.visible = ok; if (ok) { c.position.set(wx(tx), TOP + tileH(tx, ty) + 1.15 + Math.sin(now / 300 + c.userData.dx * 2) * 0.08, wz(ty)); c.material.opacity = hoverDir === c.userData.d ? 1 : 0.7; c.scale.setScalar(hoverDir === c.userData.d ? 1.25 : 1); } }
  stepClouds(dt); stepParticles(dt);
  for (const [i, b] of banks.entries()) b.position.x += Math.sin(now / 9000 + i) * 0.004;
  if (parked) parked.update(now, { gear: 1, idle: true, pilot: false, level: myLevel(), reduced });
  // camera: follows the Brainer, a little behind so the explored trail shows
  const narrow = W / H < 0.95;
  camGoal.set(holder.position.x - 0.4, 1.1, holder.position.z + 0.5);
  camAt.lerp(camGoal, camAt.lengthSq() ? Math.min(1, dt * 0.004) : 1);
  cam.position.copy(camAt).add(V.set(narrow ? 0.6 : 2.0, narrow ? 5.6 : 6.3, narrow ? 8.4 : 10.4));   // low enough to see the Brainer's face, high enough to see the way ahead
  if (shake > 0.01) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; shake *= Math.pow(0.9, dt / 16); }
  cam.lookAt(camAt);
  sun.position.set(camAt.x - 9, 18, camAt.z + 9); sun.target.position.copy(camAt);
}
let flashEl = null;
function loop(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (W && H) {
    update(now, dt);
    if (gl.check()) renderer.render(scene, cam);
    drawPilot(now, mood);
    if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'; stage.appendChild(flashEl); }
    const fa = now - flashAt < 260 ? 0.7 * (1 - (now - flashAt) / 260) : 0; flashEl.style.background = fa ? `rgba(${flashCol},${fa})` : 'transparent';
    frames++;
  }
  requestAnimationFrame(loop);
}
let frames = 0;

/* ---------- input ---------- */
// by physical key, so WASD and C work on any layout (a Georgian keyboard sends "დ" for D)
const KEYS = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E', KeyW: 'N', KeyS: 'S', KeyA: 'W', KeyD: 'E' };
const held = new Set();
let hoverDir = '', booting = true, ptrFocus = false;   // booting: until the intro has gone; ptrFocus: the focused button was clicked, not tabbed to
setInterval(() => {   // hold a direction to keep walking; only the press itself bumps at the valley's edge
  if (!held.size || !exploring() || walker.hop) return;
  const d = [...held].pop(), [dx, dy] = DIRS[d], nx = walker.x + dx, ny = walker.y + dy;
  if (nx >= 0 && ny >= 0 && nx < N && ny < N) move(d);
}, 40);
document.addEventListener('pointerdown', () => { ptrFocus = true; }, true);
document.addEventListener('keydown', e => {
  lastInput = performance.now();
  if (e.key === 'Tab') {   // keep focus inside the open sheet; the last one in the page is the one on top
    ptrFocus = false;
    const s = [...document.querySelectorAll('.sheet')].filter(x => !x.hidden).pop();
    if (s) { const f = [...s.querySelectorAll('button, input')].filter(b => !b.disabled && b.getClientRects().length); const i = f.indexOf(document.activeElement); if (!f.length) e.preventDefault(); else if (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus({ preventScroll: true }); } }
    return;
  }
  if (e.repeat && (e.key === 'Enter' || e.code === 'Space') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) { e.preventDefault(); return; }   // a held key's auto-repeat never bets, nor answers a sheet that opened under it
  if (booting) { if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'Space' || KEYS[e.code] || KEYS[e.key])) e.preventDefault(); return; }   // the key that skips the intro must not start a round before the 18+ check, nor scroll the page; browser shortcuts still work
  if (e.key === 'Escape') { if (!$('#tutorial').hidden) store.set('brainer.fr.tutorial', 'seen'); for (const id of ['#picker', '#fairSheet', '#tutorial']) if (!$(id).hidden) closeSheet(id); return; }   // as Let's explore and a backdrop tap do
  if (sheetOpen()) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave browser shortcuts (Ctrl/Cmd+D, +C, Alt+Arrow) alone
  const d = KEYS[e.code] || KEYS[e.key];   // e.key too: the numpad's arrows with NumLock off
  if (d) { e.preventDefault(); if (!e.repeat) { held.add(d); move(d); } return; }
  if (e.code === 'KeyC') { cashOut(false); return; }
  // a button reached with Tab takes its own Enter or Space; after a click they play, as the footer says
  if ((e.key === 'Enter' || e.code === 'Space') && (tag !== 'BUTTON' || ptrFocus)) { e.preventDefault(); if (exploring()) cashOut(false); else if (round) nextRound(); else play(); }
});
document.addEventListener('keyup', e => { const d = KEYS[e.code] || KEYS[e.key]; if (d) held.delete(d); });
addEventListener('blur', () => held.clear());
const pad = $('#pad');
pad.addEventListener('pointerdown', e => { const b = e.target.closest('button[data-d]'); if (!b) return; e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); held.add(b.dataset.d); move(b.dataset.d); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, e => { const b = e.target.closest('button[data-d]'); if (!b) return; b.classList.remove('on'); held.delete(b.dataset.d); });
pad.addEventListener('click', e => { const b = e.target.closest('button[data-d]'); if (b && e.detail === 0) move(b.dataset.d); });   // the keyboard or a screen reader: one step (a tap already moved on pointerdown)
// tap or click a tile next to the Brainer to step onto it, or the chevron floating over it
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundP = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), hit = new THREE.Vector3();
function dirAt(e) {
  const b = renderer.domElement.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
  const onMe = (x, y) => { ndc.set(x / b.width * 2 - 1, -(y / b.height) * 2 + 1); ray.setFromCamera(ndc, cam); return ray.intersectObject(me.root, true).some(h => { for (let o = h.object; o; o = o.parent) if (!o.visible) return false; return true; }); };   // the raycaster hits hidden meshes too
  if (onMe(px, py)) return '';   // a tap on the Brainer itself is not a move
  let best = '', bd = 44 * 44;   // the chevrons float well above their tiles, so they're matched on screen: within about 44 px of one picks it
  for (const c of chevs) if (c.visible) {
    V.copy(c.position).project(cam); const cx = (V.x + 1) / 2 * b.width; let cy = (1 - V.y) / 2 * b.height;
    for (let k = 0; k < 25 && onMe(cx, cy); k++) cy -= 4;   // one behind the Brainer (from stage 5 its head hides N's) is matched just above the head
    const dx = cx - px, dy = cy - py, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = c.userData.d; }
  }
  if (best) return best;
  ndc.set(px / b.width * 2 - 1, -(py / b.height) * 2 + 1); ray.setFromCamera(ndc, cam); if (!ray.ray.intersectPlane(groundP, hit)) return '';
  const tx = Math.round(hit.x / T + C), ty = Math.round(hit.z / T + C);
  return Object.keys(DIRS).find(d => walker.x + DIRS[d][0] === tx && walker.y + DIRS[d][1] === ty) || '';
}
function listen(cv) {   // the world canvas's input; a rebuilt canvas gets it again
  cv.addEventListener('pointermove', e => { hoverDir = exploring() ? dirAt(e) : ''; cv.style.cursor = hoverDir ? 'pointer' : ''; });
  cv.addEventListener('pointerleave', () => { hoverDir = ''; });
  cv.addEventListener('click', e => { lastInput = performance.now(); if (exploring()) { const d = dirAt(e); if (d) move(d); } else if (round) nextRound(); });
}

/* ---------- panels ---------- */
const clampStake = v => Math.min(cfg.maxBet, Math.max(cfg.minBet, Math.round((Number.isFinite(v) ? v : cfg.minBet) * 100) / 100));
function setStake(v) { S.stake = clampStake(v); $('#amt').value = S.stake.toFixed(2); renderAll(); }
$('#amt').addEventListener('change', () => setStake(parseFloat($('#amt').value)));
$('#dec').addEventListener('click', () => setStake(S.stake - (S.stake > 10 ? 1 : 0.5)));
$('#inc').addEventListener('click', () => setStake(S.stake + (S.stake >= 10 ? 1 : 0.5)));
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const c = b.dataset.chip; setStake(c === 'min' ? cfg.minBet : c === 'max' ? Math.min(cfg.maxBet, Math.floor(S.balance * 100 + 1e-6) / 100) : c === 'half' ? S.stake / 2 : S.stake * 2); });
$('#auto').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; S.auto = +b.dataset.a; store.set('brainer.fr.auto', String(S.auto)); renderAll(); });
$('#play').addEventListener('click', play);
$('#cash').addEventListener('click', () => cashOut(false));
$('#cash').addEventListener('pointerdown', e => { if (!e.isPrimary) cashOut(false); });   // a second finger while one holds the pad: phones send it no click
$('#sound').addEventListener('click', () => { sound.toggle(); renderSound(); });
$('#refill').addEventListener('click', () => { if (round) { toast('Finish this round first.'); return; } S.balance = cfg.startBalance; renderAll(); toast(`Demo balance reset to ${money(cfg.startBalance)}.`); });

// The readout over the stage, as in Plane Crash: a label, the big multiplier, and a line under it.
let sayT = 0, sayText = '';
function say(text, ms) { sayText = text; clearTimeout(sayT); sayT = setTimeout(() => { sayText = ''; renderAll(); }, ms); renderAll(); }
function bumpMult() { const el = $('#mult'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
const CHEST_COL = ['#e8b25c', '#d9e1f2', '#ffc147', '#8447fb', '#14a596'];
function renderAll() {
  const r = round, m = r ? multOf(r) : 1, had = document.activeElement,
    kept = !!(had && had.closest && had.closest('#setup, #explore') && had.matches(':focus-visible'));   // keyboard focus in a panel, not a click's
  $('#balance').textContent = money(S.balance);
  $('#setup').hidden = !!r; $('#explore').hidden = !r;
  $('#playSub').textContent = `${money(S.stake)} · RTP up to ${cfg.rtp}%`; $('#play').setAttribute('aria-disabled', String(starting));   // not disabled: that drops the focus; play() waits while starting
  let label, big, bigCls = 'mult', sub = '', subCls = 'sub';
  if (!r) { label = 'Chests up to ×25 · 8% bombs'; big = '1.00×'; bigCls = 'mult idle'; sub = 'Set your bet and press Play'; }
  else if (r.status === 'explore') {
    label = sayText || (r.tiles ? `${r.tiles} new tile${r.tiles === 1 ? '' : 's'} · cleared tiles are safe` : 'Pick a direction');
    big = fx(r.tiles ? m : 1); if (sayText) bigCls = 'mult gold';
    const nx = Math.floor(r.m * BASE * 100 + 1e-7) / 100, top = capM(r, Infinity);
    sub = r.tiles ? `Cash out ${money(payOf(r))} · next ${nx < top ? fx(nx) + '+' : fx(top) + ' max'}` : 'Every new tile clears the clouds';
  } else if (r.status === 'bust') { label = 'Ka-boom!'; big = 'Lost'; bigCls = 'mult bust'; sub = `A bomb on a new tile · −${money(r.stake)}`; subCls = 'sub bad'; }
  else { label = m >= 100 ? 'Huge win!' : m >= 10 ? 'Big win!' : `Cashed out after ${r.tiles} new tile${r.tiles === 1 ? '' : 's'}`; big = fx(capM(r, m)); bigCls = m >= 10 ? 'mult win gold' : 'mult win'; sub = `You won ${money(r.payout)}`; subCls = 'sub ok'; }
  const lab = $('#label'), mul = $('#mult');
  lab.textContent = label; lab.className = 'label' + (sayText || /win!$/.test(label) ? ' gold' : '');
  if (mul.textContent !== big) mul.textContent = big;
  mul.className = bigCls + (mul.classList.contains('pop') ? ' pop' : '');
  $('#sub').hidden = !sub; $('#sub').textContent = sub; $('#sub').className = subCls;
  $('#ladder').innerHTML = cfg.chests.map((c, i) => { const n = r ? r.found[i] : 0; return `<span class="rung chest${n ? ' found' : ''}" style="--c:${CHEST_COL[i]}"><i></i><span class="vh">${c.name} </span>×${c.f}${n ? `<span class="vh">, found${n > 1 ? ` ${n} times` : ''}</span>` : ''}${n > 1 ? `<b aria-hidden="true">${n}</b>` : ''}</span>`; }).join('');
  const cash = $('#cash');
  cash.disabled = !r || r.status !== 'explore' || r.tiles < 1;
  $('#cashSub').textContent = r && r.status === 'cashed' ? 'Paid' : r && r.status === 'bust' ? '—' : !r || r.tiles < 1 ? 'after your first new tile' : money(payOf(r));
  $('#sTiles').textContent = r ? r.tiles : 0; $('#sChests').textContent = r ? r.chests : 0;
  pad.querySelectorAll('button').forEach(b => { b.disabled = !r || r.status !== 'explore'; });
  document.querySelectorAll('#auto button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.a === S.auto)));
  if (kept && (had.disabled || !had.getClientRects().length)) $(r ? '#explore' : '#play').focus({ preventScroll: true });   // the focused control went away: keep the keyboard in the panel. The round's panel, not an arrow: Enter there still cashes out, and Tab goes on to the pad
  renderPilot();
}
const renderControls = renderAll;
function renderPilot() {
  const L = myLevel(), next = L < 100 ? CELLS[L + 1] : null, have = S.cells - CELLS[L];
  $('#lvnum').textContent = L; $('#plv').textContent = `Brain level ${L}`;
  $('#pilot').setAttribute('aria-label', `Brain level ${L}. Open your Brainer.`);
  $('#pbar').style.width = (next == null ? 100 : Math.round(have / (next - CELLS[L]) * 100)) + '%';
  $('#pnote').textContent = next == null ? 'Top level' : `${Math.floor(have).toLocaleString('en-US')} / ${(next - CELLS[L]).toLocaleString('en-US')} cells to level ${L + 1}`;
}
function renderSound() { const b = $('#sound'); b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', sound.on ? 'Sound on, tap to mute' : 'Sound off, tap to unmute'); }
function renderPicker() {
  const L = myLevel(), st = stageOf(L), f = document.activeElement, keep = f && f.closest('#levelsGrid') ? f.dataset.b : '';   // the button just pressed, rebuilt below
  $('#pickLevel').textContent = L; $('#pickSlider').value = L;
  $('#pickNote').textContent = L < 100 ? `${Math.floor(S.cells - CELLS[L]).toLocaleString('en-US')} of ${(CELLS[L + 1] - CELLS[L]).toLocaleString('en-US')} brain cells to level ${L + 1}.` : 'Top level reached.';
  $('#levelsGrid').innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" data-b="${i * 10 + 1}" aria-pressed="${i + 1 === st}"${i + 1 > st ? ' class="ahead"' : ''}><img src="assets/brainer-${i + 1}.png" alt=""><b>Stage ${i + 1}</b><span>Levels ${i * 10 + 1}–${i * 10 + 10}</span></button>`).join('');
  if (keep) $(`#levelsGrid [data-b="${keep}"]`).focus({ preventScroll: true });   // focus stays on it, so its new state is read out (no scroll: the website's frame)
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function react(kind, text) {
  const p = $('#pilot'), b = $('#bubble');
  p.classList.remove('r-hop', 'r-shake', 'r-pop'); void p.offsetWidth; p.classList.add('r-' + kind);
  b.textContent = text; b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(bubT); bubT = setTimeout(() => { b.hidden = true; }, 1400);
}

/* ---------- provably fair sheet: the next round's commit, and the last round revealed, re-checked and mapped ---------- */
const kv = (k, v) => `<div class="kv"><span>${k}</span><code>${v}</code></div>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);   // the client seed is the player's own text
// The game commits first: the next round's hash is shown before the player sets the client seed, which counts from the
// next round and is locked while one is on.
function renderFair() {
  const live = exploring() ? round : null, r = lastRound, off = live ? ' disabled' : '';
  let h = `<h4>${live ? 'This round' : 'Your next round'}</h4>${kv('Server seed hash', live ? live.hash : S.hash)}`
    + `<div class="kv seed"><label for="seedIn">Your client seed</label><button type="button" id="seedNew"${off}>New random</button>`
    + `<input id="seedIn" type="text" value="${esc(live ? live.client : S.client)}" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="seedMsg"${off}><small id="seedMsg" aria-live="polite"></small></div>`
    + `${kv('Nonce', live ? live.nonce : S.nonce)}`
    + `<p class="sheet-note">${live ? 'The server seed is revealed when this round ends. You can change your client seed then.' : 'This hash is fixed now, before you choose your client seed, a bet or a tile. A new client seed counts from your next round and is kept for this visit only.'}</p>`;
  if (r) h += `<h4>Last round: ${r.status === 'bust' ? 'bomb hit' : `cashed out at ${fx(capM(r, multOf(r)))}`} after ${r.tiles} new tile${r.tiles === 1 ? '' : 's'}</h4>`
    + `${kv('Server seed hash', r.hash)}${kv('Server seed, revealed', r.seed)}${kv('Client seed', esc(r.client))}${kv('Nonce', r.nonce)}`
    + '<button type="button" class="big ghost" id="fairCheck">Check this round</button><div id="fairOut" aria-live="polite"></div>';
  $('#fairBody').innerHTML = h;
}
async function checkFair() {
  const r = lastRound; if (!r) return;
  const hashOk = (await sha256(r.seed)) === r.hash, map = await drawMap(r.seed, r.client, r.nonce);
  const mapOk = map.every((v, i) => v === r.map[i]);
  const ok = (good, text) => `<p class="fair-ok${good ? '' : ' bad'}">${good ? '✓' : '✕'} ${text}</p>`;
  $('#fairOut').innerHTML = ok(hashOk, hashOk ? 'SHA-256 of the seed matches the hash shown before the round' : 'The seed does not match the hash')
    + ok(mapOk, mapOk ? 'The map recomputed from the seeds matches your round' : 'The recomputed map differs from the round')
    + `<canvas id="fairMap" width="500" height="500" role="img" aria-label="The last round's whole map, ${N} by ${N} tiles: ${map.filter(v => v < 0).length} bombs, ${map.filter(v => v > 0).length} chests, the rest plain, with your path from the centre ringed"></canvas>`
    + '<div class="legend"><span><i style="background:#9be06e"></i>plain</span>'   // every chest tier in the map's own colours; the path is a ring over a tile's own fill, as drawn
    + cfg.chests.map((c, i) => `<span><i style="background:${CHEST_COL[i]}"></i>${c.name.replace(' chest', '')} ×${c.f}</span>`).join('')
    + '<span><i style="background:#e3264a"></i>bomb</span><span><i style="background:transparent;box-shadow:inset 0 0 0 2px #532aff"></i>your path</span></div>';
  const g = $('#fairMap').getContext('2d'), s = 20;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = map[idx(x, y)]; g.fillStyle = v < 0 ? '#e3264a' : v > 0 ? CHEST_COL[v - 1] : '#9be06e'; g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); }
  g.strokeStyle = '#532aff'; g.lineWidth = 3; for (const [x, y] of r.path) g.strokeRect(x * s + 2.5, y * s + 2.5, s - 5, s - 5);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(C * s + s / 2, C * s + s / 2, 4, 0, 7); g.fill();
}
// 1 to 64 characters as the player sees them (code points, so an emoji is one), trimmed. Anything else keeps the last
// valid seed. Keep the rule and the words in step with Plane Crash's setClient.
function seedInput(el) {
  const v = el.value.trim(), n = [...v].length, ok = n >= 1 && n <= 64;
  if (ok) S.client = v;
  el.setAttribute('aria-invalid', String(!ok));
  $('#seedMsg').textContent = ok ? '' : `Use 1 to 64 characters${n ? ` (this is ${n})` : ''}. Your last valid seed stays in use.`;
  return ok;
}

/* ---------- sheets ---------- */
const sheetOpen = () => ['#picker', '#tutorial', '#agegate', '#fairSheet'].some(id => !$(id).hidden);
let lastFocus = null;
function openSheet(id) { lastFocus = document.activeElement; $(id).hidden = false; const f = $(id).querySelector('button[aria-pressed=true], button'); if (f) f.focus({ preventScroll: true }); }
function closeSheet(id) { $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
$('#pilot').addEventListener('click', () => { renderPicker(); openSheet('#picker'); });
$('#pickerClose').addEventListener('click', () => closeSheet('#picker'));
$('#levelsGrid').addEventListener('click', e => { const b = e.target.closest('button[data-b]'); if (b) setBrainLevel(+b.dataset.b); });
$('#pickSlider').addEventListener('input', e => setBrainLevel(+e.target.value));
$('#help').addEventListener('click', () => openSheet('#tutorial'));
$('#fair').addEventListener('click', () => { renderFair(); openSheet('#fairSheet'); });
$('#fairClose').addEventListener('click', () => closeSheet('#fairSheet'));
$('#fairBody').addEventListener('click', e => {
  if (e.target.closest('#fairCheck')) checkFair();
  if (e.target.closest('#seedNew')) { $('#seedIn').value = randHex(8); seedInput($('#seedIn')); }
});
$('#fairBody').addEventListener('input', e => { if (e.target.id === 'seedIn') seedInput(e.target); });
$('#fairBody').addEventListener('change', e => { if (e.target.id === 'seedIn' && seedInput(e.target)) e.target.value = S.client; });   // on leaving the field an accepted seed shows as it is used, trimmed, as in Plane Crash
$('#tutGo').addEventListener('click', () => { store.set('brainer.fr.tutorial', 'seen'); closeSheet('#tutorial'); });
$('#ageYes').addEventListener('click', () => { store.set('brainer.age-ok', '1'); closeSheet('#agegate'); if (store.get('brainer.fr.tutorial', '') !== 'seen') openSheet('#tutorial'); });
$('#ageNo').addEventListener('click', () => { $('#ageSorry').hidden = false; document.querySelector('.age-actions').hidden = true; });
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s && s.id !== 'agegate') { if (s.id === 'tutorial') store.set('brainer.fr.tutorial', 'seen'); closeSheet('#' + s.id); } }));

/* ---------- boot ---------- */
S.client = randHex(8);
rotateSeed().catch(() => {});   // no crypto.subtle (plain http off localhost): Play says so
S.auto = +store.get('brainer.fr.auto', '0') || 0; if (![0, 1.5, 2, 3, 5, 10, 25, 100].includes(S.auto)) S.auto = 0;
setStake(S.stake); renderSound(); resetClouds(); placeWalker(); layout(); renderAll();
requestAnimationFrame(loop);
const bootT = performance.now();
const ART = Array.from({ length: 10 }, (_, i) => { const im = new Image(); im.src = `assets/brainer-${i + 1}.png`; return im; });
function loadProgress() {   // fonts, the robot art and the first frames of the 3D world; a slow network never holds the player past 9 s
  if (performance.now() - bootT > 9000) return 1;
  const art = ART.filter(im => im.complete).length / ART.length, font = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0;
  return (art + font + Math.min(1, frames / 20) + (me.ready ? 1 : 0)) / 4;   // the 3D model counts too
}
// The intro's actor: the player's Brainer on a little plot of the valley, fog drifting round it, on its own renderer.
let introA = null;
function introActor(g, w, h, now, ex) {
  if (introA === false) return false;
  if (!introA) {
    try {
      const stg = new BrainerStage(), b = new Brainer(myLevel()), root = new THREE.Group(); stg.setSize(512, 512);
      const isl = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.3, 3.6, 2, 0.3), new THREE.MeshStandardMaterial({ color: 0xe8d6b5, roughness: 0.95 })); isl.position.y = -1.42; root.add(isl);
      const top = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.32, 2.6, 2, 0.14), new THREE.MeshStandardMaterial({ color: 0x86e36b, roughness: 0.85 })); top.position.y = -1.2; root.add(top);
      for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(flowerGeo, flowerMats[k % 4]); f.position.set(Math.cos(k * 2.1) * 1.05, -1.0, Math.sin(k * 2.1) * 1.05); root.add(f); }
      const puffs = [];
      for (let k = 0; k < 7; k++) { const c = new THREE.Mesh(clouds.geometry, cloudMat); const s = 0.5 + (k % 3) * 0.18; c.scale.set(s * 1.3, s * 0.75, s); c.userData = { a: k / 7 * Math.PI * 2, r: 1.9 + (k % 2) * 0.4, y: -1.55 + (k % 3) * 0.12 }; root.add(c); puffs.push(c); }
      b.shadow.visible = false; root.add(b.root);
      introA = { stage: stg, b, root, puffs };
    } catch (e) { introA = false; return false; }
  }
  const a = introA;
  if (!a.b.ready) return false;
  a.t0 = a.t0 || now;   // its screen switches on while the game loads: slowly, and never ahead of the loading
  a.b.update(now, ex, { lookX: Math.sin(now / 1300) * 0.35, power: Math.min(loadProgress(), (now - a.t0) / 2800), reduced });
  a.root.rotation.y = reduced ? -0.3 : -0.3 + Math.sin(now / 2200) * 0.25;
  a.root.position.y = reduced ? 0 : Math.sin(now / 900) * 0.08;
  for (const c of a.puffs) { const u = c.userData, ang = u.a + (reduced ? 0 : now / 6000); c.position.set(Math.cos(ang) * u.r, u.y, Math.sin(ang) * u.r); }
  a.stage.draw({ root: a.root }, 0, 0, 512, 512, 'islandHero');
  g.drawImage(a.stage.canvas, 0, 0, 512, 512, 0, 0, w, h);
  return true;
}
document.querySelector('.brand .t1').innerHTML = window.BrainerIntro ? window.BrainerIntro.wordmark('fog') : 'FogRush';
(window.BrainerIntro ? window.BrainerIntro.start({ title: 'FogRush', mark: 'fog', theme: 'fog', what: 'the valley', actor: introActor, progress: loadProgress }) : Promise.resolve()).then(() => {
  booting = false;   // before the sheets open: from here the 18+ check holds the keys
  if (introA) introA.stage.dispose(); introA = false;   // the intro's own WebGL context goes: phones allow only so many
  if (store.get('brainer.age-ok', store.get('blink.age-ok', '')) !== '1') openSheet('#agegate');
  else if (store.get('brainer.fr.tutorial', '') !== 'seen') openSheet('#tutorial');
});
// for headless tests and the demo: what's under the clouds stays hidden; only the round's public state is exposed
window.FogRush = { get state() { const r = round; return r ? { status: r.status, tiles: r.tiles, chests: r.chests, mult: multOf(r), payout: r.payout, x: walker.x, y: walker.y, moving: !!walker.hop } : { status: 'setup', x: walker.x, y: walker.y }; } };
