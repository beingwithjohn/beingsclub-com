# Handoff: Beings Club — simplified site

## Overview

A rebuild of beingsclub.com around one idea: the landing page is a **gateway**, not a document. The previous homepage carried the entire site — about, story, shared ground, vision, testimonials, offerings, a join form — on one long scroll. In this version the landing page is a single screen (wordmark, two lines, four doors) and everything else lives behind those doors.

Six screens: **Home**, **About**, **Salons**, **Sits**, **Beyond Belief**, **The Door** (join). Home and The Door are exactly one viewport tall with no scroll; the rest are 2–4 screens of scroll.

The site is delivered as an **app shell** — all six screens are loaded up front and crossfaded in place, so navigation never triggers a page load. There is also a **first-visit intro**: the wordmark draws itself, then glides into its resting position on the landing page.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy directly. They are authored in a proprietary streaming-component format (`.dc.html`, backed by `support.js`), which will not run in a normal app build.

The task is to **recreate these designs in the target codebase's environment** (React, Vue, Astro, plain static HTML — whatever the project uses) following its established patterns. The existing beingsclub.com is a set of static HTML files with inline styles served from a plain host; a static site generator or a small React/Astro app would both suit. If the project has no environment yet, plain static HTML with inline styles is closest to the current site and the least ceremony — but the layout logic here is straightforward in any framework.

Read the `.dc.html` files as markup + a small logic class:
- Everything between the `<x-dc>` tags is the markup, with inline `style` attributes.
- `style-hover="…"` is a hover state — translate to `:hover` CSS.
- `{{ name }}` is a value supplied by the logic class in the `<script data-dc-script>` block at the bottom of the file — usually a computed style object or an event handler.

## Fidelity

**High fidelity.** Colours, typography, spacing, copy and interactions are final. Recreate pixel-perfectly. All values below are exact.

---

## Design tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| Paper | `#FDFCF9` | Page ground, cards on tinted bands |
| Stone | `#F0EEE8` | Body ground behind the page column, logistics bands, image placeholder tone |
| Warm off-white | `#F8F6F1` | Footer strips, testimonial sections |
| Cream | `#FFF7EE` | The Door's letter panel |
| Lilac | `#F2ECFF` | Pull-quote bands, closing call-to-action bands, selection highlight |
| Ink | `#171916` | Primary text, buttons, borders |
| Body | `#43403A` | Body copy |
| Muted | `#75726A` | Eyebrows, captions, secondary copy |
| Violet | `#5A4B7C` | Accent — step numbers, eyebrows on offers, link hover, hover fills |
| Hairline | `rgba(38,34,26,0.10)` | All dividers and borders |
| Hairline (stronger) | `rgba(38,34,26,0.14)` | Frame borders |

### Typography

**Host Grotesk** (Google Fonts), weights 300–800, italic available.
`font-family: 'Host Grotesk', system-ui, -apple-system, sans-serif`

| Role | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| Page h1 | `clamp(30px, 5vw, 48px)` | 600 | 1.15 | -0.028em |
| Section h2 | `clamp(24px, 3.4vw, 32px)` | 600 | 1.2 | -0.025em |
| Pull-quote / band | `clamp(20–22px, 2.6–3.2vw, 26–30px)` | 600 | 1.25 | -0.025em |
| Lead paragraph | 19px | 400 | 1.7 | — |
| Body | 17px | 400 | 1.8 | — |
| Small body | 16px | 400 | 1.6–1.75 | — |
| Eyebrow | 11px | 600 | — | 0.18em, uppercase |
| Caption / meta | 10.5–11px | 600 | — | 0.16em, uppercase |
| Button | 12px | 700 | — | 0.16em, uppercase |
| Nav link | 11px | 600 | — | 0.16em, uppercase |
| Step number | 12px | 700 | — | — (violet) |
| Fact value | 16px | 600 | 1.4 | -0.01em, `white-space: nowrap` |
| Number display (35 / 10 / 5) | 28px | 600 | — | -0.03em |

`text-wrap: pretty` on most paragraphs and headings.

### Spacing

Section padding: `clamp(40px, 7vh, 72px)` vertical, `clamp(24px, 5vw, 56px)` horizontal.
Band (pull-quote / CTA) padding: `clamp(28–32px, 4.5–5.5vh, 44–56px)`.
Nav / footer strip padding: `14–18px` vertical, same horizontal as sections.
Grid gaps: 20px (testimonials), 26px (section stacks), `clamp(24px, 4vw, 48px)` (split layouts).

