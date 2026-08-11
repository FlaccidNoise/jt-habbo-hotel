# Plan: 500-entry furniture blitz and Furnishings Folio

**Goal:** add 500 new player-facing furniture and wall-item definitions across every existing theme and eight original new themes, support each theme with 102 new room-surface tiles, and replace the current catalog strip with a polished, searchable, responsive pixel-hotel binder.

**Architecture:** furniture definitions remain authoritative in `packages/shared/src/furni.ts`; meshes, colorways, decor sources, frozen bundles, and published assets continue through the existing artgen/decor pipelines. The client gains a DOM-free folio view model and a panel-owned DOM renderer, while purchase messages remain `{t:"buy"}` and `{t:"buy_set"}`. Content ships in reversible theme waves only after anchor-art, generator, catalog, economy, accessibility, and visual gates pass.

**Tech stack:** TypeScript, vanilla DOM, Vitest, Zod, PixiJS, Vite, Python/Blender artgen, Sharp-based post/decor passes, SQLite server.

Grounded against `docs/design/GAME.md`, `docs/design/PIPELINES.md`, `docs/design/ART-DIRECTION.md`, `packages/shared/src/furni.ts`, `packages/shared/src/decor.ts`, `tools/artgen/{rig.py,postpass.ts}`, `tools/decor/decorpass.ts`, and the current client catalog in `packages/client/src/{main.ts,ui/catalog.ts}`.

## Pinned decisions

| Question | Decision | Reason |
|---|---|---|
| Scale | **500 new furniture/wall definitions**: Track A 180, Track B 320 | Literal catalog target; decor does not inflate the number. |
| Decor | **102 additional tiles**: 38 for existing themes, 64 for new themes | Gives every pack coordinated floors/walls without pretending room-surface commerce exists today. |
| Rewards | 13 of the 500 are earn-only collection rewards; 487 are priced | Keeps releases tied to the existing set loop. Rewards remain visible in the folio with acquisition text instead of a Buy button. |
| New themes | `bannerhold`, `nocturne`, `mochi`, `starliner`, `fablewood`, `tidal`, `verdant`, `clockwork` | Distinct silhouettes and room fantasies; no licensed characters or competitor pack names. |
| Kawaii direction | **Mochi Suite**, led by Mallow Bellhop: a cream dumpling-shaped concierge with a navy pillbox cap, no animal anatomy, bow, whiskers, or borrowed character features | Original mascot/anime warmth without a Hello Kitty or Sanrio likeness. |
| Catalog form | Full-screen **The Grand Furnishings Folio** opened by the existing Catalog HUD tab | A 600+ item shop cannot remain a `max-height:32vh` strip. The creator already establishes a full-screen overlay pattern. |
| Visual language | Navy folio, walnut spine, gold rules, dark raised pages, crisp pixel thumbnails | Nostalgic hotel-game tactility in The Grand's own palette; no Habbo logo palette, icons, layout, or trade dress. |
| Responsive scope | Designed at 1440×900; fully usable at 720 px width; readable/scrollable at 360 px but no mobile-client commitment | `GAME.md` explicitly keeps a mobile client out of v1. |
| Page size | 24 cards | Bounds mounted DOM while preserving the binder/page metaphor. |
| Buy flow | Select card, inspect detail leaf, then Buy | Prevents accidental 3,300-Star purchases and enables useful previews. No protocol change. |
| Palette | Add `rose`, `signal`, and `aether` in one `STYLE_VERSION=4` change | Kawaii, sci-fi, and fantasy each need one controlled accent ramp; one version bump limits provenance churn. |
| Starter additions | Priced, never added to `STARTER_GRANT_DEFS` | The five-item registration grant remains fixed. |
| Prestige additions | All account-bound in `PRESTIGE_DEFS`; release no more than one per content wave | Preserves scarcity despite eight planned entries. |

## Scope honesty

**In:** 500 exact catalog definitions, 102 coordinated decor tiles, 13 collection rewards, three additive ramps, the folio UI, paging/search/filtering, preview and purchase states, keyboard/focus/reduced-motion behavior, narrow-window layouts, asset provenance, pricing, deterministic publication, gated content waves, and release/rollback criteria.

**Out:** a native/mobile client; touch gestures; buying or applying room surfaces (the protocol has no such operation); new interaction verbs; player-authored furniture; 32 px assets; animation-heavy furniture; changing existing collection membership; new wager-capable furniture; AI-generated final pixels; licensed characters or competitor assets.

The decor tiles are production-ready content for seeded rooms and the future room-surface purchase flow. Do not show a non-functional Buy control for them in this folio. Plan room-surface commerce separately before selling them at the `GAME.md` 500-Star per-room price.

## Global constraints

- Floor tile lattice: 64×32 diamonds; one height unit is 32 px.
- Furniture directions: authored `[0,2,4,6]`; no mirrored shortcut.
- Wall assets: two frames; even `mount.u`; `plane.w <= span * 32`; `plane.h <= 128`.
- Artgen parts: at most 26 emitting primitives.
- Runtime pixels: fixed palette, nearest-neighbor, `image-rendering:pixelated`, deterministic frozen bundle identity.
- Decor floors: width multiple of 64 and height multiple of 32. Decor walls: even width dividing 32 and height dividing 128.
- Decor backdrop luma must remain at or above `BACKDROP_LUMA_MIN` (82). Gothic and sci-fi mood comes from pattern density and furniture, never near-black room surfaces.
- IDs are lowercase snake case. New-theme IDs start with their theme ID. Existing-theme additions use the theme prefix unless the ledger explicitly says otherwise.
- Colorways are ramp remaps of their named base. Purchasable colorways cost exactly the base price; the 13 collection-reward colorways are deliberately absent from `CATALOG_PRICES` and listed in `UNPRICED`.
- Prices use only 25/50/75/150/250/300/400/500/900 and prestige 1,800/3,300. Normal lines stay at or below 400 except a genuinely room-defining 500/900 anchor already justified by the existing lounge ladder.
- New interactions use only `toggle`, `vend`, `wash`, `read`, or `wish`; a def carries the parameters required by that rail. Every `toggle` repeats the same measured height for both states, and every `vend`/`read` has an explicit `vend` payload. No chance-resolution verb enters player inventory.
- Every def is priced, a set reward, a deliberately staged prestige item, a Lever exclusive, or a house fixture. Staged prestige is temporary and named by `RELEASED_PRESTIGE_IDS`; no item is silently unpriced.
- No free-form pattern generation. Heraldry, runes, star charts, mascots, warning graphics, and heraldic marks are curated authored motifs.
- No third-party names, logos, silhouettes, character traits, catalog names, or reference sprites. Final pixels come only from this repository's Blender/raster pipeline.
- A wave changes authoritative definitions, frozen bundles, and `packages/client/public` atomically. Never commit only one layer.

## Baseline and final counts

| Surface | Current | Track A | Track B | Final |
|---|---:|---:|---:|---:|
| Floor furniture | 105 | 114 | 240 | 459 |
| Wall furniture | 13 | 66 | 80 | 159 |
| **Furniture/wall catalog** | **118** | **180** | **320** | **618** |
| Decor tiles | 18 | 38 | 64 | 120 |

