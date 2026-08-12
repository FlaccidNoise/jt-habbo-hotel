# Dimetric part rig (#202, docs/design/ART-DIRECTION.md). Renders low-poly proof meshes to
# per-direction raw RGBA for tools/artgen/postpass.ts, which quantizes to the style.ts palette
# and runs the stage-4 gates.
#
#   blender --background --factory-startup --python tools/artgen/rig.py -- --out <dir>
#
# Camera math, locked to the generator's projection (packages/generator/src/iso.ts):
#   footprint fx -> (+32, +16) px, fy -> (-32, +16) px, z (height units) -> (0, -32) px.
#   Orthographic camera, elevation 30 deg (exact 2:1 diamonds), yaw 135 deg. With that camera
#   the world axes map fx = world Y, fy = world X. One world unit spans 32*sqrt(2) px, so a
#   z height unit would project to 32*sqrt(2)*cos(30) = 39.19 px; meshes are pre-squashed by
#   ZSCALE so one height unit lands at exactly 32 px.
#   World origin projects to render center; footprint point (fx,fy,z) lands at render pixel
#   (W/2 + (fx-fy)*32, H/2 + 16 + (fx+fy-1)*16 - z*32). postpass.ts inverts this to crop.

import json
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Vector

RES = 256
ZSCALE = 32.0 / (32.0 * math.sqrt(2.0) * math.cos(math.radians(30.0)))   # 0.8164966
ORTHO_SCALE = RES * math.sqrt(2.0) / 64.0
CAM_LOC = (12.2474, 12.2474, 10.0)
CAM_ROT = (60.0, 0.0, 135.0)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[argv.index("--out") + 1]) if "--out" in argv else "/tmp/artgen"
os.makedirs(OUT, exist_ok=True)

# ---- parts: primitives in footprint coords, z in height units ------------------------------
# box: c0/c1 corners + bevel width. cyl: vertical cylinder (rx, ry ellipse radii).
# hcyl: horizontal cylinder along fy (or fx with "axis": "x"). sphere: icosphere.
# Per-prim "ramp" overrides the part ramp (postpass reads it from the mask render). Per-prim
# "group" (ints >= 100) merges prims into one seam group — no interior line between them.
# Per-prim "seat": True marks the sittable surface — its top becomes the part's seatZ, which the
# seat gate checks the def's seatHeight against. Tag it on the cushion, not the frame.
# Per-prim "caps": False drops an hcyl's end spheres, leaving a bare cylinder — a record disc
# rather than a capsule.
# "proof_" ids are pipeline proofs: rendered and gated but never frozen into the catalog.
#
# A part with "surface": "wall" (#203) hangs instead of standing. It is authored against the wall
# plane at fy 0, extending into the room, and spans "w" wall segments along fx. Only two frames
# are rendered: dir 0 is the right wall, and three quarter turns carry the same mesh onto the left
# wall as dir 6 — the rotation that maps the plane fy=0 onto fx=0. Because the projection folds
# depth into screen width, a wall part must start at least its own depth along the wall
# (min fx >= max fy) or it overhangs the segment before it.
#
# A part with "spin" (#430) renders more than one state. Its prims tagged "spin": True turn about
# the declared axle by state * "step" degrees before the direction loop rotates them; every other
# prim stands still. That is the only way a part gets a second state frame — a state is the same
# object with a sub-assembly moved, so its footprint, height and seat surface cannot change and
# the def gates hold for every state at once.

PARTS = {
    "proof_armchair": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.14, 0.14, 0.00), "c1": (0.86, 0.86, 0.12), "bevel": 0.02},
            {"t": "box", "c0": (0.10, 0.10, 0.12), "c1": (0.90, 0.90, 0.44), "bevel": 0.04},
            {"t": "box", "c0": (0.08, 0.08, 0.44), "c1": (0.92, 0.92, 0.64), "bevel": 0.06,
             "ramp": "plum"},
            {"t": "cyl", "cx": 0.50, "cy": 0.84, "rx": 0.42, "ry": 0.14, "z0": 0.50, "z1": 1.25,
             "ramp": "plum"},
            {"t": "hcyl", "x": 0.13, "y0": 0.16, "y1": 0.88, "z": 0.74, "r": 0.09},
            {"t": "hcyl", "x": 0.87, "y0": 0.16, "y1": 0.88, "z": 0.74, "r": 0.09},
        ],
    },
    "proof_plant": {
        "w": 1, "l": 1, "ramp": "fern",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.28, "ry": 0.28, "z0": 0.0, "z1": 0.40,
             "taper": 0.68, "ramp": "sand"},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.05, "ry": 0.05, "z0": 0.40, "z1": 0.95},
            {"t": "sphere", "c": (0.50, 0.50, 1.12), "r": 0.30},
            {"t": "sphere", "c": (0.30, 0.42, 0.98), "r": 0.20},
            {"t": "sphere", "c": (0.68, 0.55, 1.00), "r": 0.22},
            {"t": "sphere", "c": (0.45, 0.68, 1.22), "r": 0.18},
            {"t": "sphere", "c": (0.58, 0.34, 1.28), "r": 0.16},
        ],
    },
    "proof_sofa": {
        "w": 2, "l": 1, "ramp": "plum",
        "prims": [
            {"t": "box", "c0": (0.12, 0.12, 0.00), "c1": (1.88, 0.88, 0.12), "bevel": 0.02},
            {"t": "box", "c0": (0.06, 0.06, 0.12), "c1": (1.94, 0.94, 0.40), "bevel": 0.04},
            {"t": "box", "c0": (0.20, 0.10, 0.40), "c1": (0.98, 0.90, 0.62), "bevel": 0.06,
             "ramp": "sand"},
            {"t": "box", "c0": (1.02, 0.10, 0.40), "c1": (1.80, 0.90, 0.62), "bevel": 0.06,
             "ramp": "sand"},
            {"t": "box", "c0": (0.16, 0.70, 0.40), "c1": (1.84, 0.96, 1.10), "bevel": 0.10},
            {"t": "box", "c0": (0.00, 0.06, 0.28), "c1": (0.16, 0.94, 0.86), "bevel": 0.07},
            {"t": "box", "c0": (1.84, 0.06, 0.28), "c1": (2.00, 0.94, 0.86), "bevel": 0.07},
        ],
    },
    # ---- casino set ----
    "casino_table": {
        "w": 2, "l": 2, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.22, 0.22, 0.00), "c1": (0.42, 0.42, 1.18)},
            {"t": "box", "c0": (1.58, 0.22, 0.00), "c1": (1.78, 0.42, 1.18)},
            {"t": "box", "c0": (0.22, 1.58, 0.00), "c1": (0.42, 1.78, 1.18)},
            {"t": "box", "c0": (1.58, 1.58, 0.00), "c1": (1.78, 1.78, 1.18)},
            {"t": "box", "c0": (0.18, 0.18, 1.06), "c1": (1.82, 1.82, 1.18)},
            {"t": "box", "c0": (0.10, 0.10, 1.18), "c1": (1.90, 1.90, 1.32), "bevel": 0.03,
             "ramp": "fern"},
            {"t": "hcyl", "x": 0.13, "y0": 0.13, "y1": 1.87, "z": 1.32, "r": 0.09, "group": 100},
            {"t": "hcyl", "x": 1.87, "y0": 0.13, "y1": 1.87, "z": 1.32, "r": 0.09, "group": 100},
            {"t": "hcyl", "x": 0.13, "y0": 0.13, "y1": 1.87, "z": 1.32, "r": 0.09, "axis": "x",
             "group": 100},
            {"t": "hcyl", "x": 1.87, "y0": 0.13, "y1": 1.87, "z": 1.32, "r": 0.09, "axis": "x",
             "group": 100},
            # Betting line (#259): an ivory slab on the baize with a fern slab set inside it,
            # leaving a ring — the inlay idiom on a horizontal face.
            # The apron below (z 1.06-1.18) was the first try and is the wrong surface: the baize
            # slab overhangs it by 0.08, so it is hidden from every direction. Trim only pays on a
            # face the camera can see.
            # maxZ stays 1.41 (the rails at 1.32 + r 0.09), so the def's stackHeights holds.
            {"t": "box", "c0": (0.34, 0.34, 1.32), "c1": (1.66, 1.66, 1.35), "ramp": "ivory"},
            {"t": "box", "c0": (0.40, 0.40, 1.33), "c1": (1.60, 1.60, 1.36), "ramp": "fern"},
        ],
    },
    "casino_stool": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.30, "ry": 0.30, "z0": 0.00, "z1": 0.06},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.09, "ry": 0.09, "z0": 0.06, "z1": 0.62},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.34, "ry": 0.34, "z0": 0.62, "z1": 0.82,
             "ramp": "crimson", "seat": True},
        ],
    },
    # ---- café set ----
    "cafe_table": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.26, "ry": 0.26, "z0": 0.00, "z1": 0.07,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.07, "ry": 0.07, "z0": 0.07, "z1": 0.92},
            # Gold rim (#259). One extra prim buys both the edge band and the ring around the
            # top: a wider gold disc with the ivory top standing 2px proud inside it. The two are
            # not coplanar — a shared top plane z-fights between separate objects.
            # maxZ stays 1.02; the def transcribes stackHeights from it and the footprint gate
            # checks that both ways for an artgen part.
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.44, "ry": 0.44, "z0": 0.92, "z1": 0.96,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.38, "ry": 0.38, "z0": 0.92, "z1": 1.02,
             "ramp": "ivory"},
        ],
    },
    "cafe_chair": {
        "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.28, 0.28, 0.00), "c1": (0.36, 0.36, 0.48)},
            {"t": "box", "c0": (0.64, 0.28, 0.00), "c1": (0.72, 0.36, 0.48)},
            {"t": "box", "c0": (0.28, 0.64, 0.00), "c1": (0.36, 0.72, 0.48)},
            {"t": "box", "c0": (0.64, 0.64, 0.00), "c1": (0.72, 0.72, 0.48)},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.32, "ry": 0.32, "z0": 0.48, "z1": 0.58,
             "seat": True},
            # Back uprights. They rise from INSIDE the seat slab (z0 below its 0.58 top) and stand
            # over it, so the back is visibly carried by the chair. They used to sit at cy 0.86 —
            # past the seat cylinder's rear edge at 0.82 — resting on nothing, and at r 0.035 they
            # were ~2 px wide, so the whole back read as a slab hovering beside a stool (#252).
            {"t": "cyl", "cx": 0.32, "cy": 0.76, "rx": 0.06, "ry": 0.06, "z0": 0.50, "z1": 1.00},
            {"t": "cyl", "cx": 0.68, "cy": 0.76, "rx": 0.06, "ry": 0.06, "z0": 0.50, "z1": 1.00},
            # Flush with the seat's rear edge, and overlapping the posts in z so the joint is solid.
            {"t": "box", "c0": (0.18, 0.70, 0.98), "c1": (0.82, 0.82, 1.22), "bevel": 0.05},
        ],
    },
    # Trim proof (#259): does a second ramp on a thin prim already carry "the fancy version"?
    # Three idioms at once — a flush band that splits the column and changes no silhouette, a
    # proud band that does, and an inlaid cap where an ivory disc leaves a gold rim.
    "proof_trim": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.18, 0.18, 0.00), "c1": (0.82, 0.82, 0.10), "ramp": "charcoal"},
            # flush band: same footprint as the column above and below it, 2px of gold
            {"t": "box", "c0": (0.30, 0.30, 0.10), "c1": (0.70, 0.70, 0.34)},
            {"t": "box", "c0": (0.30, 0.30, 0.34), "c1": (0.70, 0.70, 0.40), "ramp": "gold"},
            {"t": "box", "c0": (0.30, 0.30, 0.40), "c1": (0.70, 0.70, 0.62)},
            # proud band: 2 footprint-px wider, so it breaks the silhouette
            {"t": "box", "c0": (0.26, 0.26, 0.62), "c1": (0.74, 0.74, 0.68), "ramp": "gold"},
            {"t": "box", "c0": (0.30, 0.30, 0.68), "c1": (0.70, 0.70, 0.90)},
            # inlaid cap: the ivory disc sits inside the gold one, leaving a rim
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.40, "ry": 0.40, "z0": 0.90, "z1": 1.00,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.31, "ry": 0.31, "z0": 0.96, "z1": 1.03,
             "ramp": "ivory"},
        ],
    },
    # ---- remaining floor archetypes ----
    "bed_basic": {
        "w": 2, "l": 3, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.00, 0.00, 0.00), "c1": (2.00, 3.00, 0.22)},
            {"t": "box", "c0": (0.00, 2.82, 0.00), "c1": (2.00, 3.00, 0.95), "bevel": 0.04},
            {"t": "box", "c0": (0.08, 0.08, 0.22), "c1": (1.92, 2.86, 0.42), "bevel": 0.05,
             "ramp": "ivory"},
            {"t": "box", "c0": (0.06, 0.06, 0.40), "c1": (1.94, 1.95, 0.55), "bevel": 0.06,
             "ramp": "navy", "seat": True},
            {"t": "box", "c0": (0.18, 2.28, 0.42), "c1": (0.95, 2.72, 0.60), "bevel": 0.08,
             "ramp": "ivory"},
            {"t": "box", "c0": (1.05, 2.28, 0.42), "c1": (1.82, 2.72, 0.60), "bevel": 0.08,
             "ramp": "ivory"},
        ],
    },
    "lamp_basic": {
        "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.22, "ry": 0.22, "z0": 0.00, "z1": 0.08,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.045, "ry": 0.045, "z0": 0.08, "z1": 1.75},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.30, "ry": 0.30, "z0": 1.75, "z1": 2.20,
             "taper": 0.65, "ramp": "ivory"},
        ],
    },
    "shelf_basic": {
        "w": 2, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.00, 0.15, 0.00), "c1": (0.08, 0.85, 1.90)},
            {"t": "box", "c0": (1.92, 0.15, 0.00), "c1": (2.00, 0.85, 1.90)},
            {"t": "box", "c0": (0.00, 0.78, 0.00), "c1": (2.00, 0.86, 1.90), "group": 101},
            {"t": "box", "c0": (0.08, 0.15, 0.00), "c1": (1.92, 0.85, 0.08)},
            {"t": "box", "c0": (0.08, 0.15, 0.60), "c1": (1.92, 0.85, 0.68)},
            {"t": "box", "c0": (0.08, 0.15, 1.20), "c1": (1.92, 0.85, 1.28)},
            {"t": "box", "c0": (0.08, 0.15, 1.82), "c1": (1.92, 0.85, 1.90)},
            {"t": "box", "c0": (0.20, 0.25, 0.08), "c1": (0.45, 0.75, 0.52), "ramp": "navy"},
            {"t": "box", "c0": (0.50, 0.25, 0.08), "c1": (0.80, 0.75, 0.48), "ramp": "crimson"},
            {"t": "box", "c0": (0.95, 0.25, 0.68), "c1": (1.30, 0.75, 1.12), "ramp": "teal"},
            {"t": "box", "c0": (1.40, 0.25, 0.68), "c1": (1.60, 0.75, 1.05), "ramp": "gold"},
            {"t": "box", "c0": (0.30, 0.25, 1.28), "c1": (0.60, 0.75, 1.74), "ramp": "plum"},
        ],
    },
    "divider_basic": {
        "w": 2, "l": 1, "ramp": "slate",
        "prims": [
            # The plainest part in the catalog was two prims. A flush gold rail across the open
            # field of the panel (#259) costs one more. Mid-height, not under the cap: at 0.74 it
            # sat in the cap's overhang shadow and read as an outline rather than as metal.
            {"t": "box", "c0": (0.00, 0.30, 0.00), "c1": (2.00, 0.70, 0.42)},
            {"t": "box", "c0": (0.00, 0.30, 0.42), "c1": (2.00, 0.70, 0.50), "ramp": "gold"},
            {"t": "box", "c0": (0.00, 0.30, 0.50), "c1": (2.00, 0.70, 0.92)},
            {"t": "box", "c0": (0.00, 0.26, 0.92), "c1": (2.00, 0.74, 1.04), "bevel": 0.03,
             "ramp": "walnut"},
        ],
    },
    # ---- casino floor and resort lounge ----
    # Fronts face low fy, matching the shelf's back panel and the stereo's speaker cones.
    "slot_machine": {
        "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.14, 0.18, 0.00), "c1": (0.86, 0.86, 0.30),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.10, 0.16, 0.30), "c1": (0.90, 0.88, 1.55), "bevel": 0.04},
            {"t": "box", "c0": (0.18, 0.10, 0.72), "c1": (0.82, 0.18, 1.24), "ramp": "ivory"},
            {"t": "box", "c0": (0.20, 0.08, 0.38), "c1": (0.80, 0.18, 0.50), "ramp": "gold"},
            {"t": "box", "c0": (0.12, 0.18, 1.55), "c1": (0.88, 0.86, 1.78), "bevel": 0.05,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.50, "cy": 0.52, "rx": 0.16, "ry": 0.16, "z0": 1.78, "z1": 1.98,
             "taper": 0.60, "ramp": "ivory"},
            {"t": "cyl", "cx": 0.92, "cy": 0.50, "rx": 0.03, "ry": 0.03, "z0": 1.10, "z1": 1.55,
             "ramp": "slate"},
            {"t": "sphere", "c": (0.92, 0.50, 1.60), "r": 0.07},
        ],
    },
    "bar_counter": {
        "w": 2, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.10, 0.30, 0.00), "c1": (1.90, 0.85, 1.05)},
            {"t": "box", "c0": (0.06, 0.24, 0.18), "c1": (1.94, 0.30, 0.95),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.00, 0.18, 1.05), "c1": (2.00, 0.95, 1.16), "bevel": 0.03,
             "ramp": "ivory"},
            # A second brass rail under the counter top (#259), mirroring the foot rail below.
            # A curved prim, not a flush band: gold on walnut only reads when the accent catches
            # the sun band, and a flat band on the body's own vertical face shares walnut's luma
            # bucket. A first pass as a proud box at z 0.97 was buried by the top's overhang.
            {"t": "hcyl", "x": 0.22, "y0": 0.12, "y1": 1.88, "z": 0.16, "r": 0.05, "axis": "x",
             "ramp": "gold"},
            {"t": "hcyl", "x": 0.22, "y0": 0.12, "y1": 1.88, "z": 0.96, "r": 0.05, "axis": "x",
             "ramp": "gold"},
        ],
    },
    "arcade_cabinet": {
        "w": 1, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.14, 0.20, 0.00), "c1": (0.86, 0.84, 1.62), "bevel": 0.03},
            {"t": "box", "c0": (0.20, 0.14, 0.92), "c1": (0.80, 0.22, 1.34),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.24, 0.12, 0.98), "c1": (0.76, 0.16, 1.28), "ramp": "teal"},
            {"t": "box", "c0": (0.18, 0.10, 0.72), "c1": (0.82, 0.28, 0.84), "bevel": 0.02,
             "ramp": "crimson"},
            {"t": "cyl", "cx": 0.36, "cy": 0.19, "rx": 0.03, "ry": 0.03, "z0": 0.84, "z1": 0.96,
             "ramp": "slate"},
            {"t": "sphere", "c": (0.36, 0.19, 0.99), "r": 0.06, "ramp": "crimson"},
            {"t": "cyl", "cx": 0.60, "cy": 0.19, "rx": 0.05, "ry": 0.05, "z0": 0.84, "z1": 0.88,
             "ramp": "gold"},
            {"t": "box", "c0": (0.16, 0.18, 1.62), "c1": (0.84, 0.86, 1.86), "bevel": 0.04,
             "ramp": "gold"},
        ],
    },
    "fountain": {
        "w": 2, "l": 2, "ramp": "slate",
        "prims": [
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.92, "ry": 0.92, "z0": 0.00, "z1": 0.28},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.78, "ry": 0.78, "z0": 0.24, "z1": 0.30,
             "ramp": "teal"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.20, "ry": 0.20, "z0": 0.30, "z1": 0.88,
             "taper": 0.75, "ramp": "ivory"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.46, "ry": 0.46, "z0": 0.88, "z1": 1.06,
             "taper": 1.35, "ramp": "ivory"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.42, "ry": 0.42, "z0": 1.02, "z1": 1.08,
             "ramp": "teal"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.07, "ry": 0.07, "z0": 1.08, "z1": 1.44,
             "taper": 0.50, "ramp": "teal"},
            {"t": "sphere", "c": (1.00, 1.00, 1.52), "r": 0.16, "ramp": "ivory"},
        ],
    },
    # ---- lodge set (#314) ----
    # The catalog had one seat archetype per room and no soft furniture at all. These six are the
    # lodge: upholstery, a hearth, greenery and a divider that is not a wall.
    # Wood is walnut throughout so the set reads as one room, and every upholstery ramp carries its
    # colorways — walnut against crimson, navy or fern differs in hue, not only in luma, which is
    # the gold-on-walnut trap the other way round.
    "armchair_lounge": {
        "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.14, 0.14, 0.00), "c1": (0.28, 0.28, 0.15), "ramp": "walnut"},
            {"t": "box", "c0": (0.72, 0.14, 0.00), "c1": (0.86, 0.28, 0.15), "ramp": "walnut"},
            {"t": "box", "c0": (0.14, 0.72, 0.00), "c1": (0.28, 0.86, 0.15), "ramp": "walnut"},
            {"t": "box", "c0": (0.72, 0.72, 0.00), "c1": (0.86, 0.86, 0.15), "ramp": "walnut"},
            {"t": "box", "c0": (0.10, 0.10, 0.15), "c1": (0.90, 0.90, 0.84), "bevel": 0.04},
            {"t": "box", "c0": (0.16, 0.12, 0.80), "c1": (0.84, 0.78, 1.00), "bevel": 0.06,
             "seat": True},
            {"t": "box", "c0": (0.06, 0.08, 0.84), "c1": (0.24, 0.76, 1.28), "bevel": 0.05},
            {"t": "box", "c0": (0.76, 0.08, 0.84), "c1": (0.94, 0.76, 1.28), "bevel": 0.05},
            # Rolled arms in wood, curved on purpose: a flush walnut band on a crimson face shares
            # its luma bucket, but an hcyl crests into `hi` (the bar_counter rail lesson).
            {"t": "hcyl", "x": 0.15, "y0": 0.12, "y1": 0.74, "z": 1.28, "r": 0.09,
             "ramp": "walnut"},
            {"t": "hcyl", "x": 0.85, "y0": 0.12, "y1": 0.74, "z": 1.28, "r": 0.09,
             "ramp": "walnut"},
            {"t": "box", "c0": (0.08, 0.72, 0.84), "c1": (0.92, 0.94, 1.66), "bevel": 0.06},
            {"t": "box", "c0": (0.05, 0.69, 1.66), "c1": (0.95, 0.97, 1.75), "bevel": 0.03,
             "ramp": "walnut"},
        ],
    },
    "sofa_lodge": {
        "w": 2, "l": 1, "ramp": "fern",
        "prims": [
            {"t": "box", "c0": (0.10, 0.12, 0.00), "c1": (0.24, 0.26, 0.16), "ramp": "walnut"},
            {"t": "box", "c0": (1.76, 0.12, 0.00), "c1": (1.90, 0.26, 0.16), "ramp": "walnut"},
            {"t": "box", "c0": (0.10, 0.72, 0.00), "c1": (0.24, 0.86, 0.16), "ramp": "walnut"},
            {"t": "box", "c0": (1.76, 0.72, 0.00), "c1": (1.90, 0.86, 0.16), "ramp": "walnut"},
            {"t": "box", "c0": (0.08, 0.10, 0.16), "c1": (1.92, 0.90, 0.84), "bevel": 0.04},
            # One seat slab across both tiles, like bed_basic. Two tagged cushions would put the
            # near/far split at the LEFT cushion's centroid and cut the sofa in half off-centre.
            {"t": "box", "c0": (0.20, 0.12, 0.80), "c1": (1.80, 0.78, 1.00), "bevel": 0.06,
             "seat": True},
            {"t": "box", "c0": (0.02, 0.08, 0.84), "c1": (0.20, 0.76, 1.30), "bevel": 0.05},
            {"t": "box", "c0": (1.80, 0.08, 0.84), "c1": (1.98, 0.76, 1.30), "bevel": 0.05},
            {"t": "hcyl", "x": 0.11, "y0": 0.12, "y1": 0.72, "z": 1.30, "r": 0.09,
             "ramp": "walnut"},
            {"t": "hcyl", "x": 1.89, "y0": 0.12, "y1": 0.72, "z": 1.30, "r": 0.09,
             "ramp": "walnut"},
            {"t": "box", "c0": (0.06, 0.72, 0.84), "c1": (1.94, 0.94, 1.90), "bevel": 0.06},
            # Two back cushions carry the two-seat read the seat slab gave up.
            {"t": "box", "c0": (0.22, 0.66, 1.02), "c1": (0.96, 0.76, 1.72), "bevel": 0.05,
             "ramp": "sand"},
            {"t": "box", "c0": (1.04, 0.66, 1.02), "c1": (1.78, 0.76, 1.72), "bevel": 0.05,
             "ramp": "sand"},
            {"t": "box", "c0": (0.03, 0.69, 1.90), "c1": (1.97, 0.97, 2.00), "bevel": 0.03,
             "ramp": "walnut"},
        ],
    },
    "table_round": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.36, "ry": 0.36, "z0": 0.00, "z1": 0.08},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.28, "ry": 0.28, "z0": 0.08, "z1": 0.18,
             "taper": 0.55},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.08, "ry": 0.08, "z0": 0.18, "z1": 1.30},
            {"t": "sphere", "c": (0.50, 0.50, 0.72), "r": 0.13},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.22, "ry": 0.22, "z0": 1.24, "z1": 1.38,
             "taper": 1.60},
            # Inlaid top: the walnut disc is wider, the ivory one stands proud inside it, and the
            # two are not coplanar — separate objects sharing a plane z-fight.
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.46, "ry": 0.46, "z0": 1.38, "z1": 1.44},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.40, "ry": 0.40, "z0": 1.42, "z1": 1.50,
             "ramp": "ivory"},
        ],
    },
    "plant_fern": {
        "w": 1, "l": 1, "ramp": "fern",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.26, "ry": 0.26, "z0": 0.00, "z1": 0.40,
             "taper": 1.30, "ramp": "sand"},
            # Proud band, not flush: the rim is wider than the pot's lip so it breaks the
            # silhouette, and charcoal on sand differs in base colour, not only in shade.
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.33, "ry": 0.33, "z0": 0.40, "z1": 0.46,
             "ramp": "charcoal"},
            # Tapered blades, not spheres. A sphere cluster is a shrub — it was one, and it read as
            # one. The fern is in the silhouette: five spires of different heights over a low leaf
            # mass, which also covers the rim's top face so the pot reads as a band, not a lid.
            {"t": "sphere", "c": (0.50, 0.50, 0.60), "r": 0.26},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.13, "ry": 0.13, "z0": 0.52, "z1": 1.52,
             "taper": 0.16},
            {"t": "cyl", "cx": 0.30, "cy": 0.42, "rx": 0.11, "ry": 0.11, "z0": 0.52, "z1": 1.22,
             "taper": 0.18},
            {"t": "cyl", "cx": 0.70, "cy": 0.58, "rx": 0.11, "ry": 0.11, "z0": 0.52, "z1": 1.30,
             "taper": 0.18},
            {"t": "cyl", "cx": 0.42, "cy": 0.70, "rx": 0.10, "ry": 0.10, "z0": 0.52, "z1": 1.12,
             "taper": 0.18},
            {"t": "cyl", "cx": 0.61, "cy": 0.31, "rx": 0.10, "ry": 0.10, "z0": 0.52, "z1": 1.06,
             "taper": 0.18},
            # Two fronds arching clear of the spires. hcyl runs along one footprint axis only, so a
            # fern's real arc is out of reach; what these buy is a silhouette that breaks sideways.
            {"t": "hcyl", "x": 0.50, "y0": 0.08, "y1": 0.92, "z": 0.82, "r": 0.05},
            {"t": "hcyl", "x": 0.50, "y0": 0.08, "y1": 0.92, "z": 0.96, "r": 0.05, "axis": "x"},
        ],
    },
    # The lodge centrepiece. No animation — the fire is trim prims, so it is one frozen sheet like
    # everything else. The firebox opens toward low fy with the rest of the catalog, which puts it
    # camera-facing at dirs 2 and 4 and behind its own masonry at 0 and 6.
    "fireplace": {
        "w": 2, "l": 1, "ramp": "slate",
        "prims": [
            {"t": "box", "c0": (0.00, 0.04, 0.00), "c1": (2.00, 0.94, 0.16), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.00, 0.30, 0.16), "c1": (0.48, 0.92, 2.36)},
            {"t": "box", "c0": (1.52, 0.30, 0.16), "c1": (2.00, 0.92, 2.36)},
            {"t": "box", "c0": (0.48, 0.68, 0.16), "c1": (1.52, 0.92, 2.36)},
            {"t": "box", "c0": (0.48, 0.62, 0.16), "c1": (1.52, 0.70, 1.44), "ramp": "charcoal"},
            {"t": "box", "c0": (0.00, 0.26, 1.44), "c1": (2.00, 0.82, 1.62), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.48, 0.32, 1.62), "c1": (1.52, 0.72, 2.36)},
            {"t": "box", "c0": (0.86, 0.22, 1.62), "c1": (1.14, 0.84, 1.96), "ramp": "sand"},
            {"t": "box", "c0": (0.00, 0.20, 2.36), "c1": (2.00, 0.98, 2.50), "bevel": 0.03,
             "ramp": "walnut"},
            {"t": "hcyl", "x": 0.46, "y0": 0.62, "y1": 1.38, "z": 0.25, "r": 0.075, "axis": "x",
             "ramp": "walnut"},
            {"t": "hcyl", "x": 0.52, "y0": 0.66, "y1": 1.34, "z": 0.37, "r": 0.065, "axis": "x",
             "ramp": "walnut"},
            {"t": "cyl", "cx": 0.82, "cy": 0.46, "rx": 0.13, "ry": 0.09, "z0": 0.30, "z1": 0.80,
             "taper": 0.18, "ramp": "crimson"},
            {"t": "cyl", "cx": 1.18, "cy": 0.48, "rx": 0.12, "ry": 0.085, "z0": 0.30, "z1": 0.72,
             "taper": 0.18, "ramp": "crimson"},
            {"t": "cyl", "cx": 1.00, "cy": 0.44, "rx": 0.15, "ry": 0.10, "z0": 0.30, "z1": 0.96,
             "taper": 0.14, "ramp": "gold"},
        ],
    },
    # A straight segment only: players rotate for corners, and a corner mesh would be a second
    # archetype rather than a slot variant. The rails run edge to edge with `caps` off so two
    # segments meet without a bulge at the join.
    "railing": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.02, 0.40, 0.00), "c1": (0.18, 0.60, 0.92), "bevel": 0.02},
            {"t": "box", "c0": (0.82, 0.40, 0.00), "c1": (0.98, 0.60, 0.92), "bevel": 0.02},
            {"t": "box", "c0": (0.00, 0.37, 0.92), "c1": (0.20, 0.63, 1.00), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.80, 0.37, 0.92), "c1": (1.00, 0.63, 1.00), "bevel": 0.02,
             "ramp": "charcoal"},
            # The rails have to stand PROUD of the balusters in fy, both ways. At r 0.055 against
            # 0.43-0.57 balusters they sat inside the pickets and showed only as specks in the
            # gaps — the same occlusion trap as casino_table's overhung apron, one axis over.
            # Proud symmetrically, or two quarter turns bury them again.
            {"t": "hcyl", "x": 0.50, "y0": 0.00, "y1": 1.00, "z": 0.80, "r": 0.08, "axis": "x",
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.00, "y1": 1.00, "z": 0.44, "r": 0.07, "axis": "x",
             "caps": False},
            {"t": "box", "c0": (0.34, 0.46, 0.04), "c1": (0.43, 0.54, 0.86)},
            {"t": "box", "c0": (0.57, 0.46, 0.04), "c1": (0.66, 0.54, 0.86)},
        ],
    },
    # ---- lodge round 2 (#323) ----
    # The floor half of the wall-clutter pass: a rug to stand the set on, a stool that is not the
    # casino pedestal, and a side table short enough to put beside the armchair.
    #
    # A rug is the only walkable part in the 3D-assisted catalog, so it is authored as three
    # stacked slabs rather than one — trim by prim on a horizontal face, which is the surface a
    # rug is entirely made of. Each slab stands proud of the one under it; coplanar slabs z-fight.
    # 0.0625 is two whole z-pixels, so drawnHeight lands exactly on the declared stackHeights.
    "rug_lodge": {
        "w": 2, "l": 2, "ramp": "crimson",
        "prims": [
            # Fringe field and its ticks share a seam group: they are one piece of wool, and a
            # detail line around every tick would eat a 4 px nub.
            {"t": "box", "c0": (0.00, 0.00, 0.000), "c1": (2.00, 2.00, 0.030),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (0.16, 0.16, 0.030), "c1": (1.84, 1.84, 0.048), "ramp": "sand"},
            {"t": "box", "c0": (0.34, 0.34, 0.048), "c1": (1.66, 1.66, 0.0625)},
            # Fringe ticks: walnut nubs run inward across the sand border on two ends. They stand
            # 0.008 proud of the border rather than flush with it — the slabs are 0.6 px apart and
            # a shared plane between separate objects z-fights.
            {"t": "box", "c0": (0.24, 0.16, 0.030), "c1": (0.36, 0.30, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (0.52, 0.16, 0.030), "c1": (0.64, 0.30, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (0.80, 0.16, 0.030), "c1": (0.92, 0.30, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (1.08, 0.16, 0.030), "c1": (1.20, 0.30, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (1.36, 0.16, 0.030), "c1": (1.48, 0.30, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (1.64, 0.16, 0.030), "c1": (1.76, 0.30, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (0.24, 1.70, 0.030), "c1": (0.36, 1.84, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (0.52, 1.70, 0.030), "c1": (0.64, 1.84, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (0.80, 1.70, 0.030), "c1": (0.92, 1.84, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (1.08, 1.70, 0.030), "c1": (1.20, 1.84, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (1.36, 1.70, 0.030), "c1": (1.48, 1.84, 0.056),
             "ramp": "walnut", "group": 100},
            {"t": "box", "c0": (1.64, 1.70, 0.030), "c1": (1.76, 1.84, 0.056),
             "ramp": "walnut", "group": 100},
        ],
    },
    # Seat 0.82 like casino_stool, and deliberately nothing else like it: four posts and rungs
    # instead of a pedestal disc, so the two differ in silhouette rather than only in palette.
    "stool_lodge": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.16, 0.16, 0.00), "c1": (0.27, 0.27, 0.72)},
            {"t": "box", "c0": (0.73, 0.16, 0.00), "c1": (0.84, 0.27, 0.72)},
            {"t": "box", "c0": (0.16, 0.73, 0.00), "c1": (0.27, 0.84, 0.72)},
            {"t": "box", "c0": (0.73, 0.73, 0.00), "c1": (0.84, 0.84, 0.72)},
            # Foot rungs on all four sides, proud of the posts. Two rungs would be buried by the
            # posts after a quarter turn — the railing lesson.
            {"t": "hcyl", "x": 0.215, "y0": 0.16, "y1": 0.84, "z": 0.26, "r": 0.035,
             "caps": False},
            {"t": "hcyl", "x": 0.785, "y0": 0.16, "y1": 0.84, "z": 0.26, "r": 0.035,
             "caps": False},
            {"t": "hcyl", "x": 0.215, "y0": 0.16, "y1": 0.84, "z": 0.26, "r": 0.035,
             "axis": "x", "caps": False},
            {"t": "hcyl", "x": 0.785, "y0": 0.16, "y1": 0.84, "z": 0.26, "r": 0.035,
             "axis": "x", "caps": False},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.36, "ry": 0.36, "z0": 0.72, "z1": 0.78},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.31, "ry": 0.31, "z0": 0.76, "z1": 0.82,
             "ramp": "sand", "seat": True},
        ],
    },
    # Square and low, where cafe_table and table_round are both round pedestals.
    "side_table": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.16, 0.16, 0.00), "c1": (0.26, 0.26, 0.68)},
            {"t": "box", "c0": (0.74, 0.16, 0.00), "c1": (0.84, 0.26, 0.68)},
            {"t": "box", "c0": (0.16, 0.74, 0.00), "c1": (0.26, 0.84, 0.68)},
            {"t": "box", "c0": (0.74, 0.74, 0.00), "c1": (0.84, 0.84, 0.68)},
            {"t": "box", "c0": (0.20, 0.20, 0.26), "c1": (0.80, 0.80, 0.32), "ramp": "sand"},
            # Inlaid top: the charcoal band is wider and the walnut top stands proud inside it,
            # leaving a rim. Charcoal, not ivory — an ivory rim above a sand shelf gave the part
            # two pale accents of nearly the same value and no hierarchy, and the dark band frames
            # the top's clamped orange instead of competing with it. The colorway has to move it
            # (charcoal -> walnut): charcoal and slate are both desaturated blue-greys 23 luma
            # apart, which is the gold-on-walnut trap in the other corner of the palette.
            {"t": "box", "c0": (0.03, 0.03, 0.68), "c1": (0.97, 0.97, 0.71), "ramp": "charcoal"},
            {"t": "box", "c0": (0.11, 0.11, 0.69), "c1": (0.89, 0.89, 0.75), "bevel": 0.02},
        ],
    },
    # ---- amenities (#327) ----
    # A drinks machine and a hand basin. Both are 1x1 and both keep the catalog's front-at-low-fy
    # convention, so they read camera-facing at dirs 2 and 4 with the rest of the set.
    "vending_machine": {
        "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.08, 0.10, 0.00), "c1": (0.92, 0.92, 0.16), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.12, 0.14, 0.16), "c1": (0.88, 0.88, 1.84), "bevel": 0.04},
            # Dispense tray on a gold lip. A box cannot be subtracted from another, so the opening
            # is a charcoal panel standing proud — the slot_machine screen idiom. It sits at 0.40
            # rather than on the plinth: charcoal on charcoal left the two as one dark mass with a
            # seam line through it, and the slot stopped reading as a slot.
            {"t": "box", "c0": (0.18, 0.02, 0.36), "c1": (0.82, 0.18, 0.44), "ramp": "gold"},
            {"t": "box", "c0": (0.20, 0.04, 0.40), "c1": (0.80, 0.18, 0.68), "ramp": "charcoal"},
            # Display window: a charcoal frame proud of the body, an ivory pane proud of that, four
            # cans proud of the pane. Every step is 0.03-0.04 — about a pixel, and enough that no
            # two separate objects share a plane.
            {"t": "box", "c0": (0.14, 0.07, 0.78), "c1": (0.60, 0.18, 1.72), "ramp": "charcoal"},
            {"t": "box", "c0": (0.18, 0.04, 0.84), "c1": (0.56, 0.10, 1.66), "ramp": "ivory"},
            {"t": "box", "c0": (0.20, 0.00, 1.30), "c1": (0.33, 0.06, 1.60), "ramp": "crimson"},
            {"t": "box", "c0": (0.40, 0.00, 1.30), "c1": (0.53, 0.06, 1.60), "ramp": "gold"},
            {"t": "box", "c0": (0.20, 0.00, 0.94), "c1": (0.33, 0.06, 1.24), "ramp": "fern"},
            {"t": "box", "c0": (0.40, 0.00, 0.94), "c1": (0.53, 0.06, 1.24), "ramp": "plum"},
            # Selection panel beside the window, not under it: the front face is ~24 px wide at 64,
            # so a keypad stacked below the glass would have nothing left to stand in.
            {"t": "box", "c0": (0.64, 0.06, 1.02), "c1": (0.86, 0.18, 1.64), "ramp": "charcoal"},
            {"t": "box", "c0": (0.68, 0.02, 1.42), "c1": (0.82, 0.08, 1.52), "ramp": "gold"},
            {"t": "box", "c0": (0.68, 0.02, 1.22), "c1": (0.82, 0.08, 1.32), "ramp": "gold"},
            {"t": "box", "c0": (0.09, 0.11, 1.84), "c1": (0.91, 0.91, 2.00), "bevel": 0.04,
             "ramp": "gold"},
            {"t": "box", "c0": (0.16, 0.07, 1.87), "c1": (0.84, 0.14, 1.97), "ramp": "crimson"},
        ],
    },
    "sink_basic": {
        "w": 1, "l": 1, "ramp": "ivory",
        "prims": [
            # A rectangular basin, not a round bowl. Two rounds of cylinders — a wide dish, then a
            # slim stem under a narrower one — both read as a birdbath, because at 64 px a circular
            # bowl on a stalk IS a birdbath. What separates the two objects is the upstand at the
            # back and a squared-off slab, so the geometry went where the difference is.
            {"t": "box", "c0": (0.28, 0.30, 0.00), "c1": (0.72, 0.72, 0.07), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.34, 0.36, 0.07), "c1": (0.66, 0.68, 0.58), "bevel": 0.04},
            {"t": "box", "c0": (0.08, 0.14, 0.54), "c1": (0.92, 0.88, 0.76), "bevel": 0.07},
            # Water inside the rim, the fountain's idiom: a smaller slab standing proud of the
            # porcelain, because separate objects sharing a plane z-fight.
            {"t": "box", "c0": (0.21, 0.27, 0.72), "c1": (0.79, 0.76, 0.79), "bevel": 0.05,
             "ramp": "teal"},
            {"t": "box", "c0": (0.14, 0.74, 0.72), "c1": (0.86, 0.90, 0.98), "bevel": 0.03},
            # The spout comes out of the upstand rather than standing on a stem. A stem tall enough
            # to read is 4 px the height budget does not have, and level with the levers it was
            # three gold blobs in a row.
            {"t": "hcyl", "x": 0.50, "y0": 0.56, "y1": 0.78, "z": 0.90, "r": 0.05, "ramp": "gold"},
            {"t": "box", "c0": (0.22, 0.68, 0.80), "c1": (0.34, 0.76, 0.90), "ramp": "gold"},
            {"t": "box", "c0": (0.66, 0.68, 0.80), "c1": (0.78, 0.76, 0.90), "ramp": "gold"},
        ],
    },
    # ---- pool & spa deck (#357) ----
    # The resort half of a casino resort, which the catalog had none of. Teal water and canvas,
    # sand timber, ivory paint, crimson for the one hot accent per part — the same discipline the
    # lodge uses with walnut, read for a poolside instead of a fireside.
    #
    # Every part here is authored front-to-low-fy like the rest of the catalog, so a lounger's
    # headrest and a cabana's open side both face the camera after two quarter turns.
    "sun_lounger": {
        "w": 1, "l": 2, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.16, 0.14, 0.00), "c1": (0.32, 0.30, 0.32), "ramp": "charcoal"},
            {"t": "box", "c0": (0.68, 0.14, 0.00), "c1": (0.84, 0.30, 0.32), "ramp": "charcoal"},
            {"t": "box", "c0": (0.16, 1.70, 0.00), "c1": (0.32, 1.86, 0.32), "ramp": "charcoal"},
            {"t": "box", "c0": (0.68, 1.70, 0.00), "c1": (0.84, 1.86, 0.32), "ramp": "charcoal"},
            {"t": "box", "c0": (0.10, 0.06, 0.32), "c1": (0.90, 1.94, 0.44), "bevel": 0.03,
             "ramp": "ivory"},
            {"t": "box", "c0": (0.14, 0.12, 0.44), "c1": (0.86, 1.24, 0.58), "bevel": 0.05,
             "seat": True},
            # The back is two courses, not one: a single tall slab reads as a wall behind the
            # cushion, and there is no tapered box to lay one back with. Two steps of different
            # height put a stair in the silhouette, which is what says "reclined" at this size.
            {"t": "box", "c0": (0.14, 1.24, 0.44), "c1": (0.86, 1.52, 0.78), "bevel": 0.05},
            {"t": "box", "c0": (0.14, 1.52, 0.44), "c1": (0.86, 1.80, 1.06), "bevel": 0.05},
            {"t": "box", "c0": (0.26, 1.56, 1.06), "c1": (0.74, 1.78, 1.16), "bevel": 0.04,
             "ramp": "crimson"},
            # Side rails proud of the frame slab in fy, both sides — the railing lesson. At fx 0.08
            # against a 0.10..0.90 slab they break the silhouette instead of hiding inside it.
            {"t": "hcyl", "x": 0.08, "y0": 0.06, "y1": 1.94, "z": 0.46, "r": 0.06,
             "caps": False, "ramp": "ivory"},
            {"t": "hcyl", "x": 0.92, "y0": 0.06, "y1": 1.94, "z": 0.46, "r": 0.06,
             "caps": False, "ramp": "ivory"},
        ],
    },
    # Two gates shape this part and they pull opposite ways.
    #
    # gateBounds wants the lowest pixel within half a tile of the ground line in all four
    # directions, and the canopy is the widest thing here but sits 2 units up, so it contributes
    # nothing low. A centre pedestal reaches fx+fy 2.6 against a 2.94 requirement and floats. A
    # cross base spanning the footprint reaches 3.12 and does not.
    #
    # The other one is not a gate at all, and cost the first version of this part: the furni loop
    # renders with shadows ON (rig.py only turns them off further down, for figures), and a canopy
    # over a wide table casts onto it. At an 0.86 top the shadow covered most of the disc and left
    # a lit crescent, which quantizes to a hard grey half-moon and reads as a mistake. Nothing in
    # the catalog had ever overhung anything, so nothing had ever shown it. The fix is geometric:
    # the top is small enough (0.56 against a 0.93 hem) to sit ENTIRELY in the shadow, so it reads
    # as a table in the shade, and the base is charcoal, whose lit and shaded shades are close
    # enough that the shadow line crossing it does not register.
    "parasol_table": {
        "w": 2, "l": 2, "ramp": "sand",
        "prims": [
            {"t": "box", "c0": (0.06, 0.82, 0.00), "c1": (1.94, 1.18, 0.10), "ramp": "charcoal"},
            {"t": "box", "c0": (0.82, 0.06, 0.00), "c1": (1.18, 1.94, 0.10), "ramp": "charcoal"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.24, "ry": 0.24, "z0": 0.10, "z1": 0.20,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.07, "ry": 0.07, "z0": 0.20, "z1": 0.86,
             "ramp": "charcoal"},
            # Inlaid top, the cafe_table idiom: the teal rim disc is wider and the sand top stands
            # proud inside it. Not coplanar — separate objects sharing a plane z-fight.
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.60, "ry": 0.60, "z0": 0.84, "z1": 0.89,
             "ramp": "teal"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.56, "ry": 0.56, "z0": 0.86, "z1": 0.94},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.05, "ry": 0.05, "z0": 0.94, "z1": 2.00},
            # Three cone courses, not one: an umbrella's profile breaks on the way down and a
            # single taper reads as a funnel. rx is the MID radius and the taper factor swings
            # +/- half of it, so tier one measures 0.93 at its hem — just inside the 2x2 frame,
            # which crops rather than draws.
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.82, "ry": 0.82, "z0": 2.00, "z1": 2.12,
             "taper": 0.72, "ramp": "crimson"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.58, "ry": 0.58, "z0": 2.12, "z1": 2.24,
             "taper": 0.62, "ramp": "crimson"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.36, "ry": 0.36, "z0": 2.24, "z1": 2.36,
             "taper": 0.45, "ramp": "crimson"},
            {"t": "sphere", "c": (1.00, 1.00, 2.43), "r": 0.07, "ramp": "gold"},
        ],
    },
    # Posts outside the curtains and curtains inset off the roof line, or this is a shed. The first
    # pass ran three full-height panels flush to the footprint under a flush lid and rendered as
    # exactly that — a teal cube. What separates a cabana from a hut is that you can see the frame
    # holding the cloth: corner poles standing proud, a pelmet band the cloth hangs from, and the
    # roof overhanging both.
    "cabana": {
        "w": 2, "l": 2, "ramp": "ivory",
        "prims": [
            {"t": "cyl", "cx": 0.11, "cy": 0.11, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 2.30,
             "ramp": "sand"},
            {"t": "cyl", "cx": 1.89, "cy": 0.11, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 2.30,
             "ramp": "sand"},
            {"t": "cyl", "cx": 0.11, "cy": 1.89, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 2.30,
             "ramp": "sand"},
            {"t": "cyl", "cx": 1.89, "cy": 1.89, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 2.30,
             "ramp": "sand"},
            {"t": "box", "c0": (0.22, 0.22, 0.00), "c1": (1.78, 1.78, 0.05), "ramp": "sand"},
            {"t": "box", "c0": (0.20, 1.66, 0.06), "c1": (1.80, 1.80, 2.10), "ramp": "teal"},
            {"t": "box", "c0": (0.20, 0.20, 0.06), "c1": (0.34, 1.70, 2.10), "ramp": "teal"},
            {"t": "box", "c0": (1.66, 0.20, 0.06), "c1": (1.80, 1.70, 2.10), "ramp": "teal"},
            # Gathered curtains at the open corners, tied back with a gold band. Three flat panels
            # and a lid is a tent; the two drums are what make it a cabana in silhouette.
            {"t": "cyl", "cx": 0.34, "cy": 0.32, "rx": 0.15, "ry": 0.15, "z0": 0.20, "z1": 1.96,
             "taper": 0.88, "ramp": "teal"},
            {"t": "cyl", "cx": 1.66, "cy": 0.32, "rx": 0.15, "ry": 0.15, "z0": 0.20, "z1": 1.96,
             "taper": 0.88, "ramp": "teal"},
            {"t": "cyl", "cx": 0.34, "cy": 0.32, "rx": 0.18, "ry": 0.18, "z0": 1.02, "z1": 1.10,
             "ramp": "gold"},
            {"t": "cyl", "cx": 1.66, "cy": 0.32, "rx": 0.18, "ry": 0.18, "z0": 1.02, "z1": 1.10,
             "ramp": "gold"},
            # Pelmet all the way round, not a valance on the open side only: the first pass hung
            # one at the front and the roof's own overhang hid it from every direction.
            {"t": "box", "c0": (0.06, 0.06, 2.10), "c1": (1.94, 1.94, 2.22), "ramp": "crimson"},
            # Roof flush to the footprint at exactly 2.00: an overhang projects outside the frame,
            # which the post-pass crops rather than draws. It overhangs the CURTAINS instead.
            {"t": "box", "c0": (0.00, 0.00, 2.22), "c1": (2.00, 2.00, 2.36), "bevel": 0.03},
            {"t": "box", "c0": (0.06, 0.06, 2.36), "c1": (1.94, 1.94, 2.50), "bevel": 0.03,
             "ramp": "crimson"},
        ],
    },
    # `wash` off the def (#347) and no new server code: the rail broadcasts an action and the
    # client plays the splash, which is the same thing a tub wants that a basin does.
    "hot_tub": {
        "w": 2, "l": 2, "ramp": "teal",
        "prims": [
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.94, "ry": 0.94, "z0": 0.00, "z1": 0.56,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.98, "ry": 0.98, "z0": 0.50, "z1": 0.60,
             "ramp": "sand"},
            {"t": "cyl", "cx": 1.00, "cy": 1.00, "rx": 0.84, "ry": 0.84, "z0": 0.56, "z1": 0.62},
            # Domes on the water, two teal and two ivory. Same ramp as the water on the teal pair,
            # which is fine: every prim is its own seam group, so each dome still gets a detail
            # line in teal's own outline shade and reads as a swell rather than as flat water.
            {"t": "sphere", "c": (0.72, 0.86, 0.66), "r": 0.13},
            {"t": "sphere", "c": (1.06, 0.70, 0.64), "r": 0.10},
            {"t": "sphere", "c": (1.24, 1.10, 0.68), "r": 0.16, "ramp": "ivory"},
            {"t": "sphere", "c": (0.88, 1.28, 0.66), "r": 0.11, "ramp": "ivory"},
            {"t": "box", "c0": (0.62, 0.00, 0.00), "c1": (1.38, 0.24, 0.26), "ramp": "sand"},
            {"t": "box", "c0": (0.58, 0.00, 0.26), "c1": (1.42, 0.28, 0.32), "bevel": 0.02,
             "ramp": "ivory"},
            {"t": "box", "c0": (0.06, 0.86, 0.50), "c1": (0.24, 1.14, 0.74), "bevel": 0.03,
             "ramp": "crimson"},
        ],
    },
    "towel_rack": {
        "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.08, 0.30, 0.00), "c1": (0.30, 0.70, 0.07), "ramp": "charcoal"},
            {"t": "box", "c0": (0.70, 0.30, 0.00), "c1": (0.92, 0.70, 0.07), "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.19, "cy": 0.50, "rx": 0.06, "ry": 0.06, "z0": 0.07, "z1": 1.36,
             "ramp": "slate"},
            {"t": "cyl", "cx": 0.81, "cy": 0.50, "rx": 0.06, "ry": 0.06, "z0": 0.07, "z1": 1.36,
             "ramp": "slate"},
            {"t": "hcyl", "x": 0.50, "y0": 0.13, "y1": 0.87, "z": 1.36, "r": 0.055, "axis": "x",
             "caps": False, "ramp": "slate"},
            {"t": "hcyl", "x": 0.50, "y0": 0.13, "y1": 0.87, "z": 0.66, "r": 0.05, "axis": "x",
             "caps": False, "ramp": "slate"},
            # Small towels, deliberately. The first pass hung two 0.28 x 0.34 x 0.78 slabs and they
            # read as a pair of suitcases: they filled the tile, buried the frame, and hid the
            # rolls entirely. A towel is 12 screen px wide, and the rack has to show around it.
            {"t": "box", "c0": (0.24, 0.41, 0.94), "c1": (0.44, 0.59, 1.42), "bevel": 0.02},
            {"t": "box", "c0": (0.56, 0.41, 0.94), "c1": (0.76, 0.59, 1.42), "bevel": 0.02,
             "ramp": "crimson"},
            # Rolls on the lower bar, in the band the hanging pair leaves clear.
            {"t": "hcyl", "x": 0.50, "y0": 0.20, "y1": 0.46, "z": 0.74, "r": 0.115, "axis": "x",
             "ramp": "ivory"},
            {"t": "hcyl", "x": 0.50, "y0": 0.54, "y1": 0.80, "z": 0.74, "r": 0.115, "axis": "x",
             "ramp": "sand"},
        ],
    },
    # A palm, not a second fern: bare trunk, one crown. plant_fern's read comes from five spires
    # over a low leaf mass, so this one deliberately clears its trunk and puts everything at 1.3.
    "potted_palm": {
        "w": 1, "l": 1, "ramp": "fern",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.24, "ry": 0.24, "z0": 0.00, "z1": 0.44,
             "taper": 1.28, "ramp": "ivory"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.34, "ry": 0.34, "z0": 0.42, "z1": 0.50,
             "ramp": "teal"},
            {"t": "sphere", "c": (0.50, 0.50, 0.54), "r": 0.20, "ramp": "sand"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.10, "ry": 0.10, "z0": 0.48, "z1": 1.30,
             "taper": 0.62, "ramp": "sand"},
            {"t": "sphere", "c": (0.50, 0.50, 1.34), "r": 0.13},
            {"t": "hcyl", "x": 0.50, "y0": 0.06, "y1": 0.94, "z": 1.34, "r": 0.06},
            {"t": "hcyl", "x": 0.50, "y0": 0.06, "y1": 0.94, "z": 1.42, "r": 0.06, "axis": "x"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.09, "ry": 0.09, "z0": 1.30, "z1": 1.86,
             "taper": 0.14},
            {"t": "cyl", "cx": 0.30, "cy": 0.40, "rx": 0.09, "ry": 0.09, "z0": 1.24, "z1": 1.60,
             "taper": 0.16},
            {"t": "cyl", "cx": 0.70, "cy": 0.58, "rx": 0.09, "ry": 0.09, "z0": 1.24, "z1": 1.56,
             "taper": 0.16},
            {"t": "cyl", "cx": 0.40, "cy": 0.70, "rx": 0.08, "ry": 0.08, "z0": 1.24, "z1": 1.50,
             "taper": 0.18},
            {"t": "cyl", "cx": 0.62, "cy": 0.32, "rx": 0.08, "ry": 0.08, "z0": 1.24, "z1": 1.48,
             "taper": 0.18},
            {"t": "sphere", "c": (0.63, 0.42, 1.26), "r": 0.08, "ramp": "sand"},
        ],
    },
    "drinks_trolley": {
        "w": 1, "l": 1, "ramp": "ivory",
        "prims": [
            {"t": "cyl", "cx": 0.20, "cy": 0.20, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 0.12,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.80, "cy": 0.20, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 0.12,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.20, "cy": 0.80, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 0.12,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.80, "cy": 0.80, "rx": 0.09, "ry": 0.09, "z0": 0.00, "z1": 0.12,
             "ramp": "charcoal"},
            # The two low-fy posts run past the deck to carry the push handle.
            {"t": "box", "c0": (0.16, 0.16, 0.12), "c1": (0.24, 0.24, 1.16), "ramp": "slate"},
            {"t": "box", "c0": (0.76, 0.16, 0.12), "c1": (0.84, 0.24, 1.16), "ramp": "slate"},
            {"t": "box", "c0": (0.16, 0.76, 0.12), "c1": (0.24, 0.84, 0.94), "ramp": "slate"},
            {"t": "box", "c0": (0.76, 0.76, 0.12), "c1": (0.84, 0.84, 0.94), "ramp": "slate"},
            {"t": "box", "c0": (0.12, 0.12, 0.40), "c1": (0.88, 0.88, 0.47)},
            {"t": "box", "c0": (0.05, 0.05, 0.94), "c1": (0.95, 0.95, 0.98), "ramp": "teal"},
            {"t": "box", "c0": (0.08, 0.08, 0.96), "c1": (0.92, 0.92, 1.01), "bevel": 0.02},
            {"t": "hcyl", "x": 0.20, "y0": 0.16, "y1": 0.84, "z": 1.16, "r": 0.045, "axis": "x",
             "caps": False, "ramp": "slate"},
            {"t": "cyl", "cx": 0.34, "cy": 0.42, "rx": 0.07, "ry": 0.07, "z0": 1.01, "z1": 1.26,
             "ramp": "crimson"},
            {"t": "cyl", "cx": 0.34, "cy": 0.42, "rx": 0.03, "ry": 0.03, "z0": 1.26, "z1": 1.36,
             "ramp": "crimson"},
            {"t": "cyl", "cx": 0.30, "cy": 0.70, "rx": 0.10, "ry": 0.10, "z0": 1.01, "z1": 1.17,
             "taper": 1.10, "ramp": "sand"},
            # Tinted glassware, deliberately on the rim's ramp rather than the shelf's: an ivory
            # glass on an ivory deck is a shape with no edge but its own detail line.
            {"t": "cyl", "cx": 0.66, "cy": 0.46, "rx": 0.05, "ry": 0.05, "z0": 1.01, "z1": 1.15,
             "taper": 1.25, "ramp": "teal"},
        ],
    },
    "deck_chair": {
        "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.14, 0.12, 0.00), "c1": (0.24, 0.24, 0.56), "ramp": "sand"},
            {"t": "box", "c0": (0.76, 0.12, 0.00), "c1": (0.86, 0.24, 0.56), "ramp": "sand"},
            {"t": "box", "c0": (0.14, 0.74, 0.00), "c1": (0.24, 0.86, 0.96), "ramp": "sand"},
            {"t": "box", "c0": (0.76, 0.74, 0.00), "c1": (0.86, 0.86, 0.96), "ramp": "sand"},
            {"t": "hcyl", "x": 0.19, "y0": 0.12, "y1": 0.86, "z": 0.56, "r": 0.055,
             "caps": False, "ramp": "sand"},
            {"t": "hcyl", "x": 0.81, "y0": 0.12, "y1": 0.86, "z": 0.56, "r": 0.055,
             "caps": False, "ramp": "sand"},
            {"t": "box", "c0": (0.16, 0.14, 0.52), "c1": (0.84, 0.84, 0.62), "bevel": 0.04,
             "seat": True},
            # Deckchair canvas is striped, and a stripe on the same plane as the sling z-fights.
            # One z-pixel proud instead — the casino_table betting-line idiom on a soft surface.
            {"t": "box", "c0": (0.16, 0.30, 0.60), "c1": (0.84, 0.44, 0.65), "ramp": "ivory"},
            {"t": "box", "c0": (0.16, 0.56, 0.60), "c1": (0.84, 0.70, 0.65), "ramp": "ivory"},
            {"t": "box", "c0": (0.16, 0.76, 0.62), "c1": (0.84, 0.88, 1.46), "bevel": 0.04},
            {"t": "box", "c0": (0.16, 0.72, 0.86), "c1": (0.84, 0.77, 1.14), "ramp": "ivory"},
            {"t": "hcyl", "x": 0.82, "y0": 0.12, "y1": 0.88, "z": 1.46, "r": 0.06, "axis": "x",
             "caps": False, "ramp": "sand"},
        ],
    },
    # Poolside grab rails. Straight like `railing`, and for the same reason: players rotate, and a
    # corner mesh would be a second archetype. The rungs stand proud of the stiles in fy both ways,
    # or two quarter turns bury them inside the posts.
    "pool_ladder": {
        "w": 1, "l": 1, "ramp": "ivory",
        "prims": [
            {"t": "box", "c0": (0.08, 0.34, 0.00), "c1": (0.32, 0.66, 0.07), "ramp": "charcoal"},
            {"t": "box", "c0": (0.68, 0.34, 0.00), "c1": (0.92, 0.66, 0.07), "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.20, "cy": 0.50, "rx": 0.065, "ry": 0.065, "z0": 0.07, "z1": 1.14},
            {"t": "cyl", "cx": 0.80, "cy": 0.50, "rx": 0.065, "ry": 0.065, "z0": 0.07, "z1": 1.14},
            {"t": "sphere", "c": (0.20, 0.50, 1.14), "r": 0.075},
            {"t": "sphere", "c": (0.80, 0.50, 1.14), "r": 0.075},
            {"t": "hcyl", "x": 0.50, "y0": 0.20, "y1": 0.80, "z": 1.14, "r": 0.085, "axis": "x",
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.20, "y1": 0.80, "z": 0.74, "r": 0.075, "axis": "x",
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.20, "y1": 0.80, "z": 0.40, "r": 0.075, "axis": "x",
             "caps": False},
            # Grip sleeves, proud of the stiles so the accent is in the silhouette rather than a
            # band sharing ivory's luma bucket on a flat face.
            {"t": "cyl", "cx": 0.20, "cy": 0.50, "rx": 0.095, "ry": 0.095, "z0": 0.46, "z1": 0.68,
             "ramp": "teal"},
            {"t": "cyl", "cx": 0.80, "cy": 0.50, "rx": 0.095, "ry": 0.095, "z0": 0.46, "z1": 0.68,
             "ramp": "teal"},
        ],
    },
    # ---- prestige fixtures (#210) ----
    # The deep end of the sink: account-bound, flagship-priced, and deliberately not a recolour of
    # anything else — a 3,300-Star fixture has to read as its own object across the room.
    # A billiards table, not the grand piano this slot started as. gateBounds sets the ground line
    # from the declared footprint and wants the lowest pixel within half a tile of it in every
    # direction; a grand piano's plan leaves two corners of its bounding rectangle empty and can
    # never satisfy that. Filling the rectangle turned the piano into a grey slab, so the object
    # changed rather than the gate — a billiards table genuinely is a rectangle, and it belongs in
    # a casino resort besides.
    "billiards_table": {
        "w": 3, "l": 2, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.12, 0.16, 0.00), "c1": (0.42, 0.46, 0.56)},
            {"t": "box", "c0": (2.58, 0.16, 0.00), "c1": (2.88, 0.46, 0.56)},
            {"t": "box", "c0": (0.12, 1.54, 0.00), "c1": (0.42, 1.84, 0.56)},
            {"t": "box", "c0": (2.58, 1.54, 0.00), "c1": (2.88, 1.84, 0.56)},
            {"t": "box", "c0": (0.06, 0.10, 0.56), "c1": (2.94, 1.90, 0.78), "bevel": 0.03},
            {"t": "box", "c0": (0.02, 0.06, 0.78), "c1": (2.98, 1.94, 0.90), "bevel": 0.04},
            {"t": "box", "c0": (0.02, 0.06, 0.90), "c1": (2.98, 1.94, 0.93), "ramp": "gold"},
            {"t": "box", "c0": (0.20, 0.24, 0.86), "c1": (2.80, 1.76, 0.94), "ramp": "fern"},
            # pockets, sunk into the baize at the corners and the mid-rails
            {"t": "cyl", "cx": 0.26, "cy": 0.30, "rx": 0.11, "ry": 0.11, "z0": 0.92, "z1": 0.96},
            {"t": "cyl", "cx": 1.50, "cy": 0.26, "rx": 0.11, "ry": 0.11, "z0": 0.92, "z1": 0.96},
            {"t": "cyl", "cx": 2.74, "cy": 0.30, "rx": 0.11, "ry": 0.11, "z0": 0.92, "z1": 0.96},
            {"t": "cyl", "cx": 0.26, "cy": 1.70, "rx": 0.11, "ry": 0.11, "z0": 0.92, "z1": 0.96},
            {"t": "cyl", "cx": 1.50, "cy": 1.74, "rx": 0.11, "ry": 0.11, "z0": 0.92, "z1": 0.96},
            {"t": "cyl", "cx": 2.74, "cy": 1.70, "rx": 0.11, "ry": 0.11, "z0": 0.92, "z1": 0.96},
            {"t": "sphere", "c": (1.90, 1.00, 0.99), "r": 0.075, "ramp": "ivory"},
            {"t": "sphere", "c": (2.14, 0.88, 0.99), "r": 0.075, "ramp": "crimson"},
            {"t": "sphere", "c": (2.14, 1.12, 0.99), "r": 0.075, "ramp": "gold"},
            {"t": "sphere", "c": (0.72, 1.02, 0.99), "r": 0.075, "ramp": "ivory"},
        ],
    },
    # A standing candelabra, not a hanging chandelier: there is no ceiling surface, and the
    # ground-contact gate is right to refuse a fixture that touches nothing. Inventing a third
    # surface for one item would cost more than the item is worth.
    # One tile, not four: the frame is sized to the declared footprint, so a slim object in a 2x2
    # footprint is mostly air and its base cannot reach the ground line the bounds gate checks.
    "penthouse_candelabra": {
        "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.40, "ry": 0.40, "z0": 0.00, "z1": 0.07,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.22, "ry": 0.22, "z0": 0.07, "z1": 0.16,
             "taper": 0.45},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.045, "ry": 0.045, "z0": 0.16, "z1": 1.34},
            {"t": "sphere", "c": (0.50, 0.50, 0.86), "r": 0.10},
            # arms: a slim tier, not a disc — the first pass used a 0.46 ring and read as a lump
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.32, "ry": 0.32, "z0": 1.34, "z1": 1.39},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.045, "ry": 0.045, "z0": 1.39, "z1": 1.68},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.17, "ry": 0.17, "z0": 1.68, "z1": 1.73},
            # candles: long enough to read as candles against the metal
            {"t": "cyl", "cx": 0.18, "cy": 0.50, "rx": 0.045, "ry": 0.045, "z0": 1.39, "z1": 1.90,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 0.82, "cy": 0.50, "rx": 0.045, "ry": 0.045, "z0": 1.39, "z1": 1.90,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 0.50, "cy": 0.18, "rx": 0.045, "ry": 0.045, "z0": 1.39, "z1": 1.90,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 0.50, "cy": 0.82, "rx": 0.045, "ry": 0.045, "z0": 1.39, "z1": 1.90,
             "ramp": "ivory"},
            {"t": "sphere", "c": (0.18, 0.50, 1.96), "r": 0.06},
            {"t": "sphere", "c": (0.82, 0.50, 1.96), "r": 0.06},
            {"t": "sphere", "c": (0.50, 0.18, 1.96), "r": 0.06},
            {"t": "sphere", "c": (0.50, 0.82, 1.96), "r": 0.06},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.045, "ry": 0.045, "z0": 1.73, "z1": 2.20,
             "ramp": "ivory"},
            {"t": "sphere", "c": (0.50, 0.50, 2.26), "r": 0.06},
        ],
    },
    # ---- wall archetypes (#203) ----
    # Authored flush at fy 0 and hung at eye level on a 4-unit wall. The catalog def's mount v is
    # only the authored height; players slide the item anywhere the wall allows.
    "wall_art": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "box", "c0": (0.18, 0.00, 2.26), "c1": (0.82, 0.06, 2.90), "ramp": "teal"},
            {"t": "box", "c0": (0.14, 0.00, 2.20), "c1": (0.86, 0.08, 2.26)},
            {"t": "box", "c0": (0.14, 0.00, 2.90), "c1": (0.86, 0.08, 2.96)},
            {"t": "box", "c0": (0.14, 0.00, 2.20), "c1": (0.20, 0.08, 2.96)},
            {"t": "box", "c0": (0.80, 0.00, 2.20), "c1": (0.86, 0.08, 2.96)},
        ],
    },
    "poster": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.16, 0.00, 2.05), "c1": (0.84, 0.03, 2.95)},
            {"t": "box", "c0": (0.16, 0.03, 2.62), "c1": (0.84, 0.04, 2.80), "ramp": "ivory"},
            {"t": "box", "c0": (0.16, 0.03, 2.12), "c1": (0.84, 0.04, 2.22), "ramp": "charcoal"},
        ],
    },
    # Navy plaque, not walnut: walnut (0xb5651d) and gold (0xdaa520) sit a few degrees apart, so a
    # gold engraving plate on a wooden plaque disappears into it.
    "record_trophy": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.22, 0.00, 2.28), "c1": (0.78, 0.05, 2.92), "bevel": 0.02},
            {"t": "hcyl", "x": 0.50, "y0": 0.05, "y1": 0.08, "z": 2.68, "r": 0.185,
             "caps": False, "ramp": "charcoal"},
            {"t": "hcyl", "x": 0.50, "y0": 0.08, "y1": 0.10, "z": 2.68, "r": 0.06,
             "caps": False, "ramp": "gold"},
            {"t": "box", "c0": (0.30, 0.05, 2.32), "c1": (0.70, 0.07, 2.42), "ramp": "gold"},
        ],
    },
    "wall_shelf": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.21, 0.00, 2.40), "c1": (0.79, 0.20, 2.47), "bevel": 0.02},
            {"t": "box", "c0": (0.27, 0.00, 2.22), "c1": (0.32, 0.16, 2.40), "ramp": "charcoal"},
            {"t": "box", "c0": (0.68, 0.00, 2.22), "c1": (0.73, 0.16, 2.40), "ramp": "charcoal"},
            {"t": "box", "c0": (0.29, 0.04, 2.47), "c1": (0.37, 0.17, 2.73), "ramp": "navy"},
            {"t": "box", "c0": (0.38, 0.04, 2.47), "c1": (0.45, 0.17, 2.68), "ramp": "crimson"},
            {"t": "cyl", "cx": 0.63, "cy": 0.11, "rx": 0.08, "ry": 0.08, "z0": 2.47, "z1": 2.70,
             "taper": 0.70, "ramp": "teal"},
        ],
    },
    # ---- wave A1: starter (blitz task 6) ----
    "starter_armchair": {
        "w": 1, "l": 1, "ramp": "sand",
        "prims": [
            {"t": "box", "c0": (0.14, 0.14, 0.00), "c1": (0.86, 0.86, 0.14), "ramp": "walnut"},
            {"t": "box", "c0": (0.12, 0.12, 0.14), "c1": (0.88, 0.88, 0.42), "bevel": 0.04,
             "ramp": "sand", "seat": True},
            {"t": "box", "c0": (0.12, 0.66, 0.42), "c1": (0.88, 0.90, 0.92), "bevel": 0.05},
            {"t": "box", "c0": (0.06, 0.10, 0.30), "c1": (0.18, 0.90, 0.60), "bevel": 0.03},
            {"t": "box", "c0": (0.82, 0.10, 0.30), "c1": (0.94, 0.90, 0.60), "bevel": 0.03},
        ],
    },
    "starter_coffee_table": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.10, 0.10, 0.30), "c1": (0.90, 0.90, 0.40), "bevel": 0.02},
            {"t": "box", "c0": (0.16, 0.16, 0.00), "c1": (0.26, 0.26, 0.30)},
            {"t": "box", "c0": (0.74, 0.16, 0.00), "c1": (0.84, 0.26, 0.30)},
            {"t": "box", "c0": (0.16, 0.74, 0.00), "c1": (0.26, 0.84, 0.30)},
            {"t": "box", "c0": (0.74, 0.74, 0.00), "c1": (0.84, 0.84, 0.30)},
        ],
    },
    "starter_entry_mat": {
        "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.06, 0.06, 0.00), "c1": (0.94, 0.94, 0.05), "ramp": "crimson"},
            {"t": "box", "c0": (0.20, 0.20, 0.05), "c1": (0.80, 0.80, 0.06), "ramp": "sand"},
        ],
    },
    "starter_floor_lamp": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.20, "ry": 0.20, "z0": 0.0, "z1": 0.06},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.03, "ry": 0.03, "z0": 0.06, "z1": 1.30},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.24, "ry": 0.24, "z0": 1.30, "z1": 1.62,
             "taper": 0.7, "ramp": "ivory"},
        ],
    },
    "starter_bookcase": {
        "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.10, 0.16, 0.00), "c1": (0.90, 0.84, 1.60)},
            {"t": "box", "c0": (0.16, 0.10, 0.40), "c1": (0.84, 0.20, 0.46), "ramp": "walnut"},
            {"t": "box", "c0": (0.16, 0.10, 0.90), "c1": (0.84, 0.20, 0.96), "ramp": "walnut"},
            {"t": "box", "c0": (0.20, 0.12, 0.46), "c1": (0.44, 0.18, 0.86), "ramp": "crimson"},
            {"t": "box", "c0": (0.50, 0.12, 0.96), "c1": (0.74, 0.18, 1.36), "ramp": "teal"},
        ],
    },
    "starter_wall_clock": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.28, 0.00, 2.30), "c1": (0.72, 0.08, 2.80), "bevel": 0.02},
            {"t": "hcyl", "x": 0.5125, "y0": 0.08, "y1": 0.10, "z": 2.55, "r": 0.16,
             "caps": False, "ramp": "ivory"},
            {"t": "box", "c0": (0.496, 0.10, 2.55), "c1": (0.53, 0.12, 2.70), "ramp": "charcoal"},
        ],
    },
    "starter_poster_set": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.16, 0.00, 2.30), "c1": (0.46, 0.05, 2.80), "ramp": "navy"},
            {"t": "box", "c0": (0.54, 0.00, 2.30), "c1": (0.84, 0.05, 2.80), "ramp": "crimson"},
        ],
    },
    "starter_wall_shelf": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.16, 0.00, 2.50), "c1": (0.84, 0.12, 2.56)},
            {"t": "box", "c0": (0.42, 0.02, 2.56), "c1": (0.58, 0.10, 2.80), "ramp": "fern"},
        ],
    },
    # ---- wave A1: cafe (blitz task 6) ----
    "cafe_espresso_machine": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.16, 0.20, 0.00), "c1": (0.84, 0.80, 0.90), "bevel": 0.02},
            {"t": "box", "c0": (0.24, 0.14, 0.60), "c1": (0.76, 0.24, 0.72), "ramp": "gold"},
            {"t": "cyl", "cx": 0.5, "cy": 0.20, "rx": 0.05, "ry": 0.05, "z0": 0.40, "z1": 0.60,
             "ramp": "gold"},
            {"t": "box", "c0": (0.20, 0.10, 0.90), "c1": (0.80, 0.70, 1.00), "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.78, "cy": 0.5, "rx": 0.02, "ry": 0.02, "z0": 0.60, "z1": 0.90,
             "ramp": "gold"},
        ],
    },
    "cafe_bakery_island": {
        "w": 2, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.10, 0.20, 0.00), "c1": (1.90, 0.80, 0.80)},
            {"t": "box", "c0": (0.06, 0.16, 0.80), "c1": (1.94, 0.84, 0.90), "ramp": "ivory"},
            {"t": "box", "c0": (0.30, 0.30, 0.90), "c1": (1.70, 0.70, 1.20), "ramp": "ivory"},
            {"t": "box", "c0": (0.50, 0.40, 0.92), "c1": (0.80, 0.60, 1.02), "ramp": "sand"},
            {"t": "box", "c0": (1.10, 0.40, 0.92), "c1": (1.40, 0.60, 1.02), "ramp": "crimson"},
        ],
    },
    "cafe_bistro_table": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.36, "ry": 0.36, "z0": 0.70, "z1": 0.76,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.05, "ry": 0.05, "z0": 0.06, "z1": 0.70},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.22, "ry": 0.22, "z0": 0.0, "z1": 0.06},
        ],
    },
    "cafe_bistro_chair": {
        "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.20, 0.20, 0.00), "c1": (0.30, 0.30, 0.44)},
            {"t": "box", "c0": (0.70, 0.20, 0.00), "c1": (0.80, 0.30, 0.44)},
            {"t": "box", "c0": (0.20, 0.70, 0.00), "c1": (0.30, 0.80, 0.44)},
            {"t": "box", "c0": (0.70, 0.70, 0.00), "c1": (0.80, 0.80, 0.44)},
            {"t": "box", "c0": (0.18, 0.18, 0.44), "c1": (0.82, 0.82, 0.52), "bevel": 0.03,
             "ramp": "teal", "seat": True},
            {"t": "box", "c0": (0.18, 0.68, 0.52), "c1": (0.82, 0.84, 1.00), "bevel": 0.03},
        ],
    },
    "cafe_pastry_case": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.12, 0.20, 0.00), "c1": (0.88, 0.80, 0.70)},
            {"t": "box", "c0": (0.14, 0.14, 0.70), "c1": (0.86, 0.86, 1.10), "ramp": "ivory"},
            {"t": "box", "c0": (0.30, 0.16, 0.74), "c1": (0.70, 0.20, 1.04), "ramp": "teal"},
        ],
    },
    "cafe_barista_stool": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.05, "ry": 0.05, "z0": 0.0, "z1": 0.62},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.26, "ry": 0.26, "z0": 0.62, "z1": 0.70,
             "ramp": "crimson", "seat": True},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.18, "ry": 0.18, "z0": 0.0, "z1": 0.04},
        ],
    },
    "cafe_potted_herb": {
        "w": 1, "l": 1, "ramp": "fern",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.22, "ry": 0.22, "z0": 0.0, "z1": 0.30,
             "taper": 0.7, "ramp": "sand"},
            {"t": "sphere", "c": (0.50, 0.50, 0.52), "r": 0.22},
            {"t": "sphere", "c": (0.38, 0.44, 0.42), "r": 0.15},
            {"t": "sphere", "c": (0.62, 0.54, 0.44), "r": 0.16},
        ],
    },
    "cafe_woven_rug": {
        "w": 2, "l": 2, "ramp": "sand",
        "prims": [
            {"t": "box", "c0": (0.04, 0.04, 0.00), "c1": (1.96, 1.96, 0.05), "ramp": "sand"},
            {"t": "box", "c0": (0.40, 0.40, 0.05), "c1": (1.60, 1.60, 0.06), "ramp": "crimson"},
        ],
    },
    "cafe_menu_board": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.14, 0.00, 2.20), "c1": (0.86, 0.06, 2.90)},
            {"t": "box", "c0": (0.20, 0.06, 2.30), "c1": (0.80, 0.08, 2.80), "ramp": "charcoal"},
            {"t": "box", "c0": (0.26, 0.08, 2.62), "c1": (0.60, 0.09, 2.66), "ramp": "ivory"},
            {"t": "box", "c0": (0.26, 0.08, 2.46), "c1": (0.70, 0.09, 2.50), "ramp": "ivory"},
        ],
    },
    "cafe_chalk_art": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.05, 2.80), "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.5, "cy": 0.06, "rx": 0.14, "ry": 0.02, "z0": 2.5, "z1": 2.52,
             "ramp": "ivory"},
        ],
    },
    "cafe_cup_shelf": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.16, 0.00, 2.44), "c1": (0.84, 0.14, 2.50)},
            {"t": "cyl", "cx": 0.30, "cy": 0.08, "rx": 0.06, "ry": 0.06, "z0": 2.50, "z1": 2.64,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 0.52, "cy": 0.08, "rx": 0.06, "ry": 0.06, "z0": 2.50, "z1": 2.64,
             "ramp": "teal"},
            {"t": "cyl", "cx": 0.72, "cy": 0.08, "rx": 0.06, "ry": 0.06, "z0": 2.50, "z1": 2.64,
             "ramp": "crimson"},
        ],
    },
    "cafe_neon_cup": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.34, 0.00, 2.36), "c1": (0.66, 0.05, 2.72), "ramp": "teal"},
            {"t": "box", "c0": (0.42, 0.05, 2.46), "c1": (0.58, 0.07, 2.62), "ramp": "ivory"},
        ],
    },
    "cafe_tile_mural": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "ivory",
        "prims": [
            {"t": "box", "c0": (0.14, 0.00, 2.20), "c1": (0.86, 0.04, 2.90), "ramp": "ivory"},
            {"t": "box", "c0": (0.20, 0.04, 2.30), "c1": (0.44, 0.06, 2.54), "ramp": "teal"},
            {"t": "box", "c0": (0.50, 0.04, 2.50), "c1": (0.74, 0.06, 2.74), "ramp": "crimson"},
        ],
    },
    "cafe_herb_pressing": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.28, 0.00, 2.30), "c1": (0.72, 0.05, 2.80)},
            {"t": "box", "c0": (0.34, 0.05, 2.38), "c1": (0.66, 0.07, 2.72), "ramp": "ivory"},
            {"t": "sphere", "c": (0.50, 0.10, 2.55), "r": 0.08, "ramp": "fern"},
        ],
    },
    # ---- wave A1: bedroom (blitz task 6) ----
    "bedroom_bed_frame": {
        "w": 1, "l": 2, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.10, 0.06, 0.00), "c1": (0.90, 0.16, 0.90)},
            {"t": "box", "c0": (0.12, 0.14, 0.20), "c1": (0.88, 1.90, 0.46), "bevel": 0.03,
             "ramp": "navy", "seat": True},
            {"t": "box", "c0": (0.20, 0.22, 0.46), "c1": (0.80, 0.50, 0.60), "ramp": "ivory"},
        ],
    },
    "bedroom_dresser": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.12, 0.20, 0.00), "c1": (0.88, 0.80, 0.90), "bevel": 0.02},
            {"t": "box", "c0": (0.20, 0.14, 0.56), "c1": (0.80, 0.20, 0.72), "ramp": "oak"},
            {"t": "box", "c0": (0.20, 0.14, 0.28), "c1": (0.80, 0.20, 0.44), "ramp": "oak"},
        ],
    },
    "bedroom_nightstand": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.24, 0.00), "c1": (0.80, 0.76, 0.50), "bevel": 0.02},
            {"t": "box", "c0": (0.28, 0.18, 0.24), "c1": (0.72, 0.24, 0.36), "ramp": "oak"},
        ],
    },
    "bedroom_wardrobe": {
        "w": 2, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.08, 0.24, 0.00), "c1": (1.92, 0.80, 2.10), "bevel": 0.02},
            {"t": "box", "c0": (0.16, 0.18, 0.20), "c1": (0.96, 0.24, 1.90), "ramp": "oak"},
            {"t": "box", "c0": (1.04, 0.18, 0.20), "c1": (1.84, 0.24, 1.90), "ramp": "oak"},
        ],
    },
    "bedroom_vanity": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.16, 0.30, 0.00), "c1": (0.84, 0.76, 0.60), "bevel": 0.02},
            {"t": "box", "c0": (0.24, 0.50, 0.60), "c1": (0.76, 0.60, 1.30), "ramp": "ivory"},
            {"t": "box", "c0": (0.30, 0.52, 0.70), "c1": (0.70, 0.56, 1.20), "ramp": "slate"},
        ],
    },
    "bedroom_rug": {
        "w": 2, "l": 2, "ramp": "plum",
        "prims": [
            {"t": "box", "c0": (0.04, 0.04, 0.00), "c1": (1.96, 1.96, 0.05), "ramp": "plum"},
            {"t": "box", "c0": (0.44, 0.44, 0.05), "c1": (1.56, 1.56, 0.06), "ramp": "ivory"},
        ],
    },
    "bedroom_table_lamp": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.16, "ry": 0.16, "z0": 0.0, "z1": 0.06},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.03, "ry": 0.03, "z0": 0.06, "z1": 0.60},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.20, "ry": 0.20, "z0": 0.60, "z1": 0.86,
             "taper": 0.7, "ramp": "ivory"},
        ],
    },
    "bedroom_bench": {
        "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.16, 0.24, 0.00), "c1": (0.26, 0.76, 0.36)},
            {"t": "box", "c0": (0.74, 0.24, 0.00), "c1": (0.84, 0.76, 0.36)},
            {"t": "box", "c0": (0.10, 0.22, 0.36), "c1": (0.90, 0.78, 0.46), "bevel": 0.03,
             "ramp": "plum", "seat": True},
        ],
    },
    "bedroom_reading_chair": {
        "w": 1, "l": 1, "ramp": "plum",
        "prims": [
            {"t": "box", "c0": (0.14, 0.14, 0.00), "c1": (0.86, 0.86, 0.16), "ramp": "walnut"},
            {"t": "box", "c0": (0.12, 0.12, 0.16), "c1": (0.88, 0.88, 0.44), "bevel": 0.04,
             "ramp": "plum", "seat": True},
            {"t": "box", "c0": (0.12, 0.64, 0.44), "c1": (0.88, 0.90, 1.20), "bevel": 0.05},
        ],
    },
    "bedroom_desk": {
        "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.10, 0.20, 0.66), "c1": (0.90, 0.80, 0.74), "bevel": 0.02},
            {"t": "box", "c0": (0.14, 0.24, 0.00), "c1": (0.24, 0.76, 0.66)},
            {"t": "box", "c0": (0.76, 0.24, 0.00), "c1": (0.86, 0.76, 0.66)},
            {"t": "box", "c0": (0.56, 0.24, 0.40), "c1": (0.86, 0.76, 0.62), "ramp": "walnut"},
        ],
    },
    "bedroom_mirror": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.30, 0.00, 2.10), "c1": (0.70, 0.06, 2.90)},
            {"t": "box", "c0": (0.36, 0.06, 2.18), "c1": (0.64, 0.08, 2.82), "ramp": "slate"},
        ],
    },
    "bedroom_photo_wall": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.44), "c1": (0.42, 0.04, 2.72), "ramp": "navy"},
            {"t": "box", "c0": (0.58, 0.00, 2.44), "c1": (0.80, 0.04, 2.72), "ramp": "crimson"},
            {"t": "box", "c0": (0.40, 0.00, 2.44), "c1": (0.60, 0.04, 2.72), "ramp": "teal"},
        ],
    },
    "bedroom_wall_sconce": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "box", "c0": (0.44, 0.00, 2.30), "c1": (0.56, 0.06, 2.60)},
            {"t": "cyl", "cx": 0.5, "cy": 0.10, "rx": 0.10, "ry": 0.06, "z0": 2.60, "z1": 2.76,
             "taper": 0.7, "ramp": "ivory"},
        ],
    },
    "bedroom_tapestry": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "plum",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.20), "c1": (0.80, 0.05, 2.90), "ramp": "plum"},
            {"t": "box", "c0": (0.30, 0.05, 2.36), "c1": (0.70, 0.07, 2.60), "ramp": "gold"},
        ],
    },
    "bedroom_shelf": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.16, 0.00, 2.46), "c1": (0.84, 0.12, 2.52)},
            {"t": "box", "c0": (0.42, 0.02, 2.52), "c1": (0.58, 0.10, 2.74), "ramp": "navy"},
        ],
    },
    "bedroom_clock": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "ivory",
        "prims": [
            {"t": "hcyl", "x": 0.5, "y0": 0.02, "y1": 0.06, "z": 2.55, "r": 0.22,
             "caps": False, "ramp": "ivory"},
            {"t": "box", "c0": (0.486, 0.06, 2.55), "c1": (0.514, 0.08, 2.70), "ramp": "charcoal"},
        ],
    },
    "bedroom_dream_print": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.26, 0.00, 2.30), "c1": (0.74, 0.05, 2.80), "ramp": "navy"},
            {"t": "sphere", "c": (0.50, 0.10, 2.62), "r": 0.08, "ramp": "ivory"},
        ],
    },
    # ---- wave A2: casino (blitz task 7) — decorative/social, no wager interaction ----
    "casino_card_table": {
        "w": 2, "l": 2, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.30, 0.30, 0.00), "c1": (0.50, 0.50, 1.00)},
            {"t": "box", "c0": (1.50, 0.30, 0.00), "c1": (1.70, 0.50, 1.00)},
            {"t": "box", "c0": (0.30, 1.50, 0.00), "c1": (0.50, 1.70, 1.00)},
            {"t": "box", "c0": (1.50, 1.50, 0.00), "c1": (1.70, 1.70, 1.00)},
            {"t": "box", "c0": (0.10, 0.10, 1.00), "c1": (1.90, 1.90, 1.12), "ramp": "walnut"},
            {"t": "box", "c0": (0.20, 0.20, 1.12), "c1": (1.80, 1.80, 1.18), "ramp": "fern"},
            {"t": "box", "c0": (0.50, 0.50, 1.18), "c1": (0.66, 0.62, 1.20), "ramp": "ivory"},
            {"t": "box", "c0": (1.30, 1.20, 1.18), "c1": (1.46, 1.32, 1.20), "ramp": "ivory"},
        ],
    },
    "casino_dice_table": {
        "w": 2, "l": 2, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.20, 0.00), "c1": (1.80, 1.80, 0.90)},
            {"t": "box", "c0": (0.14, 0.14, 0.90), "c1": (1.86, 1.86, 1.02), "ramp": "walnut"},
            {"t": "box", "c0": (0.24, 0.24, 1.02), "c1": (1.76, 1.76, 1.08), "ramp": "teal"},
            {"t": "box", "c0": (0.70, 0.70, 1.08), "c1": (0.90, 0.90, 1.24), "ramp": "ivory"},
            {"t": "box", "c0": (1.05, 0.95, 1.08), "c1": (1.25, 1.15, 1.22), "ramp": "crimson"},
        ],
    },
    "casino_chip_rack": {
        "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.16, 0.24, 0.00), "c1": (0.84, 0.76, 0.50), "bevel": 0.02},
            {"t": "cyl", "cx": 0.32, "cy": 0.40, "rx": 0.08, "ry": 0.08, "z0": 0.50, "z1": 0.72, "ramp": "crimson"},
            {"t": "cyl", "cx": 0.52, "cy": 0.40, "rx": 0.08, "ry": 0.08, "z0": 0.50, "z1": 0.78, "ramp": "teal"},
            {"t": "cyl", "cx": 0.70, "cy": 0.40, "rx": 0.08, "ry": 0.08, "z0": 0.50, "z1": 0.68, "ramp": "gold"},
        ],
    },
    "casino_dealer_chair": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.06, "ry": 0.06, "z0": 0.0, "z1": 0.60},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.28, "ry": 0.28, "z0": 0.60, "z1": 0.68,
             "ramp": "crimson", "seat": True},
            {"t": "box", "c0": (0.24, 0.66, 0.68), "c1": (0.76, 0.80, 1.10), "bevel": 0.03},
        ],
    },
    "casino_velvet_rope": {
        "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "cyl", "cx": 0.20, "cy": 0.5, "rx": 0.05, "ry": 0.05, "z0": 0.0, "z1": 0.80},
            {"t": "cyl", "cx": 0.80, "cy": 0.5, "rx": 0.05, "ry": 0.05, "z0": 0.0, "z1": 0.80},
            {"t": "sphere", "c": (0.20, 0.5, 0.84), "r": 0.07},
            {"t": "sphere", "c": (0.80, 0.5, 0.84), "r": 0.07},
            {"t": "box", "c0": (0.18, 0.46, 0.56), "c1": (0.82, 0.54, 0.64), "ramp": "crimson"},
        ],
    },
    "casino_round_rug": {
        "w": 2, "l": 2, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.04, 0.04, 0.00), "c1": (1.96, 1.96, 0.05), "ramp": "crimson"},
            {"t": "cyl", "cx": 1.0, "cy": 1.0, "rx": 0.6, "ry": 0.6, "z0": 0.05, "z1": 0.06, "ramp": "gold"},
        ],
    },
    "casino_pendant_lamp": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.18, "ry": 0.18, "z0": 0.0, "z1": 0.05},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.03, "ry": 0.03, "z0": 0.05, "z1": 1.40},
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.26, "ry": 0.26, "z0": 1.40, "z1": 1.70,
             "taper": 0.6, "ramp": "gold"},
        ],
    },
    "casino_banquette": {
        "w": 2, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.08, 0.20, 0.00), "c1": (1.92, 0.80, 0.40), "bevel": 0.04,
             "ramp": "crimson", "seat": True},
            {"t": "box", "c0": (0.08, 0.66, 0.40), "c1": (1.92, 0.92, 1.10), "bevel": 0.05},
            {"t": "box", "c0": (0.10, 0.16, 0.00), "c1": (1.90, 0.24, 0.30), "ramp": "gold"},
        ],
    },
    "casino_neon_dice": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "teal",
        "prims": [
            {"t": "box", "c0": (0.36, 0.00, 2.36), "c1": (0.64, 0.05, 2.64), "ramp": "teal"},
            {"t": "box", "c0": (0.44, 0.05, 2.44), "c1": (0.56, 0.07, 2.56), "ramp": "gold"},
        ],
    },
    "casino_card_mural": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.16, 0.00, 2.20), "c1": (0.84, 0.04, 2.90), "ramp": "charcoal"},
            {"t": "box", "c0": (0.26, 0.04, 2.40), "c1": (0.44, 0.06, 2.72), "ramp": "ivory"},
            {"t": "box", "c0": (0.52, 0.04, 2.36), "c1": (0.70, 0.06, 2.68), "ramp": "crimson"},
        ],
    },
    "casino_gold_sconce": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "box", "c0": (0.44, 0.00, 2.30), "c1": (0.56, 0.06, 2.60)},
            {"t": "cyl", "cx": 0.5, "cy": 0.10, "rx": 0.10, "ry": 0.06, "z0": 2.60, "z1": 2.76,
             "taper": 0.7, "ramp": "ivory"},
        ],
    },
    "casino_velvet_drape": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.10), "c1": (0.80, 0.06, 2.90), "ramp": "crimson"},
            {"t": "box", "c0": (0.30, 0.06, 2.20), "c1": (0.40, 0.08, 2.90), "ramp": "crimson"},
            {"t": "box", "c0": (0.60, 0.06, 2.20), "c1": (0.70, 0.08, 2.90), "ramp": "crimson"},
        ],
    },
    "casino_marquee_sign": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.40), "c1": (0.80, 0.06, 2.80), "ramp": "charcoal"},
            {"t": "box", "c0": (0.28, 0.06, 2.54), "c1": (0.72, 0.08, 2.66), "ramp": "gold"},
            {"t": "sphere", "c": (0.26, 0.06, 2.44), "r": 0.03, "ramp": "ivory"},
            {"t": "sphere", "c": (0.74, 0.06, 2.44), "r": 0.03, "ramp": "ivory"},
        ],
    },
    # ---- wave A2: wall_art gallery (blitz task 7) — 28 wall-only ----
    "wall_art_print_aurora": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "navy"},
            {"t": "box", "c0": (0.30, 0.06, 2.44), "c1": (0.70, 0.08, 2.56), "ramp": "teal"},
        ],
    },
    "wall_art_print_bloom": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "crimson"},
            {"t": "sphere", "c": (0.50, 0.10, 2.55), "r": 0.08, "ramp": "plum"},
        ],
    },
    "wall_art_print_circuit": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "fern"},
            {"t": "box", "c0": (0.44, 0.06, 2.34), "c1": (0.56, 0.08, 2.76), "ramp": "gold"},
        ],
    },
    "wall_art_print_dune": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "teal"},
            {"t": "box", "c0": (0.30, 0.06, 2.34), "c1": (0.46, 0.08, 2.50), "ramp": "slate"},
            {"t": "box", "c0": (0.54, 0.06, 2.58), "c1": (0.70, 0.08, 2.74), "ramp": "slate"},
        ],
    },
    "wall_art_print_ember": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "plum"},
            {"t": "box", "c0": (0.30, 0.06, 2.44), "c1": (0.70, 0.08, 2.56), "ramp": "sand"},
        ],
    },
    "wall_art_print_fjord": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "gold"},
            {"t": "sphere", "c": (0.50, 0.10, 2.55), "r": 0.08, "ramp": "oak"},
        ],
    },
    "wall_art_print_grove": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "slate"},
            {"t": "box", "c0": (0.44, 0.06, 2.34), "c1": (0.56, 0.08, 2.76), "ramp": "ivory"},
        ],
    },
    "wall_art_print_harbor": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "sand"},
            {"t": "box", "c0": (0.30, 0.06, 2.34), "c1": (0.46, 0.08, 2.50), "ramp": "navy"},
            {"t": "box", "c0": (0.54, 0.06, 2.58), "c1": (0.70, 0.08, 2.74), "ramp": "navy"},
        ],
    },
    "wall_art_print_iris": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "oak"},
            {"t": "box", "c0": (0.30, 0.06, 2.44), "c1": (0.70, 0.08, 2.56), "ramp": "crimson"},
        ],
    },
    "wall_art_print_juniper": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "ivory"},
            {"t": "sphere", "c": (0.50, 0.10, 2.55), "r": 0.08, "ramp": "fern"},
        ],
    },
    "wall_art_print_kelp": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "navy"},
            {"t": "box", "c0": (0.44, 0.06, 2.34), "c1": (0.56, 0.08, 2.76), "ramp": "teal"},
        ],
    },
    "wall_art_print_lumen": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "crimson"},
            {"t": "box", "c0": (0.30, 0.06, 2.34), "c1": (0.46, 0.08, 2.50), "ramp": "plum"},
            {"t": "box", "c0": (0.54, 0.06, 2.58), "c1": (0.70, 0.08, 2.74), "ramp": "plum"},
        ],
    },
    "wall_art_print_mesa": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "fern"},
            {"t": "box", "c0": (0.30, 0.06, 2.44), "c1": (0.70, 0.08, 2.56), "ramp": "gold"},
        ],
    },
    "wall_art_print_north": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "teal"},
            {"t": "sphere", "c": (0.50, 0.10, 2.55), "r": 0.08, "ramp": "slate"},
        ],
    },
    "wall_art_print_onyx": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "plum"},
            {"t": "box", "c0": (0.44, 0.06, 2.34), "c1": (0.56, 0.08, 2.76), "ramp": "sand"},
        ],
    },
    "wall_art_print_prism": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "gold"},
            {"t": "box", "c0": (0.30, 0.06, 2.34), "c1": (0.46, 0.08, 2.50), "ramp": "oak"},
            {"t": "box", "c0": (0.54, 0.06, 2.58), "c1": (0.70, 0.08, 2.74), "ramp": "oak"},
        ],
    },
    "wall_art_print_quill": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "slate"},
            {"t": "box", "c0": (0.30, 0.06, 2.44), "c1": (0.70, 0.08, 2.56), "ramp": "ivory"},
        ],
    },
    "wall_art_print_ridge": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "sand"},
            {"t": "sphere", "c": (0.50, 0.10, 2.55), "r": 0.08, "ramp": "navy"},
        ],
    },
    "wall_art_print_sol": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "oak"},
            {"t": "box", "c0": (0.44, 0.06, 2.34), "c1": (0.56, 0.08, 2.76), "ramp": "crimson"},
        ],
    },
    "wall_art_print_tide": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80)},
            {"t": "box", "c0": (0.26, 0.04, 2.36), "c1": (0.74, 0.06, 2.74), "ramp": "ivory"},
            {"t": "box", "c0": (0.30, 0.06, 2.34), "c1": (0.46, 0.08, 2.50), "ramp": "fern"},
            {"t": "box", "c0": (0.54, 0.06, 2.58), "c1": (0.70, 0.08, 2.74), "ramp": "fern"},
        ],
    },
    "wall_art_triptych_aurora_left": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.30), "c1": (0.76, 0.04, 2.80)},
            {"t": "box", "c0": (0.30, 0.04, 2.36), "c1": (0.70, 0.06, 2.74), "ramp": "teal"},
            {"t": "box", "c0": (0.44, 0.06, 2.40), "c1": (0.56, 0.08, 2.70), "ramp": "ivory"},
        ],
    },
    "wall_art_triptych_aurora_center": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.30), "c1": (0.76, 0.04, 2.80)},
            {"t": "box", "c0": (0.30, 0.04, 2.36), "c1": (0.70, 0.06, 2.74), "ramp": "teal"},
            {"t": "box", "c0": (0.44, 0.06, 2.40), "c1": (0.56, 0.08, 2.70), "ramp": "ivory"},
        ],
    },
    "wall_art_triptych_aurora_right": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.30), "c1": (0.76, 0.04, 2.80)},
            {"t": "box", "c0": (0.30, 0.04, 2.36), "c1": (0.70, 0.06, 2.74), "ramp": "teal"},
            {"t": "box", "c0": (0.44, 0.06, 2.40), "c1": (0.56, 0.08, 2.70), "ramp": "ivory"},
        ],
    },
    "wall_art_triptych_tide_left": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.30), "c1": (0.76, 0.04, 2.80)},
            {"t": "box", "c0": (0.30, 0.04, 2.36), "c1": (0.70, 0.06, 2.74), "ramp": "navy"},
            {"t": "box", "c0": (0.44, 0.06, 2.40), "c1": (0.56, 0.08, 2.70), "ramp": "ivory"},
        ],
    },
    "wall_art_triptych_tide_center": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.30), "c1": (0.76, 0.04, 2.80)},
            {"t": "box", "c0": (0.30, 0.04, 2.36), "c1": (0.70, 0.06, 2.74), "ramp": "navy"},
            {"t": "box", "c0": (0.44, 0.06, 2.40), "c1": (0.56, 0.08, 2.70), "ramp": "ivory"},
        ],
    },
    "wall_art_triptych_tide_right": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.30), "c1": (0.76, 0.04, 2.80)},
            {"t": "box", "c0": (0.30, 0.04, 2.36), "c1": (0.70, 0.06, 2.74), "ramp": "navy"},
            {"t": "box", "c0": (0.44, 0.06, 2.40), "c1": (0.56, 0.08, 2.70), "ramp": "ivory"},
        ],
    },
    "wall_art_gallery_clock": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.28, 0.00, 2.30), "c1": (0.72, 0.06, 2.80), "bevel": 0.02},
            {"t": "hcyl", "x": 0.5, "y0": 0.06, "y1": 0.08, "z": 2.55, "r": 0.16,
             "caps": False, "ramp": "ivory"},
            {"t": "box", "c0": (0.486, 0.08, 2.55), "c1": (0.514, 0.10, 2.70), "ramp": "charcoal"},
        ],
    },
    "wall_art_sculpture_relief": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "slate",
        "prims": [
            {"t": "box", "c0": (0.20, 0.00, 2.30), "c1": (0.80, 0.04, 2.80), "ramp": "slate"},
            {"t": "box", "c0": (0.28, 0.04, 2.38), "c1": (0.44, 0.10, 2.54), "ramp": "ivory"},
            {"t": "box", "c0": (0.50, 0.04, 2.50), "c1": (0.66, 0.12, 2.66), "ramp": "gold"},
            {"t": "box", "c0": (0.36, 0.04, 2.60), "c1": (0.52, 0.08, 2.72), "ramp": "charcoal"},
        ],
    },
    # ---- Bannerhold pilots (blitz task 5) ----
    # A trestle bench: two solid trestle ends, a thick plank, and a low stretcher. Reads as a
    # bench (long, backless) rather than a sofa or a stool; oak plank over walnut trestles is the
    # set's wood-on-wood idiom. The plank top is the seat surface.
    "bannerhold_oak_bench": {
        "w": 2, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "box", "c0": (0.14, 0.22, 0.00), "c1": (0.30, 0.78, 0.44), "ramp": "walnut"},
            {"t": "box", "c0": (1.70, 0.22, 0.00), "c1": (1.86, 0.78, 0.44), "ramp": "walnut"},
            {"t": "box", "c0": (0.30, 0.44, 0.12), "c1": (1.70, 0.56, 0.20), "ramp": "walnut"},
            {"t": "box", "c0": (0.06, 0.26, 0.44), "c1": (1.94, 0.74, 0.54), "bevel": 0.02,
             "ramp": "oak", "seat": True},
        ],
    },
    # A hanging heraldic banner: a walnut rod, a crimson cloth, and a proud gold crest block.
    # Original mark — a plain charge, no copied coat of arms. Wall part; span/plane/mount are
    # read off the sheet by postpass.
    "bannerhold_crest_banner": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.16, 0.02, 2.90), "c1": (0.84, 0.08, 2.96), "ramp": "walnut"},
            {"t": "box", "c0": (0.24, 0.02, 2.20), "c1": (0.76, 0.06, 2.90), "ramp": "crimson"},
            {"t": "box", "c0": (0.42, 0.06, 2.48), "c1": (0.58, 0.09, 2.68), "ramp": "gold"},
        ],
    },
    # ---- wall clutter (#323) ----
    # Neither uses the full segment: a wall part must start at least its own depth along the wall,
    # and both of these have real depth where a poster has none — a clock case is a box and an
    # antler rack stands off its plaque. The clock spans fx 0.20..0.80 against a depth of 0.155,
    # the antlers fx 0.14..0.86 against 0.115.
    "wall_clock": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.24, 0.00, 2.20), "c1": (0.76, 0.11, 2.84), "bevel": 0.02},
            # Overhanging eave and one gable block, sharing a seam group. There is no tapered box,
            # so a pitch is stacked courses — but every course shows its own flat top, and three
            # of them stacked three dithered orange diamonds into a haystack. Two courses and a
            # line only where the roof meets the case.
            {"t": "box", "c0": (0.20, 0.00, 2.84), "c1": (0.80, 0.13, 2.92), "group": 101},
            {"t": "box", "c0": (0.36, 0.00, 2.92), "c1": (0.64, 0.10, 3.02), "group": 101},
            # Dial: a drum, the record_trophy idiom. An hcyl along fy crests into `hi` around its
            # rim, so the dial reads round instead of as a square ivory patch.
            #
            # Centred at cx 0.5125, not 0.50. The dial stands 0.0125 deeper than the case front,
            # and depth projects into screen x — at 0.50 it sat 2 px left of the case's visible
            # face and ran off its left edge while 4 px of walnut side face piled up on the right.
            # A wall part's contents centre in SCREEN x, which is not the same as centring in fx.
            {"t": "hcyl", "x": 0.5125, "y0": 0.11, "y1": 0.135, "z": 2.54, "r": 0.185,
             "caps": False, "ramp": "ivory"},
            # Hands, 1.3 px of charcoal proud of the dial. Prims are axis-aligned, so the only
            # readable time is 12 and 3 — a diagonal hand is not a shape this rig can hold. Thin
            # rather than thick: at 1.6 px the two met at the boss and read as one dark blob.
            {"t": "box", "c0": (0.4915, 0.135, 2.54), "c1": (0.5335, 0.155, 2.74),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.5125, 0.135, 2.519), "c1": (0.635, 0.155, 2.561),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.4945, 0.035, 2.04), "c1": (0.5305, 0.065, 2.20)},
            {"t": "hcyl", "x": 0.5125, "y0": 0.035, "y1": 0.065, "z": 1.98, "r": 0.085,
             "caps": False, "ramp": "gold"},
        ],
    },
    # The lodge's deer head, cut back to what prims hold. A real rack sweeps in three dimensions;
    # hcyl runs along one footprint axis and cyl only stands upright, so the rack is a beam that
    # steps UP and out from the skull with tines rising off each step.
    #
    # The first pass stepped the beam DOWN and hung eight even tines off it starting inside the
    # plaque, and it rendered as a pipe organ: a comb of identical verticals with the plaque and
    # skull buried behind them. Three things fixed it, and all three are silhouette, not palette —
    # the beam rises outward so the rack opens into a V, three tines a side leave a pixel of air
    # between them where eight left none, and the whole rack starts above the plaque top so the
    # skull reads against wood instead of against its own antlers.
    #
    # Tines are sand on a walnut plaque: the two differ by 62 in green and 78 in blue, where gold
    # on walnut differs mostly in luma and vanishes.
    "antlers": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.26, 0.00, 2.06), "c1": (0.74, 0.045, 2.74), "bevel": 0.03},
            # Skull plate and snout. No engraved nameplate: the first pass put one four z-pixels
            # under the snout and the two ivory prims merged into a single grey slab that read as
            # an inlaid stone panel, not a skull. The skull earns its read from having plaque
            # around it, so it is small and everything else on the plaque is gone.
            {"t": "hcyl", "x": 0.50, "y0": 0.035, "y1": 0.095, "z": 2.52, "r": 0.085,
             "caps": False, "ramp": "ivory"},
            {"t": "cyl", "cx": 0.50, "cy": 0.065, "rx": 0.042, "ry": 0.028, "z0": 2.34,
             "z1": 2.48, "taper": 1.5, "ramp": "ivory"},
            # Beam steps, each overlapping its neighbour by ~1.3 px along fx and ~1.0 px in z. A
            # rack that breaks into islands is one the review pass flags and the eye reads as
            # debris, and at r 0.05 the z step cannot exceed 0.09 without opening a gap.
            {"t": "hcyl", "x": 0.065, "y0": 0.42, "y1": 0.58, "z": 2.60, "r": 0.05,
             "axis": "x", "caps": False, "ramp": "sand"},
            {"t": "hcyl", "x": 0.065, "y0": 0.26, "y1": 0.44, "z": 2.69, "r": 0.05,
             "axis": "x", "caps": False, "ramp": "sand"},
            {"t": "hcyl", "x": 0.065, "y0": 0.56, "y1": 0.74, "z": 2.69, "r": 0.05,
             "axis": "x", "caps": False, "ramp": "sand"},
            {"t": "hcyl", "x": 0.065, "y0": 0.14, "y1": 0.30, "z": 2.78, "r": 0.05,
             "axis": "x", "caps": False, "ramp": "sand"},
            {"t": "hcyl", "x": 0.065, "y0": 0.70, "y1": 0.86, "z": 2.78, "r": 0.05,
             "axis": "x", "caps": False, "ramp": "sand"},
            # Brow, inner and outer tines. The heights are deliberately uneven — a rack whose
            # tips line up is a fence.
            {"t": "cyl", "cx": 0.42, "cy": 0.07, "rx": 0.032, "ry": 0.032, "z0": 2.58,
             "z1": 2.86, "taper": 0.30, "ramp": "sand"},
            {"t": "cyl", "cx": 0.58, "cy": 0.07, "rx": 0.032, "ry": 0.032, "z0": 2.58,
             "z1": 2.86, "taper": 0.30, "ramp": "sand"},
            {"t": "cyl", "cx": 0.31, "cy": 0.07, "rx": 0.036, "ry": 0.036, "z0": 2.68,
             "z1": 3.26, "taper": 0.22, "ramp": "sand"},
            {"t": "cyl", "cx": 0.69, "cy": 0.07, "rx": 0.036, "ry": 0.036, "z0": 2.68,
             "z1": 3.26, "taper": 0.22, "ramp": "sand"},
            {"t": "cyl", "cx": 0.19, "cy": 0.07, "rx": 0.032, "ry": 0.032, "z0": 2.77,
             "z1": 3.04, "taper": 0.30, "ramp": "sand"},
            {"t": "cyl", "cx": 0.81, "cy": 0.07, "rx": 0.032, "ry": 0.032, "z0": 2.77,
             "z1": 3.04, "taper": 0.30, "ramp": "sand"},
        ],
    },
    # ---- penthouse suites (#356) ----
    # Art deco for The Grand's suites: navy lacquer and charcoal carcases, gold trim, ivory
    # upholstery and stone. The four read against each other in hue as well as luma, which is what
    # lets gold sit on navy and charcoal alike where it disappears into walnut.
    #
    # Every carcase in the set is stepped rather than slabbed — plinth, body, band, top — because a
    # step is the one deco move this rig holds exactly: a proud prim breaks the silhouette, and the
    # silhouette is the only place a 1-tile part has room to say anything.
    "bed_grand": {
        "w": 2, "l": 2, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.00, 0.00, 0.00), "c1": (2.00, 2.00, 0.18),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.04, 0.04, 0.18), "c1": (1.96, 1.96, 0.46), "bevel": 0.03},
            # Proud gold band round the whole frame — wider than the body above and below it, so
            # it is a step in the silhouette rather than a stripe on a face.
            {"t": "box", "c0": (0.00, 0.00, 0.46), "c1": (2.00, 2.00, 0.52), "ramp": "gold"},
            {"t": "box", "c0": (0.10, 0.10, 0.52), "c1": (1.90, 1.74, 0.70), "ramp": "ivory"},
            # One coverlet slab across both tiles, like bed_basic: two tagged cushions would put
            # the near/far split at one cushion's centroid and cut the bed off-centre.
            {"t": "box", "c0": (0.06, 0.06, 0.68), "c1": (1.94, 1.42, 0.82), "bevel": 0.05,
             "seat": True},
            {"t": "box", "c0": (0.18, 1.46, 0.70), "c1": (0.96, 1.72, 0.88), "bevel": 0.06,
             "ramp": "ivory"},
            {"t": "box", "c0": (1.04, 1.46, 0.70), "c1": (1.82, 1.72, 0.88), "bevel": 0.06,
             "ramp": "ivory"},
            {"t": "box", "c0": (0.02, 1.78, 0.18), "c1": (1.98, 2.00, 1.46), "bevel": 0.03},
            # Fan of gold pilasters, standing 0.04 proud of the headboard face at low fy — the
            # headboard's own high-fy side is the one the camera sees, so the fan is read through
            # the silhouette break at its top, not through the face it is glued to.
            {"t": "box", "c0": (0.30, 1.74, 0.90), "c1": (0.42, 1.78, 1.40), "ramp": "gold"},
            {"t": "box", "c0": (0.94, 1.74, 0.86), "c1": (1.06, 1.78, 1.44), "ramp": "gold"},
            {"t": "box", "c0": (1.58, 1.74, 0.90), "c1": (1.70, 1.78, 1.40), "ramp": "gold"},
            {"t": "box", "c0": (0.00, 1.76, 1.46), "c1": (2.00, 2.00, 1.54), "bevel": 0.02,
             "ramp": "gold"},
        ],
    },
    # The mirror is at LOW fy, the far side: high fy is nearest the camera, so a mirror mounted at
    # the back of the table would stand in front of it on screen. Low fy puts the table in front
    # and the glass rising behind it, which is what a vanity looks like.
    "vanity_deco": {
        "w": 2, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.10, 0.16, 0.00), "c1": (0.24, 0.30, 0.62), "ramp": "charcoal"},
            {"t": "box", "c0": (1.76, 0.16, 0.00), "c1": (1.90, 0.30, 0.62), "ramp": "charcoal"},
            {"t": "box", "c0": (0.10, 0.70, 0.00), "c1": (0.24, 0.84, 0.62), "ramp": "charcoal"},
            {"t": "box", "c0": (1.76, 0.70, 0.00), "c1": (1.90, 0.84, 0.62), "ramp": "charcoal"},
            {"t": "box", "c0": (0.06, 0.12, 0.62), "c1": (1.94, 0.88, 0.92), "bevel": 0.03},
            {"t": "box", "c0": (0.20, 0.06, 0.70), "c1": (0.80, 0.12, 0.76), "ramp": "gold"},
            {"t": "box", "c0": (1.20, 0.06, 0.70), "c1": (1.80, 0.12, 0.76), "ramp": "gold"},
            {"t": "box", "c0": (0.00, 0.04, 0.88), "c1": (2.00, 0.96, 0.93), "ramp": "gold"},
            # Black marble, not ivory. The furni pass renders with cast shadows on, so the mirror
            # standing over this slab drops a hard half-moon across it — two bands darker, aligned
            # to nothing, and invisible to every gate. On ivory that is a stain (top 0xcbc0ac to
            # left 0x656056, 97 luma apart); on charcoal the same drop is 50 and reads as the
            # shading a lacquered top would have anyway.
            {"t": "box", "c0": (0.00, 0.06, 0.92), "c1": (2.00, 0.94, 0.98), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.50, 0.15, 0.98), "c1": (0.56, 0.21, 1.46), "ramp": "gold"},
            {"t": "box", "c0": (1.44, 0.15, 0.98), "c1": (1.50, 0.21, 1.46), "ramp": "gold"},
            # An oval glass is an hcyl run along fy with its caps off: the disc faces ±fy, so the
            # +fy face is the one the camera sees. The slate disc sits 0.03 proud of the gold one
            # at a smaller radius, which leaves the rim.
            {"t": "hcyl", "x": 1.00, "y0": 0.14, "y1": 0.20, "z": 1.44, "r": 0.42,
             "caps": False, "ramp": "gold"},
            {"t": "hcyl", "x": 1.00, "y0": 0.20, "y1": 0.23, "z": 1.44, "r": 0.34,
             "caps": False, "ramp": "slate"},
        ],
    },
    "chaise_deco": {
        "w": 2, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.10, 0.14, 0.00), "c1": (0.24, 0.28, 0.18), "ramp": "charcoal"},
            {"t": "box", "c0": (1.76, 0.14, 0.00), "c1": (1.90, 0.28, 0.18), "ramp": "charcoal"},
            {"t": "box", "c0": (0.10, 0.72, 0.00), "c1": (0.24, 0.86, 0.18), "ramp": "charcoal"},
            {"t": "box", "c0": (1.76, 0.72, 0.00), "c1": (1.90, 0.86, 0.18), "ramp": "charcoal"},
            {"t": "box", "c0": (0.06, 0.10, 0.18), "c1": (1.94, 0.90, 0.52), "bevel": 0.04},
            {"t": "box", "c0": (0.20, 0.06, 0.28), "c1": (1.80, 0.10, 0.34), "ramp": "gold"},
            {"t": "box", "c0": (0.02, 0.06, 0.52), "c1": (1.98, 0.94, 0.58), "ramp": "gold"},
            {"t": "box", "c0": (0.10, 0.14, 0.58), "c1": (1.90, 0.86, 0.76), "bevel": 0.06,
             "ramp": "ivory", "seat": True},
            # The bolster is what makes this a chaise and not a bench: one end only, and curved so
            # its crest reaches `hi` where a flush navy block would share the frame's luma bucket.
            {"t": "hcyl", "x": 0.22, "y0": 0.16, "y1": 0.84, "z": 0.86, "r": 0.16},
            {"t": "box", "c0": (0.30, 0.72, 0.72), "c1": (1.90, 0.92, 1.10), "bevel": 0.06},
            {"t": "box", "c0": (0.28, 0.70, 1.10), "c1": (1.92, 0.94, 1.16), "bevel": 0.02,
             "ramp": "gold"},
        ],
    },
    "armoire_deco": {
        "w": 2, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.04, 0.16, 0.00), "c1": (1.96, 0.86, 0.16), "bevel": 0.02},
            {"t": "box", "c0": (0.08, 0.18, 0.16), "c1": (1.92, 0.84, 2.30), "bevel": 0.03},
            {"t": "box", "c0": (0.18, 0.12, 0.42), "c1": (0.94, 0.18, 1.96), "ramp": "ivory"},
            {"t": "box", "c0": (1.06, 0.12, 0.42), "c1": (1.82, 0.18, 1.96), "ramp": "ivory"},
            {"t": "box", "c0": (0.96, 0.10, 0.30), "c1": (1.04, 0.18, 2.08), "ramp": "gold"},
            {"t": "box", "c0": (0.16, 0.10, 0.30), "c1": (1.84, 0.16, 0.38), "ramp": "gold"},
            {"t": "box", "c0": (0.16, 0.10, 2.00), "c1": (1.84, 0.16, 2.08), "ramp": "gold"},
            {"t": "cyl", "cx": 0.88, "cy": 0.09, "rx": 0.03, "ry": 0.03, "z0": 1.10, "z1": 1.32,
             "ramp": "gold"},
            {"t": "cyl", "cx": 1.12, "cy": 0.09, "rx": 0.03, "ry": 0.03, "z0": 1.10, "z1": 1.32,
             "ramp": "gold"},
            {"t": "box", "c0": (0.00, 0.12, 2.30), "c1": (2.00, 0.90, 2.44), "bevel": 0.03,
             "ramp": "gold"},
            # Stepped crown, the deco skyline move: one narrower course on top of the cornice, in
            # the body colour so the gold band reads as the line between them.
            {"t": "box", "c0": (0.14, 0.20, 2.44), "c1": (1.86, 0.84, 2.54), "bevel": 0.02,
             "ramp": "navy"},
        ],
    },
    "barcart_deco": {
        "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "cyl", "cx": 0.18, "cy": 0.18, "rx": 0.07, "ry": 0.07, "z0": 0.00, "z1": 0.10,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.82, "cy": 0.18, "rx": 0.07, "ry": 0.07, "z0": 0.00, "z1": 0.10,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.18, "cy": 0.82, "rx": 0.07, "ry": 0.07, "z0": 0.00, "z1": 0.10,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.82, "cy": 0.82, "rx": 0.07, "ry": 0.07, "z0": 0.00, "z1": 0.10,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.14, 0.14, 0.10), "c1": (0.22, 0.22, 1.06)},
            {"t": "box", "c0": (0.78, 0.14, 0.10), "c1": (0.86, 0.22, 1.06)},
            {"t": "box", "c0": (0.14, 0.78, 0.10), "c1": (0.22, 0.86, 1.06)},
            {"t": "box", "c0": (0.78, 0.78, 0.10), "c1": (0.86, 0.86, 1.06)},
            {"t": "box", "c0": (0.08, 0.08, 0.32), "c1": (0.92, 0.92, 0.36)},
            # Both trays are charcoal for the shadow reason the vanity documents, and the lower one
            # is the worst case in the pack: the upper tray covers all but an L of it, so an ivory
            # shelf came back as a grey rectangle with a hard diagonal edge through the middle.
            # Raising the tray until the shadow clears it needs 1.1 units of headroom, which is a
            # different object; darkening the surface costs nothing and a black-lacquer trolley is
            # the more deco cart anyway.
            {"t": "box", "c0": (0.10, 0.10, 0.36), "c1": (0.90, 0.90, 0.42), "ramp": "charcoal"},
            {"t": "box", "c0": (0.04, 0.04, 0.96), "c1": (0.96, 0.96, 1.00)},
            {"t": "box", "c0": (0.06, 0.06, 1.00), "c1": (0.94, 0.94, 1.06), "ramp": "charcoal"},
            # Push handle, capless so it runs post to post without a bulge at either end.
            {"t": "hcyl", "x": 0.18, "y0": 0.10, "y1": 0.90, "z": 1.18, "r": 0.05, "axis": "x",
             "caps": False},
            {"t": "cyl", "cx": 0.36, "cy": 0.44, "rx": 0.07, "ry": 0.07, "z0": 1.06, "z1": 1.34,
             "taper": 0.45, "ramp": "plum"},
            {"t": "cyl", "cx": 0.58, "cy": 0.62, "rx": 0.07, "ry": 0.07, "z0": 1.06, "z1": 1.40,
             "taper": 0.45, "ramp": "fern"},
            {"t": "cyl", "cx": 0.68, "cy": 0.34, "rx": 0.06, "ry": 0.06, "z0": 1.06, "z1": 1.20,
             "taper": 1.40, "ramp": "ivory"},
        ],
    },
    # Three panels stepped across the tile in plan, not one slab: the fold is the whole object, and
    # it is the only thing that distinguishes a screen from divider_basic. The insets are on the
    # HIGH-fy face — a screen is double-sided, so the decorated face may as well be the one the
    # camera sees at dir 0, where the catalog's machines all hide their fronts.
    "screen_deco": {
        "w": 2, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "box", "c0": (0.00, 0.10, 0.00), "c1": (0.68, 0.26, 1.86), "bevel": 0.02},
            {"t": "box", "c0": (0.66, 0.42, 0.00), "c1": (1.34, 0.58, 1.98), "bevel": 0.02},
            {"t": "box", "c0": (1.32, 0.74, 0.00), "c1": (2.00, 0.90, 1.86), "bevel": 0.02},
            # Hinge stiles, and they are not decoration. Without them the three panels only
            # OVERLAP on screen at dir 0 and separate into three loose boards at dirs 2 and 6 —
            # reviewIslands called it, and it was right. Each stile bridges the fy step between
            # two panels and overlaps both in fx, so the screen is one solid piece at every angle.
            {"t": "box", "c0": (0.64, 0.10, 0.00), "c1": (0.70, 0.58, 1.86), "bevel": 0.02},
            {"t": "box", "c0": (1.30, 0.42, 0.00), "c1": (1.36, 0.90, 1.86), "bevel": 0.02},
            {"t": "box", "c0": (0.00, 0.07, 1.86), "c1": (0.68, 0.29, 1.94), "ramp": "gold"},
            {"t": "box", "c0": (0.66, 0.39, 1.98), "c1": (1.34, 0.61, 2.06), "ramp": "gold"},
            {"t": "box", "c0": (1.32, 0.71, 1.86), "c1": (2.00, 0.93, 1.94), "ramp": "gold"},
            {"t": "box", "c0": (0.08, 0.26, 0.30), "c1": (0.60, 0.32, 1.60), "ramp": "ivory"},
            {"t": "box", "c0": (0.74, 0.58, 0.30), "c1": (1.26, 0.64, 1.72), "ramp": "ivory"},
            {"t": "box", "c0": (1.40, 0.90, 0.30), "c1": (1.92, 0.96, 1.60), "ramp": "ivory"},
            {"t": "box", "c0": (0.26, 0.32, 1.62), "c1": (0.42, 0.36, 1.80), "ramp": "gold"},
            {"t": "box", "c0": (0.92, 0.64, 1.74), "c1": (1.08, 0.68, 1.92), "ramp": "gold"},
            {"t": "box", "c0": (1.58, 0.96, 1.62), "c1": (1.74, 1.00, 1.80), "ramp": "gold"},
        ],
    },
    "mirror_standing": {
        "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "box", "c0": (0.10, 0.28, 0.00), "c1": (0.24, 0.72, 0.10), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.76, 0.28, 0.00), "c1": (0.90, 0.72, 0.10), "bevel": 0.02,
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.14, 0.46, 0.10), "c1": (0.20, 0.54, 1.62)},
            {"t": "box", "c0": (0.80, 0.46, 0.10), "c1": (0.86, 0.54, 1.62)},
            {"t": "hcyl", "x": 0.50, "y0": 0.14, "y1": 0.86, "z": 0.26, "r": 0.05, "axis": "x",
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.14, "y1": 0.86, "z": 1.62, "r": 0.05, "axis": "x",
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.44, "y1": 0.50, "z": 0.92, "r": 0.40,
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.50, "y1": 0.56, "z": 0.92, "r": 0.33,
             "caps": False, "ramp": "slate"},
            {"t": "box", "c0": (0.13, 0.44, 0.72), "c1": (0.21, 0.56, 0.88), "ramp": "navy"},
            {"t": "box", "c0": (0.79, 0.44, 0.72), "c1": (0.87, 0.56, 0.88), "ramp": "navy"},
            {"t": "sphere", "c": (0.17, 0.50, 1.72), "r": 0.075},
            {"t": "sphere", "c": (0.83, 0.50, 1.72), "r": 0.075},
        ],
    },
    "ottoman_deco": {
        "w": 1, "l": 1, "ramp": "navy",
        "prims": [
            {"t": "cyl", "cx": 0.20, "cy": 0.20, "rx": 0.05, "ry": 0.05, "z0": 0.00, "z1": 0.16,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.80, "cy": 0.20, "rx": 0.05, "ry": 0.05, "z0": 0.00, "z1": 0.16,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.20, "cy": 0.80, "rx": 0.05, "ry": 0.05, "z0": 0.00, "z1": 0.16,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.80, "cy": 0.80, "rx": 0.05, "ry": 0.05, "z0": 0.00, "z1": 0.16,
             "ramp": "gold"},
            {"t": "box", "c0": (0.10, 0.10, 0.16), "c1": (0.90, 0.90, 0.52), "bevel": 0.05},
            {"t": "box", "c0": (0.06, 0.06, 0.52), "c1": (0.94, 0.94, 0.58), "ramp": "gold"},
            {"t": "box", "c0": (0.08, 0.08, 0.58), "c1": (0.92, 0.92, 0.74), "bevel": 0.08,
             "ramp": "ivory", "seat": True},
        ],
    },
    "dresser_deco": {
        "w": 2, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.06, 0.16, 0.00), "c1": (1.94, 0.86, 0.14), "bevel": 0.02},
            {"t": "box", "c0": (0.10, 0.18, 0.14), "c1": (1.90, 0.84, 1.02), "bevel": 0.03},
            {"t": "box", "c0": (0.18, 0.12, 0.24), "c1": (1.82, 0.18, 0.48), "ramp": "ivory"},
            {"t": "box", "c0": (0.18, 0.12, 0.56), "c1": (1.82, 0.18, 0.80), "ramp": "ivory"},
            {"t": "box", "c0": (0.60, 0.08, 0.32), "c1": (1.40, 0.12, 0.38), "ramp": "gold"},
            {"t": "box", "c0": (0.60, 0.08, 0.64), "c1": (1.40, 0.12, 0.70), "ramp": "gold"},
            # Fluting on the high-fy side, standing proud of the top slab above it so the eave
            # cannot bury it — the casino_table apron lesson, one axis over.
            {"t": "box", "c0": (0.30, 0.84, 0.20), "c1": (0.38, 0.94, 0.96), "ramp": "gold"},
            {"t": "box", "c0": (0.96, 0.84, 0.20), "c1": (1.04, 0.94, 0.96), "ramp": "gold"},
            {"t": "box", "c0": (1.62, 0.84, 0.20), "c1": (1.70, 0.94, 0.96), "ramp": "gold"},
            {"t": "box", "c0": (0.00, 0.08, 0.98), "c1": (2.00, 0.92, 1.02), "ramp": "gold"},
            {"t": "box", "c0": (0.00, 0.10, 1.02), "c1": (2.00, 0.90, 1.10), "bevel": 0.02,
             "ramp": "ivory"},
        ],
    },
    "lamp_deco": {
        "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.34, "ry": 0.34, "z0": 0.00, "z1": 0.06,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.26, "ry": 0.26, "z0": 0.06, "z1": 0.14,
             "taper": 0.70},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.05, "ry": 0.05, "z0": 0.14, "z1": 1.62},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.14, "ry": 0.14, "z0": 0.74, "z1": 0.82},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.10, "ry": 0.10, "z0": 0.82, "z1": 0.98,
             "ramp": "navy"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.14, "ry": 0.14, "z0": 0.98, "z1": 1.06},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.36, "ry": 0.36, "z0": 1.56, "z1": 1.64},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.34, "ry": 0.34, "z0": 1.62, "z1": 2.14,
             "taper": 0.62, "ramp": "ivory"},
            {"t": "sphere", "c": (0.50, 0.50, 2.18), "r": 0.05},
        ],
    },
    # ---- penthouse wall parts (#356) ----
    # Both are centred on their segment (fx_min + fx_max == 1) and start at least their own depth
    # along the wall, because depth projects into screen width.
    "sconce_deco": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "box", "c0": (0.42, 0.00, 2.20), "c1": (0.58, 0.04, 2.86), "bevel": 0.02},
            {"t": "box", "c0": (0.40, 0.04, 2.42), "c1": (0.60, 0.12, 2.62), "ramp": "navy"},
            # Stepped fan, widening upward — the deco shell, as the only pitch this rig can cut.
            {"t": "box", "c0": (0.30, 0.04, 2.62), "c1": (0.70, 0.14, 2.70), "ramp": "ivory"},
            {"t": "box", "c0": (0.24, 0.04, 2.70), "c1": (0.76, 0.16, 2.78), "ramp": "ivory"},
            {"t": "box", "c0": (0.18, 0.04, 2.78), "c1": (0.82, 0.16, 2.86), "ramp": "ivory"},
            {"t": "box", "c0": (0.34, 0.14, 2.70), "c1": (0.38, 0.16, 2.88)},
            {"t": "box", "c0": (0.48, 0.14, 2.66), "c1": (0.52, 0.16, 2.88)},
            {"t": "box", "c0": (0.62, 0.14, 2.70), "c1": (0.66, 0.16, 2.88)},
            {"t": "sphere", "c": (0.50, 0.08, 2.38), "r": 0.06},
        ],
    },
    "wallmirror_deco": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "gold",
        "prims": [
            {"t": "hcyl", "x": 0.50, "y0": 0.00, "y1": 0.030, "z": 2.56, "r": 0.26,
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.030, "y1": 0.045, "z": 2.56, "r": 0.225,
             "caps": False, "ramp": "navy"},
            {"t": "hcyl", "x": 0.50, "y0": 0.045, "y1": 0.070, "z": 2.56, "r": 0.20,
             "caps": False, "ramp": "slate"},
            # Rays. Four on the axes and four stubs between, all flush at fy 0-0.03 so the disc
            # stands proud of them: prims are axis-aligned, so a true sunburst is out of reach and
            # what sells it is the tips breaking the disc's circle at eight places.
            {"t": "box", "c0": (0.47, 0.00, 2.84), "c1": (0.53, 0.03, 3.00)},
            {"t": "box", "c0": (0.47, 0.00, 2.04), "c1": (0.53, 0.03, 2.30)},
            {"t": "box", "c0": (0.14, 0.00, 2.53), "c1": (0.28, 0.03, 2.59)},
            {"t": "box", "c0": (0.72, 0.00, 2.53), "c1": (0.86, 0.03, 2.59)},
            {"t": "box", "c0": (0.32, 0.00, 2.72), "c1": (0.38, 0.03, 2.88)},
            {"t": "box", "c0": (0.62, 0.00, 2.72), "c1": (0.68, 0.03, 2.88)},
            {"t": "box", "c0": (0.32, 0.00, 2.24), "c1": (0.38, 0.03, 2.40)},
            {"t": "box", "c0": (0.62, 0.00, 2.24), "c1": (0.68, 0.03, 2.40)},
        ],
    },
    "stereo_basic": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.10, 0.25, 0.00), "c1": (0.90, 0.75, 1.30), "bevel": 0.03},
            {"t": "hcyl", "x": 0.50, "y0": 0.14, "y1": 0.26, "z": 0.32, "r": 0.17, "ramp": "gold"},
            {"t": "hcyl", "x": 0.50, "y0": 0.16, "y1": 0.26, "z": 0.96, "r": 0.11, "ramp": "gold"},
            {"t": "box", "c0": (0.14, 0.28, 1.30), "c1": (0.86, 0.72, 1.36), "ramp": "slate"},
        ],
    },
    # ---- jazz lounge (#358) --------------------------------------------------------------
    # Stage and venue furni. Charcoal hardware, crimson upholstery, gold fittings and plum
    # surfaces — four ramps that differ in hue, so every colorway swap moves a base colour
    # rather than a luma step (the gold-on-walnut trap).

    # The only walkable part authored above rug height. canWalk puts it on the client's
    # floor_furni layer and server/room.ts tileZ raises anyone standing on it by stackHeights[0],
    # so the riser is a real step rather than a painted one. Three slabs, each proud of the one
    # under it — coplanar slabs z-fight, which is the rug_lodge lesson on a horizontal face.
    "stage_platform": {
        "w": 2, "l": 2, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.00, 0.00, 0.000), "c1": (2.00, 2.00, 0.190)},
            {"t": "box", "c0": (0.00, 0.00, 0.190), "c1": (2.00, 2.00, 0.220), "ramp": "gold"},
            {"t": "box", "c0": (0.07, 0.07, 0.220), "c1": (1.93, 1.93, 0.250), "ramp": "plum"},
        ],
    },
    # gateBounds wants ground contact within half a tile of the ground line in all four
    # directions. On a 2x2 that means the ground prims must reach fx+fy >= 2.9375 and <= 1.0625
    # AND spread >= 0.9375 both ways in fx-fy — four corners, not three. A real grand piano has
    # three legs, so the bass corner gets a fourth pulled in to (1.44..1.56) where the case still
    # covers it: the leg is invisible under the lid and the gate is satisfied by geometry rather
    # than by relaxing it (the billiards_table lesson, one rotation further on).
    #
    # The lid stays CLOSED. The first pass opened it as two stepped courses and the piano read as
    # a grey table with a crate on it: an open lid is a tilted plane, prims are axis-aligned, and
    # the staircase that approximates it has no piano in it. What carries the read instead is the
    # plan — a three-step wing with a cut bass corner, outlined in gold — plus a keyboard wide
    # enough to see and a music desk for silhouette. Shape first, then the accent on its edge.
    "grand_piano": {
        "w": 2, "l": 2, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.16, 0.16, 0.00), "c1": (0.28, 0.28, 0.90)},
            {"t": "box", "c0": (1.72, 0.16, 0.00), "c1": (1.84, 0.28, 0.90)},
            {"t": "box", "c0": (0.16, 1.66, 0.00), "c1": (0.28, 1.78, 0.90)},
            {"t": "box", "c0": (1.44, 1.44, 0.00), "c1": (1.56, 1.56, 0.90)},
            # Pedal lyre, hung under the keyboard end.
            {"t": "box", "c0": (0.88, 0.30, 0.16), "c1": (1.02, 0.42, 0.90)},
            {"t": "box", "c0": (0.82, 0.24, 0.16), "c1": (1.08, 0.34, 0.22), "ramp": "gold"},
            # Case, three courses in one seam group — the steps are a curve, and a detail line at
            # each one would draw the staircase the shape is trying not to be.
            {"t": "box", "c0": (0.06, 0.06, 0.90), "c1": (1.90, 1.10, 1.06), "group": 100},
            {"t": "box", "c0": (0.06, 1.10, 0.90), "c1": (1.70, 1.55, 1.06), "group": 100},
            {"t": "box", "c0": (0.06, 1.55, 0.90), "c1": (1.30, 1.92, 1.06), "group": 100},
            # Gold rim: wider than the case in plan and 1 z-px proud, so it breaks the silhouette
            # instead of hiding under the lid (the side_table inlay idiom, wing-shaped).
            {"t": "box", "c0": (0.02, 0.02, 1.06), "c1": (1.94, 1.12, 1.10), "ramp": "gold",
             "group": 101},
            {"t": "box", "c0": (0.02, 1.12, 1.06), "c1": (1.74, 1.57, 1.10), "ramp": "gold",
             "group": 101},
            {"t": "box", "c0": (0.02, 1.57, 1.06), "c1": (1.34, 1.96, 1.10), "ramp": "gold",
             "group": 101},
            # Lid, proud inside the gold and set back in fy to leave the band clear for the keys.
            {"t": "box", "c0": (0.10, 0.34, 1.10), "c1": (1.86, 1.08, 1.17), "group": 102},
            {"t": "box", "c0": (0.10, 1.08, 1.10), "c1": (1.66, 1.53, 1.17), "group": 102},
            {"t": "box", "c0": (0.10, 1.53, 1.10), "c1": (1.26, 1.88, 1.17), "group": 102},
            # Keyboard along low fy with the rest of the catalog's fronts. 0.28 deep, which is
            # 9 px — the first pass gave it 0.11 and the lid edge ate all of it.
            {"t": "box", "c0": (0.14, 0.06, 1.10), "c1": (1.82, 0.34, 1.16), "ramp": "ivory"},
            {"t": "box", "c0": (0.22, 0.22, 1.16), "c1": (1.74, 0.32, 1.185)},
            # The lid, propped. Three courses rising across fy in ONE seam group: a tilted plane
            # is out of reach for axis-aligned prims, and what stands in for it is a staircase
            # with no lines drawn on it. A centred music desk stood here first and read as a
            # fence — the lid has to run the full width of the case or it is a different object.
            {"t": "box", "c0": (0.14, 1.00, 1.17), "c1": (1.62, 1.20, 1.32), "group": 103},
            {"t": "box", "c0": (0.14, 1.20, 1.17), "c1": (1.62, 1.36, 1.50), "group": 103},
            {"t": "box", "c0": (0.14, 1.36, 1.17), "c1": (1.60, 1.52, 1.68), "group": 103},
            {"t": "box", "c0": (0.12, 1.34, 1.68), "c1": (1.62, 1.54, 1.72), "ramp": "gold"},
        ],
    },
    # A cyl's ellipse is its FOOTPRINT cross-section, so a wide-and-shallow one is exactly a bass
    # body seen face on: 0.34 across, 0.145 deep. Three courses tapered against each other give
    # the waist a single extrusion cannot — and they share ONE seam group, because the detail
    # line the post-pass draws at each course boundary is what made the first pass read as
    # stacked cylinders, which is to say as a bottle.
    # oak, not walnut: walnut's hi clamps to a bright orange that made the first pass read as a
    # varnished bottle. oak is the same family two steps darker and never clamps.
    "double_bass": {
        "w": 1, "l": 1, "ramp": "oak",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.12, "ry": 0.12, "z0": 0.00, "z1": 0.045,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.04, "ry": 0.04, "z0": 0.00, "z1": 0.28,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.34, "ry": 0.145, "z0": 0.26, "z1": 0.80,
             "taper": 0.66, "group": 100},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.22, "ry": 0.135, "z0": 0.76, "z1": 0.98,
             "taper": 1.30, "group": 100},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.29, "ry": 0.14, "z0": 0.94, "z1": 1.46,
             "taper": 0.62, "group": 100},
            # Everything below stands proud of the belly (front face at fy 0.355): flush charcoal
            # on walnut shares a luma bucket and disappears.
            {"t": "box", "c0": (0.30, 0.30, 0.82), "c1": (0.345, 0.37, 1.06), "ramp": "charcoal"},
            {"t": "box", "c0": (0.655, 0.30, 0.82), "c1": (0.70, 0.37, 1.06), "ramp": "charcoal"},
            {"t": "box", "c0": (0.44, 0.30, 0.44), "c1": (0.56, 0.37, 0.80), "ramp": "charcoal"},
            {"t": "box", "c0": (0.37, 0.30, 0.80), "c1": (0.63, 0.36, 0.90), "ramp": "sand"},
            # One pale strip for four strings: at 32 px per tile a bass's string spacing is under
            # a pixel, so what reads is that something light runs the whole neck.
            {"t": "box", "c0": (0.465, 0.29, 0.84), "c1": (0.535, 0.315, 2.00), "ramp": "sand"},
            {"t": "cyl", "cx": 0.50, "cy": 0.46, "rx": 0.065, "ry": 0.065, "z0": 1.50,
             "z1": 2.06},
            {"t": "box", "c0": (0.44, 0.30, 1.44), "c1": (0.56, 0.38, 2.02), "ramp": "charcoal"},
            {"t": "box", "c0": (0.43, 0.36, 2.02), "c1": (0.57, 0.50, 2.24)},
            {"t": "hcyl", "x": 0.50, "y0": 0.30, "y1": 0.60, "z": 2.14, "r": 0.03,
             "axis": "x", "caps": False, "ramp": "gold"},
            {"t": "sphere", "c": (0.50, 0.44, 2.28), "r": 0.085},
        ],
    },
    # gateBounds again, and the reason the kit is a 2x2: a bass drum alone reaches fx+fy 2.10
    # against a 2.9375 floor. The hardware carries it — hi-hat at the near corner, two cymbal
    # stands on the side corners, floor tom at the far one. Four stands, four rotations.
    "drum_kit": {
        "w": 2, "l": 2, "ramp": "crimson",
        "prims": [
            {"t": "hcyl", "x": 1.00, "y0": 0.60, "y1": 1.08, "z": 0.50, "r": 0.50,
             "caps": False},
            # Head in FRONT of the hoop, not behind it. Low fy is the camera-facing side at two
            # of the four dirs, so the first pass's gold hoop — a solid disc the shell's own
            # radius — stood in front of the head and hid it completely. The hoop only ever shows
            # as the ring the narrower head leaves uncovered.
            {"t": "hcyl", "x": 1.00, "y0": 0.56, "y1": 0.60, "z": 0.50, "r": 0.50,
             "caps": False, "ramp": "gold"},
            {"t": "hcyl", "x": 1.00, "y0": 0.50, "y1": 0.56, "z": 0.50, "r": 0.455,
             "caps": False, "ramp": "ivory"},
            # Kick pedal, tucked under the shell rather than parked in front of it, plus two
            # ground-level hardware bars. reviewIslands is a hard test on the shipped catalog
            # (generator.test.ts "the shipped catalog is quiet"), not a warning, and the two
            # cymbal stands have to stand at the far corners for gateBounds — they are the only
            # ground contact with fx-fy spread. So the stands stay and the rack reaches them.
            {"t": "box", "c0": (0.88, 0.26, 0.00), "c1": (1.12, 0.64, 0.10),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.30, 0.26, 0.00), "c1": (1.64, 0.42, 0.08),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.26, 0.34, 0.00), "c1": (0.42, 1.64, 0.08),
             "ramp": "charcoal"},
            # Snare on its stand, in front of the kick and off-centre so it does not stack into
            # one column with the rack tom.
            {"t": "cyl", "cx": 0.56, "cy": 1.30, "rx": 0.05, "ry": 0.05, "z0": 0.00, "z1": 0.62,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.56, "cy": 1.30, "rx": 0.26, "ry": 0.26, "z0": 0.62, "z1": 0.80,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.56, "cy": 1.30, "rx": 0.24, "ry": 0.24, "z0": 0.80, "z1": 0.85,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 1.00, "cy": 0.84, "rx": 0.04, "ry": 0.04, "z0": 0.94, "z1": 1.10,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.86, "cy": 0.94, "rx": 0.22, "ry": 0.22, "z0": 1.06, "z1": 1.32},
            {"t": "cyl", "cx": 0.86, "cy": 0.94, "rx": 0.20, "ry": 0.20, "z0": 1.32, "z1": 1.37,
             "ramp": "ivory"},
            # Floor tom pulled in against the kick: at (1.58, 1.58) it stood clear of everything
            # and the review pass read it as debris rather than as part of the kit.
            {"t": "cyl", "cx": 1.48, "cy": 1.42, "rx": 0.34, "ry": 0.34, "z0": 0.00, "z1": 0.14,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 1.48, "cy": 1.42, "rx": 0.30, "ry": 0.30, "z0": 0.14, "z1": 0.86},
            {"t": "cyl", "cx": 1.48, "cy": 1.42, "rx": 0.28, "ry": 0.28, "z0": 0.86, "z1": 0.91,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 0.30, "cy": 0.30, "rx": 0.15, "ry": 0.15, "z0": 0.00, "z1": 0.06,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.30, "cy": 0.30, "rx": 0.04, "ry": 0.04, "z0": 0.06, "z1": 1.10,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.30, "cy": 0.30, "rx": 0.28, "ry": 0.28, "z0": 1.04, "z1": 1.10,
             "taper": 0.55, "ramp": "gold"},
            {"t": "cyl", "cx": 1.72, "cy": 0.32, "rx": 0.15, "ry": 0.15, "z0": 0.00, "z1": 0.06,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 1.72, "cy": 0.32, "rx": 0.04, "ry": 0.04, "z0": 0.06, "z1": 1.46,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 1.72, "cy": 0.32, "rx": 0.34, "ry": 0.34, "z0": 1.40, "z1": 1.46,
             "taper": 0.55, "ramp": "gold"},
            {"t": "cyl", "cx": 0.32, "cy": 1.72, "rx": 0.15, "ry": 0.15, "z0": 0.00, "z1": 0.06,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.32, "cy": 1.72, "rx": 0.04, "ry": 0.04, "z0": 0.06, "z1": 1.28,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.32, "cy": 1.72, "rx": 0.30, "ry": 0.30, "z0": 1.22, "z1": 1.28,
             "taper": 0.55, "ramp": "gold"},
        ],
    },
    # A straight stand, not a boom: a boom arm puts the mic out over the tile edge and the head
    # then reads as a detached island in two of the four directions.
    "mic_stand": {
        "w": 1, "l": 1, "ramp": "slate",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.30, "ry": 0.30, "z0": 0.00, "z1": 0.06,
             "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.22, "ry": 0.22, "z0": 0.06, "z1": 0.13,
             "taper": 0.50, "ramp": "charcoal"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.045, "ry": 0.045, "z0": 0.13,
             "z1": 1.62},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.08, "ry": 0.08, "z0": 0.88, "z1": 0.97,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.075, "ry": 0.075, "z0": 1.62,
             "z1": 1.72, "ramp": "gold"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.085, "ry": 0.085, "z0": 1.72,
             "z1": 1.96, "ramp": "charcoal"},
            {"t": "sphere", "c": (0.50, 0.50, 2.00), "r": 0.115, "ramp": "gold"},
        ],
    },
    # stereo_basic's cabinet, stood up: cones as hcyls proud of the front face, because an hcyl
    # crests into `hi` around its rim and a flush disc would share the cabinet's luma bucket.
    "speaker_column": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.16, 0.24, 0.00), "c1": (0.84, 0.78, 0.10)},
            {"t": "box", "c0": (0.12, 0.20, 0.10), "c1": (0.88, 0.80, 2.28), "bevel": 0.03},
            {"t": "hcyl", "x": 0.50, "y0": 0.12, "y1": 0.22, "z": 0.58, "r": 0.26,
             "ramp": "gold"},
            {"t": "hcyl", "x": 0.50, "y0": 0.14, "y1": 0.22, "z": 1.26, "r": 0.18,
             "ramp": "gold"},
            {"t": "hcyl", "x": 0.50, "y0": 0.15, "y1": 0.22, "z": 1.78, "r": 0.11,
             "ramp": "gold"},
            {"t": "box", "c0": (0.34, 0.14, 2.02), "c1": (0.66, 0.19, 2.14), "ramp": "crimson"},
            {"t": "box", "c0": (0.09, 0.17, 2.28), "c1": (0.91, 0.83, 2.38), "bevel": 0.02,
             "ramp": "slate"},
        ],
    },
    # A booth, not a sofa: the back runs the full 2 tiles and stands a third taller than
    # sofa_lodge's, and the gold kick rail is proud of the base so it survives a quarter turn.
    "velvet_booth": {
        "w": 2, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.10, 0.12, 0.00), "c1": (0.24, 0.26, 0.14),
             "ramp": "charcoal"},
            {"t": "box", "c0": (1.76, 0.12, 0.00), "c1": (1.90, 0.26, 0.14),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.10, 0.72, 0.00), "c1": (0.24, 0.86, 0.14),
             "ramp": "charcoal"},
            {"t": "box", "c0": (1.76, 0.72, 0.00), "c1": (1.90, 0.86, 0.14),
             "ramp": "charcoal"},
            {"t": "box", "c0": (0.06, 0.10, 0.14), "c1": (1.94, 0.92, 0.80), "bevel": 0.04},
            {"t": "box", "c0": (0.02, 0.06, 0.58), "c1": (1.98, 0.12, 0.66), "ramp": "gold"},
            # One seat slab across both tiles: two tagged cushions would put the near/far split
            # at the left cushion's centroid and cut the booth off-centre (the sofa_lodge note).
            {"t": "box", "c0": (0.18, 0.14, 0.76), "c1": (1.82, 0.80, 0.96), "bevel": 0.06,
             "seat": True},
            {"t": "box", "c0": (0.00, 0.10, 0.80), "c1": (0.14, 0.90, 1.34), "bevel": 0.05},
            {"t": "box", "c0": (1.86, 0.10, 0.80), "c1": (2.00, 0.90, 1.34), "bevel": 0.05},
            {"t": "box", "c0": (0.06, 0.74, 0.80), "c1": (1.94, 0.94, 2.08), "bevel": 0.05},
            # Buttons, gold on crimson: the two differ in hue as well as luma, where a crimson
            # tuft on crimson would only be a shade step and read as dirt.
            {"t": "box", "c0": (0.34, 0.68, 1.24), "c1": (0.46, 0.76, 1.34), "ramp": "gold"},
            {"t": "box", "c0": (0.94, 0.68, 1.24), "c1": (1.06, 0.76, 1.34), "ramp": "gold"},
            {"t": "box", "c0": (1.54, 0.68, 1.24), "c1": (1.66, 0.76, 1.34), "ramp": "gold"},
            {"t": "box", "c0": (0.64, 0.68, 1.62), "c1": (0.76, 0.76, 1.72), "ramp": "gold"},
            {"t": "box", "c0": (1.24, 0.68, 1.62), "c1": (1.36, 0.76, 1.72), "ramp": "gold"},
            {"t": "box", "c0": (0.03, 0.71, 2.08), "c1": (1.97, 0.97, 2.18), "bevel": 0.03,
             "ramp": "gold"},
        ],
    },
    # Bar height, so it stands beside the booth rather than in front of it. Plum top inside a
    # gold rim: table_round's inlay, with the accent moved to the wider disc.
    "cocktail_table": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.32, "ry": 0.32, "z0": 0.00, "z1": 0.07},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.26, "ry": 0.26, "z0": 0.07, "z1": 0.14,
             "taper": 0.55},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.075, "ry": 0.075, "z0": 0.14,
             "z1": 1.14, "ramp": "gold"},
            {"t": "sphere", "c": (0.50, 0.50, 0.62), "r": 0.115, "ramp": "gold"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.20, "ry": 0.20, "z0": 1.08, "z1": 1.22,
             "taper": 1.70},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.42, "ry": 0.42, "z0": 1.22, "z1": 1.28,
             "ramp": "gold"},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.36, "ry": 0.36, "z0": 1.26, "z1": 1.34,
             "ramp": "plum"},
        ],
    },
    # A floor par-can on a yoke. The lens is a gold hcyl inside a crimson rim, both proud of the
    # housing — the light is the only warm thing on a charcoal object, which is what makes it
    # read as a lamp rather than as a bollard.
    "stage_light": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.30, "ry": 0.30, "z0": 0.00, "z1": 0.06},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.15, "ry": 0.15, "z0": 0.06, "z1": 0.17,
             "taper": 0.70},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.055, "ry": 0.055, "z0": 0.17,
             "z1": 1.12, "ramp": "slate"},
            {"t": "box", "c0": (0.20, 0.42, 1.06), "c1": (0.80, 0.58, 1.20)},
            {"t": "box", "c0": (0.20, 0.40, 1.20), "c1": (0.28, 0.60, 1.62)},
            {"t": "box", "c0": (0.72, 0.40, 1.20), "c1": (0.80, 0.60, 1.62)},
            {"t": "hcyl", "x": 0.50, "y0": 0.24, "y1": 0.74, "z": 1.42, "r": 0.23,
             "caps": False},
            {"t": "hcyl", "x": 0.50, "y0": 0.19, "y1": 0.24, "z": 1.42, "r": 0.245,
             "caps": False, "ramp": "crimson"},
            {"t": "hcyl", "x": 0.50, "y0": 0.14, "y1": 0.19, "z": 1.42, "r": 0.20,
             "caps": False, "ramp": "gold"},
            {"t": "box", "c0": (0.26, 0.10, 1.58), "c1": (0.74, 0.17, 1.72)},
        ],
    },
    # ---- jazz lounge wall parts (#358) ----
    # Both obey the wall rule: min fx >= max fy, or the mesh renders before its own segment.
    # The sign's glyph is an eighth note — a drum head disc, a stem and two flags. Prims are
    # axis-aligned, so the flags step rather than sweep, and that is as much curve as this rig
    # holds (the antlers lesson).
    "neon_sign": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.14, 0.00, 2.14), "c1": (0.86, 0.05, 2.92), "bevel": 0.02},
            {"t": "box", "c0": (0.13, 0.00, 2.08), "c1": (0.87, 0.06, 2.14), "ramp": "gold"},
            {"t": "box", "c0": (0.13, 0.00, 2.92), "c1": (0.87, 0.06, 2.98), "ramp": "gold"},
            # Plum field proud of the charcoal backing: charcoal and plum differ in hue, so the
            # gold tube on top has something to sit against in both directions.
            {"t": "box", "c0": (0.19, 0.05, 2.19), "c1": (0.81, 0.062, 2.87), "ramp": "plum"},
            {"t": "hcyl", "x": 0.36, "y0": 0.062, "y1": 0.10, "z": 2.38, "r": 0.135,
             "caps": False, "ramp": "gold"},
            {"t": "box", "c0": (0.46, 0.062, 2.38), "c1": (0.52, 0.095, 2.80), "ramp": "gold"},
            {"t": "box", "c0": (0.52, 0.062, 2.70), "c1": (0.68, 0.095, 2.78), "ramp": "gold"},
            {"t": "box", "c0": (0.52, 0.062, 2.54), "c1": (0.64, 0.095, 2.62), "ramp": "gold"},
        ],
    },
    # Folds are vertical cyls, not depth-stepped boxes. Depth projects into screen x, so boxes
    # at different fy would shift sideways and read as a broken edge; a cyl crests into `hi`
    # down its whole length, which is what a drape actually does to light.
    "stage_curtain": {
        "surface": "wall", "w": 1, "l": 1, "ramp": "crimson",
        "prims": [
            {"t": "box", "c0": (0.18, 0.00, 2.00), "c1": (0.82, 0.05, 2.90)},
            {"t": "cyl", "cx": 0.24, "cy": 0.065, "rx": 0.06, "ry": 0.05, "z0": 2.00,
             "z1": 2.90},
            {"t": "cyl", "cx": 0.36, "cy": 0.065, "rx": 0.06, "ry": 0.05, "z0": 2.00,
             "z1": 2.90},
            {"t": "cyl", "cx": 0.48, "cy": 0.065, "rx": 0.06, "ry": 0.05, "z0": 2.00,
             "z1": 2.90},
            {"t": "cyl", "cx": 0.60, "cy": 0.065, "rx": 0.06, "ry": 0.05, "z0": 2.00,
             "z1": 2.90},
            {"t": "cyl", "cx": 0.72, "cy": 0.065, "rx": 0.06, "ry": 0.05, "z0": 2.00,
             "z1": 2.90},
            {"t": "box", "c0": (0.18, 0.02, 2.30), "c1": (0.56, 0.115, 2.40), "ramp": "gold"},
            {"t": "cyl", "cx": 0.56, "cy": 0.07, "rx": 0.05, "ry": 0.045, "z0": 2.14,
             "z1": 2.32, "taper": 0.45, "ramp": "gold"},
            {"t": "box", "c0": (0.16, 0.00, 2.90), "c1": (0.84, 0.115, 3.04), "bevel": 0.02,
             "ramp": "gold"},
        ],
    },
    # ---- grand wheel (#429) ----------------------------------------------------------------
    # The wheel face is an hcyl run along fy with no caps — a bare disc standing in the fx/z
    # plane, the record-disc idiom at spectacle size. Its radius is a WORLD radius, so in
    # footprint coords the disc is an ellipse: 0.86 across fx and 0.86/ZSCALE = 1.053 up z. Every
    # number below that has to sit on the rim is derived from that pair, not from 0.86 twice.
    #
    # 2x1, not 2x2. The disc is thin, and a 2x2 footprint would reserve a tile of floor nothing
    # ever draws into — the wheel would read as standing in the middle of its own empty square.
    #
    # The plinth spans almost the whole footprint on purpose. gateBounds measures the lowest
    # pixel per direction, and on a 2x1 the ground contact has to reach fx+fy >= 1.9375 in all
    # four rotations; only a base that fills the footprint reaches its far corner every time. A
    # narrow pair of feet under the posts passes dir 0 and floats in dir 2.
    "grand_wheel": {
        "w": 2, "l": 1, "ramp": "crimson",
        # The four states the def declares, as four rotations of the face (#430). The step is a
        # quarter of the pins' own 45-degree pitch, so state 3 -> state 0 advances by the same
        # quarter as every other step and the cycle wraps without a jump: the pin ring is its own
        # period, and four states cover exactly one of them. Only the pins carry "spin" — the
        # courses are concentric, so turning them moves no pixel, and the plinth, the posts and
        # the flapper are the parts that must stand still for the face to read as turning.
        "spin": {"cx": 1.00, "cz": 2.30, "step": 11.25, "states": 4},
        "prims": [
            # Gold reads as a foot, not as the plinth. The first pass had the gold slab on top and
            # wider than the charcoal under it, which hid the charcoal from every angle and left a
            # butter-coloured brick carrying the wheel.
            {"t": "box", "c0": (0.02, 0.10, 0.00), "c1": (1.98, 0.90, 0.06), "bevel": 0.02,
             "ramp": "gold"},
            {"t": "box", "c0": (0.06, 0.14, 0.06), "c1": (1.94, 0.86, 0.34), "bevel": 0.03,
             "ramp": "charcoal"},
            # Two posts to the axle rather than one centre column: a centre column sits behind the
            # disc and is invisible from every direction, which leaves the wheel floating.
            {"t": "box", "c0": (0.04, 0.40, 0.34), "c1": (0.22, 0.62, 2.46), "bevel": 0.03,
             "ramp": "charcoal"},
            {"t": "box", "c0": (1.78, 0.40, 0.34), "c1": (1.96, 0.62, 2.46), "bevel": 0.03,
             "ramp": "charcoal"},
            # The gold rim is the full-thickness core; the courses are thin discs laid on each
            # face, so from the front you get a gold ring round a crimson field. Each course is
            # its own seam group, so the postpass draws a detail line at every radius change —
            # that is what makes the face read as a wheel rather than a plate.
            #
            # BOTH faces are dressed. A disc normal of +fy comes back as -fx at dir 2 and -fy at
            # dir 4, so a single-sided wheel shows the player a blank gold plate from half the
            # directions it can be walked past. That is what the first render did.
            #
            # The ring has to be WIDER than the depth step that puts the field in front of it.
            # Depth projects into screen x, so a course 0.05 nearer slides 1.6 px left of the one
            # behind it; at the first pass's 0.08 radius gap that ate the rim on one side and
            # doubled it on the other, and the wheel wore a gold crescent. 0.14 of radius is
            # 4.5 px of ring against 1.6 px of slide, which survives all the way round.
            {"t": "hcyl", "x": 1.00, "y0": 0.34, "y1": 0.60, "z": 2.30, "r": 0.86,
             "caps": False, "ramp": "gold"},
            {"t": "hcyl", "x": 1.00, "y0": 0.60, "y1": 0.65, "z": 2.30, "r": 0.72,
             "caps": False},
            {"t": "hcyl", "x": 1.00, "y0": 0.65, "y1": 0.69, "z": 2.30, "r": 0.36,
             "caps": False, "ramp": "plum"},
            {"t": "hcyl", "x": 1.00, "y0": 0.69, "y1": 0.73, "z": 2.30, "r": 0.12,
             "caps": False, "ramp": "gold"},
            {"t": "hcyl", "x": 1.00, "y0": 0.29, "y1": 0.34, "z": 2.30, "r": 0.72,
             "caps": False},
            {"t": "hcyl", "x": 1.00, "y0": 0.25, "y1": 0.29, "z": 2.30, "r": 0.36,
             "caps": False, "ramp": "plum"},
            {"t": "hcyl", "x": 1.00, "y0": 0.21, "y1": 0.25, "z": 2.30, "r": 0.12,
             "caps": False, "ramp": "gold"},
            # Eight pins through the rim at 45-degree steps, half in and half out of the
            # silhouette. They are what separates a Big Six wheel from a target: the outline comes
            # back cogged, and the cogs are the segment boundaries the pointer counts. Charcoal,
            # because a gold pin on a gold rim is 0 luma of contrast and the first render lost
            # them. They run the rim's own thickness and no further: at the first pass's 0.54 they
            # projected into long horizontal bars and the wheel read as an aerial array.
            #
            # The face is a WORLD circle, so its footprint form is an ellipse: fx = 1 + 0.86 cos,
            # z = 2.30 + 0.86/ZSCALE sin. Offset 22.5 degrees so no pin lands at the horizontal
            # extremes, where it would be buried inside a post.
            {"t": "hcyl", "x": 1.795, "y0": 0.34, "y1": 0.60, "z": 2.703, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 1.329, "y0": 0.34, "y1": 0.60, "z": 3.273, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 0.671, "y0": 0.34, "y1": 0.60, "z": 3.273, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 0.205, "y0": 0.34, "y1": 0.60, "z": 2.703, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 0.205, "y0": 0.34, "y1": 0.60, "z": 1.897, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 0.671, "y0": 0.34, "y1": 0.60, "z": 1.327, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 1.329, "y0": 0.34, "y1": 0.60, "z": 1.327, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            {"t": "hcyl", "x": 1.795, "y0": 0.34, "y1": 0.60, "z": 1.897, "r": 0.055,
             "ramp": "charcoal", "spin": True},
            # The flapper. Widest at the top and narrowest where it meets the pins, centred on the
            # disc's own thickness so it is there from all four sides. It starts below the rim
            # crest so it overlaps the disc — a pointer with a gap under it is a second island in
            # every frame.
            {"t": "cyl", "cx": 1.00, "cy": 0.47, "rx": 0.09, "ry": 0.09, "z0": 3.30, "z1": 3.62,
             "taper": 2.2, "ramp": "gold"},
        ],
    },
    # The odds board that stands beside the wheel. The face is a slab proud of its gold frame in
    # fy, and the three price rows are proud again: depth projects into screen x, so each course
    # steps left and down off the one behind it and reads as raised rather than printed.
    #
    # Both faces are dressed, for the wheel's reason — a board is a sign, and a sign that is blank
    # gold from dirs 2 and 4 is a sign half the room cannot read.
    "wheel_podium": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.14, 0.14, 0.00), "c1": (0.86, 0.86, 0.09), "bevel": 0.02},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.26, "ry": 0.26, "z0": 0.09, "z1": 0.22,
             "taper": 0.55},
            {"t": "cyl", "cx": 0.50, "cy": 0.50, "rx": 0.07, "ry": 0.07, "z0": 0.22, "z1": 1.06,
             "ramp": "slate"},
            {"t": "box", "c0": (0.10, 0.44, 1.06), "c1": (0.90, 0.56, 1.84), "bevel": 0.03,
             "ramp": "gold"},
            {"t": "box", "c0": (0.15, 0.56, 1.10), "c1": (0.85, 0.60, 1.80), "ramp": "crimson"},
            {"t": "box", "c0": (0.21, 0.60, 1.60), "c1": (0.79, 0.65, 1.70), "ramp": "gold"},
            {"t": "box", "c0": (0.21, 0.60, 1.42), "c1": (0.79, 0.65, 1.52), "ramp": "plum"},
            {"t": "box", "c0": (0.21, 0.60, 1.24), "c1": (0.79, 0.65, 1.34), "ramp": "gold"},
            {"t": "box", "c0": (0.15, 0.40, 1.10), "c1": (0.85, 0.44, 1.80), "ramp": "crimson"},
            {"t": "box", "c0": (0.21, 0.35, 1.60), "c1": (0.79, 0.40, 1.70), "ramp": "gold"},
            {"t": "box", "c0": (0.21, 0.35, 1.42), "c1": (0.79, 0.40, 1.52), "ramp": "plum"},
            {"t": "box", "c0": (0.21, 0.35, 1.24), "c1": (0.79, 0.40, 1.34), "ramp": "gold"},
            {"t": "box", "c0": (0.08, 0.42, 1.84), "c1": (0.92, 0.58, 1.92), "bevel": 0.02,
             "ramp": "gold"},
        ],
    },
    # The blackjack table (#428). It shares casino_table's footprint and has to read as a
    # different game from across the room, so three things differ: a deep apron on thick legs
    # instead of a thin top on thin ones, an ivory rail rather than a walnut one, and the
    # dealer's furniture standing on the NORTH edge — the side the working spot at y-1 is on.
    # The tray and the shoe are what tell a player which way round the table is before they read
    # a card, and they are the whole reason the silhouette is asymmetric.
    "blackjack_table": {
        "w": 2, "l": 2, "ramp": "walnut",
        "prims": [
            {"t": "box", "c0": (0.12, 0.12, 0.00), "c1": (0.40, 0.40, 0.92)},
            {"t": "box", "c0": (1.60, 0.12, 0.00), "c1": (1.88, 0.40, 0.92)},
            {"t": "box", "c0": (0.12, 1.60, 0.00), "c1": (0.40, 1.88, 0.92)},
            {"t": "box", "c0": (1.60, 1.60, 0.00), "c1": (1.88, 1.88, 0.92)},
            {"t": "box", "c0": (0.16, 0.16, 0.86), "c1": (1.84, 1.84, 1.18), "bevel": 0.04},
            {"t": "box", "c0": (0.06, 0.06, 1.18), "c1": (1.94, 1.94, 1.44), "bevel": 0.04,
             "ramp": "fern"},
            # One seam group across the four runs, so no line is drawn where they meet.
            {"t": "hcyl", "x": 0.11, "y0": 0.11, "y1": 1.89, "z": 1.44, "r": 0.08,
             "ramp": "ivory", "group": 100},
            {"t": "hcyl", "x": 1.89, "y0": 0.11, "y1": 1.89, "z": 1.44, "r": 0.08,
             "ramp": "ivory", "group": 100},
            {"t": "hcyl", "x": 0.11, "y0": 0.11, "y1": 1.89, "z": 1.44, "r": 0.08, "axis": "x",
             "ramp": "ivory", "group": 100},
            {"t": "hcyl", "x": 1.89, "y0": 0.11, "y1": 1.89, "z": 1.44, "r": 0.08, "axis": "x",
             "ramp": "ivory", "group": 100},
            # The betting arc: an ivory disc with a fern one set inside it and 0.01 proud, the
            # inlay idiom casino_table uses on a square. Round against square is the difference
            # a player sees on the felt.
            {"t": "cyl", "cx": 1.00, "cy": 1.14, "rx": 0.60, "ry": 0.60, "z0": 1.44, "z1": 1.47,
             "ramp": "ivory"},
            {"t": "cyl", "cx": 1.00, "cy": 1.14, "rx": 0.50, "ry": 0.50, "z0": 1.45, "z1": 1.48,
             "ramp": "fern"},
            # Chip tray and card shoe, both clear of the rail at fy 0.19 and fx 1.81.
            {"t": "box", "c0": (0.30, 0.22, 1.44), "c1": (1.30, 0.54, 1.50), "ramp": "charcoal"},
            {"t": "hcyl", "x": 0.29, "y0": 0.36, "y1": 1.24, "z": 1.53, "r": 0.055, "axis": "x",
             "ramp": "gold"},
            {"t": "hcyl", "x": 0.38, "y0": 0.36, "y1": 1.24, "z": 1.53, "r": 0.055, "axis": "x",
             "ramp": "crimson"},
            {"t": "hcyl", "x": 0.47, "y0": 0.36, "y1": 1.24, "z": 1.53, "r": 0.055, "axis": "x",
             "ramp": "ivory"},
            # Stepped, not a plain box: the step is what makes it a shoe rather than a crate.
            {"t": "box", "c0": (1.38, 0.22, 1.44), "c1": (1.76, 0.66, 1.52), "ramp": "charcoal"},
            {"t": "box", "c0": (1.38, 0.22, 1.52), "c1": (1.76, 0.48, 1.72), "ramp": "charcoal"},
        ],
    },
}

# ---- figure rig (#127) ---------------------------------------------------------------------
# A figure is a primitive list like any part, but hung off a bone hierarchy so an action is joint
# angles rather than a redrawn sprite. Poses are authored once and every garment ever made
# inherits them.
#
# Everything inside the figure is authored in a UNIFORM px space — 1 unit = 1 px at scale 64 —
# and the dimetric squash lives on the single root empty. That order is load-bearing: bone
# rotations happen inside the uniform space, so a limb keeps its authored length when it swings.
# Posing inside a pre-squashed space would quietly shorten every rotated limb, and the seat gate
# measures exactly that length.
#
# Figure prims declare a "slot", not a ramp. Colour is per player, so the frozen sheet stores
# (slot, shade) indices and the client resolves them through the worn ramps when it bakes the
# outfit — a sheet per colour would put the combinatorics back in colour space.

FIGURE_PX = 1.0 / (32.0 * math.sqrt(2.0))                 # one horizontal px, in world units
FIGURE_PZ = FIGURE_PX / math.cos(math.radians(30.0))      # one vertical px, pre-squashed

# 80 px = 2.5 height units, pinned against the shipped seat heights (cafe_chair seatZ 0.58 =
# 18.6 px, and a 90-degree knee needs shin ~= seat height). Segments sum to it exactly.
FIGURE_H = 80
HEAD_LEN, TORSO_LEN, THIGH_LEN, SHIN_LEN = 22, 21, 19, 18
HIP_Z = THIGH_LEN + SHIN_LEN          # 37
SHOULDER_Z = HIP_Z + 15               # 52
CHIN_Z = HIP_Z + TORSO_LEN            # 58, and + HEAD_LEN = 80

CANVAS_W, CANVAS_H = 64, 112

# name -> (parent, rest offset from the parent, in figure px). +Y is the way the figure faces.
BONES = {
    "hip":    (None,    (0.0, 0.0, HIP_Z)),
    "spine":  ("hip",   (0.0, 0.0, 0.0)),
    "chest":  ("spine", (0.0, 0.0, SHOULDER_Z - HIP_Z)),
    "head":   ("chest", (0.0, 0.0, CHIN_Z - SHOULDER_Z)),
    "arm_l":  ("chest", (9.5, 0.0, 0.0)),
    "arm_r":  ("chest", (-9.5, 0.0, 0.0)),
    "leg_l":  ("hip",   (4.0, 0.0, 0.0)),
    "leg_r":  ("hip",   (-4.0, 0.0, 0.0)),
    "knee_l": ("leg_l", (0.0, 0.0, -THIGH_LEN)),
    "knee_r": ("leg_r", (0.0, 0.0, -THIGH_LEN)),
}

ARM_LEN = 22

# box: c0/c1 corners in bone-local px. limb: capsule down local -Z, length + radius.
# ball: ellipsoid at a bone-local centre.
# The shins cap at the knee only: a bottom cap is a sphere hanging below the ankle, which puts
# ink under the anchor row and makes the figure read as floating.
# Keyed by figuredata set id (packages/shared/src/figuredata.ts): "<type><set>". The id is the
# link between a mesh here and a wearable there, and figuredata set IDs are append-only forever.
FIGURE_PARTS = {
    "bd1": {
        "prims": [
            {"t": "box",  "bone": "spine",  "slot": 0, "c0": (-7.5, -6.0, 0.0),
             "c1": (7.5, 6.0, float(TORSO_LEN))},
            {"t": "limb", "bone": "arm_l",  "slot": 0, "len": float(ARM_LEN), "r": 3.2},
            {"t": "limb", "bone": "arm_r",  "slot": 0, "len": float(ARM_LEN), "r": 3.2},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 4.2},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 4.2},
            {"t": "limb", "bone": "knee_l", "slot": 0, "len": float(SHIN_LEN), "r": 3.7,
             "caps": "top"},
            {"t": "limb", "bone": "knee_r", "slot": 0, "len": float(SHIN_LEN), "r": 3.7,
             "caps": "top"},
            {"t": "box",  "bone": "knee_l", "slot": 0, "c0": (-3.7, -2.9, -float(SHIN_LEN)),
             "c1": (3.7, 6.3, -SHIN_LEN + 3.4)},
            {"t": "box",  "bone": "knee_r", "slot": 0, "c0": (-3.7, -2.9, -float(SHIN_LEN)),
             "c1": (3.7, 6.3, -SHIN_LEN + 3.4)},
        ],
    },
    # The head is its own layer, not part of bd — it is selectable, and it is what makes a figure
    # readable front-from-back. The skull's y radius is 22/2 * 0.82 = 9.0, so the nose has to
    # reach past 9.0 to break the silhouette at all; a brow flush with the skull only shades.
    "hd2": {
        "prims": [
            {"t": "limb", "bone": "head", "slot": 0, "len": 5.0, "r": 3.6},   # neck
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 0.0, HEAD_LEN / 2.0),
             "r": HEAD_LEN / 2.0, "squash": (0.92, 0.86, 1.0)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-1.7, 7.4, 9.0),
             "c1": (1.7, 11.2, 12.6)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-4.6, 6.4, 13.0),
             "c1": (4.6, 9.2, 15.4)},
        ],
    },
    # Tee (figuredata set 5, one colour slot). Sits just proud of the torso and takes the upper
    # arm; the forearm and hands stay bare, which is what makes the holdout visible — the sleeve
    # has to be cut where the arm passes in front of it.
    "ch5": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.9, -6.4, 1.5),
             "c1": (7.9, 6.4, 20.0)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 8.0, "r": 3.7},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 8.0, "r": 3.7},
        ],
    },
    # Trim Shirt (set 6, two slots): body in slot 0, collar and cuffs in slot 1. This is the set
    # that proves N-colour parts — one mesh, two independently chosen ramps, no second render.
    "ch6": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.9, -6.4, 1.5),
             "c1": (7.9, 6.4, 18.4)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-7.6, -6.6, 18.4),
             "c1": (7.6, 6.6, 20.6)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 13.0, "r": 3.7},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 13.0, "r": 3.7},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -13.5), "r": 3.9,
             "squash": (1.0, 1.0, 0.45)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -13.5), "r": 3.9,
             "squash": (1.0, 1.0, 0.45)},
        ],
    },
    # Staff Blazer (set 16, two slots). Never grantable to a player — NPC accounts own it, so a
    # player naming set 16 fails the ownership check like any other unowned set.
    "ch16": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.2, -6.7, 0.5),
             "c1": (8.2, 6.7, 20.4)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-2.2, -7.0, 2.0),
             "c1": (2.2, 7.0, 20.4)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 3.8},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 3.8},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -20.5), "r": 4.0,
             "squash": (1.0, 1.0, 0.4)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -20.5), "r": 4.0,
             "squash": (1.0, 1.0, 0.4)},
        ],
    },
    # Tops pack (#440). Seven garments on the ch layer, each authored as a silhouette rather than a
    # ramp — a wardrobe reads as a wardrobe only if the outlines differ at 2x.
    #
    # Hoodie (set 38, two slots). The hood is the part: a mass sat behind the neck, and the only ch
    # silhouette here that breaks the shoulder line upward. It is centred 6.4 back so the skull wins
    # the depth test at the front and the hood shows past the neck at the sides. Slot 1 is the
    # drawstring and the belly pocket — flat details, because the hood already carries the outline.
    "ch38": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.1, -6.7, 2.6),
             "c1": (8.1, 6.7, 20.2)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-9.0, -7.4, 0.0),
             "c1": (9.0, 7.4, 2.6)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, -6.4, 22.6), "r": 7.4,
             "squash": (1.05, 1.00, 0.84)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 4.0},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 4.0},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-3.6, 6.3, 16.6),
             "c1": (3.6, 7.2, 18.4)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-5.8, 6.3, 4.6),
             "c1": (5.8, 7.4, 9.4)},
        ],
    },
    # Blazer (set 39, two slots). Set 16 is already a two-slot jacket with full sleeves, so this one
    # has to differ in outline, not ramp. It is tailored where 16 is a straight box: 9.4 at the
    # shoulder, 8.4 at the chest, 7.7 at the waist, and a skirt that hangs to -7.0 where 16 stops at
    # the waist. A box cannot taper, so the taper is two boxes. The waist stays at 7.7 rather than
    # going narrower — bd1's torso is 7.5, and a garment inside that lets skin through at the seam.
    # The lapel is a two-step wedge, a staircase of two being enough notch at this scale, and slot 1
    # is the shirt beneath as a front-only V where 16's slot 1 wraps front to back.
    "ch39": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.4, -6.8, 8.0),
             "c1": (8.4, 6.8, 18.8)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.7, -6.3, -7.0),
             "c1": (7.7, 6.3, 8.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-9.4, -6.4, 14.4),
             "c1": (9.4, 6.4, 19.6)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 3.9},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 3.9},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-6.6, 6.6, 15.0),
             "c1": (-2.8, 7.6, 19.4)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (2.8, 6.6, 15.0),
             "c1": (6.6, 7.6, 19.4)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-4.6, 6.6, 10.8),
             "c1": (-1.4, 7.6, 15.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (1.4, 6.6, 10.8),
             "c1": (4.6, 7.6, 15.0)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-2.8, 6.7, 13.4),
             "c1": (2.8, 7.3, 19.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-1.4, 6.7, 9.0),
             "c1": (1.4, 7.3, 13.4)},
        ],
    },
    # Vest + Shirt (set 40, two slots). Two garments in one mesh, and the seam between them is the
    # silhouette: the vest body is 0.4 proud of the shirt yoke all round, so the step at z 13.8 is a
    # real edge rather than a colour change. Slot 1 is the shirt — yoke, sleeves, cuffs — and slot 0
    # is the vest. The sleeves run 16.0, three-quarter: at set 6's 13.0 the two layers measured 0.885
    # silhouette overlap, higher than any pair the wardrobe had shipped, and the cuff is what moved
    # it. The vest hangs to -1.0 for the same reason — every top before this one stops at the waist.
    # The two front straps stop 3.0 short of the midline, which is the V of shirt that makes it read
    # as a vest and not a waistcoat-shaped tee.
    "ch40": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-8.0, -6.4, 13.8),
             "c1": (8.0, 6.4, 20.4)},
            {"t": "limb", "bone": "arm_l", "slot": 1, "len": 16.0, "r": 3.7},
            {"t": "limb", "bone": "arm_r", "slot": 1, "len": 16.0, "r": 3.7},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -16.5), "r": 3.9,
             "squash": (1.0, 1.0, 0.45)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -16.5), "r": 3.9,
             "squash": (1.0, 1.0, 0.45)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.4, -7.0, -1.0),
             "c1": (8.4, 7.0, 13.8)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.0, 6.2, 13.8),
             "c1": (-3.0, 7.2, 19.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (3.0, 6.2, 13.8),
             "c1": (8.0, 7.2, 19.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.0, -7.0, 13.8),
             "c1": (8.0, -6.2, 19.0)},
        ],
    },
    # Polo (set 41, one slot). Set 5 is the plain tee, so the collar is the whole argument: a band
    # 2.3 narrower than the body and 0.6 prouder, which puts a step on both the side outline and the
    # front. It tops out at 21.6, six tenths over the chin plane and four rows clear of the stamped
    # mouth, so a collar never eats a face. Sleeves run 2 px past the tee's for the same reason —
    # one silhouette difference is a recolour, two is a garment.
    "ch41": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.9, -6.4, 1.2),
             "c1": (7.9, 6.4, 19.2)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.6, -7.0, 19.2),
             "c1": (5.6, 7.0, 21.6)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-1.3, 6.3, 13.6),
             "c1": (1.3, 7.0, 19.2)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 10.0, "r": 3.8},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 10.0, "r": 3.8},
        ],
    },
    # Turtleneck (set 42, one slot). Two stacked ellipsoids at the neck: the lower one is the rolled
    # fold, 0.4 wider than the upper, so the collar has a step in it instead of being one smooth
    # tube. The upper reaches z 23.0 — the chin plane is 21.0 and the stamped mouth projects around
    # z 26.6, so the collar covers the jaw underside and stops 3.6 px short of the mouth. The body
    # and sleeves are the tightest in the pack (7.7 and r 3.6) because knitwear that is not snug is
    # a sweatshirt.
    "ch42": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.7, -6.2, 1.0),
             "c1": (7.7, 6.2, 19.4)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 0.0, 18.6), "r": 5.4,
             "squash": (1.00, 0.98, 0.42)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 0.0, 20.2), "r": 5.0,
             "squash": (0.96, 0.94, 0.56)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 21.0, "r": 3.6},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 21.0, "r": 3.6},
        ],
    },
    # Tank (set 43, one slot). The only garment in the pack defined by what it leaves off: three
    # prims, no sleeves, and the body stops at 14.2 — below the shoulder at 15 — so bd1's own skin
    # is what fills the chest above it. The two straps are 3.6 wide with a 6.4 gap between them,
    # which is the bare chest that says tank rather than vest.
    "ch43": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-7.9, -6.4, 0.8),
             "c1": (7.9, 6.4, 14.2)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-6.8, -6.4, 14.2),
             "c1": (-3.2, 6.4, 20.0)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (3.2, -6.4, 14.2),
             "c1": (6.8, 6.4, 20.0)},
        ],
    },
    # Tracksuit Top (set 44, two slots). Blousy body over a pinched waistband — 8.6 down to 7.8 —
    # which inverts the hoodie 38's flared hem. The band stays at 7.8 rather than pinching further
    # because bd1's torso is 7.5 and a garment inside that lets skin through.
    #
    # The sleeves are 4.6 where every other jacket here is 3.8-4.0. Loose sleeves are the trait that
    # most says tracksuit, and they are also the only lever big enough to separate this outline from
    # the staff blazer 16: at r 4.0 the two measured 0.878 silhouette overlap against a 0.854
    # wardrobe baseline, and the arms are the largest share of the alpha that 16 does not share.
    #
    # Slot 1 is the trim and it is deliberately flat: the zip sits 0.1 proud of the chest, which
    # never shows in the outline but always wins the depth test, so the band is a colour running
    # down the front rather than a ridge. The stand collar, the waistband and the elastic cuffs
    # carry the same slot. The sleeve stripes ride the outboard face of each sleeve — +x on arm_l,
    # -x on arm_r, because the arm bones sit either side of the chest.
    "ch44": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.6, -7.1, 4.2),
             "c1": (8.6, 7.1, 19.6)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 4.6},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 4.6},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-7.8, -6.4, 0.6),
             "c1": (7.8, 6.4, 4.2)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-5.2, -6.9, 19.6),
             "c1": (5.2, 6.9, 22.2)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-1.1, 6.4, 4.2),
             "c1": (1.1, 7.2, 19.6)},
            {"t": "box",  "bone": "arm_l", "slot": 1, "c0": (3.8, -1.4, -19.4),
             "c1": (4.8, 1.4, -2.0)},
            {"t": "box",  "bone": "arm_r", "slot": 1, "c0": (-4.8, -1.4, -19.4),
             "c1": (-3.8, 1.4, -2.0)},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -20.4), "r": 4.8,
             "squash": (1.0, 1.0, 0.38)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -20.4), "r": 4.8,
             "squash": (1.0, 1.0, 0.38)},
        ],
    },
    # Overcoat (set 11, two slots, hides ch). Full sleeves plus a flare below the hip — the flare
    # is why the cone prim exists.
    "cc11": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.4, -6.9, 0.0),
             "c1": (8.4, 6.9, 20.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-2.0, -7.2, 1.0),
             "c1": (2.0, 7.2, 20.6)},
            {"t": "cone", "bone": "hip",   "slot": 0, "len": 14.0, "r0": 8.6, "r1": 10.4},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 4.0},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 4.0},
        ],
    },
    "lg7": {
        "prims": [
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 4.7},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 4.7},
            {"t": "limb", "bone": "knee_l", "slot": 0, "len": 15.0, "r": 4.3},
            {"t": "limb", "bone": "knee_r", "slot": 0, "len": 15.0, "r": 4.3},
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.0, -6.4, -2.0),
             "c1": (8.0, 6.4, 2.6)},
        ],
    },
    # Pleated Skirt (set 8). Same lg slot as trousers, so wearing one replaces the other.
    "lg8": {
        "prims": [
            {"t": "cone", "bone": "hip", "slot": 0, "len": 15.0, "r0": 8.2, "r1": 11.6},
            {"t": "box",  "bone": "hip", "slot": 0, "c0": (-8.0, -6.4, -1.5),
             "c1": (8.0, 6.4, 2.6)},
        ],
    },
    # Legs pack (#440). Four lg garments, each cut to a different length AND a different profile,
    # because a legs shelf where every row is a tube of a different colour is one garment.
    #
    # Shorts (set 45, one slot). The hem is the whole part, and it is a flat cut: "caps": "top",
    # for the same reason bd1's shins have it — a bottom cap sphere hangs 5 px below the cut and
    # turns a hem into a bulb. It stops 7.5 px above the knee so bd1's own knee and shin fill the
    # leg below, and the cut is wide (5.4 against the trousers' 4.7) because a short that is not
    # wide is a swimming brief.
    "lg45": {
        "prims": [
            {"t": "box",  "bone": "hip",   "slot": 0, "c0": (-8.0, -6.4, -2.4),
             "c1": (8.0, 6.4, 2.2)},
            {"t": "limb", "bone": "leg_l", "slot": 0, "len": 11.5, "r": 5.4, "caps": "top"},
            {"t": "limb", "bone": "leg_r", "slot": 0, "len": 11.5, "r": 5.4, "caps": "top"},
        ],
    },
    # Flares (set 46, one slot). Trousers 7 are a straight tube, so this one is the only lg
    # silhouette here that gets WIDER going down: a cone on the knee bone, 4.4 at the knee opening
    # to 7.4 at the hem. The thigh is cut slim at 4.5 against the trousers' 4.7 so the flare has
    # something to flare from. The hem stops at 16 of the shin's 18 rather than at the sole,
    # because a bell that reaches the floor swallows the shoe layer whole.
    "lg46": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-7.9, -6.3, -1.6),
             "c1": (7.9, 6.3, 3.4)},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 4.5},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 4.5},
            {"t": "cone", "bone": "knee_l", "slot": 0, "len": 16.0, "r0": 4.4, "r1": 7.4},
            {"t": "cone", "bone": "knee_r", "slot": 0, "len": 16.0, "r0": 4.4, "r1": 7.4},
        ],
    },
    # Cargo (set 47, one slot). The exact inverse of the flares: baggy at the thigh (5.5 against
    # the trousers' 4.7) and TAPERED at the shin, 5.4 down to 4.6, so the two never read as the
    # same trouser at a different width.
    #
    # A pocket has to break the leg's outline to exist at all at this scale. The thigh pair runs
    # from x 4.2 out to 7.6 in leg-local px — 2.1 clear of the 5.5 tube — on the outboard face,
    # +x on leg_l and -x on leg_r because the leg bones sit either side of the hip. The shin pair
    # sits on the front instead, where it breaks the outline in the three directions the thigh
    # pockets do not.
    "lg47": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.2, -6.6, -2.6),
             "c1": (8.2, 6.6, 2.4)},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 5.5},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 5.5},
            {"t": "cone", "bone": "knee_l", "slot": 0, "len": 15.5, "r0": 5.4, "r1": 4.6},
            {"t": "cone", "bone": "knee_r", "slot": 0, "len": 15.5, "r0": 5.4, "r1": 4.6},
            {"t": "box",  "bone": "leg_l",  "slot": 0, "c0": (4.2, -3.4, -14.2),
             "c1": (7.6, 3.4, -7.6)},
            {"t": "box",  "bone": "leg_r",  "slot": 0, "c0": (-7.6, -3.4, -14.2),
             "c1": (-4.2, 3.4, -7.6)},
            {"t": "box",  "bone": "knee_l", "slot": 0, "c0": (-3.2, 4.2, -12.0),
             "c1": (3.2, 6.6, -6.0)},
            {"t": "box",  "bone": "knee_r", "slot": 0, "c0": (-3.2, 4.2, -12.0),
             "c1": (3.2, 6.6, -6.0)},
        ],
    },
    # Long Skirt (set 48, one slot). Same two prims as the pleated skirt 8, and the difference is
    # entirely in their numbers: the cone falls 28 px to the calf where 8 stops 15 px down above
    # the knee, and opens to 14.2 at the hem against 8's 11.6.
    #
    # It stops at the calf rather than the ankle's 33 px because of the sit frame. The cone hangs
    # from the hip, the hip IS the sit anchor at row 74, and a cone of radius r reaches exactly
    # r/2 rows past its own hem in every direction — 74 + 28 + 7.1 is the last row that clears the
    # 112-row canvas the bounds gate holds every layer to.
    #
    # The 14.2 hem is structural, not decoration. A walk frame swings the shin 22 degrees, which
    # puts its outer surface 14.0 px off the hip axis at hem height; a narrower cone lets a bare
    # shin through the front of the skirt, because the body wins the depth test wherever it is
    # nearer. A second, narrower cone inside this one was the first try at breaking the profile,
    # and it is not available: every cone starts at its bone, so two of them share a top cap plane
    # at z 0 and the pair z-fights along the inner rim — one pixel of it failed the holdout gate.
    "lg48": {
        "prims": [
            {"t": "box",  "bone": "hip", "slot": 0, "c0": (-8.2, -6.6, -2.2),
             "c1": (8.2, 6.6, 3.0)},
            {"t": "cone", "bone": "hip", "slot": 0, "len": 28.0, "r0": 8.8, "r1": 14.2},
        ],
    },
    "sh9": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -SHIN_LEN + 4.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -SHIN_LEN + 4.2)},
        ],
    },
    # Shoes pack (#440). bd1's foot is a box: half-width 3.7, y -2.9 to 6.3, top at -14.6 with the
    # sole on the ground plane at -18. Every prim below either CONTAINS that box or sits outside
    # it, and the difference is not style — a shoe part tucked inside the foot is not subtle, it
    # is invisible, because the body wins the depth test wherever it is nearer.
    #
    # Sneakers (set 49, one slot). Tread, flared midsole, upper — three stacked boxes against the
    # loafer 9's one, and the flare is what makes it chunky.
    #
    # The bulk has to sit ABOVE the ground plane, which is not a style choice. A frame's deepest
    # row is (|x| + |y|) / 2.828 below the prim's own z, so a px of overhang at z -18 costs a third
    # of a row and a px at z -17 costs the same third from one row higher up. The loafer's
    # footprint already lands on row 110 in the walk-contact frames and 111 is where the bounds
    # gate fails, so the tread keeps the loafer's exact footprint and every wider box starts a
    # px or more off the floor.
    "sh49": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -SHIN_LEN + 1.0)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -SHIN_LEN + 1.0)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.9, -4.3, -SHIN_LEN + 1.0),
             "c1": (4.9, 8.4, -SHIN_LEN + 2.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.9, -4.3, -SHIN_LEN + 1.0),
             "c1": (4.9, 8.4, -SHIN_LEN + 2.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.5, -3.9, -SHIN_LEN + 2.6),
             "c1": (4.5, 6.9, -SHIN_LEN + 5.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.5, -3.9, -SHIN_LEN + 2.6),
             "c1": (4.5, 6.9, -SHIN_LEN + 5.6)},
        ],
    },
    # Boots (set 50, one slot). The shaft is why sh sits after lg in LAYER_ORDER — it draws over
    # whatever trousers are underneath and costs nothing to do it. A limb cannot make a shaft: it
    # hangs from its bone and the knee bone is at the TOP of the shin, so a limb here would clothe
    # the calf and leave the ankle bare. The shaft is a box from the sole to mid-shin at -9.4,
    # with a wider cuff band closing it.
    "sh50": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.5, -4.2, -float(SHIN_LEN)),
             "c1": (4.5, 7.8, -SHIN_LEN + 4.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.5, -4.2, -float(SHIN_LEN)),
             "c1": (4.5, 7.8, -SHIN_LEN + 4.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.4, -4.2, -float(SHIN_LEN)),
             "c1": (4.4, 4.4, -9.4)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.4, -4.2, -float(SHIN_LEN)),
             "c1": (4.4, 4.4, -9.4)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-5.0, -4.8, -10.6),
             "c1": (5.0, 5.0, -9.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-5.0, -4.8, -10.6),
             "c1": (5.0, 5.0, -9.2)},
        ],
    },
    # Heels (set 51, one slot). The lift is in the shoe, never in the figure. The bones are shared
    # by every wearable ever made and the sole stays on the ground plane at -18, so what a heel
    # gets instead is a wedge: the vamp is cut low over the toes at -14.2 and the counter behind it
    # rises to -12.4, 1.4 over the loafer 9's flat -13.8. That rising back, a point in front and a
    # spike behind are three steps in an outline the loafer draws as one flat box.
    #
    # The spike and the point both start clear of the floor. A frame's deepest row is
    # (|x| + |y|) / 2.828 below the prim's own z, and the loafer's footprint already lands on row
    # 110 in the walk-contact frames against a bounds gate that fails at 111 — so anything reaching
    # further out than the loafer does has to sit higher up than the loafer's sole to pay for it.
    "sh51": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.05, -3.25, -float(SHIN_LEN)),
             "c1": (4.05, 6.7, -SHIN_LEN + 3.8)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.05, -3.25, -float(SHIN_LEN)),
             "c1": (4.05, 6.7, -SHIN_LEN + 3.8)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.05, -3.25, -SHIN_LEN + 3.8),
             "c1": (4.05, 1.0, -SHIN_LEN + 5.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.05, -3.25, -SHIN_LEN + 3.8),
             "c1": (4.05, 1.0, -SHIN_LEN + 5.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-2.4, 6.7, -SHIN_LEN + 0.6),
             "c1": (2.4, 9.2, -SHIN_LEN + 2.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-2.4, 6.7, -SHIN_LEN + 0.6),
             "c1": (2.4, 9.2, -SHIN_LEN + 2.2)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-1.8, -5.4, -SHIN_LEN + 0.4),
             "c1": (1.8, -3.2, -SHIN_LEN + 3.4)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-1.8, -5.4, -SHIN_LEN + 0.4),
             "c1": (1.8, -3.2, -SHIN_LEN + 3.4)},
        ],
    },
    # Sandals (set 52, one slot). Defined by what it leaves off, the way the tank 43 is. A sole
    # plate carries the whole foot and overhangs it — 0.7 in x, 2.3 past the toe — and two bands
    # cross it, so the instep and the toes stay bd1's own skin.
    #
    # Both bands clear the foot box's -14.6 top on purpose. A strap laid across the instep BELOW
    # that line is inside the foot and renders as nothing; a strap has to straddle the top edge to
    # be a strap.
    "sh52": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.4, -4.2, -float(SHIN_LEN)),
             "c1": (4.4, 8.6, -SHIN_LEN + 1.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.4, -4.2, -float(SHIN_LEN)),
             "c1": (4.4, 8.6, -SHIN_LEN + 1.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.1, 3.2, -SHIN_LEN + 1.6),
             "c1": (4.1, 5.0, -SHIN_LEN + 4.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.1, 3.2, -SHIN_LEN + 1.6),
             "c1": (4.1, 5.0, -SHIN_LEN + 4.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.3, -4.1, -13.8),
             "c1": (4.3, 4.1, -12.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.3, -4.1, -13.8),
             "c1": (4.3, 4.1, -12.2)},
        ],
    },
    # Hair sits proud of the skull and the head's own holdout cuts it back to a shell — the face
    # stays clear because the brow and nose reach further forward than the hair does.
    "hr3": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.4, 12.4), "r": 11.4,
             "squash": (0.95, 0.90, 0.86)},
        ],
    },
    "hr4": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.4, 12.4), "r": 11.5,
             "squash": (0.97, 0.92, 0.90)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -5.6, 2.0), "r": 8.0,
             "squash": (1.05, 0.62, 1.35)},
        ],
    },
    # Bob (set 28). The dome is wider than the skull and the bell hangs straight off it to a flat
    # bottom at the jaw — the box is narrower than the dome's equator so the two meet without a
    # ledge, and the hard edge comes from the box's own bottom face.
    "hr28": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.6, 12.6), "r": 11.6,
             "squash": (0.974, 0.885, 0.879)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-11.0, -10.8, 4.6),
             "c1": (11.0, 5.6, 12.6)},
        ],
    },
    # Ponytail (set 29). The tail is a narrow ellipsoid clear of the skull's back, so the crown
    # alone carries dirs 2-4 and the tail is what dirs 0, 6 and 7 see. Its front end sits inside
    # the crown: a tail that only touched would break into its own island on some frame.
    "hr29": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.6, 12.8), "r": 11.2,
             "squash": (0.945, 0.90, 0.90)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -11.6, 10.5), "r": 5.6,
             "squash": (0.62, 1.22, 0.95)},
        ],
    },
    # Curls (set 30). Seven balls sat on the crown's own surface, each proud enough to break the
    # silhouette — the bumpy outline is the whole part, and the interior lines the post-pass draws
    # between them are what separate one curl from the next. 8 prims against the 13 a figure layer
    # has left once the holdout body has taken its 13.
    "hr30": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.4, 12.6), "r": 11.1,
             "squash": (0.965, 0.925, 0.919)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (9.42, -2.43, 16.17), "r": 3.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (-9.42, -2.43, 16.17), "r": 3.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (5.36, -8.79, 16.88), "r": 3.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (-5.36, -8.79, 16.88), "r": 3.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -5.51, 21.58), "r": 3.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (5.89, 2.91, 17.19), "r": 3.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (-5.89, 2.91, 17.19), "r": 3.2},
        ],
    },
    # Slick Back (set 31). The REAR ball carries the crown, so the highest point of the hair sits
    # behind the highest point of the skull and the profile peaks at the back. The front ball is a
    # low tight cap, shallow in y: swept-back hair has a high hairline and bare temples, which is
    # what separates this from the Short Crop it would otherwise be.
    "hr31": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.0, 11.8), "r": 11.0,
             "squash": (0.955, 0.84, 0.85)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -5.0, 13.6), "r": 11.0,
             "squash": (0.90, 0.94, 0.964)},
        ],
    },
    # Buzz (set 32). The smallest hair in the set and the point of it: one ball a shade over a
    # pixel proud of the skull, centred a full 1.4 above the Short Crop's so the hairline sits
    # higher all round. Silhouette, not palette, is what separates the two.
    "hr32": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.8, 13.8), "r": 11.0,
             "squash": (0.985, 0.86, 0.83)},
        ],
    },
    # Bun (set 33). The knot clears the crown by five px and is the only thing that reads at any
    # distance, so it sits behind the crown line rather than on top of it — a knot centred over the
    # skull would look like a growth. Its lower half is inside the cap, which is what keeps the
    # layer one island in every frame.
    "hr33": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.6, 12.6), "r": 11.1,
             "squash": (1.00, 0.90, 0.91)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -3.0, 23.8), "r": 4.6,
             "squash": (1.0, 0.95, 0.85)},
        ],
    },
    # Fringe (set 34). The cut lands on the brow line by arithmetic, not taste: at dir 3 a head-bone
    # point draws at row 44 + y/2 - z, so the disc's lower front edge at y 4.4, z 14.0 puts it on
    # row 31. Any deeper and the edge slides onto the eyes at rows 34-35.
    #
    # A flattened ball, not a slab. A box front proud enough to read as a fringe has its top corner
    # outside the cap at every three-quarter view, and that corner reads as a spur off the temple.
    # A disc has no corner to stick out, and its lower edge is flat across the middle fourteen
    # columns, which is all "straight cut" has to mean at this scale.
    "hr34": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.6, 12.6), "r": 11.1,
             "squash": (1.00, 0.93, 0.91)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 4.4, 17.4), "r": 10.0,
             "squash": (0.94, 0.40, 0.34)},
        ],
    },
    # Afro (set 35). One ball, four px of radius past the Short Crop, sat back off the face so the
    # brow and nose still win the depth test and punch the face out of it. The widest hair in the
    # set at 34 px across — still 15 clear of the frame edge the bounds gate watches.
    "hr35": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -4.6, 14.0), "r": 14.0,
             "squash": (1.04, 0.86, 0.87)},
        ],
    },
    # Braids (set 36). The two tails hang at different depths — one forward of the ear, one behind
    # it — so dirs 2 and 4 are not mirror images of each other the way a symmetric part's are.
    # Each tail's top is well inside the cap: they are the part's silhouette, but a tail that only
    # touched the cap would come apart into its own island somewhere in the 64 cells.
    "hr36": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.6, 12.6), "r": 11.1,
             "squash": (1.00, 0.93, 0.91)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (9.0, 1.0, 6.2), "r": 4.6,
             "squash": (0.64, 0.86, 1.52)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (-9.0, -6.0, 6.2), "r": 4.6,
             "squash": (0.64, 0.86, 1.52)},
        ],
    },
    # Mohawk (set 37). No cap at all — the shaved sides are the part, and the crest is two balls
    # squashed to 3 px across running front to back along the midline. It clears the crown by six,
    # which is what makes a 5-px-wide sliver read at 64. Both balls reach well down into the skull
    # so the crest never floats off the head it is worn on.
    "hr37": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 1.5, 20.5), "r": 6.5,
             "squash": (0.44, 0.66, 1.18)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -5.0, 20.0), "r": 7.0,
             "squash": (0.42, 0.80, 1.18)},
        ],
    },
    # Bellhop Cap (set 10, hides hr). The hides rule is what keeps the holdout set at size one:
    # without it a cap would need a holdout render per hair set.
    #
    # jtbug #349: the visor's front-bottom edge landed on row 34 at stand dir 3 and drew over the
    # eyed faces' brow (row 31) and eyes (rows 34-35). figure_project's row term is `- p.z` with no
    # rotation coupling, and the head bone carries zero rotation in every pose, so a +6 lift on both
    # prims' z is an exact -6 row shift in every frame and direction — no reshaping needed. New
    # visor edge lands at row 28, three rows clear of the brow.
    "ha10": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -0.6, 23.0), "r": 10.6,
             "squash": (1.0, 0.94, 0.62)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-8.0, 4.0, 21.2),
             "c1": (8.0, 11.6, 22.6)},
        ],
    },
    # Hats pack (#440). Five ha garments, one colour slot each, on a layer that works next to the
    # face — so all five are placed against two measured lines rather than by eye.
    #
    # DOWN: the face sets stamp rows 31-39 in the frames that have a face — brow 31, eyes 33-35,
    # mouth 36-39. Every prim below is shaped so its lowest lit pixel lands at row 30 or above in
    # all eight directions. That is the line the Bellhop Cap's visor crossed at row 34 (#349), and
    # a hat crosses it cheaply: at dir 3 a head-bone point draws at row 44 + y/2 - z, so geometry
    # that reaches FORWARD falls half a row per px toward the eyes.
    #
    # UP: anchor_y 102 leaves 21 px over the crown, and gateBounds fails on any lit pixel touching
    # the frame edge. The skull's own top lands on row 21, so rows 1-20 are the hat room, and the
    # tallest thing here (the top hat) tops out at row 5.
    #
    # SIDEWAYS: figurepass repaints 12 lone catchlights on the bare head — (28,34) at dirs 2 and 6
    # in the root-0 frames, (30,36) at dir 4 in the two walk down-steps. A garment covering one of
    # those DIAGONALLY, and covering neither the pixel itself nor an orthogonal neighbour, makes
    # the head clean differently under the garment than it does alone and fails gateHoldout by one
    # pixel. Each hat below either covers the pixel outright or stays two clear of it.
    #
    # Beanie (set 53, hides hr). The near-dup to clear is the Bellhop Cap 10, the other low round
    # cap. Two differences, both geometry: no peak, and a cuff. The dome is a ball 0.88 as tall as
    # it is wide against the cap's 0.62, so the crown is round where the cap's is a flattened
    # disc; the cuff is a second ball 0.6 px prouder at its equator and 2.8 px thick, and that
    # ledge is the fold. Its widest ring sits at z 20.2, which puts the fold across the temples
    # and the dome's own edge above it.
    #
    # Both prims carry a +1.2 lift the stand frame does not need. The walk down-steps drop the
    # root 2.5 px while the face art moves with an INTEGER headShift of 2, so hat and brow close
    # half a row on those two frames — enough, at a 1-row stand margin, to put the cuff on the far
    # eyebrow in walk0 and walk2. Measured over all 64 dir-frames against every face set 17-24,
    # the lift leaves a clear row everywhere.
    "ha53": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.2, 22.7), "r": 11.0,
             "squash": (0.96, 0.91, 0.88)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -1.2, 20.2), "r": 11.6,
             "squash": (0.995, 0.95, 0.24)},
        ],
    },
    # Top Hat (set 54, hides hr). The only garment in the wardrobe tall enough to argue with the
    # bounds gate, so it is measured from the top down: the crown's flat lid sits at z 35.5, and a
    # circle of radius r drops at most r/2 rows below its own centre in any direction, so the lid
    # lands on row 44 - 35.5 - 3.65 = 4.85 and the gate has 4 rows of slack.
    #
    # The crown is a cylinder — a cone with a 0.7 flare, which is what a real block has — because a
    # box crown would be 14 px wide face-on and 20 px corner-on, and a hat that changes width when
    # its wearer turns is not a hat. The brim is a 26-px disc flattened to 3 px, one prim, sat at
    # z 19.8: any lower and its forward edge slides onto the brow at row 31.
    "ha54": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -0.6, 19.8), "r": 13.0,
             "squash": (1.0, 0.95, 0.115)},
            {"t": "cone", "bone": "head", "slot": 0, "z0": 35.5, "len": 16.0,
             "r0": 7.3, "r1": 8.0},
        ],
    },
    # Headphones (set 55, hides nothing). The one hat here that has to read over hair, so it is
    # authored as an outline laid ON the head rather than a shell replacing it: ha draws after hr,
    # so the band paints over whatever is underneath, Afro and Mohawk included.
    #
    # The band is a CORONAL disc — thin in y, wide in x and z — so it arcs ear to ear over the
    # crown. The sagittal version of the same prim was drawn first and is what a headband is: it
    # runs front to back and its front edge falls down the forehead to row 33, between the eyes.
    # A coronal band sits at y -3.4 with a 5.5 px depth and never reaches past the skull's own
    # front. It stands 2.2 px proud of the skull sideways and 1.6 above the crown: an arc only one
    # px clear reads as a pencil line at 64, because every pixel of it is silhouette outline with
    # no interior shade left between the edges.
    #
    # The cups are pucks 2 px proud of the skull at ear height. Their z is 9.4 rather than the
    # ear's own 11 for the catchlight above: at dir 6 the near cup's rim passed through (28,34)'s
    # neighbourhood, and dropping it two px puts the whole cup below the pixel while the band,
    # which covers it outright, takes the contact instead.
    "ha55": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -3.4, 15.2), "r": 12.0,
             "squash": (1.025, 0.23, 0.716)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (10.4, -3.4, 9.4), "r": 3.3,
             "squash": (0.50, 0.94, 0.94)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (-10.4, -3.4, 9.4), "r": 3.3,
             "squash": (0.50, 0.94, 0.94)},
        ],
    },
    # Visor (set 56, hides nothing). A brim and a strap and no crown — the top of the head is left
    # bare on purpose, which is what a visor is and what makes it the only hat here that shows
    # whatever hair is worn with it.
    #
    # The brim is a disc pushed FORWARD to y 6.6 so its back half is swallowed by the skull and
    # only the crescent in front survives the holdout. Drawn centred, the same disc reads as a
    # full circular brim with the head threaded through it, because the disc's back edge clears
    # the crown at the very top of the skull where the skull has no width left to hide it.
    # Its forward edge lands on row 30, one row above the brow the face sets draw.
    #
    # 17 px across, not the head's own 21: a brim as wide as the skull reads as a saucer laid over
    # the whole head rather than a peak coming off the front of it. The strap is the wider of the
    # two at 20, so the brim projects from a band instead of floating on one.
    "ha56": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 6.6, 20.8), "r": 10.6,
             "squash": (0.82, 0.717, 0.12)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -0.6, 18.6), "r": 9.9,
             "squash": (1.0, 0.96, 0.24)},
        ],
    },
    # Crown (set 57, hides hr). A band and three points. The band is a cylinder-with-flare like
    # the top hat's, 5 px tall and sat at z 18-23, so it rings the head at the temples and the
    # skull shows through its opening — a ring seen from a camera 30 degrees up is an ellipse with
    # the crown of the head inside it, and that gap is what says band rather than cap.
    #
    # The points are ellipsoids 5.5 px across and 7 tall, based inside the band so the layer stays
    # one island in all 64 cells. Thinner and taller was drawn first and reads as antlers: a point
    # narrow enough to be one shade wide has no interior left to shade, so it comes out a line
    # rather than a solid. One faces front and two sit at the sides — at dir 3 they draw at cols
    # 24, 32 and 40, and the side pair projects 4 rows higher than the front one, which is what a
    # ring of equal points does under this camera. Gold is the ramp it is drawn for.
    "ha57": {
        "prims": [
            {"t": "cone", "bone": "head", "slot": 0, "z0": 23.0, "len": 5.0,
             "r0": 8.4, "r1": 9.6},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 7.6, 25.0), "r": 5.0,
             "squash": (0.55, 0.46, 0.72)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (7.6, 0.0, 25.0), "r": 5.0,
             "squash": (0.46, 0.55, 0.72)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (-7.6, 0.0, 25.0), "r": 5.0,
             "squash": (0.46, 0.55, 0.72)},
        ],
    },
    "ea12": {
        "prims": [
            {"t": "box", "bone": "head", "slot": 0, "c0": (-7.4, 7.0, 12.2),
             "c1": (7.4, 9.6, 14.0)},
        ],
    },
    # Accessories pack (#440). ea is the first layer authored to land ON the face rather than
    # around it, so both sets below are placed against the stamped art rather than the skull.
    #
    # Measured, not assumed: at dir 3 a head-bone point draws at row 44 + y/2 - z, the face sets
    # stamp rows 31-39 standing (brow 31, eyes 33-35, mouth 36-39), and the skull runs rows 21-44.
    # Covering the eyes is legal and already shipped — the spectacles 12 draw at rows 34-36 — and
    # it is legal because figurepass places every face pixel against the HEAD's own prim buffer
    # (buildFaceLayer reads source.primAt and asks whether head.prims[prim].part is hd2). No
    # garment layer is in that buffer, so gateFace cannot see one. What it does assert is that the
    # art still lands on the skull, which no ea set can move.
    #
    # The gate that does bind here is holdout. figurepass repaints 12 lone catchlights on the bare
    # head, and a garment that touches (28,34) at dirs 2/6 or (30,36) at dir 4 DIAGONALLY — with
    # neither the pixel nor an orthogonal neighbour of it covered — changes the modal shade the
    # repaint picks and fails by one pixel. Both sets here cover the eye band outright at those
    # dirs, which is the safe side of that rule rather than the near side.
    #
    # Sunglasses (set 58). One box, and both of those words were argued for by the renderer.
    #
    # A box rather than an ellipsoid: a curved lens was drawn first and came out a 1 px line across
    # the brow. An ellipsoid whose depth falls with |x| the way the skull does never gets far
    # enough in front of the skull to survive the holdout — only its top edge does — so what was
    # meant as a wraparound rendered as a hairband. A box holds one y across its whole span, which
    # is why the spectacles 12 read: at the temples the skull has curved away and the flat front
    # face is standing 4 px off it. On this head a garment stands off the face, it does not hug it.
    #
    # ONE box, because a wraparound cannot reach the temple from here. Side wings were drawn three
    # ways — out to x 8.6, to 7.9, and swept back to y 0 — and every one of them failed gateHoldout
    # on the cheek. The skull carries a broad `hi` highlight down its side at dirs 2 and 4, and
    # patchHead's stray rule asks whether a lone `hi` still has two orthogonal `hi` neighbours. A
    # garment edge landing NEXT TO that run does not have to cover anything to break it: the wing's
    # own antialiasing shifts the neighbour's quantised shade by one, the neighbour stops counting
    # as `hi`, and a pixel two columns away is repainted in the combined render and not in the bare
    # head. Measured: with the wings, 2 to 5 pixels; without them, zero. The block's edge lands at
    # column 32 with the highlight ending at 29, and three columns of clear is what it costs.
    #
    # So the set separates from the spectacles 12 on the three axes that stay inside the face:
    # it covers rows 33-35 where 12 straddles eyes and mouth at 34-36, it is 2.0 deep against 12's
    # 1.8, and it stands to y 10.2 against 12's 9.6. Silhouette overlap with 12 is 0.44.
    "ea58": {
        "prims": [
            {"t": "box", "bone": "head", "slot": 0, "c0": (-7.2, 7.6, 13.2),
             "c1": (7.2, 10.2, 15.2)},
        ],
    },
    # Round Specs (set 59). The manifest asks for outline circles with the lens left transparent,
    # and transparent is the hard part: there is no torus prim and no boolean, so a rim has to be
    # built as four bars round a hole. Ellipsoid bars were drawn first and do not close — two of
    # them meeting at 45 degrees leave a 0.5 px gap at each diagonal, because an ellipsoid loses
    # its thickness fastest exactly where the next one arrives. Boxes hold their width to the end,
    # so these close.
    #
    # It is a rim and not a square: the top and bottom bars stop at +/-2.5 while the side bars run
    # out to +/-3.4, which notches all four corners. At a 6.8 px lens that notch is the whole
    # difference between a frame and a window, and it is the roundest thing the prim vocabulary
    # can state.
    #
    # The hole is 4.2 x 4.2 and lands on rows 32-36 with the stamped eyes at 33-35 inside it, so a
    # wearer still looks at you. It is sized a row bigger than the eyes on both sides on purpose:
    # a walk down-step drops the root 2.5 px while the face art moves by an integer 2, and this
    # rim measured 3 rows of drop against the face's 2 on exactly those frames. One row of slack
    # each way is what absorbs that. Drawn a row and a bit higher, the top bar sat on the eyes at
    # stand and only cleared them at walk, which is the trap in the other direction.
    #
    # The corner pieces are hinges, not arms. A temple running back to y -4.2 was drawn first: at
    # dir 3 the far end projects 4.4 rows above the near end, so it came out a vertical bracket
    # standing on the forehead, and at dir 1 it swung clear of the head and hung in space. A hinge
    # only 1.5 deep sits at the outer edge of each lens and stays there in all eight directions.
    "ea59": {
        "prims": [
            {"t": "box", "bone": "head", "slot": 0, "c0": (-6.7, 9.05, 16.7),
             "c1": (-1.7, 10.55, 18.0)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (-6.7, 9.05, 11.2),
             "c1": (-1.7, 10.55, 12.5)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (-7.6, 9.05, 12.1),
             "c1": (-6.3, 10.55, 17.1)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (-2.1, 9.05, 12.1),
             "c1": (-0.8, 10.55, 17.1)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (1.7, 9.05, 16.7),
             "c1": (6.7, 10.55, 18.0)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (1.7, 9.05, 11.2),
             "c1": (6.7, 10.55, 12.5)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (6.3, 9.05, 12.1),
             "c1": (7.6, 10.55, 17.1)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (0.8, 9.05, 12.1),
             "c1": (2.1, 10.55, 17.1)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (-1.0, 9.05, 13.8),
             "c1": (1.0, 10.55, 15.0)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (7.6, 8.4, 13.6),
             "c1": (8.7, 9.9, 15.0)},
            {"t": "box", "bone": "head", "slot": 0, "c0": (-8.7, 8.4, 13.6),
             "c1": (-7.6, 9.9, 15.0)},
        ],
    },
    "fa13": {
        "prims": [
            {"t": "box", "bone": "head", "slot": 0, "c0": (-8.2, 6.2, 11.0),
             "c1": (8.2, 9.9, 15.6)},
        ],
    },
    "ca14": {
        "prims": [
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 6.8, 15.0), "r": 2.0},
        ],
    },
    # Accessories pack (#440), neck layer. On the spine bone a point draws at row 65 + y/2 - z,
    # and the space a neck piece has is smaller than it looks: bd1's torso box reaches the chin
    # plane at spine z 21, so anything narrower than 7.5 in x and shallower than 6.0 in y is
    # swallowed whole below that line. Every prim below is therefore either PROUD of the torso or
    # above z 21 — the turtleneck 42 lives by the same rule and shows only rows 42-44 because of
    # it.
    #
    # Scarf (set 60). The drape is what a scarf is at 64 px: a mass wider than the shoulders, not
    # a tube round the neck. At x 8.43 and y 7.40 it clears the torso's 7.5 and 6.0 in both, so it
    # survives the holdout all the way round instead of only under the chin. A second lump is set
    # 1.2 to +x, 1.6 forward and 1.8 lower, which is what stops the pair reading as a smooth
    # collar — a scarf is wrapped, and wrapped means the two turns do not line up.
    #
    # The tail hangs off-centre at x -4.4..-1.6 and widens at its end. Centred, it reads as a tie;
    # off-centre it reads as thrown over a shoulder, and the widening is the fringe.
    "ca60": {
        "prims": [
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 0.0, 19.6), "r": 8.6,
             "squash": (0.94, 0.86, 0.34)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (1.2, 1.6, 17.6), "r": 7.6,
             "squash": (0.92, 0.88, 0.30)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.0, 6.4, 8.0),
             "c1": (-1.2, 7.8, 17.6)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.6, 6.4, 5.0),
             "c1": (-0.6, 8.0, 8.0)},
        ],
    },
    # Tie (set 61). Three prims and the whole set is the taper. A box cannot taper, so the blade is
    # two of them — the ch39 lapel idiom, a staircase of two being enough notch at this scale —
    # 2.4 wide under the knot and 4.6 at the point. Drawn 3.0 and 4.2, the step was one pixel and
    # the set read as a stripe painted down the shirt.
    #
    # The knot is the third prim and it is the widest of the three at 3.8, which is what names the
    # garment: a band that is narrowest at the collar is a placket, and one that is widest there is
    # a tie. It reaches z 20.6, just under the chin plane at 21, so the knot sits in the collar
    # rather than halfway down the chest.
    #
    # It sits at y 6.3 forward, 0.3 proud of bd1's torso, which is all it needs: ca draws after ch
    # and cc in LAYER_ORDER, so a tie paints over whatever top is underneath by layer order and
    # never by depth. Clearing the BODY is the only thing its own holdout render cares about.
    "ca61": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-1.9, 6.3, 18.2),
             "c1": (1.9, 7.7, 20.6)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-1.2, 6.3, 12.0),
             "c1": (1.2, 7.4, 18.2)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-2.3, 6.3, 5.6),
             "c1": (2.3, 7.5, 12.0)},
        ],
    },
    # Chain (set 62). The manifest asks for a 1 px arc and a 1 px arc is not available: the
    # headphones 55 established that geometry only one px clear of the body is pure silhouette
    # outline with no interior shade left between its edges, and comes out a pencil line. So the
    # arc is drawn as seven links instead, each 3.2 px across and overlapping its neighbours, which
    # is both thick enough to hold an interior and what a chain actually looks like at this size.
    #
    # The links sit y 6.6 +/- 0.94, so only the 1.5 px in front of the torso survives the holdout —
    # that shallow depth is what keeps a 3.2 px ball reading as a link rather than a bead. They
    # stop at x +/-5.4 rather than running to the shoulder: the torso edge is 7.5 and an arc that
    # ends ON the outline reads as a collar band, not as something hanging on the chest.
    #
    # No drop. The pendant 14 is a drop on its own and adding one here would make the two sets
    # differ by an arc instead of by their whole shape.
    "ca62": {
        "prims": [
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-5.4, 6.6, 19.0), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-3.8, 6.6, 17.3), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-2.0, 6.6, 16.0), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 6.6, 15.4), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (2.0, 6.6, 16.0), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (3.8, 6.6, 17.3), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (5.4, 6.6, 19.0), "r": 1.7,
             "squash": (0.95, 0.55, 0.95)},
        ],
    },
    "wa15": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-8.1, -6.6, 0.6),
             "c1": (8.1, 6.6, 3.4)},
        ],
    },
    # Sash (set 63, two slots). The belt 15 is one box wrapped horizontally round the waist, so the
    # one thing this set must be is diagonal — and a box cannot be rotated, so the diagonal is a
    # staircase. Six steps, each 2.8 wide and 4.2 tall, overlapping 0.6 in x and 0.8 in z so the
    # run is continuous rather than six separate tiles.
    #
    # The top step wraps the shoulder front to back at y -6.6..7.4 instead of sitting on the chest,
    # which is what makes the band read as passing OVER the shoulder rather than being painted on
    # the front of it. Two back steps carry the run down behind, so dirs 6-7 show the diagonal too;
    # the rest of the back is left off because four more steps buy nothing the first two do not.
    #
    # That wrap stops at x -7.4, inside bd1's own 7.5 torso edge. Drawn to -8.0 it cleared the
    # torso, and a 14-deep box that clears the torso shows its BACK top corner as well as its
    # front — 3.3 rows higher at dir 3, because depth projects at half a row per px — so the band
    # grew a one px spike above the shoulder. Kept inside 7.5, the torso hides the back corner and
    # the wrap still reaches the back where the body no longer covers it.
    #
    # Slot 1 is the trim, and it is placed rather than piped. Edging every step costs six more
    # prims and lands 0.2 px of colour along a 2.8 px band, which at this scale is a fringe of
    # single pixels. A rosette at the hip, a tab at the shoulder and the tail below the rosette
    # spend three prims on three places a player can actually see the second ramp.
    "wa63": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.4, -6.6, 15.0),
             "c1": (-5.0, 7.4, 19.6)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.8, 6.3, 11.8),
             "c1": (-3.0, 7.4, 16.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-3.6, 6.3, 8.6),
             "c1": (-0.8, 7.4, 12.8)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-1.4, 6.3, 5.4),
             "c1": (1.4, 7.4, 9.6)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (0.8, 6.3, 2.2),
             "c1": (3.6, 7.4, 6.4)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (3.0, 6.3, -1.0),
             "c1": (5.8, 7.4, 3.2)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.8, -7.2, 11.8),
             "c1": (-3.0, -6.2, 16.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-3.6, -7.2, 8.6),
             "c1": (-0.8, -6.2, 12.8)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (5.2, 7.0, 0.6), "r": 2.6,
             "squash": (0.95, 0.62, 0.95)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-7.4, 6.3, 19.0),
             "c1": (-4.8, 7.6, 20.4)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (3.8, 6.4, -4.6),
             "c1": (6.2, 7.6, 0.6)},
        ],
    },
    # ---- costume pack 1: bannerhold (#449) ----
    # Seven layers that dress one figure off a single shelf. Each is modelled from the ledger's
    # silhouette intent (docs/plans/2026-08-11-costume-blitz-ledger.md), and each names the sibling
    # it has to stay clear of in outline rather than in ramp.
    #
    # Breeches (set 64, one slot). The lg shelf splits on hem row before anything else, and 64 owns
    # the row just BELOW the knee: the thigh tube runs the leg bone's full 19 px and a cuff ring
    # closes it 2 px down the shin, leaving bd1's own shin bare. Shorts 45 cuts 7.5 px ABOVE the
    # knee with "caps": "top" and no band, so the two never share a hem row and 45 has no ring to
    # break its outline.
    #
    # The ring hangs off knee_l/knee_r, not leg_l/leg_r. A cuff buckled below the knee follows the
    # shin, and the knee bone is where the shin starts — on the thigh bone the ring would stay put
    # while the knee bends 28 degrees in walk1 and walk3 and tear away from its own hem.
    #
    # The tube keeps "caps": "top" for the reason the shorts 45 do: a bottom cap is a sphere hanging
    # below the cut, which turns a hem into a bulb. Here the ring is the hem, and it overlaps the
    # tube's flat end by 1.08 px so the layer stays one island through the deepest knee bend.
    "lg64": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.0, -6.4, -2.4),
             "c1": (8.0, 6.4, 2.4)},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 5.0,
             "caps": "top"},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 5.0,
             "caps": "top"},
            {"t": "ball", "bone": "knee_l", "slot": 0, "c": (0.0, 0.0, -2.0), "r": 5.6,
             "squash": (1.0, 1.0, 0.55)},
            {"t": "ball", "bone": "knee_r", "slot": 0, "c": (0.0, 0.0, -2.0), "r": 5.6,
             "squash": (1.0, 1.0, 0.55)},
        ],
    },
    # Sabatons (set 65, one slot). The shoe shelf splits on what the outline DOES, and this one is a
    # staircase running forward: three lamé plates whose tops step 1.1 px apart from the toe back to
    # the ankle, each 0.3 proud of the shell in x so the step reads sideways as well as in profile.
    # Sneakers 49 stack three boxes vertically over a flared midsole, which is one smooth block seen
    # from the side.
    #
    # Each plate CONTAINS the stretch of foot it covers rather than sitting on a shell over it. A
    # shell tall enough to clothe bd1's foot box tops out at -14.2, and a plate under that line is
    # buried: same layer, so there is no holdout between them and the shell's own surface takes the
    # depth test. Drawn that way the first pass showed 0.3 px of each plate and the staircase was
    # gone. So the plates ARE the shoe, each topping 1.1 px above the one in front of it — -14.4,
    # -13.3, -12.2 — and each one is the outermost thing over its own part of the foot.
    #
    # The floor rule fixes what may overhang. A frame's deepest row is (|x| + |y|) / 2.828 below the
    # prim's own z and the loafer 9's footprint already lands on row 110 against a bounds gate that
    # fails at 111, so the toe plate keeps that footprint exactly and the two behind it buy 0.1 and
    # 0.55 px of overhang for 0.04 and 0.19 of a row. The toe point is the one prim that reaches
    # properly clear — y 8.6, 1.4 past the plate and 2.3 past bd1's own foot box — and pays for it
    # with 1.4 px of lift from z -16.6 against 0.49 of a row.
    "sh65": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.2, 2.2, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -14.4)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.2, 2.2, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -14.4)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.3, -1.6, -float(SHIN_LEN)),
             "c1": (4.3, 2.6, -13.3)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.3, -1.6, -float(SHIN_LEN)),
             "c1": (4.3, 2.6, -13.3)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.35, -3.9, -float(SHIN_LEN)),
             "c1": (4.35, -1.2, -12.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.35, -3.9, -float(SHIN_LEN)),
             "c1": (4.35, -1.2, -12.2)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-2.4, 6.6, -16.6),
             "c1": (2.4, 8.6, -15.0)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-2.4, 6.6, -16.6),
             "c1": (2.4, 8.6, -15.0)},
        ],
    },
    # Gambeson (set 66, two slots). A padded body that never pinches, against the tracksuit top 44
    # which does: 44 runs an 8.6 body down to a 7.8 waistband and has no shoulder break at all. This
    # one keeps 8.6 the whole way and then GAINS width below the waist in a flared skirt band, so
    # the two hems are 1.8 px apart in the opposite direction.
    #
    # The band is flared 2.0 px past the body rather than the 1.0 it was first drawn at, and that is
    # the measured separator against the BLAZER 39 rather than against 44. A straight 8.6 body sits
    # in the middle of 39's 9.4/8.4/7.7 taper and shares almost all of it: at 1.0 the pair measured
    # 0.847 silhouette IoU over 64 dir-frames, which passes the 0.854 bar on 0.007. The extra px of
    # flare buys the margin in the one place 39 has no geometry at all.
    #
    # The rolls are the second half of the separator and they break the outline upward. A ball on
    # the arm bone rotates about the shoulder, so one centred 0.8 px down the bone stays at the
    # shoulder cap through the walk swing and the two wave frames. At r 6.0 it stands 1.6 proud of
    # the sleeve sideways and tops out 1.6 above the body — squashed to 0.74 in y so it never
    # reaches past the body's own 7.1 and the roll stays a shoulder rather than a chest.
    "ch66": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.6, -7.1, 0.0),
             "c1": (8.6, 7.1, 20.2)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 4.2},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 4.2},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-10.6, -8.8, -4.0),
             "c1": (10.6, 8.8, 0.0)},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, 0.8), "r": 6.0,
             "squash": (1.0, 0.74, 1.0)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, 0.8), "r": 6.0,
             "squash": (1.0, 0.74, 1.0)},
        ],
    },
    # Sword Belt (set 67, two slots). The sash 63 is a continuous diagonal from shoulder to hip with
    # nothing under the waist, so this one is its opposite: a horizontal band with one long spur
    # below it and nothing above the waist but a hilt.
    #
    # The spur hangs outboard of the LEFT thigh — leg_l sits at hip x +4.0 and carries a 4.2 limb, so
    # its outer surface is at 8.2 and the scabbard starts at 8.6, clearing it by 0.4. It rides the
    # spine bone rather than the leg: a scabbard is hung off the belt, so it must not swing with the
    # thigh through the walk cycle.
    #
    # It also has to clear the ARM, which is what the thigh clearance alone misses. bd1's arm hangs
    # from chest x +/-9.5 at r 3.2 and reaches spine z -7, so a spur drawn centred at y 0 shares the
    # arm's whole depth: the first pass lost 6.4 px of a 13.4 px scabbard and the hilt entirely,
    # because the arm is nearer and the holdout is doing its job. Moved to y 3.8, the whole spur
    # stands 0.6 in front of the arm and hangs at the front of the hip, which is where a sword belt
    # carries it anyway.
    #
    # The band is 4.0 px tall against the belt 15's 2.8, and the height is measured rather than
    # chosen. Drawn at 3.4 the two quantised to the same rows, and at walk0 d7 — a back frame where
    # the body hides the spur outright — this set came out pixel-identical to the belt. 4.0 puts a
    # row between them in every one of the 64 cells.
    #
    # The mouth is what joins the spur to the band. Drawn only as wide as the scabbard it left a gap
    # between x 8.1 and 8.6, so it reaches back to 7.4 and overlaps the band in x, y and z — the
    # whole set is one island in all 64 cells.
    "wa67": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-8.1, -6.6, 0.2),
             "c1": (8.1, 6.6, 4.2)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (8.6, 3.8, -14.0),
             "c1": (12.0, 7.2, -0.6)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (7.4, 3.4, -0.6),
             "c1": (12.2, 7.6, 2.6)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (9.2, 4.0, 2.6),
             "c1": (11.6, 7.0, 7.6)},
        ],
    },
    # Surcoat (set 68, two slots, hides ch). The overcoat 11 is a sleeved body over a closed flare,
    # so this one is defined by what it leaves out: no sleeves, and open sides. Two flat panels hang
    # front and back at x +/-5.4 against bd1's own 7.5 torso edge, which leaves 2.1 px of bare body
    # showing down each side in every direction — the gap IS the garment.
    #
    # Each panel stands 0.2 clear of the torso in y and no more. A panel thick enough to read on its
    # own edge would close the side gap from the front, because depth projects at half a row per px
    # and the near corner of a deep box swings wide as the figure turns.
    #
    # The yoke is the one thing that crosses the shoulders, and it is what stops the pair of panels
    # reading as two loose flags: squashed to 2.6 px tall it clears the torso all round at x 8.2 and
    # y 8.4, so the ring closes over the shoulder line and both panels hang off it.
    "cc68": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.4, 6.2, -9.0),
             "c1": (5.4, 7.6, 19.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-5.4, -7.6, -9.0),
             "c1": (5.4, -6.2, 19.0)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (0.0, 0.0, 19.4), "r": 8.2,
             "squash": (1.0, 1.02, 0.32)},
        ],
    },
    # Heraldic Mantle (set 69, two slots). The scarf 60 is two offset lumps and one off-centre tail,
    # asymmetric on purpose. The mantle is the symmetric answer: one cone off the chest bone, r0 9.0
    # at the neck opening down to r1 11.4 at spine z 6.0, ending in a single clean hem.
    #
    # It hangs from the chest rather than the spine because a mantle is carried on the shoulders.
    # "z0": 5.0 lifts the wide end to spine z 20, just under the chin plane at 21, so the cone's top
    # disc is the collar and bd1's neck stands up out of the middle of it. The cone crosses x 9.6 a
    # little above the shoulder line, so from the shoulders down it is always past the arm bones at
    # +/-9.5 and the upper arm disappears inside it — below spine z 6 there is no cone and the
    # forearm hangs free.
    #
    # The clasp has to stand OUTSIDE the cone to exist at all: same layer, so there is no holdout
    # between them and the cone's own surface wins the depth test over anything tucked inside it. At
    # y 8.6 it is 1.6 proud of the cone at the throat and reaches 3.6 px above its top disc.
    "ca69": {
        "prims": [
            {"t": "cone", "bone": "chest", "slot": 0, "z0": 5.0, "len": 14.0,
             "r0": 9.0, "r1": 11.4},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (0.0, 8.6, 20.4), "r": 3.4,
             "squash": (1.15, 0.72, 0.95)},
        ],
    },
    # Crested Helm (set 70, two slots, hides hr). The beanie 53 is a 0.88 tall-to-wide dome with a
    # 0.6-proud cuff ledge at z 20.2 and nothing above the crown. This has no ledge, adds a
    # fore-and-aft fin, and carries a flare down the nape.
    #
    # The shell is pushed 3.2 px BACK rather than sat centred, and that shift is the whole front
    # edge. A shell centred on the skull leaves it at the brow: the two ellipsoids part company
    # where the skull is widest in y, low down and far forward, which lands the visible hem on the
    # eyes. Pushed back, the shell's front is buried inside the skull until z 18.9 and the hem
    # surfaces at row 28 instead — while the same shift carries the back down past the nape.
    #
    # The flare is a second ball, wider in y and squashed, standing ~1.9 px proud of the shell at the
    # nape. Its bottom is authored at head z 11.9 rather than the intent's 14 because the shell's own
    # back edge leaves the skull at 12.2: a flare stopping at 14 ends in mid-air above the helm's
    # own hem instead of finishing it.
    #
    # The fin is sagittal and 3.4 px thick, which is the floor — the chain 62 established that
    # anything 2 px or under is pure outline with no interior shade left to read. It tops 6.0 px
    # over the shell's crown and its base is buried inside the shell, so helm and crest are one mass.
    "ha70": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -3.2, 17.6), "r": 10.0,
             "squash": (1.10, 1.00, 0.70)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -6.8, 17.0), "r": 9.6,
             "squash": (0.95, 0.86, 0.53)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (0.0, -1.0, 25.0), "r": 8.0,
             "squash": (0.2125, 1.0, 0.70)},
        ],
    },
    # ---- costume pack 2: nocturne (#450) ----
    # The gothic-manor shelf, modelled from the same ledger. Where bannerhold padded the figure
    # out, nocturne cuts into it: a skirt that steps, a waist pulled in, and a coat with nothing
    # in front of it below the belt.
    #
    # Tiered Skirt (set 71, two slots). The long skirt 48 is one smooth cone, 8.8 to 14.2 over
    # 28 px, and its profile has no break in it anywhere. This is the same envelope broken once:
    # an upper cone hip to z -13, then a lower one starting 1 px inside it and stepping straight
    # out. Slot 1 is the lower tier, so the step carries a second ramp as well as an edge.
    #
    # The step is 3.3 px, not the intent's 0.4, and the two tiers are what pays for it. At z -12
    # the intent's upper cone has reached 10.83 and its lower tier starts at 11.4 — 0.57 proud,
    # half a pixel at 64, and the pack 1 finding says what that renders as: same layer, no holdout
    # between the two cones, so the upper tier's own surface takes the depth test and the ledge is
    # gone. Measured, that skirt also came out at 0.858 silhouette IoU against the long skirt 48,
    # over the 0.854 bar: two cones tracing one smooth cone's envelope ARE that cone.
    #
    # So the upper tier flares to 10.2 rather than 11.0 and the lower runs 13.4 to 14.9. That
    # pulls the whole upper half inside 48's profile, pushes the whole lower half outside it, and
    # drops the pair to 0.831 — the separator is the break, so the break had to be the thing that
    # got bigger. The upper tier still clears the thigh limbs' 8.2 by 1.9 at its narrowest point.
    #
    # The lower tier's top ring sits at z -12.0 against the upper's hem at -13.0, so the two
    # overlap by a px and the layer stays one island through the walk swing. Its hem stays past
    # the skirt 48's 14.2, which is structural rather than styling: a walk frame swings the shin
    # 22 degrees and puts its outer surface 14.0 px off the hip axis, so a narrower hem lets a
    # bare shin through the front of the skirt.
    #
    # Sit check: the cone hangs from the hip, the hip IS the sit anchor at row 74, and a cone of
    # radius r reaches r/2 rows past its own hem — 74 + 27 + 7.45 = row 108, three clear of the
    # 111 the bounds gate fails at.
    "lg71": {
        "prims": [
            {"t": "cone", "bone": "hip", "slot": 0, "len": 13.0, "r0": 8.8, "r1": 10.2},
            {"t": "cone", "bone": "hip", "slot": 1, "z0": -12.0, "len": 15.0,
             "r0": 13.4, "r1": 14.9},
        ],
    },
    # Pointed Boot (set 72, one slot). The heels 51 are an open court shoe — vamp cut low at -14.2,
    # counter to -12.4, a needle spike behind. This is the closed answer: a shell that swallows the
    # ankle to -13.0, and its length spent forward in the toe rather than upward in the heel.
    #
    # The toe is a taper, and a box cannot taper, so it is two of them — the tie 61's idiom. Half
    # widths 4.3, 3.2 and 2.0 against reaches of 6.6, 7.8 and 9.4, which puts the point 3.1 px past
    # bd1's own foot box at y 6.3 and narrows it to under half the shell on the way.
    #
    # Every step of that toe is paid for in lift. A frame's deepest row is (|x| + |y|) / 2.828
    # below the prim's own z, the loafer 9's footprint already lands on row 110 and the bounds gate
    # fails at 111: the loafer spends 4.03 of those rows. The shell spends 3.85 at its widest
    # corner, the first toe box 2.89 and the point 2.43, because each one starts higher than the
    # sole it reaches past — the point sits 1.6 px off the ground plane.
    #
    # The heel behind is two stacked lifts rather than one block, so the back of the boot steps the
    # way the toe does. It tops at -12.8, which is 1.8 above bd1's foot box, and the ankle collar
    # laps over both — collar and upper lift share y -4.0..-3.0 and z -14.8..-13.0, so shell, toe,
    # heel and collar are one island in all 64 cells. The collar clears the shin limb's 3.7 by 0.3.
    "sh72": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.3, -4.2, -float(SHIN_LEN)),
             "c1": (4.3, 6.6, -14.0)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.3, -4.2, -float(SHIN_LEN)),
             "c1": (4.3, 6.6, -14.0)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-3.2, 5.6, -17.0),
             "c1": (3.2, 7.8, -14.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-3.2, 5.6, -17.0),
             "c1": (3.2, 7.8, -14.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-2.0, 7.4, -16.4),
             "c1": (2.0, 9.4, -14.8)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-2.0, 7.4, -16.4),
             "c1": (2.0, 9.4, -14.8)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.0, -4.0, -14.8),
             "c1": (4.0, 4.6, -13.0)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.0, -4.0, -14.8),
             "c1": (4.0, 4.6, -13.0)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-3.5, -6.2, -17.6),
             "c1": (3.5, -3.2, -15.4)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-3.5, -6.2, -17.6),
             "c1": (3.5, -3.2, -15.4)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-3.2, -5.8, -15.8),
             "c1": (3.2, -3.0, -12.8)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-3.2, -5.8, -15.8),
             "c1": (3.2, -3.0, -12.8)},
        ],
    },
    # Corset Bodice (set 73, two slots). The tank 43 is the nearest thing on the most crowded
    # layer in the wardrobe, and it is separated on both of the things this set does: 43 carries
    # two 3.6 straps over the shoulders with a 6.4 gap between them, and it stops at the waist.
    # This has no straps at all, and it gains a hip flare 43 has nothing like.
    #
    # The top edge is flat and straight across at z 15.6 — above the arm bones' own 15, but the
    # shoulder a player reads is the torso box's top at 21 and the arm's cap at 18.2, so the edge
    # lands mid-chest and the shoulders stay bd1's skin. Skin is free: a garment that covers less
    # is not a cheaper garment.
    #
    # The body is 7.8 by 6.3 against the tank's 7.9 by 6.4 — fitted rather than hung, and still
    # 0.3 clear of the torso it covers, which is the floor. Inside that the body wins the depth
    # test and the layer renders as nothing.
    #
    # The peplum is slot 1 and it is one squashed ball at the hem, r 9.2, which is 1.7 past the
    # torso and 1.4 past the bodice's own side. It is centred at z 1.4 with 2.8 px of half-height,
    # so it overlaps the body's own hem and the layer stays one island.
    #
    # The body stops at 2.4 rather than at the hem itself, and that px is what makes the peplum a
    # ring instead of a lip. The flare is only visible between the body's hem and the height where
    # bd1's own thigh caps overtake it — those spheres sit at x +/-4.0 with r 4.2, so they hold
    # 8.2 at z 0 and swallow the ellipsoid's lower pole, which has narrowed to 7.97 by then.
    # Drawn with the body down at 1.4 that left 1.1 px of exposed ring, and at dirs 1 and 5 it was
    # two pixels; lifting the hem doubles it without moving the flare the ledger specified.
    "ch73": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.8, -6.3, 2.4),
             "c1": (7.8, 6.3, 15.6)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (0.0, 0.0, 1.4), "r": 9.2,
             "squash": (1.0, 0.837, 0.304)},
        ],
    },
    # Waist Cincher (set 74, two slots). The belt 15 is one 2.8 px box and the separator is height:
    # 7 px against 2.8 is a band against a line at 64 px. The sash 67 established what the number
    # has to be — drawn at 3.4 it quantised onto the belt's own rows and came out pixel-identical
    # in a back frame — and 7 puts three clear rows between them everywhere.
    #
    # It runs 8.4 wide rather than the 8.1 both shipped wa bands use, because it is the first one
    # to reach BELOW the hip. bd1's thigh limbs are capsules with a top cap, so each is a sphere
    # at x +/-4.0 with r 4.2 that bulges to x 8.2 at z 0 and holds 8.08 at z -1. A band at 8.1 has
    # its own side buried in that bulge for the bottom px of its run, which is a notch bitten out
    # of the outline at exactly the height the garment is named for. 8.4 clears the sphere at
    # every z the band occupies.
    #
    # Slot 1 is the lacing plate, 4.2 wide and 1.0 proud of the band's front. Proud is what buys
    # it: the zip on the tracksuit 44 reads at 0.1 because a second ramp is a colour rather than a
    # ridge, and a px of relief on top of that puts a shade boundary down both its edges as well.
    "wa74": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-8.4, -6.6, -1.0),
             "c1": (8.4, 6.6, 6.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-2.1, 6.6, -0.4),
             "c1": (2.1, 7.6, 5.4)},
        ],
    },
    # Tailcoat (set 75, two slots, hides ch). The overcoat 11's whole read below the waist is a
    # flare cone, closed and even in all eight directions. This has the opposite: geometry behind
    # the figure and none at all in front of it. The body is cut off square at z 1.0 and two tails
    # carry on down to -8.0 at y < 0 only, so dirs 2/3/4 show a bare hip and dirs 6/7/0 show the
    # tails. Same body and same sleeves as 11 above the waist — that is the point of the pair.
    #
    # The tails sit at y -7.4..-6.0, which is 1.4 clear of bd1's torso and 0.5 proud of the coat's
    # own back face, so they read as panels hung off it rather than as a thicker back. The pack 1
    # sword belt found the trap this avoids: bd1's arm is a capsule at x +/-9.5, r 3.2, hanging to
    # spine z -7, so anything centred near y 0 at this height loses half its length to the arm's
    # holdout. Everything here is behind y -6.0 and the arm never reaches past +/-3.2.
    #
    # The gap between them is 3.2 px, which is the floor: the chain 62 established that 2 px or
    # under is pure outline with no interior shade, and a gap narrower than that closes up into
    # one panel under quantisation. Each tail laps 0.6 px up into the body at z 1.6, so coat and
    # tails are one island in all 64 cells.
    #
    # Slot 1 is the collar and the tails together. The collar is a stand collar wrapping the neck
    # at 7.4 in y, 0.5 proud of the body and 1.8 above its shoulder line, and it clears hd2's own
    # 3.6 neck limb by nearly two.
    "cc75": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.4, -6.9, 1.0),
             "c1": (8.4, 6.9, 20.6)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 4.0},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 4.0},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-7.4, -7.4, -8.0),
             "c1": (-1.6, -6.0, 1.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (1.6, -7.4, -8.0),
             "c1": (7.4, -6.0, 1.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-5.4, -7.4, 19.8),
             "c1": (5.4, 7.4, 22.4)},
        ],
    },
    # Lace Ruff (set 76, one slot). The scarf 60 is a vertical asymmetric mass with a tail running
    # down to z 5. This is the plane rotated: one flat symmetric plate lying at the chin with
    # nothing hanging below it, so the head sits in it.
    #
    # It is a single prim on purpose. The neck's whole budget is the space above bd1's torso — the
    # box reaches the chin plane at spine z 21, so anything narrower than 7.5 in x or shallower
    # than 6.0 in y is swallowed below that line — and a plate that clears it in both is already
    # the entire garment. A second ring inside this one would be geometry hidden under its own
    # layer, which pack 1 measured as rendering nothing at all.
    #
    # r 9.4 with 1.6 px of half-height. A spine point draws at row 65 + y/2 - z, so the plate's
    # forward edge lands on row 48.7 and its lowest lit row is 48, exactly where the ledger put it.
    #
    # The edge that needed measuring is the BACK one. A horizontal ring projects its far side
    # upward, and this one's reaches row 39 — the mouth's own row — in the same columns the face
    # draws in. The holdout is what makes that safe: at spine z 22 the skull still carries 4.9 px
    # of depth, so it is nearer than the plate's back at y -8.9 and wins those pixels outright.
    # Measured on the frozen sheet, the ruff stands at rows 41-48 rather than 39-48, and across
    # all 64 dir-frames against all eight eyed heads it paints over 0 face pixels.
    "ca76": {
        "prims": [
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 0.0, 21.0), "r": 9.4,
             "squash": (1.0, 1.0, 0.170)},
        ],
    },
    # Mourning Hat (set 77, two slots, hides hr). The top hat 54's brim is a flat 26 px disc, 3 px
    # thick, lying on one plane, so its side outline is a line. This brim DROOPS: a cone with its
    # widest ring at the BOTTOM, 8.0 at z 24.4 down to 13.0 at 21.2, which makes the same 26 px of
    # span read as a wing that slopes 3.2 px on the way out.
    #
    # The brim's outer edge is the number the whole set is built around. A horizontal ring of
    # radius R on plane z puts its forward edge at row 44 + R/2 - z, so 13.0 at 21.2 lands on row
    # 29.3 — inside the rule that head geometry keeps its lowest lit pixel at row 30 or above, and
    # one row clear of the brow the face sets draw at 31. That margin is the reason the brim could
    # not simply be hung lower to make room for the crown.
    #
    # So the crown tops at 28 rather than the ledger's 26. The brim's own top ring is at 24.4, and
    # a dome ending at 26 leaves 1.6 px of crown above the junction — at 64 px that is one pixel,
    # which is not a crown. At 28 there are 3.6 px of dome standing over the brim and the topmost
    # lit row is 14, seven clear of the 21 the skull tops out at and well inside the free rows.
    #
    # Slot 1 is the hat band, and it is a cone rather than a ring so it can follow the dome as the
    # dome narrows: 6.6 at z 26.4 flaring to 8.9 at 24.4, which holds it 0.4-0.7 px proud of the
    # crown the whole way and 0.9 px proud of the brim's top ring where the two meet.
    #
    # Measured on the frozen sheet against all eight eyed heads over all 64 dir-frames: 0 face
    # pixels painted over. The brim's lowest lit row is 30 standing, which leaves one clear row
    # under it, and 32 on walk0 and walk2 — the down-steps drop the root 2.5 px while the face art
    # moves with an integer headShift of 2, so exactly the half row the ledger warns about closes
    # and the brim ends up adjacent to the brow rather than over it. That is the margin the top
    # hat 54 and the beanie 53 both ship with, measured the same way.
    "ha77": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -0.4, 21.0), "r": 9.4,
             "squash": (1.0, 0.97, 0.745)},
            {"t": "cone", "bone": "head", "slot": 0, "z0": 24.4, "len": 3.2,
             "r0": 8.0, "r1": 13.0},
            {"t": "cone", "bone": "head", "slot": 1, "z0": 26.4, "len": 2.0,
             "r0": 6.6, "r1": 8.9},
        ],
    },
    # ---- costume pack 3: mochi (#452) ----
    # Soft and rounded. Bannerhold padded the figure out and nocturne cut into it; this pack curves
    # it. Every row here replaces a straight edge somewhere in the wardrobe with an arc, so the
    # meshes lean on the ball prim where the other two packs leaned on the box.
    #
    # Bloomers (set 78, one slot). The shorts 45 are a straight r 5.4 tube with a flat cut — two
    # parallel lines in profile — so this one spends its whole budget on the thigh being a curve:
    # a ball r 6.6 centred at leg z -6.4, which bulges 1.2 past 45 at mid-thigh and has narrowed
    # back inside it by the hem.
    #
    # The cuff is a second ball rather than a ring band, and the two are sized so one is always
    # clearly proud of the other rather than tangent to it. At leg z -11 the thigh ball still holds
    # 4.73 against the cuff's 4.07, and by -12 the cuff is at 4.74 against the thigh's 3.49 — they
    # cross at about -11.5, which is a 1.25 px step at the hem instead of the 0.05 px coincidence
    # the first pass drew when both were centred on the same 2.4 px of z.
    #
    # The visible cuff is where it clears bd1's own 4.2 thigh limb: 4.8 * sqrt(1 - (dz/2.64)^2)
    # passes 4.2 at dz 1.28, so the ring reads from leg z -11.1 to -13.7 and the hem sits 5.3 px
    # above the knee. Below it the thigh, the knee and the shin are all bare skin, which is free.
    "lg78": {
        "prims": [
            {"t": "box",  "bone": "hip",   "slot": 0, "c0": (-8.0, -6.4, -2.4),
             "c1": (8.0, 6.4, 2.2)},
            {"t": "ball", "bone": "leg_l", "slot": 0, "c": (0.0, 0.0, -6.4), "r": 6.6,
             "squash": (1.0, 0.95, 1.0)},
            {"t": "ball", "bone": "leg_r", "slot": 0, "c": (0.0, 0.0, -6.4), "r": 6.6,
             "squash": (1.0, 0.95, 1.0)},
            {"t": "ball", "bone": "leg_l", "slot": 0, "c": (0.0, 0.0, -12.4), "r": 4.8,
             "squash": (1.0, 1.0, 0.55)},
            {"t": "ball", "bone": "leg_r", "slot": 0, "c": (0.0, 0.0, -12.4), "r": 4.8,
             "squash": (1.0, 1.0, 0.55)},
        ],
    },
    # Puff Slippers (set 79, two slots). The sneakers 49 are three stacked boxes with a flared
    # midsole — three horizontal steps in the profile. This has none: one squashed ball carries the
    # whole upper, so the outline is a single arc from the toe to the ankle.
    #
    # The ball alone cannot reach the floor, and that is geometry rather than taste. An ellipsoid
    # narrows to a point at its lower pole, so low down it holds less than bd1's own 3.7 foot box in
    # x and less than its 6.3 in y — the toe escapes out the bottom of its own slipper. The sole
    # plate is what closes that: it carries the whole foot box, 0.2 proud all round, which the
    # ledger names as the floor for a garment surface. Its top is at -14.2 rather than the foot's
    # own -14.6 because two coplanar faces z-fight, and 0.4 px of headroom costs nothing.
    #
    # It is 0.2 and not the shell's 1.2 because of the ground plane. A prim's deepest row is
    # (|x| + |y|) / 2.828 below its own z, the loafer 9 already lands on row 110 and the bounds gate
    # fails at 111: the loafer spends 4.03 rows, this plate spends 3.68, and the same plate drawn at
    # the shell's 1.2 overhang would spend 4.38 and hang a third of a row past the floor. So the
    # overhang lives on the shell, which starts 2.2 px up where it can afford it.
    #
    # The shell's widest ring is at z -12.8, above the foot box entirely, which is what makes this a
    # puff rather than a wide shoe: 4.9 in x and 5.8 in y around the ANKLE. Its centre is 1 px above
    # the intent's, and that px is the ankle. An ellipsoid stops reading where it drops back inside
    # bd1's 3.7 shin, which the first pass did at z -11.05 — 1.4 px over the sneaker 49's upper,
    # against a row that claims 3. Lifted, it reads to -9.8, which is 2.6.
    #
    # Slot 1 is the toe dome and it has to stand OUTSIDE the shell to exist at all: same layer, no
    # holdout between them, so the shell's own surface wins the depth test over anything tucked
    # inside it. At y 8.51 it is 1.07 proud of the shell at the toe and inside it everywhere else,
    # so the second ramp reads as a cap on the front and never breaks the side outline.
    "sh79": {
        "prims": [
            {"t": "box",  "bone": "knee_l", "slot": 0, "c0": (-3.9, -3.1, -float(SHIN_LEN)),
             "c1": (3.9, 6.5, -14.2)},
            {"t": "box",  "bone": "knee_r", "slot": 0, "c0": (-3.9, -3.1, -float(SHIN_LEN)),
             "c1": (3.9, 6.5, -14.2)},
            {"t": "ball", "bone": "knee_l", "slot": 0, "c": (0.0, 1.7, -12.8), "r": 5.8,
             "squash": (0.845, 1.0, 0.793)},
            {"t": "ball", "bone": "knee_r", "slot": 0, "c": (0.0, 1.7, -12.8), "r": 5.8,
             "squash": (0.845, 1.0, 0.793)},
            {"t": "ball", "bone": "knee_l", "slot": 1, "c": (0.0, 5.2, -14.4), "r": 4.6,
             "squash": (0.85, 0.72, 0.70)},
            {"t": "ball", "bone": "knee_r", "slot": 1, "c": (0.0, 5.2, -14.4), "r": 4.6,
             "squash": (0.85, 0.72, 0.70)},
        ],
    },
    # Cloud Cardigan (set 80, two slots). The widest body in the wardrobe at 9.0, against the
    # gambeson 66's 8.6 and the tracksuit 44's 8.6, and the only one that carries that width from
    # the shoulder to the hem without a band under it.
    #
    # The tracksuit is the pair this has to beat, and both of its separators are on the run of the
    # garment rather than its shape. 44 pinches 8.6 to a 7.8 waistband and stops at spine z 0.6;
    # this drops straight past the hip to -2.0, where bd1's own thigh caps hold 7.69 and the body
    # still clears them. And 44's sleeve is r 4.6 over 20 px; this is 5.0 over 21, so its cap
    # sphere lands at -26.0 against bd1's arm ending at -25.2 — the cuff closes over the hand where
    # 44's stops 0.6 short of it.
    #
    # Slot 1 is embedded into the body rather than laid on it, which is the tracksuit zip's idiom:
    # each plate spans y 6.6-7.8, so 0.6 of it is buried in the 7.2 body and 0.6 stands proud. A
    # plate whose back face is coplanar with the body's front z-fights along the whole panel.
    # None of it breaks the outline — the placket and the two pockets are inboard of the 9.0 edge,
    # so the second ramp is a colour down the front and a shade boundary at each pocket lip.
    "ch80": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-9.0, -7.2, -2.0),
             "c1": (9.0, 7.2, 20.2)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 21.0, "r": 5.0},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 21.0, "r": 5.0},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-1.6, 6.6, -1.4),
             "c1": (1.6, 7.8, 19.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (2.8, 6.6, 1.2),
             "c1": (6.4, 7.8, 6.2)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-6.4, 6.6, 1.2),
             "c1": (-2.8, 7.8, 6.2)},
        ],
    },
    # Pinafore Apron (set 81, two slots). Every other wa in the wardrobe is a band round the waist
    # with something hung off it — the belt 15, the sash 63, the sword belt 67's ring and spur, the
    # cincher 74. This one has no band at all: a broad plate down the front of the hip, a bib up the
    # chest, and two straps over the shoulders, so its mass is vertical where theirs is horizontal.
    #
    # Every panel is 1.4 thick with its outer face 1.6 proud of bd1's 6.0 torso, which is the
    # surcoat 68's numbers exactly. That coat measured what happens either side of them: thinner and
    # the panel has no edge left to read at dirs 1 and 5, thicker and its near corner swings wide
    # enough to close the gap the garment is defined by.
    #
    # The panel runs to spine z -14, five px above the knee, and the sit frame is what caps it. The
    # hip IS the sit anchor at row 74 and a spine point draws at 74 + y/2 - z, so the panel's
    # deepest corner lands on row 92.6 at the diagonal — nineteen clear of the 111 the bounds gate
    # fails at. It hangs rigid from the spine there, past a thigh that has swung horizontal, which
    # is what the long skirt 48 and the tailcoat 75 both do on that frame.
    #
    # Slot 1 is the bib and the straps, and each joint laps 0.6 px into the piece below it rather
    # than meeting it on a shared face: the bib starts at z 1.4 inside the panel and the front
    # straps at 13.4 inside the bib, so the whole garment is one island in all 64 cells. The
    # shoulder pieces cross from y -7.6 to 7.6 and stand 0.4 above the torso's own top at z 21, so
    # a strap reads from the front, the side and the back rather than only where it is coloured.
    "wa81": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-5.5, 6.2, -14.0),
             "c1": (5.5, 7.6, 2.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-3.6, 6.2, 1.4),
             "c1": (3.6, 7.6, 14.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (2.6, 6.2, 13.4),
             "c1": (6.0, 7.6, 20.8)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-6.0, 6.2, 13.4),
             "c1": (-2.6, 7.6, 20.8)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (2.6, -7.6, 19.6),
             "c1": (6.0, 7.6, 21.4)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-6.0, -7.6, 19.6),
             "c1": (-2.6, 7.6, 21.4)},
        ],
    },
    # Puff Muffler (set 82, one slot). The lace ruff 76 is a horizontal plate lying at the chin.
    # This is the same idea stood upright: a vertical tube round the neck, 7 px tall, symmetric,
    # with nothing hanging below it.
    #
    # Its radius is 8.6 and not the intent's 6.0, and the reason is bd1 rather than taste. The torso
    # box runs x +/-7.5 by y +/-6.0 all the way up to spine z 21, so a tube of radius 6 spanning
    # z 15-22 is inside the body for six of its seven px. Built that way and rendered, it came out
    # at 24-25 lit pixels per dir-frame, all of them in rows 43-46 — a collar sliver above the
    # shoulders, not a muffler. 8.6 clears the torso by 1.1 in x and 2.6 in y, and it stays 0.8
    # inside the ruff's own 9.4, which is what keeps this one hugging the neck where 76 rings it.
    #
    # Above the shoulders the skull is the thing to clear instead, and it grows fast: 4.21 at spine
    # z 22, 6.93 at 24, 7.75 at 25. So the tube tops out at 24 and a squashed ball carries it the
    # last px to about 24.9, which is where 8.5 finally drops inside the skull. The ball is 8.5
    # against the cylinder's 8.6 on purpose — equal radii would put two surfaces on the same
    # cylinder at z 24 and z-fight along the whole ring — and it rounds the top, which a flat cap
    # on a part named for softness should not be.
    #
    # The back of the top ring is the edge that needed checking, the way the ruff 76's did. It
    # projects UPWARD to row 36, the nose's own row, in the columns the face draws in. The holdout
    # is what makes that safe: at spine z 24 the skull still carries 6.5 px of depth and sits nearer
    # than the ring's back at y -8.6, so it wins those pixels outright.
    "ca82": {
        "prims": [
            {"t": "cone", "bone": "spine", "slot": 0, "z0": 24.0, "len": 6.0,
             "r0": 8.6, "r1": 8.6},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 0.0, 24.0), "r": 8.5,
             "squash": (1.0, 1.0, 0.304)},
        ],
    },
    # Sleep Cap (set 83, two slots, hides hr). The top hat 54 is a straight-sided cylinder with a
    # flat lid and a 26 px brim. This has no brim at all and narrows the whole way up, so its
    # profile is a triangle where 54's is a rectangle.
    #
    # The taper cannot be the whole hat. The intent bases its cone at head z 23, and the skull tops
    # out at 22 — a cone starting there hangs in the air over a bald head, because this set hides
    # the hair that would otherwise fill the gap. So a crown dome carries the cap down onto the
    # skull and the cone grows out of it, which is the mourning hat 77's construction with the brim
    # taken off.
    #
    # The dome is SHALLOW — 5.58 of z radius against its 9.0 in x — and that ratio is the whole
    # read. Drawn round, at 7.02, the dome carried the silhouette to head z 27.6 and the taper only
    # showed for the last six px: a beanie with a knob on it, not the triangle the row asks for.
    # Flattened, the cone takes over at 24.6 instead, so 11 px of the cap is taper and 8 is crown.
    #
    # The hem is where the dome's own radius overtakes the skull's, and that is what has to clear
    # the face. At head z 18 the dome holds 8.05 against the skull's 7.81 and at 17.5 the skull's
    # 8.16 has taken it back, so the cap stops at about 17.9. Measured on the frozen sheet: lowest
    # lit row 29 standing and 32 on walk0 and walk2, where the down-step drops the root 2.5 px
    # against an integer headShift of 2. The mourning hat 77 ships at 30 and 32 measured the same
    # way, and against all eight eyed heads over all 64 dir-frames this paints over 0 face pixels.
    #
    # The cone emerges from the dome rather than sitting on it, so there is no step where they
    # meet, and its base ring at head z 22 is 7.3 against the dome's 8.67 — the taper contributes
    # no edge at all down where the crown is doing the work.
    #
    # Slot 1 is the tip: a ball r 3.0 sat on the cone's own 3.4 top, so it caps the point instead of
    # widening it, and its crown lands on row 8 — thirteen rows clear of the 21 the skull tops out
    # at, and inside the free rows the top hat 54 also lives in.
    "ha83": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 0.0, 20.5), "r": 9.0,
             "squash": (1.0, 0.97, 0.62)},
            {"t": "cone", "bone": "head", "slot": 0, "z0": 33.0, "len": 11.0,
             "r0": 3.4, "r1": 7.3},
            {"t": "ball", "bone": "head", "slot": 1, "c": (0.0, 0.0, 33.0), "r": 3.0},
        ],
    },
    # ---- costume pack 4: starliner (#454) ----
    # Spacefarer. The first three packs shaped the figure — padded, cut, curved — and this one
    # bolts hardware to it: rings round the limbs, a right angle at the shoulder, and gear that
    # stands off the body far enough to throw its own outline.
    #
    # Pressure Leggings (set 84, two slots). The cargo 47 breaks its outline with four pocket
    # boxes on the outboard and front faces only, so it reads differently from every direction.
    # This one is the opposite discipline: three full-circumference bands on a slim tube, which
    # look the same from all eight.
    #
    # The bands are CYLINDERS, not squashed balls. A ball ring is only proud at its own centre
    # plane — the bloomer 78's cuff spends 2.64 px of z to hold 0.6 px of step — and a band that
    # is proud at one row and flush two rows later is a shading change, not a silhouette. A cone
    # with equal radii holds its radius across its whole height, so all three bulges are the same
    # depth at every row they cover.
    #
    # The tube is 4.5, which clears bd1's 4.2 thigh by 0.3 and its 3.7 shin by 0.8, and is 1.0
    # slimmer than the cargo's thigh. Slot 1 is the three bands.
    #
    # The bands are 6.6 and 3.4 tall, not the intent's 5.8 and 3.0, and the trousers 7 are what
    # moved them. 47 is not the nearest sibling here — 7 is, because it is the other full-length
    # tube: 4.7 at the thigh against this one's 4.5 and 4.3 at the shin against 4.5, which is a
    # tenth of a pixel of difference over the whole leg. At the intent's 5.8 the bands stood only
    # 1.1 px proud of 7's own outline and the pair measured 0.8472 IoU — inside the 0.854 bar by
    # seven thousandths, which is not a separator, it is a coincidence. At 6.6 they stand 1.9 proud
    # of 7 and carry 3.4 px of height each, and that pair drops to 0.7971.
    #
    # Measured against all nine shipped lg sets, the tightest is now the cargo 47 at 0.8208 — the
    # sibling the row names, which is the right shape for the pair to be in. Flares 46 sit at
    # 0.8029 and everything else is under 0.55.
    "lg84": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.0, -6.4, -2.4),
             "c1": (8.0, 6.4, 2.2)},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 4.5},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 4.5},
            {"t": "limb", "bone": "knee_l", "slot": 0, "len": float(SHIN_LEN), "r": 4.5,
             "caps": "top"},
            {"t": "limb", "bone": "knee_r", "slot": 0, "len": float(SHIN_LEN), "r": 4.5,
             "caps": "top"},
            {"t": "cone", "bone": "leg_l",  "slot": 1, "z0": -5.5, "len": 3.4,
             "r0": 6.6, "r1": 6.6},
            {"t": "cone", "bone": "leg_r",  "slot": 1, "z0": -5.5, "len": 3.4,
             "r0": 6.6, "r1": 6.6},
            {"t": "cone", "bone": "knee_l", "slot": 1, "z0": -0.5, "len": 3.4,
             "r0": 6.6, "r1": 6.6},
            {"t": "cone", "bone": "knee_r", "slot": 1, "z0": -0.5, "len": 3.4,
             "r0": 6.6, "r1": 6.6},
            {"t": "cone", "bone": "knee_l", "slot": 1, "z0": -8.0, "len": 3.4,
             "r0": 6.6, "r1": 6.6},
            {"t": "cone", "bone": "knee_r", "slot": 1, "z0": -8.0, "len": 3.4,
             "r0": 6.6, "r1": 6.6},
        ],
    },
    # Mag Boots (set 85, two slots). The boots 50 put their mark up the shin — a shaft to -9.4
    # closed by a cuff band — and this one stops at the ankle and spends everything on the floor.
    #
    # The sibling that actually binds is the SNEAKERS 49, not 50. 49 is already tread, flared
    # midsole and upper: three stacked boxes with the flare in the middle one, which is the same
    # sentence the intent writes for this boot. Built to the intent's numbers — a 2.4 slab out to
    # x 5.2 and y 8.8 over a loafer-footprint tread — the pair measured 0.8757 IoU, over the 0.854
    # bar, because 49's midsole already reaches x 4.9 and y 8.4 and its upper already sits where
    # this one's ankle shell does. Two shoes cannot both be "a flare between a tread and an upper".
    #
    # So the slab stops being a midsole and becomes a PLATE: x 6.2 and y -5.6..9.6, which is
    # 1.3 px wider and 1.2 px longer than anything 49 puts there and 2.4 px past the toe of the
    # loafer 9 the tread is cut to. That drops the pair to 0.7442, and the plate is then the
    # largest single mass on the shoe layer rather than a step inside it.
    #
    # The plate is paid for in lift, the same arithmetic the sneakers 49 record. A frame's deepest
    # row is (|x| + |y|) / 2.828 below the prim's own z; this plate overhangs the loafer footprint
    # by 2.0 in x and 2.4 in y at its worst corner, which is 1.56 rows, so it starts at -16.2 —
    # 1.8 px off the ground plane — and lands 0.24 px ABOVE the tread's own row instead of under
    # it. Measured, the walk-contact frames put it on row 110 with the gate failing at 111.
    #
    # Slot 1 is the plate alone. It is the whole read of the boot, so it is the half a second ramp
    # is spent on.
    "sh85": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -16.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -16.2)},
            {"t": "box", "bone": "knee_l", "slot": 1, "c0": (-6.2, -5.6, -16.2),
             "c1": (6.2, 9.6, -13.8)},
            {"t": "box", "bone": "knee_r", "slot": 1, "c0": (-6.2, -5.6, -16.2),
             "c1": (6.2, 9.6, -13.8)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.4, -3.7, -13.8),
             "c1": (4.4, 6.6, -11.4)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.4, -3.7, -13.8),
             "c1": (4.4, 6.6, -11.4)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.0, 4.8, -13.8),
             "c1": (4.0, 7.8, -12.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.0, 4.8, -13.8),
             "c1": (4.0, 7.8, -12.2)},
        ],
    },
    # Flight Suit (set 86, two slots). The row asks for a right angle at each shoulder where every
    # other top is round, and the first build put it in the wrong place. A yoke out to x 9.4 — the
    # intent's 1.4 proud of an 8.0 body — is INVISIBLE: the sleeves hang off bones at x 9.5 with
    # r 3.8, so the arm surface is already at 13.3 and it, not the body, owns the shoulder outline
    # from z 11 to 18.8. That build measured 0.9560 IoU against the staff blazer 16 and 0.8705
    # against the turtleneck 42, because what it actually shipped was their silhouette exactly.
    #
    # The corner has to go where nothing else reaches: ABOVE the sleeve's top cap at z 18.8. So the
    # yoke runs z 14.6-21.6 and stands 2.2 px over the body's own top edge at 19.4, out to x 10.6.
    # Its top-outer corner at (10.6, 21.6) is in clear air — no shipped ch has any mass above 20.4
    # outboard of the neck — and that corner is the whole set.
    #
    # The body is 7.6, slimmer than all four of the tops it was colliding with (16 at 8.2, 42 at
    # 7.7, 40 at 8.0, 39 stepping 9.4/8.4/7.7) and with no taper anywhere, so the outline is two
    # parallel lines from hem to shoulder and then a hard block. Measured, every purchasable ch
    # pair now clears: the turtleneck 42 drops to 0.8067, the tracksuit top 44 to 0.7901, the
    # hoodie 38 to 0.7893 and the blazer 39 to 0.7644.
    #
    # The staff blazer 16 sits at 0.8716, over the 0.854 bar and left there deliberately. 16 is the
    # NPC uniform — not in WEARABLE_SHELF, not priced, not in the starter grant — so no player can
    # own both and the pair is not a purchasable one. It is also inside the envelope the wardrobe
    # already ships against 16: the vest 40 is at 0.8732 and the turtleneck 42 at 0.8588. A body
    # slim enough to clear 16 outright would have to leave the 7.6-8.2 band every plain-bodied top
    # lives in, and the row's separator is the shoulder, not the waist.
    #
    # Slot 1 is the yoke and the chest rig band.
    "ch86": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.6, -6.3, 0.5),
             "c1": (7.6, 6.3, 19.4)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 20.0, "r": 3.8},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 20.0, "r": 3.8},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (4.6, -6.6, 14.6),
             "c1": (10.6, 6.6, 21.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-10.6, -6.6, 14.6),
             "c1": (-4.6, 6.6, 21.6)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-7.8, 6.3, 9.4),
             "c1": (7.8, 7.3, 12.8)},
        ],
    },
    # Oxygen Line (set 87, two slots). The chain 62 is a symmetric seven-link arc that stops at
    # x 5.4 and never drops below z 15.4. This one crosses the whole chest on the diagonal and
    # ends at the hip, 11 px lower, so the two share neither an axis nor an endpoint.
    #
    # FIVE links, not the intent's four. The run is from the left collar at (5.4, 17.4) to the
    # right hip at (-5.4, 3.8), which is 17.4 px of path; four links 3.4 px across would sit 5.8
    # apart and read as four separate dots with the torso between them. Five at 3.4 leave 0.7 px
    # of x overlap and 2.2 px of z overlap between neighbours, so the run is one island through
    # every walk frame. The link stays 3.4 px across as specced — it is the count that moved.
    #
    # Each link is a ball stretched in z (radius 1.7 / 1.7 / 2.8), because the run is 14 px of
    # drop against 11 of travel and a round link would need eight of them. Stretched, the joins
    # overlap along the direction the run actually goes, which is what makes it read corrugated
    # rather than beaded.
    #
    # They sit at y 7.4, so the front of each link is at 9.1 — 3.1 px proud of bd1's torso at 6.0
    # and 1.8 proud of the flight suit 86's own chest rig band at 7.3. `ca` draws after `ch`, so
    # the line is never overdrawn; standing that far off is what keeps it from reading as printed
    # ON the suit. Measured over the pack composited on one figure, all 5286 of this layer's
    # pixels survive with 86 worn under it — 2636 of them the links, 41 per frame — and the ten
    # dir-frames that carry none are dirs 6 and 7, where a run across the CHEST is behind the
    # figure and is meant to be gone.
    #
    # Against the seven shipped ca sets the tightest pair is the scarf 60 at 0.4908; the chain 62
    # the row names is at 0.0814, which is what a diagonal costs against an arc.
    #
    # Slot 1 is the neck ring: a 6.6 collar at z 19.2-22.4. It is proud of the torso in y (6.6
    # against 6.0) and of the skull above z 21, where the head ball's own radius is still under
    # 5.0 — a ring narrower than 6.6 would be swallowed by the shoulders at one end or the jaw at
    # the other.
    "ca87": {
        "prims": [
            {"t": "cone", "bone": "spine", "slot": 1, "z0": 22.4, "len": 3.2,
             "r0": 6.6, "r1": 6.6},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (5.4, 7.4, 17.4), "r": 1.7,
             "squash": (1.0, 1.0, 1.647)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (2.7, 7.4, 14.0), "r": 1.7,
             "squash": (1.0, 1.0, 1.647)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 7.4, 10.6), "r": 1.7,
             "squash": (1.0, 1.0, 1.647)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-2.7, 7.4, 7.2), "r": 1.7,
             "squash": (1.0, 1.0, 1.647)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-5.4, 7.4, 3.8), "r": 1.7,
             "squash": (1.0, 1.0, 1.647)},
        ],
    },
    # Pressure Goggles (set 88, two slots). The first eyewear since 58/59 and the third garment
    # ever to land ON the face, so the catchlight corridor decides its shape before taste does.
    #
    # The plate covers the eye band OUTRIGHT — that is the whole reason it exists. figurepass
    # repaints a lone `hi` in rows 34-43 of the head's own interior, and the sunglasses 58 proved
    # a garment does not have to cover such a pixel to break it: an edge landing beside the cheek
    # highlight shifts its neighbour's quantised shade and the repaint stops matching. Covering
    # x 8.5 leaves nothing but columns 22 and 41 of head in those rows, and both are silhouette
    # ring, which patchHead exempts outright. So the plate is wide for the same reason 58 is one
    # box: it is the side of the rule with no pixels left to argue about.
    #
    # It stands at y 11.4, which is 2.3 px proud of the skull at eye height and 0.2 past hd2's
    # own nose box at 11.2. Drawn flush at 9.6 the nose pokes through the plate's lower half at
    # rows 37-38, because the nose reaches z 12.6 and the band has to come down to 12.2 to cover
    # row 37 at all. Standing off is what buys both.
    #
    # The half-width is 9.0, not 8.5. At 8.5 the plate covered columns 23-39 and left column 40 —
    # five INTERIOR head pixels at rows 32-36, dir 3, the exact kind patchHead is allowed to
    # repaint. At 9.0 the band rows 32-37 x columns 24-40 is covered outright with nothing left
    # but columns 22 and 41, which are silhouette ring. Measured against all eight eyed heads
    # over all 64 dir-frames, the eye-code art has ZERO uncovered pixels at dirs 2, 3 and 4; the
    # 416 that remain are all at dirs 1 and 5, where the head is edge-on and a flat plate on the
    # face projects to a strip. The sunglasses 58 leave 652 the same way.
    #
    # The corridor itself, measured per frame: (30,36) at dir 4 is COVERED on seven frames and
    # 3 px clear on the sit; (28,34) is 3 clear at dir 2 and 5-6 clear at dir 6. No site is ever
    # 1 px away, which is the only distance that fails. gateHoldout is the binding check and it
    # passes — the plate perturbs no repaint anywhere on the sheet.
    #
    # Drift, swept over all 64: at dir 3 the plate spans rows 30-37 standing and 33-40 on walk0
    # and walk2 — a 3-row drop against the face art's integer 2, the same 3-against-2 the round
    # specs 59 measured. Standing leaves 3 rows between the plate's top edge and the eyes at 33,
    # so one row of relative drift still leaves two.
    #
    # Slot 1 is the two cups: balls stretched forward (radius 3.4 / 3.74 / 3.4) to y 13.6, so at
    # dirs 1/2/4/5 the profile is two barrels where 58 is one flush plate. Against the three
    # shipped ea sets the tightest pair is the round specs 59 at 0.5471.
    "ea88": {
        "prims": [
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-9.0, 7.6, 12.2),
             "c1": (9.0, 11.4, 17.6)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (3.6, 9.9, 14.8), "r": 3.4,
             "squash": (1.0, 1.1, 1.0)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (-3.6, 9.9, 14.8), "r": 3.4,
             "squash": (1.0, 1.1, 1.0)},
        ],
    },
    # Flight Helmet (set 89, two slots, hides hr). The beanie 53 stops at the temples and closes
    # with a 0.6-proud cuff ledge at z 20.2. This has no ledge and no cuff — one smooth shell,
    # wider than it is tall, carried down over the ears and the nape.
    #
    # The face is kept clear by pushing the shell BACK, not by cutting it. Its y radius is 9.35
    # about a centre at -3.2, so the front of the ellipsoid is at 6.15 and the skull's own front
    # is 9.46: the whole forward half is buried, and what draws at the front is the line where
    # the shell climbs out of the skull near the crown. That is the crested helm 70's mechanism
    # and the only one available — there is no cut prim, so a brow edge is a burial depth.
    #
    # The offset is -3.5 and not -3.2. At -3.2 the shell climbed out of the skull low enough to
    # put its front edge on row 30; at -3.5 it emerges at row 29, against the row 28 the intent
    # asks for and the row 30 the ledger holds all head geometry above. The last row is not worth
    # a third render: measured against all eight eyed heads over all 64 dir-frames this paints
    # over ZERO face pixels, and the tightest SAME-COLUMN margin anywhere on the sheet is 2 rows
    # — hd17 walk0 d2, column 30, helmet bottom at row 31 against the brow at 33. The walk
    # down-step is already inside that number, which is why it is measured per column and per
    # frame rather than off the stand silhouette.
    #
    # Measured shape at stand: rows 16-29 at dir 3 and 19-38 at dirs 0 and 7, so the crown is 13
    # rows above the brow line and the nape hangs 9 rows below it. Against the nine shipped ha
    # sets the tightest pair is the crested helm 70 at 0.7042 — the other helmet, and the one the
    # ledger did not name — and the beanie 53 the row DOES name is at 0.3984. 70 keeps its
    # distance on the crest fin, which stands 6 px over its crown where this shell simply stops.
    #
    # Slot 1 is the nub, and it is at the back because the temple is inside the corridor. The
    # shell's own nape already reaches y -11.4 at z 19, so a nub at the intent's -8.6 would sit
    # 2.8 px INSIDE it and never draw; it is at -11.8 to stand proud of the shell it is bolted
    # to, and it draws 980 px over the 64 dir-frames.
    "ha89": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -3.5, 16.2), "r": 11.0,
             "squash": (1.06, 0.85, 0.74)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (0.0, -11.8, 19.2), "r": 2.8,
             "squash": (1.0, 0.9, 1.0)},
        ],
    },
    # ---- costume pack 5: fablewood (#455) ----
    # Wizard. Where starliner bolted hardware to the figure, this one drapes it: the only sleeve
    # in the wardrobe that changes width, the longest hem, and the tallest thing on a head.
    #
    # Sage Trousers (set 90, one slot). Every other lg here is a taper or a step. This one is a
    # column: the same width at the ankle as at the hip, so its profile is two parallel lines.
    # The flares 46 are slim at the thigh (4.5) and bell to 7.4 on the knee bone only, so the two
    # share no part of their outline — this is 1.9 wider than 46 at the thigh and 0.6 narrower at
    # the hem.
    #
    # It takes four cones because a leg is two bones. A single 37 px cone on leg_l would not
    # follow the knee, and the breeches 64 measured what that costs — a cuff authored on the thigh
    # bone tears away from its own hem at the 28-degree bend in walk1 and walk3. So the thigh
    # cone runs the leg bone's full 19 px and the shin cone hangs off the knee, with "z0": 1.0
    # lapping it 1 px into the thigh's flat end so the layer stays one island through that bend.
    #
    # The hem stops at knee-local -16.5 of the shin's 18, which is the flares 46's reason
    # unchanged: a leg that reaches the floor swallows the shoe layer whole. Measured against the
    # bounds gate on the deepest forward stride, walk0 d3, the hem ring's near edge lands on row
    # 108 — the ring is tilted 17 degrees with the shin, which is what puts it 3 rows below where
    # the ring's own centre draws.
    #
    # The two legs interpenetrate at rest: 6.4 either side of bones 8 px apart is 4.8 px of
    # overlap, so standing they read as one column and the walk frames are what split them. That
    # is the garment — a robe-maker's trouser, not a pair of tubes.
    "lg90": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.2, -6.6, -2.4),
             "c1": (8.2, 6.6, 2.6)},
            {"t": "cone", "bone": "leg_l",  "slot": 0, "len": 19.0, "r0": 6.4, "r1": 6.6},
            {"t": "cone", "bone": "leg_r",  "slot": 0, "len": 19.0, "r0": 6.4, "r1": 6.6},
            {"t": "cone", "bone": "knee_l", "slot": 0, "z0": 1.0, "len": 17.5,
             "r0": 6.6, "r1": 6.8},
            {"t": "cone", "bone": "knee_r", "slot": 0, "z0": 1.0, "len": 17.5,
             "r0": 6.6, "r1": 6.8},
        ],
    },
    # Rune Tunic (set 91, two slots). The bell sleeve is the whole set and nothing else in the
    # wardrobe has one: every other ch arm is a limb, which is a capsule of one radius. A cone on
    # the arm bone is the only prim that changes width along a limb, so the sleeve is 3.8 at the
    # shoulder against the cloud cardigan 80's constant 5.0 and 6.6 at the wrist against the same
    # 5.0 — 1.2 narrower at one end and 1.6 wider at the other, so the arm reads as a triangle
    # where 80's is a rectangle.
    #
    # The cuff is a squashed ball at the sleeve's own end rather than a wider ring: at z -20.6 the
    # cone has reached 6.55, so 6.9 stands 0.35 proud and closes the bell instead of widening it.
    # A ring authored past the cone's radius makes the sleeve a trumpet, which is a different
    # garment and a wider silhouette than the row asks for.
    #
    # The body is 8.2 straight — no pinch anywhere, which is what separates it from the tracksuit
    # 44's 8.6-to-7.8 — and the rolled hem band at z -6.0 puts 0.6 px of step past it and hangs
    # 3.4 px below the hip box every other lg draws, so the tunic covers a waistband instead of
    # meeting one. Slot 1 is that band and the two cuffs: three places the second ramp lands on an
    # edge a player can see, rather than piping that quantises to single pixels.
    "ch91": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.2, -6.8, -2.6),
             "c1": (8.2, 6.8, 20.4)},
            {"t": "cone", "bone": "arm_l", "slot": 0, "len": 21.0, "r0": 3.8, "r1": 6.6},
            {"t": "cone", "bone": "arm_r", "slot": 0, "len": 21.0, "r0": 3.8, "r1": 6.6},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-8.8, -7.4, -6.0),
             "c1": (8.8, 7.4, -2.0)},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -20.6), "r": 6.9,
             "squash": (1.0, 1.0, 0.30)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -20.6), "r": 6.9,
             "squash": (1.0, 1.0, 0.30)},
        ],
    },
    # Potion Belt (set 92, two slots). The sword belt 67 hangs one 14 px spur off one side. This
    # one hangs four short ones evenly, so its lower edge is scalloped in every direction where
    # 67's is a single blade on the left.
    #
    # A vial is 3.4 px across and not the intent's 3.0, which is the chain 62's floor rather than a
    # choice: anything 2 px or under is pure outline with no interior shade left between its edges,
    # and 3.0 quantises to that at half the dir-frames. Stretched 1.35 in z it is 3.4 by 4.6, which
    # is a vial rather than a bead, and its top laps 0.8 px into the band so the layer is one
    # island.
    #
    # The band is 3.6 px tall. The belt 15 is 2.8 and the sword belt 67 is 4.0, and 67 measured why
    # that matters — at 3.4 it quantised to the belt's own rows and came out pixel-identical on a
    # back frame. 3.6 sits a row off both.
    #
    # The outer pair is at x 8.4, past the band's own 8.1 and past bd1's thigh at 8.2, so those two
    # break the outline sideways and survive the holdout below the waist. The inner pair at 2.8 is
    # inside the thigh's x range and lives on y instead: at 6.2 the vial's back is 4.76, which
    # clears the thigh limb's 4.2 outright.
    "wa92": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.1, -6.6, 0.0),
             "c1": (8.1, 6.6, 3.6)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (-8.4, 6.2, -1.5), "r": 1.7,
             "squash": (1.0, 0.85, 1.35)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (-2.8, 6.2, -1.5), "r": 1.7,
             "squash": (1.0, 0.85, 1.35)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (2.8, 6.2, -1.5), "r": 1.7,
             "squash": (1.0, 0.85, 1.35)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (8.4, 6.2, -1.5), "r": 1.7,
             "squash": (1.0, 0.85, 1.35)},
        ],
    },
    # Wizard Robe (set 93, two slots, hides ch). The longest garment in the wardrobe. The overcoat
    # 11's flare is 8.6 to 10.4 over 14 px and closes smoothly over the shoulders; this one falls
    # 22 px to a 13.6 hem and breaks the shoulder line backward with a hood.
    #
    # Sit is what caps the length. The cone hangs off the hip, the hip IS the sit anchor at row 74,
    # and a cone of radius r reaches r/2 rows past its own hem: 74 + 22 + 6.8 = row 102, nine clear
    # of the 111 the bounds gate fails at.
    #
    # The 13.6 hem is structural the way the long skirt 48's 14.2 is. A walk frame swings the shin
    # forward, and at this hem's height bd1's own shin reaches 12.0 px off the hip axis — inside
    # 13.6, so no bare leg comes through the front of the robe. A worn lg does come through, by
    # about a px on the stride frames, and that is a leg showing under a robe rather than a defect.
    #
    # The hood is one ball behind the neck, the hoodie 38's construction with the mass moved down:
    # at spine z 19 and y -6.4 it stands 8.2 px behind the torso's own back at the shoulder line
    # and the skull holds out its front half, so what draws is the shell climbing out from behind
    # the head. `fa` and `ha` both draw after `cc`, so nothing here can eat a beard or a hat — the
    # sage beard 95 composited over this loses 0 pixels.
    "cc93": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.0, -6.6, 0.0),
             "c1": (8.0, 6.6, 20.4)},
            {"t": "cone", "bone": "hip",   "slot": 0, "len": 22.0, "r0": 8.2, "r1": 13.6},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 21.0, "r": 4.4},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 21.0, "r": 4.4},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (0.0, -6.4, 19.0), "r": 7.8,
             "squash": (1.06, 1.0, 0.92)},
        ],
    },
    # Star Stole (set 94, two slots). The scarf 60's whole read is the drape at the neck — two
    # offset lumps clearing the torso all round, with one off-centre tail. This one has no mass at
    # the neck at all: two symmetric panels off the shoulders and nothing between them, so the
    # throat is bare in every direction.
    #
    # Each panel is 1.4 thick with its outer face 1.6 proud of bd1's 6.0 torso, which is the
    # surcoat 68 and apron 81's numbers unchanged — thinner and the panel loses its edge at dirs 1
    # and 5, thicker and its near corner swings wide as the figure turns.
    #
    # Two panels are two islands on their own, and that is fine: the review pass measures a layer
    # composed WITH the body, and the torso between them closes the gap. It is the same reason the
    # chain 62 is allowed to be a run of separate links.
    #
    # Slot 1 is the ends, 0.4 wider and 0.2 more proud than the panel above, so the second ramp
    # lands on a step rather than on a flat face. They reach spine z 2.0 — 3 px below the scarf
    # 60's single tail, which is the row the ledger separates the two on.
    "ca94": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (2.4, 6.2, 5.0),
             "c1": (5.8, 7.6, 21.0)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-5.8, 6.2, 5.0),
             "c1": (-2.4, 7.6, 21.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (2.0, 6.2, 2.0),
             "c1": (6.2, 7.8, 5.4)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-6.2, 6.2, 2.0),
             "c1": (-2.0, 7.8, 5.4)},
        ],
    },
    # Set 95 is the Sage Beard and has no mesh: it is a stamp, authored as pixels on the `beard`
    # axis in tools/artgen/facedata.ts, and figurepass builds it off hd2's own render.
    #
    # Pointed Hat (set 96, two slots, hides hr). The top hat 54 is a straight cylinder with a flat
    # lid and a 26 px brim. This narrows 6 px on the way up to a point and its brim is 4 px wider.
    #
    # The cone is authored top-down, which is what the prim is: "z0" is the r0 end. So r0 2.2 sits
    # at head z 37.5 and r1 8.2 at 20.0, and the tip ball caps the 2.2 opening rather than
    # widening it. A ball of radius r reaches 1.118r rows above its own centre under this camera —
    # not r/2, which is the flat-disc number — so the tip crowns on row 3.6 against the top hat's
    # 4.85 and the bounds gate's 0.
    #
    # The brim is an ellipsoid, and that is the whole reason its forward edge clears the brow. A
    # 30 px disc 3 px thick on plane z 21.6 puts its lowest ink at 44 - 21.6 + sqrt(7.125^2 + 1.5^2)
    # = row 29.4; a cylinder of the same size would put its BOTTOM face out at the same y and land
    # on row 31, in the eyes. The top hat 54's brim is the same prim one size down.
    #
    # The cone's base ring at z 20 is 8.2 against the skull's own 5.81 at that height, so the hat
    # ends in a hard rim and the bare skull carries on below it — the hides rule takes the hair, so
    # there is nothing else to fill that gap and nothing that needs to.
    "ha96": {
        "prims": [
            {"t": "cone", "bone": "head", "slot": 0, "z0": 37.5, "len": 17.5,
             "r0": 2.2, "r1": 8.2},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 0.0, 37.5), "r": 2.6},
            {"t": "ball", "bone": "head", "slot": 1, "c": (0.0, -0.6, 21.6), "r": 15.0,
             "squash": (1.0, 0.95, 0.10)},
        ],
    },
    # ---- costume pack 6: tidal (#456) ----
    # Mariner. Fablewood draped the figure; this pack rigs it. Every row puts its silhouette event
    # on a row or a side the wardrobe has not used one before — a hem at mid-shin, a shaft that
    # widens on the way up, a collar behind the shoulders, a ring standing off the chest, and a
    # brim at the nape instead of the brow.
    #
    # Rolled Deck Trousers (set 97, two slots). The lg shelf splits on hem row before anything
    # else and this one owns MID-SHIN: the shin tube stops at knee-local -9.0, nine px above the
    # sole, and a fat roll closes it there. Nothing else in the wardrobe ends on that row — the
    # shorts 45 cut above the knee, the breeches 64 two px below it, the culotte-less rest reach
    # the calf or the ankle. The cargo 47 the row names runs the shin out to -15.5 and tapers 5.5
    # to 4.6; the roll is 6.2 against the 4.94 that cone carries at the same height.
    #
    # The roll hangs off knee_l/knee_r for the breeches 64's measured reason: a cuff authored on
    # the thigh bone stays put while the knee bends 28 degrees in walk1 and walk3 and tears away
    # from its own hem.
    #
    # The shin tube keeps "caps": "top". A bottom cap is a sphere reaching 4.6 px past the cut,
    # which would hang below the roll's own underside and turn the hem into a bulb — the roll is
    # the hem, and it laps 2.6 px over the tube's flat end so the layer stays one island.
    "lg97": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.1, -6.5, -2.4),
             "c1": (8.1, 6.5, 2.6)},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 4.6},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 4.6},
            {"t": "limb", "bone": "knee_l", "slot": 0, "len": 9.0, "r": 4.6, "caps": "top"},
            {"t": "limb", "bone": "knee_r", "slot": 0, "len": 9.0, "r": 4.6, "caps": "top"},
            {"t": "ball", "bone": "knee_l", "slot": 1, "c": (0.0, 0.0, -9.0), "r": 6.2,
             "squash": (1.0, 1.0, 0.42)},
            {"t": "ball", "bone": "knee_r", "slot": 1, "c": (0.0, 0.0, -9.0), "r": 6.2,
             "squash": (1.0, 1.0, 0.42)},
        ],
    },
    # Sea Boots (set 98, one slot). The boots 50's shaft is a straight box stopping at mid-shin at
    # -9.4 with a cuff band closing it. This one runs 5.4 px higher, to just under the knee at
    # -4.0, and it is a CONE, so its sides splay 1.8 px outward on the way up — the leg reads as a
    # funnel where 50 reads as a tube.
    #
    # The ledger row is written ankle-up ("r0 4.6 at the ankle to r1 6.4 at the top"), which is
    # VISUAL order, not prim order: a cone's r0 always sits at z0 and the solid runs DOWN from
    # there. So the solid the row describes is authored z0 -4.0 with r0 6.4 at that top ring and
    # r1 4.6 fourteen px below it at the ankle. Read literally the row would have built a funnel
    # standing on its point.
    #
    # A ROUND ankle is what lets the shaft reach the ground plane at all. A frame's deepest row is
    # (|x| + |y|) / 2.828 below the prim's own z, and for a circle of radius r the worst (|x|+|y|)
    # is r * sqrt(2) — 6.5 px at the 4.6 ankle against the 12.3 a box of the same span carries
    # into its corner. So the cone bottoms out on the sole at -18 and still lands two rows
    # shallower than the boot 50's own footprint does.
    "sh98": {
        "prims": [
            {"t": "cone", "bone": "knee_l", "slot": 0, "z0": -4.0, "len": 14.0,
             "r0": 6.4, "r1": 4.6},
            {"t": "cone", "bone": "knee_r", "slot": 0, "z0": -4.0, "len": 14.0,
             "r0": 6.4, "r1": 4.6},
            {"t": "box",  "bone": "knee_l", "slot": 0, "c0": (-4.5, -4.2, -float(SHIN_LEN)),
             "c1": (4.5, 7.6, -SHIN_LEN + 4.4)},
            {"t": "box",  "bone": "knee_r", "slot": 0, "c0": (-4.5, -4.2, -float(SHIN_LEN)),
             "c1": (4.5, 7.6, -SHIN_LEN + 4.4)},
        ],
    },
    # Sailor Middy (set 99, two slots). The first garment in the wardrobe whose silhouette event
    # is entirely BEHIND the figure — the trained gown 116's train is the other one planned. Dirs
    # 2/3/4 read as a plain top on purpose; dirs 6/7/0 carry a plate standing off the shoulders.
    #
    # The ledger's flap is x +/-7.0, y -6.2..-7.6, and 1.4 px of it flush with the body's own back
    # face is not a silhouette event: measured against the layer's own alpha it adds 0.7 rows and
    # zero columns, which is a shading difference. The polo 41 the row names is separated by area,
    # but the pack's bar is IoU, and IoU sees outline.
    #
    # `ch` is the most crowded layer in the wardrobe at 16 shipped sets, and it took three builds to
    # find a body no sibling already owns. The measurements, because they are the reason for every
    # number below:
    #
    #   body 7.9 x 6.2, hem z 1.0, sleeve 12.0    -> 0.8662 vs the TRIM SHIRT 6
    #   body 8.2 x 6.3, hem z -1.6, sleeve 15.0   -> 0.8771 vs the VEST + SHIRT 40, and 6 at 0.7517
    #   body 8.2 x 6.3, hem z -1.6, sleeve 11.0   -> the build below
    #
    # Neither of the first two named the polo 41 the ledger row does. The hem row is what moved 6:
    # dropping to -1.6 runs a band of alpha right round the figure at every direction where 6, 5
    # and 41 all stop 3 px higher. The sleeve is what moved 40, which reaches -20.4 with its cuff
    # ball against this one's -11.0 — nine px on each arm, and an arm is the one part of a `ch`
    # that lies outside the torso in every direction.
    #
    # The collar carries the rest, and it is 19.6 x 4.2 x 17.2 rather than the ledger's
    # 14 x 1.4 x 8.0. A flap flush with the body's back face is not a silhouette event: measured
    # against the layer's own alpha it adds 0.7 rows and zero columns, which is a shading
    # difference. At 4.2 deep and 2.1 px outboard of the body it draws above the shoulder line at
    # every direction and past the body's edge at every direction, which is what IoU can see.
    #
    # The collar's top is the number held still through all three builds. At y -10.4 and z 20.2 its
    # highest row is 40, and rows 31 to 39 are the face. It may reach that row at all only because
    # dirs 0, 6 and 7 draw no face and dirs 2, 3 and 4 hold it out behind the skull.
    #
    # The front V is a staircase because a box cannot be rotated — the sash 63's idiom, four steps
    # instead of six, each 3.2 wide because anything under 3 px is pure outline with no interior
    # shade left. Slot 1 is the collar and the V together: the two places a middy's contrast lands.
    "ch99": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.2, -6.3, -1.6),
             "c1": (8.2, 6.3, 20.2)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 11.0, "r": 3.8},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 11.0, "r": 3.8},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-9.8, -10.4, 3.0),
             "c1": (9.8, -6.3, 20.2)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-5.6, 6.3, 16.2),
             "c1": (-2.4, 7.6, 20.0)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (2.4, 6.3, 16.2),
             "c1": (5.6, 7.6, 20.0)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-3.2, 6.3, 12.6),
             "c1": (0.4, 7.6, 16.8)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-0.4, 6.3, 12.6),
             "c1": (3.2, 7.6, 16.8)},
        ],
    },
    # Rope Belt (set 100, one slot). The belt 15 is one flat 2.8 px box with a straight top and
    # bottom edge. This is the chain 62's idiom moved to the hip: overlapping balls, so both edges
    # are scalloped in all eight directions, plus a knot and two tails 15 has nothing like.
    #
    # NINE balls, not the row's eight. The waist is a box, not a circle — a rope has to clear
    # x +/-7.5 and y +/-6.0 — and its perimeter is 47 px, so eight 3.6 px balls sit 5 px apart and
    # read as beads. Each ball is stretched 1.5 along its own run instead (x on the front and back
    # faces, y on the sides), which keeps the rope 3.6 px THICK, the number the row names, and
    # closes every gap on screen; the ninth fills the back centre, because the front centre gets
    # the knot and the back would otherwise open a 5 px hole at dirs 6/7/0.
    #
    # The side pair sits at y +/-4.4 rather than on the waist's own centre line. bd1's arm hangs
    # at x 9.5 with r 3.2, so a ball at x 8.3 and y 0 is inside the arm's own y band and loses its
    # front half to the holdout; pushed to 4.4 its near face is at 7.1 against the arm's 3.2 and
    # it wins those pixels outright, which is the potion belt 92's measurement unchanged.
    #
    # The tails are 3.0 wide because the chain 62's floor applies to them too, and 1.4 thick,
    # which is the star stole 94's panel — thinner loses its edge at dirs 1 and 5.
    "wa100": {
        "prims": [
            {"t": "ball", "bone": "spine", "slot": 0, "c": (5.2, 6.6, 1.2), "r": 1.8,
             "squash": (1.5, 0.9, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-5.2, 6.6, 1.2), "r": 1.8,
             "squash": (1.5, 0.9, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (8.3, 4.4, 1.2), "r": 1.8,
             "squash": (0.9, 1.5, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-8.3, 4.4, 1.2), "r": 1.8,
             "squash": (0.9, 1.5, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (8.3, -4.4, 1.2), "r": 1.8,
             "squash": (0.9, 1.5, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-8.3, -4.4, 1.2), "r": 1.8,
             "squash": (0.9, 1.5, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (5.2, -6.6, 1.2), "r": 1.8,
             "squash": (1.5, 0.9, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (-5.2, -6.6, 1.2), "r": 1.8,
             "squash": (1.5, 0.9, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, -6.8, 1.2), "r": 1.8,
             "squash": (1.5, 0.9, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 6.9, 1.2), "r": 2.6,
             "squash": (1.0, 0.78, 0.85)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-3.4, 6.2, -7.0),
             "c1": (-0.4, 7.6, 1.2)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (0.4, 6.2, -7.0),
             "c1": (3.4, 7.6, 1.2)},
        ],
    },
    # Life Ring (set 101, two slots). The largest ca in the wardrobe and the only open one. The
    # lace ruff 76 is a closed horizontal plate at the chin; this is vertical, twice across, and
    # it has a hole in it.
    #
    # Four boxes round that hole, which is the round specs 59's construction and not a style
    # choice — there is no torus prim, and ellipsoid bars leave 0.5 px diagonal gaps where they
    # meet. The corners are chamfered the way 59's are: the top and bottom bars stop at x +/-7.6
    # inside the sides' +/-10.0, and the side bars stop at z 6.6 and 19.4 inside the top and
    # bottom's 4.0 and 22.0, so the ring reads as an octagon rather than a picture frame. Each
    # pair still laps 1.0 x 0.8 px at every corner, so the layer is one island.
    #
    # 20 px across and 18 tall: the row asks for both a 20 px ring and a z 4..22 span, and the
    # span is the number that governs what the ring collides with, so the width is what gave. The
    # top bar tops out at spine z 22, one px over the chin plane, and draws at row 46 — eight
    # clear of the mouth at 39, so nothing here is near a face.
    #
    # Sit was the frame to check. The ring hangs off the spine and the spine does not rotate, so
    # it draws at rows 56-74 against the hip's own anchor at 74. What moves is the thigh: at sit
    # it runs forward to y 19, far nearer the camera than the ring's 8.2, so bd1 takes the bottom
    # bar's lower edge back. That is a life ring resting on a lap, and the holdout is what draws
    # it — the gate measures the layer composed WITH the body, and the body closes it.
    #
    # Worn with the rope belt 100 the two clear by 0.6 px: the knot tops out at spine z 3.4 and
    # this starts at 4.0. `ca` draws after `wa`, so even a touch would resolve in the ring's
    # favour, but a costume shelf that sells both should not need the layer order to look right.
    "ca101": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-7.6, 6.2, 18.6),
             "c1": (7.6, 8.2, 22.0)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-7.6, 6.2, 4.0),
             "c1": (7.6, 8.2, 7.4)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-10.0, 6.2, 6.6),
             "c1": (-6.6, 8.2, 19.4)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (6.6, 6.2, 6.6),
             "c1": (10.0, 8.2, 19.4)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-2.2, 6.4, 18.2),
             "c1": (2.2, 8.6, 22.4)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-2.2, 6.4, 3.6),
             "c1": (2.2, 8.6, 7.8)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-10.4, 6.4, 10.9),
             "c1": (-6.2, 8.6, 15.1)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (6.2, 6.4, 10.9),
             "c1": (10.4, 8.6, 15.1)},
        ],
    },
    # Sou'wester (set 102, two slots, hides hr). The visor 56's construction mirrored. 56 is a
    # brim disc pushed FORWARD to y 6.6 with no crown, so its crescent lands in front at row 30.
    # This one pushes the same disc BACK to y -6.4, where the skull is nearer to the camera than
    # the disc is at every front direction and the holdout takes its whole front half. What
    # survives is the crescent at the nape, and nothing reaches the brow at all.
    #
    # The numbers that make that true: at head z 18 the skull carries y 7.33 of depth and the
    # brim's front edge is at 3.92, so the brim is 3.4 px INSIDE the skull there and cut. Behind,
    # the brim reaches y -16.72 against the crown's own -13.16, so 3.6 px of shelf stands past the
    # crown at dirs 6/7/0. A point that far behind the head projects UPWARD under this camera —
    # 44 - 16.72/2 - 18 = row 17.6 — so the crescent draws just under the crown's top rather than
    # below the jaw, which is what a back brim looks like from 30 degrees up.
    #
    # The crown is pushed back to y -3.2 for the flight helmet 89's reason. A dome centred on the
    # head crosses outside the skull at z 18, where its own lowest lit row is 29.8 — one row off
    # the brow at 31, and the ledger's rule is never to author a one-row stand margin because the
    # walk down-steps close half of it. At -3.2 the crossover moves to z 19 and the lowest lit row
    # is 28.3, which is the margin 89 ships with, measured the same way.
    "ha102": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -3.2, 17.6), "r": 10.6,
             "squash": (1.02, 0.94, 0.84)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (0.0, -6.4, 18.0), "r": 12.0,
             "squash": (1.05, 0.86, 0.13)},
        ],
    },
    # ---- costume pack 7: verdant (#457) ----
    # Gardener. Working clothes, cut and cropped. Every row here ends its garment on a row the
    # wardrobe has left empty, and the cut is the separator rather than anything added on top.
    #
    # Gathered Culottes (set 103, one slot). TWO cones, one per LEG bone, where every skirt in the
    # wardrobe is one cone on the hip. That is the whole separator against the pleated skirt 8,
    # and it exists only in the walk: a hip cone cannot split, and at walk0 and walk2 the legs
    # swing 22 degrees apart and these two go with them.
    #
    # r0 5.8 at the hip to r1 7.4 at the hem, run 21 px down a 19 px thigh, so the flat cut lands
    # 2 px below the knee joint and bd1's shin is bare from there to the shoe. The flare is 1.6
    # clear of the thigh at the top and 3.7 clear of the shin at the hem, so the body never wins
    # the depth test inside it.
    #
    # The hem is 7.4 against the ledger's 8.6, and the split is what forced it. At walk0 a leg
    # swings 22 degrees, so a hem 21 px down the bone moves 21*sin22 = 7.87 px fore or aft; with
    # the bones 8 px apart that puts the two hem discs' screen centres 16.79 px apart at dirs 0
    # and 4. A disc of radius r spans +/-0.964r across the screen there, so 8.6 leaves the pair
    # overlapping 0.2 px — they meet in one outline, and at 2x the frame reads as one wide skirt
    # with a crease in it rather than as two legs. 7.4 opens 2.5 px of daylight, and the notch
    # between the legs measures 25 rows against 20 at the intent's number.
    #
    # The hem hangs off leg_l/leg_r rather than knee_l/knee_r — the breeches 64's cuff ring does
    # the opposite for the opposite reason. A cuff BUCKLED below the knee follows the shin; a
    # culotte hem is loose cloth 2 px past the joint, and hung on the shin it would swing away
    # from the thigh cone above it and tear the layer into two islands at walk1 and walk3.
    "lg103": {
        "prims": [
            {"t": "box",  "bone": "hip",   "slot": 0, "c0": (-8.0, -6.4, -2.0),
             "c1": (8.0, 6.4, 2.6)},
            {"t": "cone", "bone": "leg_l", "slot": 0, "len": 21.0, "r0": 5.8, "r1": 7.4},
            {"t": "cone", "bone": "leg_r", "slot": 0, "len": 21.0, "r0": 5.8, "r1": 7.4},
        ],
    },
    # Garden Clogs (set 104, one slot). The sandals 52 are a sole plate with two bands over an
    # open instep and a heel line closing the back. This is that shoe reversed: one solid block
    # over the toes and NOTHING behind them, so bd1's heel is bare skin from the sole up.
    #
    # Two boxes per foot, and the split is where the shoe stops being a sole. The sole runs the
    # whole foot at 2.6 px tall — a wooden clog is thick, and 52's is 1.6 — and the upper sits on
    # it from y 0.6 forward, topping out at z -12.8. Over the toes that is 3.6 px more shoe than
    # 52 carries, which has nothing there but its sole at -16.4; 52's tallest prim is its heel
    # counter at -12.2, and it stands exactly where this shoe is open.
    #
    # The open back is 4.0 px of the foot's 9.2 px length, which is what makes the heel read as
    # bare at dirs 6/7/0. Closing it would cost the separator outright: 52 and this shoe would
    # then differ only in how tall the sole is.
    #
    # The upper stands 0.5 outside the shin capsule's r 3.7 and 0.5 outside the foot box's x 3.7,
    # so the body never wins the depth test inside it, and the shin still comes up THROUGH the
    # upper's top face at y 0.6-3.7, which is what an ankle rising out of a clog looks like.
    "sh104": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.4, -3.4, -float(SHIN_LEN)),
             "c1": (4.4, 8.0, -SHIN_LEN + 2.6)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.4, -3.4, -float(SHIN_LEN)),
             "c1": (4.4, 8.0, -SHIN_LEN + 2.6)},
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.2, 0.6, -SHIN_LEN + 2.6),
             "c1": (4.2, 7.6, -12.8)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.2, 0.6, -SHIN_LEN + 2.6),
             "c1": (4.2, 7.6, -12.8)},
        ],
    },
    # Rolled-Sleeve Shirt (set 105, two slots). `ch` is the most crowded layer in the wardrobe at
    # 17 shipped sets, and every plain body box is taken — 7.6 through 9.0 in x, 6.2 through 7.2 in
    # y, in steps of a tenth. So the separator is a FEATURE, twice over: a sleeve that stops at the
    # elbow inside a roll, and a hem that is 5 px lower at the front than at the back.
    #
    # Three builds, measured against every shipped `ch`:
    #
    #   sleeve 11.0 r 4.0, roll 5.6, hem front -1.0 / back 3.0  -> 0.8356 vs the TRIM SHIRT 6
    #   sleeve 11.0 r 4.2, roll 6.4, hem front -2.0 / back 4.0  -> 0.7972 vs 6
    #   sleeve 11.0 r 4.2, roll 6.4, hem front -3.0 / back 2.0  -> the build below, 0.8104 vs 6
    #
    # The first build is the ledger's numbers and it is 0.018 off the 0.854 bar. Its body is the
    # tee 5's and the trim shirt 6's within a tenth, and neither the ledger's 5.6 roll nor a 4 px
    # hem step is enough to pull away from a body that close. The arm is what moved it: a sleeve
    # is the one part of a `ch` that lies outside the torso in every direction (the middy 99's
    # finding), so widening the tube to 4.2 and the roll to 6.4 — 2.2 proud, where 6's own cuff
    # ball is 0.2 proud of its sleeve and reads flush — took 0.0384 off in one step.
    #
    # The third build exists because the second one's back hem was wrong on the figure rather than
    # in the numbers. At z 4.0 it sits ABOVE every shipped `lg` hip box, which top out at 2.6 to
    # 3.4, so a 1.4 px band of bd1's back showed between the shirt and the trousers at dirs 6/7/0
    # and read as the shirt riding up. Dropping the pair to -3.0 and 2.0 tucks the back hem under
    # all of them and keeps the step at 5 px, at a cost of 0.0132 in IoU.
    #
    # 11.0 is the elbow: ARM_LEN is 22 and the bone runs from the shoulder. The tee 5 stops at 8.0
    # with no cuff, the trim shirt 6 at 13.0, and the vest + shirt 40 the ledger names at 16.0 —
    # which measured 0.7849, so the named sibling was not the tightest one here either.
    #
    # Face clearance is the trim shirt 6's, unchanged: 0 face pixels painted over, and 1 clear row
    # from BELOW at wave0 d2, where the raised arm's roll comes up beside the jaw.
    "ch105": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.0, -0.2, -3.0),
             "c1": (8.0, 6.4, 20.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.0, -6.4, 2.0),
             "c1": (8.0, 0.2, 20.0)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 11.0, "r": 4.2},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 11.0, "r": 4.2},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -11.0), "r": 6.4,
             "squash": (1.0, 1.0, 0.52)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -11.0), "r": 6.4,
             "squash": (1.0, 1.0, 0.52)},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (2.4, 6.4, 8.6),
             "c1": (6.0, 7.2, 13.2)},
        ],
    },
    # Tool Roll (set 106, two slots). The potion belt 92 hangs four round vials BELOW its band.
    # This one carries one continuous plate across the front of the hip and puts its only lumps on
    # TOP of the band, so the two have opposite edges: 92's lower edge is scalloped and its upper
    # edge is straight, and this one is the reverse.
    #
    # The band is 92's, unchanged — 8.1 x 6.6, z 0.0 to 3.6. Copying it is the point. If the band
    # were the separator the shelf would be selling belt heights, and it measured 0.6185 against
    # 92 with the band identical, which is the mass doing the work.
    #
    # The plate is x +/-7.0 and 1.6 thick at y 6.0 to 7.6 — 1.6 proud of the torso, 1.0 proud of
    # the band. The nubs are 3.0 wide because the chain 62's 3 px floor applies to anything whose
    # read depends on it, and 1.4 deep, which is the star stole 94's panel.
    #
    # This is the pair the ledger's diagonal line names: a `wa` band out-reaches a same-height `ch`
    # detail on the diagonal, and wa74 left ch73's peplum ~1 px per frame that way. The rolled
    # shirt 105's uneven hem survives here, and the reason is that this belt's mass is a FRONT
    # plate rather than a band: it never reaches y < 6.0, so it has no corner to swing outboard,
    # and the shirttail's 5 px step is a profile event at the sides where the plate is not.
    # Measured with 105 worn under it — 3103 of 3614 px still visible at stand, and the shirt's
    # lowest drawn row unchanged at all eight directions (68/71/72/70/72/71/68/65). Over the
    # shirttail alone, rows 66 and below across all 64 dir-frames, 2902 of 5267 px survive.
    "wa106": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-8.1, -6.6, 0.0),
             "c1": (8.1, 6.6, 3.6)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-7.0, 6.0, -6.0),
             "c1": (7.0, 7.6, 0.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-5.9, 6.4, 3.6),
             "c1": (-2.9, 7.8, 7.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-1.5, 6.4, 3.6),
             "c1": (1.5, 7.8, 7.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (2.9, 6.4, 3.6),
             "c1": (5.9, 7.8, 7.0)},
        ],
    },
    # Seed Satchel (set 107, two slots). The oxygen line 87 is a run of round 3.4 links crossing
    # the chest with nothing at its end. This is a FLAT band — 1.4 thick, the star stole 94's
    # panel, because thinner loses its edge at dirs 1 and 5 — and it terminates in a box three
    # times its width.
    #
    # The strap is a staircase because a box cannot be rotated: the sash 63's idiom, six steps of
    # 3.0 x 4.8 lapping 0.8 in x and 0.4 in z, so the run is one island at every direction.
    #
    # The bag is FORWARD of the arm, not behind it. The row puts its outer edge at x 9.0 and
    # bd1's arm owns x 6.3 to 12.7 — a capsule r 3.2 on a bone at x 9.5 — so 2.7 px of the bag's
    # width sits inside the arm's own columns. On the body's centre plane the holdout would take
    # that strip at every direction. At y 3.8 the bag's nearest face is 0.6 clear of the arm's
    # 3.2, which is the sword belt 67's number for its scabbard spur, so the bag wins those pixels
    # outright at dirs 2/3/4 and the body hides it at 6/7/0 — 26, 2 and 1 px survive there against
    # the star stole 94's own 4, 4 and 0, so a front-worn `ca` vanishing at the back is the
    # shipped shape rather than a hole.
    #
    # The bag also hangs BELOW the hip at z -13.0 to -6.0 rather than on it. That is what keeps it
    # off the tool roll 106's plate, which owns z -6.0 to 0.0 across the same front face: `ca`
    # draws after `wa`, so a bag on the hip line would have eaten the belt this shelf sells beside
    # it. The strap lands outboard for the same reason — its bottom steps run x 2.6 to 8.0, past
    # the belt's three nubs at x -5.9 to 5.9, so it crosses only 1.3 px of the middle one.
    "ca107": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-7.0, 6.2, 15.6),
             "c1": (-4.0, 7.6, 20.4)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-4.6, 6.2, 11.2),
             "c1": (-1.6, 7.6, 16.0)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-2.2, 6.2, 6.8),
             "c1": (0.8, 7.6, 11.6)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (0.2, 6.2, 2.4),
             "c1": (3.2, 7.6, 7.2)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (2.6, 6.2, -2.0),
             "c1": (5.6, 7.6, 2.8)},
            {"t": "box", "bone": "spine", "slot": 0, "c0": (5.0, 6.2, -6.4),
             "c1": (8.0, 7.6, -1.6)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (0.0, 3.8, -13.0),
             "c1": (9.0, 7.8, -6.0)},
        ],
    },
    # Woven Sunshade (set 108, two slots, hides hr). The mourning hat 77 and this one are the same
    # prim inverted, which is the whole separator. 77's brim is z0 24.4, r0 8.0 running down to
    # r1 13.0 at z 21.2 — widest ring at the BOTTOM, so it droops and its side outline is a wing
    # pointing down. This one is z0 23.0, r0 17.0 down to r1 8.0 at z 20.0 — widest at the TOP, so
    # it rises off the crown and its edge is 4.0 px further out. Measured against each other the
    # pair sits at 0.6333, and the tightest `ha` anywhere is the pointed hat 96 at 0.6933.
    #
    # The brim row is already in prim notation and the crown row is not (the pack-5 finding). A
    # cone's r0 is always at z0 with the solid running DOWN, so "widest ring at the TOP, r0 17.0"
    # is literal, while the crown's "r0 8.6 to r1 3.4 over 6 px" is written bottom-up: authored,
    # it is z0 26.0 with r0 3.4 at the top ring and r1 8.6 six px below it at z 20.0.
    #
    # The two meet because the brim's inner ring, 8.0 at z 20.0, sits INSIDE the crown's own 8.6
    # at the same plane. A brim that met the crown exactly would break into its own island on some
    # frame, the way the ponytail 29's tail does.
    #
    # 20.0 is the pointed hat 96's crown base, and it is why a bare skull under the brim is the
    # shipped shape for a hat that hides `hr` rather than a hole.
    #
    # Face clearance is the number that governs a brim this wide. The 44 + R/2 - z arithmetic puts
    # the outer edge on row 29.5; measured, the lowest lit row at stand is 28, and across all eight
    # eyed heads and all 64 dir-frames it paints over 0 face pixels and keeps 1 clear row above the
    # brow at hd17 walk0 d2. That is the pointed hat 96's margin exactly, and one row better than
    # the mourning hat 77 and the sou'wester 102, which both ship at 0.
    #
    # gateBounds is not close: at r 17.0 the brim spans columns 15 to 48 of a 64 px frame.
    "ha108": {
        "prims": [
            {"t": "cone", "bone": "head", "slot": 0, "z0": 23.0, "len": 3.0,
             "r0": 17.0, "r1": 8.0},
            {"t": "cone", "bone": "head", "slot": 1, "z0": 26.0, "len": 6.0,
             "r0": 3.4, "r1": 8.6},
        ],
    },
    # ---- costume pack 8: clockwork (#458) ----
    # Steampunk artisan. Every row bolts a machine part to a plain garment, so the separator is
    # always a piece of hardware standing off the body rather than a change to the body's own box.
    #
    # Jodhpurs (set 109, one slot). Flared at the HIP and tight at the shin, which is the mirror of
    # the culottes 103 and the opposite of every other trouser: the cargo 47 is baggy at 5.5 with a
    # step at the knee and stays loose to 4.6.
    #
    # The trousers 7 are what this row actually had to clear, not the cargo 47 the ledger names —
    # the pack-4 finding again. Three builds against it:
    #
    #   hip box 8.0 x 6.4 to z 2.6, cone 6.8 -> 4.4, shin tube 4.2      -> 0.9316 vs 7
    #   hip box 8.3 x 6.7 to z 4.4, cone 6.8 -> 4.4, shin tube 3.9      -> 0.8251 vs 7
    #   hip box 8.4 x 6.8 to z 4.6, cone 7.8 -> 4.4, shin tube 3.9      -> the build below, 0.8406
    #
    # The first build is the ledger's numbers and it is 0.078 over the bar, because its hip box is
    # the trousers 7's box to the tenth and its shin is within 0.1 of 7's 4.3. A garment that
    # shares a waistband and a shin with another garment has already spent most of its alpha on it.
    # So the waist went 2.0 px taller than 7's, which is a band 7 has nothing at, and the shin went
    # 0.4 narrower — 0.2 clear of bd1's own 3.7 shin, the minimum — to take the rest.
    #
    # The knee is why the two balls exist. A cone has a flat end disc and no cap, and bd1's thigh
    # is a CAPSULE: its bottom cap is a sphere of radius 4.2 centred on the knee. The cone's 4.4
    # rim clears that by 0.2 and the 3.9 shin tube loses to it outright for the 1.56 px below the
    # joint where the sphere is still wider — so rows 85-87 at stand d3 came out empty and the
    # layer split into a thigh island and a shin island. A ball r 4.6 on the leg bone at the knee
    # is the capsule cap the cone prim does not have, and it closes the joint at every angle
    # because both solids contain the joint point however far the knee bends.
    #
    # What is left is a 7 px and a 1 px fragment at stand dirs 0/2/4/6: the hip flare reaches
    # x 11.4 and bd1's arm owns x 6.3 to 12.7, so the arm cuts the flare and strands its outboard
    # tip. The potion belt 92 ships an 8 px detached island at stand d0 and d6 for the same reason.
    # Dirs 1/3/5/7 are one island, and the stride and sit frames split the way lg7's do (walk0 d0
    # is 3 islands there and 3 here).
    "lg109": {
        "prims": [
            {"t": "box",  "bone": "hip",    "slot": 0, "c0": (-8.4, -6.8, -2.6),
             "c1": (8.4, 6.8, 4.6)},
            {"t": "cone", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN),
             "r0": 7.8, "r1": 4.4},
            {"t": "cone", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN),
             "r0": 7.8, "r1": 4.4},
            {"t": "ball", "bone": "leg_l",  "slot": 0, "c": (0.0, 0.0, -float(THIGH_LEN)),
             "r": 4.6},
            {"t": "ball", "bone": "leg_r",  "slot": 0, "c": (0.0, 0.0, -float(THIGH_LEN)),
             "r": 4.6},
            {"t": "limb", "bone": "knee_l", "slot": 0, "len": 16.0, "r": 3.9},
            {"t": "limb", "bone": "knee_r", "slot": 0, "len": 16.0, "r": 3.9},
        ],
    },
    # Bracered Jacket (set 110, two slots). The arm STEPS: a slim upper sleeve to the elbow, then a
    # forearm bracer. No other `ch` changes width mid-arm — the cardigan 80 is a constant 5.0 tube
    # the whole way and the rune tunic 91's bell flares smoothly.
    #
    # The bracer had to beat the tracksuit top 44, not the cardigan 80 the ledger names. 44's
    # sleeve is a constant 4.6 with a 4.8 cuff, so a 3.8/5.0 step straddles it and shares almost
    # all of it. Three builds:
    #
    #   sleeve 3.8, bracer 5.0 cylinder, body 8.2 x 6.5 to z 0.0     -> 0.9043 vs 44
    #   sleeve 3.5, bracer 5.4 cylinder, body 8.0 x 6.4 to z -1.0    -> 0.8587 vs 44
    #   sleeve 3.4, bracer 5.8 -> 4.8 cone, body 8.0 to z -3.6       -> the build below, 0.8257
    #
    # The step is real in the outline, which is what pack 4's ch86 lesson demands of any feature on
    # a limb. Measured on the frozen sheet at stand, the layer's own columns above the elbow and
    # below it: d3 19..44 -> 17..46, d2 22..43 -> 20..43, d4 20..41 -> 20..43. Two px per side, at
    # the elbow row, in the silhouette. At d1 and d5 the span is a constant 26..37 and no arm
    # feature can show — at the profiles the arms sit inside the body's own depth, and the cardigan
    # 80's constant 5.0 arm is likewise a flat 25..39 through the same rows.
    #
    # The bracer TAPERS, 5.8 at the elbow to 4.8 at the wrist, and that is a face measurement
    # rather than a style one. As a constant 5.8 cylinder it painted over 3 face pixels at wave1
    # d5, col 26 row 38, where the raised forearm comes up beside the jaw — the rune tunic 91's
    # bell does the same thing 11 times and shipped, but a wrist 1.0 slimmer costs nothing and
    # takes it to 0. Every other `ch` here is at 0.
    #
    # The bracer is a cone with equal-ish radii and "z0" -10.4, which is how a prim starts at the
    # elbow: a limb always runs from its bone, and the arm bone is the shoulder. It laps 0.6 px
    # over the sleeve's own bottom cap so the arm is one island.
    #
    # Slot 1 is the bracers alone. They are the set, and a second ramp on them is what makes the
    # step read at 2x even before the outline does.
    "ch110": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.0, -6.4, -3.6),
             "c1": (8.0, 6.4, 19.4)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-4.4, -6.6, 19.4),
             "c1": (4.4, 6.6, 23.2)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 11.0, "r": 3.4},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 11.0, "r": 3.4},
            {"t": "cone", "bone": "arm_l", "slot": 1, "z0": -10.4, "len": 11.6,
             "r0": 5.8, "r1": 4.8},
            {"t": "cone", "bone": "arm_r", "slot": 1, "z0": -10.4, "len": 11.6,
             "r0": 5.8, "r1": 4.8},
        ],
    },
    # Gear Belt (set 111, two slots). The potion belt 92 hangs four small even vials BELOW its
    # band. This one puts one 8.8 px cog BESIDE the hip and runs four drive links UP to the ribs,
    # so its mass is asymmetric and vertical where 92's is symmetric and hanging. Measured against
    # 92 with the band copied unchanged it is 0.6056, which is the mass doing all of the work —
    # the tool roll 106 made the same trade at 0.6185.
    #
    # The cog sits inside the arm's columns and is resolved on DEPTH, the sword belt 67 and seed
    # satchel 107 way. It spans x 2.0 to 10.8 and bd1's arm owns x 6.3 to 12.7, so 4.5 px of the
    # disc is in the arm's shadow; at y 3.8 to 7.0 its nearest face is 0.6 clear of the arm's own
    # 3.2, which is 67's number for its scabbard spur. So the cog wins those pixels outright at
    # dirs 2/3/4 and the body takes it at 6/7/0 — 2 px and 1 px survive at d0 against the potion
    # belt 92's own 8, which is the shape a front-mounted `wa` has at the back rather than a hole.
    #
    # Measured in the outline at stand d3, the layer spans columns 21..39 — 11 px left of the
    # figure's centre column 32 and 7 px right. The potion belt 92's band and vials span 22..41,
    # 10 and 9. Rows 68-69 carry ink on the cog side only, where 92's vials scallop both sides.
    #
    # The links are the pair the ledger's diagonal line governs, and here it points the right way.
    # They sit at y 5.78 to 7.82, so they stand 1.42 proud of the bracered jacket 110's 6.4 body
    # and 1.82 of bd1's 6.0, and their outer corner (8.1, 7.82) reaches 11.24 on the diagonal
    # against the jacket's (8.0, 6.4) at 10.24. `wa` draws after `ch`, so they are never overdrawn
    # either way; with 110 worn under it, 4144 of the jacket's 4726 px still show at stand and
    # 4324 of 4946 at walk0.
    #
    # Slot 1 is the cog and the links — everything that is machinery, and nothing that is belt.
    "wa111": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-8.1, -6.6, 0.0),
             "c1": (8.1, 6.6, 3.6)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (6.4, 5.4, 1.8), "r": 4.4,
             "squash": (1.0, 0.364, 1.0)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (6.4, 6.8, 7.0), "r": 1.7,
             "squash": (1.0, 0.60, 1.3)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (6.1, 6.8, 9.4), "r": 1.7,
             "squash": (1.0, 0.60, 1.3)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (5.8, 6.8, 11.8), "r": 1.7,
             "squash": (1.0, 0.60, 1.3)},
            {"t": "ball", "bone": "spine", "slot": 1, "c": (5.5, 6.8, 14.2), "r": 1.7,
             "squash": (1.0, 0.60, 1.3)},
        ],
    },
    # Frock Coat (set 112, two slots, hides ch). No flare cone at all: the hem is the same 7.8 the
    # chest is, and the back OPENS. The overcoat 11's whole read is its hip flare and the tailcoat
    # 75 has a bare hip in front with two 1.4 px tails behind, so below the waist this shares no
    # profile with either — 0.8185 against 75, 0.7044 against 11, 0.5636 against the robe 93.
    #
    # The vent is four boxes, not two. A skirt split only at the back needs a bridge across the
    # front, so the left and right panels run the full 12.8 px depth and a 2.4 px box joins them at
    # y 0.0 to 6.4. What is left open is x -1.2..1.2 at y < 0 from z -2.0 down, exactly the row's
    # numbers.
    #
    # Measured at stand: d7 carries no ink at columns 31-32 for rows 70-74, and d3 fills 30-32 at
    # the same rows. What shows through the slot is bd1 — at x 1.2 the thigh capsule reaches
    # y -3.13, nearer than the bridge's own back face at y 0, so the holdout takes those pixels and
    # the vent is genuinely open rather than a recess of coat behind coat.
    #
    # d6 and d0 show the vent as an outline seam and not as daylight, and that is geometry rather
    # than tuning: a 2.4 px slot through a 12.8 px deep skirt only opens along its own axis, so
    # widening it enough to see through at 45 degrees would mean a 12.8 px gap and no coat.
    #
    # The collar is 7.9 wide because a narrow one does not survive the holdout. At x 4.8 it sits
    # INSIDE bd1's 7.5 torso, so the body wins every pixel of it below the torso top at z 21 and
    # the collar came out as a 20-32 px island one row clear of the shoulder at dirs 1 and 5.
    # Overlapping it into the body, matching its depth, and raising the body to z 21.0 all left the
    # island; standing it 0.4 proud of bd1 and 0.1 proud of the coat's own body removed the cause,
    # and the layer is one island at every direction on stand, walk0 and sit.
    #
    # Sit: the skirt's deepest corner is y 6.4 at z -8.0 and the hip IS the sit anchor at row 74,
    # so it lands on row 85.2, twenty-six clear of the 111 the bounds gate fails at.
    #
    # Slot 1 is the collar and the cuffs.
    "cc112": {
        "prims": [
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.8, -6.4, -2.0),
             "c1": (7.8, 6.4, 20.4)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-7.8, -6.4, -8.0),
             "c1": (-1.2, 6.4, -2.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (1.2, -6.4, -8.0),
             "c1": (7.8, 6.4, -2.0)},
            {"t": "box",  "bone": "spine", "slot": 0, "c0": (-1.2, 0.0, -8.0),
             "c1": (1.2, 6.4, -2.0)},
            {"t": "limb", "bone": "arm_l", "slot": 0, "len": 21.0, "r": 4.2},
            {"t": "limb", "bone": "arm_r", "slot": 0, "len": 21.0, "r": 4.2},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-7.9, -6.6, 19.8),
             "c1": (7.9, 6.6, 22.8)},
            {"t": "ball", "bone": "arm_l", "slot": 1, "c": (0.0, 0.0, -21.0), "r": 4.8,
             "squash": (1.0, 1.0, 0.44)},
            {"t": "ball", "bone": "arm_r", "slot": 1, "c": (0.0, 0.0, -21.0), "r": 4.8,
             "squash": (1.0, 1.0, 0.44)},
        ],
    },
    # Cravat (set 113, one slot). The tie 61 is a 3.8 knot over a blade that tapers DOWN to z 5.6,
    # so its profile is a wedge pointing at the floor. This one is the inverse: widest at the
    # throat and gone by the chest, a lump pointing up, with no blade at all. Measured 0.3672
    # against 61 and 0.0869 against the puff muffler 82, which is the other set living at the neck.
    #
    # Three balls rather than one, because "vanishing into the shirt" is a taper in TWO axes. The
    # top is 7.0 across at spine z 19.6 with its front face at 7.89 — 1.89 proud of bd1's 6.0
    # torso. The bottom is 3.4 across at z 14.0 with its front at 7.15, 1.15 proud. So the mass
    # narrows AND sinks toward the body on the way down, and the torso closes over it rather than
    # the drawing simply stopping. 3.4 is the chain 62's floor for anything whose read depends on
    # it, which is why the bottom ball is not smaller.
    #
    # It has to be a front mass and not a ring. A prim centred on the spine at this height is
    # inside bd1's torso in every direction and renders nothing — the lace ruff 76 is a plate at
    # r 9.4 for exactly that reason. Sitting it at y 6.3-6.7 puts it outside the torso in the one
    # direction that matters and lets the neck stand out of the top of it.
    #
    # Face clearance: it paints over 0 face pixels and keeps 2 clear rows below the chin at hd21
    # walk0 d1. Its top reaches spine z 21.8, which is 0.8 above the torso, and the skull's own
    # cross-section there is only y 3.54 — well behind the cravat's 7.89, so the two never argue.
    "ca113": {
        "prims": [
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 6.7, 19.6), "r": 3.5,
             "squash": (1.0, 0.34, 0.63)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 6.5, 16.4), "r": 2.6,
             "squash": (1.0, 0.42, 0.85)},
            {"t": "ball", "bone": "spine", "slot": 0, "c": (0.0, 6.3, 14.0), "r": 1.7,
             "squash": (1.0, 0.50, 0.90)},
        ],
    },
    # Goggle Cap (set 115, two slots, hides hr). The headphones 55 put two pucks at EAR height on a
    # coronal band and have no shell. This one is a shell that replaces the hair, and its two cups
    # sit on the FOREHEAD — 14 px higher and ninety degrees round. Measured 0.7756 against the
    # beanie 53, 0.7691 against the mourning hat 77 and 0.2199 against 55 itself.
    #
    # The cups are on the forehead rather than the temples because the temples are where the
    # catchlight corridor is. That is not a preference: the FIRST build's shell reached row 34 at
    # d6 and put one pixel at (29,33), inside the 3x3 of (28,34), and gateHoldout failed with 5
    # interior disagreements. figurepass repaints a lone `hi` in the cheek band, and a hat pixel
    # touching that 3x3 makes the head's own cleanup fire on the bare head and not under the hat,
    # so the composite and the combined render stop agreeing. Raising the shell 1.8 px in z and
    # flattening it from 0.70 to 0.655 took the nape edge two rows clear, which is the memo's other
    # option — cover the pixel outright or stay two clear.
    #
    # The ledger's "every pixel above row 20" does not survive contact with the skull, which itself
    # tops out at row 21. Measured on the frozen sheet: rows 13-28 at stand d3 and rows 12-41 over
    # all 64 cells, the 41 being the sit frame where the head sits 9 px lower. What the row was
    # really claiming is the face clearance, and that holds — 0 face pixels painted over against
    # all eight eyed heads, with 1 clear row above the brow at hd17 walk0 d2. That is the flight
    # helmet 89 and the sunshade 108's margin and one row better than the beanie 53 and the
    # sou'wester 102, which both ship at 0.
    #
    # The cups stand 3.02 proud of the cap's own surface in y at z 23.8 — the row's 3.0 — and their
    # lowest row is 28. The band is 3.6 tall at z 21.8-25.4 and 10.26 wide, which is 0.6 past the
    # shell at that height, so it reads as a strap over the cap rather than a stripe painted on it.
    #
    # Slot 1 is the cups.
    "ha115": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -2.6, 21.0), "r": 10.6,
             "squash": (0.985, 0.925, 0.655)},
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 3.4, 23.6), "r": 9.0,
             "squash": (1.14, 0.62, 0.20)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (4.6, 6.4, 23.8), "r": 4.0,
             "squash": (0.90, 0.75, 0.90)},
            {"t": "ball", "bone": "head", "slot": 1, "c": (-4.6, 6.4, 23.8), "r": 4.0,
             "squash": (0.90, 0.75, 0.90)},
        ],
    },
    # ---- costume pack 9: penthouse (#459) ----
    #
    # Trained Gown (set 116, two slots). The ledger built this as the long skirt 48's cone verbatim
    # plus a back panel, on the theory that geometry at y < 0 separates the two at dirs 6/7/0 while
    # dirs 2/3/4 stay identical. Built that way and measured, it came out at 0.9905 against 48 —
    # and the shortfall is not a tuning gap, it is arithmetic. 48's alpha is a strict SUBSET of the
    # gown's, so IoU is 46784/(46784 + X) and the bar needs X = 8000 lit px pooled over 64 cells.
    # A panel at y < 0 cannot carry that. Its front-dir rows land at 65 - Y/2 + |z|, inside the
    # cone's own screen area, so the cone hides it; its back-dir rows land at 65 + Y/2 + |z| and
    # only what clears the cone's hem row of 100 is new alpha. Maximising Y/2 + |z| against the sit
    # gate (|z| + Y/2.83 <= 36, since a sit hip point draws at 74 + |z| + reach/2.83) tops out at
    # a six-row band ~20 px wide, about 2900 px pooled. Three times short, so the ledger's escape
    # applies and the newer row changes.
    #
    # What changes is the profile, not the length: a column to the knee and a flare below it,
    # against 48's single straight taper. 8.4 to 10.2 over the top 15 px, then 10.2 to 16.8 over
    # the last 13. Concave where 48 is straight, 1.5 px narrower at the knee and 2.6 px wider at
    # the hem, which reads as a trumpet rather than an A-line and is what "gown" was asking for.
    # The waist goes with it: 48's hip band is a box at +/-8.2 by +/-6.6 over z -2.2..3.0 and this
    # one is +/-7.9 by +/-6.3 over -1.0..7.0, a fitted waist four px higher, because a gown is
    # seamed above the hip and because an identical prim is guaranteed shared alpha.
    #
    # The narrow half is bounded by the walk frames, not by taste. A leg swung 22 degrees is
    # displaced |z|*sin(22) at height z and carries bd1's own 4.2 thigh radius, so the skirt must
    # hold r >= 0.375*|z| + 4.2 everywhere or a stride puts a shin through it. That is 9.83 at the
    # knee against the 10.2 authored here, and 14.7 at the hem against 16.8 — the same rule that
    # fixed 48's hem at 14.2.
    #
    # Measured on the frozen sheet: 0.7911 against 48, 0.7203 against the tiered skirt 71, and the
    # deepest row is 109 at sit d0 against 48's own 108 and the 111 the bounds gate fails at.
    #
    # The train survives as the second read and as slot 1: x +/-7.0 at y -8.0..-6.4, hanging to
    # z -31. Not the ledger's -34 — at sit the deepest row is 74 + |z| + 3.0 rather than the row's
    # 74 + |z| - 4.0, because at d0 the panel's 7.0 half-width becomes the depth axis and projects
    # DOWN where its y projects up. -34 put ink on row 111 and failed bounds; -31 lands on 108,
    # which is 48's own sit row.
    "lg116": {
        "prims": [
            {"t": "box",  "bone": "hip", "slot": 0, "c0": (-7.9, -6.3, -1.0),
             "c1": (7.9, 6.3, 7.0)},
            {"t": "cone", "bone": "hip", "slot": 0, "len": 15.0, "r0": 8.4, "r1": 10.2},
            {"t": "cone", "bone": "hip", "slot": 0, "z0": -15.0, "len": 13.0,
             "r0": 10.2, "r1": 16.8},
            {"t": "box",  "bone": "hip", "slot": 1, "c0": (-7.0, -8.0, -31.0),
             "c1": (7.0, -6.4, 1.0)},
        ],
    },
    # Halter Bodice (set 117, two slots). The tank 43 is a closed box with two shoulder straps.
    # This deletes the back half outright: one front plate and a strap over the throat.
    "ch117": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-6.4, 4.6, 4.0),
             "c1": (6.4, 7.2, 18.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-1.7, 5.4, 17.6),
             "c1": (1.7, 6.9, 22.0)},
            {"t": "box", "bone": "spine", "slot": 1, "c0": (-1.7, -6.6, 20.4),
             "c1": (1.7, 6.9, 22.0)},
        ],
    },
    # Peplum Belt (set 118, two slots). The waist cincher 74 is a straight band with a flat lower
    # edge. This hangs a bell off the same band: a cone from z 2.0 to -5.0, 8.2 out to 11.4.
    "wa118": {
        "prims": [
            {"t": "cone", "bone": "spine", "slot": 0, "z0": 2.0, "len": 7.0,
             "r0": 8.2, "r1": 11.4},
            {"t": "box",  "bone": "spine", "slot": 1, "c0": (-8.4, -6.6, 1.2),
             "c1": (8.4, 6.6, 5.6)},
        ],
    },
}

# A pose is joint angles in degrees plus where the figure's own origin sits relative to the
# avatar's world position point. Standing, that point is the feet; seated, it is the hip contact,
# because the client already lifts the sprite by the seat's z and seat heights vary 0.55-0.82.
# anchor_y is where that point lands in the 64x112 frame.
# Bone angles are degrees about the bone's own axes. The figure faces +Y, so a positive X rotation
# swings a limb forward and a negative one swings it back; positive Y raises an arm out sideways.
#
# Measured: the standing composite is 22 x 85 px, reaching 81 above the anchor and 3 below. It
# reaches below because the anchor is the tile-CENTRE ground point and a foot extending toward the
# camera is genuinely nearer, so it projects lower. anchor_y 102 leaves 21 px of hat room above
# the crown and 9 px under the toe. Walk contact frames reach 7 px down bare and 9 shod, so 8
# was not enough once real footwear existed.
#
# Walk contact frames drop the root by 2.5 px. A leg swung 22 degrees is 37*(1-cos22) = 2.7 px
# shorter vertically, so without the drop the figure hovers on every contact frame.
#
# The sit pose is not a free choice — the shipped seats fix it. The hip sits at the anchor, the
# shin hangs vertical at its full 18 px, and the thigh must then be almost horizontal for the foot
# to land SIT_FOOT_DROP below the hip: 19*cos(88.2) + 18 = 18.6 px, which is cafe_chair's
# seatZ 0.58 x 32. That one pose serves the whole catalog: on bed_basic (0.55 = 17.6 px) the feet
# are 1 px into the floor, and on casino_stool (0.82 = 26.2 px) they dangle 7.6 px clear, which is
# what a bar stool should look like.
SIT_FOOT_DROP = 18.6

POSES = {
    "stand": {"root": (0.0, 0.0, 0.0), "anchor_y": 102, "bones": {}},
    "walk0": {"root": (0.0, 0.0, -2.5), "anchor_y": 102, "bones": {
        "leg_l": (22.0, 0.0, 0.0), "leg_r": (-22.0, 0.0, 0.0),
        "knee_l": (-5.0, 0.0, 0.0), "knee_r": (-18.0, 0.0, 0.0),
        "arm_l": (-18.0, 0.0, 0.0), "arm_r": (18.0, 0.0, 0.0)}},
    "walk1": {"root": (0.0, 0.0, 0.0), "anchor_y": 102, "bones": {
        "knee_r": (-28.0, 0.0, 0.0), "leg_r": (6.0, 0.0, 0.0),
        "arm_l": (-6.0, 0.0, 0.0), "arm_r": (6.0, 0.0, 0.0)}},
    "walk2": {"root": (0.0, 0.0, -2.5), "anchor_y": 102, "bones": {
        "leg_l": (-22.0, 0.0, 0.0), "leg_r": (22.0, 0.0, 0.0),
        "knee_l": (-18.0, 0.0, 0.0), "knee_r": (-5.0, 0.0, 0.0),
        "arm_l": (18.0, 0.0, 0.0), "arm_r": (-18.0, 0.0, 0.0)}},
    "walk3": {"root": (0.0, 0.0, 0.0), "anchor_y": 102, "bones": {
        "knee_l": (-28.0, 0.0, 0.0), "leg_l": (6.0, 0.0, 0.0),
        "arm_l": (6.0, 0.0, 0.0), "arm_r": (-6.0, 0.0, 0.0)}},
    "sit": {"root": (0.0, 0.0, -float(HIP_Z)), "anchor_y": 74, "bones": {
        "leg_l": (88.2, 0.0, 0.0), "leg_r": (88.2, 0.0, 0.0),
        "knee_l": (-88.2, 0.0, 0.0), "knee_r": (-88.2, 0.0, 0.0),
        "arm_l": (14.0, 0.0, 0.0), "arm_r": (14.0, 0.0, 0.0)}},
    "wave0": {"root": (0.0, 0.0, 0.0), "anchor_y": 102, "bones": {
        "arm_r": (0.0, 132.0, 0.0)}},
    "wave1": {"root": (0.0, 0.0, 0.0), "anchor_y": 102, "bones": {
        "arm_r": (0.0, 156.0, 0.0)}},
}

FRAMES = ["stand", "walk0", "walk1", "walk2", "walk3", "sit", "wave0", "wave1"]

def fk(pose, bone, local):
    """Where a bone-local point lands in the figure's uniform px space. Pure math — the pose gate
    has to measure anatomy, and a rendered pixel measures the projection instead: a seated foot is
    19 px forward of the hip, so its screen drop swings from 9 px facing away to 30 px facing the
    camera while the leg never changes length."""
    p = Vector(local)
    name = bone
    while name is not None:
        parent, offset = BONES[name]
        angles = pose["bones"].get(name, (0.0, 0.0, 0.0))
        rot = Euler(tuple(math.radians(a) for a in angles), "XYZ").to_matrix()
        p = rot @ p + Vector(offset)
        name = parent
    return p + Vector(pose["root"])

def check_poses():
    """Gate the pose table before a single frame renders. These are the numbers ART-DIRECTION
    pins, and they are the reason the figure is 80 px rather than the spec's old 100."""
    crown = fk(POSES["stand"], "head", (0.0, 0.0, float(HEAD_LEN))).z
    assert abs(crown - FIGURE_H) < 0.01, f"stand: crown at {crown:.2f} px, want {FIGURE_H}"
    for side in ("knee_l", "knee_r"):
        sole = fk(POSES["stand"], side, (0.0, 0.0, -float(SHIN_LEN))).z
        assert abs(sole) < 0.01, f"stand: {side} sole at {sole:.2f} px, want 0"

    hip_z = fk(POSES["sit"], "hip", (0.0, 0.0, 0.0)).z
    assert abs(hip_z) < 0.01, f"sit: hip at {hip_z:.2f} px, want 0 (the hip IS the anchor)"
    for side in ("knee_l", "knee_r"):
        drop = hip_z - fk(POSES["sit"], side, (0.0, 0.0, -float(SHIN_LEN))).z
        assert abs(drop - SIT_FOOT_DROP) < 0.5, (
            f"sit: {side} sole {drop:.2f} px below the hip, want {SIT_FOOT_DROP} "
            f"(cafe_chair seatZ 0.58 x 32) — the feet miss the floor"
        )

    for name, pose in POSES.items():
        for bone in pose["bones"]:
            assert bone in BONES, f"{name}: no bone named {bone}"

def figure_yaw(direction):
    """Tile dir -> yaw about the figure's own centre. A figure occupies one tile, so direction is
    a rotation, never the quarter-turn footprint remap furni uses. dir 0=N .. 7=NW, and the rig's
    world axes are (x, y) = (fy, fx)."""
    steps = [(0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)]
    dx, dy = steps[direction]
    return math.atan2(-float(dy), float(dx))

# ---- face (#311) ----------------------------------------------------------------------------
# The head models a brow and a nose and stops there. An eye at this scale is one pixel, and a
# one-pixel prim carries no shading of its own — it quantizes to whichever band its neighbours
# fall in — so the eyes and the mouth are stamped by figurepass instead. Where they go is a
# projection, and the camera is in this file, so the projection is too.
#
# The eye sits in a socket, EYE_DEPTH behind the skull surface rather than on it. That is what
# makes the other seven directions work. On the surface, a profile's eye projects inside the
# nose's own screen box and is swallowed by its outline; two px back it clears the nose onto open
# cheek. The same two px decide the far eye of a three-quarter view honestly: recessed, it falls
# BEHIND the nose, the mask says so, and figurepass draws nothing.
#
# EYE_Z is pinned by the projection rather than by anatomy. It puts the eye line one clear row
# below the interior line the brow box draws across the face; one row up and the eyes merge into
# that line and read as a notch in it. MOUTH_Z clears the nose's bottom line the same way.
EYE_X, EYE_Z, EYE_DEPTH = 4.2, 10.0, 2.0
MOUTH_Z = 5.6

# Toward the viewer. An ortho camera looks down its own -Z everywhere, so this one direction is
# the whole of it.
CAM_TOWARD = (Euler(tuple(math.radians(a) for a in CAM_ROT), "XYZ").to_matrix()
              @ Vector((0.0, 0.0, 1.0)))

SKULL = next(p for p in FIGURE_PARTS["hd2"]["prims"] if p["t"] == "ball")
SKULL_R = tuple(SKULL["r"] * s for s in SKULL.get("squash", (1.0, 1.0, 1.0)))
# The nose is the prim that reaches furthest forward — that is what a nose is.
NOSE = max((p for p in FIGURE_PARTS["hd2"]["prims"] if p["t"] == "box"), key=lambda p: p["c1"][1])
NOSE_TIP = ((NOSE["c0"][0] + NOSE["c1"][0]) / 2.0, NOSE["c1"][1],
            (NOSE["c0"][2] + NOSE["c1"][2]) / 2.0)

def skull_surface(x, z):
    """The +y point of the skull ellipsoid above (x, z), in head-bone px."""
    cx, cy, cz = SKULL["c"]
    t = 1.0 - ((x - cx) / SKULL_R[0]) ** 2 - ((z - cz) / SKULL_R[2]) ** 2
    assert t > 0.0, f"face landmark ({x}, {z}) is off the skull"
    return cy + SKULL_R[1] * math.sqrt(t)

def skull_normal(x, z):
    """Outward normal there. Length is never used, only its sign against the camera."""
    cx, cy, cz = SKULL["c"]
    return ((x - cx) / SKULL_R[0] ** 2, (skull_surface(x, z) - cy) / SKULL_R[1] ** 2,
            (z - cz) / SKULL_R[2] ** 2)

def figure_project(pose, direction, bone, local):
    """A bone-local point -> px in the part's CANVAS_W x CANVAS_H frame. The camera is
    orthographic, so world to screen is linear: one world unit spans 32*sqrt(2) px across the
    screen and half that down it. FIGURE_PX and FIGURE_PZ are the inverse of exactly that, which
    is why the height term comes out 1:1 and the frame is anchored where the pose says."""
    p = fk(pose, bone, local)
    c, s = math.cos(figure_yaw(direction)), math.sin(figure_yaw(direction))
    return (CANVAS_W / 2.0 + (p.x * (s - c) + p.y * (s + c)) / math.sqrt(2.0),
            pose["anchor_y"] + (p.x * (c + s) + p.y * (c - s)) / (2.0 * math.sqrt(2.0)) - p.z)

def faces_camera(pose, direction, bone, local, normal):
    """Is a surface point turned toward the camera? Bone rotations are rigid, so fk carries a
    normal as the difference of two points. The root's squash is not rigid: it scales z by
    FIGURE_PZ against FIGURE_PX for x and y, and a normal takes the inverse of that."""
    n = fk(pose, bone, tuple(local[i] + normal[i] for i in range(3))) - fk(pose, bone, local)
    c, s = math.cos(figure_yaw(direction)), math.sin(figure_yaw(direction))
    world = Vector((n.x * c - n.y * s, n.x * s + n.y * c, n.z * FIGURE_PX / FIGURE_PZ))
    return world.dot(CAM_TOWARD) > 0.0

def face_anchor(pose, direction):
    """Where figurepass stamps the face in this frame, or None with the face turned away.

    Per eye, not per face: a profile keeps one and loses the other, and only the surface normal
    knows which. "in" is the screen-x step from the eye toward the nose, the side the catch light
    goes on."""
    nose_x = figure_project(pose, direction, "head", NOSE_TIP)[0]
    eyes = []
    for side in (1.0, -1.0):
        x = side * EYE_X
        surface = (x, skull_surface(x, EYE_Z), EYE_Z)
        if not faces_camera(pose, direction, "head", surface, skull_normal(x, EYE_Z)):
            continue
        px, py = figure_project(pose, direction, "head", (x, surface[1] - EYE_DEPTH, EYE_Z))
        eyes.append({"x": px, "y": py, "in": 1 if nose_x > px else -1})
    if not eyes:
        return None
    # A 2 px mouth only reads square-on. Turned away it is noise on the jaw, so it goes with the
    # second eye.
    mouth = None
    if len(eyes) == 2:
        mx, my = figure_project(pose, direction, "head",
                                (0.0, skull_surface(0.0, MOUTH_Z), MOUTH_Z))
        mouth = {"x": mx, "y": my}
    return {"eyes": eyes, "mouth": mouth}

def skull_prim_index(build_parts):
    """Mask index of the skull in this render's prim order — the one prim figurepass may paint a
    face onto. 0 when the head is not in the render at all."""
    n = 0
    for part_id in build_parts:
        for prim in FIGURE_PARTS[part_id]["prims"]:
            n += 1
            if prim is SKULL:
                return n
    return 0

def add_figure_prim(prim):
    """Build one figure prim in bone-local px. Caller parents the results to the bone."""
    made = []
    t = prim["t"]
    if t == "box":
        c0, c1 = prim["c0"], prim["c1"]
        lo = Vector(tuple(min(c0[i], c1[i]) for i in range(3)))
        hi = Vector(tuple(max(c0[i], c1[i]) for i in range(3)))
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.active_object
        obj.location = (lo + hi) / 2
        obj.scale = hi - lo
        finish(obj, smooth=False)
        made.append(obj)
    elif t == "limb":
        length, r = prim["len"], prim["r"]
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=length)
        obj = bpy.context.active_object
        obj.location = (0.0, 0.0, -length / 2.0)
        finish(obj, smooth=True)
        made.append(obj)
        caps = (0.0,) if prim.get("caps") == "top" else (0.0, -length)
        for z in caps:   # capsule caps, so a swung limb keeps a round joint
            bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=r)
            cap = bpy.context.active_object
            cap.location = (0.0, 0.0, z)
            finish(cap, smooth=True)
            made.append(cap)
    elif t == "cone":
        # Truncated cone down local -Z: r0 at the bone, r1 at the far end. Skirts and coat flares.
        # "z0" moves the r0 end off the bone origin, and equal radii make it a cylinder: the head
        # bone sits at the chin, so a hat that stands ABOVE the crown has nothing to hang from.
        # A box would do it with four corners, and a corner-on box pulses 14 px wide to 20 as the
        # figure turns — a 24-gon holds its width in all eight directions, which is what a hat
        # made of straight sides has to do.
        length, r0, r1 = prim["len"], prim["r0"], prim["r1"]
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r1, radius2=r0, depth=length)
        obj = bpy.context.active_object
        obj.location = (0.0, 0.0, prim.get("z0", 0.0) - length / 2.0)
        finish(obj, smooth=True)
        made.append(obj)
    elif t == "ball":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=14, radius=prim["r"])
        obj = bpy.context.active_object
        obj.location = prim["c"]
        obj.scale = prim.get("squash", (1.0, 1.0, 1.0))
        finish(obj, smooth=True)
        made.append(obj)
    return made

def build_figure(part_ids, pose, direction):
    """Bone empties + every named part's prims. Returns the per-prim object lists in order, so the
    mask pass can retag them exactly the way the furni path does."""
    scene = bpy.context.scene
    root = bpy.data.objects.new("fig_root", None)
    root.rotation_euler = (0.0, 0.0, figure_yaw(direction))
    root.scale = (FIGURE_PX, FIGURE_PX, FIGURE_PZ)
    scene.collection.objects.link(root)

    origin = bpy.data.objects.new("fig_origin", None)
    origin.location = pose["root"]
    scene.collection.objects.link(origin)
    origin.parent = root
    origin.matrix_parent_inverse = Matrix.Identity(4)

    bones = {}
    for name, (_, offset) in BONES.items():
        empty = bpy.data.objects.new(f"fig_{name}", None)
        empty.location = offset
        angles = pose["bones"].get(name, (0.0, 0.0, 0.0))
        empty.rotation_euler = tuple(math.radians(a) for a in angles)
        scene.collection.objects.link(empty)
        bones[name] = empty
    for name, (parent, _) in BONES.items():
        bones[name].parent = bones[parent] if parent else origin
        bones[name].matrix_parent_inverse = Matrix.Identity(4)

    prim_objs = []
    for part_id in part_ids:
        for prim in FIGURE_PARTS[part_id]["prims"]:
            objs = add_figure_prim(prim)
            for obj in objs:
                obj.parent = bones[prim["bone"]]
                obj.matrix_parent_inverse = Matrix.Identity(4)
            prim_objs.append(objs)
    return prim_objs

# The canonical body every garment is cut against. Rendering a garment WITH these present and
# then discarding their pixels by mask index is a holdout: where the body is nearer, the body wins
# the depth test, so those pixels are simply never the garment's. Compositing is then plain
# alpha-over with no runtime depth at all.
#
# This works only while the holdout set is exactly one thing. That is what the per-set hidden-layer
# rules buy: a hat hides hair, so a hat never needs a holdout render per hair set. Adding a second
# HEAD SHAPE would break it — every hat would need re-rendering per head — so hd stays one mesh
# and head variety comes from colour and hair.
HOLDOUT_PARTS = ["bd1", "hd2"]

def figure_render_set(part_id):
    """Which parts to build for one layer's render, and the prim index its own geometry starts at.
    Everything before that index is holdout and gets discarded by figurepass."""
    if part_id in HOLDOUT_PARTS:
        upto = HOLDOUT_PARTS[: HOLDOUT_PARTS.index(part_id) + 1]
        return upto, sum(len(FIGURE_PARTS[p]["prims"]) for p in upto[:-1])
    return HOLDOUT_PARTS + [part_id], sum(len(FIGURE_PARTS[p]["prims"]) for p in HOLDOUT_PARTS)

def clear_figure():
    for obj in [o for o in bpy.data.objects if o.type == "EMPTY" and o.name.startswith("fig_")]:
        bpy.data.objects.remove(obj, do_unlink=True)

# ---- footprint-frame transforms ------------------------------------------------------------

def rot_pt(p, span_y):
    """One quarter turn, identical to iso.ts rotateBox: (x, y) -> (spanY - y, x)."""
    return (span_y - p[1], p[0], p[2])

def world(p):
    """Footprint coords -> Blender world coords (axis swap + z squash)."""
    return Vector((p[1], p[0], p[2] * ZSCALE))

def prim_points(prim):
    if prim["t"] == "box":
        return [prim["c0"], prim["c1"]]
    if prim["t"] == "cyl":
        return [(prim["cx"], prim["cy"], prim["z0"]), (prim["cx"], prim["cy"], prim["z1"])]
    if prim["t"] == "hcyl":
        if prim.get("axis", "y") == "y":
            return [(prim["x"], prim["y0"], prim["z"]), (prim["x"], prim["y1"], prim["z"])]
        return [(prim["y0"], prim["x"], prim["z"]), (prim["y1"], prim["x"], prim["z"])]
    return [prim["c"]]

def prim_centroid(prim):
    """Footprint (fx, fy) centre of a prim, for the near/far split."""
    pts = prim_points(prim)
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

def near_flags(prims, seat_prim):
    """Which prims draw IN FRONT of an occupant seated on `seat_prim` (#227).

    Derived from geometry, not declared. PIPELINES §2 stage 1 assumes an artist tags each slot
    with an occlusion group per direction; the rig already knows where every primitive is, and
    depth in the painter's algorithm is just fx+fy — larger is nearer the camera. So a prim whose
    centroid sits nearer than the seat's is in front of whoever is sitting there, and that falls
    out of the same rotation the direction loop already does.
    """
    if seat_prim is None:
        return []
    sx, sy = prim_centroid(seat_prim)
    seat_depth = sx + sy
    out = []
    for prim in prims:
        cx, cy = prim_centroid(prim)
        out.append(bool(cx + cy > seat_depth + 1e-6))
    return out

def prim_fy_range(prim):
    """Footprint depth the prim occupies, radii included. For a wall part fy 0 is the wall, so
    this is how far it hangs off — min is the gap, max is the stand-off."""
    if prim["t"] == "box":
        return (prim["c0"][1], prim["c1"][1])
    if prim["t"] == "cyl":
        return (prim["cy"] - prim["ry"], prim["cy"] + prim["ry"])
    if prim["t"] == "hcyl":
        # world x is fy: a run along fy is bounded by its ends (plus caps), one along fx by r.
        if prim.get("axis", "y") == "y":
            pad = prim["r"] if prim.get("caps", True) else 0.0
            return (prim["y0"] - pad, prim["y1"] + pad)
        return (prim["x"] - prim["r"], prim["x"] + prim["r"])
    return (prim["c"][1] - prim["r"], prim["c"][1] + prim["r"])

def prim_fx_range(prim):
    """The same along the wall. hcyl swaps roles: a run along fy is bounded by its radius here."""
    if prim["t"] == "box":
        return (prim["c0"][0], prim["c1"][0])
    if prim["t"] == "cyl":
        return (prim["cx"] - prim["rx"], prim["cx"] + prim["rx"])
    if prim["t"] == "hcyl":
        if prim.get("axis", "y") == "y":
            return (prim["x"] - prim["r"], prim["x"] + prim["r"])
        pad = prim["r"] if prim.get("caps", True) else 0.0
        return (prim["y0"] - pad, prim["y1"] + pad)
    return (prim["c"][0] - prim["r"], prim["c"][0] + prim["r"])

def prim_top(prim):
    """Highest drawn point in height units — radii included, unlike prim_points."""
    if prim["t"] == "box":
        return prim["c1"][2]
    if prim["t"] == "cyl":
        return prim["z1"]
    if prim["t"] == "hcyl":
        return prim["z"] + prim["r"] / ZSCALE   # world-space radius, unsquashed
    return prim["c"][2] + prim["r"]

def spin_prim(prim, spin, degrees):
    """Turn one prim about the part's axle, in the fx/z plane its disc stands in (#430).

    The turn is done in WORLD coords and squashed back, not in footprint ones: z is scaled by
    ZSCALE, so a pin set into a rim traces a true circle in the render and an ellipse in the
    numbers. Turning it in footprint space would walk it off the rim at 45 degrees and back on at
    90, which reads as a wobble rather than a rotation.
    """
    assert prim["t"] == "hcyl" and prim.get("axis", "y") == "y", (
        f"spin is defined for the fy-axis cylinders a wheel face is made of, not {prim['t']}")
    a = math.radians(degrees)
    dx, dz = prim["x"] - spin["cx"], (prim["z"] - spin["cz"]) * ZSCALE
    p = dict(prim)
    p["x"] = spin["cx"] + dx * math.cos(a) - dz * math.sin(a)
    p["z"] = spin["cz"] + (dx * math.sin(a) + dz * math.cos(a)) / ZSCALE
    return p

def rotate_prim(prim, span_y):
    pts = [rot_pt(p, span_y) for p in prim_points(prim)]
    p = dict(prim)
    if prim["t"] == "box":
        (ax, ay, az), (bx, by, bz) = pts
        p["c0"] = (min(ax, bx), min(ay, by), az)
        p["c1"] = (max(ax, bx), max(ay, by), bz)
    elif prim["t"] == "cyl":
        p["cx"], p["cy"] = pts[0][0], pts[0][1]
        p["rx"], p["ry"] = prim["ry"], prim["rx"]
    elif prim["t"] == "hcyl":
        # a fy-axis cylinder becomes an fx-axis one; keep type, swap the run axis
        (ax, ay, _), (bx, by, _) = pts
        if ax == bx:
            p["x"], p["y0"], p["y1"] = ax, min(ay, by), max(ay, by)
            p["axis"] = "y"
        else:
            p["x"], p["y0"], p["y1"] = ay, min(ax, bx), max(ax, bx)
            p["axis"] = "x"
    else:
        p["c"] = pts[0]
    return p

# ---- scene ---------------------------------------------------------------------------------

def clear_meshes():
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

def white_material():
    mat = bpy.data.materials.get("artgen_white")
    if mat:
        return mat
    mat = bpy.data.materials.new("artgen_white")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    for name in ("Specular IOR Level", "Specular"):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = 0.0
            break
    return mat

def finish(obj, smooth):
    obj.data.materials.append(white_material())
    if smooth:
        try:
            bpy.ops.object.shade_auto_smooth()   # smooths curves, keeps flat faces flat (4.1+)
        except AttributeError:
            bpy.ops.object.shade_smooth()

def mask_material(n):
    """Flat emission encoding prim index n in base 3 over RGB. Channel levels {0, .5, 1} survive
    the sRGB display transform far enough apart (0/188/255) to decode by nearest level."""
    name = f"artgen_mask_{n}"
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = ((n % 3) * 0.5, (n // 3 % 3) * 0.5, (n // 9 % 3) * 0.5, 1.0)
    out = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat

def add_prim(prim):
    """Build one prim's mesh objects; returns them so the mask pass can retag materials."""
    made = []
    t = prim["t"]
    if t == "box":
        c0, c1 = world(prim["c0"]), world(prim["c1"])
        lo = Vector(tuple(min(c0[i], c1[i]) for i in range(3)))
        hi = Vector(tuple(max(c0[i], c1[i]) for i in range(3)))
        bpy.ops.mesh.primitive_cube_add(size=1, location=(lo + hi) / 2)
        obj = bpy.context.active_object
        obj.scale = hi - lo
        if prim.get("bevel"):
            mod = obj.modifiers.new("bevel", "BEVEL")
            mod.width = prim["bevel"]
            mod.segments = 3
        finish(obj, smooth=bool(prim.get("bevel")))
        made.append(obj)
    elif t == "cyl":
        z0, z1 = prim["z0"] * ZSCALE, prim["z1"] * ZSCALE
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32, radius=1.0, depth=z1 - z0,
            location=world((prim["cx"], prim["cy"], 0)) + Vector((0, 0, (z0 + z1) / 2)),
        )
        obj = bpy.context.active_object
        obj.scale = (prim["ry"], prim["rx"], 1.0)   # world x = fy
        if prim.get("taper"):
            mod = obj.modifiers.new("taper", "SIMPLE_DEFORM")
            mod.deform_method = "TAPER"
            mod.factor = prim["taper"] - 1.0
        finish(obj, smooth=True)
        made.append(obj)
    elif t == "hcyl":
        axis = prim.get("axis", "y")
        a = world((prim["x"], prim["y0"], prim["z"]) if axis == "y"
                  else (prim["y0"], prim["x"], prim["z"]))
        b = world((prim["x"], prim["y1"], prim["z"]) if axis == "y"
                  else (prim["y1"], prim["x"], prim["z"]))
        mid = (a + b) / 2
        run = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=prim["r"], depth=run.length,
                                            location=mid)
        obj = bpy.context.active_object
        obj.rotation_euler = run.to_track_quat("Z", "Y").to_euler()
        finish(obj, smooth=True)
        made.append(obj)
        for end in (a, b) if prim.get("caps", True) else ():
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=prim["r"],
                                                 location=end)
            finish(bpy.context.active_object, smooth=True)
            made.append(bpy.context.active_object)
    elif t == "sphere":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=prim["r"],
                                              location=world(prim["c"]))
        obj = bpy.context.active_object
        obj.scale = (1.0, 1.0, ZSCALE)
        finish(obj, smooth=True)
        made.append(obj)
    return made

def setup_scene():
    scene = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.resolution_x = scene.render.resolution_y = RES
    scene.render.film_transparent = True
    scene.render.filter_size = 0.01
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 16

    cam = bpy.data.cameras.new("artgen_cam")
    cam.type = "ORTHO"
    cam.ortho_scale = ORTHO_SCALE
    cam.clip_end = 200.0
    cam_obj = bpy.data.objects.new("artgen_cam", cam)
    cam_obj.location = CAM_LOC
    cam_obj.rotation_euler = tuple(math.radians(a) for a in CAM_ROT)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Black world: face brightness is sun-only, so postpass can quantize on absolute levels.
    if scene.world and scene.world.node_tree:
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.0, 0.0, 0.0, 1.0)

    sun = bpy.data.lights.new("artgen_sun", "SUN")
    sun.energy = 0.9   # unclipped: the sun-facing band must stay separable from flat tops
    sun.angle = 0.0
    if hasattr(sun, "use_shadow"):
        sun.use_shadow = False
    sun_obj = bpy.data.objects.new("artgen_sun", sun)
    d = Vector((-0.22, -0.80, -1.05)).normalized()   # above-front: top > right > left
    sun_obj.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(sun_obj)

def dump_rgba(png_path, raw_path):
    img = bpy.data.images.load(png_path)
    w, h = img.size
    px = list(img.pixels)   # float RGBA, bottom row first
    out = bytearray(w * h * 4)
    for y in range(h):
        src = (h - 1 - y) * w * 4
        dst = y * w * 4
        for i in range(w * 4):
            out[dst + i] = max(0, min(255, round(px[src + i] * 255.0)))
    with open(raw_path, "wb") as f:
        f.write(out)
    bpy.data.images.remove(img)

# ---- main ----------------------------------------------------------------------------------

setup_scene()
meta = {"res": RES, "parts": {}}

only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None

for part_id, part in PARTS.items():
    if only and part_id not in only:
        continue
    assert len(part["prims"]) <= 26, f"{part_id}: mask encoding holds 26 prims max"
    max_z = max(prim_top(prim) for prim in part["prims"])
    seats = [p for p in part["prims"] if p.get("seat")]
    seat_z = max(prim_top(p) for p in seats) if seats else None
    # A wall part is authored on the plane fy=0; dir 0 is the right wall and dir 6 the left, so
    # quarter turns 1 and 2 exist only to carry the mesh round and are never rendered.
    is_wall = part.get("surface") == "wall"
    fy = [prim_fy_range(prim) for prim in part["prims"]]
    wall_gap, wall_depth = min(r[0] for r in fy), max(r[1] for r in fy)
    if is_wall:
        fx = [prim_fx_range(prim) for prim in part["prims"]]
        fx_min, fx_max = min(r[0] for r in fx), max(r[1] for r in fx)
        assert wall_gap >= -1e-6, f"{part_id}: mesh crosses the wall at fy {wall_gap}"
        assert fx_min + 1e-6 >= wall_depth, (
            f"{part_id}: starts at fx {fx_min} but stands {wall_depth} off the wall — "
            f"depth projects into screen width, so shift the mesh to fx >= {wall_depth}")
        # Dir 6 is dir 0 turned three times, which mirrors the mesh about the tile centre. Only a
        # mesh whose extremes straddle that centre comes back as a true mirror; an off-centre one
        # hangs at a different u on each wall. Contents may sit anywhere inside — the bounds may not.
        assert abs(fx_min + fx_max - part["w"]) < 1e-6, (
            f"{part_id}: spans fx {fx_min}..{fx_max}, off-centre in its {part['w']}-segment span. "
            f"Centre the bounds so the left and right walls mirror: fx_min + fx_max == {part['w']}")
    dirs = (0, 3) if is_wall else (0, 1, 2, 3)
    # #430: every direction of state 0, then of state 1, and so on. The spin is applied to the
    # authored dir-0 mesh and the quarter turns carry the spun prims round, so a state costs a
    # full set of renders and nothing else — no direction knows it is looking at a turned face.
    spin = part.get("spin")
    frames = []
    scene = bpy.context.scene
    for s in range(spin["states"] if spin else 1):
        prims = [spin_prim(p, spin, s * spin["step"]) if s and p.get("spin") else dict(p)
                 for p in part["prims"]]
        span = (part["w"], part["l"])   # (spanX, spanY), dir-0 frame
        for q in range(4):
            if q > 0:
                prims = [rotate_prim(p, span[1]) for p in prims]
                span = (span[1], span[0])
            if q not in dirs:
                continue
            clear_meshes()
            prim_objs = [add_prim(prim) for prim in prims]
            name = f"{part_id}_s{s}_d{q * 2}"
            base = os.path.join(OUT, name)
            if hasattr(scene, "eevee"):
                scene.eevee.taa_render_samples = 16
            scene.render.filepath = base + ".png"
            bpy.ops.render.render(write_still=True)
            dump_rgba(base + ".png", base + ".rgba")
            # mask pass: same geometry, flat per-prim emission, no AA so indices decode exactly
            for i, objs in enumerate(prim_objs):
                for obj in objs:
                    obj.data.materials.clear()
                    obj.data.materials.append(mask_material(i + 1))
            if hasattr(scene, "eevee"):
                scene.eevee.taa_render_samples = 1
            scene.render.filepath = base + "_mask.png"
            bpy.ops.render.render(write_still=True)
            dump_rgba(base + "_mask.png", base + ".mask.rgba")
            # #227: which prims sit in front of an occupant, in THIS direction's rotated frame.
            seat_now = next((p for p in prims if p.get("seat")), None)
            frames.append({"near": near_flags(prims, seat_now), "state": s,
                           "dir": q * 2, "spanY": span[1], "rgba": name + ".rgba",
                           "mask": name + ".mask.rgba"})
    meta["parts"][part_id] = {
        "w": part["w"], "l": part["l"], "ramp": part["ramp"], "maxZ": max_z, "seatZ": seat_z,
        "surface": part.get("surface", "floor"),
        "wallGap": wall_gap, "wallDepth": wall_depth,
        "frames": frames,
        "prims": [{"ramp": p.get("ramp", part["ramp"]), "group": p.get("group", i)}
                  for i, p in enumerate(part["prims"])],
        "src": part["prims"],   # full authored geometry — postpass hashes it as provenance
        # The axle and the step are as much of the authored design as the prims are: move them and
        # the states repaint, so postpass hashes this into the recipe alongside `src`. Emitted only
        # when the part has one, so a still part's provenance is untouched (#430).
        **({"spin": spin} if spin else {}),
    }
    print(f"rendered {part_id} (maxZ {max_z}, {len(frames)} frames)")

# ---- figure render loop ---------------------------------------------------------------------
# 8 native directions, no mirroring. Mirroring exists to halve hand-drawing and we do not
# hand-draw; rendering all 8 costs Blender seconds and buys asymmetric garments.

check_poses()

# Shadows are fatal to layered figures and setup_scene's per-light `sun.use_shadow = False` does
# NOT turn them off — scene.eevee.use_shadows is a master switch that overrides it. With shadows
# on, a shirt casts onto the torso, so the bare body renders differently depending on what is worn
# over it: measured on the tee, 1374 pixels showing the SAME primitive differed by a mean of
# 56/255. A layer's pixels must not depend on which other layers are worn, or compositing at
# runtime is a lie. Off, that falls to 35 pixels of mean 5.4, all on layer boundaries and none
# inside a flat layer — antialiasing, which the postpass's fixed-threshold quantisation removes.
#
# use_fast_gi and use_raytracing were measured too and changed nothing in this scene (black world,
# one unshadowed sun), so they are left alone rather than set for decoration.
#
# Figures ONLY, and set here rather than in setup_scene because the furni loop has already run:
# those 22 bundles are frozen and their pixels are their identity. Contact shading comes back as
# postpass interior lines along layer boundaries, which is where a pixel-art style wants it.
if hasattr(bpy.context.scene.eevee, "use_shadows"):
    bpy.context.scene.eevee.use_shadows = False

meta["figures"] = {}
meta["figureCanvas"] = {"w": CANVAS_W, "h": CANVAS_H, "height": FIGURE_H,
                        "frames": FRAMES, "sitFootDrop": SIT_FOOT_DROP}

scene = bpy.context.scene
for part_id, part in FIGURE_PARTS.items():
    if only and part_id not in only:
        continue
    assert len(part["prims"]) <= 26, f"{part_id}: mask encoding holds 26 prims max"
    build_parts, own_from = figure_render_set(part_id)
    frames = []
    for frame in FRAMES:
        pose = POSES[frame]
        for direction in range(8):
            clear_meshes()
            clear_figure()
            prim_objs = build_figure(build_parts, pose, direction)
            base = os.path.join(OUT, f"fig_{part_id}_{frame}_d{direction}")
            if hasattr(scene, "eevee"):
                scene.eevee.taa_render_samples = 16
            scene.render.filepath = base + ".png"
            bpy.ops.render.render(write_still=True)
            dump_rgba(base + ".png", base + ".rgba")
            for i, objs in enumerate(prim_objs):
                for obj in objs:
                    obj.data.materials.clear()
                    obj.data.materials.append(mask_material(i + 1))
            if hasattr(scene, "eevee"):
                scene.eevee.taa_render_samples = 1
            scene.render.filepath = base + "_mask.png"
            bpy.ops.render.render(write_still=True)
            dump_rgba(base + "_mask.png", base + ".mask.rgba")
            frames.append({
                "frame": frame, "dir": direction, "anchorY": pose["anchor_y"],
                "face": face_anchor(pose, direction),
                "rgba": os.path.basename(base) + ".rgba",
                "mask": os.path.basename(base) + ".mask.rgba",
            })
    meta["figures"][part_id] = {
        "frames": frames,
        # Prims of every part in the render, in mask-index order. Indices below ownFrom are the
        # holdout body: figurepass drops them, which is what cuts the garment where the body is
        # nearer. Keeping them all instead reconstructs the combined render, which is the
        # reference the holdout gate diffs against — so the gate costs no extra Blender time.
        "prims": [{"slot": q.get("slot", 0), "bone": q["bone"], "part": p}
                  for p in build_parts for q in FIGURE_PARTS[p]["prims"]],
        "ownFrom": own_from,
        "skullPrim": skull_prim_index(build_parts),
        "holdout": build_parts[:-1] if part_id not in HOLDOUT_PARTS or own_from else [],
        "src": part["prims"],
    }
    print(f"rendered figure {part_id} ({len(frames)} dir-frames, "
          f"{own_from} holdout prim(s) from {build_parts[:-1] or ['none']})")

clear_meshes()
clear_figure()

meta_path = os.path.join(OUT, "meta.json")
if only and os.path.exists(meta_path):   # partial re-render: merge into the existing meta
    with open(meta_path) as f:
        prior = json.load(f)
    prior["parts"].update(meta["parts"])
    prior.setdefault("figures", {}).update(meta["figures"])
    prior["figureCanvas"] = meta["figureCanvas"]
    meta = prior
with open(meta_path, "w") as f:
    json.dump(meta, f, indent=2)
print(f"wrote {meta_path}")
