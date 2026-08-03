# Plan-audit triage — disposition

Four audits of `docs/plans/2026-08-03-v1-vertical-slice.md`, 2026-08-03: 159 findings
([plan-executability](plan-executability.md) 41, [plan-correctness](plan-correctness.md) 37,
[plan-spec-fidelity](plan-spec-fidelity.md) 26, [plan-test-adequacy](plan-test-adequacy.md) 55),
heavily overlapping. **Default: ACCEPTED — the plan was rewritten (revision 2) incorporating
them.** Exceptions:

## Modified (accepted via a different fix than proposed)

- **C-01/X-03/F-06 (avatar depth sign) + T-10 (avatar over rug vs under table)** — the sign-flip
  alone cannot satisfy both requirements; adopted T-10's layered scheme (`floor_furni` kind for
  walkable items) which subsumes the sign fix.
- **T-38 (uniform step cost, FIFO tie-break)** — rejected in favor of C-03's octile heuristic
  with √2 diagonals + total pop order: it makes straight lines *strictly* optimal instead of
  tie-break-dependent. T-38's test expectations were re-derived under octile (tile counts
  unchanged).
- **C-02/T-07 (inventory NULL columns)** — both offered "emit zeros" or "split the schema";
  adopted the split (`InventoryItemSchema`), the cleaner model.
- **C-26 (whisper `to` optionality)** — fixed by promoting whisper to its own message type
  (`t: "whisper"`) rather than a second discriminator.
- **X-06/X-15/T-28 (CORS vs proxy)** — adopted the Vite-proxy reading; the CORS/preflight
  findings become moot and no CORS code exists.
- **F-03 (drain/reconnect/rolling deploy)** — partially adopted: `dispose()` + 5-minute unload
  grace + reconnect-as-rejoin now; drain and rolling deploy explicitly deferred to the gateway
  plan in the scope paragraph (the finding's real complaint was silence).
- **F-02 (focus states)** — substrate adopted (per-room chat config in the room doc, `posture`
  field in the avatar schema); props and DND bubble explicitly deferred.
- **M-09 (height-33 hole)** — documented rather than changed; the hole is Habbo-faithful.
- **F-05/X-27/C-23/T-46 (validator vs pathfinder walkability)** — adopted the strong version:
  the validator now walks with the pathfinder's rules (8-dir, `climbOk`, corner rule), which
  also forced the letters-fixture tests to be rewritten around `charToHeight`.
- **T-51 (smoke Makefile target)** — target dropped entirely; smoke rides the normal vitest run.

## Rejected

- **X-22's "keep seq in the key for determinism"** — `seq` is removed from `depthKey` entirely
  (C-07/T-55); ES2019 stable sort provides deterministic ties.
- **F-06's horizontal epsilon term** — deferred to the real-art phase with the generator's layer
  offsets; unneeded while placeholder art has no per-layer sprites (noted, not silent).
- **T-49's suggestion to enumerate codes later** — superseded: the enum ships in Task 4 now.

## Stale / self-resolving

- **M-17 ("Phase 1" coinage)** — title and scope paragraph rewritten to "build steps 1–2".
- **M-04 (homoglyph contradiction)** — resolved by implementing the cheap normalized-username
  check in Task 6, matching GAME.md's active list.
- Findings duplicated across audits (the -Infinity key, `.ts` extensions, missing `dispose`,
  Task 12's false FAIL, dir bounds, missing client vitest, whisper UI gap, starter-grant
  idempotency, `furni_moved`) were counted once and fixed once.