### Other

- **Border radius: 0 everywhere.** Nothing is rounded.
- **No shadows** except the light gradient on one figcaption overlay.
- Page column: `max-width: 64rem`, centred, `border-left`/`border-right` hairline, on the stone body ground.
- Full-bleed image plates: `height: clamp(220px, 38vh, 340px)`, `object-fit: cover`, `background: #F0EEE8` behind.

---

## Screens

### 1. Home (`Home.dc.html`)

**Purpose:** the gateway. Establishes what Beings Club is in two lines and offers four ways in. Must fit one viewport with no scroll at any size.

**Layout:** `height: 100svh`, flex column.
1. **Hero** (`flex: 1`, centred column, `gap: clamp(22px, 4vh, 48px)`, padding `clamp(28px, 6vh, 72px)` / `clamp(24px, 8vw, 120px)`, `overflow: hidden`)
   - Wordmark: `width: min(760px, 88vw)`, `max-height: 100%`, `object-fit: contain` so it shrinks on short viewports.
   - Copy block, centred: line 1 `clamp(19px, 2.8vh, 26px)/1.3`, weight 600, max-width 30ch — "A realisationhouse for the curious." Line 2 `clamp(15px, 2.05vw, 18px)/1.55`, muted, max-width 100% — "We gather to realise what is possible — in ourselves, between us, and in the world." Line 2 is `white-space: nowrap` above 640px and wraps below (max-width 30ch).
2. **Info line** — lilac band, hairline top, `padding: 16px 40px`, centred, 11px/600/0.18em uppercase violet. At rest reads **"For the benefit of all beings"**; on hovering a door it becomes that door's line.
3. **Door row** — four equal flex cells, hairline top, hairline left between cells, `padding: 24px 16px`, centred, 12px/700/0.18em uppercase. Hover: background `#5A4B7C`, colour `#FDFCF9`.
   | Door | Hover line | Target |
   |---|---|---|
   | Salons | Where curiosity connects | Salons |
   | Sits | For making meditation yours | Sits |
   | About | Why Beings Club exists | About |
   | The Door | Join the club | Join |
4. **Footer strip** — warm off-white, hairline top, `padding: 14px 40px`, space-between: "Beings Club" (11px/600/0.16em uppercase muted) | Instagram + X icons (17px / 15px, `currentColor`, muted) + `john@spacetobe.xyz`.

**Wordmark hover:** the mark is an SVG whose five concentric outlines are separate `<path data-ring="0|16|30|44">` elements with their own `stroke-width`. On hovering the outermost ring, all rings animate to `stroke-width: 6.5` (transition `.3s cubic-bezier(.22,1,.36,1)`); on leave they return to their authored widths. Implemented by inlining the SVG at runtime — only the outer ring has `pointer-events: fill`, the rest `none`.

### 2. About (`About.dc.html`)

