/* The demo-request inbox for brainer.games: one Cloudflare Worker on two hostnames.
     api.brainer.games    POST /requests: the contact form sends here. It checks the answers, keeps them in D1 and emails
                          the team (info@brainer.games is the address people see; the note goes to the admins).
     admin.brainer.games  the inbox itself: a one-time sign-in link by email, then a list of requests with statuses and notes.
   Settings live in wrangler.toml; SESSION_SECRET is a Worker secret (`npx wrangler secret put SESSION_SECRET`). */
import { EmailMessage } from 'cloudflare:email';
import ADMIN_HTML from './admin.html';

// The form's fields in the order the email and the inbox show them. `col` fields have their own column in D1; the rest
// go into `data`. Anything else a browser sends is ignored, so a changed form can't write junk into the database.
export const FIELDS = [
  { key: 'name', label: 'Name', col: true, required: true, max: 120 },
  { key: 'email', label: 'Work email', col: true, required: true, max: 200, email: true },
  { key: 'company', label: 'Company', col: true, required: true, max: 160 },
  { key: 'company_type', label: 'You are', col: true, required: true, max: 80 },
  { key: 'website', label: 'Company website', max: 200 },
  { key: 'markets', label: 'Markets / licences', max: 400 },
  { key: 'platform', label: 'Aggregator or platform', max: 200 },
  { key: 'messenger', label: 'Telegram / WhatsApp', max: 160 },
  { key: 'message', label: 'Message', max: 4000 },
  { key: 'consent', label: 'Agreed to be contacted', max: 10 },
  { key: 'news', label: 'Wants new game releases', max: 10 }
];
export const STATUSES = ['new', 'talking', 'qualified', 'won', 'closed', 'spam'];
const LIMIT_PER_HOUR = 5;          // forms from one IP per hour; more get a polite "try later"
const MIN_FILL_MS = 2500;          // a form filled faster than this was filled by a script
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;

const enc = new TextEncoder();
const now = () => new Date().toISOString();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const list = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const isEmail = s => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]{2,}$/.test(s);

/* ---------- email: plain-text notes sent with the send_email binding ---------- */
// RFC 2047 for non-ASCII headers (Georgian names), base64 bodies so any text survives.
const b64 = s => btoa(String.fromCharCode(...enc.encode(s)));
const hdr = s => /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
async function sendMail(env, { to, subject, text, replyTo }) {
  const from = env.MAIL_FROM;
  const lines = [
    `From: ${hdr('Brainer inbox')} <${from}>`, `To: <${to}>`, `Subject: ${hdr(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`, `Date: ${new Date().toUTCString()}`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    b64(text).replace(/.{76}/g, '$&\r\n')
  ];
  await env.MAILER.send(new EmailMessage(from, to, lines.join('\r\n')));
}

