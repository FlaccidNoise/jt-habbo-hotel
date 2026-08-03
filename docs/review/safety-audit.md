# Trust and Safety Audit — "The Grand"

Adversarial review of [docs/design/GAME.md](../design/GAME.md) and
[docs/design/PIPELINES.md](../design/PIPELINES.md) against the project's own research
([habbo-hotel.md §2.4, §5.2](../research/habbo-hotel.md), [coke-music.md §3.5](../research/coke-music.md))
and the child-safety legal regimes in force as of **August 2026**.

Reviewer posture: every "the design handles this" claim is treated as false until the doc says
*what* handles it, *who* staffs it, and *what happens when it fails*.

**Result: 28 findings — 4 existential, 19 major, 5 minor.**

The design's Pillar 6 says "Moderation is a core feature" (GAME.md:32-34). Measured against the
build order, the staffing model, and the surface coverage, that pillar is currently a statement of
intent with no implementation behind it. The docs specify the isometric projection to the pixel
(PIPELINES.md:5-16) and the moderation service in one table row (PIPELINES.md:83). That asymmetry
is the audit's headline.

---

## Summary table

| Severity | File:Line | Issue | Fix |
|---|---|---|---|
| EXISTENTIAL | GAME.md:209, 231-233 | "Adults first, lighter legal burden" is not a legal position under any 2026 regime without age assurance | Pick 13+ with age-banded chat, or 18+ with age estimation at registration. Self-declared 18+ is not an option |
| EXISTENTIAL | GAME.md:185, 187 | Whisper and friends-console DMs have no stated moderation mechanism | Sampling, retention, behavioural scoring, and moderator visibility on both. New accounts start without either |
| EXISTENTIAL | GAME.md:19-20, 179, 206 | Private/invite-only rooms are unobservable, and room-owner powers hand authority to the likely threat | Bound owner powers to disruption. Panic button always escapes the room. Owner ban patterns are a risk signal |
| EXISTENTIAL | GAME.md:206; PIPELINES.md:108-115 | "Paid moderators only" has no staffing model, no cost, no scale trigger, and no place in the build order | Staffed opening hours at launch, moderation tooling in build step 1, a published growth cap tied to capacity |
| MAJOR | GAME.md:205 | Moderation posture is entirely reactive — same posture that failed Habbo with 225 moderators | Behavioural risk scoring on interaction patterns, not words. Prioritised room queue, not random watching |
| MAJOR | GAME.md (absent) | No graduated incident response — the only precedent instrument is Habbo's global mute | Runtime flags to disable whisper, DMs, private rooms, and minting independently |
| MAJOR | GAME.md:202, 188, 197-198 | Filter surface list omits mottos, group names, group badges, song titles, and chart entries | Extend the list. Broadcast surfaces (charts, Navigator features) get a review tier above creation-time filtering |
| MAJOR | GAME.md:188 | Custom group badges are a pattern editor with no moderation gate stated anywhere | Route badges through the same gate as minted furni. Badges are worse — they render next to the avatar |
| MAJOR | GAME.md:202-203 | No normalisation spec. Substitution tells the attacker exactly which token tripped | NFKC + confusables + whitespace/repeat collapse before matching. Shadow-substitute so the sender sees no feedback |
| MAJOR | Both docs (absent) | Multilingual filtering and multilingual moderator coverage are not mentioned at all | Either declare a single-language launch as an explicit moderation-scope decision, or budget per-language lists, classifiers, and staff |
| MAJOR | PIPELINES.md:44-45 | "Rendered sprite through image screening" treats an unsolved classification problem as a solved dependency | Name the method. Off-the-shelf classifiers do not detect pixel-art hate symbols. Assume high human-review load |
| MAJOR | PIPELINES.md:48-49 | Symmetric pattern generators produce swastikas by construction | Restrict player-facing pattern selection to a curated authored set. Add a geometry check on 4-fold rotational output |
| MAJOR | PIPELINES.md:44-46, 55 | Minting queue has no rate limit, no throughput model, no SLA, and rejection is nearly free | Per-account mint rate limit. Malicious rejection forfeits the full fee and adds a strike. Fee floor set by queue capacity |
| MAJOR | PIPELINES.md:46; GAME.md:113-119 | No recall path for a design found offensive after sale | Catalog delist, forced item destruction, Star refund by compensating ledger entry |
| MAJOR | Both docs (absent) | Room-level composition abuse (tiled furni forming a symbol) has no mechanism at any layer | Report path on rooms. Moderator view of a room's furni layout without entering it |
| MAJOR | GAME.md:205 | No evidence-capture spec and no chat-retention policy, and the two requirements conflict | Rolling operational buffer measured in days, plus a long-hold class for anything attached to a report |
| MAJOR | Both docs (absent) | No law-enforcement or NCMEC escalation path | Named escalation contact, preservation-request handling, CyberTipline reporting path |
| MAJOR | GAME.md:202-206 | No appeals process, against a ban model that destroys an unsellable, unrecoverable account | Two-stage appeal reviewed by someone other than the actioning moderator. Account state frozen, not deleted, during appeal |
| MAJOR | GAME.md:64, 80-90 | Ban evasion is trivial and the registration grant pays for it | Pay the registration grant over the first week. New accounts have no whisper, DMs, private rooms, or trade until an activity threshold |
| MAJOR | GAME.md:161-165 | Social deduction: abuse-in-role is unmitigated | No trade, gifting, friend requests, or whisper inside a lobby. If items cannot move, the role cannot be cashed in |
| MAJOR | GAME.md:163 | Social deduction: the filter and any behavioural classifier are miscalibrated for a game about lying | Deduction chat is a separately-classified channel with its own thresholds. Never the default place a new account meets strangers |
| MAJOR | PIPELINES.md:108-115 | Pre-launch legal artefacts (children's access assessment, risk assessments, DPIA, ToS, privacy policy) are absent from the build order | Add them as gating items, not paperwork. Two of them are statutory preconditions to operating in the UK |
| MAJOR | GAME.md:202 | Off-platform contact ("add me on disc") is outside the filter's stated scope and is the actual 2026 grooming vector | Add platform-handle patterns to the filter, and treat handle-sharing to a lower age band as a high-priority flag |
| MINOR | PIPELINES.md:43 | The doc holds asset gates to "a known-bad input must actually bounce" but holds safety to no such standard | Monthly red-team run posing as an 11-year-old. Time-to-first-explicit-contact is a release gate |
| MINOR | GAME.md:207 | Symmetric ignore blinds the victim and can be weaponised by the abuser | Ignore hides from the player's view only. Reports and moderator visibility are unaffected. Reporting an ignored player must still work |
| MINOR | GAME.md:204 | Permanent usernames have no staff-forced-rename escape hatch | Keep permanence for players. Add a staff-forced rename for names later found offensive |
| MINOR | GAME.md:161-165, 187 | Deduction post-match harassment via permanent names and DMs | Per-match display names, plus a friend-request cooldown between lobby participants |
| MINOR | GAME.md:92-100 | No trade age-banding if the game ends up mixed-age | Restrict trade across age bands, or restrict it to mutual friends of standing |

---

## Legal grounding — what was verified, and what was not

Everything in this section was checked against a source during this audit unless marked otherwise.
Confidence labels are mine.

| Regime | Trigger | What it requires | Confidence |
|---|---|---|---|
| **UK Online Safety Act 2023 (Ofcom)** | Any user-to-user service. Ofcom's October 2025 gaming guidance confirms games with text chat or UGC are in scope | A children's access assessment. You may conclude children are *not* likely to access **only** if you use highly effective age assurance. Otherwise the Protection of Children Codes apply in full (40+ measures, in force 25 July 2025) | HIGH |
| **UK ICO Children's Code** | Information society services "likely to be accessed by children" — a separate test from the OSA, and independent of your stated audience | 15 design standards plus a DPIA. Fines to £17.5m or 4% of global turnover. ICO opened a monitoring programme on games in 2026 | HIGH |
| **COPPA (amended Rule)** | Child-directed by totality of circumstances, **or** actual knowledge of collecting data from an under-13 | Verifiable parental consent, notice, deletion rights, written retention policy. Biometric identifiers are now personal information. A codified "mixed audience" category now exists. Published 22 Apr 2025, full compliance since **22 Apr 2026** | HIGH |
| **COPPA 2.0 / KIDS Act** | Would raise the age ceiling | Passed the Senate unanimously 5 Mar 2026. House passed H.R. 7757 on 29 Jun 2026 without KOSA's duty of care, which Senate sponsors called dead. **Not law.** Treat 13 as a floor Congress has twice voted to raise | HIGH on status, the outcome is unresolved |
| **GDPR Art. 8** | Information society services offered directly to a child, where consent is the lawful basis | Parental authorisation below the member-state age. Default 16, states may lower to no less than 13 | HIGH on the structure. **My sources conflicted on the per-state table — do not rely on any specific country's age without checking it per launch market** |
| **EU DSA Art. 28(1)** | Online platforms *accessible to* minors — not "aimed at" minors | Commission guidelines final 14 Jul 2025. Age assurance must be accurate, reliable, robust, non-intrusive, non-discriminatory. **Self-declaration is explicitly not appropriate age assurance.** Age estimation is the recommended floor where terms set 18+ because of identified risk | HIGH |
| **DSA small-enterprise carve-out** | Micro and small enterprises | I believe Art. 19 disapplies Arts. 20–28 to micro and small enterprises, which would materially change the burden for a small studio | **MEDIUM — get legal advice. This one carve-out changes the cost of the whole EU posture** |
| **US state social media laws** | Varies by state | Mississippi HB 1126 is in effect (SCOTUS declined to block, Kavanaugh writing it was likely unconstitutional). Tennessee HB 1891 and NY SAFE for Kids partly in effect. Texas SCOPE Act enjoined. Louisiana Act 456 permanently enjoined Dec 2025. Florida HB 3's under-14 ban enjoined | HIGH on the snapshot, **and the snapshot moves every quarter** |
| **US state app-store laws** | Distribution through an app store | Texas is in force since 1 Jan 2026 after the Fifth Circuit stayed the injunction and SCOTUS declined to block. Utah delayed to May 2027, Louisiana to July 2027. Alabama also passed. **Not triggered by a v1 web client** (GAME.md:219 makes mobile a non-goal) — log it as a v2 gate | HIGH |
| **Australia Social Media Minimum Age** | Age-restricted platforms, from 10 Dec 2025 | Under-16s barred. **Gaming platforms are currently excluded** — Roblox, Steam, and Discord are named exclusions | HIGH on current status, **MEDIUM on how eSafety would classify this product.** A hotel whose purpose is hanging out, not gameplay, is the edge case the exclusion was not drawn for |

**Not verified during this audit — flagged rather than asserted:**

- *Free Speech Coalition v. Paxton* (SCOTUS, June 2025) upholding Texas HB 1181's age verification
  for sexual material harmful to minors. I believe this is the decision that shifted the litigation
  weather in the states' favour, but I did not confirm it here.
- 18 U.S.C. §2258A, the NCMEC CyberTipline reporting duty. I am confident the duty exists for
  electronic communication service providers. I did not confirm whether it reaches a service of this
  size and shape.
- DSA Art. 20's internal complaint-handling requirement.
- The exact enumeration of COPPA's totality-of-circumstances factors at 16 CFR 312.2.
- Moderator cost figures below are derived from coverage arithmetic. **I found no published
  industry benchmark for moderators-per-user.** Replace them with a real quote before budgeting.

---

# EXISTENTIAL FINDINGS

## S1 — "Adults first, lighter legal burden" is not a legal position

**Section:** GAME.md:209 ("Audience decision is open"), GAME.md:231-233 (open question 2).

### The gap

The doc frames the choice as "adult-nostalgia-first (lighter legal burden) vs teen-inclusive
(COPPA/GDPR-K, heavy moderation cost)" and recommends adults first. The parenthetical is the error.
**Declaring an adult audience reduces nothing.** Under every regime checked above, the duty attaches
to whether children *can* access the service, not to whom you say it is for:

- The **OSA** lets you escape the children's codes only by demonstrating children cannot access —
  and Ofcom's position is that this demonstration requires highly effective age assurance.
- The **ICO Children's Code** triggers on "likely to be accessed by children," a factual test about
  your actual audience.
- **DSA Art. 28** applies to platforms minors *can* access, and the Commission's July 2025
  guidelines say self-declaration does not count as age assurance.
- **COPPA** triggers on child-directedness by totality of circumstances. An isometric cartoon hotel
  with avatar dress-up, decoration, pets-adjacent collecting, and minigames scores badly on nearly
  every factor the FTC weighs. The amended Rule's new **mixed audience** category is a precise
  description of this product.

So the position the doc recommends — 18+ by self-declaration — produces the worst outcome available.
You carry the child-safety duties anyway, because you cannot show children are absent. You have no
parental-consent infrastructure, because you told yourself you did not need one. And you have made a
**public representation about your audience** that a regulator or a plaintiff can use against you.

That last point is the live risk, not a theoretical one. The 11+ state attorney-general actions
against Roblox (about $54M settled across five states as of July 2026, plus a federal MDL
consolidated in December 2025 holding 170 cases by July 2026) are pleaded substantially as
**deceptive safety representations**, not only as failure to moderate. "Adults only" printed on a
product with visible minors in it is that theory in one sentence.

### The lead's question — is it coherent given the visual style?

No. Isometric pixel-art avatar decoration is a children's aesthetic, and the design leans into it
deliberately. Habbo's own experience settles the argument: it ran an explicitly teen-and-young-adult
product and Common Sense Media still rated it 1 star and recommended it for no child of any age
(habbo §2.4). Sulake could not keep minors out of a product built for teenagers. This design will
not keep them out of a product built to *look* like one.

The comparison that matters is Roblox, January 2026: it now requires **facial age estimation to
access chat, for every user, worldwide**, with six age bands from under-9 to over-21 and chat
permitted only within or below your own band. The largest platform in this category concluded that
knowing user age is a precondition to running chat at all. "Adults first, rating pending" is not a
lighter version of that. It is the absence of a position.

### The fix

There are three coherent options, not two. The doc must pick one.

**A — 13+ with age-banded chat.** Age assurance at the chat gate, band recorded on the account,
chat and DMs routed within band, trade restricted across bands. Largest addressable audience, most
defensible, highest cost. This is the Roblox model and it is where the regulatory direction points.

**B — 18+ genuinely enforced.** Age estimation at registration through a vendor, with a documented
false-negative handling path for the minors who get through. Genuinely lighter *ongoing* moderation
burden because the population is adult, but it requires real vendor spend from day one and it caps
your market hard.

**C — 18+ self-declared.** What the doc currently implies. Do not ship this.

**Whichever is chosen, record it before the chat or economy work starts.** Age banding touches the
account model, the chat router, the DM router, the trade rules, and the room-join rules. This is
exactly the class of retrofit the doc already refuses to accept elsewhere: GAME.md:36-37 reserves
architecture for a Wired-class system on the grounds that "retrofitting variables and signals is
very hard." Age banding is a larger retrofit than Wired and the doc reserves nothing for it.

**One second-order consequence to design for now:** age assurance creates a privacy liability. Face
scans and ID documents are special-category data, and the amended COPPA Rule added biometric
identifiers to the definition of personal information. Use a vendor-mediated flow with
delete-on-process semantics (the Persona/Yoti pattern Roblox uses). Never store the artefact
yourself, and never store anything beyond a band label and a check timestamp.

---

## S2 — Whisper and friends-console DMs have no moderation mechanism

**Section:** GAME.md:185 ("Whisper is private"), GAME.md:187 (friends console),
PIPELINES.md:83 (moderation service responsibilities).

### The gap

GAME.md:203 says the filter "runs everywhere including private rooms." Filtered is not moderated.
The filter substitutes tokens. It does not detect a grooming conversation, which contains no
profanity by design.

The moderation service's stated responsibilities are "Filter (reject names, substitute chat), report
queue, **room watch**, audit log" (PIPELINES.md:83). Room watch is the Coke Music tool — a moderator
observes room chat. **A moderator watching a room sees none of the whisper traffic inside it, and
none of the friends-console DM traffic at all.** The design ships two private, persistent,
stranger-to-stranger channels and specifies no observation, sampling, retention, or scoring on
either.

This is the surface that produced the 2012 story. It is unaddressed.

The friends console is worse than whisper in one respect: it is room-independent (GAME.md:187), so
the conversation continues after the victim leaves the room where contact started, with no shared
context a moderator could stumble into. Friend requests come from the infostand, so prospecting is
one click per target, and nothing in the doc rate-limits it.

### What Habbo's 2012 failure teaches that the doc has not absorbed

**Scale of moderation is not a defence.** Sulake had 225+ moderators, tracked roughly 70 million
lines of conversation a day, and held a European Commission citation as one of the safest social
networks. A Channel 4 reporter posing as an 11-year-old found explicit sexual chat **within
minutes**. The lesson is not "hire more moderators." It is that reactive, volume-based moderation
fails against a determined actor, and this design's stated posture ("routed to staffed moderation",
GAME.md:205) is the same reactive posture that failed.

