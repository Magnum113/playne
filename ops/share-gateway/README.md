# Public friend-challenge previews

Telegram failed to generate previews for playne.ru despite valid initial HTML,
public PNGs, DNS/TLS and WebpageBot refreshes. Serving the same live HTML and PNG
through this external gateway produced the full result card in Telegram.

- Production domain: `playne-results.vercel.app` (Vercel project `playne-share`,
  `prj_cDN7MVNmecxQ2dvew7peeZ5M0dGX`). This production project domain is public,
  resolves to an ingress reachable from the tested network and displays Telegram cards.
- Diagnostic alias: `playne-share.vercel.app`; its ingress timed out from the
  tested local network, so it is not used for new links.
- Branded candidate `go.playne.ru`: A `go` → `76.76.21.21`, a supported Vercel
  address returned by domain config. DNS and HTTPS verified, but Telegram did not
  generate its card during acceptance. Do not enable it until an actual card works.
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
keep the gateway available so previously shared gateway links keep working.
The main API release uses the existing exact-SHA deployment workflow.
