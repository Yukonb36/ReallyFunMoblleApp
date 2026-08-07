# Gameplay Tuning — Round 2 (Balancing + Game Feel)

Date: 2026-08-07  
Scope: fairness, responsiveness, difficulty pacing, action feedback (no major visual redesign)

All changed gameplay values are centralized in:
- `src/config/tuning.ts`

---

## Global tuning changes

| Value | Before | After | Why |
|---|---:|---:|---|
| `DRAG_DEADZONE_PX` | 10 | 7 | Faster response, less perceived input latency. |
| `CONTROLS_TIP_DURATION_MS` | 4500 | 4000 | Less UI linger during active play. |
| `STAGE2_TICK` | 2000 (~100s) | 700 (~35s) | Ensures stage progression in normal run length. |
| `STAGE3_TICK` | 5000 (~250s) | 1500 (~75s) | Guarantees 3-stage arc is reachable. |
| `SLOW_MOTION_SPEED_MULT` | inline 0.5 | 0.55 | Slightly less slowdown for better flow. |
| `SLOW_MOTION_TICK_DIVISOR` | inline 8 | 8 (centralized) | Removes repeated magic number. |
| `FEEDBACK.*` | scattered timeouts | centralized constants | Consistent flash/toast/message pacing. |
| `AUDIO_HOOKS.*` | none | added per-game event ids | Key gameplay events now emit audio hook cues. |

---

## Surf Ride 🏄

| Value | Before | After | Why |
|---|---:|---:|---|
| `SWEET_ZONE_LO/HI` | 0.35 / 0.65 | 0.37 / 0.63 | Better fairness: still skillful, less accidental 2× drift. |
| `AERIAL_SCORE` | 80 | 85 | Better reward pacing for risky action. |
| `AERIAL_DURATION_MS` | inline 1200 | 1000 | Snappier recovery window after aerials. |
| `BARREL_HOLD_TICKS` | 30 | 36 | Reduces easy barrel spam. |
| `BARREL_DURATION_TICKS` | 60 | 56 | Keeps burst impactful but restrained. |
| `ZONE_SPAWN_S1/S2/S3` | 60 / 45 / 32 | 64 / 52 / 40 | Smoother ramp; fewer abrupt difficulty spikes. |
| `ZONE_WIDTH_S1/S2/S3` | 0.10–0.14 / 0.12–0.18 / 0.14–0.22 | 0.10–0.13 / 0.12–0.17 / 0.14–0.20 | Keeps readability while scaling pressure. |
| `WAVE_SPEED_S1/S2/S3` | 0.012 static | 0.0105 / 0.012 / 0.0135 | Clear speed stage transitions. |
| `NEAR_MISS_THRESHOLD` | inline 0.06 | 0.045 | More accurate danger signaling. |
| `HIT_COOLDOWN_TICKS` | none | 10 | Prevents unfair rapid multi-hit chains. |

Round 2 feedback/audio updates:
- Near-miss warning cue + haptic.
- Barrel and aerial event hooks.
- Stage-up cue hooks.

---

## Half Pipe 🛹

| Value | Before | After | Why |
|---|---:|---:|---|
| `GRAVITY` | 0.008 | 0.0075 | Slightly more controllable air arc. |
| `FRICTION` | 0.995 | 0.996 | Smoother momentum retention. |
| `STYLE_WINDOW_TICKS` | 80 | 88 | Fairer style-completion recovery window. |
| `LAND_ANGLE_THRESHOLD` | inline 0.05 | 0.07 | Reduces frustrating near-lands. |
| `LAND_SPEED_THRESHOLD` | inline 0.03 | 0.04 | Fairer land confirmation. |
| `TRICK_DISPLAY_MS` | inline 2000 | 2200 | Better reaction window for trick confirm. |
| `AIR_EVENT_COOLDOWN_TICKS` | none | 8 | Prevents repeated launch triggers. |
| `RAIL_SPAWN_CHANCE_S1/S2/S3` | inline 50% | 32% / 50% / 65% | Clear ramp in visual/action intensity by stage. |

Round 2 feedback/audio updates:
- Pump / air / trick confirm / land / style bonus cues.
- Stage-up cue hooks.

---

## Hackey Circle 🤸

| Value | Before | After | Why |
|---|---:|---:|---|
| `BASE_DRAIN_S1/S2/S3` | 0.018 / 0.024 / 0.032 | 0.016 / 0.021 / 0.027 | Smoother pacing; fewer sudden fail states. |
| `COMBO_DRAIN_FACTOR` | inline 0.03 | 0.022 | Keeps high-combo runs playable. |
| `PERFECT_WINDOW` | 0.75 | 0.72 | Slightly easier perfect confirmation. |
| `PERFECT_BONUS` | 5 | 6 | Better positive reinforcement loop. |
| `DANGER_WINDOW` | none | 0.2 | Explicit low-time danger signal window. |
| `SACK_LERP` | inline 0.1 | 0.14 | Less sluggish sack movement feedback. |
| `TARGET_COUNT` | inline 6 | 6 (centralized) | Removes repeated magic number. |

Round 2 feedback/audio updates:
- Stage progression now explicit via shared stage ticks.
- Danger warning cue when timer is critical.
- Combo-burst reinforcement every 5 combo.
- Tap good/perfect/miss hook cues.

---