### The fix

1. **State the retention and sampling policy for whisper and DMs explicitly in GAME.md.** Whatever
   it is, the doc must say it. Silence here is the finding.
2. **Score behaviour, not words.** The signals that catch grooming are structural and cheap to
   compute: an older-band account initiating whispers to many younger-band accounts, a high ratio of
   whispers to room chat, rapid friend-adds with low acceptance, a conversation that moves from a
   public room to DMs within minutes of first contact, repeated invitations to a locked room. None
   of this needs to read the message content. Add it to PIPELINES.md:83 as a named service
   responsibility.
3. **Gate both surfaces behind account standing.** New accounts get no whisper and no DMs until an
   activity threshold. This is cheap, well-precedented, and it also defeats the economic alt-farming
   the doc already worries about at GAME.md:80-85. One control, two problems.
4. **Cross-band DM restriction** if the game goes 13+. An adult-band account should not be able to
   open a DM thread with a young-band account it has not met in a public room.
5. **Ship without whisper if you cannot staff it.** See S4. Whisper is a feature, not a pillar.

---

## S3 — Private rooms are unobservable, and room-owner powers hand authority to the threat

**Section:** GAME.md:19-20 (Pillar 1), GAME.md:179 (room states), GAME.md:206.

### The gap

Pillar 1 states: "Room owners hold kick/ban/mute rights, so moderation scales with the community."
GAME.md:179 gives every room "locked / password / invite-only states."

