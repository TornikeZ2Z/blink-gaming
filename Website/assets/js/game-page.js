/* Game page (game.html?g=<id>): the playable demo in a frame with full screen, then rules, levels, specs and downloads for operators.
   Everything shown comes from the game's entry in data.js. */
(() => {
'use strict';
const { $, esc, ICON, toast, jumpToHash, SITE, GAMES } = window.Blink;
const main = $('#main');
// Same style as the game: two decimals below 1,000×, whole numbers above.
const fx = m => (m < 1000 ? m.toFixed(2) : m.toLocaleString('en-US', { maximumFractionDigits: 0 })) + '×';
const g = GAMES.find(x => x.id === new URLSearchParams(location.search).get('g'));

if (!g) {
  main.innerHTML = `<div class="wrap"><div class="page-head"><span class="sticker red">404</span><h1>Game not found</h1><p class="lead">That game does not exist or has moved.</p><div class="ctas"><a class="btn btn-ink btn-lg" href="games.html">See our games</a></div></div></div>`;
  return;
}
document.title = `${g.title} · ${SITE.brand}`;
const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="games.html">Games</a><span aria-hidden="true">/</span><span aria-current="page">${esc(g.title)}</span></nav>`;

if (g.status === 'soon') {
  main.innerHTML = `<div class="wrap">${crumbs}
    <div class="page-head"><div class="poster">
      <span class="art" style="--art:${g.color}"><span class="ph">?</span></span>
      <div><span class="sticker paper">${esc(g.genre)}</span><h1>${esc(g.title)}</h1><p>${esc(g.tagline)}</p>
        <div class="ctas"><a class="btn btn-red btn-lg" href="contact.html">Hear about it first</a></div></div>
    </div></div></div>`;
  return;
}

const specs = g.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
const assets = (g.assets || []).map(a => `<a class="dl" href="${a.href}" download>${ICON.download}${esc(a.label)} <span>${esc(a.format)}</span></a>`).join('');

main.innerHTML = `<div class="wrap">${crumbs}
  <div class="play-head">
    <a class="icon-btn" href="games.html" aria-label="Back to games">${ICON.arrowLeft}</a>
    <h1>${esc(g.title)}</h1>
    ${g.workingTitle ? '<span class="sticker paper">Working title</span>' : ''}
    <div class="tools"><a class="btn" href="#how">${ICON.info}<span>Rules</span></a><button class="btn" type="button" id="fs">${ICON.expand}<span>Full screen</span></button></div>
  </div>
  ${g.demoNote ? `<p class="note">${ICON.info}<span>${esc(g.demoNote)}</span></p>` : ''}
  <div class="frame" id="frame">
    <iframe src="${g.src}" title="${esc(g.title)} demo" allow="fullscreen; autoplay"></iframe>
    <div class="loader" id="loader"><div class="loader-inner"><span class="spinner" aria-hidden="true"></span>Loading the demo…</div></div>
  </div>

  <div class="detail">
    <div class="prose">
      <section id="about"><span class="eyebrow">${esc(g.genre)}</span><h2>About the game</h2>${g.about.map(p => `<p>${esc(p)}</p>`).join('')}</section>
      <section id="how"><h2>How to play</h2><ol class="list">${g.how.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
      <section id="levels"><h2>Risk levels</h2>
        <p>Higher levels have fewer steps and a bigger chance of a bomb at each one, so the multipliers climb faster.</p>
        ${g.levelsNote ? `<p class="note">${ICON.info}<span>${esc(g.levelsNote)} <a href="index.html#brain">How brain levels work</a></span></p>` : ''}
        <div class="tbl"><table>
          <thead><tr><th>Level</th><th>Steps per flight</th><th>Multiplier, first to last step</th></tr></thead>
          <tbody>${g.levels.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${l.steps}</td><td class="num">${fx(l.first)} to ${fx(l.top)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section id="fairness"><h2>Provably fair</h2>
        <p>Every round is fixed before the first bet and its SHA-256 hash is published. After the round the seed is revealed, so the player, the casino or a regulator can recompute every step.</p>
        <div class="ctas" style="margin-top:4px"><a class="btn btn-sun" href="fairness.html">How the check works</a></div>
      </section>
    </div>
    <aside class="facts" id="specs" aria-label="Game specs">
      <h3>Specs</h3>
      <dl>${specs}</dl>
      ${g.provisional ? '<p class="fine">Provisional until the game is certified.</p>' : ''}
      ${assets ? `<div style="display:grid;gap:8px">${assets}</div>` : ''}
      <a class="btn btn-red" href="contact.html">Book a demo</a>
    </aside>
  </div>
</div>`;

const loader = $('#loader'), box = $('#frame');
const done = () => loader.classList.add('done');
$('iframe', box).addEventListener('load', done);
setTimeout(done, 8000);

const fs = $('#fs');
if (!box.requestFullscreen) fs.hidden = true;
fs.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : box.requestFullscreen()).catch(() => toast('Full screen is blocked in this browser.')));
document.addEventListener('fullscreenchange', () => {
  const on = document.fullscreenElement === box;
  fs.innerHTML = `${on ? ICON.shrink : ICON.expand}<span>${on ? 'Exit full screen' : 'Full screen'}</span>`;
});

jumpToHash();
})();
