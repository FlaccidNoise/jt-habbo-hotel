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
    "stereo_basic": {
        "w": 1, "l": 1, "ramp": "charcoal",
        "prims": [
            {"t": "box", "c0": (0.10, 0.25, 0.00), "c1": (0.90, 0.75, 1.30), "bevel": 0.03},
            {"t": "hcyl", "x": 0.50, "y0": 0.14, "y1": 0.26, "z": 0.32, "r": 0.17, "ramp": "gold"},
            {"t": "hcyl", "x": 0.50, "y0": 0.16, "y1": 0.26, "z": 0.96, "r": 0.11, "ramp": "gold"},
            {"t": "box", "c0": (0.14, 0.28, 1.30), "c1": (0.86, 0.72, 1.36), "ramp": "slate"},
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
    "sh9": {
        "prims": [
            {"t": "box", "bone": "knee_l", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -SHIN_LEN + 4.2)},
            {"t": "box", "bone": "knee_r", "slot": 0, "c0": (-4.2, -3.5, -float(SHIN_LEN)),
             "c1": (4.2, 7.2, -SHIN_LEN + 4.2)},
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
    # Bellhop Cap (set 10, hides hr). The hides rule is what keeps the holdout set at size one:
    # without it a cap would need a holdout render per hair set.
    "ha10": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, -0.6, 17.0), "r": 10.6,
             "squash": (1.0, 0.94, 0.62)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-8.0, 4.0, 15.2),
             "c1": (8.0, 11.6, 16.6)},
        ],
    },
    "ea12": {
        "prims": [
            {"t": "box", "bone": "head", "slot": 0, "c0": (-7.4, 7.0, 12.2),
             "c1": (7.4, 9.6, 14.0)},
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
    "wa15": {
        "prims": [
            {"t": "box", "bone": "spine", "slot": 0, "c0": (-8.1, -6.6, 0.6),
             "c1": (8.1, 6.6, 3.4)},
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
        length, r0, r1 = prim["len"], prim["r0"], prim["r1"]
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r1, radius2=r0, depth=length)
        obj = bpy.context.active_object
        obj.location = (0.0, 0.0, -length / 2.0)
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
    prims = [dict(p) for p in part["prims"]]
    span = (part["w"], part["l"])   # (spanX, spanY), dir-0 frame
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
    frames = []
    scene = bpy.context.scene
    for q in range(4):
        if q > 0:
            prims = [rotate_prim(p, span[1]) for p in prims]
            span = (span[1], span[0])
        if q not in dirs:
            continue
        clear_meshes()
        prim_objs = [add_prim(prim) for prim in prims]
        base = os.path.join(OUT, f"{part_id}_d{q * 2}")
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
        frames.append({"near": near_flags(prims, seat_now),
                       "dir": q * 2, "spanY": span[1], "rgba": f"{part_id}_d{q * 2}.rgba",
                       "mask": f"{part_id}_d{q * 2}.mask.rgba"})
    meta["parts"][part_id] = {
        "w": part["w"], "l": part["l"], "ramp": part["ramp"], "maxZ": max_z, "seatZ": seat_z,
        "surface": part.get("surface", "floor"),
        "wallGap": wall_gap, "wallDepth": wall_depth,
        "frames": frames,
        "prims": [{"ramp": p.get("ramp", part["ramp"]), "group": p.get("group", i)}
                  for i, p in enumerate(part["prims"])],
        "src": part["prims"],   # full authored geometry — postpass hashes it as provenance
    }
    print(f"rendered {part_id} (maxZ {max_z})")

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