Two problems, and the second contradicts the doc's own safety section.

**First: invite-only rooms are unobservable spaces by design.** A moderator cannot walk into one.
Room watch cannot list one that nobody reported. The design provides the private space and provides
no way to see into it.

**Second, and more serious: Pillar 1 is the volunteer-moderation argument wearing different
clothes.** GAME.md:206 correctly says "Paid moderators only. Volunteer moderation failed Habbo and
was refused by Coke Music." Habbo terminated the Hobba programme on 31 December 2005 citing security
issues — and Hobbas were *vetted*. This design hands room-scoped kick, ban, and mute powers to
**every player automatically, with no vetting at all**, and then describes that as moderation
scaling.

For nuisance, owner powers work. For abuse, they invert. **The room owner is the likely threat.** A
predator who owns an invite-only room has:

- a private space no moderator can enter,
- authority to remove any witness,
- authority to silence a victim who threatens to report,
- and a mechanic the design calls a moderation feature.

The trade system compounds it. Tradeable goods (GAME.md:92-94) plus a room the owner controls is the
documented Habbo and Roblox item-grooming pattern — "come to my room and I'll give you rares."

### The fix

1. **Rewrite Pillar 1.** Owner powers cover disruption — spam, nuisance, unwanted guests. They are
   not a safety control and the doc should stop describing them as one. This also removes an
   internal contradiction with GAME.md:206.
