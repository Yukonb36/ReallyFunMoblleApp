# Game Audit — ReallyFunMoblleApp
> Phase 1: LEARN — baseline scores and upgrade plan  
> Auditor: Copilot Task Agent | Date: 2026-08-07

---

## 1. Games Identified

| Key | Name | Emoji | Token Multiplier |
|-----|------|-------|-----------------|
| `surf` | Surf Ride | 🏄 | 2× |
| `skate` | Half Pipe | 🛹 | 3× |
| `hackey` | Hackey Circle | 🤸 | 4× |
| `skydive` | Skydive | 🪂 | 5× |
| `boxrace` | Box Racer | 📦 | 3× |

Supporting screens: **Landing** (home/hero), **Select** (game picker + character shop), **Game** (plays one of the 5 modes), **Game-Over overlay** (inline on game screen).

---

## 2. Audit Methodology

Each game was evaluated from source code (`App.tsx`, ~3 000 lines, single-file architecture) across five axes. Scores are 0–10; ≥ 8 is the Phase 3 pass threshold.

---

## 3. Per-Game Baseline Scores

### 3.1 Surf Ride 🏄

| Axis | Score | Rationale |
|------|-------|-----------|
| Visual Polish | 5 | Wave, sun, sky, cliffs, foam/crease, sweet-zone glow, surfboard, character — good layering but all plain `View` rectangles/arcs, no animation of wave height beyond a static 4 px sine offset |
| Gameplay Depth | 4 | Single obstacle type (whitewater zones), one aerial trick (static 80 pt reward), one scoring multiplier zone. No escalating difficulty — spawn rate uses only two fixed intervals (60 / 120 ticks) |
| Feedback | 4 | Shield message + score tick; aerial flip animation; no haptics, no audio hooks, no visible hit flash, no near-miss visual |
| Replayability | 3 | Best score stored per mode; no milestones, no unlocks tied to surf performance, no run summary breakdown |
| Mobile Usability | 6 | PanResponder with deadzone + sensitivity control; controls tip auto-hides; sweet-zone center is somewhat hard to see on small phones |
| **Mean** | **4.4** | |

### 3.2 Half Pipe 🛹

| Axis | Score | Rationale |
|------|-------|-----------|
| Visual Polish | 5 | Half-pipe wall/bottom/deck/coping/transitions rendered; skater rotates with angle; rails spawn — but no crowd animation, static city silhouette, no speed trails |
| Gameplay Depth | 4 | Angular physics model is solid; only 4 named tricks (Grab, 180°, 360°, McTwist) with identical reward (+100, no differentiation); rails spawn randomly but have no interactive consequence; no ramp hazards or scoring combos |
| Feedback | 4 | Trick bubble overlay appears on launch; landing message; no haptic, no speed blur, no visual feedback on pump impact |
| Replayability | 3 | Best score only; same physics every run; no unlockable tricks or escalating stunt challenges |
| Mobile Usability | 6 | Swipe any direction works; sensitivity slider exposed; tip overlay shown on start — but hint text at bottom is tiny |
| **Mean** | **4.4** | |

### 3.3 Hackey Circle 🤸

| Axis | Score | Rationale |
|------|-------|-----------|
| Visual Polish | 5 | Arena glow, orbit ring, center spot, player pulse ring, colored bar timer — reasonable depth but all static positions, sack lerps toward target but trajectory feels mechanical |
| Gameplay Depth | 5 | Combo-accelerating drain rate is a genuine mastery curve; 3-miss limit creates tension; but only one interaction type (tap glowing player), no variety in sack trajectory, no "wild player" mechanic |
| Feedback | 5 | Timer bar color shifts (green → yellow → red); combo counter; miss skull emoji; no haptic; no sound on hit/miss |
| Replayability | 4 | Combo counter is motivating but resets completely; no streak leaderboard or challenge goals per session |
| Mobile Usability | 5 | Pressable tap targets are 12 % of screen width each — may be tight on small phones; no accessibility labels |
| **Mean** | **4.8** | |

### 3.4 Skydive 🪂

