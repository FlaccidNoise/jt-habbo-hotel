# Economy Red Team — "The Grand"

Adversarial review of [design/GAME.md](../design/GAME.md) and [design/PIPELINES.md](../design/PIPELINES.md),
played as the most motivated cheater, scammer, botter and griefer the game will meet.

Review date: 2026-08-03. Reviewed against the docs as written, not against intent.

**Severity key**
- **CRITICAL** — breaks the economy or falsifies a stated pillar at launch scale. Fix before the ledger ships.
- **MAJOR** — reliable profit or reliable harm. Needs a system change, not a parameter.
- **MINOR** — needs a rule or a number, not a redesign.

**Baseline arithmetic used throughout.** GAME.md §Currency states a design ceiling of 450 Stars/day
(350 votes + 100 dailies) against a benchmark item of 2,500 Stars, so 5.5 days of maximum effort per
flagship item. Every finding below is measured against that stated ceiling.

---

## Summary

| ID | Severity | Finding | Doc section that fails |
|---|---|---|---|
| R-01 | CRITICAL | Bound currency launders to a main at 100% through the catalog and the trade window | GAME.md §Currency, §Trade |
| R-02 | CRITICAL | Item transfers never reach the ledger, so anomaly detection is blind to every laundering channel | PIPELINES.md §5 |
| R-03 | CRITICAL | Vote-once-**ever** is per creation, not per creator. One alt maxes the 350/day vote cap | GAME.md §Faucets, §Anti-abuse |
| R-04 | CRITICAL | Solo arcade has no aggregate cap. The faucet scales linearly with catalog size, 6.7×–67× the stated ceiling | GAME.md §Faucets, §Official minigames tier 1 |
| R-05 | CRITICAL | Design stall sales are a Star-transfer channel at up to 70% efficiency | GAME.md §Design minting, Open question 3 |
| R-06 | CRITICAL | A single marketplace wash sale transfers Stars and moves the 7-day index 6× in one action | GAME.md §Trade |
| R-07 | CRITICAL | Procedural minting lets any player mint a visual counterfeit of a high-value item | PIPELINES.md §2 stages 4–5, GAME.md §Trade |
| R-08 | CRITICAL | Recipe exclusivity is undefined. Both readings kill something load-bearing | PIPELINES.md §2, §Player design studio |
| R-09 | CRITICAL | "Server-authoritative" does not stop input-replay bots on the largest faucet | GAME.md §Official minigames bullet 1 |
| R-10 | MAJOR | Registration bonus and achievement grants are per-alt payouts that launder at 100% | GAME.md §Faucets |
| R-11 | MAJOR | No payment rail means no payment fingerprint. Alt cost is effectively zero | GAME.md §Anti-abuse |
| R-12 | MAJOR | Chart credit accrues from parallel rooms, so a ring locks the Top 40 permanently | GAME.md §Music |
| R-13 | MAJOR | "Free Greens" rings industrialise the vote faucet, and the design endorses them | 00-synthesis.md §8, GAME.md §Faucets |
| R-14 | MAJOR | The competition sit-out rule fails to a two-account ring | GAME.md §Room competitions |
| R-15 | MAJOR | Ranked win trading is profitable because both sides get paid | GAME.md §Official minigames tier 2 |
| R-16 | MAJOR | Social deduction: lobby stacking, out-of-band comms, and paid-for-presence bots | GAME.md §Official minigames tier 3 |
| R-17 | MAJOR | Trust and lending trades pass through preview + delay + confirm untouched | GAME.md §Trade |
| R-18 | MAJOR | Free listing plus cheapest-first plus anonymity gives sniping bots and book-walling | GAME.md §Trade |
| R-19 | MAJOR | Trust-settled betting on server-adjudicated outcomes rebuilds casinos from sanctioned parts | GAME.md pillar 3, §Trade |
| R-20 | MAJOR | Account theft has no stated recovery, though ownership history makes rollback possible | PIPELINES.md §5, GAME.md §Safety |
| R-21 | MAJOR | Stage queue squatting survives server-enforced arbitration | GAME.md §Music |
| R-22 | MAJOR | Refund-on-rejection makes flooding the moderation queue nearly free | PIPELINES.md §Player design studio |
| R-23 | MAJOR | Trophy tradeability is undefined. If tradeable, the whole status system launders | GAME.md §Status systems |
| R-24 | MAJOR | Room names and lookalike usernames carry targeted harassment past a wordlist filter | GAME.md §Safety |
| R-25 | MINOR | LTD random serials are a house-run lottery that contradicts the stated wagering ban | GAME.md §Sinks, §Non-goals |
| R-26 | MINOR | "Chance furni exists for decoration only" is undefined | GAME.md §Trade |
| R-27 | MINOR | Symmetric ignore erases actions, which breaks information integrity inside ranked games | GAME.md §Safety |
| R-28 | MINOR | Avatar collision and stage blocking are unaddressed | GAME.md §Music |
| R-29 | MINOR | Room promotion has no stated payer/beneficiary rule, so it is another transfer channel | GAME.md §Sinks |
| R-30 | MINOR | Unspecified caps block the alt arithmetic entirely | GAME.md §Faucets |

