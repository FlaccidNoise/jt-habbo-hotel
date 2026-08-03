# Coke Music / Coke Studios / MyCoke — Research Dossier

Coca-Cola's isometric teen virtual world, June 2002 – December 6 2007. Built on Habbo Hotel
technology, organised around a loop-sequencer music maker and a peer-voting currency.

Research date: 2026-08-03. Claims are cited inline. Anything I could not confirm against a source
is tagged `[UNVERIFIED]`.

**Primary source note.** The single densest source is the community wiki at
`cokestudios.miraheze.org`, which is unusually rigorous by fan-wiki standards: it cites Wayback
captures of the original FAQs, decompiled client code, and developer statements for most claims. I
pulled its raw wikitext through the MediaWiki API rather than trusting rendered summaries, and I
followed its citations where they mattered. Where a fact rests only on the wiki's own assertion with
no upstream citation, I say so.

---

## 1. The Music Maker

### 1.1 Where it lived

Every private studio came with a **Mixer** furni item, free and permanently fixed — it could not be
picked up or deleted, so players commonly hid it behind other furniture. Only the room owner could
use it. Double-clicking it opened a **web application** on cokemusic.com / mycoke.com, outside the
game client. Its in-fiction model name was **"CC-3001 Deluxe"**.
(<https://cokestudios.miraheze.org/wiki/Music_Mixer>)

In v1, using the Mixer put headphones on your V-ego and switched the furni's sprite to "on"; both
were removed in v2 and later restored by the Decibel revival.

### 1.2 Structure of the sequencer

This is the most design-relevant mechanic and also the one with the most source friction, so the
evidence is separated by strength.

**From the original in-game FAQ** (archived, quoted on the wiki at `Music Mixer/FAQ`):

> "Once in the Audio Mixer, click EDIT on one of the **5 track lines**. Now follow the instructions
> within the Audio Mixer to compose and save your new song. When you return to your track listing,
> you must select BURN in order to put your song on a CD."

So: **5 tracks**, one sample assigned per track, then a step-grid of where that sample fires. Not a
piano roll — a step sequencer over fixed loops, closer to a tracker than to GarageBand despite the
wiki's GarageBand comparison.

**Sample library: 114 sound bytes** across **7 genre banks** — Country, Dance, Hip-Hop, Latin,
Misc, Pop, Rock. The wiki lists every sample by name with the extracted `.wav` files. Each sample
carries a note length of **half**, **whole**, or **double**. `Misc / "Higher"` is the only double
in the entire library, at 8 seconds. Working backwards: whole ≈ 4s, half ≈ 2s.
(<https://cokestudios.miraheze.org/wiki/Music_Mixer>)

Samples are single-instrument loops with names like `Rakim` (hip-hop drums), `Bluegrass` (banjo),
`Sonar pole` (dance FX), `Getup!` (vocal stab). Each has an instrument icon — drum, guitar,
keyboard, speaker/bass, microphone, horn, turntable, bell, maracas, cymbal, strings, harmonica,
banjo, triangle, FX. Vocal one-shots ("C'mon!", "Feel it!", "Bass!") are treated as just another
instrument.

**Grid geometry — from the fan recreation, not the original.** Mark Hughes' MIT-licensed
`CSMusicMixer` (<https://github.com/markhughes/CSMusicMixer>) reconstructs the step layout as a
function of sample duration (`assets/js/Mixer.js`, `getStepsLayout`):

| Sample length | Steps in the row | Total |
|---|---|---|
| ≤ 2s (half) | 30 | 60s |
| 4s (whole) | 15 | 60s |
| 10s (double, forced from 8s) | 6 | 60s |

That implies a **fixed ~60-second song timeline**, with a track's step resolution set by the length
of the sample you dropped into it. That is an elegant constraint and worth stealing, but treat the
exact numbers as **MEDIUM confidence** — it is one developer's 2015 reconstruction, and his code
builds **6** rows (`while (i < 6)` in `buildBlankRows`), not the 5 the official FAQ states. The
recreation also gives each row a volume slider; whether the original did is unconfirmed.

The wiki hosts one exported song payload from a former player — a flat list of ~135 signed bytes —
suggesting songs serialised to a compact binary blob rather than to note events.
(<https://cokestudios.miraheze.org/wiki/User_blog:D%C7%90ll_Kevlar/musicmixer>)

A hidden debug menu opened with `Ctrl+Shift+Click`.

### 1.3 Burning and carrying songs

A composed song is inert until you **burn** it to a CD. CDs live in your **backpack** as physical
inventory items. New accounts got **10 blank CDs**; more cost **50 dB per 10** from the Studio
Essentials catalogue page — tied with Cables as the cheapest purchasable item in the game. Multiple
copies of one song could be burned. Hovering a burned CD showed `Song Creator: Song Title`.
(<https://cokestudios.miraheze.org/wiki/Performing>)

**CDs were tradeable.** You could trade for someone else's CD, perform it, and keep the decibels —
but the votes still counted toward **the creator's** Top 40 ranking. A song owner could also vote on
their own song when another player performed it. This split between who earns currency and who earns
reputation is a deliberate and unusual choice.

### 1.4 Performing in public

Public venues had a **stage** and a **queue marked by arrows painted on the floor**. You walked into
the queue, waited your turn, stepped onto the stage, were auto-prompted to pick a burned CD, and the
server played it to the room. **One performer at a time per room.**

While your song played, the chat bar changed to **"Sing:"** and every message you typed was forced
to **shout** — bold, audible to the whole room regardless of distance. Between 2006 and 2007 the
styling changed from bold+italic to bold.

The audience voted **thumbs up** or **thumbs down**. When the song ended, one of ten **crowd
reaction sound effects** played, bucketed by net score:

| Net thumbs up | Net thumbs down |
|---|---|
| 0–2, 3–4, 5–9, 10–15, 16+ | 1, 2, 3–9, 10–15, 16+ |

Ten distinct audience-reaction stings for a five-track loop toy is a remarkable amount of feedback
polish, and it is the mechanic players remember most viscerally.

In **private studios** you needed a CD-player furni to perform at all — Premier Stereo, 5001 Sound
System, Coca-Cola CD Player, Jukebox, or Boom Box. Same one-at-a-time rule.

**Line cutting was never solved.** The official FAQ admits defeat in public:

> "Everyday, we are working on bigger and better ways to prevent line cutting... there's nothing you
> can do once they've cut, so just ignore them. In the meantime, we're working on ways to make this
> impossible."

By v2, "stage blocking" — players physically obstructing stage access — was one of the named bugs
driving the game's decline.

### 1.5 Charts and trophies

Coke Music kept running totals of thumbs-up per creator and published a **Top 40** in three windows:
**daily, weekly, monthly**. The chart was reachable in-game by clicking a **Top-40 Chart poster**
(500 dB, catalogue page 9) hung on your wall — the leaderboard was itself a purchasable piece of
furniture.

Winners got permanent trophy furni that **never appeared in the catalogue**:

- **Gold Record** — weekly Top 40 winner. Inscribed `Week-ended {mm/dd/yyyy} {username} {cd_title}`.
- **Platinum Record** — monthly Top 40 winner. Inscribed `Month {mm/yyyy} {username} {cd_title}`.

A leaderboard win converted into a wall-mounted, permanently dated, self-describing status object in
your room. During the American Idol promotion, the player with the most weekly song votes won a
permanent **Star Suite** apartment.

---

## 2. The Currency Loop — Decibels (dB)

### 2.1 Every earning path

Sourced from the archived in-game FAQ, quoted verbatim on the wiki
(<https://cokestudios.miraheze.org/wiki/Decibels/FAQ>):

| Source | Rate | Cap |
|---|---|---|
| Registration bonus | 5,000 dB (Coke Music era) → **1,000 dB** from 2005 | once, email-confirmed |
| Thumbs-up on a performance | **5 dB** each | **350 dB/day** |
| Thumbs-up in the Coca-Cola Red Room | **10 dB** each (doubled) | shares the 350/day cap |
| Drinking a virtual Coke | **10 dB** each | **10 Cokes/day = 100 dB/day** |
| Under-The-Cap real bottle-cap codes | ~1,000 dB, or rare furni, by chance | per physical bottle |
| Website minigames | varies | varies |

**The hard daily ceiling from in-game play was 450 dB.** Against a 2,500 dB Coke Couch, that is
about 5.5 days of maximum-effort play for the single most desirable catalogue item. The economy was
deliberately slow.

Two rules made the vote economy socially interesting:

1. **"Each V-ego in Coke Studios may only vote for your song one time — ever!"** (original FAQ,
   emphasis theirs). Not once per performance. Once, permanently.
2. The 350/day cap.

Together these mean grinding decibels *requires meeting new people*. You cannot farm one friend.
This single constraint is the reason the game's social meta looks the way it does — see §3.4.

**Virtual Cokes** came from any cold-looking furni — vending machines, coolers, crates, fridges — or
from **bartender bots** in Miami, Tokyo, London, Goa and Alaska who would bring you one if asked.
Bartenders were a v1 feature, removed in v2.

**Website minigames** (playable even when Coke Studios itself was closed): Coaster, V-ego San (sumo
wrestling), Pop Quiz, Uncover the Music, and Recycler (internally "Furni Factory", a reskin of the
Shark Tale promotion's Whale Wash). Recycler paid out **furni** for a daily high score rather than
currency. V-ego San awarded a **Gong** for beating 7 players in a row.
(<https://cokestudios.miraheze.org/wiki/Games>)

### 2.2 What decibels bought

**Only furni, wallpaper, flooring, and blank CDs**, all from the in-game **Online Catalogue** — the
only place decibels could be spent. Sample v2 prices
(<https://cokestudios.miraheze.org/wiki/Online_Catalogue>):

| Item | Price (v2) | Price (v1) |
|---|---|---|
| 10 blank CDs | 50 dB | — |
| Cables | 50 dB | 75 dB |
| Microphone | 100 dB | 125 dB |
| Wallpaper / Floor (each) | 500 dB | — |
| Top-40 Chart poster | 500 dB | — |
| Retro Speaker | 650 dB | 1,250 dB |
| Sampler Rack | 900 dB | 2,500 dB |
| Teleporter set | 1,500 dB | — |
| Coke Machine / Jukebox | 1,500 dB | — |
| Coca-Cola Neon Sign | 2,000 dB | — |
| **Coke Couch** | **2,500 dB** | — |
| Disco Lights | 2,500 dB | — |

The v2 relaunch explicitly cut prices — the launch notice promised **"More Furniture, Fewer
Decibels — Reduced pricing for all catalog items"**. The Sampler Rack fell from 2,500 to 900.

**Apartments were free.** Studios cost nothing to create; you paid only to furnish and decorate
them. **Clothing was free too** — V-ego appearance (clothes, colours, face, skin, hair) was
configured on the website at no cost. Decibels bought *objects in rooms*, nothing else.

In the earlier Coke Music era only, a feature called **Decibel Central** let players spend decibels
on **sweepstakes entries for real-world prizes** — audio equipment, t-shirts, posters, gift
certificates, magazine subscriptions, movie rentals. This was dropped in the MyCoke / My Coke Rewards
era. (<https://cokestudios.miraheze.org/wiki/Decibels>)

### 2.3 Real money: there was none

**No real-money purchase of decibels or items existed.** Every path into the economy was play,
registration, or physical Coca-Cola cap codes. Decibels were explicitly **non-tradeable** —

> "Can I trade/give away Decibels? No, but you can trade or give away furniture or other items."

— while *furni was freely tradeable*. That combination (bound currency, liquid goods) is what
produced a genuine secondary economy with rare-item valuations, and with it a persistent scam
problem. **HIGH confidence on the absence**: multiple archived FAQs enumerate the earning methods
and none mentions purchase, and the safety page states players will "NEVER be asked for your
password or your credit card information".

The only money-adjacent lever was **Under The Cap** — buy a physical 20oz Coke, enter the cap code,
receive ~1,000 dB or a chance at exclusive furni not sold in the catalogue (Vanilla Coke Gumball
Machine, Cow Pattern Bean Bag, Vanilla Coke Machine, WallShelf, Trash Can, Eyeball Lamp, and others,
released two per month through 2004). This was later folded into **My Coke Rewards**, which awarded
furni only. (<https://cokestudios.miraheze.org/wiki/Under_The_Cap>)

### 2.4 Sinks and friction

- **Deleting furni refunds nothing.** The FAQ warns: "Once you delete an item, it's gone... you DO
  NOT get your decibels back."
- **Deleting a studio destroys its wallpaper and flooring** (other furni returns to the backpack).
- Wallpaper and floor cost 500 dB *each*, per room, and are consumed on room deletion.
- A **permanent ban** wiped the account *and all decibels*.

---

## 3. Rooms and Social

### 3.1 Private studios

- **7 room layouts**, ranging **36 to 84 tiles**. Layout chosen at creation, along with name and
  description (both word-filtered).
- **100 furni per studio**, plus the immovable Mixer = 101 objects.
- **Room limit: 6 studios per player in v1, raised to 10 in v2.**
- A **"Location"** setting (New York, Miami, Seattle, Mombasa, Sydney, Tokyo, London, Rio) changed
  *only the view through the window* — pure cosmetic flavour with no mechanical effect. Players
  routinely covered it with posters anyway.
- Furni controls: **Delete, Pick Up, Rotate, Move**. v2 added free placement and player-controlled
  layering of posters and rugs.
- Only the owner could use the Mixer, kick players, or **initiate a trade** inside their own room.
- v2 added **featured studios**, flagged with a star at the top of the navigator.

### 3.2 Public venues

Designer-authored, never player-owned, **capped at 25 users**, with cloned instances for overflow
("London I", "London II"). The navigator showed fullness as **6 filled balls**.

- **v1**: Alaska, Coca-Cola Red Room, Goa, London, Miami, Mombasa, Moscow, New York, Rio, Seattle,
  Sydney, Tokyo.
- **v2 added**: San Francisco, Mexico, Central Park, New Orleans, Neptune/Atlantis, Club Cherry,
  Ray's Rooftop Party, mycoke Arena (NCAA), Wal-Mart, the Theatre, American Idol rooms, and Whale
  Wash (Shark Tale).

Each carried a stage, a performance queue of documented length (New Orleans 11, Neptune 12, San
Francisco 13, Ray's Rooftop 16), seating, a Coke dispenser, and an animated speaker that reacted
during performances. The **Coca-Cola Red Room paid double decibels** — a designed grind destination.

The **navigator** listed the **35 most crowded rooms**; anything else had to be found by searching
room name or username.

### 3.3 Chat, identity, presence

- Two registers: **Speak** (visible only within **5 tiles**; beyond that other players see the
  message degraded into dots) and **Shout** (whole room, bold). The FAQ scolds players for shouting:
  "For the most part, this is rude and should only be used when necessary."
- **Screen names were permanently immutable.** Only the **~30-character "mission"/motto** shown on
  your infostand could be changed, and only via the website.
- **Friends list and a messenger**, via "Ask to become a friend" in the navigator.
- V-egos **turn their head toward whoever is speaking**, turn fully toward a clicked player, **fall
  asleep after 5 minutes idle**, can dance (a toggle), and have facial expressions.
- **Backpack**: 25 items originally, later paginated and sorted by acquisition date, with no manual
  organisation and no way to preview a stored wallpaper's colour or tell whether two teleporters
  were linked. A well-documented usability sore point.
- **Trade**: a "Safe Trade" two-party interface. Trades above ~6 items were the documented scam
  vector, and a rare-furni valuation culture grew up around it (Coke Couches used as the de facto
  high-denomination note).

### 3.4 What players actually did with rooms

The wiki catalogues the emergent room genres
(<https://cokestudios.miraheze.org/wiki/Studio>), and these are the most instructive part of the
whole dossier:

- **"Free Greens"** — the defining institution. Players queue and take turns performing; everyone in
  the room is *expected* to vote thumbs-up. Voting someone down gets you kicked. The owner typically
  sits centre-room to police it and takes an occasional turn themselves. This is a **player-built
  cooperative mutual-aid economy**, invented to work around the one-vote-per-player-ever rule and the
  350/day cap.
- **Storage rooms** — used purely as overflow for a backpack too small to hold a collection.
- **Collection rooms** — hoards of Pinball Machines, Gold/Platinum Records, discontinued My Coke
  Rewards furni, shown off.
- **Roleplay** — restaurants, chat rooms, weddings.
- **Player-run games** — mazes, "falling furni" (ff), red light/green light, and furni races.

### 3.5 Moderation

A heavily-moderated teen space, and unusually explicit about it
(<https://cokestudios.miraheze.org/wiki/Coke_Studios/Safety>):

- **Paid, professional, full-time moderators only.** Volunteer moderation was refused outright:
  "Sorry, we don't allow volunteer moderators. We have professional, hired moderators who are paid."
- **Staffed at all times** — "There is ALWAYS someone moderating at Coke Studios!"
- Moderators had tools to **watch several rooms simultaneously** for suspicious conversation.
- Escalation ladder: **popup warning → kick → permanent ban** (account and all decibels destroyed).
- **"Call for Assistance"** — a one-click red button present on every screen, broadcasting an instant
  alert to all online monitors. The safety page repeatedly frames it as blame-free: "it's not your
  fault if this happens".
- **The "blah" filter** replaced offensive words and personal information (phone numbers, credit card
  numbers) with the literal word *blah* — the direct analogue of Habbo's "bobba" and RuneScape's
  "cabbage". Active **everywhere**, including private studios, and covering **chat, V-ego names, and
  studio names and descriptions**. For names it **rejected** rather than substituted. Players routed
  around it with spaced-out letters, as always.
- TOS rules: no explicit language (including song lyrics), no character-masking of swears, no
  personal info, no harassment, no impersonating celebrities or staff, no spam or solicitation, no
  repetition.
- Safety guidance banned arranging real-life meetings outright.
- The original service ran **limited daily hours, roughly 10am–2am** — inferred from the Decibel
  revival's changelog noting "Open hours are not limited to 10am-2am", and corroborated by the
  Games page noting website games "were available even when Coke Studios itself wasn't open for the
  day". **MEDIUM confidence on the exact hours; HIGH that opening hours existed at all.** Almost
  certainly a moderation-coverage constraint.

---

## 4. Technology and Provenance

### 4.1 Who built it

The chain is well documented:

1. **Studiocom**, an interactive marketing agency founded 1998 and headquartered in **Atlanta,
   Georgia** — the same city as Coca-Cola — held the Coke Music work.
   (<https://cokestudios.miraheze.org/wiki/Studiocom>)
2. **In 2001 Studiocom contacted Sulake**, the Finnish company behind **Habbo Hotel**, to
   collaborate. Habbo's technology became the base for Coke Studios.
3. **Development began January 2002; public launch June 2002.** Sulake built v1, then **handed
   further development to Studiocom.**
4. Studiocom joined the **VML Digital Network in 2005** and fully rebranded to VML in 2013 — which
   is why some sources credit "VML" as the creator.
5. Sulake repeated the arrangement with Disney, building **Virtual Magic Kingdom** (2005–2008).

Sulake's Sulka Haro on building the mixer (quoted on the wiki from a Substack post; the underlying
URL is an inbox-scoped Substack link I could not retrieve directly, so **treat as MEDIUM
confidence**):

> "I knew Dj Orkidea from way back and he agreed to work on creating the needed... sample set, which
> was apparently an interesting challenge as the **ultra simple tracker we could make in Shockwave
> obviously had almost no audio capabilities beyond playing samples** and even getting the audio to
> play in sync require tricks, so creating a diverse set of samples that even somewhat formed a
> coherent [whole] was not easy."

Two things fall out of this. The mixer's design was **constrained by Shockwave's audio limits**, not
chosen from a blank page — the 114-sample loop library exists because sample playback was all the
platform could do. And the sample set was authored by a **working trance DJ** (Orkidea, Finnish),
which is why five random loops tend to sound acceptable together.

**For v2, Studiocom is said to have built its own engine called "Galapagos"**, per the
`jtieri/Coke-Studios-Source` README. **MEDIUM confidence — single source, uncorroborated.**

### 4.2 Client technology

**Macromedia (later Adobe) Shockwave** — the Director runtime, not Flash. Asset formats `.dir`,
`.cct`, `.cst`; scripting in **Lingo**. This mattered competitively: the wiki notes Habbo later
migrated to Flash "at the cost of many game features", while Coke Studios stayed on Shockwave and
kept them. Shockwave was discontinued in 2019, shortly before Flash.
(<https://cokestudios.miraheze.org/wiki/Coke_Studios>)

The **Music Mixer web app appears to have been Flash**, separately from the Shockwave game client —
inferred from `CSMusicMixer` shipping icon assets extracted as SWF sprite frames
(`assets/icons/frames/DefineSprite_164/…`). **LOW-MEDIUM confidence; inference from the recreation's
asset layout, not a direct statement.**

Coke Studios ran in a browser on integrated graphics and Windows 9x. Its successor CC Metro required
a discrete GPU and Windows NT — a hardware-accessibility regression that plausibly contributed to the
migration failing.

### 4.3 Habbo lineage visible in the code

Direct evidence rather than inference: the backpack is internally called the **"hand"**, Habbo's
name for its inventory, and room files carry identifiers like `sanfo_hand.room` and
`room_hand_item_#`. (<https://cokestudios.miraheze.org/wiki/Backpack>)

### 4.4 What survives

| Artifact | Where | Notes |
|---|---|---|
| Decompiled client source | <https://github.com/jtieri/Coke-Studios-Source> | Lingo assembly (`.lasm`) from several client builds including 8 Oct 2007, decompiled with ProjectorRays/shockrays |
| Music mixer recreation | <https://github.com/markhughes/CSMusicMixer> | MIT, playable, all 114 samples as `.wav` |
| Playable emulation | <https://decibel.fun> | Runs the **original Shockwave client** |
| Furni image compilation | <https://archive.org/details/coke-studios-furni> | July 2025 |
| Screenshot archive | <https://thyelite.com/randomcoke/> | Wiki calls it "likely the vast majority of all remaining screenshots" |
| Original FAQs, catalogue pages, promo pages | Wayback Machine, `cokestudios2.cokemusic.com` | The load-bearing primary sources for nearly every mechanic in this document |
| Mechanics documentation | <https://cokestudios.miraheze.org> | Sample-by-sample, furni-by-furni, room-by-room |

The wiki's own `Archive` page is candid about how bad the losses are: the service was a closed
platform behind a login, used un-archiveable formats, blocked crawlers, and predated cheap screen
recording; GeoCities, Tripod and Angelfire fansites are gone. Known-lost media includes the Whale
Wash Builder game, the original non-sports Pop Quiz, the Wal-Mart and Theatre venues, and Uncover
the Music's tile art.

---

## 5. Timeline

| Date | Event |
|---|---|
| 2001 | Studiocom approaches Sulake |
| January 2002 | Development starts |
| **June 2002** | **Public launch as Coke Studios on cokemusic.com (v1)** — ~80 furni items |
| ~April–June 2003 | Coke Studios 2.0 beta opens alongside v1 |
| Aug/Sept 2003–2004 | Under-The-Cap cap-code promotions |
| Sept–29 Dec 2004 | **Shark Tale** version runs as a *third* parallel client; Whale Wash venue and minigame, 14 new furni, furni migrated back on close |
| **29 December 2004** | **v2 launches** — 5 new venues, price cuts, 10-studio limit, paginated backpack, free furni placement |
| 2004 | Peak: >1M page views/day, +200k unique visitors/month, **3rd most popular teen website** |
| **June 2005** | Site rebrands **Coke Music → MyCoke**; registration bonus cut 5,000 → 1,000 dB |
| June 2005 | **Batman Begins** promotion — code-redeemed "Wayne Ent." studios, removed after August 2005 |
| 2005–2006 | **American Idol** promotion — weekly top-vote winners keep permanent Star Suites |
| 2006 | FIFA promotion; **My Coke Rewards** absorbs the cap-code programme |
| March 2007 | mycoke Arena (NCAA) — the final promotion |
| 2007 | Decline: server lag, furni duplication, trade exploits, broken CDs, stage blocking, packet-editor cheating ("filters") |
| **6 December 2007** | **Shutdown.** Furni converted to Therebucks |
| 6 December 2007 | **CC Metro** opens — Coca-Cola content inside **There.com**, by Makena Technologies. 3D, higher system requirements, included a remade Music Mixer |
| **9 March 2010** | There.com closes, taking CC Metro with it |
| May 2012 | There reopens **without** CC Metro |

Claimed lifetime population: **8 million users** (MediaVillage, cited by the wiki). Peak metrics are
sourced to developer **Mark Blottner**'s portfolio page — I attempted to fetch
`markblottner.com/cokestudios.html` directly and it is behind ModSecurity, so this rests on the
wiki's quotation. **MEDIUM confidence.**

### Revival projects

| Project | URL | Status (Aug 2026) | Approach |
|---|---|---|---|
| **Decibel** | <https://decibel.fun> | **Live.** Beta 2024, released **28 June 2025** | Faithful emulation of **v2** running the **original Shockwave client**. Needs legacy Shockwave + a compatible browser (Pale Moon). Non-profit, **refuses donations**. Built largely by "Dreamcatcher" with community input |
| **CaveJam** | <https://cavejam.com> | Live | *Inspired by*, not emulation. Larger furni range, 8-direction walking, **no music creation** — replaced by a mining economy |
| **SodaStudios** | <https://sodastudios.org> | Live beta, active 2024–25 | Traditional remake. Music mixer, song voting and charts implemented; custom soda-brand furni |
| **CokePhase** | <https://github.com/michaelowens/cokemusic-cokephase> | **Stale** (last push Feb 2018) | JS client on the IGE isometric engine with recreated assets; **server side never implemented** |
| **CSMusicMixer** | <https://github.com/markhughes/CSMusicMixer> | Maintained-ish | The mixer alone, as a web toy. No game attached |
| **OurCoke** | — | **Defunct** | Habbo emulator software reskinned with Coke Studios assets |

**Decibel is the one that documents original mechanics.** Its accuracy is what made the Miraheze
wiki possible — the wiki says so explicitly: "Decibel is a huge credit to the existence of this wiki
and its content thanks to the precise emulation of most elements."

Decibel's deliberate deviations are themselves a designer's changelog of what needed fixing:

- No daily opening hours.
- Client scales to modern pixel density.
- Performance decibel cap **doubled to 800/day**.
- Drinking Coke now has a chance to drop otherwise-unobtainable furni.
- Songs playable **outside the game** via a web Top 40.
- An **ignore** function that erases a player's avatar and *all* their actions (votes, furni state
  changes) from your view, symmetrically.
- Anti-alt-abuse: trading, daily rolls and Recycler prizes limited to one account.
- Explicit probability tables for prizes — Sumo: 85% 50 dB, 8% Tatami Mat, 5% Rice Paper Divider, 2%
  Gong, max 5 prizes/day. Recycler daily leaderboard: top 5 = 750 dB, 6–15 = 500 dB, 16–25 = 250 dB.
- Restores v1 flourishes v2 dropped: performing microphone, Mixer headphones, catalogue previews.

---

## 6. What Players Loved, and the Design Lessons

Sources: the r/cokemusic subreddit (fetched via RSS; Reddit's JSON and HTML endpoints refused my
requests, so post bodies come from the feed's `content` field), and MMOBomb's retrospective.

### 6.1 What they say

**The creative loop was the point.** MMOBomb's retrospective:

> "a cozy game where I spent hours mixing music and playing my terrible tracks for people"
> (<https://www.mmobomb.com/cozy-comfy-multiplayer-what-ever-happened-to-coke-music>)

Note "my terrible tracks" — the pleasure was *performing to people*, not making good music.

**The physical-world tie-in was memorable, even when embarrassing.**

> "I used to go to our schools football games just to look for coke caps on the ground so I could
> redeem them for decibels… looking back now I probably looked like such a freak lol"
> (<https://www.reddit.com/r/cokemusic/comments/mgx2hd/i_miss_this_game/>)

**The grind produced real attachment.**

> "I was so pissed when Coke music shutdown. I spent so much time getting the bloody gongs and
> becoming 'wealthy' in the game lol."
> (<https://www.reddit.com/r/cokemusic/comments/16q7q9x/>)

**The mischief is remembered as fondly as the sanctioned play.** One top post recalls using clone
accounts to block a room's performance queue: *"People could get pretty annoyed by this :)... Kind of
miss these days."* Another remembers the emo kid permanently stationed in the corner of a particular
room. Furni races and trading tatami mats recur constantly.

### 6.2 The single most valuable data point

A long-form review of CaveJam by a player who went looking for Coke Music and found a
*differently*-designed successor
(<https://www.reddit.com/r/cokemusic/comments/j19ght/thoughts_on_cavejam/>):

> "At first I was a bit disappointed there was no way to create your own music in the game like you
> could do in Cokemusic. **The whole idea behind Cokemusic was creating music, play it and have other
> players vote for it to earn db's.** In Cavejam this whole aspect is missing. Yes you can play (your
> own) music through Soundcloud and other players will hear it when in the same area but there is no
> voting system and you can't earn db's through it."

CaveJam replaced the loop with mining ore for currency. The reviewer ended up enjoying the mining —
"it's addictive" — but the review is structured as *grief for the missing loop first, appreciation
of the replacement second*. **Streaming real music is not a substitute for composing bad music and
having strangers rate it.** Authorship plus peer judgment plus payout is one indivisible mechanic.

### 6.3 Design lessons

1. **The loop is create → perform → be judged → get paid → decorate → invite people to see it.**
   Every subsystem serves it. Break any link and, per §6.2, players notice immediately and grieve.
2. **Cripple the tool on purpose.** 114 fixed loops, 5 tracks, ~60 seconds, professionally authored
   so that random combinations sound fine. Nobody faced a blank canvas, nobody produced noise, and
   everyone's output was comparable — which is what makes voting meaningful. A general-purpose DAW
   would have destroyed the game.
3. **Make the currency cap force social breadth.** One vote per player per song *ever*, plus 350
   dB/day, means you cannot farm your friends. Every subsequent decibel requires a new audience.
   This is the mechanical seed of the entire social meta.
4. **Then let players invent the cooperation.** "Free Greens" rooms — orderly queues, everyone votes
   up, downvoters get kicked, the owner referees — were never designed. They emerged from the
   constraint above, and they became the game's defining social institution. Design the constraint;
   leave room for the norm.
5. **Split currency from reputation.** Perform a traded CD: *you* get the decibels, the *creator*
   gets the chart position. Two separate reward tracks off one action, and a reason for songs to
   circulate as objects.
6. **Turn leaderboard wins into furniture.** Gold and Platinum Records were wall items engraved with
   the date, the username, and the song title, unobtainable any other way. Status you can walk into
   someone's room and see beats status on a web page.
7. **Overinvest in the moment of judgment.** Ten distinct crowd-reaction stings bucketed by net vote
   is disproportionate polish for a five-loop toy — and it is precisely the thing players describe
   feeling.
8. **Bind the currency, free the goods.** Non-tradeable decibels with tradeable furni produced a real
   economy: rare valuations, Coke Couches as currency, collection rooms. It also produced systemic
   scamming — the official FAQ's answer amounted to *caveat emptor*. A modern build should keep the
   economy and fix the trade UI (the 6-item cap was the exploit surface).
9. **Free the space, charge for the stuff.** Rooms and clothes cost nothing; only objects cost
   decibels. Everyone gets a stage on day one.
10. **Queues need enforcement.** The stage queue created a lovely turn-taking ritual and the
    developers never solved line cutting or, later, stage blocking. Ship the arbitration logic with
    the queue.
11. **Moderation was a feature, not overhead.** Paid staff around the clock, a filter covering names
    and room descriptions as well as chat, and a permanent one-click panic button. Note also the
    small anti-abuse details: immutable screen names, a 5-tile hearing radius that makes shouting
    socially costly, and 5-minute idle sleep for presence honesty. Decibel's modern additions
    (symmetric ignore, one-account limits on daily rewards) show where the gaps were.
12. **The failure modes are as instructive as the wins.** v2 died of lag, duplication exploits,
    packet-editor cheating and unfixed griefing. Then the pivot to CC Metro discarded the isometric
    pixel identity for 3D, raised the hardware bar from "browser on integrated graphics" to "discrete
    GPU on Windows NT", and lost the audience. MMOBomb's read: *"they decided to change the popular
    pixelated avatars for a 3D design. Soon after the design change, CC-Metro began to fail."*

---

## Findings Table

| Finding | Source | Confidence |
|---|---|---|
| Mixer had **5 track lines**; compose → save → **burn to CD** to carry it | Archived in-game FAQ quoted at <https://cokestudios.miraheze.org/wiki/Music_Mixer/FAQ> | HIGH |
| **114 samples** across 7 genre banks; lengths half/whole/double; only one double (8s) | <https://cokestudios.miraheze.org/wiki/Music_Mixer> (sample-by-sample list with extracted .wav) | HIGH |
| Step grid scales to sample length — 30/15/6 steps for 2s/4s/10s, i.e. a fixed ~60s song | `assets/js/Mixer.js` `getStepsLayout`, <https://github.com/markhughes/CSMusicMixer> | MEDIUM (2015 fan recreation; builds 6 rows, not 5) |
| Mixer was a **web app** outside the client, named "CC-3001 Deluxe", owner-only, from a free fixed furni | <https://cokestudios.miraheze.org/wiki/Music_Mixer> | HIGH |
| Sample set authored by **DJ Orkidea**; design constrained by Shockwave's sample-only audio | Sulka Haro (Sulake) quoted at <https://cokestudios.miraheze.org/wiki/Music_Mixer> | MEDIUM (upstream Substack URL not retrievable) |
| **5 dB per thumbs-up**, **350 dB/day cap**, **one vote per player per song ever** | Archived FAQ at <https://cokestudios.miraheze.org/wiki/Decibels/FAQ> | HIGH |
| **10 dB per virtual Coke, max 10/day**; Red Room pays double on votes | Same | HIGH |
| Registration bonus **5,000 dB → 1,000 dB** in 2005 | Same (both eras quoted side by side) | HIGH |
| Performing someone else's traded CD pays *you* the dB but ranks *the creator* on Top 40 | <https://cokestudios.miraheze.org/wiki/Performing> | HIGH |
| **Top 40 daily/weekly/monthly**; Gold Record (weekly) and Platinum Record (monthly) as engraved, non-catalogue furni | Same, with Wayback captures of chart pages | HIGH |
| **10 crowd-reaction sounds** bucketed by net vote (+0-2/3-4/5-9/10-15/16+, −1/2/3-9/10-15/16+) | Same (audio files hosted on wiki) | HIGH |
| Public stage access by **floor-arrow queue**; chat forced to shout while performing | Archived FAQ + <https://cokestudios.miraheze.org/wiki/Performing> | HIGH |
| **No real-money purchase** of currency or items existed | Multiple archived FAQs enumerate earning methods; safety page says credit card info never requested | HIGH |
| Decibels **non-tradeable**; furni freely tradeable | Archived FAQ at <https://cokestudios.miraheze.org/wiki/Decibels/FAQ> | HIGH |
| Real-world **cap codes** → ~1,000 dB or exclusive furni; later merged into My Coke Rewards | <https://cokestudios.miraheze.org/wiki/Under_The_Cap> | HIGH |
| **100 furni/studio**, 7 layouts (36–84 tiles), 6→10 studios per player in v2 | <https://cokestudios.miraheze.org/wiki/Studio> + v2 launch notice | HIGH |
| Public rooms cap **25 users**, cloned for overflow; navigator lists 35 busiest rooms | <https://cokestudios.miraheze.org/wiki/Public_rooms>, Studio/FAQ | HIGH |
| Chat: Speak = **5-tile radius** (degrades to dots), Shout = whole room, bold | Archived General FAQ | HIGH |
| **Paid professional moderators 24/7**, no volunteers; warn → kick → permaban wiping decibels | <https://cokestudios.miraheze.org/wiki/Coke_Studios/Safety> and Moderation FAQ | HIGH |
| **"blah" filter** on chat, names, room names and descriptions, active even in private rooms | Same | HIGH |
| **"Free Greens"** rooms as the dominant emergent social institution | <https://cokestudios.miraheze.org/wiki/Studio>, <https://cokestudios.miraheze.org/wiki/Performing> | HIGH |
| Studiocom (Atlanta) engaged **Sulake in 2001**; Habbo tech as the base; dev Jan 2002, launch June 2002; handed to Studiocom after | <https://cokestudios.miraheze.org/wiki/Coke_Studios>, <https://cokestudios.miraheze.org/wiki/Studiocom> | HIGH |
| Client ran on **Macromedia/Adobe Shockwave** (Director, Lingo) | <https://cokestudios.miraheze.org/wiki/Coke_Studios> + decompiled `.lasm` in jtieri repo | HIGH |
| Habbo lineage in code: backpack internally called **"hand"**, `room_hand_item_#` | <https://cokestudios.miraheze.org/wiki/Backpack> | HIGH |
| Studiocom built its own **"Galapagos"** engine for v2 | README, <https://github.com/jtieri/Coke-Studios-Source> | MEDIUM (single source) |
| Music Mixer web app was **Flash**, distinct from the Shockwave client | Inferred from SWF sprite-frame assets in CSMusicMixer | LOW-MEDIUM |
| **Shut down 6 Dec 2007**; replaced by **CC Metro** on There.com; furni → Therebucks; CC Metro dead 9 Mar 2010 | <https://cokestudios.miraheze.org/wiki/CC_Metro> with Wayback and Hollywood Reporter citations | HIGH |
| Peak: >1M page views/day, +200k uniques/month, 3rd most popular teen site 2004; ~8M lifetime users | Developer Mark Blottner and MediaVillage, both quoted on the wiki | MEDIUM (his site is ModSecurity-blocked; could not verify directly) |
| Original service ran limited daily hours, ~10am–2am | Inferred from <https://cokestudios.miraheze.org/wiki/Decibel> changelog + Games page | MEDIUM |
| **Decibel** (<https://decibel.fun>) live since 28 June 2025, emulating v2 on original Shockwave, non-profit | Site fetched directly; <https://cokestudios.miraheze.org/wiki/Decibel> | HIGH |
| CaveJam and SodaStudios live; CokePhase stale since 2018; OurCoke defunct | Sites fetched directly; GitHub API metadata; r/cokemusic feed | HIGH |
| Removing the create-perform-vote loop is what players mourn in successors | <https://www.reddit.com/r/cokemusic/comments/j19ght/thoughts_on_cavejam/> | HIGH (single detailed first-hand review) |

---

## Open Questions

1. **Exact sequencer geometry.** Was the original grid really ~60 seconds with step counts varying by
   sample length, and was it 5 rows or 6? The official FAQ says 5 track lines; the only working
   reconstruction builds 6. Resolving this needs either the decompiled mixer (if it exists in the
   `jtieri` archive — I did not exhaustively search it) or a session with Decibel, which runs the
   real thing.
2. **Per-track volume.** The recreation exposes a volume slider per row. I found no original source
   confirming it. Unknown whether the original had per-track mixing at all, or only on/off steps.
3. **Song serialisation.** The one exported song I found is a ~135-byte signed-integer blob. The
   encoding is undocumented — worth reverse-engineering if you want import/export compatibility with
   archived songs.
4. **Whether the Music Mixer was Flash or Shockwave.** My inference rests on the recreation's asset
   filenames. A look at the archived mycoke.com mixer page would settle it.
5. **"Galapagos".** Only the `jtieri` README names Studiocom's v2 engine. No second source. If true
   it means v2 was *not* Habbo-derived, which materially changes the provenance story.
6. **Exact operating hours** and whether they varied by era or region.
7. **Website minigame payouts.** I have Decibel's *modern* numbers (Uncover the Music 200/50 dB;
   Recycler leaderboard 750/500/250 dB) but not the originals. Recycler originally paid furni, not
   decibels — the original decibel rates for Coaster, Pop Quiz and Uncover the Music are unconfirmed.
8. **Peak-usage figures.** 8M users and 1M page views/day both trace to marketing-adjacent sources
   quoted secondhand. I could not reach Mark Blottner's page (ModSecurity 406).
9. **Reddit sentiment breadth.** Reddit blocked both JSON and HTML fetches; I worked from the RSS
   feed, which gave me top-post titles and bodies but **no comment threads**. The richest nostalgia
   discussion is almost certainly in comments I could not read.
10. **The Sulka Haro Substack post.** The wiki cites an inbox-scoped Substack URL that does not
    resolve publicly. The developer-side account of the mixer's design constraints is the single most
    valuable primary source for this project and I could only get it secondhand.