| Axis | Score | Rationale |
|------|-------|-----------|
| Visual Polish | 6 | Best-looking game: sky gradient, sun, cloud bands, wind streaks, turbulence puffs, altitude HUD — cohesive feel; gates have a gap/core visual |
| Gameplay Depth | 5 | Two obstacle types (gates + cloud turbulence); gate bonus (+25) motivates threading; speed does not escalate over altitude; gate gap is fixed (GATE_GAP constant); no bonus altitude runs or special gate types |
| Feedback | 4 | Shield message on hit; gates cleared counter; no near-miss reward; no visual trail on player; no haptic |
| Replayability | 4 | Altitude countdown creates natural run arc but resets identically each time; no milestone altitudes, no cosmetic unlocks |
| Mobile Usability | 6 | Drag controls smooth; sensitivity adjustable; player is fixed at 73 % height — feels good; hint text overlaps gameplay occasionally |
| **Mean** | **5.0** | |

### 3.5 Box Racer 📦

| Axis | Score | Rationale |
|------|-------|-----------|
| Visual Polish | 5 | Track, edges, rumble strips, check banner, lane stripes, scanline — arcade feel; rival boxes use emoji only; no speed blur, no drift particles |
| Gameplay Depth | 4 | Speed ramps up gradually; rival density increases; boost pads exist but are sparse (every 80 ticks); no wall-bounce mechanic, no power-ups beyond boosts |
| Feedback | 4 | Shield crash message; boost "+30" message; speed readout in HUD; no hit flash, no haptic, no particle explosion on crash |
| Replayability | 3 | Speed stat in HUD gives satisfaction; no lap structure, no finish line events, no race-position rank |
| Mobile Usability | 6 | Drag controls; sensitivity; player box at fixed 87 % height with glow — clearly visible |
| **Mean** | **4.4** | |

---

## 4. Cross-Game Shared Issues

1. **No audio** — zero sound hooks in current codebase.
2. **No haptics** — `expo-haptics` not installed.
3. **Magic numbers everywhere** — physics constants inline in game loops.
4. **Single difficulty stage** — all 5 games run one fixed difficulty from tick 0 to game over.
5. **Game-over screen is minimal** — score, best, one message; no run breakdown, no replay motivator.
6. **No reduced-motion path** — `Animated` values used but no `AccessibilityInfo.isReduceMotionEnabled` check.
7. **No onboarding beyond 4.5 s tip overlay** — returning players see the same tip every single run.
8. **No milestones / unlocks tied to game performance** — token economy exists but nothing unlocks from playing well in any specific game.
9. **TypeScript: strict mode off** — `tsconfig.json` should enforce `strict: true`.
10. **All game state in one 3 000-line App.tsx** — needs extraction into focused modules.

---

## 5. Upgrade Plan

### 5.1 Shared Modules (Engineering — Phase 2-F)

| Module | Purpose |
|--------|---------|
| `src/config/tuning.ts` | Central export of all physics/gameplay constants (replaces magic numbers) |
| `src/hooks/useGameLoop.ts` | Shared `setInterval` pattern with slow-motion and isPlaying guards |
| `src/hooks/useHaptic.ts` | Wrapper over `expo-haptics` for impact/notification feedback |
| `src/components/GameOverScreen.tsx` | Full run-summary component with breakdown |
| `src/components/HUD.tsx` | Consistent HUD shell used by all games |
| `src/components/ControlsTip.tsx` | Per-game controls tip with reduced-motion awareness |
| `src/theme/colors.ts` | Design-token colour palette |
| `src/theme/typography.ts` | Font size / weight tokens |

### 5.2 Per-Game Upgrade Plan

#### Surf Ride
**Visuals (A):** Animate wave height continuously (Animated.loop on Y translation); add spray particles at surfer feet during turns; add tube-barrel tint when in sweet zone.  
**Gameplay (B):** 3 difficulty stages: stage 1 (0–100 pts) = slow zones; stage 2 (100–300 pts) = wider zones + faster; stage 3 (300+ pts) = double-zones + aerial windows. Add "barrel" mechanic: hold inside sweet zone for 1.5 s to trigger Barrel Ride bonus round (+3× for 3 s).  
**Game-feel (C):** Haptic on whitewater hit; haptic on aerial land; flash player color on hit; visual speed-lines during aerial.  
**Progression (D):** Milestone at 200 / 500 / 1000 pts unlocking surf board skin options (cosmetic color tokens).  