Track B is exactly 40 catalog entries per theme: 12 base floor parts, 18 colorways, and 10 wall items. Track A quotas are `starter` 12, `casino` 20, `cafe` 20, `bedroom` 26, `lodge` 18, `pool` 16, `penthouse` 16, `lounge` 16, `wall_art` 28, `prestige` 8.

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/furni.ts` | Authoritative 500 new floor/wall defs, prices, starter/prestige/unpriced routing. |
| `packages/shared/src/decor.ts` | Authoritative 102 new floor/wall surface defs. |
| `packages/shared/src/sets.ts` | Five existing-theme and eight new-theme collection sets; 13 reward routes. |
| `packages/shared/test/furni.test.ts` | Existing schema, uniqueness, price, obtainability, set, prestige, and house-fixture gates. |
| `packages/shared/test/decor.test.ts` | Decor schema/lattice/catalog gates. |
| `packages/shared/test/content-blitz.test.ts` | Exact final totals, per-theme allocations, reward count, and colorway-price parity. |
| `packages/generator/src/style.ts` | Add `rose`, `signal`, `aether`; bump style version once. |
| `tools/artgen/rig.py` | New base floor/wall meshes only. |
| `tools/artgen/postpass.ts` | Exact colorway remaps and frozen bundle publication. |
| `tools/decor/source/<id>.png` | Authored repeating floor/wall source tiles. |
| `tools/artgen/frozen/<id>.{json,png}` | Deterministic frozen furniture bundles; seating may also produce `.near.png`. |
| `tools/decor/frozen/{<id>.png,decor.json}` | Deterministic frozen decor assets and index. |
| `packages/client/public/{furni,decor}` | Byte-identical published assets plus generated `furni/catalog.json`. |
| `packages/client/src/ui/catalog.ts` | Existing theme labels, grouping, price state, and thumbnail geometry; retain public contracts. |
| `packages/client/src/ui/folio.ts` | New DOM-free folio entries, chapters, search, paging, and card/detail states. |
| `packages/client/src/ui/folioPanel.ts` | New panel-owned DOM, keyboard/focus, thumbnail rendering, and purchase state. |
| `packages/client/src/main.ts` | Open/close integration, network purchase wiring, stars/set refresh, old-strip removal. |
| `packages/client/index.html` | `#folio` shell and folio CSS in the existing inline stylesheet. |
| `packages/client/test/folio.test.ts` | Pure tests, including a synthetic 600-entry catalog. |
| `docs/decisions/INDEX.md` | Record folio replacement, narrow-window support boundary, and style-version bump. |

---

## Task 1 — Lock the ledger and regression gates

**Files:**
- Create: `packages/shared/test/content-blitz.test.ts`
- Modify: `packages/shared/test/furni.test.ts`
- Modify: `packages/shared/test/decor.test.ts`

**Interfaces:** consumes `PROTOTYPE_CATALOG`, `WALL_CATALOG`, `DECOR_CATALOG`, `CATALOG_PRICES`, `UNPRICED`, `SET_REWARD_DEFS`, and `PRESTIGE_DEFS`; produces release-blocking count and routing assertions.

- [ ] Encode the Appendix A/B ledgers as test-only typed constants with base/colorway links and theme/kind metadata. Assert the manifests contain 500 unique furniture IDs (487 priced, 13 rewards), 102 unique decor IDs, the exact theme quotas, a 51/51 decor split, and 114/66 + 240/80 furniture splits.
- [ ] Add `LANDED_BLITZ_IDS`, `LANDED_DECOR_IDS`, and `RELEASED_PRESTIGE_IDS`, initially empty, plus current baseline expectations of floor 105, wall 13, and decor 18. Every later content wave updates them in the same green commit as its definitions/assets.
- [ ] For every landed ID, require presence in the authoritative catalog. Require rewards in `SET_REWARD_DEFS` and `UNPRICED`; require non-prestige priced items in `CATALOG_PRICES`; require every prestige item in `PRESTIGE_DEFS` and exactly one of `CATALOG_PRICES` or `UNPRICED` according to `RELEASED_PRESTIGE_IDS`; require no new starter ID in `STARTER_GRANT_DEFS`.
- [ ] For every landed colorway currently in `CATALOG_PRICES`, assert base-price parity; for every landed colorway, including rewards/staged prestige, assert identical footprint, stack heights, seat height, and interaction payload.
- [ ] Keep the existing schema/obtainability tests authoritative for the whole current catalog; do not add a skipped or knowingly failing future-count test.
- [ ] Run `make test`; expect the new manifest/current-baseline tests and all pre-existing tests to pass.

## Task 2 — Build the DOM-free folio model

**Files:**
- Create: `packages/client/src/ui/folio.ts`
- Create: `packages/client/test/folio.test.ts`
- Modify: `packages/client/src/ui/catalog.ts`

**Interfaces:**

```ts
export type FolioAcquisition =
  | { kind: "buy"; price: number }
  | { kind: "set_reward"; setId: string; setName: string };
export interface FolioItem extends CatalogItem {
  w?: number; l?: number;
  span?: number; plane?: { w: number; h: number };
  interaction?: string; vend?: { item: string; price: number };
}
export interface FolioEntry { item: FolioItem; acquisition: FolioAcquisition }
export interface FolioChapter { id: string; label: string; entries: FolioEntry[] }
export function folioEntries(items: readonly FolioItem[], prices: ReadonlyMap<string, number>,
  sets: readonly CollectionSet[]): FolioEntry[];
export function folioChapters(entries: readonly FolioEntry[]): FolioChapter[];
export function folioSearch(entries: readonly FolioEntry[], query: string): FolioEntry[];
export function folioPage(entries: readonly FolioEntry[], page: number,
  pageSize?: number): { entries: FolioEntry[]; page: number; pageCount: number };
export interface FolioCardContext {
  stars: number;
  ownedWearableSets: ReadonlySet<number>;
  completedCollectionSets: ReadonlySet<string>;
}
export function folioCardState(entry: FolioEntry, context: FolioCardContext):
  "available" | "unaffordable" | "owned" | "reward_locked" | "reward_earned";
```

- [ ] Write failing tests for stable catalog-order chapters, unknown-theme auto-discovery, reward visibility, normalized case-insensitive search over name/theme, empty search, page clamping, 24-card slices, affordability, owned wearables, and reward state.
- [ ] `folioEntries()` includes only priced entries and IDs named by a collection set's `reward`; it excludes all other unpriced Lever exclusives and house fixtures.
- [ ] Add a synthetic 600-entry test proving only one 24-card page is returned and no entry is lost across all pages.
- [ ] Keep `themeLabel()` and `thumbCrop()` in `catalog.ts`; do not fork thumbnail math. Add an optional `maxIntegerScale = 1` parameter to `thumbCrop()` and test that detail previews may scale to 2× while cards preserve the current no-upscale behavior.
- [ ] Implement the interfaces with array/map operations only. No DOM, timers, browser globals, or search library.
- [ ] Run `make test`; expect all shared and folio tests to pass.

## Task 3 — Build The Grand Furnishings Folio panel

**Files:**
- Create: `packages/client/src/ui/folioPanel.ts`
- Modify: `packages/client/index.html`

**Interfaces:**

```ts
export interface FolioPanelInput {
  items: readonly FolioItem[];
  prices: ReadonlyMap<string, number>;
  collectionSets: readonly CollectionSet[];
  setProgress: readonly SetProgress[];
  prestigeDefs: ReadonlySet<string>;
  stars: number;
  ownedWearableSets: ReadonlySet<number>;
}
export interface FolioPanelDeps {
  buy(defId: string): void;
  buySet(setId: number): void;
  furniThumb(entry: FolioEntry, box: { w: number; h: number }, maxIntegerScale?: number): HTMLElement;
}
export class FolioPanel {
  constructor(root: HTMLElement, deps: FolioPanelDeps);
  open(): void;
  close(): void;
  isOpen(): boolean;
  refresh(input: FolioPanelInput): void;
  purchaseResolved(ok: boolean, message: string): void;
}
```

