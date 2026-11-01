# Public friend-challenge previews

Telegram failed to generate previews for playne.ru despite valid initial HTML,
public PNGs, DNS/TLS and WebpageBot refreshes. Serving the same live HTML and PNG
through this external gateway produced the full result card in Telegram.

- Production domain: `go.playne.ru` (Vercel project `playne-share`).
- Public diagnostic alias: `playne-share.vercel.app`.
- DNS: A `go` → `76.76.21.21`, a supported Vercel value returned by domain config.
  This address was reachable from the tested Russian network; newer default
  vercel.app addresses timed out there.
- Only public short/legacy challenge landings and their images are relayed.
  All cookies, authorization and query strings are discarded. No arbitrary URLs.
- HTML/PNG always recheck the original challenge and use `no-store`; revocation
  therefore remains effective. Upstream errors fail closed.
- JavaScript-capable visitors continue to the original challenge on playne.ru.
  Accounts, gameplay, comparison and Metrika stay on the main site.
- Open Graph images and URLs use the gateway host. Canonical and noindex remain.
- New share URLs are selected centrally by `server/challenge-links.ts`; local
  and test installations retain their own origin. Old playne.ru links still work.

Deploy the files in this directory as the root of the existing Vercel project,
production target, no framework, no install/build commands. There are no secrets
or dependencies. Verify public GET/HEAD and the actual Telegram card after changes.
Do not infer preview success from a 200 response or WebpageBot's success message.

Rollback: return the production URL mapping in `challenge-links.ts` to playne.ru;
keep the gateway available so previously shared go.playne.ru links keep working.
The main API release uses the existing exact-SHA deployment workflow.
