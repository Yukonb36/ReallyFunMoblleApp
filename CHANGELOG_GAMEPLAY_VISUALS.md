# Changelog — Gameplay & Visuals
> Round 3 — Content Variety + Retention systems  
> Date: 2026-08-07

---

## Global Round 3 Systems

- **Persistent meta-save added** — personal bests, tokens, character ownership, and new per-game mastery progress now save locally.
- **Shared daily challenge rotation** — every game now gets a seeded daily modifier + objective + token reward.
- **Per-game mastery track** — each sport now earns mastery points, cosmetic titles, and tier rewards for repeat play.
- **Run-end upgrade** — game-over now shows best-score delta, run tokens, mastery gain, daily status, and stronger replay CTA.
- **Reward pacing pass** — minimum run payout increased to 8 tokens, first mastery tier unlocks quickly, and daily clears give early momentum without flattening late-game chase.

---

## Surf Ride 🏄

- **Variation system:** seeded daily surf modifiers now rotate between **Cross Current**, **Squall Lines**, and **Air Festival**.
- **Progression:** Surf mastery titles now unlock from repeat runs, with tier rewards and stronger daily payouts at higher mastery.
- **Run-end loop:** summary now calls out best delta, token gain, mastery gain, and daily objective status alongside barrel count.
- **Repeat engagement:** daily surf objectives rotate between aerial, barrel, and score targets.
- **Onboarding:** surf controls tip now explains the active daily modifier/objective when a daily run starts.

## Half Pipe 🛹

- **Variation system:** seeded daily skate modifiers now rotate between **Low Gravity**, **Rail Jam**, and **Trick Frenzy**.
- **Progression:** skate mastery titles and sponsor rewards now give a visible reason to keep replaying beyond one best score.
- **Run-end loop:** run-end summary now pairs style stats with mastery gain and daily clear feedback.
- **Repeat engagement:** daily objectives rotate between style-bonus clears, clean landing counts, and score goals.
- **Onboarding:** daily modifier + objective now appear in the skate tutorial overlay.

## Hackey Circle 🤸

- **Variation system:** seeded daily hackey modifiers now rotate between **Hot Potato**, **Echo Target**, and **Focus Ring**.
- **Progression:** hackey mastery progression now awards cosmetic title tiers plus token rewards for early repeat sessions.
- **Run-end loop:** end screen now shows daily progress, mastery gain, and replay prompts alongside max combo.
- **Repeat engagement:** daily goals now rotate between perfect taps, combo peaks, and score pushes.
- **Onboarding:** the hackey tip overlay now explains the daily ruleset when applicable.

## Skydive 🪂

- **Variation system:** seeded daily skydive modifiers now rotate between **Jetstream**, **Ring Rush**, and **Cloudburst**.
- **Progression:** skydive mastery titles now reward repeated gate-chasing and daily clears.
- **Run-end loop:** gate totals, best delta, mastery gain, and daily result now appear together in the game-over loop.
- **Repeat engagement:** daily objectives rotate between gate clears, perfect threads, and score thresholds.
- **Onboarding:** skydive tutorial messaging now includes the active daily challenge summary.

## Box Racer 📦

- **Variation system:** seeded daily box-race modifiers now rotate between **Sidewind**, **Boost Parade**, and **Turbo Grid**.
- **Progression:** box-race mastery now delivers title tiers, token rewards, and better daily payouts at sponsor tier.
- **Run-end loop:** summary now highlights slipstreams plus daily completion state and next mastery unlock.
- **Repeat engagement:** daily goals now rotate between slipstream chains, boost pickups, and score targets.
- **Onboarding:** the box-race tutorial overlay now explains the current daily twist and objective.

---

## Files Changed

| File | Change |
|------|--------|
| `App.tsx` | Added persistent mastery save, daily challenge rotation, progression rewards, replay-focused run-end updates, and onboarding copy updates |
| `CHANGELOG_GAMEPLAY_VISUALS.md` | Updated for Round 3 replayability/retention work |
| `FINAL_SCORECARD.md` | Re-scored replayability/progression results and added next patch plan |