Counts: **9 critical, 15 major, 6 minor.**

---

## A. The currency wall

### R-01 — CRITICAL — The catalog converts bound Stars to liquid goods at 100%, with no friction

GAME.md pillar 2 says "Currency is bound, goods are tradeable" and treats that as the inflation
defense. It is not a wall. It is a one-way valve with full throughput.

Attack:
1. Alt earns Stars under every stated cap.
2. Alt walks to the catalog and buys furni at list price.
3. Alt opens a trade with the main and hands over everything for nothing.
4. Main now holds goods worth the alt's full lifetime earnings.

No fee is stated on catalog purchase. No fee is stated on the trade window. The transfer is lossless.
Compare the three channels available:

| Channel | Throughput to main | Friction |
|---|---|---|
| Catalog buy → trade window | **100%** | Both accounts in one room |
| Marketplace wash sale | 100% minus progressive commission | None, asynchronous, anonymous |
| Design stall purchase | Creator cut, 30–70% (Open question 3) | None, asynchronous |

Coke Music had the same structural hole. It survived because its total faucet was 450/day, so the
leak rate was trivial. Ours is 20–67× that (see R-04), so the same hole drains an order of magnitude
faster.

**Fix.** Stop trying to bind the currency and start binding the *transfer*. Give every account a
rolling **trade-value budget** — the total catalog value of goods it may hand out per 7 days, net of
what it receives. Set it low at account creation and raise it with tenure plus non-farmable
milestones. Enforce it at the ledger across the trade window, the marketplace, and stall purchases
together, so closing one channel does not just push volume into another. Add bind-on-purchase for
72 hours to all catalog furni, which costs a legitimate player nothing and forces every laundering
pod to carry three days of inventory risk.

### R-02 — CRITICAL — The ledger watches Stars. The exploit moves items.

PIPELINES.md §5 defines the economy ledger as "Every Star in and out, caps, anomaly detection", and
puts the marketplace order book under a separate catalog/asset service. Item ownership history lives
with item instance IDs, described in the same section as the anti-duplication defense.

So the single service that runs anomaly detection never sees a trade-window transfer. Every attack in
section A, and most of the collusion in section D, settles in *goods*. The detector is pointed at the
one thing the attacker does not need to move.

**Fix.** One append-only transaction log covering Stars **and** item ownership changes, with the same
service authoritative for both. Every trade, marketplace fill, stall sale, and catalog purchase posts
there. Anomaly detection then has the primitive it actually needs — the counterparty graph. Ship these
three queries before launch, because they catch most of this document:
- net value flow per account pair per 7 days, ranked.
- accounts whose outbound goods value exceeds inbound by more than their own earned income.
- connected components in the trade graph where internal volume exceeds external volume.

### R-03 — CRITICAL — Vote-once-ever is per creation, so one alt is enough

GAME.md §Faucets: "One vote per player per creation, **ever**". §Anti-abuse calls this "our main
defense". 00-synthesis.md §4 states the claim outright: "you cannot farm your friends — every new
decibel needs a new audience."

The claim is false as written, because nothing limits how many creations a player makes. Songs have
no stated cost anywhere in GAME.md or PIPELINES.md §4. Coke Music charged 50 dB per 10 blank CDs. We
dropped that.

Arithmetic, one alt:
- 350/day cap ÷ 5 Stars per vote = **70 votes/day**.
- Main authors 70 songs. They are recipes of a few hundred bytes (PIPELINES.md §4), so authoring is
  free and instant.
- The alt votes once on each. Every vote is a first vote on that creation, so the rule never fires.
- Main hits the daily cap with **one** alt, in 70 × 60s = 70 minutes of scripted wall-clock.

Arithmetic, an 8-account pod round-robin:
- Each performance is voted by the other 7, paying the performer 7 × 5 = 35 Stars.
- 10 performances per account caps that account at 350.
- 80 performances total, about 80 minutes, and **all eight** accounts hit cap.

There is also no stated cap on votes *cast*. One alt can cap main1, then main2, then main3, without
limit. That makes a rented vote-battery service the most profitable business in the game on day one.