2. **The panic button always escapes the room.** State it in GAME.md:205. Being muted, kicked, or
   banned by an owner must never disable Call for Assistance, and must never destroy the reporter's
   ability to report what already happened.
3. **Owner enforcement actions are logged and are themselves a signal.** An owner who bans a player
   shortly after that player filed a report is a high-priority flag. This is a cheap query over data
   you already keep for the audit log.
4. **Bound the private-room states.** Options, in increasing cost: no invite-only rooms at launch —
   public and password only, with password rooms still enterable by staff. Or invite-only rooms
   permitted but capped in guest count and excluded for accounts below an age band. Or invite-only
   permitted but the room's chat carries a higher sampling rate. Pick one and write it down.
5. **Staff enter any room, silently.** Say so in the doc, and say so in the terms of service so it
   is not a surprise.

---

## S4 — "Paid moderators only" is an unfunded, unscheduled promise

**Section:** GAME.md:32-34 (Pillar 6), GAME.md:206, PIPELINES.md:83, PIPELINES.md:108-115.

### The gap

Pillar 6 says moderation is a core feature. GAME.md:206 commits to paid moderators. Neither doc
contains a staffing number, a cost, a coverage window, a scale trigger, or an escalation ladder.

**The build order is the proof.** PIPELINES.md:108-115 lists eight steps. Step 1 is "Room render +
avatar walk + chat." Moderation tooling appears in **none of the eight**. If chat ships in step 1
and moderation tooling ships later, then there is a defined window during which Pillar 6 is false.
That window is when a small new social game is most exposed, because it is when the first wave of
users is testing what the game will tolerate.

### The research anchor the design skipped

Coke Music's answer to the affordability problem is in the research and the design ignores it. Coke
Studios ran **limited daily hours, roughly 10am–2am** (coke §3.5). The research correctly infers this
was a moderation-coverage constraint. Coke Music's response to "we cannot afford 24/7 moderation"
was **to close the game at night.** The design has no opening-hours concept and no equivalent lever.

The other anchor: Habbo's 225+ moderators against ~9 million monthly visitors is roughly **one
moderator per 40,000 monthly visitors — and that ratio failed publicly and cost the company half its
users.** It is a floor for what is demonstrably not enough, not a target.

### Cost arithmetic — derived, not benchmarked

I found no published moderators-per-user benchmark. These are coverage numbers from first
principles and **must be replaced by a real quote from a trust-and-safety provider before anyone
budgets against them.**

- One always-staffed seat, 24/7, needs roughly **4.5–5 FTE** (168 hours a week against ~37.5
  productive hours, plus leave, sickness, and attrition cover).
- At a fully-loaded £35–55k per FTE in a UK or European market, one always-on seat costs roughly
  **£160–275k a year**.
- You need at least two concurrent seats to be functional — one working the report queue, one
  watching rooms — so **£320–550k a year** before tooling, vendor filtering, or a lead.
- Multiply by language. This is the dominant cost driver in every real trust-and-safety
  organisation, and the docs never mention languages at all (see S10).

**So the answer to "at what population does the promise become unaffordable" is: immediately, at any
population, if the coverage window is 24/7 and unfunded.** The population is not the variable that
breaks it. The coverage window is.

### The fix — a graduated model, in the order it should ship

**Tier 0 — staffed opening hours.** Launch with the hotel open only during staffed hours. This is
Coke Music's proven lever and it fits the fiction perfectly — a hotel has opening hours, and a
nightly closing ritual is a social event, not an apology. Highest-leverage cost control available,
and it makes the SLA question in S16 answerable: there is never a time when nobody is on duty.

**Tier 1 — surface reduction.** Ship without whisper and without invite-only rooms. Add them when
you can staff them. **The doc's current risk ordering is inverted:** it defers Wired, mobile, and
free-form scripting (GAME.md:211-219, all low-risk) to v2, while shipping every high-risk social
surface in v1.

**Tier 2 — tooling leverage.** A prioritised queue that routes a moderator to the room that needs
them, driven by the behavioural signals in S2. Coke Music's "watch several rooms simultaneously"
was a 2003 tool. Watching rooms at random does not scale, and it is what PIPELINES.md:83 currently
describes. Rewrite that row.

**Tier 3 — bounded room-owner powers.** Per S3. Real, but only for nuisance.

**Tier 4 — trusted flaggers, which are not volunteer moderators.** State this distinction in the doc
so nobody later "solves" the cost problem by reinventing Hobbas. A trusted flagger has **no powers
over other players**. They have a weighted report that jumps the queue. Accuracy is tracked. The
privilege is revoked for bad flagging. That is a different trust model from Habbo's, which is what
habbo §2.4 says is required.

**The scale trigger, stated plainly:** define the concurrent-user number at which each tier is
added, and **define the number at which registration closes.** No doc currently contains the idea
that growth might be capped to match moderation capacity. It should. Moderation capacity is the
binding constraint on this product, not servers, and the only way to keep a moderation promise
against unbounded growth is to bound the growth.

**And put moderation tooling in build step 1.** Room watch, the report queue, and mute/kick/ban
tooling ship alongside chat or chat does not ship. That single edit to PIPELINES.md:110 makes
Pillar 6 true.

---

# MAJOR FINDINGS

## S5 — The moderation posture is entirely reactive

**Section:** GAME.md:205.

**Gap.** Everything in the safety section is triggered by a human noticing something: a report, a
filter match, a moderator happening to watch the right room. Habbo ran that posture with 225
moderators and 70 million tracked lines a day, and a reporter defeated it in minutes.

**Fix.** Add proactive detection as a stated design element, built on interaction structure rather
than message content — the signal list is in S2. Cheap to compute, robust to filter bypass, and it
is the only thing that scales sub-linearly with population, which is what makes S4's economics work.

## S6 — No graduated incident response

**Section:** absent from both docs.

**Gap.** Sulake muted every hotel on earth within hours of the Channel 4 broadcast because it had no
finer instrument. That is the precedent the design inherits by default. Muting your whole game is an
extinction event for a small game.

**Fix.** Build the finer instrument now, as runtime flags with no deploy required: whisper off, DMs
off, private rooms forced public, minting paused, new registrations paused, chat rate-limited,
per-room and per-region scoping on each. Write the incident playbook that says who can pull each
flag. This is a day of work if designed in and a week of downtime if not.

