# Game Design — working title "The Grand"

An isometric hotel world in the Habbo / Coke Music lineage. Every claim of the form "X worked in
game Y" traces to [docs/research/](../research/00-synthesis.md).

Status: draft. Placeholder numbers are marked (tune). The minigame section will absorb the Neopets
research when it lands.

## Vision

A hotel. Every player gets a room to decorate and a stage to be judged on. All currency is earned
in play — none is sold. Players earn by making things other players rate (songs, furni designs,
outfits, rooms) and by playing official minigames together. They spend on furni and clothing drawn
from a procedurally generated catalog that never runs dry. The best player-made designs enter the
catalog and pay their creators. Status lives in rooms, where visitors can see it.

## Pillars

1. **Rooms, not a world.** No overworld. A Navigator lists rooms. Room owners hold kick/ban/mute
   rights, so moderation scales with the community. (Habbo §2.1)
2. **All currency is earned. Currency is bound, goods are tradeable.** Coke Music proves an
   earned-only economy works when the currency itself cannot transfer. Caps on every faucet are the
   inflation defense. (Coke §2.3, Gaia's collapse)
3. **Many faucets, all official.** Creation votes are one path. Minigames are another. Dailies a
   third. The server adjudicates every payout — no player-run wagering, ever. Player casinos became
   Habbo's demand floor and their removal crashed its economy. We never let them form. (Habbo §3.3)
4. **Constrained creation beats a blank canvas.** Coke Music's 114 curated samples made every song
   comparable, which made voting meaningful. Our generators expose curated parameter spaces, not
   free pixels. (Coke §6.3)
5. **Status must be walkable.** Trophies are furni, engraved with date, name, and deed. Display
   slots are scarce. (Coke §1.5, Habbo §1.8)
6. **Moderation is a core feature.** Habbo's 2012 safety scandal halved its users. Coke Music
   shipped paid 24/7 moderation, a universal filter, and a panic button as product features. So do
   we. (Habbo §5.2, Coke §3.5)

Reserved for later, architecture planned from day one: programmable rooms (a Wired-class system).
Retrofitting variables and signals is very hard. (Habbo §1.6)

## Core loops

**Session:** log in → daily ritual → play or perform or hang out → earn → spend → decorate →
show off → friends visit.

**Creation:** make (constrained tool) → publish or perform → peers judge → creator paid and
ranked → goods circulate by trade → charts and trophies feed status.

**Minigame:** queue in a game hall → play an official game → capped payout plus ladder points →
trophies for seasons and firsts.

## Currency — Stars (working name)

One currency. Bound to the account, never tradeable, never sold for money.

### Faucets

| Faucet | Payout | Cap | Notes |
|---|---|---|---|
| Votes on your performance or design | 5 (tune) per vote | 350/day (tune) | One vote per player per creation, **ever** — the Coke Music rule that forces meeting new people |
| Solo arcade minigames | score ÷ per-game ratio, 1,000 cap per play (tune) | 3 scored plays per game per day | Neopets model — ratios rebalanced monthly across the catalog |
| Multiplayer games (tactics, deduction, party) | per-match, win and participation | daily cap (tune) | Server-adjudicated, see Minigames |
| Dailies | ~100/day total (tune) | hard | Lobby café coffee, daily spin — ritual, not income |
| Achievements | one-time grants | — | Badge + Stars |
| Competitions | prize pool | weekly | Navigator placement is the real prize |
| Registration | one-time (tune) | — | Enough to furnish a starter room modestly |

Design intent: the daily ceiling is low and the best catalog items cost days of play. Coke Music's
ceiling was 450/day against a 2,500 flagship item, and the slowness produced attachment, not churn.
(Coke §2.1)

### Sinks

- Catalog purchases (the main sink).
- Minting fees for player designs (see Creation paths).
- Wallpaper and flooring are consumed on room deletion. No refunds anywhere. (Coke §2.4)
- Limited editions: serial-numbered, capped supply, random serial assignment. (Habbo §3.2)
- Marketplace listing runs free, sale takes a progressive commission — taxes whales, spares
  newcomers. (Habbo §1.5)
- Room promotion slots (2-hour Navigator feature, cheap).

### Anti-abuse

Vote-once-ever plus daily caps make alt-farming slow, not impossible. Add from day one: one
account per person policy, device/payment-free alt heuristics, dailies and trades limited per
account (the Decibel revival's fixes), and a single ledger service that logs every Star in and out
with anomaly detection. Coke Music v2 died of duplication exploits and packet editing. (Coke §5)

Collusion warning: Neopets' stock market let guilds coordinate purchases to inflate prices and
mint millionaires — the fix severed prices from anything players could coordinate around. Audit
every faucet for "can a group manufacture value from nothing." Vote-once-ever is our main
defense, but design charts and competitions need collusion review too. (Neopets §2)

## Trade

- Goods trade player-to-player. Currency never does.
- Trade window: item preview, forced delay, confirm step. Built before launch, not after the first
  scam wave. (Habbo §1.4)
- Marketplace: anonymous order book, cheapest listing sells first, 7-day average price shown.
  (Habbo §1.5)
- **No wagering on random outcomes.** Chance furni exists for decoration only. The sanctioned
  high-value sink that replaces gambling is an open question — candidates below.

## Earning paths

### Music (one path among several, not the game)

Coke Music's loop, kept nearly verbatim: 5-track step sequencer over curated sample banks, fixed
~60-second songs, burn to CD (tradeable item), perform on public stages with floor-arrow queues,
audience votes thumbs up/down, crowd-reaction stings bucketed by net score, Top 40 charts daily /
weekly / monthly, engraved Gold and Platinum Record trophies. Performer earns the Stars, creator
earns the chart credit — split rewards make CDs circulate. Queue arbitration is server-enforced
(Coke Music never fixed line-cutting). (Coke §1, §6.3)

### Design minting (the procedural front-end)

The player opens a design studio tool, explores a constrained generator — archetype, silhouette,
palette, pattern, parts — and pays a minting fee in Stars to publish a design. The design becomes
a purchasable catalog item in the player's own stall. Buyers pay Stars, creator takes a cut, the
rest sinks. Design charts and engraved trophies mirror the music charts. IMVU's creator economy is
the longevity proof. (Genre survey, Pipelines doc §2)

### Room competitions

Weekly themed contest. Prizes: Navigator featured placement, engraved trophy, badge, modest Stars.
Winners sit out the following week. Traffic is the scarce resource and competitions redistribute
it. (Habbo §1.10)

### Official minigames

Grounded in research/neopets.md. Principles:

- **Server-authoritative.** Outcomes are computed server-side, never client-reported. Neopets
  trusted client scores and needed impossible-score ceilings, suspicion tiers, and manual review
  to survive it. Server authority removes that whole class of problem. Results flow through the
  ledger with per-game caps. (Neopets §1)
- **In-world, not a menu.** Game halls are public rooms. You walk in, queue at a table, spectators
  watch from the rail. The Battle Ball formula repeats across every successful precedent:
  **spectating + queues or skill tiers + a visible ranked ladder + real prizes** (badges and
  trophy furni, not only currency). Habbo Origins chose to revive exactly this formula in 2024.
  (Neopets §6)
- **We run them.** No player banker, no player-set stakes, no house edge in player hands. This is
  the scam-proof replacement for what casinos gave Habbo: a high-engagement reason to gather.
- **Forfeit and disconnect rules ship with every game.** Key Quest's top complaint was matches
  "ending abnormally" and opponents vanishing when losing. Neopets' lobby answered async
  disappearance with a Move-or-Lose rule. Every game defines: reconnect window, AFK forfeit
  timer, and payout treatment on abandonment (leaver gets nothing, remaining players get a fair
  settlement). (Neopets §3, §4)
- **Everyone gets paid, winners get paid more.** Key Quest paid all participants during play plus
  placement-tiered prizes from a rotating seasonal pool — that split is why queues stayed full.
  Participation payouts capped daily. (Neopets §3)

**Three tiers:**

1. *Solo arcade* — score-attack games. Payout = score ÷ per-game ratio, capped 1,000 Stars per
   play (tune), 3 scored plays per game per day. Ratios rebalance monthly on a fixed, published
   date across the whole catalog — macro-tuning inflation at the faucet, Neopets' 25-year habit.
   Monthly per-game leaderboards award trophies to the top 17 (gold 1–3, silver 4–8, bronze
   9–17). Trophies are permanent and only upgrade, never downgrade. (Neopets §1, §5)
2. *Turn-based tactics* — small-board 1v1 (2v2 later), live matches at tables in the game hall,
   ranked ladder with seasons, monthly brackets in the Neopets Geos style, match payouts capped
   daily. Spectate and challenge from the rail.
3. *Social deduction* — scheduled lobbies of 8–12 in themed rooms, roles dealt by the server,
   chat through the standard filter, moderator tools on every lobby. Participation pays, wins pay
   more, both capped. **No classic virtual world ever shipped an official hidden-role game — the
   research found no precedent. This is a genuine first, so prototype it early and expect to
   learn.** (Neopets §6)

- **Trophies are furni.** Season placements and firsts mint engraved trophies, same as charts.
- **Variety inside one game beats many games.** Key Quest embedded mini-games and random events
  inside the board game. Prefer one deep, varied flagship per tier over a thin catalog.

### Dailies

Hotel-themed ritual, capped and small: a coffee at the lobby café (10 Stars, 10/day max), a daily
spin, seasonal advent calendars in December and July. Timed free furni drops during events — they
boost trading activity, not just logins. (Habbo §2.6)

## Rooms and social

- **Rooms:** free to create, stock layouts at start (custom floor plans later), furni limit ~100
  per room (tune), locked / password / invite-only states.
- **Navigator:** categories, busiest list, search, a featured rotation, and competition placements.
  Discovery is a list, not a map.
- **Chat:** Speak carries 5 tiles then fades to dots. Shout reaches the room and is socially
  costly. Whisper is private. Speech-bubble color derives from the avatar's outfit — free speaker
  identification. (Habbo §2.3, Coke §3.3)
- **Friends console:** room-independent messaging, online status, friend requests from the
  infostand.
- **Groups:** player-made, custom badge, home room. Group membership is mechanically real (room
  rights, later Wired conditions).
- **Badges:** display capped at 5 + 1 group badge. Scarce display is what gives badges value.
- **Idle honesty:** avatars sleep after 5 minutes, turn their head toward speakers.

## Status systems

- Engraved trophies (date, username, deed) from charts, competitions, and minigame seasons.
- Serial-numbered limited editions, random serials.
- Charts: Top 40 per creation domain, daily / weekly / monthly.
- Badges and infostand motto.

## Safety and moderation

- Filter on chat, usernames, room names, descriptions, and design names. Names reject, chat
  substitutes. Filter runs everywhere including private rooms. (Coke §3.5)
- Usernames are permanent. Motto is editable.
- One-click Call for Assistance on every screen, blame-free framing, routed to staffed moderation.
- Paid moderators only. Volunteer moderation failed Habbo and was refused by Coke Music.
- Symmetric ignore: erases the ignored player's avatar and actions from your view.
- Player-minted designs pass automated checks plus a moderation screen before catalog entry.
- **Audience decision is open** — see Open questions. It gates the legal and moderation posture.

## Non-goals for v1

- Real-money purchases of any kind. If monetization ever comes, the researched patterns are
  Neopets Premium (frequency multipliers on existing faucets, no exclusive content — does not
  fracture the shared economy) and Habbo Builders Club (rented, non-tradeable creative tools —
  monetizes builders without adding tradeable supply). (Neopets §5, Habbo §5.1)
- Player-run wagering or chance-based payouts.
- Free-form room scripting (architecture reserved, feature later).
- Mobile client.
- Web3 anything.

## Open questions

1. **The high-value sink.** Without gambling, what absorbs rich players' wealth? Neopets proves
   status-driven sinks work on the wealthiest players: prestige untradables priced in the tens of
   millions, a 100-per-pull luck lever chased by collectors, and a donation event that drained
   12.3 billion NP with recognition as the only reward. (Neopets §2) Candidates: a museum wing
   that permanently exhibits donated rares with engraved donor plaques, limited-edition trade-in
   ladders, prestige untradable furni at extreme prices, cosmetic room upgrades (penthouse
   floors). Needs a decision before the economy ships.
2. **Audience and age positioning.** Adult-nostalgia-first (Habbo Origins' bet, lighter legal
   burden) vs teen-inclusive (COPPA/GDPR-K, heavy moderation cost). Recommendation: adults first,
   rating pending.
3. **Creator cut** on minted-design sales (tune between 30–70%).
4. **Room capacity** and instance limits — needs netcode prototyping. Habbo's default cap is
   unverified in research. Coke Music's public cap was 25.
5. **Wired-class system scope** and when it lands.
6. **Naming** — "The Grand", "Stars", all placeholders.
