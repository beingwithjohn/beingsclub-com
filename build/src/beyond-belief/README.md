# Handoff: Beyond Belief — Beings Club Sits

## Overview

Beyond Belief is a 35-day meditation experiment run by Beings Club: ten people sit every day they can from Wed 16 Sep to Tue 20 Oct 2026, meeting live on six Wednesday evenings (6:30–7:45pm UK), closing 21 Oct. £222, paid up front.

This bundle covers five surfaces:

| # | Surface | Purpose |
|---|---|---|
| 1 | **Course Page (Before payment)** | Public sales page. Ends in a Luma booking link. |
| 2 | **Practice Companion (Web)** | The practice map as a scrolling page, tied to the course (weeks, dates, partners). Given to participants on day one. |
| 3 | **Practice Companion (Print)** | Same content as a 14-page A4 document for PDF/print. |
| 4 | **Practice Map (Standalone)** | 13-page A4 document. Identical teaching content with all Beyond Belief specifics stripped — circulates independently of the course. |
| 5 | **Practice Log** | Full design for the daily practice tool: 7 emails, 16 mobile screens, 4 desktop layouts, plus tokens, motion, states and copy rules. See `Practice Log - build notes.md`. |

Plus `Beyond Belief - Course Spec.md` — the authoritative written spec for the offering. **When copy in a design file and the spec disagree, the design files are newer.**

## About the design files

The `.dc.html` files in this bundle are **design references written in HTML** — prototypes showing intended look, copy and behaviour. They are not production code to lift directly.

They run on a small internal component runtime (`support.js` provides the `<x-dc>` wrapper; `doc-page.js` provides the paged-document component). Neither belongs in a real codebase. **Recreate these designs in the target environment using its own patterns and libraries.** If there is no environment yet, pick a suitable one — these are static content pages, so a static site generator or Next.js is more than enough. Only the Practice Log needs real application logic.

To view a file as intended, open it directly in a browser from this folder (the sibling `support.js`, `doc-page.js` and `assets/` must stay alongside it).

## Fidelity

**High fidelity.** Final copy, colours, type and spacing throughout. Recreate pixel-accurately using the target codebase's own libraries. Every value below is exact and was normalised across all five files in a dedicated pass — the ladders are deliberate, not incidental.

---

## Design tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| Ink | `#171916` | Text, rules, dark backgrounds |
| Paper | `#FDFCF8` | Default page background |
| Muted | `#5a5c58` | Body copy, secondary text |
| Faint | `#9a9c97` | Eyebrow labels, page numbers, captions |
| Amber | `#FFAD54` | The single accent: numerals, eyebrow accents, hover fills, progress bar |
| Sand | `#FBF4EA` | Warm panel tint |
| Sage | `#E8EBE2` | Cool panel tint (cultivate cards) |
| Lilac | `#EFEAF6` | Cool panel tint (rest cards, pull-quotes) |
| Hairline | `rgba(23,25,22,.14)` | Internal cell dividers |
| Hairline strong | `rgba(23,25,22,.16)` | Spec table rules |

Rules: **1px solid `#171916`** for section boundaries, **1px solid `rgba(23,25,22,.14)`** for dividers inside a block. Never more than two tinted backgrounds in view at once.

### Type

`Host Grotesk` (Google Fonts, weights 300–800, italic axis), fallback `system-ui, -apple-system, sans-serif`.

Tracking is tied to size — seven values only:

| Role | Tracking |
|---|---|
| Display (h1, huge numerals) | `-.04em` |
| Headings (h2, section titles) | `-.03em` |
| Subheads, card titles | `-.02em` |
| Lead paragraphs, small labels | `-.01em` |
| Body | `0` |
| Caps labels (eyebrows) | `.16em` |
| Micro caps (hero tags, footers) | `.2em` |

Leading: **1.65** for 16px prose, **1.6** for 14px small text, **.9–1.1** for display. Weights used: 500, 600, 700, 800. Body copy caps at `64ch`–`72ch`.

### Spacing