#### Half Pipe
**Visuals (A):** Speed blur lines scaled by `|skateSpeed|`; crowd wave animation (opacity pulse); rail grinding spark particle when on rail.  
**Gameplay (B):** 3 difficulty stages: stage 1 — 4 tricks (existing); stage 2 (150+ pts) — trick window shrinks, +2 new trick names (Heelflip, Kickflip); stage 3 (400+ pts) — add rail-grind mechanic (swipe toward rail while airborne for bonus). Unique mastery mechanic: **Style Meter** — string pump → aerial → trick tap → clean land within time budget = Style Bonus (+150 pts).  
**Game-feel (C):** Haptic on launch off coping; haptic on land; pump vibration (light selection feedback); trick name flash animation.  
**Progression (D):** Unlock trick names as discovered; best trick log in game-over summary.  

#### Hackey Circle
**Visuals (A):** Player pulse ring animates with Animated.loop; sack path drawn as a fading arc trail; arena lights flicker at high combo.  
**Gameplay (B):** Stage 1 (combo 0–5): 6 players, normal drain; stage 2 (combo 6–12): introduce a "fake" player that flashes briefly — tapping it is a miss; stage 3 (combo 13+): add "wild bounce" where the sack skips one player arbitrarily. Mastery mechanic: **Perfect Timing** — tap within first 25 % of window for "Perfect" (+5 combo bonus pts).  
**Game-feel (C):** Haptic on successful tap (medium impact); haptic on miss (heavy impact/notification); timer bar shakes when below 20 %.  
**Progression (D):** Combo milestones (10, 25, 50) unlock player avatar tints; end-of-run shows max combo achieved.  

#### Skydive
**Visuals (A):** Parallax cloud layers scrolling at different speeds; player has canopy/chute shape above character; speed trails behind player when steering hard; gate flash green when cleared.  
**Gameplay (B):** Stage 1 (0–3000 ft dropped): fixed gate gap, slow; stage 2 (3000–6000 ft): narrowing gap, faster, more clouds; stage 3 (6000–10000 ft): tight gates, turbulence bursts, "wind gust" that pushes player sideways. Mastery mechanic: **Perfect Threading** — pass dead-center through gate for 2× gate bonus.  
**Game-feel (C):** Haptic on gate clear (light); haptic on cloud hit (heavy); wind gust visual (screen tilt / player shake).  
**Progression (D):** Altitude milestones (2000 / 5000 / 8000 / 10000 ft) shown in end-of-run summary; chute color unlocks.  

#### Box Racer
**Visuals (A):** Drift smoke particles on sharp turns; boost pad glow animation; rival box has shadow below it; speed blur lines on fast stretches.  
**Gameplay (B):** Stage 1 (0–100 pts): sparse rivals, slow; stage 2 (100–300 pts): rival density up, wall edges added; stage 3 (300+ pts): rivals actively steer toward player ("aggressive AI"). Mastery mechanic: **Slipstream** — sit behind a rival for 1.5 s to gain speed burst without collision.  
**Game-feel (C):** Haptic on crash (heavy); haptic on boost pickup (medium); rival box explodes (emoji burst) on shield hit.  
**Progression (D):** Speed milestones (100 / 200 / 300 km/h); fastest lap tokens; box body color unlocks.  

### 5.3 Global Quality (Phase 2-E)

- Replace controls tip with a one-time onboarding flow (persisted via `expo-file-system`) — repeat players skip it.
- Audit all touch targets: minimum 44 × 44 pt per WCAG / Apple HIG; enlarge as needed.
- Add `AccessibilityInfo.isReduceMotionEnabled` guard: skip looping animations in reduced-motion mode.
- Font sizes: minimum 13 sp for all secondary text; current `controlsTipDim` is 11 sp — fix.
- Safe area insets already handled via `SafeAreaView` — verify game area does not overlap notch.

---

## 6. Gate Checklist (before Phase 2 coding begins)

- [x] All 5 games identified and individually audited
- [x] Baseline scores recorded (all < 6/10 across the board)
- [x] Concrete per-game upgrade plan documented
- [x] Shared module plan documented
- [x] Cross-game issues catalogued
- [x] Phase 3 pass criteria understood (≥ 8/10 all axes per game)

**Gate passed — proceed to Phase 2.**
