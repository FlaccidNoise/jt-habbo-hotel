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
# "proof_" ids are pipeline proofs: rendered and gated but never frozen into the catalog.

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
            {"t": "cyl", "cx": 0.5, "cy": 0.5, "rx": 0.42, "ry": 0.42, "z0": 0.92, "z1": 1.02,
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
            {"t": "cyl", "cx": 0.30, "cy": 0.86, "rx": 0.035, "ry": 0.035, "z0": 0.58, "z1": 0.98},
            {"t": "cyl", "cx": 0.70, "cy": 0.86, "rx": 0.035, "ry": 0.035, "z0": 0.58, "z1": 0.98},
            {"t": "box", "c0": (0.18, 0.80, 0.98), "c1": (0.82, 0.92, 1.22), "bevel": 0.05},
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
            {"t": "box", "c0": (0.00, 0.30, 0.00), "c1": (2.00, 0.70, 0.92)},
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
            {"t": "hcyl", "x": 0.22, "y0": 0.12, "y1": 1.88, "z": 0.16, "r": 0.05, "axis": "x",
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
    "arm_l":  ("chest", (7.0, 0.0, 0.0)),
    "arm_r":  ("chest", (-7.0, 0.0, 0.0)),
    "leg_l":  ("hip",   (3.0, 0.0, 0.0)),
    "leg_r":  ("hip",   (-3.0, 0.0, 0.0)),
    "knee_l": ("leg_l", (0.0, 0.0, -THIGH_LEN)),
    "knee_r": ("leg_r", (0.0, 0.0, -THIGH_LEN)),
}

ARM_LEN = 22

# box: c0/c1 corners in bone-local px. limb: capsule down local -Z, length + radius.
# ball: ellipsoid at a bone-local centre.
# The shins cap at the knee only: a bottom cap is a sphere hanging below the ankle, which puts
# ink under the anchor row and makes the figure read as floating.
FIGURE_PARTS = {
    "bd": {
        "prims": [
            {"t": "box",  "bone": "spine",  "slot": 0, "c0": (-6.5, -3.5, 0.0),
             "c1": (6.5, 3.5, float(TORSO_LEN))},
            {"t": "limb", "bone": "arm_l",  "slot": 0, "len": float(ARM_LEN), "r": 2.4},
            {"t": "limb", "bone": "arm_r",  "slot": 0, "len": float(ARM_LEN), "r": 2.4},
            {"t": "limb", "bone": "leg_l",  "slot": 0, "len": float(THIGH_LEN), "r": 3.0},
            {"t": "limb", "bone": "leg_r",  "slot": 0, "len": float(THIGH_LEN), "r": 3.0},
            {"t": "limb", "bone": "knee_l", "slot": 0, "len": float(SHIN_LEN), "r": 2.6,
             "caps": "top"},
            {"t": "limb", "bone": "knee_r", "slot": 0, "len": float(SHIN_LEN), "r": 2.6,
             "caps": "top"},
            {"t": "box",  "bone": "knee_l", "slot": 0, "c0": (-2.6, -2.0, -float(SHIN_LEN)),
             "c1": (2.6, 5.0, -SHIN_LEN + 3.0)},
            {"t": "box",  "bone": "knee_r", "slot": 0, "c0": (-2.6, -2.0, -float(SHIN_LEN)),
             "c1": (2.6, 5.0, -SHIN_LEN + 3.0)},
        ],
    },
    # The head is its own layer, not part of bd — it is selectable, and it is what makes a figure
    # readable front-from-back. The skull's y radius is 22/2 * 0.82 = 9.0, so the nose has to
    # reach past 9.0 to break the silhouette at all; a brow flush with the skull only shades.
    "hd": {
        "prims": [
            {"t": "ball", "bone": "head", "slot": 0, "c": (0.0, 0.0, HEAD_LEN / 2.0),
             "r": HEAD_LEN / 2.0, "squash": (1.0, 0.82, 1.0)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-1.7, 7.4, 9.0),
             "c1": (1.7, 11.2, 12.6)},
            {"t": "box",  "bone": "head", "slot": 0, "c0": (-4.6, 6.4, 13.0),
             "c1": (4.6, 9.2, 15.4)},
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
# camera is genuinely nearer, so it projects lower. anchor_y 105 leaves 24 px of hat room above
# the crown and 6 px of slack under the toe.
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
    "stand": {"root": (0.0, 0.0, 0.0), "anchor_y": 104, "bones": {}},
    "walk0": {"root": (0.0, 0.0, -2.5), "anchor_y": 104, "bones": {
        "leg_l": (22.0, 0.0, 0.0), "leg_r": (-22.0, 0.0, 0.0),
        "knee_l": (-5.0, 0.0, 0.0), "knee_r": (-18.0, 0.0, 0.0),
        "arm_l": (-18.0, 0.0, 0.0), "arm_r": (18.0, 0.0, 0.0)}},
    "walk1": {"root": (0.0, 0.0, 0.0), "anchor_y": 104, "bones": {
        "knee_r": (-28.0, 0.0, 0.0), "leg_r": (6.0, 0.0, 0.0),
        "arm_l": (-6.0, 0.0, 0.0), "arm_r": (6.0, 0.0, 0.0)}},
    "walk2": {"root": (0.0, 0.0, -2.5), "anchor_y": 104, "bones": {
        "leg_l": (-22.0, 0.0, 0.0), "leg_r": (22.0, 0.0, 0.0),
        "knee_l": (-18.0, 0.0, 0.0), "knee_r": (-5.0, 0.0, 0.0),
        "arm_l": (18.0, 0.0, 0.0), "arm_r": (-18.0, 0.0, 0.0)}},
    "walk3": {"root": (0.0, 0.0, 0.0), "anchor_y": 104, "bones": {
        "knee_l": (-28.0, 0.0, 0.0), "leg_l": (6.0, 0.0, 0.0),
        "arm_l": (6.0, 0.0, 0.0), "arm_r": (-6.0, 0.0, 0.0)}},
    "sit": {"root": (0.0, 0.0, -float(HIP_Z)), "anchor_y": 74, "bones": {
        "leg_l": (88.2, 0.0, 0.0), "leg_r": (88.2, 0.0, 0.0),
        "knee_l": (-88.2, 0.0, 0.0), "knee_r": (-88.2, 0.0, 0.0),
        "arm_l": (14.0, 0.0, 0.0), "arm_r": (14.0, 0.0, 0.0)}},
    "wave0": {"root": (0.0, 0.0, 0.0), "anchor_y": 104, "bones": {
        "arm_r": (0.0, 132.0, 0.0)}},
    "wave1": {"root": (0.0, 0.0, 0.0), "anchor_y": 104, "bones": {
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
        for end in (a, b):
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
    cam_obj.location = (12.2474, 12.2474, 10.0)
    cam_obj.rotation_euler = (math.radians(60.0), 0.0, math.radians(135.0))
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
    frames = []
    scene = bpy.context.scene
    for q in range(4):
        if q > 0:
            prims = [rotate_prim(p, span[1]) for p in prims]
            span = (span[1], span[0])
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
        frames.append({"dir": q * 2, "spanY": span[1], "rgba": f"{part_id}_d{q * 2}.rgba",
                       "mask": f"{part_id}_d{q * 2}.mask.rgba"})
    meta["parts"][part_id] = {
        "w": part["w"], "l": part["l"], "ramp": part["ramp"], "maxZ": max_z, "seatZ": seat_z,
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

meta["figures"] = {}
meta["figureCanvas"] = {"w": CANVAS_W, "h": CANVAS_H, "height": FIGURE_H,
                        "frames": FRAMES, "sitFootDrop": SIT_FOOT_DROP}

scene = bpy.context.scene
for part_id, part in FIGURE_PARTS.items():
    if only and part_id not in only:
        continue
    assert len(part["prims"]) <= 26, f"{part_id}: mask encoding holds 26 prims max"
    frames = []
    for frame in FRAMES:
        pose = POSES[frame]
        for direction in range(8):
            clear_meshes()
            clear_figure()
            prim_objs = build_figure([part_id], pose, direction)
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
                "rgba": os.path.basename(base) + ".rgba",
                "mask": os.path.basename(base) + ".mask.rgba",
            })
    meta["figures"][part_id] = {
        "frames": frames,
        "prims": [{"slot": p.get("slot", 0), "bone": p["bone"]} for p in part["prims"]],
        "src": part["prims"],
    }
    print(f"rendered figure {part_id} ({len(frames)} dir-frames)")

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