- **Print documents:** 4px ladder — 4, 8, 12, 16, 20, 24. Page band `24mm 20mm`, running footer at `16mm`, so every page corner reads 20 × 16mm. All panels use 20px vertical / 24px horizontal padding (1 : 1.2).
- **Screen documents:** .25rem ladder. Row padding `1.25rem` or `1.5rem` vertical against a fluid horizontal gutter `clamp(1.5rem, 5cqi, 3.75rem)`. Section padding `clamp(3rem, 7vh, 4.75rem)`.
- Horizontal gutters are container-query based (`cqi`) throughout, off a `container-type: inline-size` wrapper capped at `72rem`.

### Other

Border radius: **0 everywhere.** No shadows except text-shadow over hero imagery. Transitions 0.15–0.18s on colour properties only.

---

## Screens

### 1 · Course Page (Before payment)

Long scrolling sales page, `max-width: 72rem`, centred, full-bleed bands separated by 1px ink rules.

Order: sticky nav → hero (cover image, dark gradient, headline, £222 CTA) → four-cell fact strip → **In plain terms** (six numbered facts) → **A commitment, not a course** → 35/5/10 stat trio → **What a week actually looks like** (two columns: Wednesday | rest of the week) → **Five principles, five weeks** (six rows) → **What you leave with** (three cards with op-art) → pull-quote band → **Why it's built this way** (long-form essay) → pull-quote band → **Sceptics welcome** (two columns) → **A note from John** → testimonial carousel → **What £222 covers** → **Fair questions** (nine Q&A rows) → closing CTA → footer.

- Nav is `position: sticky; top: 0`, 1px ink bottom rule, paper background.
- Hero image `assets/course-cover.png`, `height: clamp(24rem, 86cqi, 50rem)`, `object-position: center 30%`, four-stop dark gradient over it.
- Pull-quote bands: centred, 800 weight, `clamp(1.5rem, 4.4cqi, 2.9rem)`, uppercase, `max-width: 24ch`, one word outlined via `-webkit-text-stroke: 1.4px #171916; color: transparent`. Same outlined-word treatment appears in most h2s at 1.5px.
- Testimonials are a horizontal scroll-snap rail (`scroll-snap-type: x mandatory`), cards `flex: 0 0 min(82%, 22rem)`, scrollbar hidden. Crossing the viewport edge is intended.
- CTAs link to `https://luma.com/0tosnxn0`; secondary mails `john@spacetobe.xyz`.

**Responsive:** below 48rem the section links leave the nav (logo + "Take a place" stay, keeping it one line); below 30rem all CTAs go full width. Every grid is `repeat(auto-fit, minmax(Nrem, 1fr))` and needs no other breakpoints.

### 2 · Practice Companion (Web)

Same shell and vocabulary as the course page, plus a 3px fixed scroll-progress bar at the top (amber fill, `rgba(23,25,22,.1)` track) driven by `scrollY / (scrollHeight - innerHeight)`.

Order: progress bar → sticky nav (anchors to Body / Heart / Mind / Yours) → hero → three-cell fact strip → **This is a map, not a method** → "Nothing to fix" band → **How to explore the map** (gentleness | precision, then letting-go panel) → **Five principles** (five rows) → partner note (sage panel, 3px amber left border) → **A suggested posture** (seven-row table) → **Three aspects of experience** → for each of Body / Heart / Mind: a territory section, a cultivate/rest card pair (sage | lilac), then a "What is revealed" split (Presence / Resonance / Spaciousness) → **Making it your own** (three "if…" cells) → closing band → **Stay curious.** → footer.

**Responsive:** below 48rem nav links hide; below 36rem the posture table and principle rows drop their fixed label column and stack label-over-text. Implemented as attribute selectors on inline styles — in a real codebase use ordinary classes.

### 3 · Practice Companion (Print) — 14 A4 pages

One `<section class="page">` per page, portrait A4, full bleed, `overflow: hidden`.

