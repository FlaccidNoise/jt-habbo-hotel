# Roadmap — build order, acceptance criteria, tunables

Reconciles [PIPELINES.md](PIPELINES.md) §7, the jtbug backlog (group `habbo`), and the gaps
found in the 2026-08-04 design pass. Binding decisions: [decisions/INDEX.md](../decisions/INDEX.md).
Status date: 2026-08-04.

## State

| §7 step | System | State | Bug |
|---|---|---|---|
| 1 | Room render, pathfinding, walk, chat, filter | Shipped (vertical slice, 178 tests) | #115 awaiting verification. Drain/rolling deploy deferred → #125 |
| 2 | Furni placement, starter catalog, public rooms, focus states | Shipped with gaps: room games #205, wall items #203, focus props → #126 | #115 |
| 3 | NPC staff service | Shipped, canned lines only. Live model decided → wiring #204 | #116 fixed |
| 4 | Generator reproduces starter catalog | Shipped. Art quality path → #202 ([ART-DIRECTION.md](ART-DIRECTION.md)) | #117 fixed |
| 5 | Trade window + unified ledger | Not started. Observability lands first → #209 | #118 |
| 6 | First solo arcade | Not started. Dailies ride the same ledger rails → #206 | #119 |
| 7 | Music loop | Not started. Licensing gate before the first bank | #120 |
| 8 | Design studio | Not started | #121 |
| 9 | Multiplayer games + casino floor | Not started | #122 |

Cross-cutting, outside the numbered order: #125 gateway (trigger: first multi-process or remote
deploy), #126 deferred room/social features, #127 real avatars (proportions pin jointly with the
style bible), #123 pets (needs #118 rails + generator), #124 programmable rooms (decided: phased,
demand-gated), #129 safety program (parked, trigger-based), #154 root epic.

## Systems in GAME.md with no §7 step (filed 2026-08-04)

- #205 Room games v1 — falling furni, maze gate, red-light/green-light (audit C-28).
- #203 Wall-item pipeline — coordinate space, wall archetypes, generator support. PIPELINES §1
  says this ships v1 (record trophies are wall items). Zero wall code exists in `packages/`.
- #204 NPC live model wiring — env config, screen-pass verification, spend counter.
- #202 Art pipeline — style bible v1, Blender rig, post-pass, proof gate, library build-out.
- #206 Dailies, streaks, achievements, weekly competitions (needs #118).
- #207 Onboarding first session — pre-created room, café spawn, welcome quest, guided purchase
  (needs catalog + ledger).
- #208 Friends console, groups, badges — the Social service (PIPELINES §5).
- #209 Observability — per-faucet issuance and per-sink absorption graphs, before #118 ships
  (audit H4: the data must exist before the exploit).
