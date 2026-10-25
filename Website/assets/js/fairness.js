/* Fairness page: makes a sample flight in the browser, shows its SHA-256 commit, then reveals the seed and re-hashes it to prove the match. */
(() => {
'use strict';
const { $, ICON } = window.Blink;
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

let round = null;
async function newRound() {
  const seed = hex(crypto.getRandomValues(new Uint8Array(32)));
  round = { id: 1000 + Math.floor(Math.random() * 9000), seed, hash: await sha256(seed) };
  $('#vRound').textContent = `Flight ${round.id}`;
  $('#vHash').textContent = round.hash;
  const s = $('#vSeed'); s.textContent = '•'.repeat(64); s.classList.add('blur');
  $('#vOut').hidden = true;
  $('#vReveal').disabled = false;
}
$('#vReveal').addEventListener('click', async () => {
  if (!round) return;
  const s = $('#vSeed'); s.textContent = round.seed; s.classList.remove('blur');
  const ok = (await sha256(round.seed)) === round.hash;
  const out = $('#vOut');
  out.innerHTML = ok ? `${ICON.check}SHA-256 of the seed matches the published hash` : 'The hash does not match: this flight could have been changed.';
  out.classList.toggle('bad', !ok);
  out.hidden = false;
  $('#vReveal').disabled = true;
  $('#vNew').focus();   // the pressed button is now disabled, so keep the keyboard on the page
});
$('#vNew').addEventListener('click', newRound);
newRound();
})();