01 Cover (full-bleed image, dark) · 02 Before you begin · 03 The five principles (+ partner note) · 04 How to explore the map · 05 A suggested posture · 06 Three aspects of experience (contents-style list) · 07 The Body · 08 Presence · 09 The Heart · 10 Resonance · 11 The Mind · 12 Spaciousness · 13 Making it your own · 14 Closing.

Every page except the cover: `padding: 24mm 20mm`, content vertically centred in a `flex: 1` wrapper, running footer absolutely positioned at `bottom: 16mm` (section name left, page number right). "Revealed" pages (08/10/12) set a 64px display numeral and cap content at `52ch`.

**All 14 pages fit the A4 box exactly with no overflow — verify this after any copy change.**

### 4 · Practice Map (Standalone) — 13 A4 pages

Identical system, with the course-specific pages and references removed (no principles table, no dates, no partners, no cohort language). Keeps Beings Club branding and closes pointing at the Sits and the Salons. Page 12's play line reads "let your practice become a friend" rather than "the week the practice becomes a friend".

### 5 · Practice Log

The complete product design for the daily tool, on one board: **Part one** seven emails (600px), **Part two** sixteen mobile screens at 390pt in the order a person meets them, **Part three** four desktop layouts at 1152px, **Part four** the build spec — tokens, the millisecond anatomy of one tap, nine edge states, banned vocabulary and the Phase 1 surface.

The loop: an email arrives at an hour the participant chose → they practise → one tap records the day → a beat alone → the cohort grid fades up → they leave. **Nothing about the cohort is shown before the tap, and no streak is ever kept** — both are product rules, not visual ones.

This is the only surface needing real backend work. Read `Practice Log - build notes.md` before starting it; it carries everything the board implies but can't show.

---

## Interactions & behaviour

- **Hover:** `.cta` fills amber; `.cta-ghost` inverts to ink; `.cta-light` goes to paper; nav links go from muted to ink. All 0.15–0.18s.
- **Anchors:** `scroll-behavior: smooth` with `scroll-margin-top: 5rem` under the sticky nav; disabled under `prefers-reduced-motion`.
- **Scroll progress** (web companion only): passive scroll + resize listeners.
- **Testimonial rail:** native scroll-snap, no JS.
- No modals, no client-side routing, no forms — booking is handed to Luma.

## State

Only the Practice Log has meaningful state (day recorded: yes/no; today's roster; notes; private thread). The other four surfaces are static.

## Assets

In `assets/`:

- `course-cover.png` — hero artwork, used by the course page and all three companion/map documents.
- `opart/` — `ground.png` (presence/body), `interdependence.png` (resonance/heart), `spacious.png` (spaciousness/mind), `stillness.png` (precision), `symmetry.png` (balance/closing).

Op-art marks are always `mix-blend-mode: multiply` on a paper background and always carry the same meaning — keep the pairings. Fonts load from Google Fonts; self-host if the target codebase prefers.

## Files

| File | Notes |
|---|---|
| `Course Page (Before payment).dc.html` | Surface 1 |
| `Practice Companion (Web).dc.html` | Surface 2 |
| `Practice Companion (Print).dc.html` | Surface 3 — paged A4 |
| `Practice Map (Standalone).dc.html` | Surface 4 — paged A4 |
| `Practice Log.dc.html` | Surface 5 |
| `Practice Log - build notes.md` | Surface 5 build spec: data, sends, states, motion, copy rules |
| `Beyond Belief - Course Spec.md` | Written spec: dates, principles, pricing, policies, open questions |
| `support.js`, `doc-page.js` | Runtime for previewing only — do not port |
| `assets/` | Imagery |

## Notes for implementation

- **Copy is exact and hard-won.** Reproduce it character for character; don't paraphrase, re-title sections, or "tighten" anything.
- The two print documents are designed for PDF export at fixed A4. If you rebuild them, keep one section per sheet and re-check that no page overflows.
- Voice: plain, unhurried, no marketing gloss, no emoji, British spelling ("practise" as verb, "practice" as noun).
- In the Practice Log the verb is **practised**, never "sat" — except in participants' own notes and questions, which are their words.
