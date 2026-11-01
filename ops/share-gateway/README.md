# Public friend-challenge previews

Telegram failed to generate previews for playne.ru despite valid initial HTML,
public PNGs, DNS/TLS and WebpageBot refreshes. Serving the same live HTML and PNG
through this external gateway produced the full result card in Telegram.

- Production domain: `go.playne.ru` (Vercel project `playne-share`,
  `prj_cDN7MVNmecxQ2dvew7peeZ5M0dGX`). A `go` → `76.76.21.21`, a supported
  Vercel address returned by domain config. New share URLs, canonical, Open Graph
  and Twitter image URLs use the branded domain.
- Existing `playne-results.vercel.app` and `playne-share.vercel.app` aliases remain
  for previously shared links; new links use go.playne.ru. The local network's DNS
  cached NXDOMAIN during initial setup, so verify authoritative/public DNS and HTTPS
  independently when a local browser still reports an unresolved hostname.
- Only public short/legacy challenge landings and their images are served.
  All cookies, authorization and query strings are discarded. No arbitrary URLs.
- PNGs are rendered on the gateway from small public challenge metadata, using
  the exact shared artwork, WASM renderer and fonts. Transferring the original
  PNG from Russia to the gateway intermittently exceeded the request timeout,
  even when the source logged 200; do not restore that binary proxy path.
- HTML/PNG always recheck the original challenge and use `no-store`; revocation
  therefore remains effective. Upstream errors fail closed.
- JavaScript-capable visitors continue to the original challenge on playne.ru.
  Accounts, gameplay, comparison and Metrika stay on the main site.
- Open Graph images and URLs use the gateway host. Canonical and noindex remain.
- New share URLs are selected centrally by `server/challenge-links.ts`; local
  and test installations retain their own origin. Old playne.ru links still work.

Run `node scripts/build-share-gateway.mjs` from the repository root. Deploy the
generated `.ai/telegram-preview/gateway-dist` as the root of the existing Vercel
project, production target, no framework or build command. Install its pinned
`@resvg/resvg-wasm` dependency with npm; do not disable installation. The build
copies both fonts and their license and bundles the shared renderer, leaving
the WASM npm dependency external. There are no secrets. Verify public GET/HEAD,
fresh PNG hashes/timings and the actual Telegram card after changes.
Do not infer preview success from a 200 response or WebpageBot's success message.

Rollback: return the production URL mapping in `challenge-links.ts` to playne.ru;
keep the gateway available so previously shared gateway links keep working.
The main API release uses the existing exact-SHA deployment workflow.
