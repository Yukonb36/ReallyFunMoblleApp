# Gameplay Tuning Reference
> Phase 3 — auto-generated from `src/config/tuning.ts`  
> Last updated: 2026-08-07

All values live in **`src/config/tuning.ts`**. Change them there; do not hard-code in game loops.

---

## Global

| Constant | Value | Effect |
|----------|-------|--------|
| `TICK_MS` | 50 ms | Game-loop interval (~20 fps) |
| `SLOW_MOTION_BASE_DURATION` | 18 s | Base slow-motion duration from ad reward |
| `DRAG_DEADZONE_PX` | 10 px | Minimum drag before input registers |
| `CONTROLS_TIP_DURATION_MS` | 4 500 ms | How long the first-run controls tip is shown |
| `FLICK_TRICK_VELOCITY` | -1.15 | Upward flick speed threshold to trigger surf aerial |
| `STAGE2_TICK` | 2 000 ticks (~100 s) | Tick at which difficulty transitions to Stage 2 |
| `STAGE3_TICK` | 5 000 ticks (~250 s) | Tick at which difficulty transitions to Stage 3 |

---

## Surf Ride 🏄

| Constant | Value | Effect |
|----------|-------|--------|
| `SURF.SWEET_ZONE_LO` | 0.35 | Left edge of 2× multiplier zone (0–1) |
| `SURF.SWEET_ZONE_HI` | 0.65 | Right edge of 2× multiplier zone |
| `SURF.TUBE_MULTIPLIER_BONUS` | 2 | Score per tick in sweet zone |
| `SURF.AERIAL_SCORE` | 80 pts | One-time bonus for flick aerial |
| `SURF.BARREL_HOLD_TICKS` | 30 ticks (~1.5 s) | Time to hold sweet zone to trigger Barrel |
| `SURF.BARREL_MULTIPLIER` | 3 | Score per tick during Barrel Ride |
| `SURF.BARREL_DURATION_TICKS` | 60 ticks (3 s) | Duration of Barrel Ride bonus |
| `SURF.ZONE_SPAWN_S1` | 60 ticks | Whitewater spawn interval — Stage 1 |
| `SURF.ZONE_SPAWN_S2` | 45 ticks | Whitewater spawn interval — Stage 2 |
| `SURF.ZONE_SPAWN_S3` | 32 ticks | Whitewater spawn interval — Stage 3 |
| `SURF.ZONE_WIDTH_S1` | 0.10–0.14 | Whitewater zone width range — Stage 1 |
| `SURF.ZONE_WIDTH_S2` | 0.12–0.18 | Whitewater zone width range — Stage 2 |
| `SURF.ZONE_WIDTH_S3` | 0.14–0.22 | Whitewater zone width range — Stage 3 |
| `SURF.WAVE_SPEED_NORMAL` | 0.012 | Wave scroll speed (fraction/tick) |
| `SURF.WAVE_SPEED_SLOW` | 0.006 | Wave speed under slow motion |

---

## Half Pipe 🛹

| Constant | Value | Effect |
|----------|-------|--------|
| `SKATE.GRAVITY` | 0.008 | Angular gravity (rad/tick²) |
| `SKATE.FRICTION` | 0.995 | Per-tick speed multiplier (deceleration) |
| `SKATE.PIPE_RADIUS` | π × 0.45 | Angle at which skater launches airborne |
| `SKATE.TRICK_SCORE` | 100 pts | Points for tapping trick while airborne |
| `SKATE.LAND_BONUS_PER_SHIELD` | 50 pts/shield | Landing bonus multiplied by character shields |
| `SKATE.STYLE_BONUS` | 150 pts | Bonus for completing full Style Meter sequence |
| `SKATE.STYLE_WINDOW_TICKS` | 80 ticks (~4 s) | Time budget to complete pump→air→trick→land |
| `SKATE.TRICK_NAMES_S1` | 4 names | Trick pool at Stage 1 |
| `SKATE.TRICK_NAMES_S2` | 6 names | Trick pool at Stage 2 |
| `SKATE.TRICK_NAMES_S3` | 8 names | Trick pool at Stage 3 |

---

## Hackey Circle 🤸