**Fix.** Cap the *relationship*, not the creation. Vote k from the same voter toward the same creator
pays `5 / k`, and pays 0 beyond k = 3, per rolling 30 days. Chart credit stays uncapped so the social
meta and the Top 40 are unaffected. Add a cap on votes cast per account per day, require
server-verified presence for the full performance before a vote registers, and reinstate a Stars cost
per burned CD as both a sink and a floor on the cost of manufacturing votable creations.

### R-04 — CRITICAL — Solo arcade has no aggregate cap, so the faucet grows with the catalog

GAME.md §Faucets and §Official minigames tier 1 cap solo arcade at 1,000 Stars per play and 3 scored
plays **per game** per day. Nothing caps the total across games.

| Arcade games live | Daily arcade ceiling | vs the doc's own 450/day intent |
|---|---|---|
| 1 | 3,000 | 6.7× |
| 5 | 15,000 | 33× |
| 10 | 30,000 | 67× |

PIPELINES.md §6 commits to "catalog releases on a steady clock" and the Neopets grounding assumes a
growing game catalog, so this number only goes up. At 5 games a single account buys 6 flagship items
a day, against a stated design intent of one item per 5.5 days. The design-intent paragraph in
§Currency and the faucet table directly contradict each other.

Combine with R-01 and R-03. An 8-account pod at 5 arcade games earns
`8 × (350 + 100 + 15,000) = 123,600 Stars/day`, or **49 flagship items per day**, all of it
consolidatable to one main at 100%.

**Fix.** Enforce the cap at the ledger as a single daily total across all faucets, not per faucet.
Pick the number from the design intent — 600–900/day — and let players choose how to earn it. That
one change makes the arcade catalog free to grow, removes the incentive to grind every game, and
collapses the per-alt yield that funds every other attack here.

### R-05 — CRITICAL — The design stall is a Star-transfer channel

GAME.md §Design minting: "Buyers pay Stars, creator takes a cut, the rest sinks." Open question 3
leaves the cut at 30–70%.

Attack:
1. Main mints one cheap design and lists it in their stall.
2. Every alt spends its entire balance buying copies.
3. At a 70% cut, an alt with 100,000 Stars of lifetime earnings delivers 70,000 to the main.

This is not manufacturing value from nothing, which is the only thing §Anti-abuse tells the reader to
audit for. It is *transfer*, and transfer is precisely what pillar 2 claims is impossible. The stall
also has no stated supply limit, so the pump is unbounded.

**Fix.** Cap the creator cut a single buyer can deliver to a single creator — 500 Stars per buyer per
creator per 30 days is generous for a real fan and useless for a farm. Route the excess to the sink
rather than to the creator, so the buyer still gets the item and the launderer gets nothing. Feed the
same counterparty-pair budget from R-01. Set the cut at the low end, 30%, until the ledger has run
against real traffic.

### R-06 — CRITICAL — One wash sale moves the 7-day index six-fold and pays for itself

GAME.md §Trade: "anonymous order book, cheapest listing sells first, 7-day average price shown."
Neither the averaging method nor a minimum sample size is stated, so the plain reading is a mean over
sales in the window.

Arithmetic. An item trades at 500 Stars, 20 sales per week. Manipulator lists one at 50,000 and buys
it with an alt.

`(19 × 500 + 50,000) / 20 = 2,975` — the published "average" jumps **5.95×** off a single self-dealt
trade.

The manipulator's net cost is the progressive commission only, because the 50,000 comes back from the
alt. He has, in one action: transferred 45,000 Stars from alt to main, and repriced the public index
that every other buyer uses. Habbo's research notes price fixing by large holders as a recognised
community problem (habbo-hotel.md §3.1), and that was *without* an official price display to
poison.

**Fix.** Publish a **volume-weighted median**, not a mean. Require at least 5 distinct counterparty
pairs in the window or show "not enough trades" instead of a number. Drop sales outside 3× the median
before computing. Exclude any pair with prior trade history or a shared device cluster. Publish the
sample size next to the price so a thin market announces itself.

---

## B. Alt economics

### R-10 — MAJOR — Registration and achievement grants are a per-alt bounty

GAME.md §Faucets grants Stars at registration ("enough to furnish a starter room modestly") and
one-time Stars for achievements. Both are per account, both land in a wallet the alt immediately
spends at the catalog, and both then transfer at 100% under R-01.

At Coke Music's post-2005 figure of 1,000, fifty alts is 50,000 Stars of goods for the cost of fifty
signups. Early achievements are the easiest thing in the game to script — enter a room, place furni,
say hello — so the real per-alt figure is higher than the registration grant alone.

