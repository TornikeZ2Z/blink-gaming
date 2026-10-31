# Brainer inbox

The demo-request inbox behind `brainer.games/contact.html`: one Cloudflare Worker, a D1 database and Cloudflare Email Routing,
all on the account that owns `brainer.games` (Tornike, 2026-10-27).

| Piece | Where | What it does |
|---|---|---|
| Form endpoint | `https://api.brainer.games/requests` | The contact form POSTs JSON here. The Worker checks the answers, keeps them in D1 and emails the team. Only `https://brainer.games` (and `www.`) may call it. |
| Inbox | `https://admin.brainer.games` | Sign in with a one-time link sent by email, then: requests by status (New, Talking, Qualified, Won, Closed, Spam), search, notes, reply by email, delete, CSV export. |
| Public email | `info@brainer.games` | Email Routing rule: forwards to tornike@datastudio.ge. The site shows this address. The old `info@brainer.games` rule stays on, so that address still reaches him. |
| Notification email | from `inbox@brainer.games` | Sent by the Worker (send_email binding) to `NOTIFY_TO` for every new request, with Reply-To set to the requester. |

## Spam and abuse

- A hidden honeypot field (`fax`) and a minimum fill time (2.5 s): either quietly drops the form, with a normal answer.
- At most 5 forms per IP per hour. The IP is stored only as a salted hash, for this limit.
- No CAPTCHA. If spam gets through, add Cloudflare Turnstile to the form and check its token in `submit()`.

## Access

`ADMIN_EMAILS` in `wrangler.toml` lists who can get a sign-in link. Every address there must also be a **verified destination**
in Email Routing (Cloudflare sends it a confirmation email) and appear in `allowed_destination_addresses`, or the link can't be
sent. A link works once, for 15 minutes; the session cookie lasts 30 days. The sign-in page gives the same answer for any address.

Cloudflare Access (Zero Trust) isn't enabled on the account, so the Worker handles its own sign-in. If Access is turned on later,
put `admin.brainer.games` behind it as well.

## Deploy

From this folder, signed in with `npx wrangler login`:

```bash
npx wrangler d1 create brainer-inbox            # once; put its id in wrangler.toml
npx wrangler d1 execute brainer-inbox --remote --file schema.sql
npx wrangler secret put SESSION_SECRET          # once; any long random string
npx wrangler deploy
```

Local test: `npx wrangler dev --local` (copy `.dev.vars` with a `SESSION_SECRET`). Local dev answers on the first route's
hostname only, so to try the inbox locally run it with `--var ADMIN_HOST:api.brainer.games`. Emails are written to `.eml`
files instead of being sent.

## Changing the form

The fields live in `FIELDS` in `src/worker.js` and in `Website/contact.html`. A field the Worker doesn't list is ignored, so
add it in both. Fields without `col: true` are kept in the `data` JSON column, so no migration is needed.