| Constant | Value | Effect |
|----------|-------|--------|
| `HACKEY.BASE_DRAIN_S1` | 0.018/tick | Timer drain — Stage 1 |
| `HACKEY.BASE_DRAIN_S2` | 0.024/tick | Timer drain — Stage 2 (combo ≥ 6) |
| `HACKEY.BASE_DRAIN_S3` | 0.032/tick | Timer drain — Stage 3 (combo ≥ 13) |
| `HACKEY.FAKE_PLAYER_COMBO_THRESHOLD` | 6 | Combo at which a fake-flash player appears |
| `HACKEY.WILD_COMBO_THRESHOLD` | 13 | Combo at which sack skips targets unpredictably |
| `HACKEY.PERFECT_WINDOW` | 0.75 | Window fraction above which tap is "Perfect" |
| `HACKEY.PERFECT_BONUS` | 5 pts | Extra pts for Perfect tap |
| `HACKEY.MISS_LIMIT` | 3 | Misses to game over |

---

## Skydive 🪂

| Constant | Value | Effect |
|----------|-------|--------|
| `SKYDIVE.GATE_GAP_S1` | 0.30 | Gate opening width — Stage 1 |
| `SKYDIVE.GATE_GAP_S2` | 0.24 | Gate opening width — Stage 2 |
| `SKYDIVE.GATE_GAP_S3` | 0.18 | Gate opening width — Stage 3 |
| `SKYDIVE.GATE_SCORE` | 25 pts | Points for threading a gate |
| `SKYDIVE.PERFECT_GATE_SCORE` | 50 pts | Points for threading dead-center |
| `SKYDIVE.PERFECT_CENTER_MARGIN` | 0.02 | Tolerance for Perfect Thread (fraction of width) |
| `SKYDIVE.GATE_SPAWN_S1/S2/S3` | 55 / 42 / 30 | Gate spawn intervals per stage |
| `SKYDIVE.CLOUD_SPAWN_S1/S2/S3` | 40 / 28 / 18 | Cloud spawn intervals per stage |
| `SKYDIVE.SPEED_S1/S2/S3` | 0.016 / 0.022 / 0.030 | Scroll speed per stage |
| `SKYDIVE.ALT_STAGE2` | 7 000 ft | Altitude below which Stage 2 begins |
| `SKYDIVE.ALT_STAGE3` | 3 500 ft | Altitude below which Stage 3 begins |

---

## Box Racer 📦

| Constant | Value | Effect |
|----------|-------|--------|
| `BOXRACE.MAX_SPEED` | 0.025 | Maximum racer scroll speed |
| `BOXRACE.SPEED_ACCEL` | 0.0004/tick | Speed increase per tick |
| `BOXRACE.BOOST_SCORE` | 30 pts | Points for boost pad pickup |
| `BOXRACE.SLIPSTREAM_DIST` | 0.08 | Max x-distance to rival to charge slipstream |
| `BOXRACE.SLIPSTREAM_Y_RANGE` | 0.12 | Y-range window to qualify for slipstream |
| `BOXRACE.SLIPSTREAM_TICKS` | 30 ticks (~1.5 s) | Hold time to activate slipstream burst |
| `BOXRACE.SLIPSTREAM_BURST` | 0.006 | Speed bonus from slipstream burst |
| `BOXRACE.BOX_SPAWN_S1/S2/S3` | 35 / 25 / 18 | Rival spawn interval per stage |
| `BOXRACE.BOOST_SPAWN` | 80 ticks | Boost pad spawn interval |
| `BOXRACE.COLLISION_THRESHOLD_BASE` | 0.10 | x-distance for rival box collision |

---

## Milestone Thresholds

| Game | Milestone 1 | Milestone 2 | Milestone 3 |
|------|------------|------------|------------|
| Surf Ride | 200 pts | 500 pts | 1 000 pts |
| Half Pipe | 150 pts | 400 pts | 800 pts |
| Hackey Circle | 100 pts | 300 pts | 700 pts |
| Skydive | 200 pts | 500 pts | 1 000 pts |
| Box Racer | 150 pts | 400 pts | 900 pts |

All milestones fire a haptic success notification + a 2.5 s toast overlay.

---

## Drag Sensitivity Defaults

| Game | Default Sensitivity | Constant |
|------|--------------------|-|
| Surf | 0.55 | `SURF_DRAG_SENSITIVITY` |
| Skydive | 0.22 | `SKY_DRAG_SENSITIVITY` |
| Box Race | 0.24 | `BOX_DRAG_SENSITIVITY` |
| Half Pipe (pump) | 0.18 | `SKATE_PUMP_SENSITIVITY` |

Player can adjust sensitivity ×0.50 – ×2.00 from the in-game HUD.
