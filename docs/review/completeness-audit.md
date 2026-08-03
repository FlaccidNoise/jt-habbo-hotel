# Completeness audit — GAME.md and PIPELINES.md

Adversarial design audit, 2026-08-03. Scope: `docs/design/GAME.md` (238 lines) and
`docs/design/PIPELINES.md` (115 lines), checked against `docs/research/`.

Test applied to every paragraph: **could a competent team build this without coming back to ask
what was meant?**

Counts: **9 blocking, 33 major, 23 minor — 65 findings.**

Findings marked "load-bearing placeholder" are `(tune)` values or open questions that other
specified systems already depend on. Section J rolls those up.

---

## Summary table

| ID | Sev | Area | One line |
|---|---|---|---|
| 1 | blocking | Economy | No global daily Star ceiling. One arcade game out-earns the whole vote faucet 8.6×. |
| 2 | blocking | Economy | Zero prices exist in either doc. The first-week arc cannot be computed. |
| 3 | blocking | Economy | Marketplace and stalls move Stars player-to-player. "Currency is bound" is false as written. |
| 4 | blocking | Creation | Voting on designs, outfits and rooms has no surface, no rate limiter, no eligibility rule. |
| 5 | blocking | Items | No inventory system exists. Trade, room deletion and minting all depend on it. |
| 6 | blocking | Onboarding | Onboarding is absent. The research names it as a gap to fill deliberately. |
| 7 | blocking | Empty states | Every faucet but dailies needs an audience. Launch has none. |
| 8 | blocking | Economy | Minted-design supply is unbounded. That voids scarcity, rares and the LTD sink. |
| 9 | blocking | Safety | Ban consequences are undefined across items, listings, charts, trophies, rooms. |
| 10–39, 44, 52–53 | major | — | See section detail. |
| 40–43, 45–51, 54–65 | minor | — | See section detail. |

---

## A. Economy

### 1. BLOCKING — The faucet table has no global ceiling, and the arcade faucet dominates the creation faucet

**Doc:** GAME.md §Currency → Faucets, lines 56–68.

The table caps each faucet on its own. It states no per-account daily total. Read literally:

- Votes: 5 × 70 = **350/day**
- Dailies: **~100/day**
- Solo arcade: 1,000 per play × 3 plays per game per day = **3,000/day per game**
- Multiplayer: **undefined**
- Achievements, competitions: **uncapped / weekly**

With one arcade game the ceiling is 3,450/day. With three it is 9,450/day. Line 66 then says
"the daily ceiling is low" and cites Coke Music's 450/day. The doc's own numbers are 7× to 21×
that.

The structural problem is worse than the total. **A player who never creates anything out-earns a
full-time creator by 8.6× on one arcade game and 26× on three.** That inverts Pillar 2, Pillar 4,
and the synthesis thesis that the creation loop is the survival mechanism (00-synthesis.md §Thesis).

Root cause: the 1,000-per-play cap is imported from Neopets §1, where flagship sinks cost tens of
millions of NP. The 350/day cap is imported from Coke §2.1, where the flagship cost 2,500 dB. The
two numbers come from economies three orders of magnitude apart and are now in one currency.

**Builder's question:** "What is the maximum a single account can earn in 24 hours, and is voting
meant to be competitive with arcade play?"

**Add to §Currency:**
> A single account may earn at most **N Stars per rolling 24 hours** across all faucets combined.
> Per-faucet caps are subordinate to this total — when the global cap is reached, every faucet
> pays zero. The creation faucets (votes, minted-design sales) are sized to reach the global cap
> in a normal session. The arcade faucet is sized to reach at most 40% of it, so creating always
> pays better than grinding.

---

### 2. BLOCKING — No item costs anything. The registration grant cannot be tuned against nothing

