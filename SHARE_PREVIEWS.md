# Friend challenge preview — selected option B

Visual source: `output/imagegen/playne-field-refinements-2026-10-30/B-dot-grid.png`
in the primary SizeIT workspace. It remains the approved design; it is not a
production asset because its score and circle are baked into a single bitmap.

The production PNG is rendered from the same 1200×630 SVG/embedded-font/WASM
pipeline as before. `server/challenge-preview.ts` reproduces the selected layout:
cream field, faint mint dots outside, a lavender backing panel, white grid,
large real result, a game-specific illustration and the short green invitation.
The logo uses the supplied Playne geometry from `SiteHeader.PlayneMark`.

`server/challenge-art.ts` exhaustively covers all ten ChallengeGame values:

- circle: green drawn circle and centre dot;
- naglaz: tower/pen size comparison;
- colorfle: seven coloured hexagons;
- geo: globe and location pin;
- pressure: dial and needle;
- line: the public introductory puzzle;
- flash: memory grid;
- rotate: rotated tile figures;
- slide: sliding-block board;
- dispatch: branching railway and destinations.

Illustrations are public examples, independent of the invited run. They never
include a puzzle seed, answer, hidden grid or actual location from that run.
Only the real numeric score is dynamic on the illustration. The game name and
score scale are taken from authoritative challenge metadata.

Circle uses a percentage; pressure uses points; the other games show the score
out of 500. At a maximum score the invitation is “Сможешь повторить?”, otherwise
“Побьёшь мой результат?”. The image omits nickname/date/extra badges as in B;
the sender remains named in the existing OG title and landing page.

Version: `field-b-v3`. Both the bounded image cache and `og:image` URL carry the
version. Public short URLs and legacy `/challenge/:token` links are unchanged.
The PNG route still serves requests without a version query. It remains no-store
and checks revocation before rendering or consulting the renderer cache.
Existing messages can retain chat-provider preview caches until re-fetched.

The same URL feeds the sharing-dialog image, OG metadata and Twitter large-image
metadata. `og:image:alt` and `twitter:image:alt` provide a textual equivalent.
No external image service, fonts or native production dependencies are added.

Verification: ten distinct valid 1200×630 PNGs, repeated-render consistency,
Russian decimal formatting, maximum/zero scores, large pressure scores, escaped
names/titles and existing sharing/revocation/API checks. Visual gallery and
small chat-size checks are in this task's untracked `output/share-b/` directory.