## S7 — The filter surface list is incomplete

**Section:** GAME.md:202 lists "chat, usernames, room names, descriptions, and design names."

**Gap.** Missing surfaces that exist elsewhere in the same document:

- **Motto** — GAME.md:204 says "Motto is editable" and GAME.md:198 lists it as a status system. It
  is editable free text rendered on the infostand next to the avatar. Not in the filter list.
- **Group names** (GAME.md:188).
- **Group badges** (GAME.md:188) — see S8.
- **Song titles** (GAME.md:106-111). Songs reach the Top 40 charts, which are a broadcast surface.
- **Chart and Navigator entries** (GAME.md:181, 197) — a name that passes creation-time filtering
  and then reaches a featured list has escalated from one room to every browsing player.

**Fix.** Extend the list to every free-text field in the product, and add a **second review tier for
broadcast surfaces**. Creation-time filtering is the right control for a room only its guests see.
It is the wrong control for the Top 40 and the Navigator featured rotation, which need human
review before promotion. The Habbo-documented pattern is a room name crafted to pass a filter while
signalling intent to the whole Navigator.

## S8 — Custom group badges have no moderation gate

**Section:** GAME.md:188.

**Gap.** "Groups: player-made, custom badge." A custom badge editor is a pattern generator with a
small canvas, and it appears in the moderation list at GAME.md:202-208 **nowhere at all**. Badges
render next to the avatar in every room, so a hate symbol in a badge is broadcast continuously with
no message to filter.

**Fix.** Route badges through the same gate as minted furni (PIPELINES.md:44-46). Badges deserve a
*stricter* gate than furni, because a piece of furni sits in one room and a badge follows its
wearer everywhere. Consider a curated symbol set with recolouring rather than a free editor — the
same argument the design already makes for furni at Pillar 4 (GAME.md:27-29), applied consistently.

## S9 — No normalisation spec, and substitution leaks feedback

**Section:** GAME.md:202-203 ("Names reject, chat substitutes").

**Gap.** The reject/substitute split is correctly copied from Coke Music and is right. Two problems
sit underneath it.

*Bypass.* The research documents bypass culture in both source games — coke §3.5 says players routed
around the filter "with spaced-out letters, as always," and habbo §2.4 shows Habbo eventually
migrating to Community Sift, an ML scorer, because wordlists lost. The doc specifies a filter and no
normalisation. The known technique set is spaced letters, leetspeak, homoglyphs and Cyrillic
lookalikes, zero-width joiners, phonetic substitution, and agreed code words.

*Feedback.* Substitution shows the sender exactly which token tripped, which turns the filter into a
free oracle. Players probe variations until one passes, then use it.

**Fix.**

1. Normalise before matching: NFKC, Unicode confusables mapping, whitespace and punctuation
   collapse, repeated-character collapse, and strip zero-width characters. This is a solved
   engineering step and the doc should name it.
2. **Shadow-substitute.** The sender sees their own message unchanged. Recipients see it filtered.
   This removes the oracle at near-zero cost.
3. Specify a **scoring layer above the wordlist**, since Habbo's endpoint was a scorer and yours
   will be too. Design for it now rather than bolting it on.
4. **Do not treat the filter as the control.** Roblox's chat filter was publicly documented as
   bypassed by leetspeak and code words in May 2026, on a far larger budget than this project will
   ever have. The filter is a speed bump. The controls are behavioural detection (S5) and reporting
   (S16).

## S10 — Multilingual filtering and moderation are absent

**Section:** neither doc mentions language at all.

**Gap.** Habbo ran nine language hotels. A single-language filter against a multilingual player base
is not a filter — it is an English-only filter that leaves every other language completely open,
which is worse than no filter because it looks like coverage. Language is also the dominant driver
of moderation staffing cost (S4).

**Fix.** Take a position, in writing, in GAME.md:

- **Option A:** launch in one language, enforce it in the terms of service, and route non-target-
  language chat to a review queue rather than through an unmatched filter. State this as a
  deliberate moderation-scope decision, not an oversight.
- **Option B:** budget per-language wordlists, per-language classifiers, and per-language moderator
  coverage per launch market, and note that each added language multiplies the S4 arithmetic.

There is no third option where the doc stays silent.

## S11 — "Image screening" is an unsolved problem treated as a dependency

**Section:** PIPELINES.md:44-45, stage 5.

**Gap.** "Rendered sprite through image screening" is one clause covering a genuinely hard problem.
Commercial image classifiers detect nudity and gore in **photographs**. They do not detect a
64×32 pixel-art swastika, an SS rune emitted by a pattern generator, or a chair whose part
composition reads as genitalia. There is no off-the-shelf answer for this domain, and the pipeline's
throughput model (S13) depends on the automated pass catching most things.

**Fix.**

1. Say what the method actually is. If the honest answer is "human review of every minted design at
   launch," write that down — it is a defensible answer and it sets the fee floor correctly.
2. Add a **hate-symbol geometry check** on the rendered sprite rather than a general image
   classifier. The target set is small, well-known, and geometrically specific at this resolution.
   That is a tractable problem where general classification is not.
3. Add a **similarity check against previously rejected designs.** The dominant attack is
   resubmitting a rejected design with one part swapped.
4. Assume a high human-review fraction in the cost model, and revise it down with evidence rather
   than up.

## S12 — Symmetric pattern generators produce hate symbols by construction

**Section:** PIPELINES.md:48-49.

**Gap.** "Genuinely procedural classes — rugs, wallpaper, flooring, tile patterns — can use
constrained symmetric pattern generators from the start." A swastika **is** a four-fold rotationally
symmetric motif on a grid. A generator that explores that symmetry group will produce it, not as an
abuse case but as ordinary output. The doc names symmetric generation as the low-risk starting
point. It is the highest-risk component in the pipeline.

**Fix.** In order of preference:

1. Restrict player-facing pattern selection to a **curated authored set** with recolouring, rather
   than a free seed space. This matches Pillar 4's own logic (GAME.md:27-29) and costs the least.
2. If a seed space is kept, run every emitted pattern through a geometry check before it is offered
   to the player, and reject rather than substitute.
3. Restrict the symmetry group. Harder than it sounds and it narrows the design space, so treat it
   as a fallback.

Note this is a gate on the **generator**, not on the player. It applies to designer-authored output
too — an unlucky seed in your own catalog is the same headline.

## S13 — The minting queue has no throughput model and rejection is nearly free

**Section:** PIPELINES.md:44-46, PIPELINES.md:55.

