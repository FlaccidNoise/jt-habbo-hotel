# Habbo Hotel — Research for a Modern Habbo-like Game

Research date: 2026-08-03. Sources cited inline. Claims are marked `[HIGH]`, `[MEDIUM]`, `[LOW]`, or `[UNVERIFIED]`.

Confidence key:
- `[HIGH]` — read directly from source code, or from a primary/news source.
- `[MEDIUM]` — community wikis (Habbox Wiki, Habbo Fandom) or official help pages, single source.
- `[LOW]` — inferred, or from a low-quality aggregator.
- `[UNVERIFIED]` — I could not find a supporting source. Do not build on these.

---

## 0. Design implications first

The findings that should shape the build, in rough priority order:

1. **The room is the product, not the world.** Habbo has no shared overworld to traverse. Players teleport between rooms via a Navigator list. Every room is a separate server-side instance with its own rules, host, and social contract. This is why it scaled socially — you get thousands of parallel small-group experiences rather than one crowded space.
2. **Wired is the real retention engine, and it is a full visual programming language.** Modern Wired has five box categories (Triggers, Effects, Conditions, Selectors, Add-Ons), scoped variables with math operators, signal-passing for control flow, and set operations (union/intersection) over selections. Players build entire games inside it. Underestimating Wired's depth is the single biggest way to build a shallow Habbo clone. See §1.6.
3. **Two-currency design with a hard wall.** Purchased currency (Credits) buys tradeable goods; earned currency (Duckets) buys only non-tradeable, mostly *rented* goods. The wall is what keeps the player-to-player economy from being inflated by grinding. See §1.3.
4. **Scarcity is manufactured and it works.** Rares are catalogue items withdrawn permanently; LTDs are serial-numbered with a hard supply cap. Both created a decade-long secondary market. But scarcity also produced the gambling economy that Sulake later had to amputate. See §3.
5. **The projection is exactly 2:1 dimetric on integer pixels.** One tile step is ±32px horizontal, +16px vertical; one height unit is 32px vertical (at zoom 1). Verified from renderer source. See §4.1.
6. **Moderation is an existential design constraint, not a feature.** The 2012 Channel 4 report halved the user base within months and cost Sulake two investors. Design chat, reporting, and room discovery assuming this risk from day one. See §2.4 and §5.2.
7. **Avatar rendering only needs 5 of 8 directions.** Directions 4, 5, 6 are horizontal mirrors. Verified from source. See §4.3.

---

## 1. Core loop and mechanics

### 1.1 Public rooms vs guest rooms

**Public rooms** are built by Sulake, not customizable by players, and act as landmarks and traffic hubs `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo, https://habboxwiki.com/Public_Rooms). In February 2015 Public Spaces were removed and replaced with "Official Rooms" — rebuilt versions hosted on a staff account (`official_rooms`) using furniture available only to that account `[MEDIUM]` (https://habboxwiki.com/Public_Rooms).

That change is design-relevant: Sulake moved from hand-authored bespoke spaces to spaces built with (privileged) normal furniture, which cut content cost.

**Guest rooms** are player-owned. A player picks a pre-made layout or, with Builders Club, draws their own floor plan. Rooms can be locked, password-gated, or invite-only `[MEDIUM]` (https://habbo.fandom.com/wiki/Guest_room, https://en.wikipedia.org/wiki/Habbo).

Layout counts: one source says 29 total layouts with 13 exclusive to Habbo Club; another says 12 standard plus 23 HC for 35 total `[LOW]` — these conflict and neither is authoritative (https://habbo.fandom.com/wiki/Guest_room). Treat the exact count as unknown; the design point is "a fixed library of stock layouts, with custom floor plans behind a paywall."

### 1.2 The furni catalogue

Furni is the core content unit and the core monetization unit. Bought from the Catalogue with Credits, Duckets, or Diamonds; also won from games, earned in events, or traded `[MEDIUM]` (https://habbo.fandom.com/wiki/Furni, https://habboxwiki.com/Furni).

Furni categories that matter mechanically:
- **Decorative** — floor and wall items, stackable.
- **Functional** — doors, gates, teleports, seating, beds, handitem vendors.
- **Wired** — the programmable logic boxes (§1.6).
- **Game furni** — Freeze/Battle Banzai tiles, counters, scoreboards.
- **Rentable** — Ducket-purchased, expires after 7 days, extendable `[MEDIUM]` (https://help.habbo.com/hc/en-us/articles/360011512800-Duckets).

### 1.3 Currencies

| Currency | How obtained | What it buys | Tradeable output? |
|---|---|---|---|
| **Credits** (coins) | Bought with real money (card, SMS, phone); also earned via partner offers/surveys and, since the 2020 Unity client, via avatar level-up goals | Furni, Habbo Club, most catalogue items | Yes |
| **Duckets** | Earned only — achievements, daily-login streaks, quests. Capped balance | Effects, pets, *rented* furni (Base, Cubie, Pura, Windows, Automobile lines), wallpaper/flooring/landscape, 2-hour room promotions (15 Duckets) | No |
| **Diamonds** | Granted as a bonus when buying Credits — 1 Diamond per Credit purchased, plus a 120-Diamond bonus per 120 Credits bought in the same month | Rares, Credits, diamond-priced shop items, HC membership | Yes (the items are) |

Sources: https://habbo.fandom.com/wiki/Currency, https://help.habbo.com/hc/en-us/articles/360011512820-Diamonds, https://help.habbo.com/hc/en-us/articles/360011512800-Duckets, https://en.wikipedia.org/wiki/Habbo `[MEDIUM]`.

**Currency history** `[MEDIUM]` (https://habboxwiki.com/Pixels, https://habboxwiki.com/Duckets):
- **Pixels** introduced November 2008 as the free currency; removed June 2012 "due to a general lack of interest."
- **Duckets** replaced them January 2013 (one source says 21 January, another 21 February — the month is uncertain `[LOW]`).
- The key design change between them: Pixels could buy a permanent "Pixel line" of furni; Duckets deliberately cannot buy permanent catalogue furni, only rentals and consumables, and are balance-capped.

That is the load-bearing lesson. Sulake tried a free currency that bought permanent goods, and replaced it with one that cannot. **Earned currency should buy experiences and temporary goods; purchased currency should buy assets.**

**Exchange furni**: Credits can be converted into a furniture item ("Exchange") that is itself tradeable and redeemable back into Credits `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo). This is effectively a bearer instrument — it let Credits circulate player-to-player without a direct currency-trading feature, and it became the de facto unit of account in the rare economy.

