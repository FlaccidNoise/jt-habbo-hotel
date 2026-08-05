# Plan: figure-string avatars and the modular clothing system (#127)

**Goal:** replace the placeholder rectangle in `packages/client/src/scene/avatar.ts` with a real
layered figure that walks, sits, and waves in 8 directions, wearing swappable garments composited
from a figure string — authored through the existing Blender rig, gated by the existing stage-4
machinery, and gated on ownership at save time.

Design pinned in session 2026-08-05 against [PIPELINES.md](../design/PIPELINES.md) §3 and
[ART-DIRECTION.md](../design/ART-DIRECTION.md). Where this plan contradicts those documents, the
contradiction is stated and the document gets updated in the same task.

## Pinned decisions

| Question | Decision | Why |
|---|---|---|
| Authoring path | Extend `rig.py` with a bone hierarchy | Parts are already declarative primitive lists (`rig.py:41`), not imported meshes. A figure is a primitive list; an action is joint angles. |
| Compositing | Per-garment render against a **body-only holdout**, alpha-over at runtime | Blender's depth buffer cuts the garment where the body is nearer, so correct occlusion falls out of plain alpha-over. Cost is `layers × dirs × frames`, never combinatorial. |
| Directions | **8, all natively rendered.** Mirroring deleted for avatars | Movement is 8-way (`projection.ts:16-19`, `heightmap.ts:71`). Mirroring exists to halve hand-drawing; we do not hand-draw. It costs ~13 s/layer of Blender time and buys asymmetric garments (chest logos, shoulder bags, side-part hair). Supersedes PIPELINES:13 "5 drawn". |
| Scales | **64 only** | ART-DIRECTION §"Scale: 64 only in v1" already resolved C-45. PIPELINES §3 "2 scales" is stale; this plan fixes that line. |
| Actions | stand(1), walk(4), sit(1), wave(2) = **8 frames** | Pose authoring is shared across every layer, so actions are near-free in art. What they cost is protocol surface and sheet bytes. lay/dance/sleep/carry/props defer to a follow-up bug. |
| Figure height | **80 px = 2.5 height units**, canvas 64 × 112 | Shipped seat heights pin it: `cafe_chair seatZ 0.58` (18.6 px), `bed_basic 0.55`, and a 90° knee needs shin ≈ seat height. 18.6 px is 23 % of 80 px — stylized but coherent. ART-DIRECTION's "~100 px, ~3 units" needs shin at 19 %, which puts knees above hips on every chair in the catalog. **This plan changes that line.** |
| Layer types | **12 in render order, 11 selectable** | `bd` is implicit and inherits `hd`'s skin ramp — a separately-chosen body colour is a neck-mismatch bug with no upside. |
| Layer rules | Order is **per-type** (fixed 12-entry table); hiding is **per-set** (`hides: [type…]`) | A tiara and a beanie are both `ha`; only one hides hair. There is no type × type matrix to design before garments exist. |
| Figure string | `v<N>\|type-set-color(-color)*` joined by `.` | N colours per part, slot count declared by the set. #229 already remaps by ramp **name**, so multi-ramp garments are free at render time. Retrofitting arity later means a figuredata version bump on every stored string. |
| Ownership | Validated on save from day one | v1 rows come only from the registration grant; #118's ledger takes over the table later without the check moving. |
| Creative freedom | Curated parts, player composes `type-set-color` only | Same precedent as badges (audit S8), patterns (PIPELINES §2 stage 2), and furni parts. A garment is worn everywhere its wearer goes. |
| #227 | In this slice, **additive companion near-sheet**, last task | The rig can *derive* the near/far split from primitive depth vs the seat point — no artist declaration, unlike PIPELINES §2 stage 1's assumption. Base sheet bytes and `pixelHash` stay identical, so no frozen bundle loses its identity. |

## Scope honesty

**In:** the figure-string format and its version field; 11 selectable layer types with per-set
hidden-layer rules; ownership-gated saves; the skeletal rig extension with 8-way yaw and holdout
rendering; the four v1 actions; a starter wardrobe large enough to populate all 12 types; the
client's layered draw with lazy per-outfit baking; the registration default-outfit grant; chat
bubble colour derived from the figure; the furni near/far split closing #227.

