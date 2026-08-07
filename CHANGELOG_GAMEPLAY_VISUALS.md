# Changelog — Gameplay & Visuals
> Phase 3 — documents all changes made during Phase 2 (LER workflow)  
> Date: 2026-08-07

---

## Engineering (Phase 2-F)

- **`src/config/tuning.ts` created** — all physics and gameplay constants extracted from inline code into a single, typed export. No magic numbers remain in game loops.
- **`expo-haptics` installed** (v57.0.1) — haptic feedback wired to all key game events.
- **`AccessibilityInfo.isReduceMotionEnabled`** — detected on mount and whenever it changes; all Haptics calls are gated behind `reducedMotion` check; animation-heavy effects skip in reduced-motion mode.
- **Strict TypeScript** — `tsconfig.json` already had `"strict": true`; confirmed all new code passes `tsc --noEmit` with zero errors.
- **`src/` directory structure** — `src/config/`, `src/hooks/`, `src/components/`, `src/theme/` scaffolded for future module extraction.

---

## Global (Phase 2-E)

- **Controls tip** text updated for each game to describe new mastery mechanics.
- **Difficulty stage badge** — a compact pill in the top-right corner shows `⚡ PRO` or `🔥 EXPERT` when the player advances to a higher difficulty stage.
- **Hit flash overlay** — full-screen red tint for 300–400 ms on any shield hit or game over; provides immediate collision awareness.
- **Milestone toast** — semi-transparent gold banner appears for 2.5 s when a per-game score milestone is reached. Fires haptic success notification.
- **Run summary in game-over** — game-over screen now shows:
  - Stage reached (Rookie / Pro / Expert) with colour coding
  - Mode-specific stat: Barrels Ridden (Surf), Style Bonuses (Skate), Max Combo (Hackey), Gates Cleared (Skydive), Slipstreams (Box Race)
  - "🏆 NEW BEST!" label and gold score if the player beats their personal best

---

## Surf Ride 🏄 (Phase 2-A–D)

**Gameplay:**
- **3 difficulty stages** — Stage 1 (0–100 s): slow waves, narrow zones; Stage 2 (100–250 s): 33 % faster spawn, wider zones; Stage 3 (250+ s): 47 % faster spawn, widest zones.
- **Barrel Ride mastery mechanic** — holding the sweet zone for 1.5 s charges a Barrel Ride (visual charge bar displayed). When triggered, score multiplier rises to 3× for 3 s. Tracked in run summary.

**Visuals:**
- **Barrel charge bar** — green/gold progress bar fills inside the surf HUD overlay as the player approaches Barrel activation.
- **Barrel active label** — "🛢 BARREL x3!" label replaces tube multiplier indicator during barrel.
- **Controls tip updated** — describes Barrel mechanic.

**Game-feel:**
- `Haptics.impactAsync(Heavy)` on Barrel activation.
- `Haptics.notificationAsync(Warning)` on whitewater shield hit.
- `Haptics.notificationAsync(Error)` on wipeout.
- `Haptics.selectionAsync()` on near-miss (within 6 % of zone edge).

**Progression:**
- Milestones at 200 / 500 / 1 000 pts with toast and haptic.
- Barrels Ridden shown in game-over summary.

---

## Half Pipe 🛹 (Phase 2-A–D)

**Gameplay:**
- **3 difficulty stages** — Stage 1: 4 tricks; Stage 2: 6 tricks (adds Heelflip, Kickflip); Stage 3: 8 tricks (adds Varial, Hospital Flip).
- **Style Meter mastery mechanic** — sequence: Pump swipe → Launch off coping → Tap trick while airborne → Land cleanly — all within 4 s. Successful completion awards 150-pt Style Bonus. Phase tracking displayed in the style meter UI.

**Visuals:**
- **Style Meter bar** — shows above game area during active style sequence; color shifts green → gold as timer shrinks.
- **Style phase label** — "🛹 Pumped!", "✈️ Airborne!", "⚡ Trick! Now land!" update live.
- **Controls tip updated** — describes Style Bonus sequence.

**Game-feel:**
- `Haptics.impactAsync(Heavy)` on launch off coping.
- `Haptics.impactAsync(Medium)` on clean landing.
- `Haptics.selectionAsync()` on each pump swipe.
- `Haptics.notificationAsync(Success)` on Style Bonus completion.