**Gap.** Stage 5 ends in a "human review queue for flagged items" with no stated review fraction, no
SLA, no rate limit, and no capacity number. The design actively **incentivises minting volume**:
minting is a Star sink (GAME.md:73) and design sales are an earning path (GAME.md:113-119), so
players will mint speculatively. The only throttle is the minting fee, and the fee is set for
economic reasons (GAME.md:234, "creator cut, tune between 30–70%"), not for moderation throughput.

Worse, PIPELINES.md:55 says "Rejected mints refund the fee minus a small processing sink." **A
rejected malicious mint therefore costs the attacker almost nothing.** The one case where the fee
needs to deter is the case where it is refunded.

**Fix.**

1. **Per-account mint rate limit**, independent of the fee.
2. **Malicious rejection forfeits the full fee and adds an account strike.** Keep the near-full
   refund for good-faith rejections (a palette compliance failure at stage 4) and separate the two
   rejection classes in the pipeline. Stage 4 failures are honest mistakes. Stage 5 failures are
   not.
3. **Set the fee floor from queue capacity**, and state the dependency in the doc so the economy
   tuning pass cannot silently lower it below the moderation budget.
4. State the review SLA and what happens when the queue exceeds it — designs wait, they do not
   auto-approve. Say so explicitly, because auto-approve-on-timeout is the default that gets built
   when nobody writes down the alternative.

## S14 — No recall path for a published design

**Section:** PIPELINES.md:46, GAME.md:113-119.

**Gap.** A design passes the gate, enters the catalog, sells 400 copies, and is then found
offensive — a part composition nobody caught, or a name whose meaning is regional. The docs have no
recall path. Items are tradeable (GAME.md:93), so copies are scattered across hundreds of
inventories, and the ledger is append-only (PIPELINES.md:80).

**Fix.** Design the recall now: catalog delist, forced destruction of every instance by item ID, and
a Star refund to holders through a **compensating ledger entry**. Append-only does not forbid
compensating transactions, but it does mean the recall must be modelled as one rather than as a
deletion. Also decide what happens to the creator's chart position and any trophy the design earned
— GAME.md:118 says design charts and engraved trophies mirror the music charts, and an engraved
permanent trophy for a recalled design is a problem you only get to solve once.

## S15 — Room-level composition abuse has no mechanism at any layer

**Section:** neither doc.

**Gap.** Item-level screening cannot catch room-level composition. Four individually innocuous rugs
tile into a symbol. A wall-art set spells a slur across five tiles. Furni is placed by the player
after every gate has passed. This is the Minecraft and Roblox build problem, it is not solvable at
the minting gate, and the docs have no room-level control at all.

**Fix.** This one has to be reactive, and that is fine as long as it is stated:

1. A **report path on rooms**, distinct from reporting a player.
2. A moderator view that renders a room's furni layout **without the moderator entering it**, so
   investigating does not announce itself.
3. Room reports carry the layout snapshot, so the evidence survives the owner rearranging.

## S16 — No evidence capture and no retention policy, and the two conflict

**Section:** GAME.md:205.

**Gap.** "One-click Call for Assistance on every screen, blame-free framing, routed to staffed
moderation." Nothing says what a report *contains*. If evidence is gathered when the report is
filed, the evidence is already gone — the relevant chat happened before the victim decided to
report.

Neither doc mentions chat retention. There is a real conflict here that the design must resolve
rather than avoid:

- Short retention protects privacy and satisfies data minimisation, which the ICO Children's Code
  requires as one of its standards.
- Short retention destroys the evidence for delayed reports. A child reports a week later. A parent
  reports a month later. Police request records six months later.

**Fix.**

1. **Rolling capture, not query-time capture.** A report snapshots the reported player's room chat
   for N minutes before and after, all whispers involving the reporter, the room state and guest
   list, and the reporter's own client view.
2. **Two retention classes.** A short operational buffer measured in days covering all chat, and a
   long-hold class measured in years for anything attached to a report or a safety flag, with
   legal-hold semantics that survive a deletion request. State both periods in the doc.
3. **A response-time target by category.** Child-safety reports and spam reports are not the same
   queue. Under S4's Tier 0 (staffed opening hours) the "nobody is on duty" case does not arise,
   which is the second reason to adopt it.
4. State the deletion-request interaction. A player exercising a GDPR erasure right does not get to
   erase the evidence in an open safety investigation, and the doc should say which lawful basis
   covers that.

## S17 — No law-enforcement or NCMEC escalation path

**Section:** neither doc.

**Gap.** The escalation ladder implied by the research is warning → kick → ban (coke §3.5). There is
no rung above ban. The docs never mention law enforcement, preservation requests, a designated
contact, or child-safety reporting obligations.

**Fix.** Add to GAME.md's safety section: a named escalation path above ban, a designated point of
contact for law-enforcement requests, a documented preservation-request process wired to the
long-hold retention class in S16, and a CyberTipline reporting path.

**Confidence note:** I am confident the US NCMEC reporting duty (18 U.S.C. §2258A) exists for
electronic communication service providers. I did not confirm during this audit whether it reaches a
service of this size and shape, and it needs counsel rather than my guess. Build the path regardless
— the cost of having it and not needing it is a page of process.

## S18 — No appeals process, against a ban model that destroys unrecoverable work

**Section:** GAME.md:202-206.

**Gap.** No appeals mechanism appears in either doc, for any enforcement action. The lead is right
that the filter runs on design names with no stated appeal route, and the problem is broader.

This design makes false-positive bans unusually severe. Coke Music's ladder ended in a permanent ban
that **destroyed the account and all decibels** (coke §3.5). This design has an earned-only economy
where currency is bound and never purchasable (GAME.md:52), so a banned account loses years of work
that cannot be re-bought, cannot be transferred out, and cannot be recovered. Add permanent
usernames (GAME.md:204) and the loss includes the identity.

**Fix.**

1. A two-stage appeal, reviewed by someone other than the moderator who took the action.
2. **Account state frozen, not deleted, during and after appeal.** A ban that destroys data forecloses
   the appeal it is being appealed against.
3. Appeals cover filter rejections too — usernames, design names, group names, room names — since
   any of them can false-positive on an ordinary word in another language.
4. Publish the enforcement ladder and the appeal route in the terms of service. The OSA requires
   clear and consistently-enforced terms, and I believe DSA Art. 20 requires an internal
   complaint-handling system for EU-facing online platforms, subject to the small-enterprise
   carve-out flagged in the legal table.

## S19 — Ban evasion is trivial, and the registration grant pays for it