- [ ] Add `<div id="folio" hidden></div>` beside the creator overlay. The class owns all child markup; `index.html` owns only the shell and CSS.
- [ ] Desktop layout at 1440×900: header; 148 px walnut chapter spine; flexible 24-card page; optional 320 px detail leaf; footer page controls. Keep game canvas behind an opaque-enough dark panel, not a glass dashboard.
- [ ] Use only colors already present in `index.html`: navy `#1c1f2b`, walnut `#2b2517`, dark page `#221d12e6`, gold rules `#6a5a2e/#c9b27a`, bright gold `#ffd76a`, selection blue, confirmation green, and existing red. Add no new hex values.
- [ ] Cards show a 96×84 crisp thumbnail, full name, price or reward ribbon, selection state, and set/prestige tags. Dim unaffordable art only; keep names/prices opaque and legible.
- [ ] Detail leaf shows a 2× nearest-neighbor preview via `thumbCrop(..., maxIntegerScale: 2)`, name, theme, footprint/span, interaction label, price/acquisition route, collection progress, prestige account-binding note, and one Buy action when applicable.
- [ ] Buy enters a disabled `Ringing up…` state and disables every other Buy action until resolution. `purchaseResolved(true, message)` shows the existing green confirmation treatment; `purchaseResolved(false, message)` shows inline red text and re-arms purchasing.
- [ ] Use semantic buttons. Spine uses `role="tablist"`/`role="tab"`; page uses `role="tabpanel"`; detail uses a labelled dialog region. Add `aria-live="polite"` for purchase outcomes.
- [ ] Implement roving tabindex in card grid; arrow keys move cards; Enter selects; Escape closes detail then folio; closing restores focus to `#tab-catalog`.
- [ ] Add `:focus-visible` treatment, 44 px minimum targets, `overflow-wrap:anywhere`, and `prefers-reduced-motion` support.
- [ ] At `<1024px`, replace vertical spine with horizontally scrollable chapter tabs and make detail a full-width sheet. At `<720px`, use `minmax(96px,1fr)`, one scrolling column of regions, and no overlap. At 360 px the panel remains readable and scrollable without claiming supported mobile play.
- [ ] Mount only the active 24-card page. On balance changes, toggle mounted card state and update the header; do not recreate tabs or thumbnails.

## Task 4 — Integrate and retire the strip

**Files:**
- Modify: `packages/client/src/main.ts`
- Modify: `packages/client/index.html`
- Modify: `packages/client/test/folio.test.ts`
- Modify: `docs/decisions/INDEX.md`

**Interfaces:** creates one `FolioPanel`; passes the existing furniture, wall, wearable, price, owned-set, and collection-progress state; sends unchanged purchase protocol messages.

- [ ] Replace `renderCatalog()` and `catalogTheme` with `FolioPanel`. Keep `#tab-catalog` as opener; remove the old `#catalog` strip and its `.themes/.grid` catalog-only styles.
- [ ] Move `furniThumb()` into `folioPanel.ts`; continue using `thumbCrop()`. Reuse the creator wearable thumbnail path for `setId` entries.
- [ ] On `{t:"stars"}`, refresh balance state; resolve a pending purchase as success only when `reason` is `purchase`, `prestige`, or `wardrobe` and its `delta` matches the pending price. On purchase-related `{t:"error"}`, call `purchaseResolved(false, message)`. On `{t:"wardrobe"}` and `{t:"sets"}`, refresh ownership/progress without rebuilding chrome.
- [ ] On socket close or reconnect while a purchase is pending, resolve it as failed with a connection message; never leave the folio permanently disabled or claim an unacknowledged purchase succeeded.
- [ ] While folio is open, block room-canvas click/keyboard actions using the same overlay state discipline as creator. Closing returns to the room without reconnecting or rebuilding the Pixi scene.
- [ ] Record the full-screen folio decision, 24-card page bound, original visual direction, and 720 px supported-window boundary in `docs/decisions/INDEX.md`.
- [ ] Run `make test`; expect all shared and client tests green.
- [ ] Run `make dev` and perform the visual matrix: 1440×900, 1024×768, 720×900, and 360×800. Verify no overlap, clipping, fuzzy thumbnails, unreachable action, or horizontal page overflow.
- [ ] Keyboard-only acceptance: open; change chapter; page; search; select; inspect; buy an exact-change item; close detail; close folio. Verify focus restoration and live announcement.
- [ ] Economy acceptance: at 1 Star below price Buy is disabled and states the shortfall; exact change sends once; a server refusal appears inline; a reward card never offers Buy.

## Task 5 — Prove the art budget with anchor assets

**Files:**
- Modify: `tools/artgen/rig.py`
- Modify: `tools/artgen/postpass.ts`
- Modify: `packages/shared/src/furni.ts`
- Modify: `packages/generator/test/generator.test.ts`
- Create: pilot bundles under `tools/artgen/frozen/`

**Interfaces:** proves one base, one colorway, and one wall item through frozen and public output before bulk authoring begins.

- [ ] Pilot `bannerhold_oak_bench`, `bannerhold_oak_bench_dusk`, and `bannerhold_crest_banner`. They use existing ramps and exercise floor, colorway, and wall paths without the style-v4 dependency.
- [ ] Add the three pilot IDs to `LANDED_BLITZ_IDS` and update cumulative expectations to floor 107, wall 14, decor 18. These are the first three of Bannerhold's 40, not extra SKUs.
- [ ] Add staged-bad tests for a 27-primitive part, an off-palette output, a mismatched colorway footprint, an odd wall mount, and a near-duplicate recipe.
- [ ] Run `make art PART=bannerhold_oak_bench`, then `make art PART=bannerhold_crest_banner`, then `make gen`, then `make test`. Expect valid floor metadata with `dirs:[0,2,4,6]`, valid wall metadata with `dirs:[0,6]`, matching recipe/pixel hashes, and byte-identical public copies.
- [ ] Review all four directions at room scale and 2× folio scale. Reject if the silhouette cannot be named without reading its label.
- [ ] Measure full `make gen` wall time and record it in the plan's decision entry before scheduling bulk waves; do not weaken a gate to hit a date.

## Task 6 — Track A wave A1: starter, café, bedroom (58)

**Files:** authoritative catalogs, artgen sources/frozen output, decor sources/frozen output, published assets, sets, and tests listed in the file map.

**Interfaces:** implements exactly the Appendix A entries for `starter` (12), `cafe` (20), and `bedroom` (26), plus Appendix B decor (4/4/6) and the Suite Basics set.

- [ ] Add all 58 defs with exact IDs/routes/prices. Keep all 12 starter entries out of `STARTER_GRANT_DEFS`.
- [ ] Create **The Suite Basics Set** with members `bedroom_bed_frame`, `bedroom_dresser`, `bedroom_wardrobe`, `bedroom_vanity`; reward `bedroom_vanity_ivory` is unpriced/account-bound and remains within the 26-entry quota.
- [ ] Give `cafe_espresso_machine` the existing `vend` rail with `{item:"drink_coffee",price:1}`. No other new A1 item needs a server branch.
- [ ] Author 23 base floor meshes, 16 wall meshes, 19 exact colorway remaps, and 14 decor tiles. Keep starter silhouettes simple but distinct from the five procedural grant items.
- [ ] Add the A1 IDs to the landed sets, then run `make art`, `make decor`, `make gen`, and `make test`. Expected cumulative totals, including the Bannerhold pilot: floor 149, wall 30, furniture/wall 179, decor 32.
- [ ] Visual gate: a 24-card café/bedroom page has no blank thumbnails; starter entries clearly read as paid upgrades, not duplicate grants.

## Task 7 — Track A wave A2: casino and gallery (48)

**Interfaces:** implements `casino` 20, `wall_art` 28, and eight decor tiles.

- [ ] Add all Appendix A casino entries as decorative/social furniture only. `casino_card_table` and `casino_dice_table` have no wager interaction and must not enter `HOUSE_FIXTURE_DEFS`.
- [ ] Add 28 wall-only gallery entries; do not turn `wall_art` into a floor-furniture chapter.
- [ ] Keep the existing Café/Casino/Gallery collection definitions and rewards unchanged; do not retroactively add new required members to completed sets.
- [ ] Author/gate/publish the 48 catalog entries and eight decor tiles.
- [ ] Add the A2 IDs to the landed sets and run the full pipeline. Expected cumulative totals: floor 164, wall 63, furniture/wall 227, decor 40.
- [ ] Visual gate: card/dice motifs contain no real casino brand, copied card back, or readable wager instruction; all 28 gallery pieces remain distinct at 96×84.