/* ---------- the public form endpoint ---------- */
function cors(req, env) {
  const origin = req.headers.get('origin') || '';
  return list(env.ALLOWED_ORIGINS).includes(origin.toLowerCase())
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
    : null;
}
async function submit(req, env, ctx) {
  const ch = cors(req, env);
  if (!ch) return json({ ok: false, error: 'origin' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400, ch); }
  // the honeypot (a field people can't see) and the fill time: either one quietly drops the form, with a normal answer
  if (clean(body.fax, 50) || !(Number(body.t) >= MIN_FILL_MS)) return json({ ok: true }, 200, ch);

  const v = {}, bad = [];
  for (const f of FIELDS) {
    v[f.key] = f.key === 'consent' || f.key === 'news' ? ([true, 'on', 'yes'].includes(body[f.key]) ? 'yes' : '') : clean(body[f.key], f.max);
    if (f.required && !v[f.key]) bad.push(f.key);
    if (f.email && v[f.key] && !isEmail(v[f.key])) bad.push(f.key);
  }
  if (v.consent !== 'yes') bad.push('consent');
  if (bad.length) return json({ ok: false, error: 'invalid', fields: [...new Set(bad)] }, 422, ch);

  const ip = req.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await sha256(`${env.SESSION_SECRET}|${ip}`) : null;
  if (ipHash) {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM requests WHERE ip_hash = ? AND created_at > ?').bind(ipHash, since).first();
    if (n >= LIMIT_PER_HOUR) return json({ ok: false, error: 'rate' }, 429, ch);
  }
  const data = Object.fromEntries(FIELDS.filter(f => !f.col && v[f.key]).map(f => [f.key, v[f.key]]));
  const t = now();
  const row = await env.DB.prepare(`INSERT INTO requests (created_at, updated_at, status, name, email, company, company_type, data, page, country, ip_hash, user_agent)
    VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(t, t, v.name, v.email, v.company, v.company_type || null, JSON.stringify(data), clean(body.page, 300) || null,
      req.cf?.country || null, ipHash, clean(req.headers.get('user-agent'), 300) || null).first();

  // the note to the team, after the answer has gone back: a mail hiccup must not lose the request, it's already saved
  const text = [`New demo request #${row.id} on brainer.games`, '',
    ...FIELDS.filter(f => v[f.key]).map(f => `${f.label}: ${v[f.key]}`), '',
    `Country (from IP): ${req.cf?.country || 'unknown'}`, `Open it in the inbox: https://${env.ADMIN_HOST}/#${row.id}`, '',
    'Reply to this email to answer the requester directly.'].join('\n');
  ctx.waitUntil(Promise.allSettled(list(env.NOTIFY_TO).map(to =>
    sendMail(env, { to, subject: `Demo request: ${v.company} (${v.name})`, text, replyTo: v.email }))));
  return json({ ok: true, id: row.id }, 200, ch);
}

