/* Shared chrome for every page: header, footer, menu drawer, 18+ check, toasts, icons, game cards and the brain-cell ladder.
   Brand words, the robots and the catalogue come from data.js. The logo is the brand book's drawn wordmark (SITE.logo). */
(() => {
'use strict';
const { SITE, GAMES, BRAIN } = window.BLINK;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Multipliers as the game writes them: two decimals below 1,000×, whole numbers above.
const fx = m => (m < 1000 ? m.toFixed(2) : m.toLocaleString('en-US', { maximumFractionDigits: 0 })) + '×';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: the page still works, it just forgets */ } }
};
const page = document.body.dataset.page;

/* ---------- icons ---------- */
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg>',
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
  arrowLeft: svg('<path d="M19 12H5m6-6-6 6 6 6"/>'),
  arrowRight: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.5-1-2.4 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>'),
  gift: svg('<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 4 8 4.5 7 8 12 8zm0 0s1.5-4 4-3.5S17 8 12 8z"/>'),
  shield: svg('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  bolt: svg('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>'),
  ticket: svg('<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 8v1.5M14 11.3v1.4M14 14.5V16"/>'),
  rain: svg('<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7z"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4"/>'),
  plug: svg('<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>'),
  code: svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'),
  phone: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  download: svg('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  brain: svg('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-2V6a3 3 0 0 0-3-2zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 3 3 0 0 1-3-2"/><path d="M12 9h2M12 14h2.5"/>')
};
$$('[data-icon]').forEach(el => { el.outerHTML = ICON[el.dataset.icon] || ''; });

/* ---------- game cards: any [data-games] list fills itself from the catalogue ---------- */
function gameCard(g) {
  const soon = g.status === 'soon', href = `game.html?g=${encodeURIComponent(g.id)}`;
  const art = g.art ? `<img src="${g.art}" alt="" loading="lazy" decoding="async">` : '<span class="ph">?</span>';
  const more = soon ? '' : `
      <div class="chips"><span class="chip">RTP <b>${g.rtp}%${g.rtpTop ? `–${g.rtpTop}%` : ''}</b></span><span class="chip">${g.levels.length} difficulties</span><span class="chip">Provably fair</span></div>
      ${g.levels.every(l => l.tops) ? `<div class="diffs" aria-label="Last-step multiplier at brain level 5">${g.levels.map(l => `<div><span>${esc(l.name)}</span><b>${fx(l.tops[1])}</b><small>${l.steps} steps</small></div>`).join('')}</div><p class="diffs-note">Last-step multiplier at brain level 5.</p>` : ''}
      <div class="ctas"><a class="btn btn-ink" href="${href}">${ICON.play}Play the demo</a><a class="btn" href="${href}#specs">Specs</a></div>`;
  return `<article class="game${soon ? ' is-soon' : ''}">
    ${soon ? `<span class="art" style="--art:${g.color}">${art}</span>` : `<a class="art" href="${href}" style="--art:${g.color}" tabindex="-1" aria-hidden="true">${art}</a>`}
    <div>
      <span class="sticker${soon ? ' paper' : ''}">${esc(g.badge)}</span>
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.tagline)}</p>${more}
    </div></article>`;
}
$$('[data-games]').forEach(el => { el.innerHTML = GAMES.map(gameCard).join(''); });

/* ---------- hero numbers: [data-hero-stats] shows the first live game's figures, so they never drift from data.js ---------- */
const lead = GAMES.find(x => x.status !== 'soon');
$$('[data-hero-stats]').forEach(el => {
  if (!lead) { el.remove(); return; }
  const stats = [[`${lead.rtp}–${lead.rtpTop || lead.rtp}%`, 'RTP by brain level'], [String(lead.levels.length), 'Difficulties'], [String(BRAIN.cells.length), 'Brain levels'], ['Every flight', 'Provably fair']];
  el.innerHTML = stats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
});

/* ---------- brain-cell ladder: [data-ladder] gets the ten robots with RTP and cells, [data-tiers] the five colour tiers ---------- */
const tierOf = n => BRAIN.tiers[Math.floor((n - 1) / 2)];
// The demo keeps the visitor's brain cells under this key on the same site, so their own Brainer can be marked.
const myCells = store.get('brainer.cells'), mine = myCells == null ? 0 : BRAIN.cells.reduce((L, t, i) => (+myCells >= t ? i + 1 : L), 1);
$$('[data-ladder]').forEach(el => {
  el.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
    `<div class="lv${n === mine ? ' me' : ''}" style="--tier:${tierOf(n).css}">${n === mine ? '<span class="you">Your Brainer</span>' : ''}<img src="${BRAIN.robot(n)}" alt="Brainer robot, brain level ${n}" loading="lazy" decoding="async">`
    + `<b>Brain level ${n}</b><span class="boost"><i>RTP </i>${BRAIN.rtp[n - 1]}%</span><span class="cells">${BRAIN.cells[n - 1].toLocaleString('en-US')} cells</span></div>`).join('');
});
$$('[data-tiers]').forEach(el => {
  el.innerHTML = BRAIN.tiers.map(t => `<span class="tier" style="--tier:${t.css}"><i></i>${esc(t.label)}</span>`).join('');
});