## Task 8 — Track A wave A3: lodge and pool (34)

**Interfaces:** implements `lodge` 18, `pool` 16, eight decor tiles, and two sets.

- [ ] Replace duplicate-looking concepts at anchor review: `lodge_wood_stove` must not reuse the existing `fireplace` silhouette; `pool_hanging_chair` and `pool_shade_sail` must not read as `sun_lounger`/`parasol_table` recolors.
- [ ] Create **The Hearthside Set** (`lodge_log_bed`, `lodge_wood_table`, `lodge_wood_stove`, `lodge_lantern`) with reward `lodge_wood_stove_slate`.
- [ ] Create **The Poolside Set** (`pool_hanging_chair`, `pool_shade_sail`, `pool_float_rack`, `pool_towel_cart`) with reward `pool_mosaic_rug_lagoon`.
- [ ] Author/gate/publish 34 catalog entries and eight decor tiles.
- [ ] Add the A3 IDs to the landed sets and run the full pipeline. Expected cumulative totals: floor 189, wall 72, furniture/wall 261, decor 48.

## Task 9 — Track A wave A4: penthouse, lounge, prestige (40)

**Interfaces:** implements `penthouse` 16, `lounge` 16, `prestige` 8, eight decor tiles, and two sets.

- [ ] Make `penthouse_dining_chair` distinct from existing `chaise_deco`; make `lounge_vibraphone` and `lounge_record_console` distinct from existing piano/cocktail table assets.
- [ ] Create **The Deco Suite Set** (`penthouse_sofa`, `penthouse_marble_table`, `penthouse_dining_chair`, `penthouse_bar`) with reward `penthouse_telescope_copper`.
- [ ] Create **The After Hours Set** (`lounge_vibraphone`, `lounge_velvet_sofa`, `lounge_record_console`, `lounge_stage_rug`) with reward `lounge_vibraphone_ivory`.
- [ ] Add all eight prestige IDs to `PRESTIGE_DEFS` and land all eight assets/definitions. Put the seven unreleased IDs in `UNPRICED` with a staged-release comment; expose only `prestige_gold_throne@3300` in `CATALOG_PRICES` and add it to `RELEASED_PRESTIGE_IDS`.
- [ ] Author/gate/publish 40 catalog entries and eight decor tiles.
- [ ] Add the A4 IDs to the landed sets and run the full pipeline. **Track A gate:** Track A delta 180/38; cumulative totals including the Bannerhold pilot are floor 221, wall 80, furniture/wall 301, decor 56.

## Task 10 — Track B1: Bannerhold (40 + 8 decor)

- [ ] Finish the exact Bannerhold ledger: author the remaining 37 entries after the Task 5 pilot so the theme totals 40. Its direction is medieval communal dining, heraldry, armor display, brazier light, benches, racks, and wall dressings. No copied coat of arms.
- [ ] Create **The Bannerhold Set** (`bannerhold_feast_table`, `bannerhold_high_seat`, `bannerhold_armor_stand`, `bannerhold_hearth_brazier`) with reward `bannerhold_high_seat_navy`.
- [ ] Use only existing walnut/oak/sand/slate/crimson/gold ramps.
- [ ] Release `prestige_marble_fountain@3300`: remove it from `UNPRICED`, add it to `CATALOG_PRICES`, and add it to `RELEASED_PRESTIGE_IDS`.
- [ ] Add all 40 Bannerhold IDs and eight decor IDs to the landed sets, then run the full pipeline. Expected totals: floor 249, wall 89, furniture/wall 338, decor 64.

## Task 11 — Track B2: Nocturne Manor (40 + 8 decor)

- [ ] Implement the exact Nocturne ledger. Anchor silhouettes are coffin daybed, high-back throne, pipe organ, iron gate, scrying font, and candelabra; use plum/crimson/charcoal/gold/ivory without a near-black backdrop.
- [ ] `nocturne_scrying_font` uses `wish`; `nocturne_candelabra_stand` uses `toggle`. Neither predicts or resolves a wager.
- [ ] Create **The Nocturne Set** (`nocturne_coffin_daybed`, `nocturne_high_throne`, `nocturne_pipe_organ`, `nocturne_iron_gate`) with reward `nocturne_coffin_daybed_slate`.
- [ ] Release `prestige_crystal_screen@1800` through the same `UNPRICED` → `CATALOG_PRICES`/`RELEASED_PRESTIGE_IDS` transition.
- [ ] Run the full pipeline. Expected totals: furniture/wall 378, decor 72.

## Task 12 — Add style version 4 once

**Files:**
- Modify: `packages/generator/src/style.ts`
- Modify: `packages/generator/test/generator.test.ts`
- Modify: `docs/decisions/INDEX.md`

**Interfaces:** adds ramps by name for later `postpass.ts` remaps; existing frozen pixels remain valid.

- [ ] Add `rose`, `signal`, and `aether` five-shade ramps. Their brightest channel must not clamp and no shade may collide with another registered palette color.
- [ ] Bump `STYLE_VERSION` from 3 to 4 once. Do not rewrite provenance on an unchanged frozen bundle.
- [ ] Add staged-bad tests for clipping and palette collision.
- [ ] Run `make gen` and `make test`; expect all existing PNG `pixelHash` values unchanged. Review the diff and reject any repaint outside new-ramp assets.
- [ ] Record the additive bump and rollback rule: affected themes can fall back to existing ramps; earlier waves do not require regeneration.

## Tasks 13–18 — Remaining new-theme waves

Each task modifies the authoritative catalogs, artgen/decor sources and frozen artifacts, public assets, collection sets, and the same tests. Each begins with three anchors (seat/centerpiece/wall) and two decor tiles; only after visual approval does the full 40/8 batch proceed.

### Task 13: Mochi Suite

- [ ] Implement 40 catalog entries and eight decor tiles from Appendix A/B using rose/ivory/sand/teal/fern.
- [ ] Mallow Bellhop review gate: cream dumpling body, tiny navy pillbox cap, gold luggage tag; no animal ears, bow, whiskers, franchise color blocking, or copied face proportions.
- [ ] Keep `mochi_boba_cart` decorative in this scope. Do not add a hand-item enum, protocol branch, or misleading cola/coffee substitution for a new drink.
- [ ] Create **The Mochi Set** (`mochi_day_bed`, `mochi_boba_cart`, `mochi_mallow_plush`, `mochi_cloud_sofa`) with reward `mochi_mallow_plush_yuzu`.
- [ ] Release `prestige_obsidian_table@1800` through the staged prestige transition.
- [ ] Full pipeline gate. Expected totals: furniture/wall 418, decor 80.

### Task 14: Starliner

- [ ] Implement 40 catalog entries and eight decor tiles using navy/slate/charcoal/teal/signal. Keep animation to existing toggle state changes.
- [ ] `starliner_holo_projector` uses `toggle`; no weapon, branded spacecraft, or franchise control-panel motif.
- [ ] Create **The Starliner Set** (`starliner_bunk_pod`, `starliner_console`, `starliner_captain_chair`, `starliner_holo_projector`) with reward `starliner_holo_projector_astro`.
- [ ] Release `prestige_velvet_daybed@1800` through the staged prestige transition.
- [ ] Full pipeline gate. Expected totals: furniture/wall 458, decor 88.

### Task 15: Fablewood