**Deferred, and named:** lay, dance, sleep, carry, and the focus props (new bug — each needs
server state, and `lay` needs bed lay-points that are not authored). Scale 32. Pets
(PIPELINES §3's pet clause). Garment trading and withdrawn lines (rides #118). Garments in the
catalog (rides #215). Player-designed garments (rides #121). The wardrobe UI beyond a minimal
picker — enough to prove swapping, not a dress-up game.

**Slice boundary:** Tasks 1–10 ship the visible outcome — the rectangle dies and a dressed figure
walks, sits, and waves. Tasks 11–13 close #227. Commit after every task's PASS step.

## Global constants

- **Figure:** 80 px standing, 2.5 height units. Frame canvas **64 × 112**.
- **Anchor is per frame.** The anchor is the avatar's world position point at its own `z`:
  the feet for standing and walking, the hip/seat contact for sitting. A single fixed anchor
  cannot serve both, because the client already lifts the sprite by the seat's `z`
  (`seatAt()` in `placement.ts`), and seat heights vary 0.55–0.82 across the catalog.
- **Segment lengths** (px at scale 64, measured along the figure's vertical axis):
  head 22, torso 21, thigh 19, shin 18. Hip at 37 px, chin at 58 px, crown at 80 px.
  Hat headroom is the remaining 32 px of canvas above the crown.
- **Sheet layout:** one PNG per layer set. 8 columns (dir 0–7) × 8 rows
  (stand, walk0–3, sit, wave0–1) of 64 × 112 = **512 × 896**.
- **Render cost:** 8 dirs × 8 frames × 2 passes = 128 renders ≈ 18 s per layer set at the
  measured 0.14 s/render.
- Palette, outline, dither, and light rules are unchanged from ART-DIRECTION §"Style bible v1".

## Figure string grammar

```
v1|hd-1-tan.hr-14-charcoal.ch-22-crimson-ivory.lg-9-navy.sh-3-charcoal
```

- `v<N>|` prefix — the figuredata version the string was authored against (PIPELINES §3).
  Self-describing, because the string is stored, broadcast, and copied between systems.
- Parts joined by `.`, fields by `-`.
- `<type>` is one of the 11 selectable types. `bd` is never present — it is implicit.
- `<set>` is an integer. **Set IDs are append-only and never reused.** Retiring flags a set;
  it never deletes.
- `<color>` is a **ramp name** from `style.ts`, not an index — matching #229's rule that remaps
  are keyed by name so they survive mesh edits. The number of colours a part carries is declared
  by its set, not by the string.

## Layer order and hiding

Render order, back to front. Strictly outward, which is the condition under which a body-only
holdout stays correct: no layer ever needs to draw *in front of* one authored later.

| # | Type | Name | Selectable | Notes |
|---|---|---|---|---|
| 0 | `bd` | body | no | implicit; skin ramp inherited from `hd` |
| 1 | `hd` | head | yes | carries the skin ramp for the whole figure |
| 2 | `lg` | legs | yes | |
| 3 | `sh` | shoes | yes | over the trouser hem |
| 4 | `ch` | shirt | yes | |
| 5 | `wa` | waist | yes | belt sits over both shirt hem and trouser waist |
| 6 | `cc` | coat | yes | |
| 7 | `ca` | chest accessory | yes | |
| 8 | `hr` | hair | yes | |
| 9 | `fa` | face accessory | yes | |
| 10 | `ea` | eye accessory | yes | |
| 11 | `ha` | hat | yes | |

**Hiding is declared per set**, as `hides: [type…]`. A set may only hide types **earlier** in the
order — outward hiding is the only coherent direction, and the gate enforces it. This is what
keeps the holdout set at size one: a hat hides hair so a hat never needs a holdout render per
hair set.

Known imperfection, accepted: a necklace (`ca`) draws over an open coat's lapels rather than
under them. Any coat that cares declares `hides: ["ca"]`.

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/figure.ts` | **new** — grammar parse/serialize, layer order table, hide resolution, figuredata version |
| `packages/shared/src/figuredata.ts` | **new** — the set registry: id, type, colour slot count, `hides`, `retired`, sheet name |
| `packages/shared/src/protocol.ts` | `figure` on `AvatarState`; `set_figure` client message; `wave` messages |
| `packages/server/src/figure.ts` | **new** — ownership check, save endpoint, registration grant |
| `packages/server/src/room.ts` | broadcast figure changes and waves |
| `packages/generator/src/style.ts` | skin ramp family |
| `packages/generator/src/gates.ts` | figure gates: registration, height, seat-fit, holdout, hide-direction |
| `tools/artgen/rig.py` | bone hierarchy, pose table, 8-way yaw, holdout rendering, near/far derivation |
| `tools/artgen/figurepass.ts` | **new** — quantize + assemble figure sheets, run figure gates, freeze |
| `tools/artgen/postpass.ts` | companion near-sheet for seating furni |
| `packages/client/src/scene/figure.ts` | **new** — sheet loading, lazy per-outfit `RenderTexture` bake |
| `packages/client/src/scene/avatar.ts` | draw the figure instead of the rectangle |
| `packages/client/src/scene/sort.ts` | far → avatars → near, replacing the `seated` layer hack |

---

## Task 1 — skin ramps

`style.ts` has 12 ramps and no skin tone (`style.ts:37-49`). Append a skin family so the head and
body have somewhere to live.

- Add 6 ramps spanning the range, named `skin_1` … `skin_6`, following the existing
  `ramp(name, base)` shape where `base` is the `right` shade at factor 1.0.
- Each base must be dark enough that `hi` at 1.55 does not clip to white — the palette test
  bounces a clipping base, and that rule is already in ART-DIRECTION.
- Bump `STYLE_VERSION` to 2. Existing frozen bundles keep `styleVersion: 1` in their metadata;
  nothing asserts equality on load, and adding colours cannot make an existing pixel off-palette.

**PASS:** `make art` renders and gates green. **All 22 frozen bundles still gate green with
byte-identical sheets and unchanged `pixelHash`** — verified by `git diff --stat
tools/artgen/frozen/` showing no `.png` change. A staged skin base bright enough to clip `hi`
must fail `gatePalette`.

## Task 2 — figure string grammar

`packages/shared/src/figure.ts` and `figuredata.ts`. Pure logic, no rendering.

- `parseFigure(s): Figure` — rejects unknown types, unknown sets, retired sets, wrong colour
  count for the set, unknown ramp names, duplicate types, and a missing or unknown `v<N>|` prefix.
  It **rejects**; it never skips silently.
- `serializeFigure(f): string` — round-trips.
- `LAYER_ORDER` — the 12-entry table above.
- `resolveLayers(f): Layer[]` — applies each worn set's `hides` list, returns the layers to draw
  in order, with `bd` inserted implicitly carrying `hd`'s first colour.

**PASS:** unit tests for round-trip; one rejection test per rejection reason above; a hide test
(a hat with `hides: ["hr"]` removes hair from the resolved list); an implicit-`bd` test asserting
its colour equals `hd`'s. **Staged-bad:** a set declaring `hides` on a type *later* in the order
fails a `gateHideDirection` check at figuredata load.

## Task 3 — protocol and ownership

- `AvatarState` gains `figure: string`. `PostureSchema` is unchanged (wave is transient, not a
  posture). Add `set_figure` (client → server) and `figure_changed` / `wave` (server → client).
- `owned_sets(account_id, type, set_id)` table.
- Registration grants the default outfit, **seeded from the account id** over the starter sets —
  a fixed default makes every new player identical and, since GAME.md derives bubble colour from
  the outfit, gives them all the same chat colour.
- `POST /api/figure` parses, then checks every `(type, set)` against `owned_sets`. Any miss is a
  `403` and the stored figure is unchanged.

**PASS:** integration test — register two accounts, assert their default figures differ. **Staged-
bad:** `POST /api/figure` with a well-formed string naming an unowned set returns 403 **and** a
re-read shows the original figure intact.

## Task 4 — bones in the rig

`rig.py` currently places primitives in absolute footprint coords and rotates them by integer
quarter-turns (`rot_pt`, `rig.py:265`). A figure needs a hierarchy.

- `BONES`: `hip → spine → chest → {head, arm_l, arm_r}`, `hip → {leg_l, leg_r}`, each with a rest
  offset in figure-local px.
- A primitive may declare `"bone": "<name>"` and coords local to that bone. Furni primitives
  declare no bone and keep the existing absolute path untouched.
- A pose is `{bone: (rx, ry, rz)}`; composing a bone's chain gives the primitive's world
  transform.
- **8-way yaw:** a figure occupies one tile and rotates about its own centre, so direction is a
  single yaw about the tile-centre axis at 45° steps. The furni quarter-turn footprint remap is
  not touched — do not try to make one code path serve both.

**PASS:** render the body at all 8 directions in the stand pose; assert every frame's ink is
inside the canvas, and that dirs 0 and 4 are **not** horizontal mirrors of each other (proving
native rendering rather than accidental symmetry).

## Task 5 — poses

Author the 8 frames as bone-angle tables in `rig.py`. Shared by every layer forever.

- `stand` (1), `walk` (4, a standard contact–down–pass–up cycle), `sit` (1), `wave` (2).
- The `sit` pose puts the hip at the frame anchor with the thigh forward and the shin vertical, so
  the knee reads at 90° on a `seatZ 0.58` chair.

**PASS:** a `gateSeatFit` check — in the `sit` frame, the vertical distance from the anchor to the
lowest foot pixel must be within 1 px of the shin length (18 px). **Staged-bad:** a sit pose with
the hip at 30 px fails it.

## Task 6 — holdout rendering

- A layer render declares its own primitives plus the body as a **holdout**: present in the depth
  buffer, emitting no pixels and consuming no mask index (the 26-primitive mask limit,
  `rig.py:487`, applies to emitting primitives only).
- The mask pass keeps only the layer's own primitives, so the output is the garment alone, cut
  wherever the body is nearer.

**PASS:** `gateHoldout` — composite `bd` under a rendered sleeve layer and assert no garment pixel
survives where the body is nearer. **Staged-bad:** a layer rendered with the holdout disabled
fails it.

## Task 7 — figurepass

`tools/artgen/figurepass.ts`, a sibling of `postpass.ts`. Reuse its quantize, outline, and dither
code rather than reimplementing — extract the shared helpers if that is cleaner than importing.

- Read the lit + mask raw pairs, quantize on the same fixed linear-luma thresholds
  (0.30 / 0.62 / 0.80) so figures and furni read as one style.
- Apply the set's ramp remap by name.
- Assemble the 512 × 896 sheet, emit per-frame anchors, run the figure gates, freeze to
  `tools/artgen/frozen/figure/`.

**PASS:** `make art` produces one frozen bundle per layer set, all gates green. New gates wired
into `runGates`: `gateRegistration` (every layer's per-frame anchors identical to `bd`'s),
`gateFigureHeight` (`bd` standing silhouette is 80 ± 1 px), plus Tasks 5 and 6's gates.
**Staged-bad:** a garment with its anchor shifted 1 px fails `gateRegistration`; a body scaled
1.1× fails `gateFigureHeight`.

## Task 8 — starter wardrobe

Author enough meshes to populate all 12 types and prove swapping: `bd` ×1, `hd` ×1, `hr` ×2,
`ch` ×2, `lg` ×2, `sh` ×1, `ha` ×1 (declaring `hides: ["hr"]`), `cc` ×1 (declaring
`hides: ["ch"]`), `ea` ×1, `fa` ×1, `ca` ×1, `wa` ×1.

**PASS:** all 15 sets render and gate green; ~4.5 min of Blender time unattended. The hat visibly
removes hair and the coat visibly removes the shirt in a composited reference frame.

## Task 9 — client figure rendering

`packages/client/src/scene/figure.ts`.

- Load the layer sheets a room's occupants actually wear.
- `resolveLayers()` → alpha-over into a `RenderTexture`, **baked lazily per (dir, action) actually
  used**. Baking all 64 frames per outfit is ~458 k px, so 20 distinct outfits in a room is ~37 MB
  of GPU texture — lazy baking keeps that to what is on screen.
- Cache by resolved-figure hash, so two players in the same outfit share one texture.

**PASS:** a client unit test on the bake path asserting the cache key ignores worn-but-hidden sets
(a hat that hides hair produces the same key regardless of which hair is underneath).

## Task 10 — the rectangle dies

`avatar.ts`: delete `BODY_W`, `BODY_H`, `SIT_H`, `PALETTE`, `colorOf`, `drawBody`, and the facing
pip. Draw the figure sprite, pick the frame from posture and walk phase, and drive `wave` from the
new transient message with an auto-clear.

- Staff keep their visible distinction — a staff-only uniform set granted to NPC accounts, not a
  navy rectangle. Never a player-selectable set.
- Chat bubble colour derives from the figure per GAME.md, replacing the username hash.
- `head()` now returns the crown from the frame's anchor rather than a hardcoded height.

**PASS:** `make dev`, two browsers. A figure walks in all 8 directions, sits on a café chair with a
90° knee, waves, and changes clothes live in the other browser. `make test` green.
**This is the shippable slice.**

## Task 11 — derive the furni near/far split

`rig.py`: for each seating part, for each direction, classify every primitive by whether its
projected depth is nearer than the seat point. Derived from geometry — no artist declaration,
which is a simplification over PIPELINES §2 stage 1's "part slots declare occlusion groups".

**PASS:** `cafe_chair` dir 0 puts the chair back in the far set and dir 4 puts it in the near set.

## Task 12 — companion near-sheets

`postpass.ts` emits `<id>.near.png` for parts with a non-null `seatZ`, and `BundleMeta` gains
`nearSheet` and `nearHash`. The base sheet is untouched.

**PASS:** all 22 frozen bundles keep byte-identical `.png` files and unchanged `pixelHash` —
`git diff --stat` shows only new `.near.png` files and `.json` additions. 3 distinct items are
affected (`cafe_chair` ×3 colourways, `casino_stool` ×2, `bed_basic`).

## Task 13 — two-pass furni draw, closing #227

`sort.ts`: delete the `seated` layer and its comment. Draw far furni, sort avatars, draw near
furni.

**PASS:** a seated avatar on a café chair facing away is occluded below the waist by the chair
back; facing toward the camera it is not. `make test` green. Close #227.

## Documents to update in-task

- `PIPELINES.md` §3: action set trimmed to the v1 four with the rest named as deferred;
  "5 drawn directions, 2 scales" → 8 native directions, scale 64; add the per-set hiding rule and
  the holdout mechanism.
- `PIPELINES.md` §2 stage 1: occlusion groups are **derived**, not declared.
- `ART-DIRECTION.md` §"Style bible v1": avatar reference becomes 80 px / 2.5 units on 64 × 112,
  with the seat-height derivation; add the skin ramp family and `STYLE_VERSION` 2.
- `docs/decisions/INDEX.md`: log the direction count, the figure height, and the holdout model.

## What execution changed (filled in 2026-08-05)

The plan was mostly right about structure and wrong in six specific places. Each is recorded
because the reasoning matters more than the correction.

1. **The seat gate measured the wrong thing.** Planned as "rendered foot within 1 px of the shin
   length". A seated foot is 19 px forward of the hip, so its *screen* drop swings from 9 px
   facing away to 30 px facing the camera while the leg never changes length — a pixel gate there
   measures the dimetric projection, not the pose. `check_poses()` now does forward kinematics in
   pose space and runs before a single frame renders.
2. **The direction criterion was nonsense.** "dir 0 is not a mirror of dir 4" — those two are each
   self-symmetric and were never mirror candidates. Measuring properly found the spec's mirror
   table is wrong for this rig (see the decision log).
3. **`POST /api/figure` was cut.** Duplicate surface: the change has to broadcast to the room
   anyway and the socket is already authenticated. `set_figure` only.
4. **Figure sheets had to be indexed.** Not in the plan at all, and forced: colour is per player,
   so an RGB sheet needs one render per ramp combination. The plan's "bake per outfit" already
   made resolving indices free.
5. **The holdout gate as planned was tautological, then wrong.** Comparing composited layers to a
   combined render is the real check, but it only works one garment at a time — a garment's render
   contains the body and that garment, nothing else.
6. **Shadows, not the plan's assumption of clean layer independence.** `scene.eevee.use_shadows`
   overrides the per-light flag, and with it on a layer's pixels depend on what else is worn.

Task 1's stated PASS was also wrong: `gatePalette` only checks set membership and the clip test
only rejected pure white, so neither catches a single clamped channel — and four shipped ramps
already clamp. The no-clamp rule is scoped to skin, with that evidence in the style bible.

## Self-review

- Every pinned decision traces to a file:line fact or a shipped artefact, not to preference.
  The two that overrule the spec — 8 directions and 80 px — each name the spec line they replace
  and the evidence that replaces it.
- Every gate has a staged-bad case that must bounce: palette clipping (1), hide direction (2),
  unowned set (3), seat fit (5), holdout (6), registration and height (7).
- The holdout-set-size-one invariant is what makes this non-combinatorial, and the strictly
  outward layer order is what preserves it. Both are stated where they are relied on.
- Slice 1 (Tasks 1–10) is independently shippable: it ends with the rectangle deleted and a
  dressed figure visible in two browsers. #227 (Tasks 11–13) is additive and touches no pixel that
  a frozen bundle already owns.
- Names are consistent across tasks: `parseFigure`/`resolveLayers`/`LAYER_ORDER` (2, 9, 10),
  `owned_sets` (3), `gateRegistration`/`gateFigureHeight`/`gateSeatFit`/`gateHoldout` (5, 6, 7),
  `nearSheet`/`nearHash` (12, 13).
