/* Max Mode Test (Tornike, 2026-10-27: "make it simpler, name it Max Mode Test ... do the same to all games so we can
   showcase the character development part"). One switch under each game's controls. While it is on, every round goes
   all the way: no step is lost, and in Fly High every round flies to 10,000×. So the Brainer's whole journey can be
   shown, every look, stage and piece of gear. Those rounds still pay in play money, but they are test rounds: the
   game marks them in its fairness check. It is off on every load.
   The game reads window.MaxMode.on when it decides a step, and may set MaxMode.onchange(on). The markup it expects:
   <div class="maxmode" id="maxMode"><button type="button" aria-pressed="false"><i aria-hidden="true"></i>Max Mode Test</button><small>…</small></div> */
(() => {
'use strict';
const box = document.getElementById('maxMode');
const M = window.MaxMode = { on: false, onchange: null };
if (!box) return;
const btn = box.querySelector('button');
btn.addEventListener('click', () => {
  M.on = !M.on; btn.setAttribute('aria-pressed', String(M.on)); box.classList.toggle('on', M.on);
  if (M.onchange) M.onchange(M.on);
});
})();