- [ ] Implement 40 catalog entries and eight decor tiles using fern/sand/gold/ivory/walnut/aether. High-fantasy anchors are wizard desk, alchemy bench, spellbook shelf, crystal orb, runestone, and aether throne; avoid protected fantasy terminology.
- [ ] `fablewood_spellbook_shelf` uses `read` with `{item:"book",price:0}`; `fablewood_crystal_orb` uses `wish`; `fablewood_firefly_lantern` uses `toggle`.
- [ ] Create **The Fablewood Set** (`fablewood_wizard_desk`, `fablewood_alchemy_bench`, `fablewood_crystal_orb`, `fablewood_aether_throne`) with reward `fablewood_aether_throne_stone`.
- [ ] Release `prestige_gold_throne_onyx@3300` through the staged prestige transition.
- [ ] Full pipeline gate. Expected totals: furniture/wall 498, decor 96.

### Task 16: Tidal Observatory

- [ ] Implement 40 catalog entries and eight decor tiles using teal/navy/sand/ivory/fern. Make shell, porthole, reef, charting, and driftwood silhouettes distinct from the existing Pool line.
- [ ] Create **The Tidal Set** (`tidal_shell_bed`, `tidal_chart_desk`, `tidal_coral_table`, `tidal_reef_shelf`) with reward `tidal_shell_bed_dusk`.
- [ ] Release `prestige_marble_fountain_moonstone@3300` through the staged prestige transition.
- [ ] Full pipeline gate. Expected totals: furniture/wall 538, decor 104.

### Task 17: Verdant Atrium

- [ ] Implement 40 catalog entries and eight decor tiles using fern/oak/sand/teal/rose. Focus on conservatory glass, wicker, trellis, terrarium, seed storage, and grow lights rather than duplicating potted plants.
- [ ] `verdant_vine_lamp` uses `toggle`; no new gardening simulation.
- [ ] Create **The Verdant Set** (`verdant_canopy_bed`, `verdant_potting_bench`, `verdant_terrarium_case`, `verdant_trellis_screen`) with reward `verdant_canopy_bed_rain`.
- [ ] Release `prestige_crystal_screen_amber@1800`; assert all eight prestige IDs are now priced/released and none remains in staged `UNPRICED`.
- [ ] Full pipeline gate. Expected totals: furniture/wall 578, decor 112.

### Task 18: Clockwork Workshop

- [ ] Implement 40 catalog entries and eight decor tiles using walnut/gold/charcoal/crimson/slate. Gauges and valves are decorative; no unsafe machinery or new simulation.
- [ ] `clockwork_steam_lamp` uses `toggle`.
- [ ] Create **The Clockwork Set** (`clockwork_brass_bed`, `clockwork_gauge_console`, `clockwork_winding_desk`, `clockwork_escapement_cabinet`) with reward `clockwork_brass_bed_verdigris`.
- [ ] Full pipeline gate. **Final totals:** furniture/wall 618, decor 120; all Task 1 assertions pass.

## Task 19 — Final release, performance, and rollback gate

**Files:** all modified/generated files above; no new architecture.

- [ ] Run `make gen`, then `make test` from a clean checkout. Expect typecheck, all Vitest suites, publish-sync byte comparisons, and client build green.
- [ ] Verify generated `packages/client/public/furni/catalog.json` contains 618 furniture/wall defs and references every published sheet.
- [ ] Assert `LANDED_BLITZ_IDS` equals the complete 500-ID manifest, `LANDED_DECOR_IDS` equals the complete 102-ID manifest, and final authoritative totals are floor 459, wall 159, and decor 120.
- [ ] Search the folio for one base, one colorway, one wall item, one reward, one prestige item, and one wearable. Verify result labels and acquisition actions.
- [ ] Profile a synthetic 600-entry folio: opening mounts at most 24 cards; changing Stars does not replace card nodes; search/page turns never flash an empty page.
- [ ] Review every theme at 1440×900 and 720 px. Each chapter must have a coherent header, no blank thumbnails, legible prices, and a clear selected item.
- [ ] Review all 102 decor tiles in representative rooms. Reject seams, illegal luma, off-palette pixels, unreadable avatars, motif clipping, and near-duplicate patterns.
- [ ] Legal review Mallow Bellhop and every heraldry/logo-like motif. Reject external reference pixels and names before release.
- [ ] Ship one wave/commit at a time. Rollback is a revert of that wave's authoritative defs + frozen + public files. Never remove defs already owned by players; after public release, rollback hides prices/new acquisition while retaining definitions and assets for existing instances.
- [ ] Verify release history exposed no more than one new prestige entry per wave/date.

## Acceptance matrix

| Area | Required result |
|---|---|
| Count | 500 new furniture/wall defs; 102 decor tiles; final 618/120. |
| Catalog discovery | Unknown/new themes create chapters without client edits. Search finds names/themes; 24-card paging loses nothing. |
| Purchase safety | Selection is not purchase; pending prevents double-send; unaffordable/reward/owned states cannot buy. |
| Visual | Original navy/walnut/gold binder; crisp pixel art; no copied Habbo trade dress. |
| Narrow window | No overlap at 720 px; all controls reachable; 360 px remains readable/scrollable. |
| Accessibility | Keyboard-complete, focus-visible, labelled controls, Escape unwind, live purchase result, reduced motion. |
| Economy | 487 priced, 13 set rewards, starter grant fixed, prestige account-bound, purchasable colorway price parity. |
| Art | Palette/lattice/footprint/seat/wall/provenance/publish-sync gates green. |
| Safety/IP | No player-owned wager verbs, no protected character likeness, no external final pixels. |
| Rollback | Theme-wave revert before release; acquisition-only disable after ownership exists. |

---

# Appendix A — exact 500-entry SKU ledger

Prices shown on bases/walls; every listed purchasable colorway inherits its base price, while each **reward** colorway is unpriced. Every colorway inherits its base geometry/interaction fields. The 13 rewards are routed through `COLLECTION_SETS`, `SET_REWARD_DEFS`, and `UNPRICED`.

## Track A — existing themes (180)