**Fix.** Pay the registration bonus in **non-tradeable starter furni**, not Stars. It furnishes the
starter room exactly as intended and is worth nothing to a farm. Gate achievement Stars behind
milestones that require distinct real counterparties, and hold all of it non-tradeable until the
account clears the tenure threshold from R-01.

### R-11 — MAJOR — No payment rail means no payment fingerprint

GAME.md §Non-goals bans real-money purchases. §Anti-abuse asks for "device/payment-free alt
heuristics", which reads as an acknowledgement that the payment signal does not exist here.

That signal was the strongest alt discriminator Habbo had. Without it, and with free registration and
no stated phone or ID step, alt detection rests on device and IP alone. A VPN and a mobile carrier
NAT defeat both, and neither costs an attacker anything.

**Fix.** Stop trying to detect alts and make them worthless instead. R-10 removes the signup bounty,
R-04 caps the daily yield, R-01 caps the transfer. Layer one detection signal that is genuinely
expensive to fake: a **first-trade qualification** requiring the account to have received votes from
N distinct accounts that are themselves qualified. Farming that requires a real social graph, which
is the one input a pod cannot manufacture.

---

## C. Botting

### R-09 — CRITICAL — Server authority proves the score was achievable, not that a human achieved it

GAME.md §Official minigames bullet 1: "Server-authoritative. Outcomes are computed server-side, never
client-reported... Server authority removes that whole class of problem." The claim is inherited from
neopets.md line 26, which says a server-authoritative game "can skip (a)/(d) by construction" —
skipping impossible-score ceilings and leaderboard scrutiny.

That is a misread. Server authority kills *fabricated* scores. It does nothing about a bot that plays
the game properly. The server simulates from client inputs, and a headless client speaking the
protocol can generate frame-perfect inputs indefinitely. Solo arcade is the largest faucet in the game
(R-04), fully deterministic, and has no human in the loop to notice. It is the single best bot target
in the design, and the design has explicitly discarded the two defenses Neopets kept.

**Fix.** Keep the input trace for every scored play — the server already has it. Cluster traces per
account and across accounts. Bots are identifiable by what humans cannot do: reaction latencies
below human floor, zero variance across plays, and identical traces shared between accounts. Keep the
per-game plausibility ceiling as a cheap backstop. Keep the public leaderboard as the crowd-sourced
net, which costs nothing and worked for 25 years. Add server-side input jitter that a replay cannot
anticipate, so a recorded trace desynchronises rather than reproducing its score.

### R-30 — MINOR — Unspecified caps block the arithmetic

GAME.md §Faucets leaves the multiplayer daily cap as "(tune)" and never states how a *design* earns
votes at all. §Design minting describes purchase and a creator cut, and the faucet table separately
lists "Votes on your performance or design", with no mechanism connecting them.

Both gaps are load-bearing. If design votes come from a browse-and-rate surface, they are a pure click
farm with no cost whatsoever — strictly worse than R-03, because the attacker skips the 60-second
performance. If they come from purchases, they collapse into R-05. I cannot tell which, and neither
can an implementer.

**Fix.** State the mechanism, then price it. Design votes should require the voter to *own* the item,
which makes the minting fee and the purchase price the floor cost of a farmed vote.

---

## D. Collusion rings

### R-12 — MAJOR — Chart credit accrues from parallel rooms

GAME.md §Music keeps Coke Music's split verbatim: "Performer earns the Stars, creator earns the chart
credit". Coke Music limited this naturally, because one player could only be in one room.

Attack:
1. Creator authors one song and burns 40 CDs.
2. Ring distributes them to 40 members, who perform in 40 rooms at once.
3. Every vote in all 40 rooms credits the same creator's Top 40 position.
4. Each performer keeps their own Stars, so participation is paid.

The daily 350 cap limits each performer's *income*, and caps nothing about chart credit. A 40-person
ring outruns any organic creator by 40×, permanently. The prize is engraved permanent trophy furni
(§Status systems), and under R-23 that furni may be sellable.

**Fix.** Weight chart credit by **distinct voters**, not raw votes, and log-scale repeat voters from
the same room or the same performer. Cap the credit any single performer can generate for a creator
per day. Charts are a status leaderboard, so they can afford aggressive normalisation that a payout
system cannot.

### R-13 — MAJOR — The design endorses the vote-trading ring

00-synthesis.md §8 and coke-music.md §3.4 hold up "Free Greens" rooms — everyone queues, everyone
upvotes, downvoters get kicked — as the game's defining emergent institution, and GAME.md's pillars
adopt the constraint that produced them.