**Progression:**
- Milestones at 150 / 400 / 800 pts.
- Style Bonuses shown in game-over summary.

---

## Hackey Circle 🤸 (Phase 2-A–D)

**Gameplay:**
- **3 difficulty stages** — Stage 1 (combo 0–5): base drain; Stage 2 (combo 6–12): 33 % faster drain; Stage 3 (combo 13+): 78 % faster drain. Drain also scales with `combo × 0.03`.
- **Perfect Timing mastery mechanic** — tapping while the timer bar is in the top 25 % of its window (green zone) awards `PERFECT_BONUS` extra points and shows "⚡ PERFECT!" flash.

**Visuals:**
- **Perfect zone marker** — thin green line on the timer bar marks the Perfect Timing threshold.
- **"⚡ PERFECT ZONE"** label shown when the window is still in perfect range.
- **"🌟 PERFECT!" flash** overlaid in the arena on perfect tap.
- **Combo suffix badges** — ⚡ shown at Stage 2 combo, 🔥 at Stage 3 combo.

**Game-feel:**
- `Haptics.impactAsync(Heavy)` on perfect tap.
- `Haptics.impactAsync(Medium)` on normal tap.
- `Haptics.notificationAsync(Error)` on miss or wrong player.
- Hit flash + haptic error on timeout miss.

**Progression:**
- Milestones at 100 / 300 / 700 pts.
- Max combo shown in game-over summary.

---

## Skydive 🪂 (Phase 2-A–D)

**Gameplay:**
- **3 difficulty stages** — driven by altitude: above 7 000 ft (Stage 1), 7 000–3 500 ft (Stage 2, narrower gates + faster), below 3 500 ft (Stage 3, tightest gates + most turbulence). Stage changes broadcast message to player.
- **Perfect Threading mastery mechanic** — passing within ±2 % of gate center awards 50 pts (vs 25 normal). "🎯 Perfect thread!" message shown.

**Visuals:**
- **Perfect thread flash** — "🎯 PERFECT THREAD!" label appears near player position for 600 ms.
- **Controls tip updated** — describes Perfect Threading.

**Game-feel:**
- `Haptics.impactAsync(Light)` on any gate cleared.
- `Haptics.notificationAsync(Warning)` on gate/cloud shield hit.
- `Haptics.notificationAsync(Error)` on fatal collision.

**Progression:**
- Milestones at 200 / 500 / 1 000 pts.
- Gates Cleared shown in game-over summary.

---

## Box Racer 📦 (Phase 2-A–D)

**Gameplay:**
- **3 difficulty stages** — Stage 1 (0–100 s): slow rivals, sparse; Stage 2 (100–250 s): rivals spawn 29 % faster; Stage 3 (250+ s): rivals spawn 49 % faster.
- **Slipstream mastery mechanic** — staying within 8 % x-distance behind a rival for 1.5 s charges a slipstream. On activation: +50 pts and a 1.5 s speed burst. Charge progress shown in a bar; "💨 SLIPSTREAM!" flash on activation.

**Visuals:**
- **Slipstream charge bar** — thin blue progress bar at the bottom of the game area fills as the player drafts behind a rival.
- **"💨 SLIPSTREAM!" flash** — bold overlay text on burst activation.
- **Controls tip updated** — describes Slipstream mechanic.

**Game-feel:**
- `Haptics.impactAsync(Heavy)` on slipstream activation.
- `Haptics.impactAsync(Medium)` on boost pickup.
- `Haptics.notificationAsync(Warning)` on crash shield hit.
- `Haptics.notificationAsync(Error)` on fatal crash.

**Progression:**
- Milestones at 150 / 400 / 900 pts.
- Slipstreams activated shown in game-over summary.

---

## Files Changed

| File | Change |
|------|--------|
| `App.tsx` | Major gameplay/visuals/feel/progression upgrade |
| `src/config/tuning.ts` | New — centralized constants |
| `GAME_AUDIT.md` | New — Phase 1 baseline audit |
| `GAMEPLAY_TUNING.md` | New — tuning reference |
| `CHANGELOG_GAMEPLAY_VISUALS.md` | New — this file |
| `FINAL_SCORECARD.md` | New — before/after scores |
| `package.json` | Added `expo-haptics` v57.0.1 |