**Section:** GAME.md:64 (registration faucet), GAME.md:80-90 (anti-abuse).

**Gap.** Registration is free and grants Stars — "one-time (tune), enough to furnish a starter room
modestly." A banned player therefore re-registers in seconds and **is paid to do so**. The anti-abuse
section worries about alt accounts purely as an economic problem (vote farming) and never connects
alts to ban evasion, which is the more damaging use.

**Fix.**

1. **Pay the registration grant over the first week of play**, not at signup. A fresh alt is then
   worth nothing on day one, which is exactly when a ban evader creates it.
2. Reuse the device and network heuristics the doc already plans for alt-farming (GAME.md:82-83) as
   ban-evasion signals. Same data, second purpose.
3. **New accounts start with restricted surfaces**: no whisper, no DMs, no invite-only rooms, no
   trade, until an activity threshold. This is the same control as S2 item 3 and it now solves a
   third problem. It is the single highest-value cheap control in this audit.
4. Ban the account's *content* alongside the account. A banned player's rooms, minted designs, and
   group badges should not outlive the ban.

## S20 — Social deduction: abuse-in-role is unmitigated

**Section:** GAME.md:161-165.

**Gap.** "Social deduction — scheduled lobbies of 8–12 in themed rooms, roles dealt by the server,
chat through the standard filter, moderator tools on every lobby."

The design has officially sanctioned lying to strangers inside a game that also has tradeable goods,
friend requests, and private messaging. "The werewolf told me to give him my items" is not an edge
case, it is the obvious play. Every manipulation the game teaches is directly transferable to item
scams, and the game supplies plausible deniability for both parties.

**Fix — structural and cheap.** Inside a deduction lobby: **no trade, no gifting, no friend
requests, no whisper, and no item references in chat.** If items cannot move and contacts cannot
form during a match, the role cannot be cashed in. Roles do not persist across lobbies. Add a
post-match cooldown before lobby participants can friend each other (see S27).

The design already accepts a version of this argument elsewhere — Pillar 3 removes player-run
wagering entirely rather than policing it (GAME.md:24-26). Apply the same reasoning here: remove the
capability rather than moderate its use.

## S21 — Social deduction: the filter and any classifier are miscalibrated for a lying game

**Section:** GAME.md:163 ("chat through the standard filter").

**Gap.** The design has noticed the novelty — "No classic virtual world ever shipped an official
hidden-role game — the research found no precedent" (GAME.md:164-165) — and read it as a product
opportunity. The safety reading is that the absence of precedent is partly *because* deception games
break the assumptions moderation rests on.

The incompatibility is specific and it is not about profanity. It is that the **signal** breaks.
"Trust me." "Give me your stuff." "Don't report him." "Meet me after." "I'm on your side." Each is
both normal werewolf play and a classic manipulation script. A behavioural classifier (S5) trained
on general chat will either flood the queue with false positives from deduction lobbies, or be tuned
down until it stops catching real abuse elsewhere. Running one model over both populations degrades
both.

**Fix.**

1. **Deduction lobby chat is a separately-classified channel** with its own model and its own
   thresholds. Do not let it contaminate the general classifier's training or tuning.
2. **A deduction lobby is never the default place a new or young account meets strangers.** Gate
   entry behind account standing, the same threshold as S19.
3. **Moderator tools must show role assignments.** GAME.md:163 says "moderator tools on every lobby"
   without saying what they show. A moderator judging "he lied to me and took my stuff" cannot judge
   it without knowing he was the werewolf. That is a build requirement, not an operational detail.
4. If the game goes 13+, **age-band the lobbies.** A feature whose core mechanic is manipulating
   strangers is precisely what a children's risk assessment under the Ofcom codes or DSA Art. 28
   must flag, and mixed-age deception lobbies are the hardest version of it to defend.
5. **Prototype the moderation, not only the game.** GAME.md:165 already says "prototype it early and
   expect to learn." Extend that to the safety model, since that is the part with no precedent.

## S22 — Pre-launch legal artefacts are missing from the build order

**Section:** PIPELINES.md:108-115.

**Gap.** The eight-step build order contains no terms of service, no community standards, no privacy
policy, no data protection impact assessment, and no risk assessments. Two of those are statutory
preconditions to operating in the UK, not paperwork:

- The **children's access assessment** under the OSA. Existing services faced a 16 April 2025
  deadline. A new service must complete one before or shortly after launch.
- The **illegal harms risk assessment** and the **children's risk assessment**, which drive which
  code measures apply.
- A **DPIA** under the ICO Children's Code, which the ICO's games guidance says must record whether
  children are likely to access the game and what you did about it.

The Coke Music research quotes actual TOS rules (coke §3.5) — no explicit language, no
character-masking of swears, no personal information, no harassment, no impersonating staff, no
solicitation, and an outright ban on arranging real-life meetings. The design inherited the filter
from that source and did not inherit the terms.

**Fix.** Add these as gating items to the build order, before public launch:

1. Children's access assessment.
2. Illegal harms and children's risk assessments.
3. DPIA.
4. Terms of service and community standards, published, with the enforcement ladder and appeal route
   from S18.
5. Privacy policy covering the retention classes from S16 and the age-assurance data flow from S1.

The design cost is near zero. The consequence of skipping them is that a regulator's first question
has no answer.

## S23 — Off-platform contact is outside the filter's scope, and it is the actual vector

**Section:** GAME.md:202.

**Gap.** The inherited filter design blocks profanity, slurs, email addresses, phone numbers, and
long digit strings (habbo §2.4, coke §3.5). That list is from 2005. The documented 2026 grooming
pattern — and what the Roblox attorney-general complaints plead — is contact **initiated in-game and
moved to Discord, Snapchat, or Telegram**, where no filter and no moderator exists. "add me on disc,
my user is X" contains no profanity, no email, no phone number, and no digit string. It passes
cleanly.

**Fix.**

1. Add platform-handle patterns to the filter — usernames prefixed with @, platform names and their
   common abbreviations, discriminator formats, invite-link shapes.
2. Accept that this is bypassable, and treat the **behaviour** as the signal: handle-sharing from an
   older band to a younger band, or in a whisper to a new account, is a high-priority flag even when
   the text is obfuscated past matching.
3. Put "no directing players off-platform" and "no arranging real-life meetings" in the terms of
   service. Coke Music's safety page did the second one explicitly (coke §3.5).

---

# MINOR FINDINGS

## S24 — Safety is held to a lower evidentiary standard than the asset pipeline

**Section:** PIPELINES.md:43, GAME.md:200-209.