/* ---------- sign-in: a one-time link by email, then a signed cookie ---------- */
async function hmac(env, s) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}
async function sessionOf(req, env) {
  const c = (req.headers.get('cookie') || '').split(/;\s*/).find(x => x.startsWith('inbox='));
  if (!c) return null;
  const [email, exp, sig] = decodeURIComponent(c.slice(6)).split('|');
  if (!email || !(Number(exp) > Date.now()) || !list(env.ADMIN_EMAILS).includes(email)) return null;
  const want = await hmac(env, `${email}|${exp}`);
  return sig && sig.length === want.length && crypto.subtle.timingSafeEqual(enc.encode(sig), enc.encode(want)) ? email : null;
}
async function login(req, env, ctx) {
  const { email } = await req.json().catch(() => ({}));
  const e = clean(email, 200).toLowerCase();
  if (list(env.ADMIN_EMAILS).includes(e)) {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO logins (token_hash, email, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), e, Date.now() + LINK_MINUTES * 60e3).run();
    ctx.waitUntil(sendMail(env, { to: e, subject: 'Your sign-in link for the Brainer inbox',
      text: `Open this link to sign in to the Brainer inbox. It works once, for ${LINK_MINUTES} minutes:\n\nhttps://${env.ADMIN_HOST}/auth?t=${token}\n\nIf you didn't ask for it, ignore this email.` }));
  }
  return json({ ok: true });   // the same answer for any address, so the page can't be used to guess who has access
}
async function auth(url, env) {
  const t = url.searchParams.get('t') || '';
  const h = await sha256(t);
  const row = await env.DB.prepare('UPDATE logins SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > ? RETURNING email').bind(h, Date.now()).first();
  if (!row || !list(env.ADMIN_EMAILS).includes(row.email)) return page('That sign-in link has expired or was already used.', 'Ask for a new one');
  await env.DB.prepare('DELETE FROM logins WHERE expires_at < ?').bind(Date.now() - 86400e3).run();
  const exp = Date.now() + SESSION_DAYS * 86400e3;
  const v = encodeURIComponent(`${row.email}|${exp}|${await hmac(env, `${row.email}|${exp}`)}`);
  return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': `inbox=${v}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax` } });
}
const page = (msg, link) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brainer inbox</title>
<style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f4ff;color:#1b1838}@media(prefers-color-scheme:dark){body{background:#0b0f1e;color:#eeedff}}a{color:#7a5cff}</style>
<p>${msg} <a href="/">${link}</a></p>`, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } });

/* ---------- the inbox's API ---------- */
async function api(req, env, url, who) {
  const p = url.pathname.replace(/^\/api/, '');
  // every change needs this header: a cross-site form can't add it, so a link elsewhere can't change the inbox
  if (req.method !== 'GET' && req.headers.get('x-inbox') !== '1') return json({ ok: false, error: 'csrf' }, 403);
  if (p === '/meta') return json({ me: who, fields: FIELDS.map(({ key, label }) => ({ key, label })), statuses: STATUSES });
  if (p === '/requests' && req.method === 'GET') {
    const st = url.searchParams.get('status') || '', q = `%${(url.searchParams.get('q') || '').trim()}%`;
    const where = [], args = [];
    if (st && STATUSES.includes(st)) { where.push('status = ?'); args.push(st); } else if (!st) { where.push("status != 'spam'"); }
    if (q !== '%%') { where.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR data LIKE ?)'); args.push(q, q, q, q); }
    const rows = await env.DB.prepare(`SELECT id, created_at, status, name, email, company, company_type, country,
      (SELECT COUNT(*) FROM notes WHERE request_id = requests.id) AS notes FROM requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC LIMIT 500`).bind(...args).all();
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM requests GROUP BY status').all();
    return json({ rows: rows.results, counts: Object.fromEntries(counts.results.map(r => [r.status, r.n])) });
  }
  if (p === '/export.csv') {
    const rows = (await env.DB.prepare('SELECT * FROM requests ORDER BY created_at DESC').all()).results;
    const cols = ['id', 'created_at', 'status', ...FIELDS.map(f => f.key), 'country', 'page'];
    const cell = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map(r => { const d = JSON.parse(r.data || '{}'); return cols.map(c => cell(r[c] ?? d[c])).join(','); })].join('\r\n');
    return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="brainer-requests-${now().slice(0, 10)}.csv"` } });
  }
  const m = p.match(/^\/requests\/(\d+)(\/notes)?$/);
  if (m) {
    const id = Number(m[1]);
    if (m[2] && req.method === 'POST') {
      const { body } = await req.json().catch(() => ({}));
      const b = clean(body, 4000);
      if (!b) return json({ ok: false, error: 'empty' }, 422);
      await env.DB.batch([env.DB.prepare('INSERT INTO notes (request_id, created_at, author, body) VALUES (?, ?, ?, ?)').bind(id, now(), who, b),
        env.DB.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').bind(now(), id)]);
      return json({ ok: true });
    }
    if (req.method === 'GET') {
      const r = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
      if (!r) return json({ ok: false, error: 'not_found' }, 404);
      const notes = (await env.DB.prepare('SELECT id, created_at, author, body FROM notes WHERE request_id = ? ORDER BY created_at').bind(id).all()).results;
      const { ip_hash, ...rest } = r;
      return json({ ...rest, data: JSON.parse(r.data || '{}'), notes });
    }
    if (req.method === 'PATCH') {
      const { status } = await req.json().catch(() => ({}));
      if (!STATUSES.includes(status)) return json({ ok: false, error: 'status' }, 422);
      await env.DB.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), id).run();
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM notes WHERE request_id = ?').bind(id), env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id)]);
      return json({ ok: true });
    }
  }
  return json({ ok: false, error: 'not_found' }, 404);
}

const SECURITY = { 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' };
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname === env.API_HOST) {
      if (url.pathname === '/requests' && (req.method === 'POST' || req.method === 'OPTIONS')) return submit(req, env, ctx);
      return json({ ok: false, error: 'not_found' }, 404);
    }
    if (url.hostname !== env.ADMIN_HOST) return new Response('Not found', { status: 404 });
    const sec = r => { for (const [k, v] of Object.entries(SECURITY)) r.headers.set(k, v); return r; };
    if (url.pathname === '/login' && req.method === 'POST') return sec(await login(req, env, ctx));
    if (url.pathname === '/auth') return sec(await auth(url, env));
    if (url.pathname === '/logout' && req.method === 'POST') return sec(new Response(null, { status: 303, headers: { location: '/', 'set-cookie': 'inbox=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } }));
    const who = await sessionOf(req, env);
    if (url.pathname.startsWith('/api/')) return sec(who ? await api(req, env, url, who) : json({ ok: false, error: 'signin' }, 401));
    if (url.pathname === '/' && req.method === 'GET') return sec(new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }));
    return sec(new Response('Not found', { status: 404 }));
  }
};