- **starter 12:** bases `starter_armchair@50`, `starter_coffee_table@75`, `starter_entry_mat@25`, `starter_floor_lamp@50`, `starter_bookcase@75`; colorways `starter_armchair_sky`, `starter_coffee_table_walnut`, `starter_entry_mat_sunny`, `starter_floor_lamp_mint`; walls `starter_wall_clock@25`, `starter_poster_set@25`, `starter_wall_shelf@50`.
- **casino 20:** bases `casino_card_table@300`, `casino_dice_table@250`, `casino_chip_rack@75`, `casino_dealer_chair@150`, `casino_velvet_rope@75`, `casino_round_rug@150`, `casino_pendant_lamp@75`, `casino_banquette@150`; colorways `casino_card_table_emerald`, `casino_dice_table_noir`, `casino_chip_rack_gold`, `casino_dealer_chair_oxblood`, `casino_velvet_rope_crimson`, `casino_round_rug_onyx`, `casino_pendant_lamp_brass`; walls `casino_neon_dice@150`, `casino_card_mural@150`, `casino_gold_sconce@75`, `casino_velvet_drape@75`, `casino_marquee_sign@150`.
- **cafe 20:** bases `cafe_espresso_machine@400`, `cafe_bakery_island@250`, `cafe_bistro_table@75`, `cafe_bistro_chair@50`, `cafe_pastry_case@150`, `cafe_barista_stool@50`, `cafe_potted_herb@25`, `cafe_woven_rug@75`; colorways `cafe_espresso_machine_copper`, `cafe_bakery_island_sage`, `cafe_bistro_table_terracotta`, `cafe_bistro_chair_cream`, `cafe_pastry_case_walnut`, `cafe_barista_stool_honey`; walls `cafe_menu_board@75`, `cafe_chalk_art@25`, `cafe_cup_shelf@50`, `cafe_neon_cup@150`, `cafe_tile_mural@150`, `cafe_herb_pressing@25`.
- **bedroom 26:** bases `bedroom_bed_frame@300`, `bedroom_dresser@250`, `bedroom_nightstand@75`, `bedroom_wardrobe@300`, `bedroom_vanity@250`, `bedroom_rug@75`, `bedroom_table_lamp@50`, `bedroom_bench@150`, `bedroom_reading_chair@150`, `bedroom_desk@250`; colorways `bedroom_bed_frame_blush`, `bedroom_dresser_ivory`, `bedroom_nightstand_walnut`, `bedroom_wardrobe_mist`, **`bedroom_vanity_ivory` reward**, `bedroom_rug_dusk`, `bedroom_table_lamp_sage`, `bedroom_bench_linen`, `bedroom_reading_chair_plum`; walls `bedroom_mirror@75`, `bedroom_photo_wall@50`, `bedroom_wall_sconce@50`, `bedroom_tapestry@75`, `bedroom_shelf@50`, `bedroom_clock@25`, `bedroom_dream_print@25`.
- **lodge 18:** bases `lodge_wood_stove@400`, `lodge_log_bed@300`, `lodge_antler_chair@250`, `lodge_wood_table@150`, `lodge_fur_rug@150`, `lodge_lantern@75`, `lodge_bench@75`; colorways **`lodge_wood_stove_slate` reward**, `lodge_log_bed_pine`, `lodge_antler_chair_russet`, `lodge_wood_table_cedar`, `lodge_fur_rug_grey`, `lodge_lantern_copper`; walls `lodge_antler_mount@150`, `lodge_tapestry@150`, `lodge_wall_lantern@50`, `lodge_map_frame@75`, `lodge_wood_carving@75`.
- **pool 16:** bases `pool_hanging_chair@150`, `pool_shade_sail@75`, `pool_side_table@50`, `pool_float_rack@75`, `pool_towel_cart@75`, `pool_mosaic_rug@150`; colorways `pool_hanging_chair_coral`, `pool_shade_sail_aqua`, `pool_side_table_teal`, `pool_float_rack_sunny`, `pool_towel_cart_white`, **`pool_mosaic_rug_lagoon` reward**; walls `pool_tile_mural@150`, `pool_lifeguard_sign@75`, `pool_wave_art@75`, `pool_sconce@50`.
- **penthouse 16:** bases `penthouse_sofa@400`, `penthouse_marble_table@300`, `penthouse_dining_chair@250`, `penthouse_bar@400`, `penthouse_silk_rug@250`, `penthouse_telescope@300`; colorways `penthouse_sofa_ivory`, `penthouse_marble_table_noir`, `penthouse_dining_chair_champagne`, `penthouse_bar_midnight`, `penthouse_silk_rug_pearl`, **`penthouse_telescope_copper` reward**; walls `penthouse_skyline_art@150`, `penthouse_gold_mirror@150`, `penthouse_sconce@75`, `penthouse_marble_relief@150`.
- **lounge 16:** bases `lounge_vibraphone@500`, `lounge_velvet_sofa@300`, `lounge_record_console@150`, `lounge_bar_stool@75`, `lounge_floor_lamp@75`, `lounge_stage_rug@150`; colorways **`lounge_vibraphone_ivory` reward**, `lounge_velvet_sofa_berry`, `lounge_record_console_smoke`, `lounge_bar_stool_brass`, `lounge_floor_lamp_amber`, `lounge_stage_rug_noir`; walls `lounge_neon_note@150`, `lounge_stage_drape@75`, `lounge_vinyl_print@75`, `lounge_disco_ball@150`.
- **wall_art 28, all wall:** `wall_art_print_aurora@75`, `wall_art_print_bloom@50`, `wall_art_print_circuit@75`, `wall_art_print_dune@25`, `wall_art_print_ember@75`, `wall_art_print_fjord@50`, `wall_art_print_grove@50`, `wall_art_print_harbor@75`, `wall_art_print_iris@50`, `wall_art_print_juniper@25`, `wall_art_print_kelp@50`, `wall_art_print_lumen@75`, `wall_art_print_mesa@25`, `wall_art_print_north@75`, `wall_art_print_onyx@50`, `wall_art_print_prism@75`, `wall_art_print_quill@25`, `wall_art_print_ridge@50`, `wall_art_print_sol@75`, `wall_art_print_tide@50`, `wall_art_triptych_aurora_left@50`, `wall_art_triptych_aurora_center@50`, `wall_art_triptych_aurora_right@50`, `wall_art_triptych_tide_left@50`, `wall_art_triptych_tide_center@50`, `wall_art_triptych_tide_right@50`, `wall_art_gallery_clock@75`, `wall_art_sculpture_relief@150`.
- **prestige 8:** `prestige_gold_throne@3300`, `prestige_marble_fountain@3300`, `prestige_crystal_screen@1800`, `prestige_obsidian_table@1800`, `prestige_velvet_daybed@1800`, `prestige_gold_throne_onyx@3300`, `prestige_marble_fountain_moonstone@3300`, `prestige_crystal_screen_amber@1800`.

## Track B — new themes (320)

Every theme below is 12 bases + 18 colorways + 10 walls = 40. Each colorway maps to the longest complete base-ID prefix; exactly six bases per theme receive a second colorway, as listed.

### Bannerhold

- Bases: `bannerhold_feast_table@300`, `bannerhold_high_seat@250`, `bannerhold_war_table@250`, `bannerhold_armor_stand@150`, `bannerhold_hearth_brazier@150`, `bannerhold_map_table@150`, `bannerhold_banner_pole@75`, `bannerhold_shield_rack@75`, `bannerhold_candle_stand@75`, `bannerhold_rug_runner@75`, `bannerhold_oak_bench@50`, `bannerhold_spear_rack@50`.
- Colorways: `bannerhold_feast_table_crimson`, `bannerhold_high_seat_azure`, `bannerhold_war_table_sable`, `bannerhold_armor_stand_gold`, `bannerhold_hearth_brazier_forest`, `bannerhold_map_table_ivory`, `bannerhold_banner_pole_royal`, `bannerhold_shield_rack_ash`, `bannerhold_candle_stand_rust`, `bannerhold_rug_runner_sage`, `bannerhold_oak_bench_dusk`, `bannerhold_spear_rack_bone`, `bannerhold_feast_table_scarlet`, **`bannerhold_high_seat_navy` reward**, `bannerhold_war_table_bronze`, `bannerhold_armor_stand_moss`, `bannerhold_hearth_brazier_storm`, `bannerhold_map_table_wine`.
- Walls: `bannerhold_crest_banner@75`, `bannerhold_sword_display@75`, `bannerhold_shield_mount@75`, `bannerhold_heraldry_tapestry@50`, `bannerhold_torch_sconce@50`, `bannerhold_oath_scroll@50`, `bannerhold_arrow_slit_panel@50`, `bannerhold_drum_mount@25`, `bannerhold_chain_curtain@25`, `bannerhold_sigil_plate@25`.

### Nocturne Manor

- Bases: `nocturne_pipe_organ@400`, `nocturne_coffin_daybed@300`, `nocturne_high_throne@250`, `nocturne_dusk_sofa@250`, `nocturne_obsidian_table@150`, `nocturne_iron_gate@150`, `nocturne_gramophone@150`, `nocturne_candelabra_stand@75`, `nocturne_scrying_font@75`, `nocturne_midnight_rug@75`, `nocturne_nightstand@50`, `nocturne_raven_perch@50`.
- Colorways: `nocturne_pipe_organ_midnight`, `nocturne_coffin_daybed_plum`, `nocturne_high_throne_silver`, `nocturne_dusk_sofa_raven`, `nocturne_obsidian_table_dusk`, `nocturne_iron_gate_wine`, `nocturne_gramophone_fog`, `nocturne_candelabra_stand_onyx`, `nocturne_scrying_font_lilac`, `nocturne_midnight_rug_ash`, `nocturne_nightstand_indigo`, `nocturne_raven_perch_pearl`, `nocturne_pipe_organ_ember`, **`nocturne_coffin_daybed_slate` reward**, `nocturne_high_throne_moth`, `nocturne_dusk_sofa_ink`, `nocturne_obsidian_table_amethyst`, `nocturne_iron_gate_storm`.
- Walls: `nocturne_moon_phase_chart@75`, `nocturne_raven_frame@75`, `nocturne_velvet_drape@75`, `nocturne_candle_sconce@50`, `nocturne_star_chart@50`, `nocturne_moth_print@50`, `nocturne_mirror_arch@50`, `nocturne_night_sky_panel@25`, `nocturne_bat_silhouette@25`, `nocturne_lyric_plaque@25`.