**Gap.** PIPELINES.md:43 states the right principle for validation gates: "A gate exists only if a
known-bad recipe actually bounces — test the gates with staged bad inputs." The safety section is
held to no equivalent standard. Every claim in it is a claim about intent.

**Fix.** Apply the same rule. Run a red-team pass on a fixed schedule where staff pose as an
11-year-old, and record **time to first explicit contact** as a tracked metric. That is the exact
test Channel 4 ran and Habbo failed. Make it a release gate. It costs one person one day a month and
it is the only measurement in this audit that tells you whether any of the rest works.

## S25 — Symmetric ignore blinds the victim and can be weaponised

**Section:** GAME.md:207.

**Gap.** "Symmetric ignore: erases the ignored player's avatar and actions from your view."
Symmetric is stated, the consequences are not. If a victim ignores a predator, the victim can no
longer see what that person is saying to others in the room, or about them. And an abuser can ignore
their target to avoid seeing the target warn other players.

**Fix.** Ignore hides content from the ignoring player's client view only. It never suppresses
moderator visibility, never affects logging, and never blocks a report — reporting a player you have
ignored must still work, and the report must still carry the chat you chose not to see.

## S26 — Permanent usernames have no staff-forced-rename escape hatch

**Section:** GAME.md:204.

**Gap.** "Usernames are permanent." The safety benefit is real — accountability, and no name
laundering after a bad reputation — so keep it. But the doc offers no path for a name that passed the
filter and was later found offensive, whether through a regional meaning, a code word, or a
reference the filter did not know. The only tools left are ban or nothing.

**Fix.** Keep permanence as a *player* rule. Add a staff-forced rename as a moderation action,
distinct from a ban, logged, and appealable under S18.

## S27 — Deduction post-match harassment

**Section:** GAME.md:161-165 with GAME.md:187, GAME.md:204.

**Gap.** Deduction games produce real anger at the person who lied to you. This design gives the
loser a permanent username to remember and a room-independent DM channel to use.

**Fix.** Per-match display names inside the lobby, plus a friend-request and DM cooldown between
lobby participants after the match ends. Reports filed from a lobby carry the match transcript and
the role assignments (S21 item 3).

## S28 — No trade age-banding

**Section:** GAME.md:92-100.

**Gap.** If S1 resolves to 13+, then adults trading valuable goods with minors is the item-grooming
vector, and it is currently unrestricted.

**Fix.** If the game goes mixed-age, restrict trade across age bands, or permit it only between
mutual friends of standing. Note this interacts with the marketplace (GAME.md:97-98), which is
anonymous — an anonymous order book is actually the *safer* surface here, since it removes the
relationship. Direct trade is the one to bound.

---

## What to fix first

Ordered by ratio of risk removed to work required.

1. **Decide S1.** Nothing else can be specified until the audience is fixed, and it is the largest
   retrofit in the project.
2. **Move moderation tooling into build step 1** (S4). One line of edit to PIPELINES.md:110.
3. **New-account surface restrictions** (S19 item 3). One control that closes S2, S19, and S21
   item 2.
4. **Adopt staffed opening hours** (S4, Tier 0). Proven by Coke Music, fits the fiction, and it is
   what makes the response-time promise in S16 keepable.
5. **Close trade, gifting, friend requests, and whisper inside deduction lobbies** (S20). Small,
   structural, and it removes a whole abuse class rather than policing it.
6. **Rewrite Pillar 1** so room-owner powers stop being described as a safety control (S3), and
   remove the contradiction with GAME.md:206.

---

## Sources

Legal and platform status verified during this audit:

- [Amended COPPA Rule compliance deadline and mixed-audience definition](https://www.finnegan.com/en/insights/articles/coppas-amended-rule-is-now-in-full-effect-what-operators-need-to-know.html), [FTC amendments detail](https://www.whitecase.com/insight-alert/unpacking-ftcs-coppa-amendments-what-you-need-know)
- [Ofcom Protection of Children Codes in force](https://www.whitecase.com/insight-alert/uk-online-safety-act-protection-children-codes-come-force), [Ofcom age checks guidance](https://www.ofcom.org.uk/online-safety/protecting-children/age-checks-to-protect-children-online)
- [Ofcom Online Safety Act guidance for online games](https://www.ofcom.org.uk/online-safety/the-online-safety-act-and-gaming-know-the-risks-know-the-rules-know-how-to-comply), [analysis of child access duties for gaming](https://www.cooley.com/news/insight/2025/2025-04-09-the-online-safety-act-child-access-duties-for-the-gaming-industry)
- [ICO Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/), [ICO scrutiny of games in 2026](https://www.freeths.co.uk/insights-events/legal-articles/2026/ico-launches-scrutiny-of-children-s-privacy-practices-in-mobile-gaming/)
- [European Commission DSA Article 28 guidelines on protection of minors](https://www.taylorwessing.com/en/insights-and-events/insights/2025/07/rd-european-commission-guidelines-on-protection-of-minors-under-the-digital-services-act)
- [GDPR Article 8](https://gdpr-info.eu/art-8-gdpr/) — per-member-state ages unresolved, see the note in the legal table
- [COPPA 2.0 and KIDS Act status, 2026](https://www.loeb.com/en/insights/publications/2026/06/childrens-online-privacy-in-2026-congress-stalls-again-ftc-signals-priorities)
- [US state age-verification litigation status](https://iapp.org/news/a/netchoice-v-fitch-round-two-and-consequences-for-online-anonymity), [Mississippi HB 1126 in effect](https://courthousenews.com/supreme-court-greenlights-social-media-age-checks-for-mississippi-minors/)
- [State app store accountability acts](https://www.privacyworld.blog/2025/10/app-store-age-verification-laws-your-questions-answered/), [Texas law in force](https://www.mofo.com/resources/insights/251111-texas-targets-app-stores-with-new-accountability-law)
- [Australia social media minimum age and gaming exclusions](https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions)
- [Roblox facial age estimation required for chat worldwide](https://about.roblox.com/newsroom/2026/01/roblox-age-checks-required-to-chat), [age band detail](https://www.biometricupdate.com/202601/roblox-rolls-out-facial-age-estimation-for-chat-access-globally)
- [Roblox state attorney-general actions and MDL status](https://www.texasattorneygeneral.gov/news/releases/attorney-general-ken-paxton-sues-roblox-putting-pixel-pedophiles-and-profits-over-safety-texas), [multistate settlement totals](https://www.consumernotice.org/legal/roblox-lawsuit/)
- [Roblox chat moderation bypassed by leetspeak and code words, May 2026](https://www.helpnetsecurity.com/2026/05/08/roblox-chat-moderation-issues/)