### 1.4 Trading

Direct player-to-player trade via a two-sided trade window. History `[MEDIUM]` (https://habbo.fandom.com/wiki/Trade, https://habbo.fandom.com/wiki/Scam):
- Originally trades executed **immediately** on agreement. This enabled "quick-trading": swapping in a visually similar item at the last instant (the classic example being a Petal Patch swapped for a grass patch).
- Sulake added a short cooldown, then a full confirmation step: hover-preview of each item plus a ~3-second timer after Accept, cancellable at any point, before the trade commits.
- Items carry a tradeable flag, shown in inventory as either a hands icon with a count or a prohibited sign. Pets, presents, Builders Club furni, and various promotional items are non-tradeable.

Design note: the "confirm after a forced delay, with a preview" pattern is the minimum viable anti-scam trade UI. Build it first, not later.

### 1.5 The Marketplace

An asynchronous, anonymous order book layered on top of direct trading `[MEDIUM]` (https://help.habbo.com/hc/en-us/articles/360011512540-The-Marketplace, https://habboxwiki.com/MarketPlace):
- Seller lists an item and sets a price. The UI shows the **average price over the last 7 days** for that item — a deliberate price-discovery aid.
- Buyers always purchase the **cheapest available** listing.
- Listing is free; a **progressive commission** is charged on sale, minimum 1 Credit, rising as a percentage with sale price (much steeper at 60,000c+ than at 100c).

The progressive fee is a sink aimed squarely at the high-value rare trade — it taxes whales, not newcomers, and pulls Credits out of circulation where inflation is worst.

### 1.6 Wired — the programmable furni system

This is the most under-appreciated part of Habbo and deserves the most design attention. Sources: https://wired.miraheze.org/wiki/Triggers, /Effects, /Conditions, /Selectors, /Addons `[MEDIUM]` (community-maintained but detailed and internally consistent); https://help.habbo.com/hc/en-us/articles/360011620099-What-is-Wired-Furni `[MEDIUM]`.

A Wired program is a **stack** of boxes on a single tile. Boxes come in five categories:

**Triggers** (23 documented) — the event sources. `User Walks on Furni`, `User Walks Off Furni`, `User Says Keyword`, `User Performs Action` (wave/kiss/laugh/thumbs-up/awake/idle/sit/stand/lay/sign/dance), `User Enters Room`, `User Leaves Room`, `User Stuff Collision`, `Furni is Used`, `User Clicks Furni`, `User Clicks Tile`, `Repeat Effect (Short)` (50–500ms), `Repeat Effect` (0.5–60s), `Periodically Long` (5s–10min), `Bot Reaches User`, `Bot Reaches Furni`, `At Set Time`, `Counter Reaches Set Time`, `Game Starts`, `Game Ends`, `Score is Achieved`, `Furni State is Changed`, `Receive Signal`, `Variable Changed`.

**Effects** (~40 documented) — the actions. Furni manipulation (`Move and Rotate Furni`, `Match Furni to Position & State`, `Set Furni Altitude`, `Move Furni to Furni`, `Move Furni to User`, `Relative Furni Movement`, `Move Furni Towards/Away From Nearest User`, `Toggle Furni State`, `Toggle Furni to Random State`), user manipulation (`Teleport to Furni`, `Move User to Furni`, `Move And Rotate User` in 8 directions, `Freeze User`, `Unfreeze User`, `Kick User`, `Give Handitem`), team/scoring (`Join Team`, `Leave Team`, `Give Points`, `Give score to a predefined team`), bots (`Bot Moves to Furni`, `Bot talks to all users`, `Bot talks or whispers to user`, `Bot follows user`, `Bot changes clothes`), timing (`Control Counter`, `Adjust Counter Time`), control flow (`Execute Wired Stacks`, `Send Signal`, and **negative variants** `(Negative) Execute Stacks` / `(Negative) Send Signal` which fire only when a condition in the stack is *not* met — i.e. if/else), and variables (`Give Variable`, `Remove Variable`, `Change Variable Value` with math operators).

**Conditions** (~25 documented) — guards on the stack. Furni state/position/altitude matching, `Triggering User is on Furni`, `Triggerer Matches` (Bot/User/Pet), `User Direction`, `Group Member`, `User has handitem`, `User is in Team X`, `Team Has Score`, `Team Is Winning`, `Time Matches` and `Date Matches` (with timezone), `User Count in Room`, `Selection Amount`, `Can Perform Movements` (a look-ahead guard that prevents partial execution when one item in a group would be blocked), plus negated variants.

**Selectors** (~24 documented) — set construction, and the most sophisticated part. `Furni in Area` (drawn rectangle), `Furni in Neighborhood`, `Furni by Type`, `Furni On Furni`, `Furni Picks`, `Users in Area`, `Users in Neighborhood`, `Users by Type/Action/Name/Group/Team`, `Users on Furni`, `Users with Handitem`, `Filter to X Users` / `Filter to X Furni` (unbiased subsampling), `Furni/Users With Variable` (with math comparison), `Furni/Users with Highest/Lowest Variable` (sorting), and `Remote selection` with explicit **Union** and **Intersection** semantics over other selectors.

**Add-Ons** (~13 documented) — modifiers on the stack. `Carry Users` (users ride moving furni), `Movement Physics`, `Cancel Move Animation`, `Animation Time`, `Execution Limit` (rate limiting — explicitly for when dozens of users spam the same keyword), `Random Effect`, `Unseen Effect` (execute each effect once before repeating), `At least one condition is true` (arbitrary N-of-M and NONE-of-M logic gates), `Username placeholder` and `Variable placeholder` for string interpolation into messages, `Variable capturer` (reads user text input into a variable), `Text Connector` (maps variable values to strings), `Execute In Order` (deterministic ordering, needed for arithmetic).

**Variables are scoped** to user, furni, context, or global, hold values, and support math operators `[MEDIUM]`.

Taken together this is a genuine programming environment: events, guards, typed collections with set algebra, scoped mutable state, arithmetic, string interpolation, user input capture, subroutines via signals, if/else via negative effects, and rate limiting. Any modern equivalent needs to plan for this expressiveness architecturally — retrofitting variables and signals onto a trigger/effect pair system is very hard.

### 1.7 Pets

Purchasable from the shop; players feed, scratch, and train them through levels, earning badges. Pets obey typed commands. Breeding was added via a purchasable breeding box; Terriers and Bears became breedable in 2013 `[MEDIUM]` (https://habbo.fandom.com/wiki/Pets, https://help.habbo.com/hc/en-us/articles/360011512700-What-are-Habbo-Pets). Pets are non-tradeable `[MEDIUM]`.

Pets are also first-class room actors — Wired triggers explicitly fire on pets ("Bots and pets work too" on the walk-on/walk-off triggers).

### 1.8 Badges and achievements

Badges are the reward and identity layer. Earned from achievements (nine achievement categories), competition wins, quest chains that route players through many rooms, group membership, and staff grants `[MEDIUM]` (https://habboxwiki.com/Badges). A player displays **5 regular badges plus 1 group badge** on their profile/Inf-O-Stand `[MEDIUM]`.

Scale: badge-tracking fansites list roughly 12,000 badges on Habbo.com `[MEDIUM]` (https://www.habbowidgets.com/badges/com/8). The design point is that badges were used as the universal reward primitive for everything — events, quests, competitions, staff recognition — because they cost nothing to mint and cannot inflate the economy.

The forced scarcity of *display* slots (5+1) is what gives badges value. Unlimited display would kill it.

### 1.9 Groups

Player-created groups with a custom badge, a home room, and membership. Groups gate Wired conditions (`Group Member`) and selectors (`Users in Group`), which is what makes them mechanically real rather than cosmetic — a room can be programmed to behave differently for members `[MEDIUM]` (https://wired.miraheze.org/wiki/Conditions). Favouriting a group displays its badge on your profile `[MEDIUM]`.

### 1.10 Room competitions

"Room of the Week" (ROTW) is a recurring themed building contest: build a room to the week's theme, name it `[ROTW #] Theme`, submit a screenshot; winners get Navigator "Staff Picks" placement, a Room Trophy furni, a badge, plus currency `[MEDIUM]` (https://www.habbo.com/community/article/213/room-of-the-week). Placing winners are barred from placing the following week — an explicit anti-dominance rule.

Caution: the specific prize figures widely quoted (150,000 credits + 300 diamonds) come from retro-hotel articles, not from official Habbo `[LOW]` (https://www.habboon.pw/articles/6110-room-of-the-week-257). Do not treat those numbers as Habbo's.

Design point: the prize that matters is **Navigator placement**. Traffic is the scarce resource in a room-based game, and competitions are the mechanism for redistributing it away from incumbents.

---

## 2. Social design

### 2.1 Why rooms worked

Rooms succeeded as social spaces for reasons that are structural, not aesthetic:

- **Ownership creates hosts.** A room has an owner with kick/ban/mute rights. Self-policing scales in a way central moderation cannot.
- **Rooms are small.** Capacity limits force many parallel groups rather than one mob. (Exact default capacity `[UNVERIFIED]` — I did not find a reliable current figure.)
- **Building is the status game.** Furni arrangement is visible, permanent, and comparative. The Navigator plus room competitions turn building into a public leaderboard.
- **Rooms are programmable.** With Wired, a room is not just a set — it is a rules engine. That converts decoration into game design and gives builders an unbounded skill ceiling.
- **Discovery is a list, not a map.** The Navigator's categories (including a dedicated "Games & Mazes" category) route players by intent `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo).

### 2.2 The friends console

A persistent, room-independent messaging layer. It holds the friends list (online and offline), search, and chat. In V22 (May 2008) console chat was upgraded from a simple tool to tabbed instant messaging per conversation `[MEDIUM]` (https://habbo.fandom.com/wiki/Habbo_Console).

Friend-list size is a paid perk: 300 friends for free players, 1,100 for Habbo Club `[MEDIUM]` (https://habbo.fandom.com/wiki/Habbo_Club). Selling social graph capacity is unusual and worth noting.

### 2.3 Chat mechanics

- **Say** — normal speech bubble, visible to the room, with the speaker's username and avatar head.
- **Whisper** — private to one recipient in the room.
- **Shout** — bold/emphasised, wider reach. Bound to Shift+Enter.
- **Bubble styling** — the speech bubble's outline colour and the head background derive from the colours of the avatar's shirt, which makes speakers visually identifiable at a glance in a crowded room. Additional bubble styles are sold/HC-gated.
- **Colour codes** — HC members type `@red@`, `@blue@`, `@cyan@`, `@green@`, `@purple@` to colour their text.
- **Ignore** — blocks all chat and actions from a user, client-side, from your view.

Sources: https://help.origins.habbo.com/hc/en-us/articles/19491057022621-How-do-I-chat, https://habbo.fandom.com/wiki/Habbo_Console, https://www.habbo.com/community/article/28652/hc-exclusive-chat-bubbles, https://en.wikipedia.org/wiki/Habbo `[MEDIUM]`.

The shirt-colour-derives-bubble-colour detail is a genuinely good piece of design: it gives free, automatic speaker identification without any UI chrome, and it makes your outfit choice socially functional.

### 2.4 Filter and moderation history

The word filter replaces blocked content with the word **"bobba"** — covering profanity, slurs, email addresses, phone numbers, and long digit strings `[MEDIUM]` (https://habboxwiki.com/Bobba).

Timeline `[MEDIUM]` (https://habboxwiki.com/Bobba):
- **27 Feb 2008** — players over 13 could opt out of the filter.
- **Dec 2010** — Habbo announced removal of the word "bobba" as the filter replacement.
- **Sept 2012** — reverted; bobba reinstated and made **mandatory** after the Great Mute.
- **19 Mar 2014** — room owners could add custom words to a per-room bobba list.
- **Current** — Community Sift, a machine-learning filter that scores chat lines, flags suspicious sentences, and adapts to new bypass techniques.

Human moderation: the "Hobba" volunteer moderator programme ran from August 2000 until Sulake terminated it on **31 December 2005**, citing security issues and community growth, replacing it with paid staff `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo). In 2011 Habbo stated it tracked roughly **70 million lines of conversation per day** `[HIGH]` (https://en.wikipedia.org/wiki/Habbo); during the 2012 crisis the CEO cited **225+ moderators** `[HIGH]` (https://www.channel4.com/news/what-is-happening-in-habbo-hotel, https://feeds.bbci.co.uk/news/technology-18424400).

Common Sense Media rated Habbo **1 star out of 5** and did not recommend it for children of any age, describing it as dominated by "foul talk and sexy chat rooms" `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo).

**Volunteer moderation was abandoned for cause in 2005 and never came back.** If a modern equivalent plans community moderation, it needs a materially different trust model than Habbo's.

### 2.5 Player-run games

Entirely player-hosted, player-moderated, using bought furni. Rules vary per room `[MEDIUM]` (https://habbo.fandom.com/wiki/Falling_Furni, https://en.wikipedia.org/wiki/Habbo).

- **Falling Furni** — the oldest and most popular. Host drops furni; players avoid/collect. Player-hosted and player-moderated, so rules differ per room. Modern Wired supports it directly (the `Filter to X Furni` selector documentation explicitly cites "move just 5 of them into your Falling Furni arena").
- **Mazes** — built from walkable/blocked furni, often with teleports and gates.
- **Role-play agencies** — hospitals, police departments, military units, intelligence agencies, model/fashion agencies. Notably these ran a **wage economy**: agencies paid new players ~2 Credits every 6 hours as an income for newcomers `[MEDIUM]` (https://habbolegends.fandom.com/wiki/Agency_Culture). Sulake later ran an official "Agency and Roleplay Expo" `[MEDIUM]` (https://www.habbo.com/community/article/24447/agency-fair-applications).
- **Casinos and poker rooms** — see §3.3.

Official games shipped alongside these: Wobble Squabble, Lido Diving, Battle Ball, and the Cunning Fox Gamehall (noughts and crosses, battleships, chess, poker) in the Shockwave era. Battle Ball and Snow Storm were dropped in the Flash migration and replaced by Freeze and Battle Banzai "due to coding issues" `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo).

The role-play agency wage economy is the most interesting finding here — **players built a new-player onboarding and income system that the game itself did not provide.** That is a gap worth designing for deliberately.

### 2.6 Official events

Recurring seasonal campaigns anchor the calendar: Christmas (with an **Advent Calendar** giving a free gift daily), Habboween, Summer, plus themed campaigns (e.g. the Frozen-inspired "Winter Palace" at Christmas 2019) `[MEDIUM]` (https://habboxwiki.com/Christmas, https://habboxwiki.com/Gift_Calendar).

Cadence shift `[MEDIUM]` (https://habboxwiki.com/Gift_Calendar): timed free gifts were historically limited to July and December. A March 2020 campaign broke the pattern, and the resulting boost in engagement *and trading activity* made frequent timed free gifts standard afterwards.

That is a directly usable finding: **free timed drops increase secondary-market activity, not just logins.** Each year previous furniture lines are re-released alongside a new seasonal line — a deliberate lever on rare scarcity.

---

## 3. Economy

### 3.1 The rare-trading economy

The secondary market in withdrawn catalogue furni was the deepest economic system in the game, and it was almost entirely emergent — Sulake supplied scarcity, players supplied everything else (price discovery, valuation guides, brokers, trading rooms).

The **Throne** is the canonical case: distributed as a gift on 8 June 2002 alongside the samovar and holopod as ordinary furniture; it appreciated steadily, and by 16 April 2008 was trading at roughly **58 club sofas** `[MEDIUM]` (https://habboxforum.com/showthread.php?t=477087). Note the unit of account: prices were quoted in *other furni*, not Credits. A player-invented commodity standard emerged because Credits were purchasable and therefore inflationary, while club sofas were not.

Fansites ran published valuation lists, which functioned as the market's price index `[MEDIUM]` (https://habbox.com/rares/limited-edition-rares, https://habbofurni.xyz/en/). Price-fixing by large holders was a recognised community problem `[MEDIUM]` (https://habboblogging.wordpress.com/2015/09/29/price-fixing-what-it-is-and-how-to-avoid-it/).

### 3.2 Rares and Limited Editions

- **Rares** — normal catalogue furni permanently withdrawn from sale. Supply is whatever was bought before withdrawal, minus attrition. Can be re-released, which crashes prices.
- **Limited Editions (LTDs)** — introduced with the Easter 2012 promotion; the first was the **Black Leviathan** on **4 April 2012**. Each LTD is available for one week *or until stock sells out*, whichever comes first. Every unit carries a **unique serial number**, randomly assigned at purchase (not sequential by purchase order), and the serial materially affects resale value (low numbers command premiums). New LTDs released roughly every two months. Nearly all LTDs roughly doubled in price after selling out. Value also correlates with room footprint (tiles occupied) and appearance.

Source: https://habbo.fandom.com/wiki/Limited_Edition, https://habboxwiki.com/Limited_Edition_Rares `[MEDIUM]`.

The randomised serial is a smart detail — it decouples "bought first" from "owns #1", which prevents bots/whales from monopolising the desirable serials and creates a lottery layer inside the purchase.

### 3.3 The casino ecosystem and Sulake's response

Player-run casinos were a major economic sector, running on chance furni: Dicemaster (Holodice), Wheel of Fortune, Fortune Teller, Spinning Bottle. They employed staff, ran on rare stakes, and were among the highest-traffic rooms.

**The Gambling Ban, 7 April 2014** `[MEDIUM]` (https://habboxwiki.com/Gambling_Ban, https://habbo.fandom.com/wiki/Habbo_Economic_Crisis_2014):
- All chance items removed from the Catalogue, including Spinning Bottle and Holodice.
- A hard limit of **3 chance items per room**. Exceeding it disables *all* randomisers in that room.
- Sulake's stated position: casino *rooms as a theme* remain allowed; **placing bets on the outcome of a random element** is what is banned `[MEDIUM]` (https://help.habbo.com/hc/en-us/articles/360011513060-Guidelines-on-user-created-games-in-Habbo).

**Consequences** `[MEDIUM]` (https://habbo.fandom.com/wiki/Habbo_Economic_Crisis_2014): rare values fell sharply — Thrones dropped by 300–400 coins to roughly 200 coins. Many casino owners and casual players quit. This is documented on the community wiki as the "Habbo Economic Crisis 2014."

The lesson is uncomfortable but clear: **gambling was a large share of demand for rares.** Removing it removed the demand floor. A modern design should decide up front whether high-value scarce goods will have a sanctioned sink other than gambling — otherwise gambling will emerge to fill the role, and removing it later will crater the economy.

### 3.4 Scams

Scamming was endemic and drove repeated systems changes `[MEDIUM]` (https://habbo.fandom.com/wiki/Scam, https://help.habbo.com/hc/en-us/articles/360011619259-About-Scamming):
- **Quick-trading** — swapping a similar-looking item at the moment of commit. Fixed by the delay + preview + confirm flow (§1.4).
- **Phishing** — fake login pages harvesting credentials. This was the largest vector and is a client/website problem, not a game-mechanics one.
- **Trust trades / lending scams** — social engineering around items handed over "temporarily." Not solvable by UI; needs either escrow or acceptance.

Real-world consequence: police investigated Habbo furniture theft cases, including one involving virtual furniture worth thousands of euros `[HIGH]` (https://feeds.bbci.co.uk/news/10207486).

### 3.5 Earned vs purchased balance over time

The trajectory, in order:
1. **2000–2008** — Credits only. Pure pay-to-furnish.
2. **Nov 2008** — Pixels added as an earned currency that could buy a permanent "Pixel line" of furni.
3. **June 2012** — Pixels removed, cited as lack of interest.
4. **Jan 2013** — Duckets replace Pixels, deliberately weaker: balance-capped, no permanent catalogue furni, rentals and consumables only.
5. **Diamonds** — added as a *purchase-linked* bonus currency (earned by spending, not by playing), giving whales a separate ladder to exclusive goods without inflating the Credit supply.
6. **2020 Unity client** — Credits became earnable through avatar level-up goals, the first time the primary tradeable currency had a meaningful free faucet `[MEDIUM]` (https://habbo.fandom.com/wiki/Currency).

Read as a whole: Sulake spent a decade tightening the earned-currency valve, then reopened it in a controlled, achievement-gated way. The through-line is that earned currency must not be able to manufacture tradeable assets at scale.

---

## 4. Visual and technical

The strongest material here comes from the open-source Nitro client (`billsonnn/nitro-renderer`, GPL-3.0) and the Arcturus Morningstar emulator, both of which are faithful reimplementations of Habbo's client and server. Facts read directly from that source are `[HIGH]`.

### 4.1 Isometric projection — exact numbers

From `nitro-renderer/src/room/utils/RoomGeometry.ts` `[HIGH]`:

```
SCALE_ZOOMED_IN  = 64
SCALE_ZOOMED_OUT = 32
z_scale_internal = sqrt(1/2) / sqrt(3/4)  ≈ 0.816497
_scale           = scale * sqrt(0.5)       // 64 → 45.2548
```

From `nitro-renderer/src/nitro/room/RoomEngine.ts:3024` `[HIGH]`, the camera is constructed as:

```ts
const geometry = new RoomGeometry(scale, new Vector3d(-135, 30, 0), new Vector3d(11, 11, 5));
```

That is: **yaw −135°, pitch 30°, roll 0°**, with the camera located at room coordinates (11, 11, 5).

Deriving the resulting basis vectors from that direction and applying `getScreenPosition()` (which projects onto the x/y basis and multiplies by `_scale`) gives, at zoom scale 64:

| World step | Screen delta |
|---|---|
| +1 tile on X | **+32 px horizontal, +16 px vertical** |
| +1 tile on Y | **−32 px horizontal, +16 px vertical** |
| +1 unit on Z (height) | **0 px horizontal, −32 px vertical** |

Basis vectors: `X = (0.7071, −0.7071, 0)`, `Y = (−0.3536, −0.3536, 0.8660)`, `Z = (−0.6124, −0.6124, −0.5)`.

So a floor tile is a **64 × 32 pixel diamond** and one height unit is **32 pixels** — exact 2:1 dimetric on integer pixel boundaries. At `SCALE_ZOOMED_OUT = 32` everything halves: 32 × 16 tiles, 16 px per height unit.

The `z_scale_internal` factor of `sqrt(1/2)/sqrt(3/4)` exists precisely to make this land on integers: the Y basis has z-component `sqrt(3)/2 = 0.866`, and `0.866 × 0.816497 × 45.2548 = 32.0000` exactly. A 30° pitch alone would *not* produce a 2:1 grid — the z-scale correction is what does.

This is a fact worth copying verbatim. Pick 64×32 tiles and 32px height units, and the whole art pipeline snaps to a pixel grid for free.

### 4.2 Room grid and heightmap format

The room model is a **text heightmap**. From Arcturus Morningstar `RoomLayout.java` `[HIGH]` (https://git.krews.org/morningstar/Arcturus-Community/-/raw/dev/src/main/java/com/eu/habbo/habbohotel/rooms/RoomLayout.java):

```java
String[] modelTemp = this.heightmap.replace("\n", "").split(Character.toString('\r'));
...
String square = modelTemp[y].substring(x, x + 1).trim().toLowerCase();
if (square.equalsIgnoreCase("x")) {
    state = RoomTileState.INVALID;
} else if (Emulator.isNumeric(square)) {
    height = Short.parseShort(square);
} else {
    height = (short) (10 + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(square.toUpperCase()));
}
```

So the encoding is:
- Rows separated by `\r` (carriage return); `\n` stripped.
- `x` — no tile (void / not walkable).
- `0`–`9` — floor height 0 through 9.
- `a`–`z` — floor height 10 through 35 (case-insensitive).
- All rows must be the same length or the row is skipped. `mapSizeX` is taken from row 0's length; `mapSizeY` is the row count.

The `room_models` database table carries: `id`, `door_x`, `door_y`, `door_z`, `door_dir`, `heightmap`, `custom`, `wall_height` `[MEDIUM]` (https://devbest.com/threads/habbo-library-room-model.16979/, corroborated by the Java field list `[HIGH]`).

Door handling `[HIGH]`: the door tile is marked `allowStack = false`, and the server reconciles the door's Z with the tile in front of it, so entering avatars land at the right height.

Related client-side constants from `nitro-renderer/src/nitro/room/object/RoomPlaneParser.ts` `[HIGH]`:
```
TILE_BLOCKED               = -110
TILE_HOLE                  = -100
MAX_WALL_ADDITIONAL_HEIGHT =   20
```
And `LegacyWallGeometry.DEFAULT_SCALE = 32` with an internal working scale of 64 `[HIGH]`.

A plain-text, human-editable, diffable room format is a genuinely good decision — it made 20+ years of community room-building tooling possible.

### 4.3 The avatar figure system

A figure is a dot-separated string of `type-setId-colorId` triples, optionally with a second colour: e.g. `hd-180-1.hr-100-61.ch-210-66.lg-270-82.sh-290-80` `[MEDIUM]` (https://dev.to/trickstival/habbo-avatar-rendering-basics-4cg6).

The authoritative part-type list, from `nitro-renderer/src/api/nitro/avatar/enum/AvatarFigurePartType.ts` `[HIGH]`:

**User-selectable sets** (`FIGURE_SETS` — these are what appear in a figure string, 13 of them):
`sh` shoes · `lg` legs · `ch` chest · `wa` waist accessory · `ca` chest accessory · `hd` head · `hr` hair · `fa` face accessory · `ea` eye accessory · `ha` head accessory · `he` head accessory extra · `cc` coat chest · `cp` chest print

**Derived render parts** (not in the figure string; produced by the geometry/animation system):
`bd` body · `lh` left hand · `rh` right hand · `ls` left sleeve · `rs` right sleeve · `lc` left coat sleeve · `rc` right coat sleeve · `fc` face · `ey` eyes · `hrb` hair (big) · `li` left hand item · `ri` right hand item

`figuredata.xml` (converted to JSON in Nitro-era tooling) defines, per set type: the available part sets, which palette that set type uses, per-set metadata such as gender and club/HC requirement, and the colour list for the palette `[MEDIUM]` (https://dev.to/trickstival/habbo-avatar-rendering-basics-4cg6, https://github.com/billsonnn/nitro-renderer `[HIGH]` for the interface shapes `IFigureData`, `IFigureDataPalette`, `IFigureDataSetType`, `IFigureDataHiddenLayer`).

`IFigureDataHiddenLayer` is notable — the data format has first-class support for one part **hiding** another (a hat hiding hair, a coat hiding sleeves). Any clothing-layer system needs this from the start.

**Directions**, from `AvatarDirectionAngle.ts` `[HIGH]`:
```
DIRECTION_TO_ANGLE   = [45, 90, 135, 180, 225, 270, 315, 0]
DIRECTION_IS_FLIPPED = [false, false, false, false, true, true, true, false]
MIN_DIRECTION = 0, MAX_DIRECTION = 7
```
Eight directions, but directions **4, 5, and 6 are horizontal mirrors** of drawn art. Only 5 directions need original sprites. That is a ~37% saving on every clothing item, multiplied across thousands of items.

**Two render scales**, from `AvatarScaleType.ts` `[HIGH]`: `h` (large) and `sh` (small) — matching the 64/32 zoom levels. Art is authored at both sizes, not downscaled at runtime.

**Actions/postures**, from `AvatarAction.ts` `[HIGH]`: postures `std` (stand), `mv` (walk), `sit`, `lay`, `float`, `swim`; expressions `wave`, `blow` (blow a kiss), `laugh`, `cry`, `idle`, `respect`; gestures `sml`, `sad`, `agr` (aggravated), `srp` (surprised); plus `dance`, `sign`, `sleep`, `cri` (carry object), and game-specific ones (snowboard, snowwar).

### 4.4 Client history

| Period | Client | Notes |
|---|---|---|
| 2000/2001 – ~2009 | **Macromedia/Adobe Shockwave** | The original. Habbo Hotel: Origins recreates this era. |
| ~2009 – 2020 | **Adobe Flash** | Migration cost some games (Battle Ball, Snow Storm dropped; Freeze and Battle Banzai added). |
| Dec 2020 – | **Unity** (web) | Beta released Dec 2020 ahead of Flash EOL. |
| Feb 2021 – | **Adobe AIR** (alongside Unity) | Explicitly a stopgap: Sulake's product owner acknowledged the Unity client "was lacking key features and did not reflect the needs of the community." |

Sources: https://en.wikipedia.org/wiki/Habbo `[HIGH]`, https://habboxwiki.com/Client `[MEDIUM]`.

The AIR-client episode is a cautionary tale: a technically-motivated client rewrite shipped without feature parity, and the company had to ship a *second* legacy-compatible client to hold the community. **Feature parity with the thing players actually use is not optional in a client migration.**

### 4.5 Protocol and asset formats

**Legacy (Shockwave-era) protocol** `[MEDIUM]` (https://xabbo.io/docs/in-depth/packet-structure, https://github.com/habb0/docs, https://gist.github.com/Quackster/8ab898d6dcf0397a06b413f4ae1eb479):
- Text-oriented framing. Each message is a **two-character Base64-encoded header ID** followed by content.
- **Base64** here is radix-64 over ASCII, used for fixed-width integers (notably the header).
- **VL64 ("Wire")** is a variable-length, signed, radix-64 integer encoding; each character carries 6 bits, with the first character encoding length and sign.
- Fields are separated by control characters (`chr(2)`, `chr(13)`); a packet terminates with `chr(1)`.

Modern Flash/Unity-era Habbo uses a binary protocol with numeric message IDs; Nitro implements this as typed composer/parser classes under `src/nitro/communication/messages/` `[HIGH]`.

**Asset formats**:
- Legacy Shockwave assets were `.cct` cast files `[LOW]` — I did not confirm this from a primary source.
- Flash-era assets are **SWF** files per furni, containing a sprite sheet plus XML manifests (visualization data, logic data, index) `[MEDIUM]`.
- Nitro-era assets are **`.nitro` bundles**: a compressed container holding a `furniture.json` (asset/visualization/logic data) plus a `spritesheet.png` `[MEDIUM]` (https://github.com/billsonnn/nitro-converter, https://github.com/Bopified/Retrosprite). Converters exist in both directions — SWF → `.nitro` and `.nitro` → JSON/PNG for editing.

### 4.6 Reference projects — what to actually read

Verified activity as of 2026-08-03 via the GitHub and GitLab APIs `[HIGH]`:

| Project | What it is | Status | License |
|---|---|---|---|
| **[billsonnn/nitro-renderer](https://github.com/billsonnn/nitro-renderer)** | The rendering engine — room geometry, planes, avatar system, protocol messages. TypeScript + PixiJS. | Active, last push 2026-02-04 | GPL-3.0 |
| **[billsonnn/nitro-react](https://github.com/billsonnn/nitro-react)** | The UI layer on top of nitro-renderer. | Active, last push 2026-02-04 | (none declared) |
| **[Arcturus Morningstar](https://git.krews.org/morningstar/Arcturus-Community)** | The reference server emulator, Java. Room logic, Wired, pathfinding, economy. | Active, last activity 2026-07-16; latest release `3-5-5` (2026-01-30) | — |
| **[Quackster/Havana](https://github.com/Quackster/Havana)** | Java server targeting Habbo v31 (2009 Shockwave era). Best reference for the *legacy* protocol. | Active, last push 2026-06-30; 218 stars | AGPL-3.0 |
| **[billsonnn/nitro-converter](https://github.com/billsonnn/nitro-converter)** | SWF → `.nitro` asset conversion. | **Stale** — last push 2022-12-25 | GPL-3.0 |
| **[Holo5/nitro-docker](https://github.com/Holo5/nitro-docker)**, [Gurkengewuerz/nitro-docker](https://github.com/Gurkengewuerz/nitro-docker) | Turnkey Docker stacks (Arcturus + Nitro + DB). Fastest way to get a running reference hotel. | Active into 2026 | — |

Recommendation, in order of usefulness for this project:
1. **nitro-renderer** for all client-side geometry, projection, avatar, and asset questions. It is the single best-documented artefact of how Habbo actually renders.
2. **Arcturus Morningstar** for server-side room logic, the Wired execution model, and data schemas.
3. **Havana** only if legacy Shockwave-protocol behaviour matters (i.e. matching Origins).
4. A **nitro-docker** stack to run a live reference instance and inspect behaviour empirically rather than reading about it.

Note on licensing: nitro-renderer and nitro-converter are **GPL-3.0**, Havana is **AGPL-3.0**. Reading these to understand data formats is fine; copying code into a closed-source project is not. Arcturus, Holograph, and Phoenix all reimplement a proprietary protocol — the *formats* are not copyrightable, but derived code carries the licence.

Older projects (**Holograph**, **Phoenix**, **Plus Emulator**) appear repeatedly in historical documentation but are superseded; they are useful for archaeology, not as a codebase to build on `[MEDIUM]`.

---

## 5. History and business

### 5.1 Scale and monetization

- Founded **2000** in Finland by Sulake; expanded to nine language "hotels" with users from 150+ countries `[HIGH]` (https://en.wikipedia.org/wiki/Habbo).
- **200 million** registered accounts by January 2011 `[MEDIUM]` (https://www.gamedeveloper.com/game-platforms/-i-habbo-hotel-i-reaches-200-million-registrations).
- **316 million** registered avatars as of October 2020 `[HIGH]` (https://en.wikipedia.org/wiki/Habbo citing https://www.pocketgamer.biz/news/74772/).
- Peak concurrent engagement: **~9 million monthly visitors** before June 2012 `[HIGH]` (https://techcrunch.com/2012/11/27/after-losing-over-half-its-9m-users-in-a-pedophile-scandal-habbo-hotel-hopes-for-new-life-as-a-gaming-platform/).

Revenue:
- **$74 million** in 2008, up 20% year-over-year, from virtual goods plus advertising `[HIGH]` (https://techcrunch.com/2009/03/30/habbo-pulled-in-74-million-in-real-revenues-last-year-from-virtual-goods-and-advertising/).
- **€56.2 million** in 2010, up 20%+ `[MEDIUM]` (https://www.campaignlive.co.uk/article/habbo-hotel-parent-reports-20-revenue-growth/1063584).
- Peak around **$78.7 million** in 2011 `[LOW]` — this figure came from a search summary of Habborator/Grokipedia and I did not confirm it against a primary filing.
- **Average revenue per paying user over €22 (~$30)** in 2010 `[MEDIUM]`.

**Monetization model**: free to play, revenue from (a) Credit sales for furni, (b) Habbo Club subscription, (c) Builders Club subscription, (d) advertising and brand partnerships. Payment rails were deliberately teen-accessible — credit card, SMS, premium phone, and retail gift cards.

**Habbo Club (HC)** vs **Builders Club (BC)** `[MEDIUM]` (https://help.habbo.com/hc/en-us/articles/360011620299-What-is-Habbo-Club, https://help.habbo.com/hc/en-us/articles/360011621659-What-is-Builders-Club, https://habboxwiki.com/Builders_Club):

| | Habbo Club | Builders Club |
|---|---|---|
| Framing | Social/VIP status | Creative mode |
| Bought with | Credits (so, indirectly, earnable) | **Real money only** |
| Perks | Exclusive clothing, exclusive room designs, friend list 300 → 1,100, one exclusive furni per month of membership, coloured chat (`@red@` etc.), exclusive chat bubbles | Borrow from the BC furni warehouse, floor plan editor (custom room layouts) |
| Furni ownership | Kept permanently | Held only while subscribed, and **non-tradeable** |

The BC model is worth studying: rented, non-tradeable creative tools sold for cash. It monetizes builders without adding tradeable supply to the economy — the two subscriptions target different players and different economic roles.

### 5.2 The Great Mute, June 2012

The pivotal event in Habbo's history `[HIGH]`:

- **12 June 2012** — Channel 4 News aired a two-month investigation. A reporter posing as an 11-year-old girl found explicit sexual chat within minutes; the report described the game as "very sexual, perverse, violent, pornographic" (https://www.channel4.com/news/what-is-happening-in-habbo-hotel).
- **Within hours / 13 June** — Sulake **muted all chat across every hotel globally**. CEO Paul LaFontaine: "Due to the challenging behaviour of a few users we have decided to mute the site and will update you when we have more information." (https://feeds.bbci.co.uk/news/technology-18424400, https://habbo.fandom.com/wiki/The_Great_Mute)
- Sulake's defence: 225+ moderators, ~70 million lines of conversation tracked daily, and recognition as one of the safest social networks in a 2011 European Commission report.
- **Investors Balderton Capital and 3i withdrew their funding**; UK retailers pulled Habbo gift cards (https://www.channel4.com/news/high-street-shops-stop-selling-habbo-hotel-gift-cards).
- **19 June** — "The Great Unmute" announced: a new limited-chat system plus overhauled moderation. Finland went first as the test market. **6 July** — Habbo.com, the last hotel, regained limited chat.
- **September 2012** — the bobba filter reinstated and made mandatory.

**Outcome: monthly users fell from ~9 million to ~4 million** — over half the user base lost `[HIGH]` (https://techcrunch.com/2012/11/27/...). Habbo never recovered that scale.

### 5.3 What drove the decline

In rough order of impact:

1. **The 2012 safety crisis** — the single largest shock. Halved users, cost two investors and retail distribution, and permanently damaged the brand with parents `[HIGH]`.
2. **The 2014 gambling ban** — necessary, but it removed the demand floor under the rare economy and drove out casino operators and high-engagement traders `[MEDIUM]` (§3.3).
3. **Platform shift to mobile** — Habbo was built on Flash, which never worked on mobile and was fully deprecated by 2020. Teen attention moved to phones years before Habbo had a working mobile client `[MEDIUM]` (https://www.makeuseof.com/why-habbo-hotel-fell-from-grace/).
4. **Social media substitution** — Facebook, Instagram, Snapchat absorbed the "hang out with friends online" use case `[MEDIUM]`.
5. **Retro servers** — private servers gave players the old client, free furni, and no moderation, siphoning the nostalgic core `[MEDIUM]` (https://habboxforum.com/showthread.php?t=749659).
6. **Consolidation as symptom** — English-speaking hotels merged into Habbo.com by June 2010; the Danish, Norwegian, and Swedish hotels closed in 2015; the fansite ecosystem collapsed from many sites to essentially one `[MEDIUM]`.

Note the causal chain from #1 to #3: the safety crisis consumed engineering and executive attention through 2012–2014, exactly the window when a mobile client needed to be built.

### 5.4 Current state (2026)

**Ownership**: Azerion (pan-European gaming and adtech) took a 51% controlling stake in Sulake in 2018 and acquired the remaining 49% from Elisa Oyj in 2021, giving it full ownership. Habbo sits in Azerion's gaming content block alongside Woozworld and Governor of Poker `[HIGH]` (https://en.wikipedia.org/wiki/Habbo, https://www.habbo.com/community/article/28544/azerions-full-acquisition-of-sulake). Azerion reported Sulake revenues up 46% between January 2019 and December 2020 `[MEDIUM]`.

**Three clients run in parallel** `[HIGH]` (https://en.wikipedia.org/wiki/Habbo):
- **Habbo** — the main Unity client, aimed at teens and young adults.
- **Habbo X** — released December 2022, adult-oriented, "community building, interoperability, and play-and-earn mechanics." This is the Web3/NFT-adjacent product (https://www.azerion.com/habbox/). Its reception and current health are `[UNVERIFIED]` — I found announcements but no reliable engagement data.
- **Habbo Hotel: Origins** — released **June 2024**. A faithful restoration of the **2005** client on original Shockwave technology, adult-oriented, community-led. Sulake spent about six months restoring it after finding "an old decrepit server with some long-lost files" `[HIGH]` (https://www.pcgamer.com/games/mmo/habbo-hotel-origins-is-a-delightfully-strange-and-chaotic-time-capsule-from-the-internet-of-the-early-2000s-and-a-fresh-start-for-a-game-marred-by-controversy/).

**Origins on Steam** — released **15 October 2025**, free-to-play with cross-platform multiplayer. Peak **1,150 concurrent** Steam players on launch day; roughly 116 concurrent at the most recent reading, down ~21% over 30 days. Steam review score "Mixed" (~57/100 from ~1,184 reviews) `[MEDIUM]` (https://steamdb.info/app/3809900/, https://steambase.io/games/habbo-hotel-origins/steam-charts).

**Important caveat**: Origins is primarily browser-based. Steam concurrents measure only the Steam client and are a **floor, not a total**. Do not read 116 CCU as Origins' population.

**Scale today**: Product Director Mika Timonen cited 300+ million total registered users and **hundreds of thousands of monthly actives** across 150+ countries `[MEDIUM]` (https://en.wikipedia.org/wiki/Habbo). Hundreds of thousands MAU against 9 million monthly visitors at peak is roughly a 95% decline from peak engagement.

**The strategic signal worth noting**: Sulake's most-discussed recent product is a restoration of its own 2005 build. The company's own bet is that the 2005 design — simpler, smaller, more social — is what people actually wanted. That is directly relevant to designing a modern Habbo-like: the nostalgia is not for the feature set, it is for the *density of social contact* that the smaller, less-monetized game produced.

---

## 6. Open questions and unverified claims

Do not build on anything in this list without checking it first.

1. **Default room capacity and maximum room dimensions.** I found no reliable figure for either. Both matter for netcode and for the social-density argument in §2.1. `[UNVERIFIED]`
2. **Maximum furni stack height** and the exact stacking rules (which furni are stackable, how `allowStack` is determined per item). Partially visible in Arcturus but I did not read it. `[UNVERIFIED]`
3. **Legacy Shockwave asset container format.** I stated `.cct` at `[LOW]` confidence without a primary source. Confirm against Havana or the Origins client before relying on it.
4. **Sulake's 2011 peak revenue ($78.7M).** From a search summary, not a primary filing. `[LOW]`
5. **Exact guest-room layout count.** Two community sources give incompatible numbers (29 total/13 HC vs 12+23=35). `[LOW]`
6. **Duckets launch date** — January vs February 2013, sources disagree. `[LOW]`
7. **Habbo X current health.** Announcements exist; engagement data does not, at least not that I found. `[UNVERIFIED]`
8. **Origins total (non-Steam) player numbers.** Not published anywhere I could find. `[UNVERIFIED]`
9. **Room of the Week official prize amounts.** The widely-quoted figures come from a retro hotel, not Habbo. `[LOW]`
10. **Wired execution semantics under load** — ordering guarantees between stacks, per-room execution budgets, and how Arcturus differs from official Habbo. The wiki documents the *boxes*; it does not document the *scheduler*. This is the highest-value remaining unknown for anyone implementing Wired. `[UNVERIFIED]`
11. **Whether official Habbo's Wired matches the Miraheze wiki exactly.** That wiki is community-maintained. Selectors, Add-Ons, and variables are modern additions; I did not confirm the full list against an official source. `[MEDIUM]` overall, but treat individual box names as approximate.