A Free Greens room is an organised vote-trading ring. In Coke Music it was harmless, because decibels
were bound with no exit. Here, votes become Stars, Stars become catalog goods, and goods are liquid
(R-01). The institution the design wants to encourage is also the industrial front-end of the
laundering pipeline, and it decouples the vote faucet from quality entirely.

I am not recommending banning it. It is the best social feature in the source material.

**Fix.** Let the ring exist, and make it pay in reputation instead of currency. Apply the R-03 decay
so a room of regulars stops paying Stars after the third mutual vote, while chart credit keeps
flowing. Free Greens then survives as the newcomer on-ramp it was, and stops being a mint.

### R-14 — MAJOR — Two accounts beat the competition sit-out rule

GAME.md §Room competitions: "Winners sit out the following week." The rule bars the winning *account*
for exactly one week.

A ring of two alternates: A wins week 1, B wins week 2, A wins week 3. 100% win rate, indefinitely,
with two accounts. The judging method is never stated, which matters — if it is player-voted, ring
size decides everything and R-03's vote farm applies directly.

The prize compounds beyond status. §Room competitions calls Navigator featured placement "the real
prize", and §Design minting puts the player's sales stall in their room. Winning a competition is
therefore a sales funnel, so brigading has a direct revenue payoff, not just a trophy.

**Fix.** Scale the sit-out with win count — 1 week after the first win, 4 after the second, 12 after
the third. Reserve a fixed share of featured slots for rooms that have never placed. If judging is
player-voted, require voters to have visited the room, and drop votes from accounts that share a
device cluster or a trade-graph component with the entrant.

### R-15 — MAJOR — Both sides get paid, so win trading is free money

GAME.md §Official minigames: "Everyone gets paid, winners get paid more", plus a ranked ladder with
seasons and monthly brackets. The forfeit rules cover disconnects and AFK, and say nothing about
deliberate throwing.

Attack: two accounts queue at low-population hours, meet by design, and one resigns immediately. Both
collect participation, the winner collects the win bonus and ladder points, and the pair alternates so
both ladders climb. Match length is under a minute, so the loop runs to the daily cap. Season trophies
are permanent furni.

**Fix.** Pay Stars for at most the first 2 matches against a given opponent per day, and 0 after that.
Require a minimum match length and a minimum number of meaningful actions before a match qualifies for
payout. Gate season trophies behind a minimum count of distinct opponents. The server has full match
logs, so add resignation-timing and move-quality-collapse detection — it is cheap and the data is
already there.

### R-16 — MAJOR — Social deduction is the softest target in the design

GAME.md §Official minigames tier 3 defines scheduled lobbies of 8–12, server-dealt roles, filtered
chat, and moderator tools. The doc concedes there is no precedent. Three separate attacks land:

1. **Lobby stacking.** If players can queue as a group, five friends in a ten-player lobby control
   every vote. The design does not say whether group queueing exists.
2. **Out-of-band comms.** A ring on voice chat sees every role. This is undetectable in principle and
   is the known failure mode of the whole genre.
3. **Paid for presence.** Participation pays, so a bot that walks randomly and votes randomly clears
   the AFK forfeit timer and farms the faucet with no gameplay at all.

Role-based harassment also passes the filter untouched, because targeted abuse inside a role uses
clean words.

**Fix.** No group queueing. Server-shuffled lobbies, with a hard limit of 2 accounts that have shared
a recent lobby. Make the participation payout contingent on qualifying actions — a vote cast, a task
completed, a report filed — and on a minimum round length, so instant self-reporting and random
walking both pay zero. Keep the ladder and trophies as the real prize and the Stars small, which
prices out ring farming without policing speech. Attach the full transcript and role log to the report
button, so a moderator sees who knew what.

---

## E. Trade and marketplace

### R-07 — CRITICAL — Players can mint visual counterfeits of the game's most valuable items

GAME.md §Trade builds the preview + delay + confirm window, which kills last-instant item swapping.
PIPELINES.md §2 stage 4 lists the automated gates: "Palette compliance, grid alignment, silhouette
contrast against both floor tones, footprint sanity, animation frame bounds." Stage 5 sends names and
descriptions through the profanity filter and the sprite through image screening.

None of those gates asks the only question that matters for trade safety: **does this look like
something expensive?**

Attack:
1. Attacker explores the generator until a recipe renders close to a Limited Edition or a chart trophy
   at 64 × 32 and at 32 × 16.
2. Pays the minting fee, names it to match, and passes every stated gate.
3. Offers it in a trade. The victim previews a sprite that looks correct, waits out the delay, and
   confirms.

