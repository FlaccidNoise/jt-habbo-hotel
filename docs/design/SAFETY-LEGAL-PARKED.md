# Safety and legal register — PARKED

Status: **not acted on.** This is a hobby prototype with no public deployment planned. Nothing in
this file drives design or build decisions. Full detail and sources live in
[review/safety-audit.md](../review/safety-audit.md).

**Trigger to reopen this file: any public deployment, any invited stranger, or the game
"catching on."**

## The two retrofit warnings (the only items worth remembering early)

1. **Age banding is the largest retrofit in the project** — bigger than Wired. It touches the
   account model, chat router, DM router, trade rules, and room-join rules. If the game ever goes
   public, this lands before growth, not after. (audit S1)
2. **Moderation tooling wants to ship with chat, not after it.** Retrofit cost is low; the audit's
   point was about exposure windows on a public launch. (audit S4)

## Legal register (verified against Aug 2026 law — see safety-audit.md for the source table)

- Self-declared 18+ carries child-safety duties anyway: UK OSA child-access assessment, ICO
  Children's Code, DSA Art. 28 (self-declaration explicitly not age assurance), amended COPPA
  mixed-audience category. Enforced age estimation (vendor, band-label-only storage) is the only
  working 18+ posture. (S1)
- Simulated gambling: PEGI 18 by rule, ad-network restrictions.
- **Social-casino law lock (this one IS active, recorded in GAME.md non-goals):** never sell
  currency under a casino theme — Big Fish precedent held virtual chips "things of value" without
  cash-out. Verify with counsel before ever revisiting.
- Launch-gating artifacts for any public deployment: OSA children's access assessment,
  illegal-harms + children's risk assessments, DPIA, ToS/community standards, privacy policy.
  (S22)
- NCMEC/law-enforcement escalation path, preservation requests, long-hold evidence retention.
  (S16, S17)
- US state app-store age laws — trigger only on a mobile client. (v2 gate)

## Moderation register (parked design, ready to lift when triggered)

- Staffing: paid-only, staffed opening hours as the launch lever, registration caps tied to
  moderation capacity, trusted flaggers (weighted reports, no powers). Cost arithmetic:
  ~£160–275k/yr per always-on seat, derived not benchmarked — get a vendor quote. (S4)
- Behavioral scoring over private surfaces (whisper/DM sampling, grooming-pattern signals that
  need no content reading). (S2, S5)
- Private-room posture: panic button always escapes, staff enter silently, owner-action logging,
  invite-only bounds. (S3)
- Graduated incident-response runtime flags (whisper off, DMs off, minting paused, per-room
  scoping) — the alternative precedent is Habbo's global mute. (S6)
- Filter hardening: NFKC + confusables normalization, shadow substitution, ML scoring layer,
  off-platform handle patterns, multilingual position, broadcast-surface review tier. A basic
  wordlist stays in the prototype for flavor. (S7, S9, S10, S23)
- UGC screening: hate-symbol geometry check on mints and patterns, group-badge gate, design
  recall path (delist + destroy + compensating refund), room-composition reporting with layout
  view, minting-queue throughput model. (S8, S11–S15)
- Enforcement: escalation ladder, two-stage appeals with frozen-not-deleted accounts, ban-evasion
  controls (grant trickle + new-account surface restrictions — the mechanisms exist in GAME.md as
  tunables, set to off/near-zero for the prototype), staff-forced rename. (S18, S19, S26)
- Evidence: rolling capture on reports, two retention classes, per-category response targets.
  (S16)
- Deduction-game moderation: separately classified chat channel, role-visible moderator tools,
  per-match names (the in-lobby trade/gift/friend/whisper seals stay ACTIVE in GAME.md — they are
  anti-scam game design, not moderation). (S20, S21, S27)
- Monthly red-team with time-to-first-explicit-contact as a release gate. (S24)
- Trade age-banding — only if the audience ever widens below 18. (S28)