### Mochi Suite

- Bases: `mochi_day_bed@250`, `mochi_boba_cart@250`, `mochi_mallow_plush@250`, `mochi_cloud_sofa@150`, `mochi_pastel_drawers@150`, `mochi_low_table@75`, `mochi_rice_lamp@75`, `mochi_cloud_rug@75`, `mochi_tea_tray_stand@50`, `mochi_bean_bag@50`, `mochi_floor_cushion@25`, `mochi_round_stool@25`.
- Colorways: `mochi_day_bed_cream`, `mochi_boba_cart_sakura`, `mochi_mallow_plush_taro`, `mochi_cloud_sofa_matcha`, `mochi_pastel_drawers_honey`, `mochi_low_table_sesame`, `mochi_rice_lamp_sky`, `mochi_cloud_rug_peach`, `mochi_tea_tray_stand_cocoa`, `mochi_bean_bag_mint`, `mochi_floor_cushion_lilac`, `mochi_round_stool_butter`, `mochi_day_bed_berry`, `mochi_boba_cart_milk`, **`mochi_mallow_plush_yuzu` reward**, `mochi_cloud_sofa_redbean`, `mochi_pastel_drawers_latte`, `mochi_low_table_plum`.
- Walls: `mochi_boba_menu@75`, `mochi_mallow_clock@75`, `mochi_cloud_shelf@75`, `mochi_pastel_bunting@50`, `mochi_cream_print@50`, `mochi_steam_decal@50`, `mochi_round_window_cling@50`, `mochi_snack_poster@25`, `mochi_soft_sconce@25`, `mochi_charm_hooks@25`.

### Starliner

- Bases: `starliner_bunk_pod@400`, `starliner_console@300`, `starliner_captain_chair@250`, `starliner_navigation_desk@250`, `starliner_galley_counter@250`, `starliner_holo_projector@150`, `starliner_viewport_seat@150`, `starliner_corridor_light@75`, `starliner_docking_bench@75`, `starliner_orbit_table@75`, `starliner_suit_rack@50`, `starliner_cargo_crate@25`.
- Colorways: `starliner_bunk_pod_chrome`, `starliner_console_nebula`, `starliner_captain_chair_solar`, `starliner_navigation_desk_nova`, `starliner_galley_counter_comet`, `starliner_holo_projector_ion`, `starliner_viewport_seat_orbit`, `starliner_corridor_light_lunar`, `starliner_docking_bench_ember`, `starliner_orbit_table_void`, `starliner_suit_rack_aurora`, `starliner_cargo_crate_pulse`, `starliner_bunk_pod_drift`, `starliner_console_flare`, `starliner_captain_chair_cosmic`, `starliner_navigation_desk_xenon`, `starliner_galley_counter_radar`, **`starliner_holo_projector_astro` reward**.
- Walls: `starliner_viewport_panel@75`, `starliner_star_chart@75`, `starliner_warning_placard@75`, `starliner_conduit_strip@50`, `starliner_mission_patch_board@50`, `starliner_neon_orbit_sign@50`, `starliner_planet_poster@50`, `starliner_airvent_grille@25`, `starliner_docking_schedule@25`, `starliner_comet_print@25`.

### Fablewood

- Bases: `fablewood_moss_bed@300`, `fablewood_wizard_desk@250`, `fablewood_alchemy_bench@250`, `fablewood_root_chair@150`, `fablewood_spellbook_shelf@150`, `fablewood_crystal_orb@150`, `fablewood_runestone@75`, `fablewood_firefly_lantern@75`, `fablewood_stump_table@75`, `fablewood_leaf_rug@75`, `fablewood_mushroom_stool@50`, `fablewood_aether_throne@250`.
- Colorways: `fablewood_moss_bed_moss`, `fablewood_wizard_desk_acorn`, `fablewood_alchemy_bench_fern`, `fablewood_root_chair_bark`, `fablewood_spellbook_shelf_dawn`, `fablewood_crystal_orb_berry`, `fablewood_runestone_mist`, `fablewood_firefly_lantern_clover`, `fablewood_stump_table_amber`, `fablewood_leaf_rug_thorn`, `fablewood_mushroom_stool_willow`, `fablewood_aether_throne_brook`, `fablewood_moss_bed_dusk`, `fablewood_wizard_desk_honey`, `fablewood_alchemy_bench_sage`, `fablewood_root_chair_rust`, `fablewood_spellbook_shelf_petal`, **`fablewood_aether_throne_stone` reward**.
- Walls: `fablewood_vine_garland@75`, `fablewood_mushroom_shelf@75`, `fablewood_owl_print@75`, `fablewood_story_page_frame@50`, `fablewood_moss_panel@50`, `fablewood_firefly_sconce@50`, `fablewood_acorn_hooks@50`, `fablewood_leaf_mobile@25`, `fablewood_bark_relief@25`, `fablewood_fern_pressing@25`.

### Tidal Observatory

- Bases: `tidal_shell_bed@300`, `tidal_net_hammock@250`, `tidal_tide_pool_bar@250`, `tidal_chart_desk@250`, `tidal_coral_table@150`, `tidal_reef_shelf@150`, `tidal_shell_vanity@150`, `tidal_driftwood_bench@75`, `tidal_pearl_lamp@75`, `tidal_kelp_planter@75`, `tidal_wave_rug@75`, `tidal_buoy_stool@50`.
- Colorways: `tidal_shell_bed_aqua`, `tidal_net_hammock_coral`, `tidal_tide_pool_bar_pearl`, `tidal_chart_desk_kelp`, `tidal_coral_table_sand`, `tidal_reef_shelf_foam`, `tidal_shell_vanity_lagoon`, `tidal_driftwood_bench_drift`, `tidal_pearl_lamp_storm`, `tidal_kelp_planter_shell`, `tidal_wave_rug_deep`, `tidal_buoy_stool_spray`, **`tidal_shell_bed_dusk` reward**, `tidal_net_hammock_reef`, `tidal_tide_pool_bar_brine`, `tidal_chart_desk_sun`, `tidal_coral_table_mist`, `tidal_reef_shelf_wave`.
- Walls: `tidal_porthole_frame@75`, `tidal_net_drape@75`, `tidal_shell_garland@75`, `tidal_tide_clock@50`, `tidal_coral_relief@50`, `tidal_wave_print@50`, `tidal_buoy_hooks@50`, `tidal_kelp_curtain@25`, `tidal_lighthouse_print@25`, `tidal_foam_sconce@25`.

### Verdant Atrium

