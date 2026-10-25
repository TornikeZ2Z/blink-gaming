/* Contact page: fills the email placeholder and checks the demo request form. Sending waits for a form backend, so a valid form only confirms on screen. */
(() => {
'use strict';
const { $, $$, toast, SITE } = window.Blink;

$$('[data-site]').forEach(el => { el.textContent = SITE[el.dataset.site] || ''; });

const form = $('#contactForm');
const MSG = { name: 'Enter your name.', email: 'Enter a work email we can reply to.', company: 'Enter your company.', type: 'Choose what kind of company you are.' };
function check(input) {
  const err = input.parentElement.querySelector('.err');
  if (!err) return input.checkValidity();
  const ok = input.checkValidity();
  err.textContent = ok ? '' : MSG[input.name];
  err.hidden = ok;
  input.setAttribute('aria-invalid', String(!ok));
  return ok;
}
form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true') check(e.target); });
form.addEventListener('submit', e => {
  e.preventDefault();
  const fields = $$('input[required],select[required]', form);
  const bad = fields.filter(f => !check(f));
  if (bad.length) {
    if (bad.some(f => f.name === 'consent')) toast('Tick the box so we can contact you.');
    bad[0].focus();
    return;
  }
  form.reset();
  toast('Looks good. The form is not connected yet, so nothing was sent.');
});
})();
