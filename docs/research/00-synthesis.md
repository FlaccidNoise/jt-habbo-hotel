# Synthesis — What the Research Says to Build

Distilled from [habbo-hotel.md](habbo-hotel.md), [coke-music.md](coke-music.md), and
[genre-social-sims.md](genre-social-sims.md). Each claim links back to the detailed doc.

## Thesis

Build Habbo's **room-as-product architecture** around Coke Music's **create → perform → be judged →
get paid → decorate** loop, with the genre survey's strongest longevity finding at the center:
**players who create and sell content outlive players who only arrange a catalog** (IMVU and Gaia
still run; every catalog-only game died). Josh's procedural-asset idea is not a bonus feature — it
is the survival mechanism.

## Design pillars

1. **Rooms, not a world.** No overworld. Player-owned rooms plus a Navigator list. Thousands of
   parallel small-group spaces beat one crowded map, and room owners with kick/ban rights are
   moderation that scales. (habbo §2.1)
2. **The creation loop is indivisible.** Authorship + peer judgment + payout is one mechanic —
   CaveJam removed it and players grieved (coke §6.2). Ours generalizes Coke Music's songs to any
   creatable asset: songs, furni designs, outfits, patterns.
3. **Cripple the creation tool on purpose.** 114 curated samples, 5 tracks, 60 seconds — no blank
   canvas, no noise, all output comparable, which makes voting meaningful (coke §6.3.2). The
   procedural generator is the modern version: constrained parameter spaces over a curated style
   system, so every generated furni looks like it belongs and votes stay meaningful.
4. **Vote scarcity forces social breadth.** One vote per player per creation EVER + a daily earn cap
   means you cannot farm friends — every new decibel needs a new audience. This single rule created
   Coke Music's entire social meta, including the emergent "Free Greens" mutual-aid rooms
   (coke §2.1, §3.4). Copy it exactly.
5. **Two currencies, hard wall.** Habbo spent a decade learning this: earned currency must not
   manufacture tradeable assets at scale (habbo §1.3, §3.5). Josh wants all currency earnable — fine,
   but keep the wall: **votes/earnings are bound to the account, goods are tradeable.** Coke Music
   proves the earned-only version works (bound decibels + liquid furni still produced a real economy,
   coke §2.3).
6. **Status must be walkable.** Gold Records engraved with date/name/song, badge display capped at
   5+1 slots, serial-numbered LTDs — status objects live in rooms where visitors see them, and
   display scarcity is what gives them value (coke §1.5, habbo §1.8, §3.2).
7. **Programmable rooms are the retention ceiling.** Habbo's Wired is a full visual language
   (triggers, conditions, selectors with set algebra, scoped variables). It turns decorating into
   game design and gives builders an unbounded skill ceiling (habbo §1.6). Plan the architecture for
   it from day one even if v1 ships a subset — retrofitting variables/signals is very hard.
8. **Designed constraint, emergent norm.** Free Greens rooms, role-play agencies paying newcomer
   wages, furni-as-currency (club sofas, Coke Couches) — the best social institutions were invented
   by players inside deliberate constraints (coke §3.4, habbo §2.5, §3.1). Leave gaps for players to
   fill; ship arbitration for the ones that need it (stage queues died to line-cutting, coke §1.4).

## Economy blueprint

- **Faucets**: votes on performed/displayed creations (capped daily), daily rituals, minigames,
  achievements. All slow — Coke Music's ceiling was ~5.5 days of max effort for the best catalog
  item (coke §2.1).
- **Sinks**: progressive marketplace commission that taxes whales (habbo §1.5), no-refund deletion,
  consumable room decor (wallpaper), rentals for earned currency (habbo §1.3).
- **Scarcity**: withdrawn items + serial-numbered limited editions with randomized serials
  (habbo §3.2). Timed free drops boost trading activity, not just logins (habbo §2.6).
- **Trade UI is safety-critical**: preview + forced delay + confirm, from day one (habbo §1.4).
- **Decide the gambling question up front.** Gambling became the demand floor under Habbo's rares;
  banning it in 2014 crashed the economy (habbo §3.3). Either sanction a controlled version or
  design another sink for high-value goods before launch.
- **Inflation kills**: Gaia's gold generator and YoVille's counterfeit currency both hollowed out
  their economies (genre survey). Earned-only currency + caps is the defense.

## Retention (genre survey)

Daily rituals and streaks, scheduled events with limited-time items, collection completion (players
pay to finish, not to progress — Zynga FDG 2012), and a soft decaying asset. Avoid the resented
patterns: forced virality/friend-spam, energy paywalls, grind that makes socializing feel wasted
(Sims Online's core failure).

## Technical facts worth copying verbatim

- **64×32px tile diamond, 32px per height unit** — exact 2:1 dimetric on integer pixels; zoom-out
  halves everything. Verified from Nitro renderer source (habbo §4.1).
- **8 facing directions, only 5 drawn** — 4/5/6 are mirrors. ~37% art saving on every item
  (habbo §4.3).
- **Text heightmap room format** (`x` = void, `0-9a-z` = height) — human-editable, diffable,
  enabled 20 years of community tooling (habbo §4.2).
- **Figure string avatar system** (`type-set-color` triples) with first-class hidden-layer support
  (hat hides hair) — needed from the start (habbo §4.3).
- **Two authored render scales**, not runtime downscaling (habbo §4.3).
- Reference code: **nitro-renderer** (client geometry/avatars, GPL-3.0), **Arcturus Morningstar**
  (server/Wired). Read for formats; do not copy code — GPL/AGPL (habbo §4.6).

## Existential risks

1. **Moderation.** Habbo's 2012 safety scandal halved its users in months and cost it two investors
   (habbo §5.2). Coke Music treated paid 24/7 moderation, a universal filter, and a panic button as
   core features (coke §3.5). Design chat, reporting, and discovery for this from day one.
2. **Procedural content moderation is the new version of this risk** — player-generated assets need
   the same filter pipeline as chat (names, descriptions, and the assets themselves).
3. **Client feature parity.** Habbo's Unity rewrite shipped without parity and forced a second
   legacy client (habbo §4.4).

## Open questions carried forward

Per-doc lists: habbo §6 (room capacity, Wired scheduler semantics, stacking rules), coke Open
Questions (sequencer geometry 5 vs 6 rows, per-track volume). Resolve the ones that block design
during prototyping — decibel.fun runs the real Coke Music client for empirical answers, and a
nitro-docker stack does the same for Habbo.
