# Merge notes — design changes to fold into the local build

Everything below was designed in `*.dc.html` and needs applying to the built site
(`index.html`, `about/`, `salons/`, `sits/`, `beyondbelief/`, `join/`).

**Read this first:** each built `index.html` contains **all six screens inlined**, so every
change below must be applied in **all seven files**, not just the route it belongs to — or
regenerate the build from the `.dc.html` sources. Keep the local build's own conventions when
applying: absolute `/assets/…` paths, `loading="lazy"` on non-plate images, the `TITLES` map,
and the real-path `href="/about/"` links. Do not copy the sources' relative `assets/…` paths or
`Page.dc.html` hrefs.

`README.md` in this folder is the full spec. This file is only the delta.

---

## 1. The realisationhouse definition — remove the band, add the glossary trigger

**Remove** the standing definition section that currently sits after `</header>` on About
(`background:#F0EEE8`, `<dl>`, term at `clamp(24px,3.4vw,32px)`). It introduced a third surface
tone and its 32px term competed with the h1 directly above it.

**Replace with** an on-demand gloss on the word in the h1 — the `.rh` pattern from
`archive-refined.html`, restyled to the current system. Spec in README § About, item 2. In short:

- The word is `color: transparent` + `-webkit-text-stroke: 1.4px #171916`, echoing the outline
  wordmark, and fills solid ink on hover/focus over 180ms. That fill **is** the affordance —
  the archive's dotted underline is dropped.
- Tip 10px below: lilac `#F2ECFF` (the site's existing meaning surface, same as `::selection`),
  `rgba(38,34,26,0.10)` hairline, **no shadow** (nothing else on the site casts one),
  `min(23rem,80vw)`, `padding:18px 20px`, 16px/1.6.
- Entry: headword 600 ink · IPA `[rɪəlaɪˈzeɪʃᵊnhaʊs]` 14px `#75726A` · italic "n." 600 `#5A4B7C`
  · definition `#43403A` 8px below.
- Behaviour: hover/focus opens; `tabindex="0"` with Enter/Space toggle and Escape dismiss; tap
  toggles on touch; any outside click closes; the tip's `left` clamps to a 12px viewport margin
  on open and on resize, because the word sits mid-line. `pointer-events` is `auto` only while
  open so the definition is selectable — safe because the tip is a **descendant** of the
  trigger, so moving into it never fires the trigger's `mouseleave`.

In the built site this is plain CSS + a small script, closer to the archive original than to the
component version here — port the values, not the React.

## 2. Copy

| Where | From | To |
|---|---|---|
| About, origin ¶2 | "This is a realisationhouse in the lineage of that atmosphere:" | "This is in the lineage of that atmosphere:" |
| About, closing band | "Joining takes a conversation and a mutual yes." | "Joining starts with a conversation." |

## 3. About — "Why it matters" ends on a statement

Cut the trailing sentence "We hope more realisationhouses will arise." out of the 17px
paragraph and set it as its own line below, `clamp(20px,2.6vw,25px)`, weight 600,
`letter-spacing:-0.022em`, `color:#5A4B7C`, **no max-width** (a `26ch` cap forced it to wrap).
It's the payoff of the definition and was buried mid-paragraph.

## 4. One action idiom, site-wide

This is the largest change and it touches every screen. Full table in README § Action styling.

- **Nav action** — remove the `border:1px solid #171916; padding:9px 15px` box. It becomes
  `11px/700/0.16em` uppercase, `color:#171916` (siblings stay `#75726A`), with a trailing `→` at
  `gap:7px`. Identical on About / Salons / Sits / Beyond Belief. Join omits it — you're there.
- **Section + closing CTAs** — filled `#171916` slabs and the ink-outlined variant on Sits both
  become: `border:1px solid #5A4B7C`, `color:#5A4B7C`, transparent; hover fills `#5A4B7C` with
  `#FDFCF9`. Same mechanic as the home door row.
- **Join submit** — `#5A4B7C` on `#5A4B7C` border with `#FDFCF9` text (already filled, being the
  terminal action). Was `#171916` / `#FFF7EE`.
- **Door tiles** — **no resting background on any tile.** The Door tile previously carried
  `#FFF7EE`; making it lilac was worse still, as it then merged with the lilac closing band
  directly below. All three tiles share the page surface; only hover differentiates
  (`#F8F6F1` on Salons/Sits, `#5A4B7C` + cream on The Door).
- The Door tile's meta line uses `opacity:0.62`, **not** `color:#75726A`. It must inherit, or it
  stays grey at 1.6:1 on the violet hover fill while the label beside it goes cream.

Retired tokens: filled `#171916` actions, ink-outlined boxes, and the one-off cream `#FFF7EE`.

## 5. Scope the entry fade — do not skip this

Each screen's standalone fade must be guarded:

    body:not(:has(.bc-layer)){opacity:0;animation:bc-fade-in 420ms cubic-bezier(.22,1,.36,1) 60ms forwards;}

…and the same guard on its `prefers-reduced-motion` counterpart. Unguarded, every inlined
screen's copy of this rule lands on the one `<body>`, so the whole app dips to transparent each
time a screen mounts — the flash the 700ms layer crossfade exists to remove. Correct for real
routes too, so keep it either way.

---

## Not touched

`404.html`, the `archive-*.html` files, the `TITLES`/SEO map, Formspree wiring, the intro
animation, and the routing. The routing recommendation from before still stands: serve the app
shell at each slug so deep links and social cards resolve.