Absorbs the old homepage. Order:
1. Nav (see below).
2. **Header** — eyebrow "About"; h1 "Beings Club is a realisationhouse for the curious." — **"realisationhouse" is a glossary trigger**: rendered `color: transparent` + `-webkit-text-stroke: 1.4px #171916` (echoing the outline wordmark), `cursor: help`, and it fills solid ink on hover/focus over 180ms. Hover, focus or tap reveals a definition tip 10px below it — lilac `#F2ECFF` (the site's meaning/emphasis surface, same as `::selection`), the standard `rgba(38,34,26,0.10)` hairline, **no shadow**, `min(23rem, 80vw)`, `padding: 18px 20px`, 16px/1.6, fading in with a 5px rise over 180ms. Entry: headword 600 ink, IPA `[rɪəlaɪˈzeɪʃᵊnhaʊs]` 14px `#75726A`, italic "n." 600 `#5A4B7C`, definition `#43403A` 8px below. `pointer-events` is `auto` only while open, so the definition is selectable; because the tip is a descendant of the trigger, moving into it does not dismiss it. Keyboard: `tabindex="0"`, Enter/Space toggles, Escape dismisses; tap toggles on touch, and any outside click closes. The tip's left offset is clamped to a 12px viewport margin at open and on resize, since the word sits mid-line. There is no standing definition section — the gloss is on demand only.
3. **Lead** — "At Beings Club we define curiosity as an orientation to experience that is open to discovery." A short separate bridge, "Together, we explore two principles in curiosity.", leads into the paired cards without repeating "Curiosity" as a title.
4. **Curiosity in two movements** — two-column grid (`auto-fit, minmax(19rem, 1fr)`), hairline between. Each: op-art mark 84px (`mix-blend-mode: multiply`), h2 22px/600, 17px/1.8 body max-width 44ch.
   - "Stay curious" — `assets/opart/stillness.png`; when we stay oriented to experience and open to discovery, what is important reveals itself and curiosity itself can deepen.
   - "Curiosity connects" — `assets/opart/interdependence.png`; as curiosity deepens and more is revealed, we're more available to ourselves, each other, fresh ideas and new futures.
5. **Plate** — `field-rings.jpg`, `object-position: center 62%`.
6. **Where it comes from** — the tea-house origin, two paragraphs, signed "— John".
7. **Why it matters** — lilac band. Keeps "Creativity is only ever limited by our sense of what's possible — and that sense is not fixed." The supporting copy moves through changing perception, relationship and possibility to the double realisation: what is important realised inwardly, and things of value realised in reality. Closes on a standalone violet (`#5A4B7C`) statement "We hope more realisationhouses will arise." at 20–26px/600/-0.022em, max-width 26ch. Split: copy left (`flex: 1 1 22rem`, padded left only), image right (`width: min(19rem, 40%)`, full band height, `object-fit: cover`, flush to the right edge, no caption). Below 44rem the image becomes a full-width 190–260px band beneath the copy.
8. **In their words** — "What it's like to be here." + three quotes.
9. **Door tiles** — three equal cells (Salons / Sits / The Door) with a label and a meta line, hover `#F8F6F1` on Salons/Sits, `#5A4B7C` with cream text on The Door; no tile carries a resting background.
10. **Closing band** — lilac, "Joining starts with a conversation." + "Leave us a note →".
10. Footer.

### 3. Salons (`Salons.dc.html`)

1. Nav. 2. **Header** — eyebrow, h1 "Space to connect — to oneself, to each other, and to what is possible.", three paragraphs ending bold on "Nothing to prepare, nothing to have figured out."
3. **Plate** — `salons-rainbow-circle.jpg`, `object-position: center 72%`.
4. **Logistics band** — five cells, 1px gaps on a hairline background, each cell stone with an uppercase label and a nowrap value: Two hours / Monthly / 5:30pm UK / Online / Pay what you can.
5. **How a Salon unfolds** — three numbered rows (violet number, 19px/600 title, 16.5px/1.75 body), hairline-separated.
6. **Pull-quote band** — lilac, "Curiosity connects."
7. **In their words** — "What it's like to be in a Salon." + three quotes (Zak EF, Ana C, Manansh S).
8. **Closing band** — lilac, "The next one is Sunday 27 September, 5:30pm UK." + "Come to the next one →" + "Why this exists".
9. Footer.

### 4. Sits (`Sits.dc.html`)

Opens on what a Sit *is*, then presents the current cohort as a swappable block.

1. Nav. 2. **Header** — eyebrow "Sits"; h1 "For making meditation yours."; three paragraphs (what a Sit is; John hosts, lineage caveat; "Sceptics welcome.").
3. **Plate** — `sits-shapes.jpg`.
4. **Pull-quote band** — lilac, "Meditation is curiosity and care turned towards our experience."
5. **Currently open** — split section: copy left (violet eyebrow "Currently open", h2 "Beyond Belief: the art of trusting yourself.", a paragraph, the principles as one line "Curiosity. Care. Responsibility. Play. Rest." at 19px/600, and a bordered "Learn more →" button); cover image right at `min(21rem, 42%)`, full height, flush right, linking to Beyond Belief. **This whole section is designed to be replaced when the cohort changes.**
6. **Logistics band** — 35 days / 16 Sep – 21 Oct / 6:30pm UK / Ten / Pay what you can.
7. **In their words** — "What it's like to sit with John." + three quotes (Laura F, Manansh S, Sean P).
8. **Closing band** — lilac, "Beyond Belief. / Thirty-five days. One practice." + "Take a place →" + "Start with a Salon instead".
9. Footer.

### 5. Beyond Belief (`BeyondBelief.dc.html`)

The specific offer page. Longest screen (~3–4 viewports).

1. Nav (with "Take a place →" as the emphasised action).
2. **Header** — violet eyebrow "A Sit · ten people · begins 16 September"; h1 "Beyond Belief: the art of trusting yourself."; lead; then "Hosted and introduced by John." / "Pay what you can, online, 16 September – 21 October." on two lines.
3. **Plate** — `bb-leap.jpg`, `object-position: center 75%`.
4. **Logistics band** — 35 days / Six Wednesdays / 6:30pm UK / Ten / Pay what you can.
5. **What it's for** — split section: "Make friends with experience." + three paragraphs; `bb-trust.jpg` right at `min(19rem, 40%)`, full height, flush right.
6. **Why this long** — "Long enough for the novelty to wear off." + one paragraph, then a three-cell strip: **35 days** / **10 people** / **5 practice partners**, each a 28px number-word and a 15.5px explanation.
7. **Plate** — `bb-glass.jpg` (breaks the text run).
8. **The shape of it** — "Five ways of approaching, in an order that matters." + six rows: number (violet), name (19px/600, min-width 8rem), date (11px caps muted, min-width 4.5rem), description (16px/1.7, max-width 52ch). Curiosity 16 Sep, Care 23 Sep, Responsibility 30 Sep, Play 7 Oct, Rest 14 Oct, The closing 21 Oct.
9. **Yours from the first day** — "Four things to practise with." in a 2×2 grid (`auto-fit, minmax(19rem, 1fr)`, gap 28px/40px): a written companion, a daily log, a practice partner, a private line to John.
10. **In their words** — warm off-white ground, "What it's like to learn with John." + three quotes.
11. **Closing band** — lilac, "Ten people. Thirty-five days. One practice." + "Take a place →" + "Back to Sits".
12. Footer.

### 6. The Door (`Join.dc.html`)

**Purpose:** register interest. One screen on desktop, scrolls on phones.

**Layout:** `height: 100svh` flex column — nav, then a two-column body (`flex: 1`), then footer.

**Left column — the letter** (cream `#FFF7EE`, `flex: 1 1 30rem`, grid rows `auto minmax(0,1fr) auto`):
- Eyebrow "The Door · leave us a note".
- The form is written as a letter at `clamp(17px, min(2.6vw, 3.1vh), 22px)` / 1.6, max-width 34rem, with fields as underline-only inputs (`border: 0; border-bottom: 1px solid #171916; background: transparent`):
  > Hello John — my name is `[your name, 11ch]`, and you can reach me at `[you@somewhere, 15ch]`.
  > I'm curious about `[Salons]` `[and]` `[Sits]`.
  > I found Beings Club through `[select]`.
  > What's drawing me toward this is
  > `[textarea, 2 rows, underline only]`
- Interest chips: 0.68em, 700, 0.16em uppercase, 1px ink border, `7px 14px`. Off = transparent on ink text; on = ink fill with cream text.
- The word **"and"** appears between the chips only when both are selected — animate `opacity 0→1` and `max-width 0→4em` over 400ms.
- **Progressive reveal:** only the first line is visible at rest. Once the name or email input receives any value, the remaining lines fade up (`opacity 0→1`, `translateY(8px)→0`) over **1.8s** with a 250ms delay, and the Send button goes from 0.35 to full opacity.
- Submit: "Send it →", ink, hover violet. Status line beneath at `clamp(13px, 2vh, 15px)`.
- Select options: someone I know / Instagram / X / Wonderfool / Space to Be / a search / somewhere else.

**Right column — "How joining works"** (`flex: 0 1 20rem`, hairline left): a header cell, then three equal cells (01/02/03), each centred vertically with a violet number and a 16px line:
1. You send a few lines about what's drawing you.
2. John replies himself, usually within a few days, and suggests a conversation.
3. A mutual yes, then invitations to Salons, Sits and happenings in person.

Below 44rem: page height becomes auto, the form's overflow is released, and the right column takes full width with a hairline top instead of left.

---

## Nav (all inner screens)

Sticky top, paper at 94% opacity with `backdrop-filter: blur(10px)`, hairline bottom, `padding: 18px clamp(24px, 5vw, 56px)`.
- Left: the **wordmark** linking home, `width: clamp(70px, 10vw, 94px)`, `aspect-ratio: 1544/665`. Inlined as SVG at runtime with `stroke-width: 9` at rest and **12 on hover** (transition `.25s cubic-bezier(.22,1,.36,1)`). Before the SVG loads, the file is shown as a CSS background so no space shifts.
- Right: two or three text links (11px caps muted) plus one outlined action — "The Door" on most screens, "Take a place" on Beyond Belief. Outlined action: 1px ink border, `padding: 9px 15px`, hover ink fill with paper text.
- Nav is **absent from Home and present on every other screen** — the landing page is deliberately chrome-free.

## Footer (all inner screens)

Warm off-white, `padding: 16px clamp(24px, 5vw, 56px)`, space-between: "For the benefit of all beings" | `john@spacetobe.xyz`, both 11px/600/0.16em uppercase muted.

---

## Interactions & behaviour

### App shell navigation (`Beings Club.dc.html`)
All six screens exist simultaneously as absolutely-positioned layers inside a `100svh` container. The active layer is `opacity: 1`, `visibility: visible`, `overflow-y: auto`; inactive layers are `opacity: 0`, `visibility: hidden`, `pointer-events: none`.

- **Entering** a layer: `opacity 1100ms cubic-bezier(.22,1,.36,1)` with a 120ms delay.
- **Leaving:** `opacity 700ms cubic-bezier(.33,0,.67,1)`, then `visibility` flips at 700ms.
- Only Home is mounted on first paint; the other five mount on `requestIdleCallback` so the first screen is fast and later screens are instant.
- Any click on an internal link is intercepted (capture phase) and turned into a layer change. URL updates via `pushState` to `#about`, `#salons`, `#sits`, `#beyondbelief`, `#join` (Home is `#`). `popstate` handled, so back/forward work. Entering a screen resets its `scrollTop` to 0.
- In a conventional app this maps to a client-side router with a crossfade transition and all routes preloaded; the important part is that **navigation never re-parses the document or re-fetches fonts/images.**

### First-visit intro
1. A full-bleed paper overlay (`z-index: 30`) holds the wordmark at `min(760px, 88vw)`, `max-height: 70vh`.
2. Each of the five outline rings is animated with `stroke-dasharray`/`stroke-dashoffset` from its full path length to 0 — **1700ms**, `cubic-bezier(.32,.72,.3,1)`, staggered **150ms** per ring, innermost first.
3. When the last ring finishes, the overlay's mark measures the landing page's mark and animates `translate(dx, dy) scale(b.width / a.width)` to land exactly on it — **900ms** `cubic-bezier(.22,1,.36,1)`.
4. The overlay fades out (`opacity 550ms`) behind the now-aligned mark.
5. Click or tap skips it. It plays **once per session** (`sessionStorage`), never on screen changes, and is skipped entirely under `prefers-reduced-motion`. Hard cap ~2.6s if anything stalls.

### Scroll reveal (inner screens)
Sections below the fold start at `opacity: 0`, `translateY(12px)` and animate in at `opacity/transform .6s cubic-bezier(.22,1,.36,1)` when their top passes 92% of the viewport. Above-the-fold content is never hidden. Disabled under reduced motion; has an 8s failsafe that reveals everything, and reveals all on `beforeprint`.

### Form validation (The Door)
All fields and the submit action are visible on arrival. Validation still provides the
sequence; the form must not imply that the disabled-looking button or missing fields depend
on first entering a name.

1. At least one of Salons / Sits — else "Salons, Sits, or both — pick at least one."
2. A name and an email matching `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — else "A name and a valid email, please."
3. On submit: status "Sending…", button locked. POST JSON to `https://formspree.io/f/xpqkbpyv` with `{ intent, interest, name, email, drawn, found }`.
4. Success: "Received, with thanks. We'll be in touch — until then, stay curious." Failure: "That didn't send. Try again, or email john@spacetobe.xyz." and the button unlocks.

### Performance behaviour to preserve
- Every plate image is a JPEG ≤ ~420KB at ≤1500px wide. The originals were 1–8MB PNGs; do not regress this.
- Images sit on a `#F0EEE8` background so a late decode fills in rather than flashing.
- The font stylesheet is preloaded; `display=swap`.
- Other screens' imagery is warmed on idle after the first screen settles.
- Do **not** combine a native cross-document view transition with a scripted fade — running both was the cause of a visible snap.

### Search-facing page heads

The generator emits one real URL per screen with its own title, description, canonical URL,
social card and JSON-LD graph. The current route's visible entity is described directly:
Beings Club and John on Home/About, `Service` for Salons and Sits, and `Course` plus a dated
`CourseInstance` for Beyond Belief. Inactive shell layers stay `data-nosnippet`, so the shared
visual shell cannot pollute the route's search excerpt.

## State

| State | Where | Purpose |
|---|---|---|
| `screen` | shell | which layer is active |
| `mounted` | shell | which layers have been instantiated |
| `intro` | shell | is the intro overlay showing |
| `hover` | Home | which door is hovered, drives the info line |
| `salons`, `sits` | The Door | interest chips; both true reveals "and" |
| `status`, `sending` | The Door | form feedback and submit lock |

No data fetching beyond the Formspree POST and the runtime fetch of the logo SVG.

## Assets

In `assets/` — all originate from the client's own library (`Beings Club/assets/`) or were supplied during design. Compressed copies are the ones referenced.

| File | Use |
|---|---|
| `beings-logo-outline.svg` | The wordmark. Five concentric outlines as separate `[data-ring]` paths — this structure is what makes the draw-on and hover-thickening possible. Keep it as SVG. |
| `img/field-rings.jpg` | About plate |
| `img/about-aura.jpg` | About "Why it matters" side image |
| `img/salons-rainbow-circle.jpg` | Salons plate |
| `img/sits-shapes.jpg` | Sits plate |
| `img/beyond-belief-cover-sm.jpg` | Sits "currently open" cover |
| `img/bb-leap.jpg` | Beyond Belief plate |
| `img/bb-glass.jpg` | Beyond Belief mid-page plate |
| `img/bb-trust.jpg` | Beyond Belief "What it's for" side image |
| `opart/interdependence.png`, `opart/stillness.png` | The two principles on About (`mix-blend-mode: multiply`) |

Instagram and X icons are inline SVG in the footer markup (1.8px stroke / filled respectively, `currentColor`).

Note: `sits-shapes.jpg` and `field-rings.jpg` are only 702px wide natively, so they soften slightly at full-bleed desktop widths — replace with higher-resolution originals if available.

## Files in this bundle

| File | What it is |
|---|---|
| `Beings Club.dc.html` | **The app shell** — mounts all six screens, owns routing, crossfades and the intro animation. Start here. |
| `Home.dc.html` | Landing screen |
| `About.dc.html` | About |
| `Salons.dc.html` | Salons |
| `Sits.dc.html` | Sits |
| `BeyondBelief.dc.html` | Beyond Belief |
| `Join.dc.html` | The Door |
| `page-transitions.js` | Standalone-page fades, scroll reveal, nav wordmark inlining and hover, idle image warming. Reference for the behaviours; the logic belongs in the app in whatever form suits. |
| `support.js` | Runtime for the `.dc.html` format. **Not part of the design** — included only so the prototypes open in a browser. |
| `assets/` | Logo and the compressed imagery the designs reference |

To view the prototypes, serve the folder over HTTP (they fetch the logo SVG, so `file://` won't work) and open `Beings Club.dc.html`.


## Action styling (site-wide, revised)

There is **one** action idiom, taken from the home door row: a cell with a hairline that fills violet on hover.

- **Nav map** — no boxes. Every inner screen keeps About, Salons, Sits and Door visible; the current location is marked with an underline and `aria-current` rather than disappearing from the map.
- **Section / closing CTAs** — `12px/700/0.16em` uppercase, `padding: 15px 26px`, `border: 1px solid #5A4B7C`, `color: #5A4B7C`; hover fills `#5A4B7C` with `#FDFCF9` text.
- **Join submit** — the same cell, already filled `#5A4B7C` / `#FDFCF9`, being the terminal action of the site.
- **Door tiles** — no resting background on any tile; Salons/Sits hover `#F8F6F1`, The Door hovers `#5A4B7C` with cream text.

Retired: filled `#171916` slabs, ink-outlined boxes, and the one-off creams `#FFF7EE`.

### Page fade vs. shell crossfade

Each screen file carries its own entry fade for when it is opened standalone:

    body:not(:has(.bc-layer)){opacity:0;animation:bc-fade-in 420ms cubic-bezier(.22,1,.36,1) 60ms forwards;}

The `:not(:has(.bc-layer))` guard is load-bearing. Inside the app shell every screen's helmet styles land on the same `<body>`, so an unscoped rule makes the whole app dip to transparent each time a screen mounts — the flash the shell's 700ms layer crossfade exists to remove. Keep the guard on both this rule and its `prefers-reduced-motion` counterpart, and if you serve the screens as real routes, keep it too: it stays correct either way.
