// ─── Central Tuning Config ────────────────────────────────────────────────────
// All gameplay constants live here. Change values here, not inline in game loops.

// ── Global ────────────────────────────────────────────────────────────────────
export const TICK_MS = 50; // ~20 fps game tick
export const SLOW_MOTION_BASE_DURATION = 18; // seconds
export const DRAG_DEADZONE_PX = 7;
export const CONTROLS_TIP_DURATION_MS = 4000;
export const FLICK_TRICK_VELOCITY = -1.15;
export const SLOW_MOTION_SPEED_MULT = 0.55;
export const SLOW_MOTION_TICK_DIVISOR = 8;

// ── Sensitivity defaults ───────────────────────────────────────────────────────
export const SURF_DRAG_SENSITIVITY = 0.55;
export const SKY_DRAG_SENSITIVITY = 0.22;
export const BOX_DRAG_SENSITIVITY = 0.24;
export const SKATE_PUMP_SENSITIVITY = 0.18;

// ── Difficulty stages (tick thresholds) ───────────────────────────────────────
// Stage 1: ticks 0 – STAGE2_TICK  |  Stage 2: STAGE2_TICK – STAGE3_TICK  |  Stage 3: STAGE3_TICK+
export const STAGE2_TICK = 35 * (1000 / TICK_MS); // ~35 s
export const STAGE3_TICK = 75 * (1000 / TICK_MS); // ~75 s

// ── Shared gameplay feedback ───────────────────────────────────────────────────
export const FEEDBACK = {
  HIT_FLASH_MS: 260,
  FATAL_FLASH_MS: 380,
  MILESTONE_TOAST_MS: 2200,
  STAGE_MESSAGE_MS: 1400,
  COMBO_BURST_INTERVAL: 5,
  AUDIO_CUE_LABEL_MS: 450,
};

// ── Audio cue hooks (event ids for future SFX bus integrations) ──────────────
export const AUDIO_HOOKS = {
  surf: {
    STAGE_UP: 'surf_stage_up',
    NEAR_MISS: 'surf_near_miss',
    AERIAL: 'surf_aerial',
    BARREL: 'surf_barrel',
    HIT: 'surf_hit',
  },
  skate: {
    STAGE_UP: 'skate_stage_up',
    PUMP: 'skate_pump',
    AIR: 'skate_air',
    TRICK_CONFIRM: 'skate_trick_confirm',
    STYLE_BONUS: 'skate_style_bonus',
    LAND: 'skate_land',
  },
  hackey: {
    STAGE_UP: 'hackey_stage_up',
    TAP_GOOD: 'hackey_tap_good',
    TAP_PERFECT: 'hackey_tap_perfect',
    COMBO_BURST: 'hackey_combo_burst',
    DANGER: 'hackey_danger',
    MISS: 'hackey_miss',
  },
  skydive: {
    STAGE_UP: 'skydive_stage_up',
    GATE_CLEAR: 'skydive_gate_clear',
    GATE_PERFECT: 'skydive_gate_perfect',
    DANGER: 'skydive_danger',
    HIT: 'skydive_hit',
  },
  boxrace: {
    STAGE_UP: 'box_stage_up',
    BOOST: 'box_boost',
    SLIPSTREAM_CHARGE: 'box_slipstream_charge',
    SLIPSTREAM_BURST: 'box_slipstream_burst',
    DANGER: 'box_danger',
    HIT: 'box_hit',
  },
};

// ── Surf ──────────────────────────────────────────────────────────────────────
export const SURF = {
  SWEET_ZONE_LO: 0.37,
  SWEET_ZONE_HI: 0.63,
  TUBE_MULTIPLIER_BONUS: 2,
  AERIAL_SCORE: 85,
  AERIAL_DURATION_MS: 1000,
  BARREL_HOLD_TICKS: 36, // ~1.8 s at 20fps
  BARREL_MULTIPLIER: 3,
  BARREL_DURATION_TICKS: 56, // 2.8 s
  // spawn intervals (ticks) per stage
  ZONE_SPAWN_S1: 64,
  ZONE_SPAWN_S2: 52,
  ZONE_SPAWN_S3: 40,
  // zone width range per stage
  ZONE_WIDTH_S1: { min: 0.10, max: 0.13 },
  ZONE_WIDTH_S2: { min: 0.12, max: 0.17 },
  ZONE_WIDTH_S3: { min: 0.14, max: 0.20 },
  WAVE_SPEED_S1: 0.0105,
  WAVE_SPEED_S2: 0.012,
  WAVE_SPEED_S3: 0.0135,
  NEAR_MISS_THRESHOLD: 0.045,
  HIT_COOLDOWN_TICKS: 10,
};