The preview window defends against a swap. It does not defend against an item that is a convincing
forgery for the whole duration of the preview. This is strictly worse than anything Habbo faced, where
counterfeits were limited to items Sulake had chosen to make. Here the counterfeit factory is a
shipped player feature with an "effectively infinite catalog" (PIPELINES.md §2) behind it.

**Fix.** Two changes, both cheap.
1. Add a **similarity gate**. Perceptual-hash every rendered sprite at both scales at mint time and
   reject anything within a distance threshold of a catalog item above a value or rarity floor. That
   is a hash comparison against a few thousand items, and it belongs in stage 4 next to the other
   automated gates.
2. Put **provenance in the trade preview**, not just pixels. Every item shows origin (official or
   player-minted), creator username, mint date, and serial where one exists. When an offered item is a
   near-match to an official item, the confirm step shows the difference explicitly rather than making
   the victim spot it.

### R-08 — CRITICAL — Recipe exclusivity is undefined, and both readings are fatal

PIPELINES.md §2 defines a design as "a recipe: `archetype + part selections + palette ramp + pattern +
seed`" and notes recipes are "small, deterministic, and cheap to store". GAME.md §Design minting says
minting makes it "a purchasable catalog item in the player's own stall". Neither doc says whether
minting a recipe claims it.

If minting **is** exclusive: the recipe space is finite and enumerable — a bounded product of
archetypes, parts, ramps, patterns, and seeds. A bot mints the desirable region of it and owns the
catalog before any human player finds a good combination. Seed squatting becomes the game.

If minting is **not** exclusive: the moment a design sells well, anyone reads its recipe off the
rendered item, re-mints it, and undercuts the creator. The creator economy is the stated survival
mechanism in 00-synthesis.md — "players who create and sell content outlive players who only arrange a
catalog" — and instant cloning removes any reason to create.

**Fix.** Neither extreme. Grant a **time-boxed exclusive** — 90 days from mint, after which the recipe
opens to anyone but the original creator keeps a permanent attribution credit and a residual share of
later mints. Rate-limit mints per account per day so enumeration is uneconomic. Require a minimum
parameter distance between a new mint and any live exclusive, which also feeds the R-07 similarity
gate.

### R-17 — MAJOR — Trust and lending trades walk straight through the trade window

habbo-hotel.md §3.4 states it plainly: trust trades and lending scams are "not solvable by UI; needs
either escrow or acceptance." GAME.md §Trade ships preview, delay, and confirm, and takes no position
at all on the case where the victim knowingly hands over items for nothing.

This was endemic on Habbo and drove real-world police involvement. Our design has more surface, not
less, because the design stall gives a scammer a plausible business reason to ask for goods up front.

**Fix.** Pick acceptance and say so loudly at the moment it matters. When a trade is one-sided, the
confirm step names it: "You are giving 12 items and receiving nothing. Staff cannot recover items you
give away." Then ship the sanctioned alternative so the demand has somewhere to go — a **lending mode**
in the trade window with a server-enforced return timer that reverts ownership automatically. That
turns the most common scam pretext into a safe supported action.

### R-18 — MAJOR — Free listings plus cheapest-first plus anonymity is a bot's market

GAME.md §Trade: listing runs free, buyers always take the cheapest listing, and the book is anonymous.
Commission falls on sale only.

Two attacks follow.
- **Sniping.** A bot polls the book and instantly buys anything underpriced, then relists at the
  index. A newcomer who prices below market never sells to a player, only to a bot. This is Neopets
  restocking, which needed dedicated restock bans (neopets.md §2).
- **Book-walling.** Listing costs nothing and cancellation costs nothing, so a cartel floods the book
  with high-priced listings. Cheapest-first means buyers cannot route around the wall. Combined with
  R-06, the cartel sets both the visible supply and the published index.

**Fix.** Charge a small listing deposit, refunded on sale and forfeited on cancellation — that alone
prices out both flooding and instant relisting. Add a short randomised delay between listing and
visibility so a bot cannot beat a human to a fresh listing. Cap active listings per account per item.
Show book depth rather than only the cheapest, so a wall is visible as a wall.

### R-20 — MAJOR — No stated recovery path for a stolen account

habbo-hotel.md §3.4 names phishing as the largest scam vector Habbo faced. GAME.md §Safety covers
filtering, reporting, and moderation, and says nothing about compromised accounts. PIPELINES.md §5
gives us the thing that makes recovery possible — item instance IDs with ownership history — and never
connects it to a policy.

Permanent usernames (§Safety) raise the stakes, because a good name is itself an asset and cannot be
reissued.

**Fix.** State the restitution policy and build the tool alongside the ledger, not after the first
incident. Reverse item transfers within a bounded window on a confirmed compromise. Lock trading for
24 hours after a password or email change. Require a second factor before trades above a value
threshold. All of this is straightforward once R-02 puts item transfers in the same log as Stars.

---

## F. Emergent gambling

### R-19 — MAJOR — Trust-settled betting rebuilds casinos out of sanctioned parts

GAME.md pillar 3 and §Official minigames ban player-run wagering, and place the server as adjudicator
of every payout. That removes the *house*, and does nothing about the *bet*.

Every server-adjudicated outcome in the design is a betting substrate, and the settlement layer is the
trade window:
- Ranked tactics matches. Two spectators at the rail agree a stake, and the loser trades over a rare.
- Social deduction lobbies. Spectators bet on whether the impostor wins.
- Solo arcade scores. "Beat my score by Friday or you owe me a Throne."

The house edge moves to whoever organises and whoever defaults. Reputation replaces escrow, and the
trade window is a perfectly good settlement rail. Habbo's own position — casino rooms as a theme are
fine, betting on a random outcome is banned (habbo-hotel.md §3.3) — is the exact line we are drawing,
and it did not hold there.

The design has no detection story for this, because the bets settle in goods and R-02 means goods do
not reach the anomaly detector.

**Fix.** Accept that it will happen and instrument it, rather than legislating in prose. Once R-02
lands, the signature is obvious and queryable: **one-sided item transfers that cluster in time
immediately after a match result, between accounts that shared a room or a lobby.** Ship that query at
launch. Enforce against organisers running it at scale, not against two friends with a side bet,
because chasing the latter costs more moderation than it saves. Then starve the rest by giving the
same players a sanctioned high-stakes outlet — Open question 1 already lists museum donation wings and
prestige untradables, and this finding is the argument for deciding it before launch rather than after.

### R-25 — MINOR — The operator runs the lotteries it bans

GAME.md §Non-goals bans "player-run wagering or chance-based payouts". The same document ships a
**daily spin** (§Dailies) and **random serial assignment** on limited editions (§Sinks), where
habbo-hotel.md §3.2 confirms low serials command real resale premiums.

Random serials are a lottery with a tradeable payout. Buy at the fixed price, roll a serial, resell the
bad ones. A farm buys the entire stock to harvest the low serials, which is exactly the outcome the
randomised serial was introduced to prevent.

A rule the operator visibly breaks is hard to enforce against players, and moderators will spend their
time arguing the distinction.

**Fix.** Rewrite the non-goal to say what it means: **players may not run wagering, and payouts to
players are never contingent on a random outcome the player pays to trigger.** Official chance
mechanics stay, with published probability tables — Decibel's revival did this and coke-music.md
records it as an improvement. Cap LTD purchases per account per release so serial farming is not worth
the capital.

### R-26 — MINOR — "Chance furni exists for decoration only" is undefined

GAME.md §Trade contains the whole rule in one sentence. It has two readings. Either the furni is inert
and only looks like a dice, or it still produces a visible random outcome and players are merely
forbidden to bet on it.

The second reading is Habbo's exact position after April 2014, and it required a hard limit of 3
chance items per room to be even partly enforceable. If we ship a visible random number generator into
player rooms, casinos return in week one, using trust settlement per R-19.

**Fix.** State the first reading. Chance-themed furni animates and never emits an outcome any player
can read. If the roulette wheel does not stop on a number, there is nothing to settle against.

---

## G. Griefing

### R-21 — MAJOR — Queue squatting survives server-enforced arbitration

GAME.md §Music: "Queue arbitration is server-enforced (Coke Music never fixed line-cutting)." That
fixes ordering. It does not fix a griefer who queues legitimately.

Attack: join the queue, perform 60 seconds of a single silent sample, rejoin the back of the queue,
repeat. Nothing in the design stops it, because every step is legal. On a stage with a documented queue
length in the 11–16 range (coke-music.md §3.2), three coordinated griefers hold a meaningful share of
every rotation indefinitely, and the venue dies.

**Fix.** Per-account cooldown on a public stage — after performing, you cannot rejoin that stage's
queue until either K minutes pass or M other players have performed. Give the room owner a queue-kick
right, matching the kick/ban rights pillar 1 already grants.

### R-24 — MAJOR — A wordlist filter does not stop targeted harassment

GAME.md §Safety runs the filter over "chat, usernames, room names, descriptions, and design names",
rejecting names and substituting chat. A wordlist catches profanity. It does not catch a room named
after a real player with a clean insult attached, sitting in the Navigator where that player's friends
will see it. Design names carry the same payload into the catalog.

Impersonation is worse, because §Safety also makes usernames permanent. A homoglyph or near-miss
username is a permanent impersonation asset, and it is the natural setup for the trust scam in R-17.

**Fix.** Run a similarity check at username registration against existing accounts, not just a
wordlist — reject near-misses outright, since a permanent name has to be right the first time. Let
players report a room name and a design name directly, and auto-delist from the Navigator and the
catalog on N reports pending human review, keeping the room reachable by direct link so a false
positive costs the owner nothing.

### R-27 — MINOR — Symmetric ignore erases game state

GAME.md §Safety: "Symmetric ignore: erases the ignored player's avatar and actions from your view."
That is the right behaviour in a social room, and the wrong behaviour in a ranked match or a deduction
lobby, where actions *are* the game. A player who ignores an opponent sees a desynchronised board. A
deduction player who mass-ignores denies themselves information and then reports the game as broken.

**Fix.** Carve out adjudicated games. Inside a match or lobby, ignore suppresses chat and leaves
game-relevant actions visible. Say so in the ignore confirmation so the behaviour is not a surprise.

### R-28 — MINOR — Avatar collision and stage blocking are unaddressed

coke-music.md §1.4 names stage blocking — players physically obstructing stage access — as one of the
bugs that drove v2's decline. GAME.md fixes queue *ordering* and never says whether avatars collide,
or how a queued performer reaches the stage.

If avatars block movement and the performer walks to the stage, a wall of griefers takes the venue
offline. If they do not collide, several other social behaviours change.

**Fix.** Teleport the queued performer onto the stage rather than walking them. It removes the attack
completely and leaves the collision question free to be decided on social grounds.

---

## H. Minting economy

### R-22 — MAJOR — Flooding the moderation queue is nearly free

PIPELINES.md §Player design studio: "Rejected mints refund the fee minus a small processing sink."
PIPELINES.md §2 stage 5 routes flagged items to a human review queue. GAME.md §Safety and
00-synthesis.md both name moderation as the project's top existential risk.

So the cheapest way to hurt the game is to submit borderline mints at volume. Each one costs the
attacker a small processing sink and costs us a human decision. Scripted through the design studio,
one attacker generates review work faster than a moderation team can clear it, and the queue that
protects the catalog becomes the bottleneck that stops legitimate creators publishing.

**Fix.** Make the fee non-refundable once an item reaches human review, and refund in full only on
automated-gate rejection, which is instant and cheap. Rate-limit submissions per account per day. Track
a per-account rejection rate and raise both the fee and the rate limit as it climbs, so a first
mistake is free and the hundredth is expensive.

### R-23 — MAJOR — Trophy tradeability is undefined

GAME.md §Status systems lists engraved trophies from charts, competitions, and minigame seasons, all
carrying date, username, and deed. Nothing says whether they trade. §Sinks makes limited editions
tradeable, which sets the reader's default expectation the wrong way.

If trophies trade, the entire status layer becomes laundering inventory. The ring in R-12 converts
chart wins into sellable goods, the ring in R-14 does the same with competition trophies, and a
wealthy player buys a room full of achievements engraved with other people's names. Status stops
meaning anything, which contradicts pillar 5 outright.

**Fix.** Trophies are non-tradeable and bound to the account, permanently. Say it in §Status systems.
Follow Neopets, where a trophy survives everything and can only be upgraded. If a secondary market for
prestige objects is wanted, that is what limited editions are for.

### R-29 — MINOR — Room promotion has no stated payer rule

GAME.md §Sinks lists "Room promotion slots (2-hour Navigator feature, cheap)" and never says whether
an account can promote a room it does not own.

If it can, this is another transfer channel. A pod spends alt Stars on promotion slots for the main's
room, chain-promoting it around the clock. The main receives traffic, and under §Design minting traffic
converts to stall sales. Stars have moved from alts to main via the Navigator.

**Fix.** Only the room owner or a member of the room's group may buy a promotion slot, and cap slots
per room per day so the Navigator's featured rotation stays a rotation.

---

## Attacks tested that the docs already defeat

Listed so they are not re-reviewed, not as praise.

- **Last-instant item swap on trade.** Preview + forced delay + confirm (§Trade) closes it.
- **Fabricated minigame scores.** Server authority closes it. Input replay does not — see R-09.
- **Stage line-cutting.** Server-enforced queue arbitration closes it. Squatting does not — see R-21.
- **Direct currency trading between accounts.** Bound Stars close it. Laundering through goods does
  not — see R-01.
- **Minting as a slot machine.** PIPELINES.md §Player design studio previews the design at both scales
  *before* the fee is charged, so there is no roll to gamble on.
- **Client-side duplication.** Item instance IDs with ownership history and transactional state changes
  (PIPELINES.md §5) close the exploit that killed Coke Music v2.