- Bases: `verdant_canopy_bed@300`, `verdant_potting_bench@250`, `verdant_terrarium_case@250`, `verdant_watering_cart@150`, `verdant_trellis_screen@150`, `verdant_herb_table@150`, `verdant_wicker_chair@75`, `verdant_plant_stand@75`, `verdant_vine_lamp@75`, `verdant_moss_rug@75`, `verdant_garden_stool@50`, `verdant_seed_drawers@75`.
- Colorways: `verdant_canopy_bed_fern`, `verdant_potting_bench_moss`, `verdant_terrarium_case_sage`, `verdant_watering_cart_bloom`, `verdant_trellis_screen_clay`, `verdant_herb_table_dew`, `verdant_wicker_chair_cedar`, `verdant_plant_stand_sprout`, `verdant_vine_lamp_amber`, `verdant_moss_rug_ivy`, `verdant_garden_stool_petal`, `verdant_seed_drawers_stone`, **`verdant_canopy_bed_rain` reward**, `verdant_potting_bench_honey`, `verdant_terrarium_case_olive`, `verdant_watering_cart_rose`, `verdant_trellis_screen_mint`, `verdant_herb_table_bark`.
- Walls: `verdant_trellis_panel@75`, `verdant_herb_pressing_frame@75`, `verdant_seed_chart@75`, `verdant_vine_mirror@50`, `verdant_glass_shelf@50`, `verdant_botanical_print@50`, `verdant_mist_rail@50`, `verdant_leaf_decal@25`, `verdant_grow_light_bar@25`, `verdant_bee_hotel@25`.

### Clockwork Workshop

- Bases: `clockwork_brass_bed@300`, `clockwork_gauge_console@250`, `clockwork_winding_desk@250`, `clockwork_boiler_cart@250`, `clockwork_piston_chair@150`, `clockwork_escapement_cabinet@150`, `clockwork_mainspring_bench@150`, `clockwork_pipe_shelf@75`, `clockwork_gear_table@150`, `clockwork_steam_lamp@75`, `clockwork_copper_rug@75`, `clockwork_cog_stool@50`.
- Colorways: `clockwork_brass_bed_brass`, `clockwork_gauge_console_copper`, `clockwork_winding_desk_iron`, `clockwork_boiler_cart_steam`, `clockwork_piston_chair_oil`, `clockwork_escapement_cabinet_rust`, `clockwork_mainspring_bench_ivory`, `clockwork_pipe_shelf_cobalt`, `clockwork_gear_table_ember`, `clockwork_steam_lamp_ash`, `clockwork_copper_rug_gold`, `clockwork_cog_stool_slate`, **`clockwork_brass_bed_verdigris` reward**, `clockwork_gauge_console_coal`, `clockwork_winding_desk_amber`, `clockwork_boiler_cart_tin`, `clockwork_piston_chair_mahogany`, `clockwork_escapement_cabinet_pearl`.
- Walls: `clockwork_gear_clock@75`, `clockwork_gauge_panel@75`, `clockwork_blueprint_frame@75`, `clockwork_pipe_rail@50`, `clockwork_valve_hooks@50`, `clockwork_piston_relief@50`, `clockwork_brass_sconce@50`, `clockwork_rivet_panel@25`, `clockwork_escapement_diagram@25`, `clockwork_oil_lantern_hook@25`.

---

# Appendix B — exact 102-entry decor ledger

Each existing theme gets two floor/two wall tiles except Bedroom (three/three); Wall Art gets two/two. Each new theme gets four floor/four wall. IDs encode kind and theme.

- **starter:** floors `floor_starter_oak`, `floor_starter_sand_check`; walls `wall_starter_plaster_blue`, `wall_starter_pinstripe`.
- **casino:** floors `floor_casino_felt_diamond`, `floor_casino_card_suit`; walls `wall_casino_deco_fan`, `wall_casino_crimson_panel`.
- **cafe:** floors `floor_cafe_checker_cream`, `floor_cafe_terracotta`; walls `wall_cafe_subway_tile`, `wall_cafe_awning_stripe`.
- **bedroom:** floors `floor_bedroom_oak_herringbone`, `floor_bedroom_soft_check`, `floor_bedroom_moon_inlay`; walls `wall_bedroom_linen`, `wall_bedroom_cloud`, `wall_bedroom_pinstripe`.
- **lodge:** floors `floor_lodge_flagstone`, `floor_lodge_pine`; walls `wall_lodge_plank`, `wall_lodge_compass`.
- **pool:** floors `floor_pool_shell_tile`, `floor_pool_wave_mosaic`; walls `wall_pool_cabana_stripe`, `wall_pool_sun_tile`.
- **penthouse:** floors `floor_penthouse_marble_fan`, `floor_penthouse_parquet`; walls `wall_penthouse_deco_fan`, `wall_penthouse_silk_panel`.
- **lounge:** floors `floor_lounge_parquet_dark`, `floor_lounge_stage_star`; walls `wall_lounge_velvet_panel`, `wall_lounge_music_note`.
- **wall_art:** floors `floor_gallery_terrazzo`, `floor_gallery_oak`; walls `wall_gallery_canvas`, `wall_gallery_picture_rail`.
- **bannerhold:** floors `floor_bannerhold_flagstone`, `floor_bannerhold_oak`, `floor_bannerhold_rush`, `floor_bannerhold_sigil`; walls `wall_bannerhold_castle_block`, `wall_bannerhold_plaster`, `wall_bannerhold_tapestry`, `wall_bannerhold_oak_panel`.
- **nocturne:** floors `floor_nocturne_parquet`, `floor_nocturne_moon_tile`, `floor_nocturne_rose_inlay`, `floor_nocturne_ash_stone`; walls `wall_nocturne_damask`, `wall_nocturne_arch_panel`, `wall_nocturne_candle_stripe`, `wall_nocturne_moth_frieze`.
- **mochi:** floors `floor_mochi_cream_check`, `floor_mochi_sprinkle`, `floor_mochi_cloud`, `floor_mochi_pastel_tile`; walls `wall_mochi_cream_soda`, `wall_mochi_cloud`, `wall_mochi_charm`, `wall_mochi_soft_stripe`.
- **starliner:** floors `floor_starliner_deck_plate`, `floor_starliner_orbit_grid`, `floor_starliner_docking_marks`, `floor_starliner_comet`; walls `wall_starliner_panel_grid`, `wall_starliner_conduit`, `wall_starliner_starfield`, `wall_starliner_signal_stripe`.
- **fablewood:** floors `floor_fablewood_moss_stone`, `floor_fablewood_rune`, `floor_fablewood_root`, `floor_fablewood_aether`; walls `wall_fablewood_runic_frieze`, `wall_fablewood_vine`, `wall_fablewood_storybook`, `wall_fablewood_crystal`.
- **tidal:** floors `floor_tidal_reef_tile`, `floor_tidal_wave`, `floor_tidal_driftwood`, `floor_tidal_shell_inlay`; walls `wall_tidal_observatory_panel`, `wall_tidal_bubble`, `wall_tidal_kelp`, `wall_tidal_porthole`.
- **verdant:** floors `floor_verdant_greenhouse_tile`, `floor_verdant_moss`, `floor_verdant_seed`, `floor_verdant_terracotta`; walls `wall_verdant_glass_grid`, `wall_verdant_trellis`, `wall_verdant_botanical`, `wall_verdant_dew`.
- **clockwork:** floors `floor_clockwork_brass_plate`, `floor_clockwork_gear`, `floor_clockwork_rivet`, `floor_clockwork_blueprint`; walls `wall_clockwork_pipe_grid`, `wall_clockwork_gauge`, `wall_clockwork_gear`, `wall_clockwork_verdigris_panel`.

## Self-review

- Every requested existing theme has a non-zero addition; Track A sums to 180.
- Eight original new themes each contain exactly 40 entries; Track B sums to 320.
- The catalog target is exactly 500; decor is explicitly separate at 102.
- Thirteen reward IDs are inside, not in addition to, the 500.
- The folio handles furniture, wall items, wearables, set rewards, 600-entry scale, responsive/narrow layouts, accessibility, and unchanged purchase protocol.
- Asset paths, commands, counts, price rules, generation order, visual gates, and rollback behavior are explicit.
- Room-surface purchase/application is not falsely claimed; decor commerce is named as separate work.
- No licensed character or direct competitor trade dress is requested.