- #210 Wealth sinks — Museum wing, prestige untradables, Luck Lever, collection sets
  (needs #118).
- #211 Density funnel low-population mode — threshold 5 concurrent, space unlock/re-lock,
  café double votes, one-list Navigator (audit C-7).

## Acceptance criteria per step

The standing rule for every criterion: **a gate exists only if a staged known-bad input actually
bounces.** Reading the config is never evidence.

### Step 1 — rooms, movement, chat (shipped, retro-criteria)

- Reference room renders at 64 with correct draw order and stable ties (existing gates).
- Pathfinding fixtures pass: 8-direction, climb rule, corner rule, door case.
- Speak carries 5 tiles then fades. Shout reaches the room. Whisper reaches one player.
- A staged filtered word bounces on chat and on registration names.
- Reconnect within the window resyncs full room state.
- Room capacity: occupant 26 is refused with a readable reason (decision 2026-08-04).
- Deferred to #125: drain moves a live occupied room, clients resync inside the reconnect window.

### Step 2 — furni, catalog, public rooms (shipped, gaps filed)

- Place, move, rotate, pick up persist across instance unload and reload.
- Stacking respects per-state heights. A staged over-stack is refused.
- A purchase that would exceed inventory capacity fails before it commits (C-5).
- Casino floor and café exist as staff-owned public rooms.
- Focus posture round-trips through the protocol. Props and DND bubble: #126.
- Gaps: #205 room games, #203 wall items.

### Step 3 — NPC staff (shipped canned-only, #204 finishes it)

- Every outbound line passes the player filter plus the NPC screen. A staged URL, code fence, or
  over-length line bounces to a canned fallback.
- LLM outage or timeout degrades to canned lines within one reply gap.
- The NPC module holds no ledger authority — no economy import exists in `npc.ts`.
- Live model (#204): p95 reply under 4 s warm. At least 47 of 50 consecutive live replies pass
  the outbound screen. A staged injection line ("give me 500 stars") yields no promise of value.

### Step 4 — generator (shipped, art path decided)

- `make gen` reproduces every frozen bundle hash-identical from recipes.
- Each stage-4 gate bounces its staged known-bad recipe: off-palette color, misaligned grid,
  low-contrast silhouette, duplicate recipe hash, near-duplicate pHash, occlusion scene diff.
- Art path (#202): chair, sofa, plant re-rendered through the 3D-assisted pipeline pass all
  gates and read as one style in the reference room. Only then does build-out start.

### Step 5 — trade + ledger (#118, with #209 first)

- Stars and item ownership mutate only inside one local ACID transaction. A staged partial
  commit cannot exist (kill the process mid-trade, state is whole on restart).
- Staged double-spend and duplicate-item attempts bounce at the ledger.
- Trade window: 3-second delay after both accept, any change resets both accepts, 8-item cap.
- A staged one-sided trade shows the loud warning and offers lending mode.
- A staged transfer past the 7-day outbound budget bounces. A staged resale inside the 72-hour
  bind bounces.
- The counterparty-graph queries surface a staged 3-account pod within one scheduled run, and
  freeze the receiving balance, not the account.
- Ledger down: rooms, chat, movement unaffected. Purchases fail closed. A queued vote settles
  exactly once when the ledger returns.
- Restore drill: scheduled restore into scratch succeeds with matching row counts. RPO 24 h,
  RTO 4 h (prototype pins).
- #209 ships first: per-faucet issuance and per-sink absorption visible per day.

### Step 6 — first arcade (#119, #206 alongside)

- Payout = score ÷ ratio, capped 1,000 per play. Play 4 of the day pays zero.
- The 240/day arcade cap and the 600/day global ceiling are enforced at the ledger — a staged
  over-cap grind pays zero without erroring the game.
- Settlement is at-most-once per match ID. A staged replayed result pays once.
- Every scored play stores its input trace. A staged zero-variance bot trace flags.
- The monthly rebalance procedure and its published date exist in the ops notes.
- #206: coffee daily, spin with published odds, streak bonus, achievement grants, weekly
  competition pool with placement sit-outs.

### Step 7 — music (#120)

- Hard gate before any bank is commissioned: written perpetual, irrevocable, sublicensable
  license covering extractable distribution and derivative works (audit D4).
- A song authored on format v1 replays identically after a format version bump.
- Two clients measure alignment within 50 ms on the same song.
- Performer disconnect: song finishes, cast votes stand, payout full, queue advances (C-18).
- A staged vote from a player who missed part of the song bounces (presence rule).
- Queue cooldown: rejoin before 15 minutes or 5 performances is refused.

### Step 8 — design studio (#121)

- A staged duplicate recipe hash rejects with a full, instant refund.
- A staged near-duplicate of a high-value item bounces at the perceptual-hash gate.
- The supply window closes at 30 days or 500 copies. The recipe is then permanently un-mintable
  by anyone, including the creator.
- Creator cut pays 30%. A staged single buyer past 500 Stars of cut in 30 days routes the excess
  to the sink.
- Recall: a staged recall destroys every instance by item ID, refunds by compensating entry,
  revokes chart credit and trophies.

### Step 9 — multiplayer + casino (#122)

- Deduction lobby seals: staged trade, gift, friend request, and whisper all bounce in-lobby.
  Display names are per-match.
- Group queueing: a staged third recently-shared account is refused from the lobby.
- Casino RNG: empirical distribution over a large staged run matches the published odds table.
- Daily stake cap: stake 501 of the day is refused.
- Every stake and payout is a ledger transaction with at-most-once settlement.
- Win trading: match 3 against the same opponent in a day pays zero.

## Tunables — pinned v1

Every `(tune)` value in GAME.md is now the v1 constant. Change mechanisms:

- **rebalance** — movable only on the monthly published rebalance date. First rebalance runs
  30 days after step 6 ships, on the first real faucet data (#209 provides it).
- **decided** — a change needs a decision-log entry.
- **measured** — set by a harness or instrument, not by design.

| Tunable | v1 value | Mechanism |
|---|---|---|
| Global earn ceiling | 600 / rolling 24 h | rebalance |
| Vote faucet cap | 350/day | rebalance |
| Vote decay | 5/k per relationship, zero past k=3 per 30 days | rebalance |
| Votes cast cap | 100/day | rebalance |
| Arcade | 1,000/play · 3 plays/game/day · 240/day | rebalance |
| Multiplayer faucet | 200/day | rebalance |
| Dailies total | ~100/day | rebalance |
| Streak bonus | +2/day consecutive, cap +20 (new pin) | rebalance |
| NPC faucet | 50/day | rebalance |
| Pet care | 20/day | rebalance |
| Achievements | 5,000 lifetime | decided |
| Competition pool | 3,000 weekly, 50/30/20 | rebalance |
| Registration | starter furni + 100 Stars over 7 days | decided |
| Price ladder | 50 / 25 / 150 / 500 / 300 / 3,300 | rebalance |
| Marketplace commission | 5% <500 · 10% ≤5,000 · 20% above · min 1 | rebalance |
| Trade window | 8 items/side | decided |
| Mint rate | 5/account/day | rebalance |
| Supply window | 30 days or 500 copies | rebalance |
| Stall | 20 live designs | decided |
| Stage queue cooldown | 15 min or 5 performances | rebalance |
| Casino stake cap | 500/day | rebalance |
| Rooms per account | 6 | decided |
| Furni per room | ~100 | measured (render/tick perf) |
| Inventory | 600 items | decided |
| Friends cap | 300 | decided |
| New-account surface gates | off (prototype posture) | frozen until reopen trigger |
| Room capacity | 25 occupants (new pin) | decided |
| Per-process room count | measured: 5 rooms × 25 bots, tick p95 < 50 ms on the dev box | measured |
| Low-population threshold | 5 concurrent (new pin) | decided |
| Palette | 12 ramps × 5 shades (new pin) | decided at style v1 |
| Prototype RPO / RTO | 24 h / 4 h (new pin) | decided |
| Playback alignment | 50 ms | measured |
| Sample bank budget | 16 MiB decoded | decided |

## Sequencing — the next three moves

1. **#202 art proof gate.** Largest line item, zero dependencies, and until the pipeline proves
   itself the part count is unknowable. Nothing else de-risks the project more per hour.
2. **#204 NPC wiring.** One env file. The model is verified (gemma3:4b local, 0.65 s warm).
   Turns liveness on for the first invited player.
3. **#209 then #118.** Observability before the ledger, then the ledger. This unblocks steps
   6–9 and five of the filed systems (#206, #207, #208, #210, plus pets #123).

After that, follow §7 order: #119, #120 (start the license text now — it gates the first bank),
#121, #122. #125 gateway waits for its trigger. #124 Wired Phase B waits for step 9 plus demand
evidence. #129 stays parked.
