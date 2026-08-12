# Costume blitz — SKU ledger for figure sets 64-127

**Goal:** dress a whole figure in every theme the Furnishings Folio opens. Ten costume packs add 64
`FIGURE_SETS` rows, ids 64-127, one shelf per furniture theme, so a folio chapter sells its room and
its outfit from the same page. Every row below is an authored silhouette spec — a coder-agent models
the mesh from the intent column and never invents the shape.

Companion to `docs/plans/2026-08-11-furniture-content-blitz-catalog.md` (theme list, visual
direction). Extends the factory model in `design_handoff_avatar_customization/ASSET-LOOP.md`.
Grounded against `packages/shared/src/figuredata.ts`, `tools/artgen/rig.py`,
`tools/artgen/figurepass.ts`, `tools/artgen/facedata.ts`.

## Pinned decisions

| Question | Decision | Reason |
|---|---|---|
| Scale | 64 new sets, ids **64-127**, 10 packs of 6 or 7 | Four packs of 7 and six of 6. Ids are append-only and assigned here, never re-derived. |
| Id order | Ids run in `LAYER_ORDER` inside each pack, packs in ledger order | A pack's ids stay contiguous, so a revert is a range. |
| Theme string | The furniture theme name **exactly**: `bannerhold` `nocturne` `mochi` `starliner` `fablewood` `tidal` `verdant` `clockwork` `penthouse` `pool` | Folio chapters merge furniture and costume on purpose. The client derives shelf tabs from `WEARABLE_SHELF.theme` (#438), so a new theme costs no UI edit. |
| Ramps | The 12 `MATERIAL` ramps only | `rose`, `signal` and `aether` arrive with the furniture plan's `STYLE_VERSION=4` and do not exist yet. Where a pack wants one it is named a **future colorway**, never a dependency. |
| Colour slots | 1 or 2, family `material` | Slot 1 buys a second ramp only where it lands somewhere a player sees. Flat trim that never breaks the outline still earns a slot (the ch44 zip idiom). |
| `hides` | `cc` hides `ch`. A hat that replaces hair hides `hr`. Nothing else hides. | The shipped pattern. It keeps the holdout set at size one. The Fascinator 121 is the only hat in packs 1-9 worn WITH hair (ha55 Headphones and ha56 Visor already ship `hides: []`). |
| Prices | 150-450 on the shipped rungs 150/200/250/300/350/400/450 | Same band as the #440 shelves and under the 600 daily earn ceiling. Basics low, outline-changing statement pieces high. |
| Shipping | One pack at a time, one commit per part | Each pack is a revert unit. A pack lands complete or not at all. |
| Hair | No new `hr` sets | `hr` is already 12 and sells on its own shelf. A costume pack is garments. |
| Stamp path | Exactly **2** `fa` sets go through `facedata.ts`: **95 Sage Beard**, **114 Mutton Chops** | Hand-authored pixel maps are different labor. Both sit on the existing `beard` axis, so `BEARD_SETS` gains two rows and no new axis. |

## Measured lines every intent is written against

Read this before modelling anything. The numbers are `rig.py`, not taste.

- **Prim budget 13.** 26 mask slots, `bd1` takes 9 and `hd2` takes 4. A capsule with caps is one prim.
- **Body prims a garment must clear.** Torso box x ±7.5, y ±6.0, z 0-21. Arms r 3.2 on bones at
  x ±9.5. Thighs r 4.2 on bones at x ±4.0. Shins r 3.7. Foot box x ±3.7, y -2.9..6.3, z -18..-14.6.
  Skull ellipsoid r (10.1, 9.5, 11) centred at head-bone z 11, top at z 22. Garment surface sits
  **outside** the prim it covers, 0.2 minimum. Inside it, the body wins the depth test and the part
  renders as nothing.
- **Rows.** A head-bone point draws at row `44 + y/2 - z` at dir 3. A spine-bone point draws at
  `65 + y/2 - z`. Stand `anchor_y` is 102 and the hip sits 37 px above the feet. The sit anchor is
  the hip at row 74.
- **Face.** The face sets stamp rows 31-39 (brow 31, eyes 33-35, nose 36, mouth 39, chin 42). Head
  geometry keeps its lowest lit pixel at **row 30 or above**. Walk down-steps close a half row, so
  never author a 1-row stand margin.
- **Brim rule.** A disc of radius R on plane z puts its forward edge at row `44 + R/2 - z`. So
  **z ≥ 14 + R/2**. A 26 px brim needs z 20.5, a 30 px brim z 21.5, a 34 px brim z 22.5. Past
  ~34 px a flat brim floats off the crown — use a cone brim and put its widest ring at the top.
- **Hat room.** Rows 1-20 are free, the skull tops out at row 21, `gateBounds` fails on any lit
  pixel touching the frame edge. The Top Hat 54's lid lands on row 5.
- **Floor.** Walk-contact frames land on row 110 and row 111 fails. A prim overhanging the foot by
  `(|x| + |y|)` drops `(|x| + |y|)/2.828` rows below its own z, so anything wider than the loafer
  footprint starts a px or more off the ground plane.
- **Catchlight corridor.** `figurepass` repaints lone catchlights at (28,34) dirs 2/6 and (30,36)
  dir 4. **Cover the pixel outright or stay two clear.** Antialiasing two columns away has already
  killed one part — the Sunglasses 58 shipped as a single lens block because every wing failed here.
- **Thin geometry.** Anything ≤ 2 px reads as pure outline with no interior shade. Minimum 3 px on
  any feature whose read depends on it. The Chain 62 shipped as 3.2 px links against a specced 1 px.
- **Cone prim.** Truncated, down local -Z, `r0` at `z0` and `r1` at `z0 - len`. `z0` moves it off
  the bone, equal radii make a cylinder, and the widest ring may be at either end. This is how
  upward geometry exists (Top Hat 54) and how a brim tilts up instead of down.
- **Some rows write cones in VISUAL order, not prim order** (pack 5 finding: ha96's row read
  literally buried the point in the skull; sh98's row is written ankle-up the same way). Author
  the SOLID the row describes — the prim's `r0` is always at `z0` running down; when a row says
  "r0 at the bottom", flip it into prim notation before modelling.
- **Skin is free.** A garment that covers less is not a cheaper garment. `bd1` renders underneath.
- **A stamp-path part freezes BEFORE its pack's meshes** (pack 8 finding). A scoped mesh freeze
  rebuilds every face layer to gate against and refuses while an authored-but-unfrozen stamp part
  disagrees with the frozen tree. Freeze the fa part first (`--only hd2` scopes to hd2 + face
  layers), then the meshes.
- **A cone on a limb bone needs an explicit joint ball** (pack 8 finding). bd1's limbs are capsules
  whose joints are sphere caps; a cone ends in a flat disc, so a specced-tight cone pair leaves an
  empty band at the joint and splits the layer into islands (lg109 needed a r4.6 ball per knee).
  Corollary: a ch arm feature only reaches the silhouette at dirs 2/3/4 — at the profiles the arms
  sit inside the body's own depth and no arm geometry can show.
- **A `wa` band beats a same-height `ch` detail on the diagonal** (pack 2 finding). A box band's
  corners out-reach an ellipsoid flare in every direction but face-on — wa74 over ch73 left the
  peplum ~1 px per frame. A `ch` detail that must survive a worn `wa` needs to beat the band's
  DIAGONAL, not its face. Applies to packs 7 and 9 (Tool Roll 106, Peplum Belt 118 vs Halter 117).

Same-type siblings stay **below 0.854 silhouette IoU**, measured over the rendered alpha across all
64 dir-frames the way the Tracksuit Top 44's sleeves were. Every row names its nearest same-type
sibling among sets 1-127 and the geometric feature that separates them. If a separator cannot be
stated as geometry, **change the part**. Palette is never a separator.

**The named sibling is a hint, not the bar** (pack 4 finding: 3 of 6 rows named the wrong nearest —
lg84's true tightest was Trousers 7 at 0.847-as-specced, not Cargo 47). Always measure against
EVERY shipped same-type sibling; the named one is where to look first, never where to stop.
Unpurchasable pairs (Staff Blazer 16) may exceed the bar — no player can own both.

---

## Pack 1 — bannerhold (7)

Medieval hall. Padded layers, a tabard over them, a helm with a crest.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 64 | lg | Breeches | 1 | — | 200 | Thigh tube r 5.0 blousing into a cuff ring r 5.6 that sits 2 px BELOW the knee joint, shin left as skin. Nearest sibling **Shorts 45**: 45 cuts flat 7.5 px ABOVE the knee with `"caps":"top"` and no band, so the two never share a hem row and 45 has no ring to break its outline. |
| 65 | sh | Sabatons | 1 | — | 250 | Three overlapping lamé plates stepping UP the instep from the toe, each 1.1 proud of the one below, plus a pointed toe wedge reaching y 8.6 (2.3 past the foot box) and starting at z -16.6 so the point clears the ground plane. Nearest sibling **Sneakers 49**: 49 is three stacked boxes rising vertically with a flared midsole, one smooth block in profile. The sabaton's profile is a staircase running forward, not upward. |
| 66 | ch | Gambeson | 2 | — | 300 | Straight 8.6 body from shoulder to a flared skirt band at z -4.0, with two shoulder rolls (balls 1.6 proud at the shoulder caps) that break the outline UPWARD. Slot 1 = rolls and skirt band. Nearest sibling **Tracksuit Top 44**: 44 pinches 8.6 down to a 7.8 waistband and has no shoulder break. The gambeson never pinches and gains 1.6 px of height at each shoulder. |
| 67 | wa | Sword Belt | 2 | — | 300 | Belt ring plus ONE 14 px scabbard spur hanging outboard of the left thigh, 3.4 wide, clearing the thigh limb by 0.4, with a hilt tab standing above the band. Slot 1 = scabbard mouth and hilt. Nearest sibling **Sash 63**: 63 is a continuous diagonal staircase from shoulder to hip with nothing below the waist. The sword belt is a horizontal band with a single long spur under it. |
| 68 | cc | Surcoat | 2 | ch | 450 | Two flat panels, front and back, hanging to spine z -9.0 with a 2.2 px side gap at x ±5.4 where `bd1`'s own torso shows through. No sleeves. Slot 1 = a shoulder yoke ring. Nearest sibling **Overcoat 11**: 11 is a sleeved body over a full flare cone, closed all round. The surcoat's sides are open and its arms are bare. |
| 69 | ca | Heraldic Mantle | 2 | — | 350 | A shoulder cone from the chest bone, r0 9.0 at the neck to r1 11.4 at spine z 6.0, reaching past the shoulder line at x ±9.6. Slot 1 = a throat tab. Nearest sibling **Scarf 60**: 60 is two offset lumps and one off-centre tail, asymmetric by design. The mantle is a symmetric ring that clears the shoulders and stops in one clean hem. |
| 70 | ha | Crested Helm | 2 | hr | 400 | Dome shell to a bottom edge at row 28 all round, a nape flare at the back reaching head z 14, and a sagittal crest fin 3.4 thick standing 6 px over the crown. Slot 1 = the fin. Nearest sibling **Beanie 53**: 53 is a 0.88 tall-to-wide dome with a 0.6-proud cuff ledge at z 20.2 and nothing above the crown. The helm has no ledge, adds a fore-and-aft fin, and covers 6 px more of the nape. |

## Pack 2 — nocturne (7)

Gothic manor. Tiers, a cinched waist, a coat that is cut away at the front.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 71 | lg | Tiered Skirt | 2 | — | 300 | Two cones on the hip bone, the second offset with `z0`. Upper runs hip to z -13, r0 8.8 to r1 11.0. Lower takes `z0` -13.0, len 15, r0 11.4 to r1 14.6, overlapping 1 px so the layer stays one island. The step at z -13 is a real ledge. Slot 1 = the lower tier. Nearest sibling **Long Skirt 48**: 48 is one smooth cone, 8.8 to 14.2 over 28 px, with no break in its profile. Hem width matches on purpose — 14.2 is the structural minimum that keeps a swung shin inside the skirt. |
| 72 | sh | Pointed Boot | 1 | — | 250 | Long tapered toe reaching y 9.4 (3.1 past the foot box), a closed ankle collar topping at z -13.0, and a stacked block heel behind rising to -12.8. Both the toe and the heel start clear of the ground plane. Nearest sibling **Heels 51**: 51 is an open court shoe — vamp cut low at -14.2, counter to -12.4, needle spike behind. The pointed boot closes over the ankle and its length is in the toe, not the heel. |
| 73 | ch | Corset Bodice | 2 | — | 300 | Strapless. A flat top edge straight across the chest at z 15.6, bare shoulders, and a peplum ring at the hip (ball squashed, r 9.2) flaring 1.7 past the torso. Slot 1 = the peplum. Nearest sibling **Tank 43**: 43 has two 3.6 straps over the shoulders with a 6.4 gap between them and stops at the waist. The bodice has no straps at all and gains a hip flare 43 has nothing like. |
| 74 | wa | Waist Cincher | 2 | — | 250 | A 7 px tall band, spine z -1.0 to 6.0, with a front lacing plate 4.2 wide standing 1.0 proud. Slot 1 = the plate. Nearest sibling **Belt 15**: 15 is one 2.8 px box. Height is the separator — 7 px against 2.8 is a band against a line at 64 px — plus the plate breaking the front. |
| 75 | cc | Tailcoat | 2 | ch | 450 | Cut away at the front: the body stops at the waist at z 1.0 across the whole front half, and two tails hang to z -8.0 at y < 0 ONLY. Dirs 2/3/4 show a bare hip, dirs 6/7/0 show the tails. Slot 1 = collar and tails. Nearest sibling **Overcoat 11**: 11's flare cone is closed and even all round. The tailcoat has geometry behind the figure and none in front of it below the waist. |
| 76 | ca | Lace Ruff | 1 | — | 200 | A horizontal disc collar at the chin plane, r 9.4 and 3.2 thick, so the head sits in a plate. Its lowest row is 48 — well clear of the face. Nearest sibling **Scarf 60**: 60 is a vertical asymmetric mass with a tail running to z 5. The ruff is a flat symmetric plate with nothing hanging below it. |
| 77 | ha | Mourning Hat | 2 | hr | 400 | Shallow crown dome z 19-26, plus a DROOPING cone brim — widest ring at the bottom: `z0` 24.4, len 3.2, r0 8.0 to r1 13.0, so the outer edge lands on row 29. Slot 1 = the crown band. Nearest sibling **Top Hat 54**: 54's brim is a flat 26 px disc, 3 px thick, on one plane. The mourning brim slopes 3.2 px downward from crown to edge, so its side outline is a wing and 54's is a line. |

## Pack 3 — mochi (6)

Soft and rounded. Curves where the wardrobe has straight lines.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 78 | lg | Bloomers | 1 | — | 200 | The thigh is a squashed BALL r 6.6, not a tube, pinching into a 4.8 cuff ring above the knee, so the leg outline is a curve. Nearest sibling **Shorts 45**: 45 is a straight r 5.4 tube with a flat cut, two parallel lines in profile. The bloomer bulges 1.2 past 45 at mid-thigh and pinches 0.6 inside it at the hem. |
| 79 | sh | Puff Slippers | 2 | — | 150 | One continuous curved shell containing the foot with a 1.2 overhang, domed toe (ball r 4.6), top rising to z -11.6 so the ankle disappears into it. No sole step and no tread line. Slot 1 = the toe dome. Nearest sibling **Sneakers 49**: 49 is three stacked boxes with a flared midsole — three horizontal steps. The slipper has none, and it is 3 px taller at the ankle. |
| 80 | ch | Cloud Cardigan | 2 | — | 300 | The widest body in the wardrobe at 9.0 half-width, straight drop to z -2.0, sleeves r 5.0 running the FULL arm to the wrist. Slot 1 = front placket and two patch pockets. Nearest sibling **Tracksuit Top 44**: 44 is 8.6 blousy pinching to a 7.8 band, sleeves r 4.6 ending at the forearm. The cardigan never pinches and its cuffs reach the hand, so the arm reads as one thick tube where 44's stops short. |
| 81 | wa | Pinafore Apron | 2 | — | 250 | No band at all. A flat front panel 11.0 wide hanging from the waist to the knee at z -14.0, a bib up the chest to z 14.0, and two shoulder straps 3.4 wide. Slot 1 = bib and straps. Nearest sibling **Sword Belt 67**: 67 is a ring with one spur. The apron has no ring and its panel is a broad plate covering the whole front of the hip. |
| 82 | ca | Puff Muffler | 1 | — | 200 | A vertical soft tube round the neck, 7.0 tall from spine z 15 to 22, standing 2.4 proud all round, symmetric, no tail. Nearest sibling **Lace Ruff 76**: 76 is a horizontal plate r 9.4 lying flat at the chin. The muffler is the same idea rotated — a tall column half 76's radius that hugs the neck instead of ringing it. |
| 83 | ha | Sleep Cap | 2 | hr | 300 | A tall taper with no brim: cone `z0` 23, len 10, r0 6.2 to r1 3.4, capped by a ball tip r 3.0 at z 33 (top row 8). Slot 1 = the tip. Nearest sibling **Top Hat 54**: 54 is a straight-sided cylinder with a flat lid and a 26 px brim. The sleep cap loses the brim entirely and narrows 2.8 px on the way up, so its profile is a triangle where 54's is a rectangle. |

## Pack 4 — starliner (6)

Spacefarer. Ringed limbs, hard shoulders, gear that stands off the body.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 84 | lg | Pressure Leggings | 2 | — | 200 | A tight 4.5 tube with THREE full-circumference ring bands at thigh, knee and calf, each r 5.8 (1.3 proud), so the leg profile is three bulges on a slim column. Slot 1 = the rings. Nearest sibling **Cargo 47**: 47's four pocket boxes break the outline on the outboard and front faces only, and its tube is baggy at 5.5 tapering to 4.6. The rings are symmetric in all eight directions and sit on a tube 1.0 slimmer than 47's. |
| 85 | sh | Mag Boots | 2 | — | 300 | A 2.4 px sole slab from z -17.0 to -14.6 overhanging the foot 1.0 in x and 1.6 in y, on top of a tread that keeps the loafer's exact footprint at z -18 to -17. Ankle shell to z -12.0, squared toe cap. Slot 1 = the slab. Nearest sibling **Boots 50**: 50's mark is a shaft up the shin to -9.4 with a cuff band. The mag boot stops at the ankle and puts all its bulk in a sole plate 50 does not have. |
| 86 | ch | Flight Suit | 2 | — | 300 | Squared shoulder yoke: two boxes standing 1.4 proud at the shoulder caps from x 5.0 to 9.4, making a hard corner where every other top is round. Body 8.0 straight, horizontal chest rig band. Slot 1 = yoke and band. Nearest sibling **Blazer 39**: 39 tapers 9.4/8.4/7.7 and carries a two-step lapel wedge. The flight suit has no taper and no lapel — its silhouette event is a right angle at each shoulder. |
| 87 | ca | Oxygen Line | 2 | — | 250 | A neck ring plus four overlapping 3.4 px corrugated links running DIAGONALLY from the left collar to the right hip, reaching spine z 4.0. Slot 1 = the ring. Nearest sibling **Chain 62**: 62 is a symmetric seven-link arc stopping at x ±5.4 and never dropping below z 15.4. The oxygen line is asymmetric, crosses the chest, and ends 11 px lower. |
| 88 | ea | Pressure Goggles | 2 | — | 350 | Two barrel cups standing 3.6 proud (y to 12.6), each r 3.4, on a flat backing plate that covers the whole eye band rows 32-37 across columns 24-40. Slot 1 = the cups. **The plate is not decoration** — covering the band outright is the safe side of the catchlight rule, the side the Sunglasses 58 shipped on. Nearest sibling **Sunglasses 58**: 58 is one flat box, 2.0 deep, standing to y 10.2. The goggles reach 2.4 px further forward and break the profile into two barrels at dirs 1/2/4/5, where 58 is a single flush plate. |
| 89 | ha | Flight Helmet | 2 | hr | 400 | A smooth shell squashed WIDE (1.06 in x), covering the ears and the nape down to head z 14, front edge lifted so its lowest pixel is row 28. One nub at the back at y -8.6, never at the temple. Slot 1 = the nub. Nearest sibling **Beanie 53**: 53 stops at the temples with a 0.6-proud cuff ledge at z 20.2. The helmet has no ledge, is 6 px lower at the sides and back, and is wider than it is tall where 53 is the reverse. |

## Pack 5 — fablewood (7)

Wizard. The only bell sleeves in the wardrobe, the tallest hat, the longest robe.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 90 | lg | Sage Trousers | 1 | — | 200 | A column: a near-cylinder cone on the leg bone, r0 6.4 at the hip to r1 6.8 at the ankle, so the leg is the same width top to bottom. Nearest sibling **Flares 46**: 46 is slim at the thigh (4.5) and bells to 7.4 on the knee bone only. The sage trouser is 1.9 wider than 46 at the thigh and never changes width, so the two share no part of their profile. |
| 91 | ch | Rune Tunic | 2 | — | 300 | **Bell sleeves** — cones on the arm bones flaring r 3.8 at the shoulder to 6.6 at the wrist. No other `ch` sleeve changes width. Body 8.2 straight to a rolled hem band at z -6.0, 0.6 proud. Slot 1 = cuffs and hem band. Nearest sibling **Cloud Cardigan 80**: 80's sleeves are a constant r 5.0 tube to the wrist. The tunic's are 1.2 narrower at the shoulder and 1.6 wider at the cuff, so the arm reads as a triangle against 80's rectangle. |
| 92 | wa | Potion Belt | 2 | — | 250 | A band with FOUR hanging vials, balls 3.0 across, spread from x -8.4 to 8.4 and none longer than 4 px below the band. Slot 1 = the vials. Nearest sibling **Sword Belt 67**: 67 hangs one 14 px spur on one side. The potion belt's spurs are short, plural and even — a scalloped lower edge, not a single blade. |
| 93 | cc | Wizard Robe | 2 | ch | 450 | The longest garment in the wardrobe: a cone on the hip, r0 8.2 to r1 13.6 over 22 px, plus a hood mass behind the neck (ball at spine z 19, y -6.4). Sit check: 74 + 22 + 6.8 = row 102, clear of 111. Slot 1 = the hood. Nearest sibling **Overcoat 11**: 11's cone is 8.6 to 10.4 over 14 px with no hood. The robe is 8 px longer, 3.2 px wider at the hem, and breaks the shoulder line backward where 11 is smooth. |
| 94 | ca | Star Stole | 2 | — | 250 | Two symmetric flat panels 1.4 thick hanging down the front from the shoulders to spine z 2.0, with no mass at the neck at all. Slot 1 = the panel ends. Nearest sibling **Scarf 60**: 60's read is its neck drape — two offset lumps clearing the torso all round — with one off-centre tail. The stole has no drape and two tails, symmetric, running 3 px lower than 60's one. |
| 95 | fa | Sage Beard | 1 | — | 200 | **Stamp path** (`facedata.ts` `beard` axis, new `BEARD_SETS` row). Full jaw mass JOINED to a moustache across row 38, covering the mouth row 39, with a centred chin point dropping to row 43. All three views d3/d2/d1, every view keeping a pixel in x 25-28 or x 35-38 so the dir-5 hand never hides a run whole. Nearest sibling **Full Beard 27**: 27 leaves row 39 clear, has no moustache, and its mass narrows to x 30-33 by row 42. The sage beard closes the mouth line and drops a point one row lower. |
| 96 | ha | Pointed Hat | 2 | hr | 400 | Flat 30 px disc brim on plane z 21.6 (forward edge row 29.9), plus a tall taper: cone `z0` 20.0, len 17.5, r0 8.2 to r1 2.2, ball tip r 2.6 at z 37.5 — top row 5, the same slack the Top Hat 54 keeps. Slot 1 = the brim. Nearest sibling **Top Hat 54**: 54's crown is a straight cylinder with a flat lid. This one narrows 6 px on the way up to a point, and its brim is 4 px wider. |

## Pack 6 — tidal (6)

Mariner. A collar on the back, a ring on the chest, a brim behind the head.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 97 | lg | Rolled Deck Trousers | 2 | — | 150 | Cropped at MID-SHIN with a fat roll: leg 4.6 ending in a r 6.2 cuff ring 9 px above the sole, ankle bare. Slot 1 = the rolls. Nearest sibling **Cargo 47**: 47 runs to the ankle and tapers 5.5 to 4.6. No other `lg` ends at mid-shin — Shorts 45 is above the knee, Breeches 64 below it, and everything else reaches the ankle or the calf. The hem row is the separator, and the roll is 1.6 wider than anything 47 puts there. |
| 98 | sh | Sea Boots | 1 | — | 300 | A shaft to z -4.0, just under the knee, and the shaft is a CONE widening upward — r0 4.6 at the ankle to r1 6.4 at the top. Nearest sibling **Boots 50**: 50's shaft is a straight box stopping at mid-shin at -9.4 with a cuff band closing it. The sea boot is 5.4 px taller and its sides splay 1.8 px outward, so the leg reads as a funnel where 50 reads as a tube. |
| 99 | ch | Sailor Middy | 2 | — | 300 | A large flat square collar flap on the BACK of the shoulders — a box x ±7.0, y -6.2..-7.6, z 12.0-20.0 — plus a front V. Dirs 6/7/0 show a plate where every other top shows a smooth back. Slot 1 = flap and V. Nearest sibling **Polo 41**: 41's collar is a 2.3-narrower band 0.6 proud, all round the neck. The middy's collar exists only behind the figure and is 5 times the area. |
| 100 | wa | Rope Belt | 1 | — | 150 | Eight overlapping 3.6 px balls round the waist — the Chain 62 idiom moved to the hip — with a knot lump at the front and two 8 px tails hanging from it. Nearest sibling **Belt 15**: 15 is one flat 2.8 px box with a straight top and bottom edge. The rope's edges are scalloped in all eight directions and it hangs two ends 15 does not have. |
| 101 | ca | Life Ring | 2 | — | 350 | A 20 px open ring standing VERTICAL on the chest, built as four boxes round a hole (the Round Specs 59 idiom, because there is no torus prim and ellipsoid bars leave 0.5 px diagonal gaps). 3.4 thick, 2.0 proud, spanning spine z 4 to 22. Slot 1 = the wrap bands. Nearest sibling **Lace Ruff 76**: 76 is a closed horizontal plate at the chin. The life ring is open, vertical, twice the diameter, and it covers the chest rather than the neck. |
| 102 | ha | Sou'wester | 2 | hr | 250 | The Visor 56's construction mirrored: a brim disc pushed BACK to y -5.2 so the skull swallows its front half and only the crescent BEHIND the head survives the holdout. Nothing reaches the brow at all. Rounded crown over it. Slot 1 = the brim. Nearest sibling **Visor 56**: 56's crescent is in front at row 30 and it has no crown. The sou'wester has a crown, and its shelf is at the nape where 56's is over the eyes — the two are back-to-front of each other. |

## Pack 7 — verdant (6)

Gardener. Working clothes, cut and cropped.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 103 | lg | Gathered Culottes | 1 | — | 250 | TWO cones, one per leg bone, flaring from the hip r0 5.8 to r1 8.6 and cut flat 2 px below the knee. The walk frames split them, which no skirt does. Nearest sibling **Pleated Skirt 8**: 8 is a single cone on the hip, 8.2 to 11.6 over 15 px, that cannot split. Nearest sibling among trousers is **Flares 46**, which flares from the KNEE and reaches the shin — the culotte's flare starts 19 px higher and ends 14 px sooner. |
| 104 | sh | Garden Clogs | 1 | — | 150 | A solid block containing the foot, squared toe rising to z -12.8, and the BACK left open — the heel is bare skin. Nearest sibling **Sandals 52**: 52 is a sole plate with two bands over an open instep and a covered heel line. The clog is the inverse — closed at the front, open at the back — and 1.8 px taller over the toes. |
| 105 | ch | Rolled-Sleeve Shirt | 2 | — | 200 | Sleeves ending at the ELBOW in a 5.6 roll, 1.6 proud, plus a shirttail: the front hem hangs to z -1.0 and the back hem stops at 3.0, a 4 px step visible in profile. Slot 1 = rolls and chest pocket. Nearest sibling **Vest + Shirt 40**: 40's cuff is at three-quarter length, 16.0 down the arm, under a vest step at z 13.8. This shirt's roll is 5 px higher, 1.6 px thicker, and it has no vest edge — its second silhouette event is the uneven hem instead. |
| 106 | wa | Tool Roll | 2 | — | 250 | A belt with one wide flat pouch plate across the FRONT of the hip, x -7.0..7.0, z -6.0..0.0, 1.6 proud, and three tool nubs standing ABOVE the band. Slot 1 = the nubs. Nearest sibling **Potion Belt 92**: 92 hangs four separate round vials below the band. The tool roll's mass is one continuous plate and its only lumps are on top, so the two have opposite edges. |
| 107 | ca | Seed Satchel | 2 | — | 300 | A flat 3.0 strap running diagonally from the right shoulder to the left hip, ending in a 9×7 box bag that breaks the outline sideways at x 9.0. Slot 1 = the bag. Nearest sibling **Oxygen Line 87**: 87 is a run of round 3.4 links with nothing at its end. The satchel's strap is a flat band and it terminates in a box 3 times the strap's width. |
| 108 | ha | Woven Sunshade | 2 | hr | 350 | An UPTURNED cone brim — widest ring at the TOP: `z0` 23.0, len 3.0, r0 17.0 at the top ring to r1 8.0 at z 20.0, so the outer edge lands on row 29 and the underside meets the crown on the skull. Shallow peaked crown, r0 8.6 to r1 3.4 over 6 px. Slot 1 = the peak. Nearest sibling **Mourning Hat 77**: 77's brim droops — widest ring at the bottom — under a rounded dome. This one rises, and its crown is a cone. The two are the same prim inverted, which is a 3 px swing at the brim edge in every direction. |

## Pack 8 — clockwork (7)

Steampunk artisan. The arm changes width, the coat vents, the hat carries hardware.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 109 | lg | Jodhpurs | 1 | — | 250 | Flared at the HIP and tight at the shin: a thigh cone r0 6.8 at the hip to r1 4.4 at the knee, then a 4.2 shin tube (0.5 clear of the shin limb). Nearest sibling **Cargo 47**: 47 is baggy at 5.5 with a step at the knee and stays loose to 4.6. The jodhpur is 1.3 wider at the hip, tapers smoothly across the whole thigh instead of stepping, and is skin-tight below the knee. Against **Culottes 103** it is the mirror — 103 widens downward, this narrows. |
| 110 | ch | Bracered Jacket | 2 | — | 350 | The arm steps: upper sleeve r 3.8 to the elbow, then a forearm bracer r 5.0 from elbow to wrist. No other `ch` changes width mid-arm. Stand collar, straight 8.2 body to z 0. Slot 1 = the bracers. Nearest sibling **Cloud Cardigan 80**: 80's arm is a constant 5.0 tube the whole way. The bracered arm is 1.2 narrower for its top half, so the elbow is a visible corner in the outline. |
| 111 | wa | Gear Belt | 2 | — | 300 | A band carrying ONE large cog at the hip — a 9 px disc, ball squashed to 1.6 in y, centred at x 6.4 so it breaks the outline sideways out to x 10.8 — plus four drive links running up to the ribs. Slot 1 = cog and links. Nearest sibling **Potion Belt 92**: 92's four vials are small, even and hang below the band. The gear belt is asymmetric, its mass is beside the hip rather than under it, and its one disc is 3 times a vial. |
| 112 | cc | Frock Coat | 2 | ch | 400 | No flare cone at all: a straight box body to z -8.0 with a SPLIT back — two panels with a 2.4 px gap at y < 0 from z -2.0 down. Dirs 6/7 show the vent. Slot 1 = collar and cuffs. Nearest sibling **Overcoat 11**: 11's whole read is its hip flare. The frock coat's hem is the same width as its chest and it opens at the back, so the two share no profile below the waist. |
| 113 | ca | Cravat | 1 | — | 200 | A single symmetric knot at the throat, widest at the TOP — a ball 7.0 across at spine z 19 — vanishing into the shirt by z 13. No blade below it. Nearest sibling **Tie 61**: 61's knot is 3.8 wide and its blade tapers 2.4 to 4.6 down to z 5.6. The cravat is 3.2 px wider at the collar and 7 px shorter, so one is a wedge pointing down and the other a lump pointing up. |
| 114 | fa | Mutton Chops | 1 | — | 150 | **Stamp path** (`facedata.ts` `beard` axis, new `BEARD_SETS` row). Sideburn masses running from the temple and WIDENING at the jaw, chin and mouth rows left bare. Drawn for d3/d2/d1, each view keeping a pixel in x 25-28 or x 35-38 so the dir-5 hand never hides a run whole. Nearest sibling **Full Beard 27**: 27's mass is on the chin, rows 40-42, narrowing to x 30-33. Mutton chops put every pixel at the face's outer edges and leave the centre clear — the inverse distribution. |
| 115 | ha | Goggle Cap | 2 | hr | 400 | A close brass skullcap with two round cups r 4.0 standing 3.0 proud ABOVE the crown line at the front, on a 3.6 band at head z 24-28. Every pixel sits above row 20, nowhere near the face or the catchlight corridor. Slot 1 = the cups. Nearest sibling **Headphones 55**: 55's cups are pucks at ear height on a coronal band, at the SIDES of the head, and it has no shell. The goggle cap replaces the hair and puts its two lumps on the forehead, 14 px higher and 90 degrees round. |

## Pack 9 — penthouse (6)

Gala. Statement geometry — the only train, the only bare back, the only sleeveless coat.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 116 | lg | Trained Gown | 2 | — | 450 | The Long Skirt 48's cone (hip to calf, 8.8 to 14.2 — 14.2 is structural, a narrower hem lets a swung shin through) PLUS a flat back panel x ±7.0, y -8.0..-6.4, hanging to z -34, six px below the cone and at y < 0 only. Sit check: row 74 + 34 - 4 = 104, clear of 111. Slot 1 = the train. Nearest sibling **Long Skirt 48**: identical from the front and the sides by design, and that is the point — the train is geometry that exists only behind the figure, so dirs 6/7/0 separate them completely and dirs 2/3/4 read as the same family. |
| 117 | ch | Halter Bodice | 2 | — | 300 | No back panel at all: a front plate x ±6.4, y 4.6..7.2, z 4.0-18.0, and a 3.4 neck strap running to the nape. Dirs 6/7/0 show bare skin from the waist up. Slot 1 = the strap. Nearest sibling **Tank 43**: 43 has a front AND a back and two shoulder straps with a 6.4 gap. The halter deletes 43's entire back half, which is the largest silhouette difference available on this layer. |
| 118 | wa | Peplum Belt | 2 | — | 250 | A band with a flared ring skirt under it: a cone from z 2.0 to -5.0, r0 8.2 to r1 11.4, so the hip stands 3.9 px past the torso edge. Slot 1 = the band. Nearest sibling **Waist Cincher 74**: 74 is a straight 7 px band with a flat lower edge. The peplum's lower edge is a hem 3.2 px outboard of its upper one, so it is a bell where 74 is a cylinder. |
| 119 | cc | Opera Cape | 2 | ch | 450 | No sleeves and no body box. One cone hanging from the chest bone, r0 9.6 at the shoulders to r1 12.0 at spine z 2.0, plus a high stand collar behind the neck. The arms hang outside it below the elbow. Slot 1 = the collar. Nearest sibling **Overcoat 11**: 11 is a sleeved body over a hip flare. The cape has neither — it is one shoulder-mounted bell, so the whole upper arm outline that 11 draws is absent. |
| 120 | ca | Jewelled Choker | 2 | — | 250 | A closed ring AT the neck, spine z 19.0-22.4 (3.4 tall, clearing the 2 px outline rule), r 5.0, with a centre stone ball 3.2 at the throat. Slot 1 = the stone. Nearest sibling **Chain 62**: 62 is an open arc across the CHEST at z 15-19, stopping at x ±5.4 and never touching the neck. The choker closes all round and sits 4 px higher, so one rings the neck and the other lies on the sternum. |
| 121 | ha | Fascinator | 2 | — | 350 | The only asymmetric hat and the only one worn WITH hair. A flat disc plate 12 px across at head z 24, centred at x 5.0 — one side of the crown only — with a 4.0 ball cluster on it. All of it draws above row 20, clear of the face and the catchlight corridor. Slot 1 = the cluster. Nearest sibling **Crown 57**: 57 is a symmetric band with three points ringing the head. The fascinator has no band, touches one side, and leaves the other side of the crown bare. |

## Pack 10 — pool (6)

Swim and deck. Skin exposure is free, so these are the smallest garments in the wardrobe.

| id | type | name | slots | hides | price | silhouette intent |
|---|---|---|---|---|---|---|
| 122 | lg | Swim Trunks | 2 | — | 150 | The shortest and narrowest leg: a 4.9 tube cut flat at mid-thigh, 13 px above the knee, with a 5.6 drawstring waistband ring. Slot 1 = the band. Nearest sibling **Shorts 45**: 45 is deliberately wide at 5.4 and stops 7.5 px above the knee, because "a short that is not wide is a swimming brief". The trunk is that brief — 0.5 narrower and 5.5 px shorter — which is the separator 45's own spec named. |
| 123 | sh | Pool Slides | 1 | — | 150 | ONE wide band across the instep, 8 px across, straddling the foot box's -14.6 top edge so it reads as a strap. Sole flush with the foot at x ±3.7, no overhang. Heel and toes bare. Nearest sibling **Sandals 52**: 52 has TWO narrow cross bands and a sole overhanging 0.7 in x and 2.3 past the toe. The slide is one solid block on a sole that never leaves the foot's own footprint. |
| 124 | ch | Swim Top | 2 | — | 200 | The body STOPS at z 13.0 — a 5 px band across the chest at z 13.0-18.0 with two 3.4 straps — so the midriff is bare skin down to whatever `lg` is worn. No other `ch` leaves the waist uncovered. Slot 1 = the straps. Nearest sibling **Tank 43**: 43's body runs from z 14.2 to the waist. The swim top keeps 43's straps and deletes everything below its chest, which is 60% of 43's alpha. |
| 125 | wa | Towel Wrap | 2 | — | 250 | 14 px tall, spine z 2.0 to -12.0, at 8.4 half-width, with a tucked corner fold at the front (a 4.0 box, 1.0 proud). Slot 1 = the fold. Nearest sibling **Waist Cincher 74**: 74 is 7 px tall and stops at the waist. The towel is twice that and reaches past the hip, so it reads as a garment rather than a band — the tallest `wa` in the wardrobe by 7 px. |
| 126 | cc | Beach Robe | 2 | ch | 350 | Straight body to z -14.0, mid-thigh, with a rolled shawl collar 2.0 proud running the full front edge and sleeves r 5.0. Slot 1 = the collar. Nearest sibling **Frock Coat 112**: 112 is also a straight box body, and length is the separator — the robe hangs 6 px lower — plus 112's split back against the robe's closed one and the robe's collar roll, which widens the neck at every direction. Flagged as the closest `cc` pair in the ledger. Measure the IoU before freezing. |
| 127 | ea | Snorkel Mask | 2 | — | 300 | A mask block covering the eye band outright, rows 32-37 across columns 24-40, plus a 3.4 tube running UP the side of the head from the mask at x 11.6 (1.5 clear of the skull's own 10.1) to head z 26. The tube's base sits inside the mask block's footprint, so the corridor stays covered. Slot 1 = the tube. Nearest sibling **Pressure Goggles 88**: 88 keeps every pixel on the face. The snorkel is the only `ea` that breaks the head's outline sideways and reaches 8 rows above the brow. |

---

## Type populations after the ledger

| type | now | new | after | crowding note |
|---|---:|---:|---:|---|
| bd | 1 | 0 | 1 | |
| hd | 9 | 0 | 9 | |
| lg | 6 | 10 | 16 | Separated by hem row first: mid-thigh 122, above knee 45, below knee 64, knee 103, mid-shin 97, calf 48/71/116, ankle 7/46/90/109. |
| sh | 5 | 7 | 12 | Separated by what they cover: shaft height 50/98, sole bulk 85, toe reach 65/72, what is left bare 52/104/123. |
| ch | 10 | 10 | 20 | The most crowded layer. Separated on the arm (80 full, 91 bell, 105 elbow roll, 110 bracer step), the shoulder (66 rolls, 86 yoke, 99 back flap), and what is absent (73 strapless, 117 no back, 124 no midriff). |
| wa | 2 | 9 | 11 | Separated by band height and where the mass hangs — 125 tallest, 118 flares, 106 plates the front, 92/111 hang below, 81 has no band. |
| cc | 1 | 6 | 7 | Separated by hem shape: 11 flare, 68 open sides, 75 tails behind, 93 long flare + hood, 112 straight + vent, 119 no sleeves, 126 straight + collar roll. |
| ca | 4 | 9 | 13 | Separated by plane and closure — 76 horizontal plate, 82 vertical tube, 101 vertical ring, 120 closed neck ring, 87/107 diagonal, 94 symmetric panels, 113 knot only. |
| hr | 12 | 0 | 12 | Untouched. |
| fa | 4 | 2 | 6 | Stamp path only, both on the `beard` axis. |
| ea | 3 | 2 | 5 | Both new sets cover the eye band outright, which is the safe side of the catchlight rule. |
| ha | 6 | 9 | 15 | Second most crowded. Brim profile splits 54/96 flat, 77 drooping, 108 upturned, 56 front crescent, 102 back crescent. Crownless or hardware splits the rest. |
| **total** | **63** | **64** | **127** | |

`ch` at 20 and `ha` at 15 are both past the estimate the brief carried (~17 and ~10). They are there
because every pack has to dress a torso and top a head. Every one of the 19 rows names a separator
on a different axis, so no pair leans on the same feature. If a build measures over 0.854 anyway,
the row to change is the newer of the pair.

## Execution — the proven #440 recipe, one pack at a time

Per part, one commit, message `costume #NNN: <type><id> <name>`:

1. Append the `FigureSet` in `packages/shared/src/figuredata.ts`. Id, type, name, slots, family
   `material`, `hides`, `retired: false`.
2. Author the mesh in `tools/artgen/rig.py` `FIGURE_PARTS` as `<type><id>`. Budget 13 prims. Keep
   the intent's numbers or record why they moved. `fa95` and `fa114` skip this step — they add a
   `BEARD_SETS` row in `tools/artgen/facedata.ts` instead.
3. `make art PART=<id>` for one part, or `make art PART=<id>,<id>,<id>` to batch a pack's renders.
   `PART=` runs the figure pass scoped and still re-gates every part, because the post-pass reads
   the whole accumulated `meta.json` (#234, #422).
4. `node --experimental-strip-types tools/artgen/figurepass.ts /tmp/artgen` — all gates green:
   registration, bounds, figureHeight, holdout, face. This re-gates in seconds against the
   accumulated render, so it is the iteration loop. No Blender needed to re-run it.
5. Look at `figure_face.png` and the @3x preview. Measure the IoU against the sibling the row names.
   Over 0.854, change the geometry, not the ramp.
6. Freeze that part, then `make gen`.
7. Add the `WEARABLE_SHELF` row: `{ set, price, theme }`, cheapest-first inside the theme.
8. `make test`. The publish-sync test enforces frozen matching published (#423).

Per pack, before moving on:

- Every part in the pack renders on one figure at 2× without a layer eating another.
- The `cc` set covers the pack's `ch` set with no `ch` pixel showing at any of the 64 dir-frames.
  The mechanism is the `hides` rule — `resolveLayers` drops `ch` from the drawn stack. Geometric
  containment is NOT required and open-sided coats cannot provide it (pack 1 finding).
- The `ha` set clears the face at every walk down-step, checked against all eight face sets 17-24.
- The shelf reads cheapest-first and the theme string matches the furniture chapter exactly.

## Future colorways, not dependencies

Three packs want a ramp that does not exist yet. Each ships on the 12 `MATERIAL` ramps now and
gains the new one as a free remap once the furniture plan's `STYLE_VERSION=4` lands:

- `mochi` → `rose` on 78, 79, 82.
- `starliner` → `signal` on 84, 88.
- `fablewood` → `aether` on 93, 96.

A colorway is a ramp remap with no render, so none of this blocks a pack.