**Doc:** GAME.md line 64 ("Registration | one-time (tune) | — | Enough to furnish a starter room
modestly"), §Sinks lines 70–78.

Neither doc contains a single Star price. Not for furni, wallpaper, flooring, blank CDs, mint
fees, room promotion slots, or the flagship item. §Sinks names six sink categories and prices
none of them. Coke §2.2 supplies a full price ladder (50 dB to 2,500 dB) and the design imports
none of it.

Consequences that cannot be resolved without prices: the registration grant, "modestly furnished",
"days of play" (line 66), the mint fee, the marketplace commission curve, and every acceptance
criterion for the catalog.

**Builder's question:** "How many Stars is a chair? How many is the best item in the game?"

**Add a subsection to §Currency:**
> ### Price ladder
> | Tier | Example | Price |
> |---|---|---|
> | Consumable | blank CD 10-pack | X |
> | Entry furni | stool, plant | X |
> | Median furni | sofa, table | X |
> | Room surface | wallpaper or flooring, per room | X |
> | Prestige | flagship catalog item | X |
> | Mint fee | publish one design | X |
>
> Registration grants enough for **one room surface plus six entry-tier items**. The flagship item
> costs **5.5 × the global daily ceiling**, matching Coke Music's ratio (Coke §2.1).

---

### 3. BLOCKING — The marketplace and player stalls transfer Stars between accounts, which contradicts the bound-currency pillar

**Doc:** GAME.md line 20–23 (Pillar 2), line 52, lines 76–77 (marketplace), lines 93–94 (Trade),
lines 113–119 (Design minting).

Pillar 2 and line 52 state that Stars are "bound to the account, never tradeable". Line 94 repeats
"Currency never does". Two specified systems then move Stars from one account to another:

1. **Marketplace.** A seller lists an item, a buyer pays Stars, the seller receives Stars minus
   commission.
2. **Player stalls.** A buyer pays Stars for a minted design, the creator takes a cut.

Both are Star transfer channels with a percentage haircut. An alt account can earn its 350/day and
push the balance to a main account by buying the main's overpriced listing. The commission is the
only friction, and it is unspecified (finding 11).

The precedents do not combine the way the doc assumes. Coke Music had **no marketplace and no
player storefronts** — decibels only ever came from the server, which is why the bound-currency
claim held (Coke §2.2, §2.3). Habbo's marketplace moved Credits, which were purchasable and
therefore already transferable (habbo §1.3, §1.5). The design takes Coke's bound currency and
Habbo's order book and inherits neither's safety property.

This also falsifies the anti-abuse argument on line 81–83 ("Vote-once-ever plus daily caps make
alt-farming slow, not impossible"). Alt farming is not slow when alt earnings consolidate at a
fixed percentage loss.

**Builder's question:** "Can Player A end the day with more Stars than they earned, because Player
B paid them? If yes, in what sense is the currency bound?"

**Add to §Currency, replacing the "never tradeable" claim:**
> Stars are bound in the sense that no direct gift, drop, or trade of Stars exists. Stars do move
> between accounts through the marketplace and through stall sales, both of which are
> server-adjudicated and taxed. Total Stars received from other players is capped at **N per
> account per rolling 7 days**, and receipts above that threshold hold in a review queue.
> Alt-consolidation defense rests on this cap and on the commission curve, not on
> vote-once-ever.

---

### 8. BLOCKING — Minted designs have unbounded supply, which destroys the scarcity every status system depends on

**Doc:** GAME.md line 13–14 ("a procedurally generated catalog that never runs dry"), lines
113–119, §Sinks line 75, Pillar 5 line 30–31.

Line 116 says the design "becomes a purchasable catalog item in the player's own stall". Nothing
states a supply cap, a sale window, or a per-buyer limit. Read as written, one mint fee creates an
infinite furni tap.

Three specified systems break under that:

- **Limited editions** (line 75) are "capped supply" in a world where everything else is
  uncapped. Their premium comes from relative scarcity, which no longer exists.
- **Pillar 5, "status must be walkable"** rests on scarce objects. Habbo §3.1 calls the withdrawn-
  furni secondary market "the deepest economic system in the game". A never-dry catalog has no
  withdrawals.
- **Habbo's decade-long lesson** (habbo §3.5): "earned currency must not manufacture tradeable
  assets at scale." Minting is exactly that mechanism, at scale, by construction. The doc cites
  Habbo elsewhere but does not address this.

**Builder's question:** "How many copies of one minted design can exist? Can a design be withdrawn?
What makes any item rare when the catalog is infinite?"

**Add to §Design minting:**
> A minted design sells for a fixed window of **N days** or **N copies**, whichever comes first,
> after which it is withdrawn permanently and can never be re-minted by anyone. Withdrawn designs
> keep their recipe on record so existing copies keep rendering. Variety is infinite. Supply of
> any one design is not. The catalog never runs dry of *new* designs — it does run dry of *each*
> design.

---

### 10. MAJOR — Creator cut (30–70%) is load-bearing, not a free parameter

**Doc:** GAME.md line 234 (Open question 3), lines 116–117.

The doc files this as an open question. It is load-bearing for three already-specified systems:
it sets the Star-laundering rate in finding 3, it decides whether minting is a net sink or a net
faucet (line 117 asserts "the rest sinks", which is only true if the cut is below 100% *and* the
mint fee exceeds the creator's expected take), and it sets the payback period that decides whether
anyone mints at all.

**Add to Open question 3:**
> Blocking for the economy ledger. Pick a value before the marketplace ships. Below 50% the mint
> path is a net sink, above 50% it is a net faucet.

---

### 11. MAJOR — The progressive commission has no schedule, and it is the only friction on Star transfer

**Doc:** GAME.md lines 76–77.

"Progressive commission" is named and never specified. No minimum, no bands, no percentages, no
cap. Habbo §1.5 gives the shape (minimum 1 Credit, steeper above 60,000c) and no numbers usable
here. After finding 3, this curve is the primary defense against alt consolidation.

**Add to §Sinks:**
> Commission bands: X% below N Stars, Y% from N to M, Z% above M, minimum 1 Star. Bands are
> published and change only on the monthly rebalance date.

---

### 12. MAJOR — Nobody sets the price of a minted design

**Doc:** GAME.md line 116 ("Buyers pay Stars, creator takes a cut").

Creator-set pricing makes stalls an uncapped account-to-account Star pipe. System-set pricing
removes the creator's economic agency and makes the "creator economy" claim weaker than IMVU's,
which the doc cites as proof (line 118).

**Add:** > Minted designs sell at a price the creator sets within a band derived from archetype
> and part count. The band's ceiling is **N × the mint fee**.

---

### 13. MAJOR — Achievements and competitions are uncapped faucets in a table about caps

**Doc:** GAME.md lines 62–63.

"Achievements | one-time grants | — " has an em-dash in the Cap column. "Competitions | prize pool
| weekly" never sizes the pool. Both post to the ledger. Neither has a number or a bound.

**Add:** > Achievement grants total at most **N Stars** across the whole achievement set, published
> in advance. The weekly competition pool is **N Stars**, split 50/30/20 across three placements.

---

### 14. MAJOR — Anomaly detection has no thresholds and no stated action

**Doc:** GAME.md lines 84–85, PIPELINES.md line 80.

"A single ledger service that logs every Star in and out with anomaly detection" names the defense
that Pillar 3 and §Anti-abuse both rest on. No threshold, no signal list, no action policy. An
anomaly that triggers nothing is a log line.

**Add to §Anti-abuse:**
> Anomaly triggers freeze the *receiving* balance, not the account, and open a review ticket.
> Frozen Stars stay spendable up to the pre-anomaly balance. Signals: receipts above the 7-day
> transfer cap, vote graphs where over N% of a creator's votes come from accounts sharing a
> device fingerprint, and marketplace sales at over N× the 7-day average price.

---

## B. Creation and voting

### 4. BLOCKING — The largest faucet has no interface for three of the four things it pays for

**Doc:** GAME.md line 12–13 (Vision: "songs, furni designs, outfits, rooms"), line 58 (faucet row
"Votes on your performance or design"), §Music lines 104–111, §Design minting lines 113–119.

Music gets a fully specified vote surface: stage, floor-arrow queue, thumbs up/down, reaction
stings bucketed by net score, charts. Designs, outfits and rooms get one word — "or design" — and
nothing else. There is no answer to where a vote happens, who can cast it, or what stops it.

The consequence is not cosmetic. In Coke Music the performance ritual was the rate limiter: one
performer at a time, ~60 seconds per song (Coke §1.4). One friend could not saturate your daily
cap because saturating it needed 70 serialized performances, or 70 minutes. **A design vote has no
serializing ritual, so one alt can hand a creator the full 350/day cap in seconds** by voting once
each on 70 minted designs. Vote-once-ever does not prevent this — it is per creation, and creations
are unbounded (finding 8).

**Builder's question:** "Where do I click to vote on a furni design? Do I have to own it? Can one
player vote on all 70 of my designs today?"

**Add a subsection to §Earning paths:**
> ### Voting outside music
> A design, outfit or room becomes votable only when a player encounters it in place — a furni
> design in a room where it stands, an outfit on a worn avatar in the same room, a room by
> standing in it for at least N seconds. Votes cast from a catalog listing or a stall page do not
> exist. One vote per player per creation, ever, matching the music rule. A creator may receive at
> most **N votes per day from any one voter across all their creations combined**, which restores
> the social-breadth constraint that the performance ritual gives music.

---

### 15. MAJOR — Vote income on a design goes to nobody in particular

**Doc:** GAME.md line 58, lines 110–111, lines 116–117.

Music splits the reward on purpose: "Performer earns the Stars, creator earns the chart credit"
(line 110), copying Coke §1.3. The design path never says who the vote pays. Three readings are
live: the creator, the owner who displays it, or the room owner whose room it stands in. Each
produces a different economy and a different alt-farming shape.

**Add:** > A vote on a displayed design pays the **displaying player**, and credits the **creator**
> on the design charts — the same split as music, for the same reason: it makes designs circulate.

---

### 16. MAJOR — Two players can mint the same recipe

**Doc:** PIPELINES.md line 28 ("A furni design is a recipe: archetype + part selections + palette
ramp + pattern + seed"), §Player design studio lines 52–55.

Recipes are deterministic and the parameter space is finite. Collisions are certain once the studio
has users. No gate in stage 4 or 5 checks for an existing identical recipe. The design charts, the
creator cut, and "the best player-made designs enter the catalog and pay their creators" (line 14)
all assume one recipe has one author.

**Add to stage 4:** > Recipe uniqueness gate. A recipe hash that already exists in the catalog
> rejects at mint time with a full fee refund. First mint owns the recipe permanently.

---

### 17. MAJOR — Design charts have no ranking metric

**Doc:** GAME.md line 118 ("Design charts and engraved trophies mirror the music charts"), line 197.

"Mirror the music charts" is not a metric. Music charts rank cumulative thumbs-up per creator per
window (Coke §1.5). Designs have two candidate signals — votes and sales — which reward opposite
behavior. Nothing states the tie-break, the reset time, or whether the engraved trophy names a
creation or a creator.

**Add:** > Design charts rank by **net votes received in the window**, not by sales, so a
> cheap popular design beats an expensive unpopular one. Ties break toward the earlier mint
> timestamp. Trophies engrave date, username, and design name.

---

### 18. MAJOR — A performer who disconnects mid-song leaves five undefined states

**Doc:** GAME.md lines 104–111, PIPELINES.md line 73.

Unanswered: do votes already cast stand, does the song take chart credit, does the queue advance
immediately or wait for a reconnect window, does the reaction sting play, and does the audience
keep hearing the song. PIPELINES line 73 says the server schedules playback, which suggests the
song can finish without the performer. Nothing says it does.

The doc demands exactly this rigor of minigames — "Forfeit and disconnect rules ship with every
game" (line 142) — and does not apply it to the performance system.

**Add to §Music:** > If the performer disconnects, the server finishes the song, votes already cast
> stand, chart credit is awarded in full, and the reaction sting plays. Stars pay to the
> disconnected performer. The queue advances at the song's scheduled end, not at disconnect.

---

### 19. MAJOR — Server-enforced queues do not fix stage blocking

**Doc:** GAME.md line 111 ("Queue arbitration is server-enforced (Coke Music never fixed
line-cutting)").

Coke Music had two separate failures. Line cutting was a queue-order problem. **Stage blocking —
players physically standing in the way of stage access — was a pathing problem** and is named
separately in Coke §1.4 and in the §5 decline list. A server-enforced queue solves the first and
leaves the second untouched.

**Add:** > Stage tiles and the queue path are walkable only by the player whose turn is current.
> Every other avatar is routed around them. This is a pathing rule, not a queue rule.

---

### 20. MAJOR — Blank CDs have no cost and no supply rule

**Doc:** GAME.md line 107 ("burn to CD (tradeable item)").

Coke §1.3 makes blank CDs a starting grant of 10 plus a 50 dB per 10 purchase, tied for cheapest
item in the game. It was the entry-tier sink that every new player met first. GAME.md makes CDs
tradeable and says nothing about where they come from, what they cost, or whether performing
consumes one.

**Add:** > New accounts get 10 blank CDs. More cost N Stars per 10. Performing does not consume the
> CD. Burning one song to several CDs is allowed and is how songs circulate.

---

### 21. MAJOR — "Stall" appears once and is never defined

**Doc:** GAME.md line 116 ("a purchasable catalog item in the player's own stall").

A stall is a new noun with no location, no cost, no capacity, no discovery path, and no
relationship to rooms or the Navigator. PIPELINES §5 lists a "Catalog/asset service" holding
"recipes, bundles, marketplace order book" and never mentions stalls.

**Add:** > A stall is a page in the catalog service, not a room. Every player has exactly one, free,
> holding up to N live designs. Stalls are reachable from the catalog, from the design charts, and
> from any instance of the design placed in a room.

---

## C. Items, trade, and ownership

### 5. BLOCKING — There is no inventory

**Doc:** GAME.md §Rooms lines 179–181, §Trade lines 93–98, PIPELINES.md §7 build order.

Neither doc defines where an item lives when it is not placed in a room. No backpack, no capacity,
no sort order, no storage. Coke §3.3 documents the backpack at 25 items and calls it "a
well-documented usability sore point" — the design has neither the feature nor the fix.

Four specified systems cannot be built without it:

- **Trade** (line 95) — the trade window has to draw from something.
- **Room deletion** (line 74) — the doc says wallpaper and flooring are consumed and says nothing
  about the other ~100 items.
- **Minting** (line 116) — a bought design arrives somewhere.
- **Build order step 2**, "Furni placement from a hand-made starter catalog", presumes it.

**Builder's question:** "Where does a chair go when I pick it up?"

**Add a subsection to §Rooms and social:**
> ### Inventory
> Every account has one inventory, capacity **N items**, paginated, sortable by acquisition date,
> type, and name. Items in inventory render a preview, including wallpaper colour and teleporter
> pairing — the two things Coke Music's backpack could not show (Coke §3.3). Inventory is full-stop
> on acquisition: a purchase or trade that would exceed capacity fails before it commits, with the
> Stars unspent.

---

### 22. MAJOR — Room deletion loses track of the furni

**Doc:** GAME.md line 74 ("Wallpaper and flooring are consumed on room deletion. No refunds
anywhere. (Coke §2.4)").

The citation is accurate but partial. Coke §2.4 says both halves: wallpaper and flooring are
destroyed **and other furni returns to the backpack**. The design imports the destructive half and
drops the preserving half. As written, deleting a room might destroy 100 items.

Related unanswered case: an item another player owns sitting in your room, or an item currently
listed on the marketplace or pending in a trade window.

**Add:** > Deleting a room returns all placed furni to the owner's inventory and destroys only
> wallpaper and flooring. Deletion is refused while any item in the room is trade-pending or
> marketplace-listed, or while any other player is in the room.

---

### 23. MAJOR — Trade has no numbers and no item cap

**Doc:** GAME.md lines 95–96 ("Trade window: item preview, forced delay, confirm step").

The pattern is right and unspecified. Habbo §1.4 gives ~3 seconds for the delay. Coke §3.3 and
lesson §6.8 both name the ~6-item cap as **the documented exploit surface** — the research
identifies the exact thing to fix and the design does not state its answer.

**Add:** > Delay is 3 seconds after both parties accept, cancellable throughout. A trade carries at
> most N items per side, and every item is previewed at full size with its name. Adding or removing
> any item resets both accepts.

---

### 24. MAJOR — Simultaneous marketplace purchases, listing lifetime, and cancellation are all unspecified

**Doc:** GAME.md lines 97–98.

Unanswered: what happens when two buyers hit the same last listing, how ties break between
identically priced listings, how long a listing lives, whether a seller can cancel, where the item
sits while listed, and what a failed purchase refunds.

**Add:** > A listing is a server-side escrow — the item leaves inventory at list time. Purchase is a
> single ledger transaction. The loser of a race sees "already sold" and is charged nothing.
> Identical prices break by earliest listing time. Listings expire after N days and return the
> item. Cancellation is free before any bid and impossible after purchase commits.

---

### 9. BLOCKING — A ban leaves nine dangling references

**Doc:** GAME.md §Safety and moderation lines 200–209.

The section specifies filters, the assistance button, paid moderators, and symmetric ignore. It
never states what a ban does. Coke §3.5 documents its answer (permanent ban wipes the account and
all decibels) and Coke §2.4 repeats it. The design states no ladder and no consequence.

Every one of these is undefined for a banned account: minted designs held by other players, live
stall listings, marketplace listings, Stars balance, items in other players' rooms, chart positions
and engraved trophies bearing that username in other players' rooms, owned rooms and their visitors,
group ownership, and pending trades.

This is a data-model decision, not a policy detail. The ledger is append-only (PIPELINES line 80),
so the reversal semantics have to be designed rather than patched.

**Builder's question:** "The creator of a design I bought and displayed got banned. What happens to
my furni? What happens to the Gold Record on my wall with their name engraved on it?"

**Add to §Safety and moderation:**
> Escalation ladder: filtered warning → kick → timed suspension → permanent ban. On permanent ban
> the account's Stars are burned, live listings are cancelled and items returned to the frozen
> inventory, rooms become unreachable, and group ownership transfers to the longest-tenured
> member. **Items already sold or traded to other players stay valid and keep rendering** — the
> ledger never reverses a settled transfer. Minted designs are withdrawn from sale and keep their
> recipe. Trophies already engraved keep the banned username. Chart history is not rewritten.
> Bans carry an appeal path with a stated response window.

---

## D. Rooms and social

### 25. MAJOR — Rooms per player is unspecified

**Doc:** GAME.md line 179 ("Rooms: free to create").

Free plus unlimited is a server-cost and a Navigator-spam problem. Coke §3.1 gives 6 rising to 10.
Nothing here.

**Add:** > Each account may hold N rooms. Creating past the limit requires deleting one.

---

### 26. MAJOR — Room lifecycle and owner-absent behavior are unspecified

**Doc:** GAME.md lines 179–182, PIPELINES.md line 79.

Unanswered: can visitors enter a room whose owner is offline, when does a room instance unload,
what happens to players inside when it unloads, and whether room state survives a room-server
restart. PIPELINES makes this guarantee for minigames (line 96) and not for rooms.

**Add to PIPELINES §5:** > Room instances load on first entry and unload N minutes after the last
> occupant leaves. Furni state is persisted on every change, not on unload. Owner presence is not
> required for entry. Locked, password and invite-only states apply the same whether the owner is
> online or not.

---

### 27. MAJOR — Game halls are public rooms with no stated owner, which breaks the moderation pillar

**Doc:** GAME.md Pillar 1 line 19–20 ("Room owners hold kick/ban/mute rights, so moderation scales
with the community"), line 135 ("Game halls are public rooms"), line 163 ("moderator tools on every
lobby").

Pillar 1 makes room ownership the moderation mechanism. Game halls have no owner. Social-deduction
lobbies are said to have "moderator tools" with no statement of who holds them. Habbo's answer was
staff-account-owned Official Rooms (habbo §1.1). The design does not state one.

**Add:** > Game halls and other official rooms are owned by a staff account. Kick and mute in an
> official room are staff-only. Every social-deduction lobby elects no moderator — the server
> enforces turn order and the standard filter, and the Call for Assistance button routes to paid
> staff as everywhere else.

---

### 28. MAJOR — What a room is *for* in v1 is unanswered

**Doc:** GAME.md line 218 (non-goal: "Free-form room scripting (architecture reserved, feature
later)"), §Rooms lines 177–191.

With Wired deferred, v1 rooms support decoration, chat, and hosting a performance. Habbo §2.5 and
Coke §3.4 both document that the dominant use of rooms was player-run games — falling furni, mazes,
red light/green light, roleplay agencies. All of those need either Wired or a hand-built substitute.
The genre survey's sharpest finding is that catalog-only decoration games all shut down
(genre-social-sims.md §Cross-Game Synthesis).

The non-goal covers scripting. It does not cover the resulting hole in what players do in rooms
all day.

**Add to §Rooms and social:** > v1 ships three hand-built room games as furni sets with fixed
> server-side rules — no scripting required — so rooms have a use beyond decoration before Wired
> lands. Candidates: falling furni, a maze gate set, and a red-light/green-light floor.

---

### 29. MAJOR — Gifting is dropped without a non-goal, and it is also a laundering vector

**Doc:** GAME.md §Trade lines 92–100, §Non-goals lines 211–219.

The genre survey names gifting among the mechanics players remember fondly (YoVille, Pet Society)
and notes it as low-friction and high-frequency. It is absent here and absent from the non-goals.
It also interacts with finding 3 — a gift is a zero-price trade, so any anti-consolidation cap on
trades has to cover gifts or it covers nothing.

**Add:** > Gifting an item to another player is a one-sided trade with the same delay and confirm
> step, and it counts against the same per-account transfer caps as trading.

---

### 30. MAJOR — Pets are absent with no non-goal

**Doc:** GAME.md §Non-goals lines 211–219.

Pets appear in Habbo §1.7 (purchasable, trainable, badge-earning, first-class room actors in
Wired), Club Penguin (puffles), Webkinz, and Neopets' entire premise. They are a sink, a daily-return
hook, and a room actor. The design neither includes them nor declines them.

**Add to §Non-goals:** > Pets. They are a strong sink and daily hook, and they need a care loop,
> an AI actor in the room server, and their own art pipeline. Not in v1.

---

## E. Minigames

### 31. MAJOR — The multiplayer daily cap has no value at all, not even a placeholder

**Doc:** GAME.md line 60 ("Multiplayer games ... | per-match, win and participation | daily cap
(tune)").

Every other faucet row carries a number with `(tune)` beside it. This one carries only `(tune)`.
Two of the three minigame tiers pay through it, and finding 1 cannot be resolved without it.

**Add:** > Multiplayer daily cap: N Stars, shared across tactics and deduction.

---

### 32. MAJOR — Social-deduction lobbies have no under-fill, abandon, or scheduling rule

**Doc:** GAME.md lines 161–165.

"Scheduled lobbies of 8–12" states a size and nothing else. Unanswered: what happens with 5 players
queued at the scheduled time, whether the lobby waits or cancels, what happens when a player leaves
mid-round in a game where roles are asymmetric, and whether a departed traitor's role is revealed.

The doc's own rule on line 142 demands every game define a reconnect window, an AFK forfeit timer,
and abandonment payout. Tier 3 defines none of the three, while tier 1 and tier 2 also define none.
The doc states the requirement and then satisfies it nowhere.

**Add to §Official minigames:** > Every tier states its three numbers before it ships: reconnect
> window, AFK forfeit timer, and abandonment settlement. Tier 3 lobbies fill to a minimum of 8 or
> cancel at the scheduled start with no penalty and no payout. A player who leaves mid-round is
> replaced by a server-run stand-in that takes no actions, their role stays hidden until normal
> reveal, and they receive no participation payout.

---

### 33. MAJOR — The arcade tier has no game list and no ratio policy

**Doc:** GAME.md lines 153–157.

"Ratios rebalance monthly on a fixed, published date across the whole catalog" imports Neopets'
habit (Neopets §1, the 25th of the month). It does not state the date, who owns the rebalance, what
the target is, or how many games exist. Finding 1's arithmetic depends on the game count.

**Add:** > Rebalance runs on the Nth of each month against a published target: median Stars per
> minute across the arcade catalog stays within ±10% of the vote faucet's rate. Ratios only ever
> change on that date.

---

### 34. MAJOR — Spectating is named as core to the formula and never specified

**Doc:** GAME.md lines 135–139, line 160 ("Spectate and challenge from the rail").

The doc identifies spectating as the first element of the Battle Ball formula (Neopets §6) and then
gives it one clause. Unanswered: can spectators chat, do they see hidden information in the
deduction game, do they earn anything, is there a spectator cap, and can a player spectate a match
they are queued for. Habbo's Spectator View was explicitly chat-free (Neopets §6).

**Add:** > Spectators see only public game state, cannot chat into the match, and earn nothing.
> Spectator count per table is capped at N. Spectating a hidden-role lobby shows the same view a
> non-role player sees.

---

## F. Safety and moderation

### 35. MAJOR — Two docs disagree on whether every minted design gets human review

**Doc:** GAME.md line 208 ("Player-minted designs pass automated checks plus a moderation screen
before catalog entry") vs PIPELINES.md line 45 ("Name and description through the standard filter,
rendered sprite through image screening, then human review queue **for flagged items**").

GAME.md reads as human review of everything. PIPELINES reads as human review of the flagged subset.
The difference is the entire moderation headcount, and it decides whether minting is instant or
queued — which changes the studio UX and the mint-fee refund path.

**Resolve in favour of PIPELINES and correct GAME.md:**
> Player-minted designs pass automated checks. Items the automated screen flags enter a human review
> queue and do not appear in the catalog until cleared. Unflagged items publish immediately and are
> subject to post-publication reports like any other content.

---

### 36. MAJOR — No ban ladder, no appeal, no moderation coverage model

**Doc:** GAME.md lines 200–209.

"Paid moderators only" is a staffing principle, not a coverage model. Coke §3.5 documents the full
ladder (popup warning → kick → permanent ban), 24/7 staffing, multi-room watch tooling, and — the
detail with real cost consequences — daily opening hours of roughly 10am–2am that existed
*because* moderation coverage was the constraint. The design states none of its own.

Partly covered by finding 9. Recorded separately because the coverage model is a launch-gating
cost, not a data-model question.

**Add:** > Coverage: N moderators, X hours per day. If coverage is under 24/7, chat outside covered
> hours falls back to a stricter filter mode rather than going unmoderated.

---

### 37. MAJOR — The Call for Assistance button has no queue behavior

**Doc:** GAME.md line 205.

One-click, blame-free, routed to staffed moderation — all correct and all front-end. Unanswered:
does it capture a chat log snapshot and room state at press time, what does the reporter see next,
what is the response target, what stops report spam, and what happens when a report lands outside
covered hours.

**Add:** > Pressing the button snapshots the last N lines of room chat, the room ID, and the
> present avatar list, and attaches them to the ticket. The reporter sees an acknowledgement with a
> ticket ID. Repeated false reports from one account throttle that account's reports, they never
> block them.

---

### 38. MAJOR — Style-system versioning is unspecified, and "cache forever" makes it load-bearing

**Doc:** PIPELINES.md lines 26–29 ("Recipes are small, deterministic, and cheap to store. Sprites
render from recipes and cache forever"), stage 2 lines 34–37 ("Global palette of N ramps × M
shades").

Determinism holds only against a pinned generator. Any later change to a palette ramp, a dither
rule, or a part sprite silently restyles every already-minted design, including engraved trophies
and sold items. Nothing states a version field on the recipe or a migration policy.

**Add to PIPELINES §2:** > Every recipe carries a `style_version` and a `generator_version`.
> Rendering pins both. Changing the style system mints a new version and never touches sprites
> rendered under an older one. Retiring a style version needs an explicit migration decision per
> archetype.

---

### 39. MAJOR — GAME.md reserves Wired architecture from day one and PIPELINES reserves nothing

**Doc:** GAME.md lines 36–37 ("Reserved for later, architecture planned from day one: programmable
rooms (a Wired-class system). Retrofitting variables and signals is very hard.") vs PIPELINES.md
§5 services sketch, lines 77–84.

PIPELINES is the architecture document. It mentions Wired, variables, signals, triggers and
conditions nowhere. The room server's responsibility is listed as "movement, chat, furni state" —
no event bus, no scoped variable store, no per-room execution budget. The promise on GAME.md line 36
is not kept by any artifact.

habbo §6 open question 10 flags the Wired *scheduler* as "the highest-value remaining unknown for
anyone implementing Wired". Nothing in either doc reserves space for it.

**Add to PIPELINES §5, room server row:** > Room server carries a per-room event bus, a scoped
> variable store (user / furni / room / global), and a per-room execution budget from day one, even
> though v1 exposes no scripting surface. Furni state changes publish to the bus. This is the
> reserved architecture GAME.md line 36 names.

---

## G. Onboarding, empty states, failure states

### 6. BLOCKING — Onboarding does not exist in either document

**Doc:** Both docs, all sections.

Neither doc contains a sentence about a new player's first session. Missing: the account creation
flow, the default avatar, whether a room is created for you or by you, the first tutorial, the
first friend path, the first earn, and the first spend. Line 41 gives a session loop that assumes a
player who already has a room, friends, and a ritual.

The research names this explicitly. habbo §2.5: role-play agencies "paid new players ~2 Credits
every 6 hours as an income for newcomers" and the doc's own comment is "**players built a
new-player onboarding and income system that the game itself did not provide. That is a gap worth
designing for deliberately.**" The design does not fill it and does not decline it.

**Builder's question:** "A player finishes registration. Describe the next ten minutes."

**Add a §First session subsection to GAME.md, minute by minute:**
> 0:00 Registration grants N Stars, a default outfit, 10 blank CDs, and one room already created
> with a stock layout and a starter furni set placed in it. The player never faces an empty room.
> 0:01 The lobby café is the spawn point, not the player's own room — day one starts where other
> people are.
> 0:02 First daily: the coffee, 10 Stars, one click.
> 0:05 A guided first purchase from the catalog and a guided first placement in the room.
> 0:10 A routed visit to a game hall with a queue short enough to join, and a first arcade payout.
> First 24 hours: the player has earned from two faucets, placed furni, and been in a room with
> strangers.

---

### 7. BLOCKING — Every faucet except dailies requires an audience the game will not have at launch

**Doc:** GAME.md §Faucets lines 56–64, §Music lines 104–111, §Official minigames lines 128–169,
§Room competitions lines 121–125.

Votes need a crowd. Performances need a room with people in it. Tactics needs an opponent. Deduction
needs 8 to 12 people at a scheduled time. Competitions need entrants. Charts need 40 entries. The
Navigator's "busiest list" needs busy rooms. At launch, and in every off-peak hour after, none of
these exist.

Coke Music's answer was scale plus designed grind destinations (the double-paying Coca-Cola Red
Room, Coke §3.2) and limited daily hours that concentrated the population into a 16-hour window
(Coke §3.5). Neither doc has a concentration mechanism or a low-population mode.

**Builder's question:** "It is 4am and there are 30 people online. What can a player do, and what
can they earn?"

**Add to §Rooms and social:**
> ### Low-population mode
> Below N concurrent players the Navigator collapses its categories into one list, scheduled
> deduction lobbies drop to a single nightly slot, and the lobby café doubles vote payouts as the
> designed concentration point. Charts publish with fewer than 40 entries rather than not publishing.
> The arcade and the dailies are the two faucets that must work with one player online, and the
> catalog must be affordable on those two alone.

---

### 40. MINOR — No empty state for the Navigator, marketplace, charts, or stall

**Doc:** GAME.md lines 181–182, 97–98, 197, 116.

Each is a list that is empty on day one and stays empty for a new player. Nothing states what
renders.

**Add:** > Every list surface states what it is and how to fill it when empty. An empty marketplace
> shows the catalog instead. An empty chart shows the entrants so far.

---

### 41. MINOR — Purchase, mint, and payout failure states are unspecified except one

**Doc:** PIPELINES.md line 55 is the only failure state in either document: "Rejected mints refund
the fee minus a small processing sink."

Undefined: a purchase that fails after the Stars debit, a ledger write that fails after the item
grant, a minigame service that dies before posting a result, and a trade that commits on one side.

**Add to PIPELINES §5:** > Every Star movement and item movement is one transaction in the ledger.
> Partial commits do not exist. A service that cannot reach the ledger fails the player action and
> pays nothing rather than paying optimistically.

---

## H. Pipelines and technical

### 42. MINOR — "Silhouette contrast against both floor tones" names two tones and the game has many floorings

**Doc:** PIPELINES.md line 42.

**Add:** > Contrast is checked against the two extreme floor tones in the palette, lightest and
> darkest, not against every flooring.

---

### 43. MINOR — No account or auth service in the services sketch

**Doc:** PIPELINES.md §5 lines 77–84, GAME.md line 82–83 ("one account per person policy,
device/payment-free alt heuristics").

Six services are listed. None owns accounts, sessions, device fingerprints, or the alt heuristics
the anti-abuse section requires.

**Add a row:** > Identity service | Accounts, sessions, device and behavioral alt heuristics, one
> account per person enforcement | Feeds signals to the ledger's anomaly detector.

---

### 44. MAJOR — The build order omits moderation, the Navigator, social, and onboarding

**Doc:** PIPELINES.md §7 lines 108–115.

Step 1 ships chat. The filter is not in the list at all, and Pillar 6 calls moderation a core
feature while the synthesis calls it existential risk #1. The Navigator, the friends console, and
onboarding also never appear. The section is labelled a sketch, which is why this is major rather
than blocking — a sketch that omits the safety-critical path still sets the wrong default.

**Add:** > 1a. Filter service and Call for Assistance, shipped with chat in step 1, never after it.

---

### 45. MINOR — Two authored scales, no statement of which ships in v1

**Doc:** PIPELINES.md line 13, line 39, line 54.

Two scales doubles art cost per part. Nothing says whether v1 ships both zooms or authors both and
ships one.

---

### 46. MINOR — Song serialization has no dedup or import policy

**Doc:** PIPELINES.md lines 71–72.

A compact recipe is stated. Nothing says whether two identical songs by different creators are
allowed, which matters for the Top 40 the same way recipe collision matters for design charts
(finding 16).

---

### 47. MINOR — Furni stacking rules are unspecified

**Doc:** PIPELINES.md line 33 ("footprint in tiles, stack height"), GAME.md line 179.

habbo §6 lists maximum stack height and per-item stackability as an open research question. The
design inherits the gap silently. Stack height bounds the validation gate on line 42 and the room
server's collision model.

---

## I. Citation spot-checks

Twenty-two citations checked against the research. Three do not support the claim as written.

### 48. MINOR — Coke §1.5 does not support "display slots are scarce"

**Doc:** GAME.md line 30–31: "Trophies are furni... Display slots are scarce. (Coke §1.5, Habbo
§1.8)".

Habbo §1.8 supports it — badge display is capped at 5 plus 1 group badge and the doc says the
scarcity is what gives badges value. Coke §1.5 supports the *engraved trophy* claim and contains
nothing about display scarcity. Coke Music had no display cap at all — Coke §3.4 documents
collection rooms built specifically to hoard Gold and Platinum Records.

**Fix:** cite Coke §1.5 for engraving and Habbo §1.8 for scarcity, and note that Coke Music is a
counter-example on display limits.

---

### 49. MINOR — Neopets §3 does not support "that split is why queues stayed full"

**Doc:** GAME.md lines 147–149.

Neopets §3 supports the split itself — everyone accrued NP during play plus placement-ranked
prizes. It does not support the causal claim about queues, and it documents the opposite symptom:
"opponents joining and leaving before the first turn" and games "ending abnormally" often enough
that TNT wrote an article about it.

**Fix:** state the split as a design choice, and drop or hedge the queue-fullness claim.

---

### 50. MINOR — IMVU is cited as the longevity proof with its motivating mechanism removed

**Doc:** GAME.md line 118 ("IMVU's creator economy is the longevity proof").

genre-social-sims.md §IMVU is precise about why creators return: Credits "convert back to real
money", and "creators return to maintain a storefront/income, not just to play". GAME.md's
non-goals forbid real-money anything (line 213). The transferable half of the finding is the
survey's own conclusion that user-generated content correlates with longevity. Everskies and Pixel
Worlds are the closer analogues — creator economies with no cash-out.

**Fix:** cite the survey's cross-game synthesis rather than IMVU specifically, or name Everskies as
the in-currency-only precedent.

---

### 51. MINOR — Neopets' "exceptional eight" trophy rule is dropped without comment

**Doc:** GAME.md lines 156–157.

The top-17 structure is imported correctly. Neopets §1 also documents a separate rule for games
with a low feasible maximum score, where everyone hitting the true max gets automatic gold. Any
skill-capped arcade game needs this or its leaderboard is a timestamp race.

---

## J. Load-bearing placeholders and open questions

Point 4 of the brief. Every `(tune)` and open question, sorted by whether another specified system
already depends on its answer.

| Placeholder | Doc | Load-bearing? | What depends on it |
|---|---|---|---|
| Registration grant | line 64 | **Yes, blocking** | Finding 2, finding 6. Cannot be tuned — no prices exist. |
| Solo arcade cap / plays per day | lines 59, 153 | **Yes, blocking** | Finding 1. Sets the global ceiling. |
| Multiplayer daily cap | line 60 | **Yes, blocking** | Finding 1, finding 31. No value at all. |
| Creator cut 30–70% | line 234 | **Yes** | Findings 3, 10, 12. Sets laundering rate and sink sign. |
| Furni limit ~100/room | line 179 | **Yes** | Room server memory, Pillar 5 display scarcity, room deletion cost. |
| Room capacity / instance limits | line 235 | **Yes** | Stage audience size, deduction lobby of 8–12, spectator rail, low-population mode. |
| High-value sink | lines 224–230 | **Yes** — doc says so | The doc already states "Needs a decision before the economy ships." Confirmed. Finding 8 makes it harder: a never-dry catalog removes the natural high-value sink. |
| Audience and age positioning | lines 231–233 | **Yes** — doc says so | Gates registration flow, filter strictness, moderation headcount, and whether launch is legal. Confirmed. |
| Vote payout 5 / cap 350 | line 58 | No — safe defaults | Copied from Coke §2.1 with the source's own numbers. Fine as-is once finding 1 lands. |
| Dailies ~100/day | line 61 | No | Mirrors Coke's 10 dB × 10 Cokes. |
| Wired scope and timing | line 237 | No for v1 — **yes for architecture** | Finding 39. The scope can wait. The reserved substrate cannot. |
| Naming | line 238 | No | Cosmetic. |

---

## K. Systems the research inventories that the design drops silently

Non-goals are fine. These are omissions with no non-goal.

| System | Research | Status in design |
|---|---|---|
| Inventory / backpack | Coke §3.3, habbo §4.3 ("hand") | Absent. **Finding 5, blocking.** |
| New-player income path | habbo §2.5, called out as "a gap worth designing for deliberately" | Absent. **Finding 6, blocking.** |
| Collection / set completion | 00-synthesis §Retention, Zynga FDG 2012 — players pay to finish, not to progress | Absent, no non-goal. **Finding 52.** |
| Decaying asset | 00-synthesis §Retention ("a soft decaying asset") | Absent, no non-goal. **Finding 53.** |
| Login streaks | 00-synthesis §Retention, genre survey | Dailies exist, streaks do not. **Finding 54.** |
| Gifting | genre survey, remembered fondly | Absent. **Finding 29.** |
| Pets | habbo §1.7, Club Penguin, Webkinz, Neopets | Absent. **Finding 30.** |
| Bots / NPCs | Coke §2.1 bartender bots, habbo §1.6 Wired bot effects | Absent. **Finding 55.** |
| Quest chains routing players between rooms | habbo §1.8 | Absent — achievements are one-time grants only. **Finding 56.** |
| Emotes and expressions | habbo §4.3 (wave, laugh, cry, respect, sign), Coke §3.3 | PIPELINES authors wave and dance. GAME.md specifies no emote system. **Finding 57.** |
| Withdrawn / retired catalog items | habbo §3.1, §3.2, 00-synthesis §Scarcity | LTDs exist. No withdrawal policy for regular items, and finding 8 makes withdrawal meaningless. |
| Room ratings | habbo §2.1 | Navigator has a busiest list. No rating. Probably deliberate — state it. |

### 52. MAJOR — Collection completion is named as a retention requirement and dropped

00-synthesis §Retention lists four retention mechanics, one of which is "collection completion
(players pay to finish, not to progress — Zynga FDG 2012)". The design has trophies and badges,
which are awards, not sets. No set, no completion state, no completion reward.

**Add:** > Catalog lines ship as named sets. Owning a full set mints a set badge and a set-only
> furni piece. Sets are visible from the catalog with a progress count.

### 53. MAJOR — The decaying asset is named as a retention requirement and dropped

00-synthesis §Retention names "a soft decaying asset" as recurring across the genre — FarmVille's
crops, Webkinz's pet happiness, Pet Society's neediness. Nothing in the design decays. That may be
the right call for a hotel game, and it is a deliberate divergence from the synthesis that should be
stated rather than left silent.

**Add to §Non-goals:** > Decaying or withering assets. Loss-aversion mechanics conflict with a
> design where the room is a permanent status display. The daily ritual carries the return habit
> instead.

### 54. MINOR — Dailies have no streak

Line 173. A coffee and a spin with no consecutive-day component. The synthesis names streaks
explicitly.

### 55. MINOR — No bots or NPCs

Coke's bartender bots delivered a faucet (Coke §2.1). Nothing here delivers dailies in-world, so
the "hotel-themed ritual" on line 173 has no actor.

### 56. MINOR — Achievements are a flat list with no chain and no routing

habbo §1.8 describes quest chains that route players through many rooms — a discovery mechanism as
much as a reward. Line 62 gives one-time grants only.

### 57. MINOR — Emote system unspecified while its art is being authored

PIPELINES line 63 authors wave, dance and sleep. GAME.md never states an emote surface, a list, or
whether emotes are chat commands or UI.

---

## L. Remaining spec-ability gaps

For each, the sentence that is missing before acceptance criteria can be written.

### 58. MINOR — Chart windows have no reset time or timezone
Line 197. Neopets §1 resets at 00:02–00:03 NST on the 1st. Add: > Charts reset at 00:00 UTC daily,
Monday weekly, and on the 1st monthly.

### 59. MINOR — The song vote window is undefined
Lines 108–109. Add: > Votes are accepted from the first bar to five seconds after the last, then the
sting plays on the net score.

### 60. MINOR — Late joiners to a song in progress
PIPELINES line 73 syncs by offset. Add: > A player entering mid-song hears it from the current
offset and may vote.

### 61. MINOR — Competition "winner" is undefined for the sit-out rule
Line 124 ("Winners sit out the following week"). habbo §1.10 bars *placing* winners. Add: > All
three placements sit out the following week.

### 62. MINOR — Room promotion slots have no price and no contention rule
Line 78 ("2-hour Navigator feature, cheap"). Add: > N Stars per 2-hour slot, N slots concurrent,
first come first served, one active slot per account.

### 63. MINOR — Friends list has no cap and no request limits
Line 186. habbo §2.2 sold list capacity as a perk. Add a cap, or state that it is uncapped.

### 64. MINOR — Groups have no cost, size limit, or ownership transfer
Lines 188–189. Group membership is called "mechanically real", which makes an abandoned group a
stuck resource. See finding 9 for the ban case.

### 65. MINOR — "Daily spin" and random LTD serials read as chance-based payouts, which a non-goal forbids

Line 174 ("a daily spin"), line 75 ("random serial assignment"), against line 217 ("Player-run
wagering or chance-based payouts" as a non-goal) and line 25 ("no player-run wagering, ever").

Pillar 3 and line 217 disagree in scope. Pillar 3 bans *player-run* wagering. The non-goal as
written bans *chance-based payouts*, which the daily spin and the random serial both are. One word
fixes it.

**Fix line 217:** > Player-staked wagering of any kind. Server-run random rewards with published
> probability tables are allowed — the daily spin and randomized limited-edition serials are both
> in scope, and both publish their odds (the Decibel revival's practice, Coke §5).

---

## Appendix — what is specified well enough to build

Recorded so the audit is not read as uniform. These need no further sentence:

- Rendering constants (PIPELINES §1). Verified against habbo §4.1–4.3, correct in every particular
  including which three directions mirror.
- The recipe model and part-composition-first approach (PIPELINES §2). Deterministic, storable,
  testable — the gate-testing instruction on line 43 is the right standard.
- Rejected-mint refund minus a processing sink (PIPELINES line 55). The only fully specified error
  state in either document, and a good one.
- Migration durability as a hard constraint (PIPELINES lines 93–98). Correctly traced to the two
  infrastructure deaths in the research, and correctly stated as a requirement rather than an
  aspiration.
- Licensing posture on nitro-renderer and Arcturus (PIPELINES line 86–87). Matches habbo §4.6.
- The music loop (GAME.md §Music), apart from the disconnect and stage-blocking gaps in findings 18
  and 19. Nearly verbatim from a well-sourced dossier.
