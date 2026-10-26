/* Contact page: checks the demo request form and sends it to the inbox Worker (Inbox/ in the repo, api.brainer.games),
   which keeps it and emails the team. `t` is how long the form was open and `fax` is a field people can't see: the
   Worker quietly drops forms filled faster than a person could, or with the hidden field filled. */
(() => {
'use strict';
const { $, $$, toast } = window.Brainer;
const ENDPOINT = 'https://api.brainer.games/requests';
const opened = Date.now();

const form = $('#contactForm');
const MSG = { name: 'Enter your name.', email: 'Enter a work email we can reply to, like name@casino.com.', company: 'Enter your company.', company_type: 'Choose what kind of company you are.', consent: 'Tick the box so we can reply to you.' };
function check(input) {
  const err = input.closest('label').querySelector('.err');
  if (!err) return input.checkValidity();
  const ok = input.checkValidity();
  err.textContent = ok ? '' : MSG[input.name];
  err.hidden = ok;
  input.setAttribute('aria-invalid', String(!ok));
  return ok;
}
for (const ev of ['input', 'change']) form.addEventListener(ev, e => { if (e.target.getAttribute('aria-invalid') === 'true') check(e.target); });
// a website typed without https:// is still a website
form.website.addEventListener('blur', e => { const v = e.target.value.trim(); if (v && !/^https?:\/\//i.test(v)) e.target.value = 'https://' + v; });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const bad = $$('input[required],select[required]', form).filter(f => !check(f));
  if (bad.length) { bad[0].focus(); return; }
  const btn = $('button[type=submit]', form), note = $('#formNote');
  const body = Object.fromEntries(new FormData(form));
  body.consent = form.consent.checked; body.news = form.news.checked; body.t = Date.now() - opened; body.page = location.pathname;
  btn.disabled = true; note.textContent = 'Sending…';
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      form.hidden = true; const done = $('#formSent'); done.hidden = false; done.focus();
      return;
    }
    if (r.status === 422 && j.fields) { j.fields.map(k => form.elements[k]).filter(Boolean).forEach(f => { f.setCustomValidity(' '); check(f); f.setCustomValidity(''); }); }
    note.textContent = r.status === 429 ? 'Too many requests from your network just now. Try again in an hour, or email partners@brainer.games.'
      : 'That didn’t go through. Check the fields above, or email partners@brainer.games.';
  } catch {
    note.textContent = 'We couldn’t reach our server. Your answers are still here: try again, or email partners@brainer.games.';
    toast('Not sent. Check your connection and try again.');
  } finally { btn.disabled = false; }
});
})();
