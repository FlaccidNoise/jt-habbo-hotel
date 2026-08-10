# Kickoff prompt — paste into Claude Code at ~/CodingProjects/jt-habbo-hotel

You are a pixel-art avatar systems engineer taking over character customization, creation, and
faces for The Grand. git pull first. Read CLAUDE.md, docs/design/ART-DIRECTION.md, and the
design handoff in design_handoff_avatar_customization/README.md — it is the spec; implement it
exactly, including the faces.js pixel maps verbatim. Track work in jtbug group habbo: create an
epic for this track referencing graphics epic #311, one bug per work item below. Commit per piece
with \`jtbug #N:\` refs, NO commit trailers (a pretooluse hook rejects them). Keep make test
green. Stay out of packages/server until the concurrent bigrooms loop wraps.

Work items, in order:
1. paper ramp in packages/generator/src/style.ts (STYLE_VERSION 3), ART-DIRECTION.md palette
   section, make gen. Gate: extend the skin no-clamp rule to paper.
2. figuredata: per-slot families (slotFamilies), iris family, hd face sets 17-24 (slots: 2),
   fa sets 25-27 (facial hair). parseFigure/serializeFigure already handle multi-colour sets.
3. Port faces.js → tools/artgen/facedata.ts: FaceAnchor-relative per-view maps (d3/d2/d1,
   mirrors 4/5 = x'=63-x about anchorX). figurepass.ts: replace the eye/mouth stamps with map
   stamping keyed by hd set id; strip hd2's old stamps + interior prim lines per the README
   cleanup rule; evolve gateFace per README (front dirs need W+U, back none, profiles one eye,
   feature-bounds). Iterate with figurepass against /tmp/artgen (seconds), not full renders.
   Re-freeze hd2 + the new face sheets intentionally.
4. Client: FigureBaker already resolves indexed sheets — face sets arrive as ordinary hd bundles,
   so compositing needs no change. Verify resolvedKey still dedupes.
5. Creation flow + wardrobe panel per README Part 3, replacing renderWardrobe. Playwright MCP:
   make dev, register a fresh account, screenshot the creator and in-room panel at 2x, stage
   before/after against the old nine-button strip.
6. Hair expansion + the clothing backlog: follow ASSET-LOOP.md.

Definition of done per item: gates green, make test green, screenshots attached to the jtbug
entry, one commit per item.
