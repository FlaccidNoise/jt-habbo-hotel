# Decision Log

- 2026-08-12 — **Wearable themes are furniture themes; a chapter sells the room and the outfit
  (#447, packs #449-#460).** WEARABLE_SHELF rows carry the same theme strings as furni defs
  (bannerhold, nocturne, …, penthouse, pool), so folio chapters mix kinds by design — the
  catalog.test assertion that a theme hosts one kind was rewritten for this. Sets 64-127 shipped
  through docs/plans/2026-08-11-costume-blitz-ledger.md: an authored SKU ledger over measured
  body/gate constants, one pack per batch agent, one commit per part, IoU ≤ 0.854 vs every
  same-type sibling hand-measured (no gate exists — #442). Colorways stay wear-time ramp picks,
  so style-v4's rose/signal/aether reach all 127 sets with zero work when it lands.
- 2026-08-11 — **Bannerhold pilots prove the art budget before bulk authoring (furniture blitz,
  task 5).** `bannerhold_oak_bench` (base, seat), `bannerhold_oak_bench_dusk` (colorway, oak→slate,
  no extra render), and `bannerhold_crest_banner` (wall) all render through the 3D-assisted path,
  pass every gate, freeze, and publish byte-identical; the bench's seat ships a `.near.png` and the
  banner's mount.u is even. Full `make gen` (re-gate + publish, no Blender) walls at **~3.5 s**, so
  the per-item cost of the remaining waves is the Blender render, which colorways and walls do not
  add — bulk authoring is scheduled on that basis. The 26-prim cap and even wall-mount are now
  exported gates (`gatePrimCount`, `gateWallMountEven`) with staged known-bad tests, so the budget
  is enforced outside Blender too. Silhouettes reviewed at room and 2× scale: the bench reads as a
  backless trestle bench and the banner as a hanging heraldic banner without their labels.
- 2026-08-11 — **The catalog strip is replaced by The Grand Furnishings Folio, a full-screen
  binder (furniture blitz, task 4; supersedes #364).** A 600+ item shop cannot live in a
  `max-height:32vh` HUD strip: the folio is opened by the existing Catalog tab, mounts at most
  **24 cards per page** (the bound that keeps the DOM finite under a 618-entry catalog), and
  buys through a detail leaf — selection is never purchase. The visual direction is original to
  The Grand: navy boards, a walnut spine, gold rules, dark raised pages, using only hex values
  already in `index.html` — no Habbo palette, icons, layout, or trade dress. Purchase protocol
  is unchanged (`buy` / `buy_set`); a purchase counts only against its own `{t:"stars"}` line
  with a matching reason and debit, and errors or disconnects re-arm the Buy controls.
  Responsive scope: designed at 1440×900, fully usable at **720 px width (the supported-window
  boundary)**, readable and scrollable at 360 px — but no mobile-client commitment, per
  GAME.md's v1 non-goals. Keyboard-complete with focus restoration to the Catalog tab.
- 2026-08-11 — **The design studio composes artgen meshes; the box path is retired from the
  minting plan (#334, Josh).** Every fidelity gain since #311 — dither/crease v2, trim-by-prim,
  48 catalog items — lives in the artgen/Blender path, and a minted item that reads a generation
  older than the house catalog defeats the point of minting. Box-path v2 was rejected as
  duplicated effort under a permanent 7-prim ceiling. The rig renders each player recipe
  server-side at mint time and the full gates run before publish; PIPELINES §2's frozen-bundle
  identity is unchanged — the mint-time render IS the item, and a disagreeing re-render was
  already a detected error. The seeded-PRNG integer-arithmetic determinism guarantee was the box
  path's and retires with it (#335 re-meshes or retires the five box-path catalog items). Render
  cost per mint is bounded by the existing 5/day mint cap; preview strategy (approximate client
  composite vs reduced-scope render) is #121 implementation detail. Near-duplicate gating moves
  to recipe space over mesh selections + parameters.
- 2026-08-11 — **Ramp-index textures are the surface-detail architecture, sequenced decor-first
  (#270 accepted, #266 superseded, Josh).** Ramp choice becomes per-texel via a UV-mapped
  ramp-index render while the lit pass stays white, so the luma quantizer, the silhouette, and
  every gate survive by construction — gatePalette passes because the texture stores ramp
  indices. The furni third Blender pass is deferred: at ~28×14 texels a furni face holds one
  motif, not a pattern — the measured payoff tiles, so AI motifs flow through the shipped
  flat-decor pipeline (#260) first. Motifs come from Gemini plus our own committed reducer,
  constrained to a chosen ramp set (keeps VARIANTS colorways free); Retro Diffusion was rejected
  because input_palette puts quantization inside a vendor API we cannot reproduce — owning the
  reducer keeps provenance ours. Wallpaper faces self-shade at the measured 0.71 left/right luma
  ratio — deliberately more contrasty than today's 0.87 flat walls, self-limiting, and walls come
  onto the 91-colour palette for the first time. When the furni pass lands it must ship with a
  gate for the load-bearing invariant: never texture the lit pass.
- 2026-08-10 — **Blackjack joins the stake cap by naming its op, and `settleWin` now refuses an
  op that is not house-banked (#428).** The table's entire ledger layer is one string: "blackjack"
  in `GAMBLE_OPS` buys the 500/day cap, the whole-bet refusal, and the exclusion from the faucet
  sum, which is what "a new table inherits it by naming its op here" was built to mean. Three
  tables share one 500 — not 500 each — because the cap is on the player, not the table. The guard
  is the other half of that bargain: `settleWin` bypasses GLOBAL_EARN_CEILING by design, so handed
  a faucet op it is an uncapped faucet wearing a payout's name, and the mistake is one typo deep.
  It now throws. No `settleStake`/`settleWinnings` pair was added: that is `settleSpend` and
  `settleWin` under another name, and a second path to the same cap is a second path to forget to
  check. #428 was filed believing neither the cap nor the winnings path existed — #429 landed both
  six minutes later. server/ledger.ts.
- 2026-08-10 — **The daily stake cap is 500 a rolling 24h, refused whole, and it lives in the
  ledger (#429).** GAME.md's "daily stake caps bound dependence" and ROADMAP step 9's acceptance
  test — "stake 501 of the day is refused" — are one line of code: `settleSpend` checks
  `GAMBLE_OPS` membership of the op it was handed, so the cap is inherited by naming an op and no
  table can forget to ask. It refuses rather than clamps: a 20-Star bet quietly settled as 10 is
  not the bet the player made, and being told no is the mechanism. `GAMBLE_OPS` is {lever, wheel},
  which newly bounds the Luck Lever to five pulls a day — it was uncapped, and an uncapped
  repeatable sink is the dependence the cap exists to stop. `stakedSince` counts debits only, so
  winning something back never buys headroom to stake it again. server/ledger.ts.
- 2026-08-10 — **Winnings are the house returning a stake, not income, so settleWin bypasses the
  faucet ceilings (#429).** Two ways the obvious implementation would have taken the player's own
  luck out of their day's earnings: routing a payout through `settleEarn` clamps it to what is
  left of GLOBAL_EARN_CEILING (a 2,000 win pays 600), and even a separate credit would be summed
  by `earnedSince`'s global branch and starve every faucet after it. `settleWin` clamps against
  nothing and the gamble ops are excluded from that sum. Nothing is unbounded by it: the payout is
  stake × `WHEEL_MAX_MULTIPLIER` (100 × 20 = 2,000), the stake is capped per bet and per day, and
  the spin is idempotent per op_key. The wheel's own edge is pinned by an EV-band test — every
  segment returns 75–90% of the stake, never a fair one — because a house-banked table that pays
  fair is a faucet nobody budgeted. 12.5–16.7% is wider than a real casino's ~5% and gentler than
  the lever's gacha drain, which is what GAME.md's "anchor venue, never the economy's centre" asks
  for: Crimson lands on 10 of 24 slots, so hits stay frequent enough to be spectacle while the
  wheel is arithmetically certain to absorb. shared/wheel.ts, server/ledger.ts.
- 2026-08-10 — **GLOBAL_LLM_CAP 600/day fleet-wide joins the per-NPC 200 cap.** The roster
  scaling to 11 NPCs (WP8) must not scale the committed LLM spend — 3 NPCs × 200 was what the
  $2/month cloud-fallback figure (decision log 2026-08-04) was sized against, and the per-NPC cap
  alone would let 11 NPCs authorise ~3.7× that. The per-NPC cap stays: it stops one popular NPC
  eating the whole budget. Canned lines remain the floor either cap trips. `npc.ts` `reply()`.
- 2026-08-10 — **Flagship room is 200², not the asked-for 300–400² (#406/#409).** Josh resized on
  measured evidence: at 500 ms/tile a 300² diagonal walks 2.5 minutes, and 25 occupants over
  90,000 tiles is 3,600 tiles/player. Render cost stopped mattering — culling + the near-linear
  painter sort (#359/#360) make scene cost follow the viewport, not the room. The side is W/H in
  server/grounds.ts; the resize dropped only lawn, the content band moved intact. Public rooms own
  ids 1–100 (RESERVED_ROOM_IDS); suites allocate above, fixing a real id-4 collision. House
  layouts get HOUSE_FURNI_CAP (300) separate from the player ROOM_FURNI_CAP (100) — players
  cannot place furni in a room already over the player cap. Furni culling (#404) gates any density
  increase.
- 2026-08-10 — **Zoom belongs to the player (#406).** ZOOM is a live 1×/2× binding (Z key + HUD),
  persisted, defaulting 1× — Josh prefers the zoomed-out read. It is also a perf lever: 1× covers
  4× the floor and roughly triples scene cost, which the per-zoom big-room budgets pin.
- 2026-08-10 — **Faces are identity, not cosmetics (#346/#352/#410).** hd17–24 + fa25–27 joined
  STARTER_GRANT_SETS (with the dress() slotFamilies fix, atomically — either alone breaks
  registration), new accounts default to an eyed head, boot backfills older accounts, and the
  staff grant carries the faces so NPCs derive eyed figures. Hair 28–37 stays earned — it is the
  cosmetics economy's stock.
- 2026-08-10 — **theme on every FurniDef/WallDef is the catalog's organizing unit (#355/#364).**
  Shelves derive from data, so a content pack ships with zero catalog-UI edits. Enforced by the
  price test (explicit UNPRICED set) and the LAYOUT_VERSION drift test.
- 2026-08-10 — **Face art mechanism (#339/#342).** Faces are hd sets sharing hd2's skull; fixed
  ramps (paper eye white, crimson blush) ship as `fixedColors` past the set's declared slot count,
  resolved by the client after the worn colours — no bake-cache key change, because fixedColors is
  a pure function of the set id. The `paper` ramp's shades come from the shade() formula, not the
  design swatch (outline b differs by 7): one base × fixed factors is the bible invariant, so if
  the eye white ever reads wrong the fix is a new base colour, never a hand-carved shade. New
  wearables (faces 17-27, hair 28-37) are in no grant and have no purchase path — preview-only
  until dress() is slotFamilies-aware (#346, server-frozen) and a grant/economy decision is made.
- 2026-08-05 — **Avatar figure system (#127).** Built, with five decisions that overrule earlier
  spec on measured evidence.
  - **8 directions, all rendered natively; mirroring deleted for avatars.** Mirroring exists to
    halve hand-drawing and the 3D-assisted path does not hand-draw. It costs render minutes and
    buys every asymmetric garment. The old mirror table was also wrong for this rig:
    it assumed dir 0/4 face the camera, but the camera is in the +X+Y octant, so dirs 3 and 7 are
    self-symmetric and the pairs are 0↔6, 1↔5, 2↔4. Even the correct pairs differ by ~25 % of lit
    pixels, so mirroring was never free here.
  - **Audit B4 is false for the shipped rig.** "Above-front light gives symmetric shading, so
    mirroring is shading-safe" — the sun is `(-0.22, -0.80, -1.05)` and its lateral component
    breaks left-right symmetry by construction. Nothing depends on it today; the sun cannot move
    because 22 frozen bundles are lit by it.
  - **Figure is 80 px / 2.5 height units, not the spec's ~100 px / 3.** The shipped seat heights
    pinned it — see ART-DIRECTION for the derivation.
  - **Compositing is body-only holdout + alpha-over**, and per-set hidden-layer rules are what
    keep the holdout set at size one. That is the difference between `layers × dirs × frames` and
    combinatorial.
  - **Seating occlusion (#227) is derived from geometry, not declared per slot**, and ships as an
    additive companion sheet so no frozen bundle's pixels move.
- 2026-08-05 — **Skin is its own ramp family.** `style.ts` had 12 material ramps and no skin tone;
  `sand`-or-`ivory` is not a palette a hotel can ship. Six skin ramps, gated against channel
  clamping (four material ramps do clamp, and their pixels are frozen, so the rule is scoped).
  `style_version` → 2: additive, 0 pixel hashes moved, 5 recipe hashes moved.

- 2026-08-03 — **Audience: adults-first, 18+.** Nostalgia demographic, co-working coherent,
  lightest legal burden. Revisit all safety design if this widens.
- 2026-08-03 — **V1 focus: hangout core.** Rooms, chat, café, co-presence before creation loops
  and minigames. Social density is the product.
- 2026-08-03 — **Co-working: ambient co-presence in v1.** Focus states, focus rooms, lurk-friendly
  presence. Shared tools (pomodoro furni) deferred.
- 2026-08-03 — **Liveness: density funnel + LLM NPC staff.** Few spaces open at low concurrency.
  NPCs on small local/cheap cloud models. Scheduled-heartbeat events not committed for v1.
- 2026-08-03 — **NPC payouts: deterministic only.** LLM flavors, server pays. Flat amounts, hard
  daily caps, zero chart credit, staff-labeled, output filtered.
- 2026-08-03 — **Pets: companions + light care.** Happiness with no decay punishment. Pets
  account-bound, pet cosmetics tradeable.
- 2026-08-03 — **Cosmetics: tradeable economy goods with rare tiers.** Avatar and pet fashion is
  a real economy (withdrawn lines, serial LEs).
- 2026-08-03 — **Wealth sinks: Museum wing + prestige untradables + Luck Lever.**
- 2026-08-03 — **Gambling: official house-banked Casino from day one.** Player vs house only —
  Stars never move player-to-player, preserving the bound-currency wall. Daily stake caps.
  Player-run banking stays banned. Legal re-review required before any real-money monetization.
- 2026-08-03 — **Theme: casino resort, resort-first.** The casino floor is the anchor venue,
  never the economy's center (stake caps bound dependence). Music loop reframed as lounge
  residencies. Rooms are suites.
- 2026-08-03 — **All fake money, effectively permanent.** Josh confirmed earned-only currency.
  Under a casino theme, selling currency implicates social-casino law (Big Fish precedent —
  verify with counsel) — real-money sales are structurally locked out, not just deferred.
- 2026-08-03 — **Age assurance: 18+ enforced by vendor age estimation at registration** (band
  label + timestamp stored, never the artifact). Audit S1 showed self-declared 18+ carries the
  child-safety duties anyway (OSA, ICO code, DSA Art. 28, COPPA mixed-audience) while building
  none of the infrastructure. If audience ever widens to 13+: age-banded chat/DM/trade is the
  largest retrofit in the project, plus trade age-banding (audit S28).
- 2026-08-03 — **Post-audit economy structure:** global daily earn ceiling (600 tune) over all
  faucets, per-relationship vote decay, transfer-value budgets + 72h bind-on-purchase, unified
  Star+item ledger in one database, registration grant as starter furni + 7-day Star trickle,
  creator cut 30%, minted-design supply windows, trophies account-bound, first-mint-owns-recipe.
- 2026-08-03 — **Prototype posture: safety and legal PARKED.** Hobby project, no planned public
  deployment. All moderation/legal machinery moved to docs/design/SAFETY-LEGAL-PARKED.md with
  reopen triggers (public deployment / strangers / catching on). Fun and game-integrity mechanics
  (anti-cheat, anti-dupe, vote decay, economy caps) stay active — they are fairness features. The
  fake-money social-casino lock also stays active. Supersedes the enforced-age-assurance and
  staffed-hours decisions below for as long as the posture holds.
- 2026-08-04 — **Room capacity: 25 occupants per room (tune), one live instance per room — never
  mirrored.** Coke Music's public cap, readable at speak radius 5. Full rooms redirect in the
  Navigator: the density funnel concentrates by design, and mirrored instances would fight it.
  Per-process room count is a measurement, not a design number — bot-harness target: 5 rooms ×
  25 bots, tick p95 under 50 ms on the dev box. Resolves GAME.md open question 1 (#128).
- 2026-08-04 — **Naming decided for the prototype: "The Grand", currency "Stars".** Both are
  already load-bearing in code, NPC personas, and docs, and a rename grows costlier with every
  shipped system. No trademark exposure while private. Trademark clearance added to the parked
  launch gates — it must pass before any public deployment. Resolves open question 3 (#128).
- 2026-08-04 — **Moderation staffing quote re-homed to the parked register.** Its only consumer
  (staffed opening hours) is parked, and no vendor quotes a private hobby build meaningfully.
  First action on the reopen trigger in SAFETY-LEGAL-PARKED.md. Resolves open question 4 (#128).
- 2026-08-04 — **Programmable rooms: phased and demand-gated.** Phase A (in v1 scope): the three
  hand-built room game sets (#205). Phase B "Wired Lite" no earlier than build step 9 complete:
  trigger→effect pairs on furni (walk-on, say-keyword, timer, state-change → move, toggle,
  in-room teleport, message), on the reserved event-bus substrate, no variables. Phase C (full:
  conditions, selectors, scoped variables) only if Phase B shows sustained use. **Permanent
  exclusions at every phase: wired never mutates Stars, items, or inventories, never acts across
  rooms, never speaks as a player, never grants room rights.** A programmable room that can move
  items is a player-run wagering machine — this extends the inert-chance-furni rule (R-26).
  Resolves #124, open question 2.
- 2026-08-04 — **Art path: 3D-assisted part authoring, 64 scale only in v1.** Parts modeled once
  as low-poly meshes, a fixed dimetric rig renders the directions, a post-pass quantizes to the
  palette and draws outlines, hand polish where gates or the eye fail it. Deferring the 32 scale
  resolves audit C-45. The ~2,300-sprite line item becomes ~130 meshes plus polish. Style bible
  v1 pinned (palette 12 ramps × 5 shades, outline, dither, proportion parameters). Proof gate
  before build-out: chair, sofa, plant re-rendered at target quality through the new path.
  Detail: docs/design/ART-DIRECTION.md. Tracked: #202.
- 2026-08-04 — **NPC model: gemma3:4b on local Ollama. Budget $0 local, cloud fallback capped
  $2/month.** Config: NPC_LLM_URL=http://localhost:11434/v1, NPC_LLM_MODEL=gemma3:4b, no key.
  Verified against the real prompt shape: 0.65 s warm, one in-character line, staged injection
  ignored, no reasoning leakage. The pre-installed qwen-pi:9b was rejected on evidence — a
  thinking model, it spent the whole 60-token budget on reasoning and returned empty content at
  6.3 s. Fallback if quality disappoints: OpenRouter at ≤ $0.20/MTok, which keeps full
  DAILY_LLM_CAP usage (≈9 MTok/month) under $2. Canned lines stay the floor. Wiring: #204.
- 2026-08-04 — **Tunables pinned v1.** Every (tune) value in GAME.md is now the v1 constant,
  movable only on the monthly rebalance date once ledger data exists — first rebalance 30 days
  after the first arcade ships, reading the #209 graphs. New pins: low-population threshold 5
  concurrent, room capacity 25, palette 12 × 5, streak bonus +2/day capped +20, prototype RPO
  24 h / RTO 4 h. Full table with change mechanisms: docs/design/ROADMAP.md.
- 2026-08-03 — **(Parked by the prototype posture) Post-audit safety structure:** staffed opening hours at launch, registration
  caps tied to moderation capacity, new-account surface restrictions (no whisper/DM/trade/
  invite-only until tenure), moderation tooling in build step 1, graduated incident-response
  flags, monthly red-team as a release gate, deduction lobbies sealed (no trade/gifts/friend
  requests/whisper in-match, per-match names).
- 2026-08-05 — **Depth is a topological sort over boxes, not a scalar key.** Every sprite carries
  its footprint and height; `painterOrder` (packages/shared/src/depth.ts) orders them by "west,
  north, or underneath, given axis overlap", falling back to a depth key for incomparable pairs.
  Supersedes the origin-tile depth key, which is provably unfixable: a 4×1 table needs a chair
  behind it at one end and in front at the other, and no single number can do both. The same
  routine sorts the part boxes inside one generated sprite. Tiles stay in a flat band below every
  sprite, so raised tiles do not occlude — #230. Detail: docs/design/PIPELINES.md §Draw order.

- STYLE_VERSION 3→4 is additive-only (furniture content blitz, task 12). `rose`, `signal`, and
  `aether` join the material ramps so new-theme postpass remaps can name them; every v1 frozen
  bundle keeps its v3 provenance and its pixels, and `make gen` republishes unchanged hashes.
  Rollback rule: a theme whose remap targets a v4 ramp may fall back to a v1 ramp without
  regenerating earlier waves, because the bump adds shades rather than moving any existing one.
  The palette-collision and clamp gates now walk all 15 material ramps, and a staged-bad test
  proves the detector still bites on a too-bright base.
