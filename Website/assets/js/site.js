/* Shared chrome for every page: header, footer, menu drawer, 18+ check, toasts, icons, the games lobby (featured carousel,
   swipe rows, the games grid) and the brain-cell ladder. Brand words, the robots and the catalogue come from data.js. */
(() => {
'use strict';
const { SITE, GAMES, BRAIN } = window.BRAINER;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

/* ---------- the lobby: games come first, as tiles, rows and a featured carousel, all filled from the catalogue ---------- */
// What a difficulty can really pay, as the game shows it before a bet: the ladder's top, or the max win at the minimum
// bet when that is lower (Hardcore: 100,000×). A difficulty the max win cuts short lists the paths it can `reach`.
const topOf = (g, l) => g.maxWin && g.minBet ? Math.min(l.top, Math.floor(g.maxWin / g.minBet * 100 + 1e-7) / 100) : l.top;
const pathsOf = l => l.reach ? `up to ${l.reach}` : String(l.steps);
// A ladder game's own words: Plane Crash's bombs and paths unless the game names its own in `words` (Charge: overloads and charges).
const wordsOf = g => Object.assign({ aBomb: 'a bomb', bomb: 'bomb', bombs: 'bombs', bombsIn: 'Bombs in 25 tiles', path: 'path', paths: 'paths', Paths: 'Paths', step: 'step', steps: 'steps', first: 'First step', make: 'fly' }, g.words || {});
const live = GAMES.filter(x => x.status !== 'soon');
const hrefOf = g => `game.html?g=${encodeURIComponent(g.id)}`;
const artOf = (g, lazy = true) => g.art ? `<img src="${g.art}" alt=""${lazy ? ' loading="lazy"' : ''} decoding="async">` : '<span class="ph">?</span>';
// The badge shown on a tile: "New" stays, "Game #3" is a catalogue number the visitor doesn't need.
const isNew = g => /new/i.test(g.badge || '');
// One portrait tile: the game's art, its name and genre over it, "New" in the corner. A game that isn't out yet is not a link.
function tile(g) {
  const soon = g.status === 'soon', tag = soon ? 'div' : 'a';
  return `<${tag} class="tile${soon ? ' is-soon' : ''}"${soon ? '' : ` href="${hrefOf(g)}"`} style="--art:${g.color}">
    <span class="tile-art">${artOf(g)}</span>
    ${soon ? '<span class="flag paper">Coming soon</span>' : isNew(g) ? '<span class="flag">New</span>' : ''}
    <span class="tile-info"><b>${esc(g.title)}</b><small>${esc(g.genre || '')}</small></span>
    ${soon ? '' : `<span class="tile-play" aria-hidden="true">${ICON.play}</span>`}
  </${tag}>`;
}
// A row you swipe sideways, with arrows on wide screens. [data-row] takes "all", "new" or a genre name.
function row(el) {
  const key = el.dataset.row, list = key === 'all' ? GAMES : key === 'new' ? GAMES.filter(isNew) : GAMES.filter(g => (g.genre || '').toLowerCase() === key.toLowerCase());
  const min = +(el.dataset.min || 1);
  if (list.length < min) { el.closest('[data-row-wrap]')?.remove(); return; }
  el.innerHTML = `<div class="row-track" tabindex="-1">${list.map(tile).join('')}</div>
    <button class="row-arrow prev" type="button" aria-label="Scroll left">${ICON.arrowLeft}</button>
    <button class="row-arrow next" type="button" aria-label="Scroll right">${ICON.arrowRight}</button>`;
  const track = $('.row-track', el), prev = $('.prev', el), next = $('.next', el);
  const sync = () => { prev.hidden = track.scrollLeft < 8; next.hidden = track.scrollLeft + track.clientWidth > track.scrollWidth - 8; };
  prev.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
  track.addEventListener('scroll', sync, { passive: true }); addEventListener('resize', sync); sync();
}
$$('[data-row]').forEach(row);
// The genre rows on the home page come from the catalogue: a genre gets its own row once it has three games, with no HTML to write.
$$('[data-genre-rows]').forEach(el => {
  const genres = [...new Set(live.map(g => g.genre).filter(Boolean))];
  el.outerHTML = genres.map(gn => `<div class="row-block" data-row-wrap><h3 class="row-title">${esc(gn)} games</h3><div class="row" data-row="${esc(gn)}" data-min="3"></div></div>`).join('');
  $$('[data-row]:not(:has(.row-track))').forEach(row);
});
// The games page: every game as a tile, with genre filters once there is more than one genre.
$$('[data-grid]').forEach(el => {
  const genres = [...new Set(GAMES.map(g => g.genre).filter(Boolean))];
  const chips = genres.length > 1 ? `<div class="filters" role="group" aria-label="Filter by genre">${['All', ...genres].map((gn, i) => `<button type="button" class="filter" aria-pressed="${i === 0}" data-genre="${esc(gn)}">${esc(gn)}</button>`).join('')}</div>` : '';
  el.innerHTML = `${chips}<div class="grid">${GAMES.map(g => tile(g).replace('class="tile', `data-genre="${esc(g.genre || '')}" class="tile`)).join('')}</div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('.filter'); if (!b) return;
    $$('.filter', el).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $$('.grid .tile', el).forEach(t => { t.hidden = b.dataset.genre !== 'All' && t.dataset.genre !== b.dataset.genre; });
  });
});
// The home page's featured carousel: one slide per playable game, newest first as data.js lists them. It moves on by itself
// every 6 s, and stops while the pointer or focus is on it, the tab is hidden, or the visitor prefers reduced motion.
$$('[data-feature]').forEach(el => {
  if (!live.length) { el.remove(); return; }
  el.innerHTML = `<div class="feat-track">${live.map((g, i) => `<article class="feat" style="--art:${g.color}" aria-roledescription="slide" aria-label="${i + 1} of ${live.length}: ${esc(g.title)}">
      <div class="feat-text">
        <span class="sticker on-dark">${isNew(g) ? 'New game' : esc(g.genre || 'Game')}</span>
        <h2>${esc(g.title)}</h2>
        <p>${esc(g.tagline)}</p>
        <div class="ctas"><a class="btn btn-white btn-lg" href="${hrefOf(g)}">${ICON.play}Play the demo</a><a class="btn btn-ghost btn-lg" href="${hrefOf(g)}#specs">Specs</a></div>
      </div>
      <a class="feat-art" href="${hrefOf(g)}" tabindex="-1" aria-hidden="true">${artOf(g, i > 0)}</a>
    </article>`).join('')}</div>
    ${live.length > 1 ? `<div class="feat-nav"><button class="feat-btn" type="button" data-step="-1" aria-label="Previous game">${ICON.arrowLeft}</button>
      <div class="dots">${live.map((g, i) => `<button type="button" class="dot" data-i="${i}" aria-label="Show ${esc(g.title)}"></button>`).join('')}</div>
      <button class="feat-btn" type="button" data-step="1" aria-label="Next game">${ICON.arrowRight}</button></div>` : ''}`;
  const track = $('.feat-track', el), dots = $$('.dot', el);
  let cur = 0, hold = false;
  const go = i => { cur = (i + live.length) % live.length; track.scrollTo({ left: cur * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  const mark = () => { cur = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); dots.forEach((d, i) => d.setAttribute('aria-current', String(i === cur))); };
  track.addEventListener('scroll', mark, { passive: true }); mark();
  el.addEventListener('click', e => { const b = e.target.closest('[data-step],[data-i]'); if (!b) return; go(b.dataset.i != null ? +b.dataset.i : cur + +b.dataset.step); });
  for (const [ev, v] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) el.addEventListener(ev, () => { hold = v; });
  if (live.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { if (!hold && !document.hidden) go(cur + 1); }, 6000);
  addEventListener('resize', () => track.scrollTo({ left: cur * track.clientWidth }));
});

/* ---------- studio numbers: [data-hero-stats] sums up the live games, so they never drift from data.js ---------- */
$$('[data-hero-stats]').forEach(el => {
  if (!live.length) { el.remove(); return; }
  const stats = [[String(live.length), live.length === 1 ? 'Playable demo' : 'Playable demos'], [`Up to ${Math.max(...live.map(x => x.rtp))}%`, 'RTP'], ['Every round', 'Provably fair'], ['Phone and desktop', 'One build, no app']];
  el.innerHTML = stats.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
});
// The brain-level teaser on the home page: the ten looks in one line, small, linking to the full ladder on the operators page.
$$('[data-brain-strip]').forEach(el => {
  el.innerHTML = Array.from({ length: BRAIN.stages }, (_, i) => `<img src="${BRAIN.robot(i + 1)}" alt="" loading="lazy" decoding="async" style="--tier:${BRAIN.tiers[Math.floor(i / 2)].css}">`).join('');
});

/* ---------- brain-level ladder: [data-ladder] gets the ten stages (one robot look per ten levels), [data-tiers] the five colour tiers ---------- */
const per = BRAIN.levels / BRAIN.stages, tierOf = n => BRAIN.tiers[Math.floor((n - 1) / 2)];// The demo keeps the visitor's brain level (1-100) under this key on the same site, so their own stage can be marked.
const myLevel = parseInt(store.get('brainer.level'), 10), mine = myLevel >= 1 ? Math.min(BRAIN.stages, Math.ceil(myLevel / per)) : 0;
$$('[data-ladder]').forEach(el => {
  el.innerHTML = Array.from({ length: BRAIN.stages }, (_, i) => i + 1).map(n => {
    const lo = (n - 1) * per + 1, hi = n * per, unlock = BRAIN.unlocks.find(u => u.at >= lo && u.at <= hi);
    const name = BRAIN.names[n - 1];
    return `<div class="lv${n === mine ? ' me' : ''}" style="--tier:${tierOf(n).css}">${n === mine ? '<span class="you">Your Brainer</span>' : ''}<img src="${BRAIN.robot(n)}" alt="The Brainer at stage ${n}, ${esc(name)}, for brain levels ${lo} to ${hi}" loading="lazy" decoding="async">`
      + `<b>${esc(name)}</b><span class="cells">Levels ${lo}–${hi}</span>${unlock ? `<span class="unlock">${esc(unlock.name)} at ${unlock.at}</span>` : ''}</div>`;
  }).join('');
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
  { key: 'operators', href: 'operators.html', label: 'For operators' },
  { key: 'fair', href: 'fairness.html', label: 'Fairness' },
  { key: 'contact', href: 'contact.html', label: 'Contact' }
];
const cur = key => (key === page ? ' aria-current="page"' : '');
// The logo is the Brainer's visor (assets/brainer/logo/visor.svg) and the name in FiraGO. It is drawn inline so the screen
// can light up and the eyes blink open when a page loads; each copy gets its own gradient id.
let logoN = 0;
const visor = () => { const id = `vg${++logoN}`; return `<svg class="visor" viewBox="0 0 64 44" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f7bff"/><stop offset="1" stop-color="#5a32fb"/></linearGradient></defs><rect width="64" height="44" rx="19" fill="#0a1322"/><rect class="screen" x="5" y="5" width="54" height="34" rx="14.5" fill="url(#${id})"/><path class="gloss" d="M14 10.5h36" stroke="#fff" stroke-opacity=".28" stroke-width="2.4" stroke-linecap="round"/><rect class="eye" x="18" y="16" width="8" height="12" rx="3.2" fill="#fff"/><rect class="eye" x="38" y="16" width="8" height="12" rx="3.2" fill="#fff"/></svg>`; };
const logo = () => `<a class="logo" href="index.html" aria-label="${esc(SITE.brand)} home">${visor()}<span class="word">Brainer</span></a>`;

const header = $('#site-header');
if (header) {
  header.className = 'site-header';
  header.innerHTML = `<div class="wrap">${logo()}
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
      <div class="foot-brand">${logo()}<p>Instant games for casinos and their players. Every round provably fair.</p></div>
      <div class="foot-col"><h4>Studio</h4><ul>${NAV.map(n => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}</ul></div>
      <div class="foot-col"><h4>Legal</h4><ul><li><a href="responsible-gaming.html"${cur('rg')}>Responsible gaming</a></li><li><a href="terms.html"${cur('terms')}>Terms</a></li><li><a href="privacy.html"${cur('privacy')}>Privacy</a></li></ul></div>
    </div>
    <div class="foot-rg"><span class="age-badge">${SITE.minAge}+</span><p><b>For adults only.</b> Our games are for players aged ${SITE.minAge} and over, in markets where online gambling is legal. Gambling can be addictive; play responsibly.</p></div>
    <div class="foot-bottom"><span>${esc(SITE.legal)}</span><span>© ${new Date().getFullYear()} ${esc(SITE.brand)}</span></div>
  </div>`;
}

document.body.insertAdjacentHTML('beforeend', `
  <dialog class="drawer" id="drawer" aria-label="Menu">
    <div class="drawer-head">${logo()}<button class="icon-btn" type="button" data-close aria-label="Close menu">${ICON.close}</button></div>
    <nav>${NAV.map(n => `<a href="${n.href}"${cur(n.key)}>${n.label}</a>`).join('')}</nav>
    <a class="btn btn-red btn-lg" href="contact.html">Request a demo</a>
  </dialog>
  <dialog class="modal" id="age" aria-labelledby="ageTitle" closedby="none">
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

const AGE_KEY = 'brainer.age-ok';
if (store.get('blink.age-ok') === '1') store.set(AGE_KEY, '1'); // the name it had before the Brainer rename
// closedby="none" keeps Esc and the back gesture off the gate, so back still leaves the page. Older browsers ignore it, and
// Chrome lets a page block only one Esc per click, so there a gate closed without a Yes opens again. The answer is kept
// in memory, so a Yes with storage blocked does not loop.
let ageOk = store.get(AGE_KEY) === '1';
age.addEventListener('cancel', e => e.preventDefault());
age.addEventListener('close', () => { if (!ageOk) age.showModal(); });
age.addEventListener('click', e => {
  const b = e.target.closest('[data-age]');
  if (!b) return;
  if (b.dataset.age === 'yes') { ageOk = true; store.set(AGE_KEY, '1'); age.close('yes'); }
  else { $('#ageNo').hidden = false; $('.age-actions', age).hidden = true; }
});
if (!ageOk) age.showModal();

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act],[data-todo]');
  if (!a) return;
  if (a.dataset.todo) { e.preventDefault(); toast(`The ${a.dataset.todo} page is not written yet.`); return; }
  if (a.dataset.act === 'menu') drawer.showModal();
});
// Content drawn by script lands after the browser's own jump to #section, so jump again once it is there.
const jumpToHash = () => { const t = location.hash && document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); };

window.Brainer = { $, $$, esc, store, toast, ICON, jumpToHash, topOf, pathsOf, wordsOf, SITE, GAMES };
})();