// ── Skate ─────────────────────────────────────────────────────────────────────
export const SKATE = {
  GRAVITY: 0.0075,
  FRICTION: 0.996,
  PIPE_RADIUS: Math.PI * 0.45,
  TRICK_NAMES_S1: ['Grab', '180°', '360°', 'McTwist'],
  TRICK_NAMES_S2: ['Grab', '180°', '360°', 'McTwist', 'Heelflip', 'Kickflip'],
  TRICK_NAMES_S3: ['Grab', '180°', '360°', 'McTwist', 'Heelflip', 'Kickflip', 'Varial', 'Hospital Flip'],
  TRICK_SCORE: 100,
  LAND_BONUS_PER_SHIELD: 50,
  STYLE_BONUS: 150, // Style Meter completion bonus
  STYLE_WINDOW_TICKS: 88, // ~4.4 s to complete a style sequence
  LAND_ANGLE_THRESHOLD: 0.07,
  LAND_SPEED_THRESHOLD: 0.04,
  TRICK_DISPLAY_MS: 2200,
  AIR_EVENT_COOLDOWN_TICKS: 8,
  RAIL_SPAWN_CHANCE_S1: 0.32,
  RAIL_SPAWN_CHANCE_S2: 0.5,
  RAIL_SPAWN_CHANCE_S3: 0.65,
  RAIL_GRIND_SCORE: 80,
};

// ── Hackey ────────────────────────────────────────────────────────────────────
export const HACKEY = {
  BASE_DRAIN_S1: 0.016,
  BASE_DRAIN_S2: 0.021,
  BASE_DRAIN_S3: 0.027,
  COMBO_DRAIN_FACTOR: 0.022,
  FAKE_PLAYER_COMBO_THRESHOLD: 6, // introduce fake player at combo >= 6
  WILD_COMBO_THRESHOLD: 13,       // introduce wild bounce at combo >= 13
  PERFECT_WINDOW: 0.72,           // tap with window > 72% = Perfect
  PERFECT_BONUS: 6,
  MISS_LIMIT: 3,
  DANGER_WINDOW: 0.2,
  SACK_LERP: 0.14,
  TARGET_COUNT: 6,
};

// ── Skydive ───────────────────────────────────────────────────────────────────
export const SKYDIVE = {
  GATE_GAP_S1: 0.32,
  GATE_GAP_S2: 0.27,
  GATE_GAP_S3: 0.22,
  CONTROL_GAP_BONUS_MULT: 0.1,
  GATE_SCORE: 25,
  PERFECT_GATE_SCORE: 55,     // centered within ±1.8% of gate center
  PERFECT_CENTER_MARGIN: 0.018,
  GATE_SPAWN_S1: 58,
  GATE_SPAWN_S2: 46,
  GATE_SPAWN_S3: 34,
  CLOUD_SPAWN_S1: 44,
  CLOUD_SPAWN_S2: 33,
  CLOUD_SPAWN_S3: 24,
  SPEED_S1: 0.0155,
  SPEED_S2: 0.0205,
  SPEED_S3: 0.0265,
  GATE_PASS_Y_MIN: 0.75,
  GATE_PASS_Y_MAX: 0.89,
  DANGER_CENTER_MARGIN: 0.05,
  CLOUD_RADIUS_MIN: 0.08,
  CLOUD_RADIUS_MAX: 0.13,
  ALT_STAGE2: 7000, // ft — below this = stage 2
  ALT_STAGE3: 3500, // ft — below this = stage 3
};

// ── Box Race ──────────────────────────────────────────────────────────────────
export const BOXRACE = {
  MAX_SPEED: 0.0245,
  SPEED_ACCEL: 0.00034,
  BOOST_SCORE: 30,
  SLIPSTREAM_SCORE: 50,
  SLIPSTREAM_DIST: 0.075,  // x-dist to be "behind" a rival
  SLIPSTREAM_Y_MIN: 0.6,
  SLIPSTREAM_Y_MAX: 0.78,
  SLIPSTREAM_TICKS: 34,   // ~1.7 s to activate slipstream
  SLIPSTREAM_BURST: 0.0065,
  SLIPSTREAM_ACTIVE_MS: 1600,
  BOX_SPAWN_S1: 40,
  BOX_SPAWN_S2: 30,
  BOX_SPAWN_S3: 22,
  BOOST_SPAWN: 72,
  COLLISION_THRESHOLD_BASE: 0.11,
  COLLISION_CONTROL_BONUS_MULT: 0.14,
  COLLISION_Y_MIN: 0.79,
  COLLISION_Y_MAX: 0.95,
  BOOST_PICKUP_Y_MIN: 0.8,
  BOOST_PICKUP_Y_MAX: 0.95,
  DANGER_X_MARGIN: 0.028,
  RIVAL_SPEED_MIN: 0.0045,
  RIVAL_SPEED_MAX: 0.0105,
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
