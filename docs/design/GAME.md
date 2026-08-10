# Game Design — The Grand

An isometric hotel world in the Habbo / Coke Music lineage. Claims of the form "X worked in game
Y" trace to [docs/research/](../research/00-synthesis.md). This revision integrates the four
adversarial audits in [docs/review/](../review/) — disposition of every finding is in
[review/TRIAGE.md](../review/TRIAGE.md).

Status: post-audit draft. Placeholder numbers are marked (tune) but every number now exists.

## Vision

**A casino resort for adults — resort first, casino floor as the crown jewel.** Every player gets
a suite to decorate and a stage to be judged on. All currency is earned in play — none is sold,
ever. Players earn by making things other players rate (songs, furni designs, outfits, suites), by
playing official minigames together, and on the casino floor against the house. They spend on
furni, clothing, and pet cosmetics drawn from a procedurally generated catalog that never runs dry
of new designs. The best player-made designs enter the catalog and pay their creators. Status
lives in suites, where visitors can see it.

The resort is also a **third place**: somewhere to sit with a coffee and half-work, half-hang out.
Ambient co-presence — being visibly together without conversational obligation — is a first-class
use case, not a byproduct.

**Theme hierarchy rule:** the casino is a venue inside the resort, never the economy's center of
gravity. Gambling became Habbo's demand floor and its removal crashed the economy (Habbo §3.3) —
the stake caps exist so ours can never grow that dependent. The creation and social loops stay the
primary faucets. The lounge-residency fiction upgrades the music loop: performing is a show on the
floor, charts are the billboard.

## Pillars

1. **Rooms, not a world.** No overworld. A Navigator lists rooms. Room owners hold kick/ban/mute
   rights **as a nuisance control — owner powers are not a safety mechanism** (the owner is
   sometimes the threat, see Safety). Staff moderation is the safety layer. (Habbo §2.1, audit S3)
2. **All currency is earned. Direct transfer of currency does not exist.** Stars do move between
   accounts through the marketplace and stall sales — both server-adjudicated and taxed — so the
   defense is not "bound currency" alone: it is the global earn ceiling, transfer caps, the
   commission curve, and a unified Star-and-item ledger watching the counterparty graph. (audit
   R-01, C-3)
3. **Many faucets, all official.** Creation votes are one path. Minigames another. Dailies a third.
   The server adjudicates every payout — no player-run wagering, ever. (Habbo §3.3)
4. **Constrained creation beats a blank canvas.** Generators expose curated parameter spaces, not
   free pixels. (Coke §6.3)
5. **Status must be walkable.** Trophies are furni, engraved, and **account-bound — trophies never
   trade** (a tradeable trophy is laundering inventory, audit R-23). Display slots are scarce
   (Habbo §1.8 badge cap — Coke Music had no display cap and grew hoard rooms, the
   counter-example).
6. **Fun first — integrity always.** This is a hobby prototype: moderation and legal machinery
   are parked in [SAFETY-LEGAL-PARKED.md](SAFETY-LEGAL-PARKED.md) and never drive design. What
   stays active is game *integrity* — anti-cheat, anti-dupe, anti-farm — because a rigged economy
   is an unfun economy.

