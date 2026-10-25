/* Phones allow only so many WebGL contexts at once, shared by every tab of a site, and drop the oldest when there are
   too many; a dropped canvas stays blank. guardRenderer(make, swap, fail): make() builds a renderer; once its context
   is lost, the next visible frame builds a fresh one and swap(next, old) puts it in the old one's place (scenes, meshes
   and textures upload again on their own). If no context can be had after a few tries (the browser has blocked WebGL),
   fail() is called once so the page can show a picture instead. Call check() before rendering each frame: false means
   nothing to render with. A page left in the background for a while gives its contexts back, and takes new ones when
   it is seen again, so a phone with many tabs open keeps working. */
const guards = new Set();
let releaseTimer = 0;
document.addEventListener('visibilitychange', () => {
  clearTimeout(releaseTimer);
  if (document.hidden) releaseTimer = setTimeout(() => { for (const g of guards) g.release(); }, 10000);
});

export function guardRenderer(make, swap = () => {}, fail = () => {}) {
  const g = { renderer: null, lost: false, dead: false, retryAt: 0, tries: 0 };
  const watch = r => r.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); g.lost = true; g.retryAt = performance.now() + 400; }, { once: true });
  g.renderer = make(); watch(g.renderer); guards.add(g);
  g.release = () => { if (!g.lost && !g.dead) try { g.renderer.forceContextLoss(); } catch (e) { /* already gone */ } };
  g.stop = () => { guards.delete(g); g.dead = true; };   // for good: dispose() callers
  g.check = () => {
    if (!g.lost) return true;
    if (g.dead || document.hidden || performance.now() < g.retryAt) return false;
    const old = g.renderer;
    try {
      const next = make(); watch(next); g.renderer = next; g.lost = false; g.tries = 0; swap(next, old);
      try { old.dispose(); } catch (e) { /* the old context is gone already */ }
    } catch (e) {
      g.retryAt = performance.now() + 2500;   // no context to be had yet: try again shortly, a few times
      if (++g.tries >= 4) { g.dead = true; guards.delete(g); fail(); }
    }
    return !g.lost;
  };
  return g;
}
