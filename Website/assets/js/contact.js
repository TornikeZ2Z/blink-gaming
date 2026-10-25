/* Contact page: fills the email address and checks the demo request form. Sending waits for a form backend, so a valid form
   only says so on screen and keeps what was typed. */
(() => {
'use strict';
const { $, $$, toast, SITE } = window.Blink;

$$('[data-site]').forEach(el => { el.textContent = SITE[el.dataset.site] || el.dataset.empty || ''; });

const form = $('#contactForm');
const MSG = { name: 'Enter your name.', email: 'Enter a work email we can reply to, like name@casino.com.', company: 'Enter your company.', type: 'Choose what kind of company you are.', consent: 'Tick the box so we can contact you.' };
function check(input) {
  const err = input.parentElement.querySelector('.err');
  if (!err) return input.checkValidity();
  const ok = input.checkValidity();
  err.textContent = ok ? '' : MSG[input.name];
  err.hidden = ok;
  input.setAttribute('aria-invalid', String(!ok));
  return ok;
}
for (const ev of ['input', 'change']) form.addEventListener(ev, e => { if (e.target.getAttribute('aria-invalid') === 'true') check(e.target); });
form.addEventListener('submit', e => {
  e.preventDefault();
  const fields = $$('input[required],select[required]', form);
  const bad = fields.filter(f => !check(f));
  if (bad.length) { bad[0].focus(); return; }
  toast('Thanks. The form is not connected yet, so nothing was sent; your answers stay on this page.');
});
})();
