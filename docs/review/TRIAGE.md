# Audit triage — disposition of all findings

Four audits, 2026-08-03: [economy-redteam.md](economy-redteam.md) (30), [completeness-audit.md](completeness-audit.md) (65),
[technical-audit.md](technical-audit.md) (39), [safety-audit.md](safety-audit.md) (28). 162 findings.

**Default disposition: ACCEPTED and integrated into GAME.md / PIPELINES.md as the auditors drafted
or with minor wording changes.** Only exceptions are listed below.

## Modified (accepted with a different fix than proposed)

- **R-08 / C-16 (recipe exclusivity)** — R-08 proposed a 90-day exclusive then open-with-royalty.
  Adopted C-16's simpler rule instead: first mint owns the recipe permanently, plus supply windows
  (C-8), mint rate limits, and minimum parameter distance. One rule set, no royalty bookkeeping.
- **B4 (mirroring vs light direction)** — auditor offered flat-shading or per-part flags. Adopted
  a third resolution: above-front (vertically symmetric) light direction, making mirroring
  shading-safe by construction, with per-part non-mirrorable opt-out.
- **S4 Tier 0 (opening hours)** — adopted, with hours kept generous enough for the co-working
  daytime use case. 24/7 is a scale milestone.
- **E2/S11 (image screening)** — adopted the honest version: curated part library is the gate for
  composed furni, curated pattern sets + geometry check for procedural classes, human review for
  flagged names/sprites. General image classification dropped as the stated mechanism.
- **C-12 (design pricing)** — creator-set within an archetype-derived band, ceiling relative to
  mint fee. Cut fixed at 30% launch (low end per R-05/C-10).

## Rejected

- **R-19's implicit option to sanction side-betting** — not taken; side bets remain banned, with
  the auditor's detection query adopted for enforcement against organizers at scale.
- **Completeness 12's exact ceiling formula (N × mint fee)** — band concept adopted, formula left
  to tuning.

## Stale (superseded by grill-session decisions made while audits ran)

- **C-30 / C-55 (pets and NPCs absent)** — both added in the grill session before audits landed.
- **C-65 / R-25 partial (chance-payout non-goal wording)** — the Casino decision restructured
  this; the surviving parts (published odds, LTD per-account caps, inert chance furni) are
  integrated.
- **S1's "pick an option"** — audience was decided 18+ mid-audit; S1's evidence forced the upgrade
  from self-declared to vendor-enforced age estimation. Treated as accepted, not stale, in effect.
- **Open-question findings about the high-value sink** — decided (Museum, prestige untradables,
  Luck Lever) during the grill; audit arguments confirmed the choice.

## Deferred (recorded, not yet integrated as spec)

- **S28 (trade age-banding)** — moot at enforced 18+; becomes mandatory if audience ever widens.
  Recorded in the decision log as a condition on any audience change.
- **C-45 (which zoom scale ships v1)** — deferred to the implementation plan.
- **C-46/C-58..64 minor spec sentences** — the specific numbers land with the implementation
  plan's acceptance criteria; the mechanisms are now stated in GAME.md.
- **H2's RPO/RTO numbers** — the rule (stated targets + scheduled restore drills) is in
  PIPELINES §5; the numbers belong to the ops plan.

## Citation corrections applied (completeness §I)

- C-48: display-slot scarcity now cites Habbo §1.8 only, with Coke Music noted as the
  counter-example.
- C-49: Key Quest queue-fullness causal claim replaced with the design-choice statement.
- C-50: IMVU-as-longevity-proof replaced by the genre survey's cross-game UGC finding
  (Everskies/Pixel Worlds are the no-cash-out analogues).