Programmable rooms (a Wired-class system) are phased and demand-gated (decided 2026-08-04):
Phase A is the three hand-built room game sets (#205). Phase B "Wired Lite" — trigger→effect
pairs, no variables — comes no earlier than build step 9, on the event-bus substrate the room
server carries from the start (PIPELINES §5). Phase C (conditions, selectors, scoped variables)
only if Phase B shows sustained use. Permanent exclusions at every phase: wired never mutates
Stars, items, or inventories, never acts across rooms, never speaks as a player, never grants
room rights — a programmable room that can move items is a player-run wagering machine (R-26).

## Core loops

**Session:** log in → daily ritual → play or perform or hang out → earn → spend → decorate →
show off → friends visit.

**Creation:** make (constrained tool) → publish or perform → peers judge → creator paid and
ranked → goods circulate by trade → charts and trophies feed status.

**Minigame:** queue in a game hall → play an official game → capped payout plus ladder points →
trophies for seasons and firsts.

## Currency — Stars

One currency. No direct gift, drop, or trade of Stars exists. Stars are never sold for money.

### The global ceiling

A single account earns at most **600 Stars per rolling 24 hours (tune) across all faucets
combined**. Per-faucet caps are subordinate — at the global ceiling every faucet pays zero.
Creation faucets can reach 100% of the ceiling. The arcade tier is sized to reach at most 40% of
it, so creating always out-earns grinding. This one rule keeps the faucet table below from
compounding as the game catalog grows. (audit R-04, C-1)

### Faucets

| Faucet | Payout | Cap | Notes |
|---|---|---|---|
| Votes on performances and designs | 5 per vote, decaying per relationship | 350/day (tune) | See Vote integrity |
| Solo arcade | score ÷ per-game ratio, 1,000/play cap | 3 scored plays/game/day, 240/day arcade total (tune) | Ratios rebalance monthly |
| Multiplayer games | per-match, win and participation | 200/day shared across tactics and deduction (tune) | Server-adjudicated |
| Dailies | ~100/day total (tune) | hard | Ritual, not income. Streak bonus scales small |
| NPC staff | rituals + performance tips, flat amounts | 50/day (tune) | Server-triggered, never LLM-decided, zero chart credit |
| Pet care | small bonus for a happy pet | 20/day (tune) | Light care, no decay punishment |
| Achievements | one-time grants | 5,000 lifetime across the set, published (tune) | Badge + Stars |
| Competitions | weekly pool, 3,000 split 50/30/20 (tune) | weekly | Navigator placement is the real prize |
| Registration | starter furni + 100 Stars trickled over first 7 days (tune) | once | Never a day-one lump — a fresh alt is worth nothing on day one (audit R-10, S19) |

### Vote integrity

The Coke Music rule — one vote per player per creation, ever — is necessary but not sufficient:
creations are free to manufacture, so the cap must sit on the **relationship**. (audit R-03)

- Vote k from the same voter to the same **creator** pays `5 / k`, and pays zero beyond k = 3 per
  rolling 30 days. Chart credit is unaffected, so Free Greens rooms survive as the social on-ramp
  and stop being a mint. (audit R-13)
- Votes cast are capped per account per day (100, tune).
- A performance vote requires server-verified presence for the full song. A design, outfit, or
  room vote requires encountering the creation **in place** — the design standing in a room, the
  outfit on an avatar present in the room, the room by standing in it 60 seconds. No voting from
  catalog or stall pages. (audit C-4)
- A vote on a displayed design pays the **displaying player** and credits the **creator** on the
  charts — the music split, for the same reason: it makes designs circulate. (audit C-15)
- Chart credit is normalized by **distinct voters**, with per-performer daily credit caps toward
  any one creator — a 40-room CD ring outruns nobody. (audit R-12)

### Price ladder (all tune)

| Tier | Example | Price |
|---|---|---|
| Consumable | blank CD 10-pack | 50 |
| Entry furni | stool, plant | 25 |
| Median furni | sofa, table | 150 |
| Room surface | wallpaper or flooring, per room | 500 each |
| Mint fee | publish one design | 300 |
| Flagship | best catalog item | 3,300 (≈ 5.5 × the daily ceiling, Coke Music's ratio) |

### Sinks

- Catalog purchases (the main sink).
- Minting fees (see Design minting).
- Wallpaper and flooring are consumed on room deletion. No refunds anywhere. (Coke §2.4)
- Limited editions: serial-numbered, capped supply, random serials, **per-account purchase cap per
  release** so serial farming is not worth the capital. (Habbo §3.2, audit R-25)
- Marketplace commission (progressive, published bands: 5% below 500, 10% to 5,000, 20% above,
  minimum 1 — all tune, changed only on the monthly rebalance date). (audit C-11)
- Room promotion slots — purchasable **by the room owner only**, capped per room per day.
  (audit R-29)
- **The Casino** — house-banked, net drain via house edge. See Official minigames.
- **The Museum wing** — donate rares for permanent public exhibition with engraved donor plaques.
  Shipped (#210): room 3, plinth row against the back wall, plaque behind each exhibit. An *item*
  sink — the piece is bound and locked forever — which drains Stars because the donor buys another.
- **Prestige untradables** — extreme-priced account-bound penthouse fixtures. (Neopets §2) Shipped
  (#210): billiards table 3,300, candelabra 1,800, both minted account-bound.
- **The Luck Lever** — 100/pull, tiny odds of exclusives, **odds published** (Decibel's practice).
  Shipped (#210). The published odds and the draw are one table (`shared/lever.ts`), so they cannot
  drift. ~28% expected return, 38% win rate, two lever-only prizes. The first repeatable sink:
  everything else in the economy is bought out once, so this is what keeps absorbing afterwards.
- **Drinks at the bar** — 1 Star each, no mint (Coke Music's virtual Cokes). Shipped (#326): the
  `use` verb on a bar counter debits the Star, the avatar carries the drink two minutes and it
  evaporates — nothing enters the item economy. The second repeatable sink, priced as a prop so
  ordering one is a social gesture, not a spend decision.

### Transfer limits (the actual wall)

- Every account has a rolling **7-day net outbound value budget** — the catalog value of goods it
  may hand out net of receipts — low at creation, rising with tenure and non-farmable milestones.
  Enforced at the ledger across trades, marketplace, stalls, and gifts together. (audit R-01)
  Shipped (#237, `server/limits.ts`): 150 at creation, +100 per day of tenure, capped at 4,200 —
  7 × the daily earn ceiling, the most an account could have legitimately earned in the window.
  The milestone term is deliberately absent: the only milestone that exists is a collection-set
  badge, which is bought with Stars and so is farmable by exactly the pod this wall is for.
- Catalog furni is **bind-on-purchase for 72 hours** — costs a real player nothing, forces a
  laundering pod to carry three days of inventory risk. Shipped (#237): `furni_items.bind_until`,
  set by every Stars-spending mint, refused by `settleTrade`. Granted items have no clock.
- Per-pair flow is watched: the ledger's standing queries are (1) net value flow per account pair
  per 7 days, (2) accounts whose outbound value exceeds inbound plus own earnings, (3) trade-graph
  components whose internal volume exceeds external. (audit R-02) Shipped (#237): all three under
  `collusion` on /api/metrics, which is staff-only (#226). Each read of the page is their run.
- Anomaly triggers **freeze the receiving balance**, not the account, and open a review ticket.
  (audit C-14) **Not built** — there is no review-ticket system and no frozen state to put a
  balance in, so the queries above surface pods to a human and stop there (#308).

### Alt strategy

Detection is secondary — alts are made **worthless** instead: no day-one grant, the global earn
ceiling, transfer budgets, and vote decay. One expensive-to-fake signal on top: **first-trade
qualification** — an account may not trade until it has received votes from N distinct accounts
that are themselves qualified. A pod cannot manufacture a real social graph. (audit R-11)

Collusion warning stands: audit every faucet for "can a group manufacture or transfer value."
Neopets' stock market fell to coordinated guilds. (Neopets §2)

## Trade and marketplace

- **Trade window:** both sides preview every item full-size with name and provenance, 3-second
  delay after both accept, cancellable throughout, any change resets both accepts. Max 8 items per
  side (tune) — Coke Music's 6-item cap was its documented exploit surface, ours is explicit.
- **Provenance is always visible:** origin (official or player-minted), creator, mint date, serial.
  When an offered item is a near-match of a high-value item, the confirm step says so explicitly.
  (anti-counterfeit, audit R-07)
- **One-sided trades warn loudly:** "You are giving 12 items and receiving nothing. Staff cannot
  recover items you give away." Then the sanctioned alternative: **lending mode**, a server-enforced
  return timer that reverts ownership automatically — the most common scam pretext becomes a safe
  feature. (audit R-17)
- **Gifting** is a one-sided trade with the same confirm flow, counted against the same transfer
  budgets. (audit C-29)
- **Marketplace:** listings are server escrow (item leaves inventory at list time). Purchase is one
  ledger transaction — the loser of a race sees "already sold," charged nothing. Price display is a
  **volume-weighted median** over the 7-day window, requiring 5 distinct counterparty pairs or it
  shows "not enough trades," outliers beyond 3× median dropped, sample size shown. Listing takes a
  small deposit, refunded on sale, forfeited on cancellation. New listings become visible after a
  short randomized delay (anti-sniping). Book depth is visible. Active listings per account per
  item are capped. (audit R-06, R-18, C-24)
- **Player-run wagering stays banned.** The Casino is the sanctioned outlet, house-banked only.
  Chance-themed furni is **inert** — it animates but never emits a readable outcome, so there is
  nothing to settle a bet against. (audit R-26) Side bets settled through trades will happen
  anyway: the ledger's standing query for them is one-sided transfers clustering right after match
  results between accounts that shared a room or lobby. Enforcement targets organizers at scale,
  not two friends. (audit R-19)
- **Account recovery:** trading locks for 24 hours after a password or email change. Trades above
  a value threshold require a second factor. Confirmed compromises reverse item transfers within a
  bounded window — the ownership history exists for exactly this. (audit R-20)
- Cosmetics are economy goods: avatar clothing and pet cosmetics trade like furni, with withdrawn
  lines and serial LEs. Pets themselves are account-bound.

## Earning paths

### Music (one path among several)

Coke Music's loop, kept nearly verbatim: 5-track step sequencer over curated sample banks, fixed
~60-second songs, burn to CD, perform on public stages, thumbs up/down, crowd-reaction stings
bucketed by net score, Top 40 daily / weekly / monthly, engraved Gold and Platinum Records.
Performer earns the Stars, creator earns the chart credit. Specifics the audits forced:

- New accounts get 10 blank CDs. More cost 50 Stars per 10. Performing does not consume the CD.
- Votes are accepted from the first bar to five seconds after the last, then the sting plays.
- Late joiners hear the song from the current offset and may vote.
- If the performer disconnects the server finishes the song, cast votes stand, chart credit and
  Stars pay in full, the queue advances at the song's scheduled end. (audit C-18)
- **Queue cooldown:** after performing, a player cannot rejoin that stage's queue until 15 minutes
  or 5 other performances pass (tune). The room owner holds a queue-kick right. (audit R-21)
- The next performer **teleports** to the stage, and stage tiles are walkable only by the current
  performer — stage blocking (Coke Music's unsolved griefing bug) cannot exist. (audit R-28, C-19)

### Design minting (the procedural front-end)

The player explores the constrained generator, previews in-room at both scales, and pays the mint
fee to publish. Rules:

- **A recipe is claimed by its first mint, permanently.** A duplicate recipe hash rejects with a
  full refund. Mints require a minimum parameter distance from existing designs (feeds the
  counterfeit gate). Mint rate: 5 per account per day (tune). (audit R-08, C-16)
- **Supply is windowed:** a minted design sells for 30 days or 500 copies (tune), whichever first,
  then is withdrawn permanently — never re-mintable by anyone. Variety is infinite. Supply of any
  one design is not. This is what keeps scarcity, rares, and the LTD sink meaningful against a
  never-dry catalog. (audit C-8)
- Creator sets the price within a band derived from archetype and part count. **Creator cut: 30%
  at launch** (decided — below 50% the mint path is a net sink). A single buyer delivers at most
  500 Stars of cut to a single creator per 30 days — excess routes to the sink, buyer still gets
  the item, launderer gets nothing. (audit R-05, C-10, C-12)
- A **stall** is a page in the catalog service, not a room: every player has one, free, up to 20
  live designs (tune), reachable from the catalog, the charts, and any placed instance.
- Design charts rank by **net votes in the window**, not sales. Ties break to the earlier mint.
- **Recall path exists:** a design found offensive after sale is delisted, every instance destroyed
  by item ID, holders refunded by compensating ledger entry, chart credit and trophies from it
  revoked. (audit S14)
- Rejection economics: automated-gate rejections refund in full, instantly. Rejections at human
  review forfeit the whole fee and add a strike — flooding the moderation queue is never cheap.
  Per-account rejection rate raises fees and lowers rate limits. No auto-approve on queue timeout,
  ever. (audit R-22, S13)

### Room competitions

Weekly themed contest. Prizes: featured Navigator placement, engraved trophy, badge, share of the
weekly pool. **All three placements** sit out — 1 week after a first win, 4 after a second, 12
after a third. A fixed share of featured slots is reserved for rooms that never placed. If judging
is player-voted, voters must have visited the room, and votes from accounts sharing a device
cluster or trade-graph component with the entrant are dropped. (audit R-14, C-61)

### Official minigames

- **Server-authoritative — and bot-aware.** Server authority kills fabricated scores, not bots
  that play well. Every scored play keeps its input trace: traces cluster per account and across
  accounts (sub-human reaction latency, zero variance, shared traces = bot). Per-game plausibility
  ceilings and public leaderboards stay as cheap backstops. Server-side timing jitter desyncs
  replays. (audit R-09)
- **In-world:** game halls are staff-owned official rooms (kick/mute in them is staff-only). The
  formula: spectating + queues and skill tiers + visible ranked ladder + trophies. Spectators see
  only public state, cannot chat into a match, earn nothing, capped per table. (Neopets §6, C-27,
  C-34)
- **Forfeit and disconnect rules per tier, concretely:** every game ships its reconnect window,
  AFK forfeit timer, and abandonment settlement (leaver gets nothing, remaining players settle
  fairly). Deduction lobbies fill to 8 minimum or cancel at start, no penalty. A mid-round leaver
  is replaced by a server stand-in, role hidden until normal reveal, no participation payout.
  (audit C-32)
- **Anti-win-trading:** Stars pay for at most the first 2 matches against a given opponent per day.
  Minimum match length and meaningful-action count qualify a match. Season trophies require a
  minimum distinct-opponent count. Resignation-timing and move-quality-collapse detection run on
  the match logs the server already has. (audit R-15)
- **Everyone gets paid, winners more** — participation contingent on qualifying actions, so a
  random-walking bot earns zero. (audit R-16)
- Tier 1 *Solo arcade*: score ÷ ratio, 1,000/play, 3 plays/game/day, 240/day arcade total. Monthly
  rebalance on a fixed published date targets: median Stars/minute across the arcade within ±10%
  of the vote faucet's rate. Monthly top-17 trophies (gold 1–3, silver 4–8, bronze 9–17), and the
  **exceptional-eight rule** for games with a reachable max score — hitting the true max is
  automatic gold. Trophies permanent, upgrade-only. (Neopets §1, audit C-33, C-51)
- Tier 2 *Turn-based tactics*: live 1v1 at tables, ranked seasons, monthly brackets.
- Tier 3 *Social deduction*: scheduled lobbies of 8–12, roles server-dealt. **No group queueing** —
  server-shuffled lobbies, max 2 accounts that recently shared a lobby. **Inside a lobby: no
  trade, no gifting, no friend requests, no whisper, per-match display names.** If items cannot
  move and contacts cannot form mid-match, the role cannot be cashed in ("the werewolf told me to
  give him my items"). Post-match friend-request cooldown between participants. Lobby chat is a
  separately classified moderation channel — a lying game breaks general-chat classifiers.
  Moderator tools show role assignments. Entry requires account standing — never the default place
  a new account meets strangers. No precedent exists for an official hidden-role game: prototype
  the moderation with the game. (audit R-16, S20, S21, S27)

### The casino floor (official, house-banked)

The resort's headline public space and the density funnel's anchor venue — designed in from day
one. The Habbo lesson: gambling was the genre's highest-engagement gathering reason, and the
damage came from player-run scam casinos and from amputating gambling after the economy grew
dependent. (Habbo §3.3)

- **House-banked only.** Every bet is player vs house. Stars never move between players through
  the Casino — losing on purpose to an alt is impossible.
- Wheel, dice, and card tables in a Casino wing — a social venue with seats, a bar, NPC dealers.
- **Odds published to players.** Auditable RNG. Every stake and payout through the ledger.
- **Daily stake cap** (500, tune) bounds individual loss and economy dependence.
- Player-run banking stays banned. 18+ enforced audience makes this coherent. Flag: any future
  real-money monetization triggers legal re-review of the Casino first.

### Dailies

Capped and small: café coffee served by the barista NPC (10 Stars, 10/day), a daily spin (odds
published), seasonal calendars. A modest streak bonus scales with consecutive days (tune) —
streaks are the genre's cheapest retention hook and were missing. (audit C-54) Timed free furni
drops during events — they raise trading activity, not just logins. (Habbo §2.6)

## Liveness — the density funnel, NPC staff, and low population

**Density funnel.** At low population the Navigator concentrates everyone: the casino floor as
the anchor space, one café, one lounge stage. Spaces unlock as concurrency grows, re-lock as it
falls.

**Low-population mode** (audit C-7): below 5 concurrent (tune), Navigator categories collapse to one
list, deduction drops to one nightly slot, the café doubles vote payouts as the designed
concentration point (Coke's Red Room). Charts publish with however many entries exist. The arcade
and dailies are the two faucets that must work with one player online, and the catalog stays
affordable on those two alone.

**NPC hotel staff.** Bellhops, baristas, a lounge act — LLM-driven on small local or cheap cloud
models. Guardrails, all hard:

- **The LLM never decides payouts.** Every NPC Star grant is a deterministic server trigger, flat
  amount, hard daily cap. Assume prompt injection from day one.
- **NPC tips never count toward charts.**
- NPCs are visibly staff — name tags, uniforms, badge. Never pass as players.
- NPC output passes the player chat filter plus an outbound screen.
- NPC faucets: fixed rituals (barista coffee, bellhop welcome quest) plus flat tips to performers
  so an empty-room set still pays something.

## Pets

Companions with light care. A second full cosmetic surface.

- Pets follow, sit, sleep, react to speakers, idle charmingly. Room actors, visitors can pet them.
- **Pet cosmetics are tradeable goods**, same rules as clothing. Pets are adopted, account-bound.
- Light care: happiness fed by occasional feeding and play. High happiness pays a small capped
  daily bonus and unlocks tricks. **No decay punishment** — a neglected pet sleeps, never suffers.
- Species, colors, patterns come from the procedural pipeline. Rare species are status.

## Rooms and social

- **Rooms:** free to create, 6 per account (tune), stock layouts at start, ~100 furni per room
  (tune), locked / password / invite-only states — with the safety bounds in §Safety.
  **Capacity: 25 occupants (tune), one live instance per room, never mirrored** — full rooms
  redirect in the Navigator. The density funnel concentrates; splitting instances would fight it.
- **Room lifecycle:** instances load on first entry, unload minutes after the last occupant
  leaves, furni state persists on every change. Owner presence is not required for entry.
  **Deleting a room returns all furni to inventory** and destroys only wallpaper/flooring (the
  full Coke rule, both halves). Deletion is refused while any contained item is trade-pending or
  listed. (audit C-22, C-26)
- **Inventory:** one per account, 600 items (tune), paginated, sortable by date, type, name. Items
  preview properly — including wallpaper color and teleporter pairing, Coke Music's two documented
  backpack failures. Acquisition is full-stop: a purchase or trade that would exceed capacity
  fails before it commits. (audit C-5)
- **Room games v1:** with Wired deferred, three hand-built room game furni sets with fixed
  server-side rules ship in v1 — falling furni, a maze gate set, red-light/green-light — so rooms
  have a use beyond decoration. (audit C-28)
- **Navigator:** categories, busiest list, search, featured rotation, competition placements.
- **Chat:** Speak carries 5 tiles then fades to dots. Shout reaches the room, socially costly.
  Whisper is private (moderation posture in §Safety). Bubble color derives from the outfit.
- **Friends console:** room-independent messaging, online status. Friends cap 300 (tune). Friend
  requests rate-limited.
- **Groups:** player-made, home room, custom badge **from a curated symbol set with recoloring —
  not a free pixel editor** (a badge follows its wearer everywhere, audit S8). Group creation
  costs Stars. Ownership transfers to the longest-tenured member if the owner is banned or lapses.
- **Badges:** display capped at 5 + 1 group badge.
- **Emotes:** wave, laugh, cry, dance, sign, sleep, plus the focus props — surfaced as a UI
  palette and chat commands. (audit C-57)
- **Idle honesty:** avatars sleep after 5 minutes, turn their head toward speakers.

### Ambient co-presence (the co-working layer)

- **Focus state:** sit with a laptop, book, or sketchpad prop, visible do-not-disturb bubble.
  Focused players don't idle-sleep. Whispers still land, room chat softens.
- **Focus rooms:** café and library spaces tuned for lurking — short Speak radius, no Shout, lo-fi
  stage sets.
- Presence lists show "around" vs "chatting" without shaming lurkers.
- Later, if the habit forms: shared pomodoro furni and focus streaks. Not v1.

## Status systems

- Engraved trophies (date, username, deed) — **account-bound, never tradeable, upgrade-only.**
- Serial-numbered LEs with random serials and per-account purchase caps.
- Charts: Top 40 per creation domain. Reset 00:00 UTC daily, Monday weekly, the 1st monthly.
- Badges and infostand motto.
- **Collection sets:** catalog lines ship as named sets with progress counts. Completing one mints
  a set badge and a set-only furni piece — completion, not progression, is what players chase
  (Zynga FDG 2012, audit C-52). Shipped (#210): café, casino floor, gallery. Nothing pays out along
  the way, and the badge row is the idempotence key so a set can only ever be claimed once.

## First session (onboarding)

- 0:00 — Registration grants a default outfit, 10 blank CDs, and **a room already created** with a
  stock layout and starter furni placed. Nobody faces an empty room. Stars trickle over the first
  week, not at signup.
- 0:01 — Spawn is the lobby café, not the private room. Day one starts where people are. The
  bellhop NPC greets by name and hands the welcome quest.
- 0:02 — First daily: the coffee. One click, 10 Stars.
- 0:05 — Guided first catalog purchase and first placement in the room.
- 0:10 — Routed to a game hall with a joinable queue and a first arcade payout.
- First 24 hours: earned from two faucets, placed furni, been in a room with strangers.
- New accounts start with restricted surfaces — no whisper, no DMs, no invite-only rooms, no
  trade — until tenure and activity thresholds clear (7 days, tune). One control, three problems:
  grooming surface, ban evasion, alt farming. (audit S2, S19)

## Safety posture (prototype)

Full safety and legal design is **parked, not deleted**: [SAFETY-LEGAL-PARKED.md](SAFETY-LEGAL-PARKED.md)
holds the complete register from the trust-and-safety audit, with reopen triggers. Active in the
prototype, kept because it is cheap and flavor-positive:

- 18+ by self-declaration at signup. (Enforced age assurance is the first parked item to lift.)
- A basic word filter on chat and names ("blah"-style substitution — genre flavor as much as
  safety). Usernames permanent, near-miss similarity rejected (impersonation is a scam vector).
- Ignore hides content from the ignorer's view only, and inside ranked matches and deduction
  lobbies it suppresses chat but leaves game actions visible (game-integrity rule).
- Room owner kick/ban/mute as a nuisance control.
- Ban semantics stay specified because they are economy data-model rules: on ban, Stars burn,
  listings cancel to frozen inventory, settled transfers to other players stay valid, the ledger
  never rewrites history, trophies keep engravings. (audit C-9)
- New-account surface restrictions (whisper/DM/trade gating) exist as tunables, **set to
  off/near-zero for the prototype** — they matter for alt-farming at scale, not for friends.

## Non-goals for v1

- **Real-money purchases of any kind — and under the casino theme this is close to permanent, not
  just v1.** A casino-themed product that sells currency walks into social-casino law: the Big
  Fish Casino cases held virtual chips to be "things of value" under state gambling law even with
  no cash-out [verify with counsel before ever revisiting]. Earned-only currency with zero
  purchase path is what makes a casino theme legally boring. If monetization is ever wanted, the
  only researched patterns that might survive review are Neopets Premium (frequency multipliers,
  no exclusive content, no currency) and Habbo Builders Club (rented non-tradeable creative
  tools) — and either triggers full legal review of the casino floor first.
- Player-staked wagering of any kind. Server-run chance with published odds is in scope (the
  Casino, the daily spin, random LTD serials — all publish their odds). (audit C-65)
- Free-form room scripting (architecture reserved — see PIPELINES §5).
- Mobile client. (Also defers US state app-store age laws — logged as a v2 gate.)
- Web3 anything.
- **Decaying assets.** Loss-aversion decay conflicts with rooms as permanent status display. The
  daily ritual and streaks carry the return habit instead — a deliberate divergence from the genre
  synthesis. (audit C-53)

## Decided

See [docs/decisions/INDEX.md](../decisions/INDEX.md). Audience 18+ **enforced by age estimation**
(parked with the safety register), hangout core first, ambient co-presence v1, density funnel +
NPC staff, pets with light care, tradeable cosmetics with rare tiers, sinks (Museum, prestige
untradables, Luck Lever), house-banked Casino, creator cut 30%, trophies account-bound, global
daily earn ceiling, registration grant as furni + trickle. Added 2026-08-04: room capacity 25,
names "The Grand"/"Stars" permanent for the prototype, Wired phased and demand-gated, art path
3D-assisted at 64 scale ([ART-DIRECTION.md](ART-DIRECTION.md)), NPC model gemma3:4b local,
tunables pinned v1 ([ROADMAP.md](ROADMAP.md)).

## Open questions

None. The post-audit draft carried four — all resolved 2026-08-04 (decision log):

1. Room capacity → 25 per room, one instance, never mirrored. Per-process count is a measurement.
2. Wired scope and timing → phased and demand-gated, permanent economy exclusions (§Pillars).
3. Naming → "The Grand" and "Stars" stand. Trademark clearance parked as a launch gate.
4. Moderation staffing quote → re-homed to SAFETY-LEGAL-PARKED.md as the first reopen action.
