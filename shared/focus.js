/* Full screen for the games: a button in the HUD gives the game the whole screen. Where the browser allows it, the
   game goes truly full screen (the browser's own bars go too); everywhere, the page's padding goes and the controls
   shrink to one or two slim rows, so the play area is as large as it can be. In the website's game page the game tells
   its parent ({ type: 'brainer:focus', on }), so the site can hide its own header and bar too. */
(() => {
  'use strict';
  const root = document.documentElement, framed = window.parent !== window;
  const canFS = !!(root.requestFullscreen && document.fullscreenEnabled);
  const ICON = {
    open: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  let btn = null, viaFS = false;
  function set(on) {
    root.classList.toggle('focus', on);
    if (btn) {
      btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${on ? ICON.close : ICON.open}</svg>`;
    }
    if (framed) try { window.parent.postMessage({ type: 'brainer:focus', on }, location.origin); } catch (e) { /* a parent elsewhere */ }
    window.dispatchEvent(new Event('resize'));
  }
  function toggle() {
    const on = !root.classList.contains('focus');
    if (on && canFS) { viaFS = true; root.requestFullscreen({ navigationUI: 'hide' }).catch(() => { viaFS = false; }); }
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    set(on);
  }
  document.addEventListener('fullscreenchange', () => {   // leaving full screen with the back gesture or Esc ends focus too
    if (!document.fullscreenElement && viaFS) { viaFS = false; if (root.classList.contains('focus')) set(false); }
  });
  function mount() {
    const bar = document.querySelector('.hud-right'); if (!bar || document.getElementById('full')) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'round'; btn.id = 'full';
    btn.addEventListener('click', toggle);
    bar.insertBefore(btn, bar.querySelector('.wallet')); set(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.BrainerFocus = { toggle, get on() { return root.classList.contains('focus'); } };
})();
