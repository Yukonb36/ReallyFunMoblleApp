// ─── Central Tuning Config ────────────────────────────────────────────────────
// All gameplay constants live here. Change values here, not inline in game loops.

// ── Global ────────────────────────────────────────────────────────────────────
export const TICK_MS = 50; // ~20 fps game tick
export const SLOW_MOTION_BASE_DURATION = 18; // seconds
export const DRAG_DEADZONE_PX = 10;
export const CONTROLS_TIP_DURATION_MS = 4500;
export const FLICK_TRICK_VELOCITY = -1.15;

// ── Sensitivity defaults ───────────────────────────────────────────────────────
export const SURF_DRAG_SENSITIVITY = 0.55;
export const SKY_DRAG_SENSITIVITY = 0.22;
export const BOX_DRAG_SENSITIVITY = 0.24;
export const SKATE_PUMP_SENSITIVITY = 0.18;

// ── Difficulty stages (tick thresholds) ───────────────────────────────────────
// Stage 1: ticks 0 – STAGE2_TICK  |  Stage 2: STAGE2_TICK – STAGE3_TICK  |  Stage 3: STAGE3_TICK+
export const STAGE2_TICK = 100 * (1000 / TICK_MS); // ~100 s
export const STAGE3_TICK = 250 * (1000 / TICK_MS); // ~250 s

// ── Surf ──────────────────────────────────────────────────────────────────────
export const SURF = {
  SWEET_ZONE_LO: 0.35,
  SWEET_ZONE_HI: 0.65,
  TUBE_MULTIPLIER_BONUS: 2,
  AERIAL_SCORE: 80,
  BARREL_HOLD_TICKS: 30, // ~1.5 s at 20fps
  BARREL_MULTIPLIER: 3,
  BARREL_DURATION_TICKS: 60, // 3 s
  // spawn intervals (ticks) per stage
  ZONE_SPAWN_S1: 60,
  ZONE_SPAWN_S2: 45,
  ZONE_SPAWN_S3: 32,
  // zone width range per stage
  ZONE_WIDTH_S1: { min: 0.10, max: 0.14 },
  ZONE_WIDTH_S2: { min: 0.12, max: 0.18 },
  ZONE_WIDTH_S3: { min: 0.14, max: 0.22 },
  WAVE_SPEED_NORMAL: 0.012,
  WAVE_SPEED_SLOW: 0.006,
};

// ── Skate ─────────────────────────────────────────────────────────────────────
export const SKATE = {
  GRAVITY: 0.008,
  FRICTION: 0.995,
  PIPE_RADIUS: Math.PI * 0.45,
  TRICK_NAMES_S1: ['Grab', '180°', '360°', 'McTwist'],
  TRICK_NAMES_S2: ['Grab', '180°', '360°', 'McTwist', 'Heelflip', 'Kickflip'],
  TRICK_NAMES_S3: ['Grab', '180°', '360°', 'McTwist', 'Heelflip', 'Kickflip', 'Varial', 'Hospital Flip'],
  TRICK_SCORE: 100,
  LAND_BONUS_PER_SHIELD: 50,
  STYLE_BONUS: 150, // Style Meter completion bonus
  STYLE_WINDOW_TICKS: 80, // ~4 s to complete a style sequence
  RAIL_GRIND_SCORE: 80,
};

// ── Hackey ────────────────────────────────────────────────────────────────────
export const HACKEY = {
  BASE_DRAIN_S1: 0.018,
  BASE_DRAIN_S2: 0.024,
  BASE_DRAIN_S3: 0.032,
  FAKE_PLAYER_COMBO_THRESHOLD: 6, // introduce fake player at combo >= 6
  WILD_COMBO_THRESHOLD: 13,       // introduce wild bounce at combo >= 13
  PERFECT_WINDOW: 0.75,           // tap with window > 75% = Perfect
  PERFECT_BONUS: 5,
  MISS_LIMIT: 3,
};

// ── Skydive ───────────────────────────────────────────────────────────────────
export const SKYDIVE = {
  GATE_GAP_S1: 0.30,
  GATE_GAP_S2: 0.24,
  GATE_GAP_S3: 0.18,
  GATE_SCORE: 25,
  PERFECT_GATE_SCORE: 50,     // centered within ±2% of gate center
  PERFECT_CENTER_MARGIN: 0.02,
  GATE_SPAWN_S1: 55,
  GATE_SPAWN_S2: 42,
  GATE_SPAWN_S3: 30,
  CLOUD_SPAWN_S1: 40,
  CLOUD_SPAWN_S2: 28,
  CLOUD_SPAWN_S3: 18,
  SPEED_S1: 0.016,
  SPEED_S2: 0.022,
  SPEED_S3: 0.030,
  ALT_STAGE2: 7000, // ft — below this = stage 2
  ALT_STAGE3: 3500, // ft — below this = stage 3
};

// ── Box Race ──────────────────────────────────────────────────────────────────
export const BOXRACE = {
  MAX_SPEED: 0.025,
  SPEED_ACCEL: 0.0004,
  BOOST_SCORE: 30,
  SLIPSTREAM_DIST: 0.08,  // x-dist to be "behind" a rival
  SLIPSTREAM_Y_RANGE: 0.12,
  SLIPSTREAM_TICKS: 30,   // ~1.5 s to activate slipstream
  SLIPSTREAM_BURST: 0.006,
  BOX_SPAWN_S1: 35,
  BOX_SPAWN_S2: 25,
  BOX_SPAWN_S3: 18,
  BOOST_SPAWN: 80,
  COLLISION_THRESHOLD_BASE: 0.10,
  BOOST_PICKUP_THRESHOLD: 0.10,
};

// ── Milestone scores ─────────────────────────────────────────────────────────
export const MILESTONES: Record<string, number[]> = {
  surf:     [200, 500, 1000],
  skate:    [150, 400, 800],
  hackey:   [100, 300, 700],
  skydive:  [200, 500, 1000],
  boxrace:  [150, 400, 900],
};