/* ---------- toast ---------- */
const toastEl = Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
document.body.append(toastEl);
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3400);
}

/* ---------- header, footer, drawer ---------- */
const NAV = [
  { key: 'games', href: 'games.html', label: 'Games' },
  { key: 'brain', href: 'index.html#brain', label: 'Brain cells' },
  { key: 'operators', href: 'operators.html', label: 'For operators' },
  { key: 'fair', href: 'fairness.html', label: 'Fairness' },
  { key: 'contact', href: 'contact.html', label: 'Contact' }
];
const cur = key => (key === page ? ' aria-current="page"' : '');
const logo = `<a class="logo" href="index.html" aria-label="${esc(SITE.brand)} home"><img src="${SITE.logo}" alt="" width="154" height="36"></a>`;

const header = $('#site-header');
if (header) {
  header.className = 'site-header';
  header.innerHTML = `<div class="wrap">${logo}
    <nav class="nav" aria-label="Main">${NAV.map(n => `<a href="${n.href}"${cur(n.key)}>${n.label}</a>`).join('')}</nav>
    <div class="head-cta">
      <a class="btn btn-red btn-sm" href="contact.html">Request a demo</a>
      <button class="icon-btn menu-btn" type="button" data-act="menu" aria-label="Open menu">${ICON.menu}</button>
    </div></div>`;
}

const footer = $('#site-footer');
if (footer) {
  footer.className = 'site-footer';
  footer.innerHTML = `<div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">${logo}<p>Crash games your casino can make its own. Every round provably fair.</p></div>
      <div class="foot-col"><h4>Studio</h4><ul>${NAV.map(n => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}</ul></div>
      <div class="foot-col"><h4>Legal</h4><ul><li><a href="responsible-gaming.html"${cur('rg')}>Responsible gaming</a></li><li><a href="terms.html"${cur('terms')}>Terms</a></li><li><a href="privacy.html"${cur('privacy')}>Privacy</a></li></ul></div>
    </div>
    <div class="foot-rg"><span class="age-badge">${SITE.minAge}+</span><p><b>For adults only.</b> Our games are for players aged ${SITE.minAge} and over, in markets where online gambling is legal. Gambling can be addictive; play responsibly.</p></div>
    <div class="foot-bottom"><span>${esc(SITE.legal)}</span><span>© ${new Date().getFullYear()} ${esc(SITE.brand)}</span></div>
  </div>`;
}

document.body.insertAdjacentHTML('beforeend', `
  <dialog class="drawer" id="drawer" aria-label="Menu">
    <div class="drawer-head">${logo}<button class="icon-btn" type="button" data-close aria-label="Close menu">${ICON.close}</button></div>
    <nav>${NAV.map(n => `<a href="${n.href}"${cur(n.key)}>${n.label}</a>`).join('')}</nav>
    <a class="btn btn-red btn-lg" href="contact.html">Request a demo</a>
  </dialog>
  <dialog class="modal" id="age" aria-labelledby="ageTitle">
    <div class="modal-body">
      <div class="age-mark">${SITE.minAge}+</div>
      <h2 id="ageTitle">Are you ${SITE.minAge} or older?</h2>
      <p>This site has playable demos of gambling games. You must be at least ${SITE.minAge} to enter.</p>
      <div class="age-actions"><button class="btn" type="button" data-age="no">No</button><button class="btn btn-red" type="button" data-age="yes">Yes, I am ${SITE.minAge}+</button></div>
      <p class="fine" id="ageNo" role="alert" hidden>Sorry, you cannot use this site.</p>
    </div>
  </dialog>`);

const drawer = $('#drawer'), age = $('#age');
drawer.addEventListener('click', e => {
  const r = drawer.getBoundingClientRect();
  if (e.target.closest('[data-close],a[href]') || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) drawer.close();
});

const AGE_KEY = 'blink.age-ok';
age.addEventListener('cancel', e => e.preventDefault());
age.addEventListener('click', e => {
  const b = e.target.closest('[data-age]');
  if (!b) return;
  if (b.dataset.age === 'yes') { store.set(AGE_KEY, '1'); age.close(); }
  else { $('#ageNo').hidden = false; $('.age-actions', age).hidden = true; }
});
if (store.get(AGE_KEY) !== '1') age.showModal();

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act],[data-todo]');
  if (!a) return;
  if (a.dataset.todo) { e.preventDefault(); toast(`The ${a.dataset.todo} page is not written yet.`); return; }
  if (a.dataset.act === 'menu') drawer.showModal();
});
// Content drawn by script lands after the browser's own jump to #section, so jump again once it is there.
const jumpToHash = () => { const t = location.hash && document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); };

window.Blink = { $, $$, esc, store, toast, ICON, jumpToHash, SITE, GAMES };
})();