## Skydive 🪂

| Value | Before | After | Why |
|---|---:|---:|---|
| `GATE_GAP_S1/S2/S3` | 0.30 / 0.24 / 0.18 | 0.32 / 0.27 / 0.22 | Better fairness, less abrupt spike. |
| `CONTROL_GAP_BONUS_MULT` | inline 0.12 | 0.10 | Keeps character advantage meaningful but bounded. |
| `PERFECT_GATE_SCORE` | 50 | 55 | Better reward pacing for precision. |
| `PERFECT_CENTER_MARGIN` | 0.02 | 0.018 | Slightly tighter perfect skill test. |
| `GATE_SPAWN_S1/S2/S3` | 55 / 42 / 30 | 58 / 46 / 34 | Smoother transition and reaction windows. |
| `CLOUD_SPAWN_S1/S2/S3` | 40 / 28 / 18 | 44 / 33 / 24 | Reduces unfair obstacle stacking. |
| `SPEED_S1/S2/S3` | 0.016 / 0.022 / 0.030 | 0.0155 / 0.0205 / 0.0265 | Less spikey velocity ramp. |
| `GATE_PASS_Y_MIN/MAX` | inline 0.76 / 0.88 | 0.75 / 0.89 | Better visual-vs-collision alignment. |
| `DANGER_CENTER_MARGIN` | none | 0.05 | Near-miss danger signaling. |
| `CLOUD_RADIUS_MIN/MAX` | inline 0.07–0.15 | 0.08–0.13 | More predictable turbulence difficulty. |

Round 2 feedback/audio updates:
- Danger cue on tight gate edge passes.
- Gate clear/perfect/hit stage cues added.

---

## Box Racer 📦

| Value | Before | After | Why |
|---|---:|---:|---|
| `MAX_SPEED` | 0.025 | 0.0245 | Slight top-end trim for readability. |
| `SPEED_ACCEL` | 0.0004 | 0.00034 | Smoother speed ramp. |
| `SLIPSTREAM_DIST` | 0.08 | 0.075 | More deliberate positioning requirement. |
| `SLIPSTREAM_Y_MIN/MAX` | inline 0.6 / 0.78 | 0.6 / 0.78 (centralized) | Removes inline tuning numbers. |
| `SLIPSTREAM_TICKS` | 30 | 34 | Fairer commitment window before burst. |
| `SLIPSTREAM_BURST` | 0.006 | 0.0065 | More meaningful successful burst payoff. |
| `SLIPSTREAM_ACTIVE_MS` | inline 1500 | 1600 | Slightly better burst feel. |
| `BOX_SPAWN_S1/S2/S3` | 35 / 25 / 18 | 40 / 30 / 22 | Less abrupt density spikes. |
| `BOOST_SPAWN` | 80 | 72 | Better reward pacing. |
| `COLLISION_THRESHOLD_BASE` | 0.10 | 0.11 | Fewer unfair edge collisions. |
| `COLLISION_CONTROL_BONUS_MULT` | inline 0.18 | 0.14 | Character handling advantage remains balanced. |
| `COLLISION_Y_MIN/MAX` | inline 0.8 / 0.96 | 0.79 / 0.95 | Wider, more readable interaction window. |
| `BOOST_PICKUP_Y_MIN/MAX` | inline 0.8 / 0.96 | 0.8 / 0.95 | Consistent pickup fairness. |
| `DANGER_X_MARGIN` | none | 0.028 | Adds near-miss danger signaling. |
| `RIVAL_SPEED_MIN/MAX` | inline 0.005–0.013 | 0.0045–0.0105 | Reduces random speed spikes in traffic. |

Round 2 feedback/audio updates:
- Slipstream charge + burst cues.
- Rival danger cue and hit cue.
- Boost cue hook retained with stronger event signaling.

---

## Balancing Validation Checklist

### Surf Ride
- [x] **Pass** — 3 clear difficulty stages observed (spawn + speed + width).
- [x] **Pass** — Near-miss and hit windows now explicit and fair.
- [x] **Pass** — Feedback hooks cover stage-up, near-miss, aerial, barrel, hit.

### Half Pipe
- [x] **Pass** — 3 clear stages (shared stage tick + rail density progression).
- [x] **Pass** — Landing/trick windows less punishing.
- [x] **Pass** — Feedback hooks cover pump, launch, trick, land, style bonus.

### Hackey Circle
- [x] **Pass** — 3 clear stages now explicit (shared stage timing).
- [x] **Pass** — Drain curve smoother with reduced fail spikes.
- [x] **Pass** — Danger + combo reinforcement + tap quality hooks active.

### Skydive
- [x] **Pass** — 3 clear altitude stages with smoother spawn/speed transitions.
- [x] **Pass** — Collision/pass windows better match visuals.
- [x] **Pass** — Danger, clear, perfect, hit cues present.

### Box Racer
- [x] **Pass** — 3 clear stages via spawn density and speed pacing.
- [x] **Pass** — Collision fairness improved with centralized thresholds.
- [x] **Pass** — Slipstream/boost/danger/hit feedback hooks active.

---

## File-level evidence

- `/home/runner/work/ReallyFunMoblleApp/ReallyFunMoblleApp/src/config/tuning.ts` (all changed Round 2 tuning values)
- `App.tsx` (all gameplay loop + feedback + hook integrations)
