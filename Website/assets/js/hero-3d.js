/* Home hero: the live 3D Brainer from the games' shared folder (shared/brainer-showcase.js, by the game team). Its
   screen switches on, it grows through the ten stages, and visitors can pick a stage, try faces, switch it off and on
   and turn it. window.brainer3d exposes { setStage, setFace, setPower } for other parts of the page. If the browser
   stops allowing WebGL later (phones drop old contexts), the showcase swaps in the stage's still; without WebGL from
   the start, the still in the markup shows instead. */
const el = document.getElementById('brainer3d');
if (el) {
  try {
    const { mountShowcase } = await import(new URL(window.BRAINER_SHARED + 'brainer-showcase.js', document.baseURI).href);
    window.brainer3d = await mountShowcase(el, { still: s => `assets/brainer/robots/${s + 1}.webp` });
    el.querySelector('.still')?.remove();
  } catch (e) {
    el.querySelectorAll(':scope > :not(.still)').forEach(n => n.remove());
    el.classList.remove('bsc');
    const still = el.querySelector('.still');
    if (still) still.hidden = false;
  }
}
