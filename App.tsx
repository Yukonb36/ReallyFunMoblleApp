import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import {
  SURF, SKATE, HACKEY, SKYDIVE, BOXRACE, MILESTONES,
  STAGE2_TICK, STAGE3_TICK,
  TICK_MS, SLOW_MOTION_BASE_DURATION, DRAG_DEADZONE_PX, CONTROLS_TIP_DURATION_MS, FLICK_TRICK_VELOCITY,
  SURF_DRAG_SENSITIVITY, SKY_DRAG_SENSITIVITY, BOX_DRAG_SENSITIVITY, SKATE_PUMP_SENSITIVITY,
  SLOW_MOTION_SPEED_MULT, SLOW_MOTION_TICK_DIVISOR, FEEDBACK, AUDIO_HOOKS,
} from './src/config/tuning';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_LOG_DIR = `${FileSystem.documentDirectory ?? ''}alpha-logs/`;
const DEFAULT_LOG_FILE = `${DEFAULT_LOG_DIR}alpha-errors.txt`;
const { width: SCREEN_W } = Dimensions.get('window');

const rewardedAd = RewardedAd.createForAdRequest(TestIds.REWARDED, {
  requestNonPersonalizedAdsOnly: true,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type ScreenKey = 'landing' | 'select' | 'game';
type GameModeKey = 'surf' | 'skate' | 'hackey' | 'skydive' | 'boxrace';

type GameMode = {
  name: string;
  emoji: string;
  shortRules: string;
  description: string;
  tokenMultiplier: number;
  accentColor: string;
  dimColor: string;
};

type Character = {
  id: string;
  name: string;
  cost: number;
  color: string;
  secondaryColor: string;
  accentColor: string;
  shieldBonus: number;
  slowMotionBonus: number;
  controlBonus: number;
  persona: string;
  signatureMove: string;
  bonusDescription: string;
};

type ModeProgress = {
  points: number;
  totalRuns: number;
  challengeCompletions: number;
  dailyCompletedDate: string | null;
};

type DailyObjectiveId =
  | 'score'
  | 'aerials'
  | 'barrels'
  | 'styles'
  | 'lands'
  | 'perfects'
  | 'combo'
  | 'gates'
  | 'slipstreams'
  | 'boosts';

type DailyChallenge = {
  dayKey: string;
  mode: GameModeKey;
  badge: string;
  modifierId: string;
  modifierName: string;
  modifierText: string;
  objectiveId: DailyObjectiveId;
  objectiveText: string;
  objectiveTarget: number;
  rewardTokens: number;
};

type SaveState = {
  bestScores: Record<GameModeKey, number>;
  tokens: number;
  lifetimeTokens: number;
  ownedCharacters: string[];
  selectedCharacterId: string;
  modeProgress: Record<GameModeKey, ModeProgress>;
};

type RunEndMeta = {
  payoutTokens: number;
  challengeTokens: number;
  masteryTokens: number;
  masteryPointsGained: number;
  bestDelta: number;
  challengeCompleted: boolean;
  objectiveProgress: number;
  objectiveTarget: number;
  levelBefore: number;
  levelAfter: number;
};

// ── Surf game state ───
type WaveZone = { id: number; x: number; width: number }; // x: 0-1, width: 0-1

// ── Skate game state ──
// angle: radians, 0 = bottom of pipe, +/- PI/2 = top of wall
type SkateRail = { id: number; side: 'left' | 'right'; active: boolean };

// ── Hackey game state ─
type HackeyPlayer = { id: number; angle: number }; // angle in circle (radians)

// ── Skydive game state ─
type SkyGate = { id: number; y: number; gapX: number }; // y: 0-1 falling, gapX: 0-1 center of gap
type SkyCloud = { id: number; x: number; y: number; r: number }; // turbulence puff

// ── Box Race game state ─
type RaceBox = { id: number; x: number; y: number; speed: number; color: string };

const GAME_MODES: Record<GameModeKey, GameMode> = {
  surf: {
    name: 'Surf Ride',
    emoji: '🏄',
    shortRules: 'Drag to ride the wave face. Flick up for aerials!',
    description: 'Ride the wave face. Dodge whitewater closeouts, pull aerials in the sweet zone.',
    tokenMultiplier: 2,
    accentColor: '#56B0FF',
    dimColor: '#0D2A45',
  },
  skate: {
    name: 'Half Pipe',
    emoji: '🛹',
    shortRules: 'Swipe left/right to pump. Go airborne for tricks!',
    description: 'Pump up the half pipe walls. Launch off the coping and pull tricks in the air.',
    tokenMultiplier: 3,
    accentColor: '#FF6B6B',
    dimColor: '#330D0D',
  },
  hackey: {
    name: 'Hackey Circle',
    emoji: '🤸',
    shortRules: 'Tap the glowing player before the sack drops!',
    description: 'Keep the hacky sack alive. Tap the active player in time — chains build combos.',
    tokenMultiplier: 4,
    accentColor: '#A07AFF',
    dimColor: '#1A0D33',
  },
  skydive: {
    name: 'Skydive',
    emoji: '🪂',
    shortRules: 'Drag to steer through gates. Dodge turbulence clouds!',
    description: 'Free-fall at terminal velocity. Thread the cloud gates and avoid turbulence to survive.',
    tokenMultiplier: 5,
    accentColor: '#00E5C8',
    dimColor: '#071A2E',
  },
  boxrace: {
    name: 'Box Racer',
    emoji: '📦',
    shortRules: 'Swipe to steer. Ram rivals, dodge walls!',
    description: 'Top-down karting in a box car. Smash rival boxes, hit boosts, and stay on the track.',
    tokenMultiplier: 3,
    accentColor: '#FFB830',
    dimColor: '#1A1000',
  },
};

const CHARACTERS: Character[] = [
  {
    id: 'rookie',
    name: 'Maya Coast',
    cost: 0,
    color: '#40E0D0',
    secondaryColor: '#1B3F4A',
    accentColor: '#9BE9FF',
    shieldBonus: 1,
    slowMotionBonus: 0,
    controlBonus: 0.02,
    persona: 'Festival all-rounder',
    signatureMove: 'Calm recovery and steady lines.',
    bonusDescription: 'Balanced starter with smoother handling.',
  },
  {
    id: 'wave-pro',
    name: 'Kai Tidebreaker',
    cost: 120,
    color: '#56A3FF',
    secondaryColor: '#102C59',
    accentColor: '#9ECCFF',
    shieldBonus: 2,
    slowMotionBonus: 3,
    controlBonus: 0.05,
    persona: 'Barrel specialist',
    signatureMove: 'Reads sections early and trims through turbulence.',
    bonusDescription: 'Extra shield, longer focus, tighter wave control.',
  },
  {
    id: 'street-ace',
    name: 'Rhea Volt',
    cost: 220,
    color: '#FF8E5B',
    secondaryColor: '#4B1D18',
    accentColor: '#FFD2B6',
    shieldBonus: 2,
    slowMotionBonus: 5,
    controlBonus: 0.07,
    persona: 'Street aerial ace',
    signatureMove: 'Fast hand speed for sharper landings and lane changes.',
    bonusDescription: 'Longer focus window and sharper precision at speed.',
  },
  {
    id: 'freestyle-legend',
    name: 'Atlas Nova',
    cost: 420,
    color: '#E8C850',
    secondaryColor: '#4D360D',
    accentColor: '#FFF2A8',
    shieldBonus: 3,
    slowMotionBonus: 7,
    controlBonus: 0.1,
    persona: 'Legendary headliner',
    signatureMove: 'Elite reflexes with the strongest survival kit in the roster.',
    bonusDescription: 'Top-tier durability, focus time, and elite control.',
  },
];

const SAVE_FILE = `${FileSystem.documentDirectory ?? ''}retro-rush-save.json`;
const MODE_ORDER: GameModeKey[] = ['surf', 'skate', 'hackey', 'skydive', 'boxrace'];
const MODE_MASTERIES = {
  surf: ['Breakwater Rookie', 'Point Break Local', 'Tube Poster', 'Sponsor Wave', 'Festival Legend'],
  skate: ['Ramp Rookie', 'Park Local', 'Deck Poster', 'Sponsor Session', 'Festival Legend'],
  hackey: ['Circle Rookie', 'Jam Local', 'Glow Poster', 'Sponsor Rhythm', 'Festival Legend'],
  skydive: ['Drop Rookie', 'Wind Local', 'Cloud Poster', 'Sponsor Altitude', 'Festival Legend'],
  boxrace: ['Track Rookie', 'Grid Local', 'Pit Poster', 'Sponsor Turbo', 'Festival Legend'],
} as const satisfies Record<GameModeKey, readonly string[]>;
const MASTERY_LEVELS = [
  { points: 0, tokenReward: 0, rewardText: 'Starter stamp' },
  { points: 1, tokenReward: 15, rewardText: 'Sponsor drop: +15 tokens' },
  { points: 3, tokenReward: 20, rewardText: 'Mode poster cosmetic unlocked' },
  { points: 6, tokenReward: 25, rewardText: 'Daily reward boost unlocked' },
  { points: 10, tokenReward: 35, rewardText: 'Legend aura cosmetic unlocked' },
] as const;
const DAILY_MODIFIERS = {
  surf: [
    { id: 'drift-current', name: 'Cross Current', text: 'A side current slowly pushes your line across the wave.' },
    { id: 'squall-lines', name: 'Squall Lines', text: 'Whitewater sections arrive faster and roll wider.' },
    { id: 'air-festival', name: 'Air Festival', text: 'Aerials cash out bigger, but the wave stays twitchy.' },
  ],
  skate: [
    { id: 'low-gravity', name: 'Low Gravity', text: 'Hang time lasts longer, creating slower airborne reads.' },
    { id: 'rail-jam', name: 'Rail Jam', text: 'Rails show up constantly to change line choices.' },
    { id: 'trick-frenzy', name: 'Trick Frenzy', text: 'Called tricks pay extra, rewarding aggressive launches.' },
  ],
  hackey: [
    { id: 'hot-potato', name: 'Hot Potato', text: 'The sack drains faster, forcing quick decisions.' },
    { id: 'echo-target', name: 'Echo Target', text: 'Correct taps can repeat the same player for rhythm loops.' },
    { id: 'focus-ring', name: 'Focus Ring', text: 'Perfect taps are worth more, but the perfect lane is tighter.' },
  ],
  skydive: [
    { id: 'jetstream', name: 'Jetstream', text: 'A wind lane drifts your diver off-centre over time.' },
    { id: 'ring-rush', name: 'Ring Rush', text: 'Gate spawns speed up and rewards spike for clean lines.' },
    { id: 'cloudburst', name: 'Cloudburst', text: 'Turbulence clusters are denser and more frequent.' },
  ],
  boxrace: [
    { id: 'sidewind', name: 'Sidewind', text: 'The kart gets nudged sideways unless you keep correcting.' },
    { id: 'boost-parade', name: 'Boost Parade', text: 'Pads appear faster to create risk-reward racing lines.' },
    { id: 'turbo-grid', name: 'Turbo Grid', text: 'Rivals charge harder and the grid gets busier sooner.' },
  ],
} as const satisfies Record<GameModeKey, readonly { id: string; name: string; text: string }[]>;
const DAILY_OBJECTIVES = {
  surf: [
    { id: 'aerials', text: 'Land 3 aerials', target: 3 },
    { id: 'barrels', text: 'Trigger 2 barrels', target: 2 },
    { id: 'score', text: 'Score 450+', target: 450 },
  ],
  skate: [
    { id: 'styles', text: 'Land 2 style bonuses', target: 2 },
    { id: 'lands', text: 'Stick 4 landings', target: 4 },
    { id: 'score', text: 'Score 500+', target: 500 },
  ],
  hackey: [
    { id: 'perfects', text: 'Hit 5 perfect taps', target: 5 },
    { id: 'combo', text: 'Reach combo x12', target: 12 },
    { id: 'score', text: 'Score 350+', target: 350 },
  ],
  skydive: [
    { id: 'gates', text: 'Clear 8 gates', target: 8 },
    { id: 'perfects', text: 'Thread 3 perfect gates', target: 3 },
    { id: 'score', text: 'Score 450+', target: 450 },
  ],
  boxrace: [
    { id: 'slipstreams', text: 'Trigger 3 slipstreams', target: 3 },
    { id: 'boosts', text: 'Collect 4 boosts', target: 4 },
    { id: 'score', text: 'Score 500+', target: 500 },
  ],
} as const satisfies Record<GameModeKey, readonly { id: DailyObjectiveId; text: string; target: number }[]>;
const DAILY_BADGES: Record<GameModeKey, string> = {
  surf: '🌊',
  skate: '🛹',
  hackey: '🤸',
  skydive: '🪂',
  boxrace: '📦',
};
const createDefaultModeProgress = (): Record<GameModeKey, ModeProgress> => ({
  surf: { points: 0, totalRuns: 0, challengeCompletions: 0, dailyCompletedDate: null },
  skate: { points: 0, totalRuns: 0, challengeCompletions: 0, dailyCompletedDate: null },
  hackey: { points: 0, totalRuns: 0, challengeCompletions: 0, dailyCompletedDate: null },
  skydive: { points: 0, totalRuns: 0, challengeCompletions: 0, dailyCompletedDate: null },
  boxrace: { points: 0, totalRuns: 0, challengeCompletions: 0, dailyCompletedDate: null },
});
const getMasteryLevel = (points: number) => {
  let level = 0;
  for (let i = 0; i < MASTERY_LEVELS.length; i += 1) {
    if (points >= MASTERY_LEVELS[i].points) level = i;
  }
  return level;
};
const getNextMasteryTier = (points: number) =>
  MASTERY_LEVELS.find((tier) => tier.points > points) ?? null;
const sumLevelRewards = (fromLevel: number, toLevel: number) => {
  let total = 0;
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    total += MASTERY_LEVELS[level]?.tokenReward ?? 0;
  }
  return total;
};
const getDailySeed = (dayKey: string) =>
  Array.from(dayKey).reduce((sum, char) => sum + char.charCodeAt(0), 0);
const hashSeed = (value: string) =>
  Array.from(value).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 17), 0);
const buildDailyChallenge = (mode: GameModeKey, dayKey: string): DailyChallenge => {
  const modeIndex = MODE_ORDER.indexOf(mode);
  const modifierSeed = hashSeed(`${dayKey}:${mode}:modifier`) + getDailySeed(dayKey) + modeIndex * 5;
  const objectiveSeed = hashSeed(`${dayKey}:${mode}:objective`) + modeIndex * 11;
  const modifier = DAILY_MODIFIERS[mode][modifierSeed % DAILY_MODIFIERS[mode].length];
  const objective = DAILY_OBJECTIVES[mode][objectiveSeed % DAILY_OBJECTIVES[mode].length];
  return {
    dayKey,
    mode,
    badge: DAILY_BADGES[mode],
    modifierId: modifier.id,
    modifierName: modifier.name,
    modifierText: modifier.text,
    objectiveId: objective.id,
    objectiveText: objective.text,
    objectiveTarget: objective.target,
    rewardTokens: 28 + modeIndex * 6,
  };
};

// ─── Helper ───────────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const applyGestureDeadzone = (distance: number) =>
  Math.abs(distance) <= DRAG_DEADZONE_PX
    ? 0
    : distance - Math.sign(distance) * DRAG_DEADZONE_PX;
const getObjectiveProgress = (
  objectiveId: DailyObjectiveId,
  scoreValue: number,
  stats: {
    aerials?: number;
    barrelRides?: number;
    styleBonuses?: number;
    cleanLandings?: number;
    perfectTaps?: number;
    maxCombo?: number;
    gatesCleared?: number;
    perfectThreads?: number;
    slipstreams?: number;
    boostsCollected?: number;
  },
) => {
  switch (objectiveId) {
    case 'score':
      return scoreValue;
    case 'aerials':
      return stats.aerials ?? 0;
    case 'barrels':
      return stats.barrelRides ?? 0;
    case 'styles':
      return stats.styleBonuses ?? 0;
    case 'lands':
      return stats.cleanLandings ?? 0;
    case 'perfects':
      return (stats.perfectTaps ?? 0) + (stats.perfectThreads ?? 0);
    case 'combo':
      return stats.maxCombo ?? 0;
    case 'gates':
      return stats.gatesCleared ?? 0;
    case 'slipstreams':
      return stats.slipstreams ?? 0;
    case 'boosts':
      return stats.boostsCollected ?? 0;
    default:
      return 0;
  }
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [logFilePath] = useState(DEFAULT_LOG_FILE);

  // ── navigation / meta ─────────────────────────────────────────────────────
  const [screen, setScreen] = useState<ScreenKey>('landing');
  const [selectedMode, setSelectedMode] = useState<GameModeKey>('surf');
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState<Record<GameModeKey, number>>({
    surf: 0, skate: 0, hackey: 0, skydive: 0, boxrace: 0,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [modeProgress, setModeProgress] = useState<Record<GameModeKey, ModeProgress>>(createDefaultModeProgress());
  const [saveReady, setSaveReady] = useState(false);
  const dayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dailyChallenges = useMemo<Record<GameModeKey, DailyChallenge>>(
    () => ({
      surf: buildDailyChallenge('surf', dayKey),
      skate: buildDailyChallenge('skate', dayKey),
      hackey: buildDailyChallenge('hackey', dayKey),
      skydive: buildDailyChallenge('skydive', dayKey),
      boxrace: buildDailyChallenge('boxrace', dayKey),
    }),
    [dayKey],
  );
  const [activeDailyChallenge, setActiveDailyChallenge] = useState<DailyChallenge | null>(null);
  const activeDailyChallengeRef = useRef<DailyChallenge | null>(null);
  const [runEndMeta, setRunEndMeta] = useState<RunEndMeta | null>(null);

  // ── economy ───────────────────────────────────────────────────────────────
  const [tokens, setTokens] = useState(0);
  const [lifetimeTokens, setLifetimeTokens] = useState(0);
  const [ownedCharacters, setOwnedCharacters] = useState<string[]>(['rookie']);
  const [selectedCharacterId, setSelectedCharacterId] = useState('rookie');
  const [shields, setShields] = useState(1);
  const [slowMotionSeconds, setSlowMotionSeconds] = useState(0);
  const [rewardLoaded, setRewardLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [showCharacters, setShowCharacters] = useState(false);

  // ── Sensitivity & controls tutorial ───────────────────────────────────────
  const [sensitivity, setSensitivity] = useState(1.0);
  const sensitivityRef = useRef(1.0);
  const [showControlsTip, setShowControlsTip] = useState(false);
  const controlsTipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── refs ──────────────────────────────────────────────────────────────────
  const tickRef = useRef(0);
  const rewardedAtGameOverRef = useRef(false);
  const runStartBestRef = useRef(0);
  const isPlayingRef = useRef(false);
  const hasRunStartedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Surf state ────────────────────────────────────────────────────────────
  const [surferX, setSurferX] = useState(0.5);          // 0-1 across wave face
  const [waveZones, setWaveZones] = useState<WaveZone[]>([]); // danger whitewater
  const [trickAirborne, setTrickAirborne] = useState(false);
  const [tubeMultiplier, setTubeMultiplier] = useState(1);
  const trickAirborneRef = useRef(false);
  const surferXRef = useRef(0.5);
  const tubeMultiplierRef = useRef(1);
  const surfDragOriginRef = useRef(0.5);
  const surfWavePhase = useRef(0); // for sinusoidal wave anim
  const surfAnimVal = useRef(new Animated.Value(0)).current;

  // ── Skate state ───────────────────────────────────────────────────────────
  const [skateAngle, setSkateAngle] = useState(0);       // radians: 0=bottom
  const [skateAirborne, setSkateAirborne] = useState(false);
  const [skateSpeed, setSkateSpeed] = useState(0);        // angular velocity
  const [skateTrick, setSkateTrick] = useState<string | null>(null);
  const [skateRails, setSkateRails] = useState<SkateRail[]>([]);
  const skateAngleRef = useRef(0);
  const skateSpeedRef = useRef(0);
  const skateAirborneRef = useRef(false);
  const skateTrickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hackey state ──────────────────────────────────────────────────────────
  const HACKEY_PLAYERS = useMemo<HackeyPlayer[]>(() =>
    Array.from({ length: HACKEY.TARGET_COUNT }, (_, i) => ({
      id: i,
      angle: (i * Math.PI * 2) / HACKEY.TARGET_COUNT,
    })), []);
  const [hackeyTarget, setHackeyTarget] = useState(0);   // player id
  const [hackeyWindow, setHackeyWindow] = useState(1);   // 0-1 shrinking
  const [hackeyMisses, setHackeyMisses] = useState(0);
  const [hackeyCombo, setHackeyCombo] = useState(0);
  const [hackeySackPos, setHackeySackPos] = useState({ x: 0.5, y: 0.5 });
  const hackeyWindowRef = useRef(1);
  const hackeyTargetRef = useRef(0);
  const hackeyMissesRef = useRef(0);

  // ── Skydive state ─────────────────────────────────────────────────────────
  const [skyX, setSkyX] = useState(0.5);                   // 0-1 horizontal
  const [skyGates, setSkyGates] = useState<SkyGate[]>([]);  // ring-gates to thread
  const [skyClouds, setSkyClouds] = useState<SkyCloud[]>([]); // turbulence pockets
  const [skyAltitude, setSkyAltitude] = useState(10000);    // display altitude ft
  const [skyGatesCleared, setSkyGatesCleared] = useState(0);
  const skyXRef = useRef(0.5);
  const skyDragOriginRef = useRef(0.5);

  // ── Box Race state ────────────────────────────────────────────────────────
  const [racerX, setRacerX] = useState(0.5);               // 0-1 track position
  const [raceBoxes, setRaceBoxes] = useState<RaceBox[]>([]);
  const [raceBoosts, setRaceBoosts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [racerSpeed, setRacerSpeed] = useState(0);
  const racerXRef = useRef(0.5);
  const raceDragOriginRef = useRef(0.5);

  // ── Mastery mechanics ─────────────────────────────────────────────────────
  // Surf: Barrel Ride
  const [barrelHoldTicks, setBarrelHoldTicks] = useState(0);
  const [barrelActive, setBarrelActive] = useState(false);
  const barrelActiveRef = useRef(false);
  const barrelHoldTicksRef = useRef(0);
  const barrelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skate: Style Meter (pump → aerial → trick → land sequence)
  const [stylePhase, setStylePhase] = useState<0 | 1 | 2 | 3>(0); // 0=idle,1=pumped,2=airborne,3=tricked
  const [styleTicks, setStyleTicks] = useState(0);
  const stylePhaseRef = useRef<0 | 1 | 2 | 3>(0);
  const styleTicksRef = useRef(0);
  // Hackey: perfect-timing bonus
  const [lastTapPerfect, setLastTapPerfect] = useState(false);
  // Skydive: perfect threading bonus
  const [lastGatePerfect, setLastGatePerfect] = useState(false);
  // Box Race: slipstream counter
  const [slipstreamTicks, setSlipstreamTicks] = useState(0);
  const [slipstreamActive, setSlipstreamActive] = useState(false);
  const slipstreamTicksRef = useRef(0);
  const slipstreamActiveRef = useRef(false);

  // ── Feedback & progression ────────────────────────────────────────────────
  const [hitFlash, setHitFlash] = useState(false);          // brief red flash on hit
  const [milestoneMsg, setMilestoneMsg] = useState('');     // milestone toast
  const milestoneReachedRef = useRef<Set<number>>(new Set());
  const audioCueCooldownUntilRef = useRef<Record<string, number>>({});
  const recentSurfNearMissRef = useRef(0);
  const recentHackeyDangerRef = useRef(0);
  const recentSkydiveDangerRef = useRef(0);
  const recentBoxDangerRef = useRef(0);
  const surfHitCooldownRef = useRef(0);
  const skateAirCooldownRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Run summary (for game-over screen)
  const [runSummary, setRunSummary] = useState<{
    maxCombo?: number; gatesCleared?: number; barrelRides?: number;
    styleBonuses?: number; maxSpeed?: number; slipstreams?: number;
    aerials?: number; cleanLandings?: number; perfectTaps?: number;
    perfectThreads?: number; boostsCollected?: number;
  }>({});
  const runSummaryRef = useRef<typeof runSummary>({});

  // ── Difficulty stage ──────────────────────────────────────────────────────
  const [diffStage, setDiffStage] = useState<1 | 2 | 3>(1);
  const diffStageRef = useRef<1 | 2 | 3>(1);

  const activeMode = GAME_MODES[selectedMode];
  const activeCharacter = CHARACTERS.find((c) => c.id === selectedCharacterId) ?? CHARACTERS[0];

  const triggerAudioHook = useCallback((hookId: string, cooldownMs = 120) => {
    const now = Date.now();
    if ((audioCueCooldownUntilRef.current[hookId] ?? 0) > now) return;
    audioCueCooldownUntilRef.current[hookId] = now + cooldownMs;
  }, []);

  // ─── Error logging ────────────────────────────────────────────────────────
  const appendErrorLog = useCallback(async (error: unknown, context: string) => {
    try {
      const printableError =
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
          : String(error);
      const logLine = `[${new Date().toISOString()}] [${context}] ${printableError}\n\n`;
      const folderPath = logFilePath.replace(/[^/]+$/, '');
      await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
      await FileSystem.writeAsStringAsync(logFilePath, logLine, {
        encoding: FileSystem.EncodingType.UTF8,
        append: true,
      });
    } catch {
      // silently swallow
    }
  }, [logFilePath]);

  useEffect(() => {
    let mounted = true;
    const loadSave = async () => {
      try {
        const info = await FileSystem.getInfoAsync(SAVE_FILE);
        if (!info.exists) {
          if (mounted) setSaveReady(true);
          return;
        }
        const raw = await FileSystem.readAsStringAsync(SAVE_FILE);
        const parsed = JSON.parse(raw) as Partial<SaveState>;
        if (!mounted) return;
        if (parsed.bestScores) {
          setBestScores((current) => ({ ...current, ...parsed.bestScores }));
        }
        if (typeof parsed.tokens === 'number') setTokens(parsed.tokens);
        if (typeof parsed.lifetimeTokens === 'number') setLifetimeTokens(parsed.lifetimeTokens);
        if (Array.isArray(parsed.ownedCharacters) && parsed.ownedCharacters.length > 0) {
          setOwnedCharacters(parsed.ownedCharacters);
        }
        if (typeof parsed.selectedCharacterId === 'string') {
          setSelectedCharacterId(parsed.selectedCharacterId);
        }
        if (parsed.modeProgress) {
          setModeProgress({
            ...createDefaultModeProgress(),
            ...parsed.modeProgress,
          });
        }
      } catch (error) {
        void appendErrorLog(error, 'LoadSaveState');
      } finally {
        if (mounted) setSaveReady(true);
      }
    };
    void loadSave();
    return () => {
      mounted = false;
    };
  }, [appendErrorLog]);

  useEffect(() => {
    if (!saveReady) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          const payload: SaveState = {
            bestScores,
            tokens,
            lifetimeTokens,
            ownedCharacters,
            selectedCharacterId,
            modeProgress,
          };
          await FileSystem.writeAsStringAsync(SAVE_FILE, JSON.stringify(payload));
        } catch (error) {
          void appendErrorLog(error, 'PersistSaveState');
        }
      })();
    }, 150);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [appendErrorLog, bestScores, lifetimeTokens, modeProgress, ownedCharacters, saveReady, selectedCharacterId, tokens]);

  useEffect(() => {
    const errorUtils = (
      globalThis as {
        ErrorUtils?: {
          getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
          setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
        };
      }
    ).ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error, isFatal) => {
      void appendErrorLog(error, isFatal ? 'UnhandledFatal' : 'Unhandled');
      previousHandler?.(error, isFatal);
    });
    return () => {
      if (previousHandler) errorUtils?.setGlobalHandler?.(previousHandler);
    };
  }, [appendErrorLog]);

  // ─── Reduced motion detection ──────────────────────────────────────────────
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isPlaying) setShields(activeCharacter.shieldBonus);
  }, [activeCharacter.shieldBonus, isPlaying]);

  useEffect(() => {
    rewardedAd.load();
    const loadedUnsub = rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => setRewardLoaded(true));
    const earnedUnsub = rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      const bonusDuration = SLOW_MOTION_BASE_DURATION + activeCharacter.slowMotionBonus;
      setTokens((c) => c + 40);
      setLifetimeTokens((c) => c + 40);
      setShields((c) => c + 1);
      setSlowMotionSeconds((c) => Math.max(c, bonusDuration));
      setMessage('Ad reward: +40 tokens, +1 shield, slow motion activated!');
    });
    const closedUnsub = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      setRewardLoaded(false);
      rewardedAd.load();
    });
    const failedUnsub = rewardedAd.addAdEventListener(AdEventType.ERROR, () => {
      setRewardLoaded(false);
      rewardedAd.load();
    });
    return () => { loadedUnsub(); earnedUnsub(); closedUnsub(); failedUnsub(); };
  }, [activeCharacter.slowMotionBonus]);

  // ─── Payout on game over ──────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying || rewardedAtGameOverRef.current || !hasRunStartedRef.current) return;
    rewardedAtGameOverRef.current = true;
    const challenge = activeDailyChallengeRef.current;
    const currentProgress = modeProgress[selectedMode];
    const previousLevel = getMasteryLevel(currentProgress.points);
    const runPayout = Math.max(8, Math.floor(score / 8) * activeMode.tokenMultiplier);
    const bestDelta = score - runStartBestRef.current;
    const objectiveProgress = challenge
      ? getObjectiveProgress(challenge.objectiveId, score, runSummaryRef.current)
      : 0;
    const challengeCompleted = Boolean(challenge && objectiveProgress >= challenge.objectiveTarget);
    const sponsorBonus = previousLevel >= 3 ? 10 : 0;
    const challengeTokens = challengeCompleted && currentProgress.dailyCompletedDate !== challenge?.dayKey
      ? (challenge?.rewardTokens ?? 0) + sponsorBonus
      : 0;
    const masteryPointsGained =
      1
      + (score >= MILESTONES[selectedMode][0] ? 1 : 0)
      + (bestDelta > 0 ? 1 : 0)
      + (challengeCompleted ? 2 : 0);
    const nextPoints = currentProgress.points + masteryPointsGained;
    const nextLevel = getMasteryLevel(nextPoints);
    const masteryTokens = sumLevelRewards(previousLevel, nextLevel);

    setTokens((c) => c + runPayout + challengeTokens + masteryTokens);
    setLifetimeTokens((c) => c + runPayout + challengeTokens + masteryTokens);
    setModeProgress((current) => ({
      ...current,
      [selectedMode]: {
        ...current[selectedMode],
        points: nextPoints,
        totalRuns: current[selectedMode].totalRuns + 1,
        challengeCompletions: current[selectedMode].challengeCompletions + (challengeTokens > 0 ? 1 : 0),
        dailyCompletedDate: challengeTokens > 0 ? challenge?.dayKey ?? current[selectedMode].dailyCompletedDate : current[selectedMode].dailyCompletedDate,
      },
    }));
    setRunEndMeta({
      payoutTokens: runPayout,
      challengeTokens,
      masteryTokens,
      masteryPointsGained,
      bestDelta,
      challengeCompleted,
      objectiveProgress,
      objectiveTarget: challenge?.objectiveTarget ?? 0,
      levelBefore: previousLevel,
      levelAfter: nextLevel,
    });
    if (challengeCompleted && challengeTokens > 0) {
      setMessage(`Daily clear! +${runPayout + challengeTokens + masteryTokens} tokens banked.`);
    } else if (challengeCompleted) {
      setMessage(`Daily objective cleared again. +${runPayout + masteryTokens} tokens banked.`);
    } else {
      setMessage(`Run complete! +${runPayout + masteryTokens} tokens from ${activeMode.name}.`);
    }
    hasRunStartedRef.current = false;
  }, [activeMode.name, activeMode.tokenMultiplier, isPlaying, modeProgress, score, selectedMode]);

  // ─── Sync refs ────────────────────────────────────────────────────────────
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { skateAngleRef.current = skateAngle; }, [skateAngle]);
  useEffect(() => { skateSpeedRef.current = skateSpeed; }, [skateSpeed]);
  useEffect(() => { skateAirborneRef.current = skateAirborne; }, [skateAirborne]);
  useEffect(() => { hackeyWindowRef.current = hackeyWindow; }, [hackeyWindow]);
  useEffect(() => { hackeyTargetRef.current = hackeyTarget; }, [hackeyTarget]);
  useEffect(() => { hackeyMissesRef.current = hackeyMisses; }, [hackeyMisses]);
  useEffect(() => { skyXRef.current = skyX; }, [skyX]);
  useEffect(() => { racerXRef.current = racerX; }, [racerX]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { stylePhaseRef.current = stylePhase; }, [stylePhase]);
  useEffect(() => { styleTicksRef.current = styleTicks; }, [styleTicks]);
  useEffect(() => { tubeMultiplierRef.current = tubeMultiplier; }, [tubeMultiplier]);
  useEffect(() => { trickAirborneRef.current = trickAirborne; }, [trickAirborne]);
  useEffect(() => { slipstreamTicksRef.current = slipstreamTicks; }, [slipstreamTicks]);
  useEffect(() => { slipstreamActiveRef.current = slipstreamActive; }, [slipstreamActive]);
  useEffect(() => { barrelActiveRef.current = barrelActive; }, [barrelActive]);
  useEffect(() => { barrelHoldTicksRef.current = barrelHoldTicks; }, [barrelHoldTicks]);
  useEffect(() => { diffStageRef.current = diffStage; }, [diffStage]);
  useEffect(() => { activeDailyChallengeRef.current = activeDailyChallenge; }, [activeDailyChallenge]);
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'surf') return;

    const checkMilestones = (currentScore: number) => {
      const milestones = MILESTONES.surf;
      for (const m of milestones) {
        if (currentScore >= m && !milestoneReachedRef.current.has(m)) {
          milestoneReachedRef.current.add(m);
          setMilestoneMsg(`🏄 Milestone: ${m} pts!`);
          setTimeout(() => setMilestoneMsg(''), FEEDBACK.MILESTONE_TOAST_MS);
          triggerAudioHook(AUDIO_HOOKS.surf.STAGE_UP, 320);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    };

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;
      const surfModifier = activeDailyChallengeRef.current?.mode === 'surf'
        ? activeDailyChallengeRef.current.modifierId
        : null;

      // Difficulty stage
      const stage = tickRef.current >= STAGE3_TICK ? 3 : tickRef.current >= STAGE2_TICK ? 2 : 1;
      if (stage !== diffStageRef.current) {
        diffStageRef.current = stage;
        setDiffStage(stage as 1 | 2 | 3);
        setMessage(stage === 2 ? '🌊 Wave picking up speed!' : '🌊🌊 Storm conditions!');
        triggerAudioHook(AUDIO_HOOKS.surf.STAGE_UP, 500);
        setTimeout(() => setMessage(''), FEEDBACK.STAGE_MESSAGE_MS);
      }

      const barrelBonus = barrelActiveRef.current ? SURF.BARREL_MULTIPLIER : tubeMultiplierRef.current;
      // Score tick
      setScore((c) => {
        const next = c + barrelBonus;
        checkMilestones(next);
        return next;
      });

      // Slow motion countdown (every ~8 ticks ≈ 400ms)
      if (slowMotionSeconds > 0 && tickRef.current % SLOW_MOTION_TICK_DIVISOR === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      let stageSpeed = stage === 3 ? SURF.WAVE_SPEED_S3 : stage === 2 ? SURF.WAVE_SPEED_S2 : SURF.WAVE_SPEED_S1;
      if (surfModifier === 'squall-lines') stageSpeed += 0.002;
      const speed = slowMotionSeconds > 0 ? stageSpeed * SLOW_MOTION_SPEED_MULT : stageSpeed;

      // Barrel mechanic: holding sweet zone
      const inSweet = surferXRef.current > SURF.SWEET_ZONE_LO && surferXRef.current < SURF.SWEET_ZONE_HI;
      if (inSweet && !trickAirborneRef.current && !barrelActiveRef.current) {
        const newHold = barrelHoldTicksRef.current + 1;
        barrelHoldTicksRef.current = newHold;
        setBarrelHoldTicks(newHold);
        if (newHold >= SURF.BARREL_HOLD_TICKS) {
          barrelActiveRef.current = true;
          setBarrelActive(true);
          runSummaryRef.current = { ...runSummaryRef.current, barrelRides: (runSummaryRef.current.barrelRides ?? 0) + 1 };
          setMessage('🛢 BARREL! 3× score for 3 seconds!');
          triggerAudioHook(AUDIO_HOOKS.surf.BARREL, 350);
          if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          if (barrelTimerRef.current) clearTimeout(barrelTimerRef.current);
          barrelTimerRef.current = setTimeout(() => {
            barrelActiveRef.current = false;
            setBarrelActive(false);
            barrelHoldTicksRef.current = 0;
            setBarrelHoldTicks(0);
            setMessage('');
          }, SURF.BARREL_DURATION_TICKS * TICK_MS);
        }
      } else if (!inSweet && !barrelActiveRef.current) {
        barrelHoldTicksRef.current = 0;
        setBarrelHoldTicks(0);
      }

      // Stage-based spawn interval
      let spawnInterval = stage === 3 ? SURF.ZONE_SPAWN_S3 : stage === 2 ? SURF.ZONE_SPAWN_S2 : SURF.ZONE_SPAWN_S1;
      let { min: wMin, max: wMax } = stage === 3 ? SURF.ZONE_WIDTH_S3 : stage === 2 ? SURF.ZONE_WIDTH_S2 : SURF.ZONE_WIDTH_S1;
      if (surfModifier === 'squall-lines') {
        spawnInterval = Math.max(18, spawnInterval - 8);
        wMin += 0.02;
        wMax += 0.025;
      }

      // Move / spawn whitewater zones
      setWaveZones((current) => {
        const moved = current
          .map((z) => ({ ...z, x: z.x - speed }))
          .filter((z) => z.x + z.width > 0);
        if (tickRef.current % (slowMotionSeconds > 0 ? Math.floor(spawnInterval / SLOW_MOTION_SPEED_MULT) : spawnInterval) === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: 1.0,
            width: wMin + Math.random() * (wMax - wMin),
          });
        }
        return moved;
      });

      // Wave animation phase
      surfWavePhase.current += 0.04;
      if (surfModifier === 'drift-current') {
        const drift = Math.sin(tickRef.current / 18) * 0.0055;
        const nextX = clamp(surferXRef.current + drift, 0.05, 0.95);
        surferXRef.current = nextX;
        setSurferX(nextX);
      }

      // Check collision: surfer at surferXRef.current hits a zone?
      setWaveZones((zones) => {
        const sx = surferXRef.current;
        const hit = zones.find((z) => sx > z.x && sx < z.x + z.width);
        // Near-miss feedback
        const nearMiss = !hit && zones.find((z) => (
          Math.abs(sx - z.x) < SURF.NEAR_MISS_THRESHOLD || Math.abs(sx - (z.x + z.width)) < SURF.NEAR_MISS_THRESHOLD
        ));
        if (nearMiss && Date.now() - recentSurfNearMissRef.current > 350) {
          recentSurfNearMissRef.current = Date.now();
          setMessage('⚠️ Close call!');
          triggerAudioHook(AUDIO_HOOKS.surf.NEAR_MISS, 260);
          if (!reducedMotion) void Haptics.selectionAsync();
        }
        if (hit && !trickAirborneRef.current) {
          if (tickRef.current < surfHitCooldownRef.current) return zones;
          surfHitCooldownRef.current = tickRef.current + SURF.HIT_COOLDOWN_TICKS;
          if (shields > 0) {
            setShields((c) => c - 1);
            setMessage('Whitewater! Shield absorbed it!');
            setHitFlash(true);
            triggerAudioHook(AUDIO_HOOKS.surf.HIT, 260);
            setTimeout(() => setHitFlash(false), FEEDBACK.HIT_FLASH_MS);
            if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return zones.filter((z) => z.id !== hit.id);
          }
          // Wipeout
          isPlayingRef.current = false;
          setIsPlaying(false);
          setHitFlash(true);
          triggerAudioHook(AUDIO_HOOKS.surf.HIT, 260);
          setTimeout(() => setHitFlash(false), FEEDBACK.FATAL_FLASH_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setRunSummary({ ...runSummaryRef.current });
          setBestScores((c) => ({ ...c, surf: Math.max(c.surf, score) }));
        }
        return zones;
      });

      // Sweet zone multiplier (barrel overrides)
      if (!barrelActiveRef.current) {
        const nextMultiplier = inSweet ? SURF.TUBE_MULTIPLIER_BONUS : 1;
        tubeMultiplierRef.current = nextMultiplier;
        setTubeMultiplier(nextMultiplier);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, selectedMode, slowMotionSeconds, shields, trickAirborne, score, reducedMotion]);

  // ══════════════════════════════════════════════════════════════════════════
  //  SKATE GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'skate') return;

    const challengeModifier = activeDailyChallengeRef.current?.mode === 'skate'
      ? activeDailyChallengeRef.current.modifierId
      : null;
    const GRAVITY = challengeModifier === 'low-gravity' ? SKATE.GRAVITY * 0.8 : SKATE.GRAVITY;
    const FRICTION = SKATE.FRICTION;
    const PIPE_RADIUS = SKATE.PIPE_RADIUS;

    const checkMilestones = (currentScore: number) => {
      for (const m of MILESTONES.skate) {
        if (currentScore >= m && !milestoneReachedRef.current.has(m)) {
          milestoneReachedRef.current.add(m);
          setMilestoneMsg(`🛹 Milestone: ${m} pts!`);
          setTimeout(() => setMilestoneMsg(''), FEEDBACK.MILESTONE_TOAST_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    };

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;

      // Difficulty stage
      const stage = tickRef.current >= STAGE3_TICK ? 3 : tickRef.current >= STAGE2_TICK ? 2 : 1;
      if (stage !== diffStageRef.current) {
        diffStageRef.current = stage;
        setDiffStage(stage as 1 | 2 | 3);
        setMessage(stage === 2 ? '🛹 Crowd going wild!' : '🛹 EXPERT MODE!');
        triggerAudioHook(AUDIO_HOOKS.skate.STAGE_UP, 500);
        setTimeout(() => setMessage(''), FEEDBACK.STAGE_MESSAGE_MS);
      }

      const trickPool = stage === 3 ? SKATE.TRICK_NAMES_S3 : stage === 2 ? SKATE.TRICK_NAMES_S2 : SKATE.TRICK_NAMES_S1;

      setScore((c) => {
        const next = c + 1;
        checkMilestones(next);
        return next;
      });

      if (slowMotionSeconds > 0 && tickRef.current % SLOW_MOTION_TICK_DIVISOR === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      // Style Meter: phase progresses pump→airborne→tricked→land
      if (stylePhaseRef.current > 0) {
        styleTicksRef.current += 1;
        setStyleTicks((s) => s + 1);
        if (styleTicksRef.current > SKATE.STYLE_WINDOW_TICKS) {
          // Timed out — reset style meter
          stylePhaseRef.current = 0;
          setStylePhase(0);
          styleTicksRef.current = 0;
          setStyleTicks(0);
        }
      }

      const curAngle = skateAngleRef.current;
      const curSpeed = skateSpeedRef.current;
      const airborne = skateAirborneRef.current;

      if (airborne) {
        const sm = slowMotionSeconds > 0 ? SLOW_MOTION_SPEED_MULT : 1;
        const newSpeed = curSpeed - GRAVITY * Math.sign(curAngle) * sm;
        const newAngle = curAngle + newSpeed * sm;
        skateSpeedRef.current = newSpeed;
        skateAngleRef.current = newAngle;
        setSkateSpeed(newSpeed);
        setSkateAngle(newAngle);

        // Land when angle crosses 0
        if (Math.abs(newAngle) < SKATE.LAND_ANGLE_THRESHOLD && Math.abs(newSpeed) < SKATE.LAND_SPEED_THRESHOLD) {
          skateAirborneRef.current = false;
          setSkateAirborne(false);
          const landBonus = SKATE.LAND_BONUS_PER_SHIELD * activeCharacter.shieldBonus;

          // Style Meter completion: pump(1)→airborne(2)→tricked(3)→land
          if (stylePhaseRef.current === 3) {
            const styleBonus = SKATE.STYLE_BONUS;
            setScore((c) => c + landBonus + styleBonus);
            setMessage(`🎨 STYLE BONUS! +${styleBonus} pts!`);
            triggerAudioHook(AUDIO_HOOKS.skate.STYLE_BONUS, 340);
            runSummaryRef.current = { ...runSummaryRef.current, styleBonuses: (runSummaryRef.current.styleBonuses ?? 0) + 1 };
            if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            setScore((c) => c + landBonus);
            setMessage(`Landed! +${landBonus} pts`);
            triggerAudioHook(AUDIO_HOOKS.skate.LAND, 260);
          }
          runSummaryRef.current = { ...runSummaryRef.current, cleanLandings: (runSummaryRef.current.cleanLandings ?? 0) + 1 };
          if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // Reset style meter after landing
          stylePhaseRef.current = 0;
          setStylePhase(0);
          styleTicksRef.current = 0;
          setStyleTicks(0);
        }
      } else {
        const sm = slowMotionSeconds > 0 ? SLOW_MOTION_SPEED_MULT : 1;
        const newSpeed = (curSpeed - GRAVITY * Math.sin(curAngle) * sm) * FRICTION;
        const newAngle = curAngle + newSpeed * sm;
        skateSpeedRef.current = newSpeed;
        skateAngleRef.current = newAngle;
        setSkateSpeed(newSpeed);
        setSkateAngle(newAngle);

        // Launch off coping
        if (Math.abs(newAngle) > PIPE_RADIUS) {
          if (tickRef.current < skateAirCooldownRef.current) return;
          skateAirCooldownRef.current = tickRef.current + SKATE.AIR_EVENT_COOLDOWN_TICKS;
          skateAirborneRef.current = true;
          setSkateAirborne(true);
          const trick = trickPool[Math.floor(Math.random() * trickPool.length)];
          setSkateTrick(trick);
          setMessage(`Airborne! Tap for ${trick}!`);
          triggerAudioHook(AUDIO_HOOKS.skate.AIR, 260);
          if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          // Style Meter: advance from pump(1) to airborne(2)
          if (stylePhaseRef.current === 1) {
            stylePhaseRef.current = 2;
            setStylePhase(2);
          }
          if (skateTrickTimeoutRef.current) clearTimeout(skateTrickTimeoutRef.current);
          skateTrickTimeoutRef.current = setTimeout(() => setSkateTrick(null), SKATE.TRICK_DISPLAY_MS);
          let railSpawnChance = stage === 3 ? SKATE.RAIL_SPAWN_CHANCE_S3 : stage === 2 ? SKATE.RAIL_SPAWN_CHANCE_S2 : SKATE.RAIL_SPAWN_CHANCE_S1;
          if (challengeModifier === 'rail-jam') railSpawnChance = Math.min(1, railSpawnChance + 0.3);
          if (Math.random() < railSpawnChance) {
            setSkateRails((r) => [
              ...r.slice(-2),
              { id: Date.now(), side: newAngle > 0 ? 'right' : 'left', active: true },
            ]);
          }
        }
      }

      // Rail timeout
      setSkateRails((r) =>
        r.map((rail) => ({ ...rail })).filter((_, i) => i > r.length - 4),
      );
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, selectedMode, slowMotionSeconds, activeCharacter.shieldBonus, reducedMotion]);

  // ══════════════════════════════════════════════════════════════════════════
  //  HACKEY GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'hackey') return;

    const checkMilestones = (currentScore: number) => {
      for (const m of MILESTONES.hackey) {
        if (currentScore >= m && !milestoneReachedRef.current.has(m)) {
          milestoneReachedRef.current.add(m);
          setMilestoneMsg(`🤸 Milestone: ${m} pts!`);
          setTimeout(() => setMilestoneMsg(''), FEEDBACK.MILESTONE_TOAST_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    };

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;
      const challengeModifier = activeDailyChallengeRef.current?.mode === 'hackey'
        ? activeDailyChallengeRef.current.modifierId
        : null;

      if (slowMotionSeconds > 0 && tickRef.current % SLOW_MOTION_TICK_DIVISOR === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      const stage = tickRef.current >= STAGE3_TICK ? 3 : tickRef.current >= STAGE2_TICK ? 2 : 1;
      if (stage !== diffStageRef.current) {
        diffStageRef.current = stage;
        setDiffStage(stage as 1 | 2 | 3);
        setMessage(stage === 2 ? '🤸 Rhythm speeding up!' : '🤸 Final rhythm push!');
        triggerAudioHook(AUDIO_HOOKS.hackey.STAGE_UP, 500);
        setTimeout(() => setMessage(''), FEEDBACK.STAGE_MESSAGE_MS);
      }

      const stageDrain = stage === 3 ? HACKEY.BASE_DRAIN_S3 : stage === 2 ? HACKEY.BASE_DRAIN_S2 : HACKEY.BASE_DRAIN_S1;
      let drain = (slowMotionSeconds > 0 ? SLOW_MOTION_SPEED_MULT : 1) * stageDrain *
        (1 + hackeyCombo * HACKEY.COMBO_DRAIN_FACTOR);
      if (challengeModifier === 'hot-potato') drain *= 1.18;
      const newWindow = hackeyWindowRef.current - drain;

      if (newWindow <= 0) {
        const newMisses = hackeyMissesRef.current + 1;
        hackeyMissesRef.current = newMisses;
        setHackeyMisses(newMisses);
        setHackeyCombo(0);
        setMessage(`Miss! ${HACKEY.MISS_LIMIT - newMisses} chances left`);
        setHitFlash(true);
        triggerAudioHook(AUDIO_HOOKS.hackey.MISS, 280);
        setTimeout(() => setHitFlash(false), FEEDBACK.HIT_FLASH_MS);
        if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        if (newMisses >= HACKEY.MISS_LIMIT) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setRunSummary({ ...runSummaryRef.current });
          setBestScores((c) => ({ ...c, hackey: Math.max(c.hackey, score) }));
          return;
        }

        const nextTarget = Math.floor(Math.random() * HACKEY.TARGET_COUNT);
        hackeyTargetRef.current = nextTarget;
        hackeyWindowRef.current = 1;
        setHackeyTarget(nextTarget);
        setHackeyWindow(1);
      } else {
        hackeyWindowRef.current = newWindow;
        setHackeyWindow(newWindow);
        setScore((c) => {
          const next = c + 1;
          checkMilestones(next);
          return next;
        });
      }

      if (newWindow > 0 && newWindow <= HACKEY.DANGER_WINDOW && Date.now() - recentHackeyDangerRef.current > 450) {
        recentHackeyDangerRef.current = Date.now();
        setMessage('⚠️ Late window!');
        triggerAudioHook(AUDIO_HOOKS.hackey.DANGER, 300);
      }

      // Animate sack position toward target player
      const targetPlayer = HACKEY_PLAYERS[hackeyTargetRef.current];
      const cx = 0.5 + Math.cos(targetPlayer.angle) * 0.35;
      const cy = 0.5 + Math.sin(targetPlayer.angle) * 0.35;
      setHackeySackPos((prev) => ({
        x: prev.x + (cx - prev.x) * HACKEY.SACK_LERP,
        y: prev.y + (cy - prev.y) * HACKEY.SACK_LERP,
      }));
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, selectedMode, slowMotionSeconds, hackeyCombo, score, HACKEY_PLAYERS, reducedMotion]);

  // ══════════════════════════════════════════════════════════════════════════
  //  SKYDIVE GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'skydive') return;

    const checkMilestones = (currentScore: number) => {
      for (const m of MILESTONES.skydive) {
        if (currentScore >= m && !milestoneReachedRef.current.has(m)) {
          milestoneReachedRef.current.add(m);
          setMilestoneMsg(`🪂 Milestone: ${m} pts!`);
          setTimeout(() => setMilestoneMsg(''), FEEDBACK.MILESTONE_TOAST_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    };

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;
      const challengeModifier = activeDailyChallengeRef.current?.mode === 'skydive'
        ? activeDailyChallengeRef.current.modifierId
        : null;
      setScore((c) => {
        const next = c + 1;
        checkMilestones(next);
        return next;
      });

      if (slowMotionSeconds > 0 && tickRef.current % SLOW_MOTION_TICK_DIVISOR === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      // Difficulty stage based on altitude
      setSkyAltitude((a) => {
        const next = Math.max(0, a - 50);
        const altStage = next <= SKYDIVE.ALT_STAGE3 ? 3 : next <= SKYDIVE.ALT_STAGE2 ? 2 : 1;
        if (altStage !== diffStageRef.current) {
          diffStageRef.current = altStage;
          setDiffStage(altStage as 1 | 2 | 3);
          setMessage(altStage === 2 ? '🌩 Wind picking up!' : '⚡ Storm layer — max turbulence!');
          triggerAudioHook(AUDIO_HOOKS.skydive.STAGE_UP, 500);
          setTimeout(() => setMessage(''), FEEDBACK.STAGE_MESSAGE_MS);
        }
        return next;
      });

      const stage = diffStageRef.current;
      const GATE_GAP = (stage === 3 ? SKYDIVE.GATE_GAP_S3 : stage === 2 ? SKYDIVE.GATE_GAP_S2 : SKYDIVE.GATE_GAP_S1)
        + activeCharacter.controlBonus * SKYDIVE.CONTROL_GAP_BONUS_MULT;
      let stageSpeed = stage === 3 ? SKYDIVE.SPEED_S3 : stage === 2 ? SKYDIVE.SPEED_S2 : SKYDIVE.SPEED_S1;
      if (challengeModifier === 'ring-rush') stageSpeed += 0.0015;
      const speed = stageSpeed * (slowMotionSeconds > 0 ? SLOW_MOTION_SPEED_MULT : 1);
      let gateSpawn = stage === 3 ? SKYDIVE.GATE_SPAWN_S3 : stage === 2 ? SKYDIVE.GATE_SPAWN_S2 : SKYDIVE.GATE_SPAWN_S1;
      let cloudSpawn = stage === 3 ? SKYDIVE.CLOUD_SPAWN_S3 : stage === 2 ? SKYDIVE.CLOUD_SPAWN_S2 : SKYDIVE.CLOUD_SPAWN_S1;
      if (challengeModifier === 'ring-rush') gateSpawn = Math.max(16, gateSpawn - 6);
      if (challengeModifier === 'cloudburst') cloudSpawn = Math.max(14, cloudSpawn - 8);

      setSkyGates((gates) => {
        const moved = gates
          .map((g) => ({ ...g, y: g.y + speed }))
          .filter((g) => g.y < 1.15);
        if (tickRef.current % gateSpawn === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            y: -0.1,
            gapX: 0.1 + Math.random() * 0.6,
          });
        }
        return moved;
      });

      setSkyClouds((clouds) => {
        const moved = clouds
          .map((c) => ({ ...c, y: c.y + speed * 0.5 }))
          .filter((c) => c.y < 1.1);
        if (tickRef.current % cloudSpawn === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: Math.random(),
            y: -0.05,
            r:
              SKYDIVE.CLOUD_RADIUS_MIN
              + Math.random() * (SKYDIVE.CLOUD_RADIUS_MAX - SKYDIVE.CLOUD_RADIUS_MIN)
              + (challengeModifier === 'cloudburst' ? 0.015 : 0),
          });
        }
        return moved;
      });
      if (challengeModifier === 'jetstream') {
        const drift = Math.cos(tickRef.current / 14) * 0.006;
        const nextX = clamp(skyXRef.current + drift, 0.05, 0.95);
        skyXRef.current = nextX;
        setSkyX(nextX);
      }

      // Collision checks — gate
      setSkyGates((gates) => {
        const sx = skyXRef.current;
        const hit = gates.find((g) => {
          if (g.y < SKYDIVE.GATE_PASS_Y_MIN || g.y > SKYDIVE.GATE_PASS_Y_MAX) return false;
          const leftWall = g.gapX - GATE_GAP / 2;
          const rightWall = g.gapX + GATE_GAP / 2;
          return sx < leftWall || sx > rightWall;
        });
        const clearedGate = gates.find((g) => g.y > SKYDIVE.GATE_PASS_Y_MIN && g.y < SKYDIVE.GATE_PASS_Y_MAX &&
          sx >= g.gapX - GATE_GAP / 2 && sx <= g.gapX + GATE_GAP / 2);
        const dangerGate = !hit && gates.find((g) => g.y > SKYDIVE.GATE_PASS_Y_MIN && g.y < SKYDIVE.GATE_PASS_Y_MAX && (
          Math.abs(sx - (g.gapX - GATE_GAP / 2)) < SKYDIVE.DANGER_CENTER_MARGIN
          || Math.abs(sx - (g.gapX + GATE_GAP / 2)) < SKYDIVE.DANGER_CENTER_MARGIN
        ));
        if (dangerGate && Date.now() - recentSkydiveDangerRef.current > 350) {
          recentSkydiveDangerRef.current = Date.now();
          setMessage('⚠️ Tight gap!');
          triggerAudioHook(AUDIO_HOOKS.skydive.DANGER, 260);
          if (!reducedMotion) void Haptics.selectionAsync();
        }
        if (clearedGate) {
          const isPerfect = Math.abs(sx - clearedGate.gapX) <= SKYDIVE.PERFECT_CENTER_MARGIN;
          const gateScore = (isPerfect ? SKYDIVE.PERFECT_GATE_SCORE : SKYDIVE.GATE_SCORE)
            + (challengeModifier === 'ring-rush' ? 10 : 0);
          setSkyGatesCleared((c) => {
            const next = c + 1;
            runSummaryRef.current = { ...runSummaryRef.current, gatesCleared: next };
            return next;
          });
          setScore((c) => c + gateScore);
          if (isPerfect) {
            runSummaryRef.current = { ...runSummaryRef.current, perfectThreads: (runSummaryRef.current.perfectThreads ?? 0) + 1 };
            setLastGatePerfect(true);
            setMessage(`🎯 Perfect thread! +${gateScore}`);
            triggerAudioHook(AUDIO_HOOKS.skydive.GATE_PERFECT, 220);
            setTimeout(() => setLastGatePerfect(false), 600);
          } else {
            triggerAudioHook(AUDIO_HOOKS.skydive.GATE_CLEAR, 180);
          }
          if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        if (hit) {
          if (shields > 0) {
            setShields((s) => s - 1);
            setMessage('Clipped the gate! Shield saved you!');
            setHitFlash(true);
            triggerAudioHook(AUDIO_HOOKS.skydive.HIT, 260);
            setTimeout(() => setHitFlash(false), FEEDBACK.HIT_FLASH_MS);
            if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return gates.filter((g) => g.id !== hit.id);
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
          setHitFlash(true);
          triggerAudioHook(AUDIO_HOOKS.skydive.HIT, 260);
          setTimeout(() => setHitFlash(false), FEEDBACK.FATAL_FLASH_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setRunSummary({ ...runSummaryRef.current });
          setBestScores((b) => ({ ...b, skydive: Math.max(b.skydive, score) }));
        }
        return gates;
      });

      // Cloud turbulence hit
      setSkyClouds((clouds) => {
        const sx = skyXRef.current;
        const hit = clouds.find((c) => {
          const dx = sx - c.x;
          const dy = 0.82 - c.y;
          return Math.sqrt(dx * dx + dy * dy) < c.r;
        });
        if (hit) {
          if (shields > 0) {
            setShields((s) => s - 1);
            setMessage('Turbulence! Shield absorbed!');
            setHitFlash(true);
            triggerAudioHook(AUDIO_HOOKS.skydive.HIT, 260);
            setTimeout(() => setHitFlash(false), FEEDBACK.HIT_FLASH_MS);
            if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return clouds.filter((c) => c.id !== hit.id);
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
          setHitFlash(true);
          triggerAudioHook(AUDIO_HOOKS.skydive.HIT, 260);
          setTimeout(() => setHitFlash(false), FEEDBACK.FATAL_FLASH_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setRunSummary({ ...runSummaryRef.current });
          setBestScores((b) => ({ ...b, skydive: Math.max(b.skydive, score) }));
        }
        return clouds;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacter.controlBonus, isPlaying, selectedMode, slowMotionSeconds, shields, score, reducedMotion]);

  // ══════════════════════════════════════════════════════════════════════════
  //  BOX RACE GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'boxrace') return;

    const BOX_COLORS = ['#FF4444', '#FF9900', '#CC44FF', '#FF66AA', '#44DDAA'];
    const COLLISION_THRESHOLD = BOXRACE.COLLISION_THRESHOLD_BASE - activeCharacter.controlBonus * BOXRACE.COLLISION_CONTROL_BONUS_MULT;

    const checkMilestones = (currentScore: number) => {
      for (const m of MILESTONES.boxrace) {
        if (currentScore >= m && !milestoneReachedRef.current.has(m)) {
          milestoneReachedRef.current.add(m);
          setMilestoneMsg(`📦 Milestone: ${m} pts!`);
          setTimeout(() => setMilestoneMsg(''), FEEDBACK.MILESTONE_TOAST_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    };

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;
      const challengeModifier = activeDailyChallengeRef.current?.mode === 'boxrace'
        ? activeDailyChallengeRef.current.modifierId
        : null;

      if (slowMotionSeconds > 0 && tickRef.current % SLOW_MOTION_TICK_DIVISOR === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      // Difficulty stage
      const stage = tickRef.current >= STAGE3_TICK ? 3 : tickRef.current >= STAGE2_TICK ? 2 : 1;
      if (stage !== diffStageRef.current) {
        diffStageRef.current = stage;
        setDiffStage(stage as 1 | 2 | 3);
        setMessage(stage === 2 ? '📦 Rivals getting aggressive!' : '📦 DANGER ZONE!');
        triggerAudioHook(AUDIO_HOOKS.boxrace.STAGE_UP, 500);
        setTimeout(() => setMessage(''), FEEDBACK.STAGE_MESSAGE_MS);
      }

      let boxSpawn = stage === 3 ? BOXRACE.BOX_SPAWN_S3 : stage === 2 ? BOXRACE.BOX_SPAWN_S2 : BOXRACE.BOX_SPAWN_S1;
      if (challengeModifier === 'turbo-grid') boxSpawn = Math.max(14, boxSpawn - 6);

      setRacerSpeed((s) => {
        const next = Math.min(s + BOXRACE.SPEED_ACCEL, BOXRACE.MAX_SPEED);
        runSummaryRef.current = { ...runSummaryRef.current, maxSpeed: next };
        return next;
      });
      const baseSpeed = slowMotionSeconds > 0 ? racerSpeed * SLOW_MOTION_SPEED_MULT : racerSpeed;
      if (challengeModifier === 'sidewind') {
        const drift = Math.sin(tickRef.current / 15) * 0.006;
        const nextX = clamp(racerXRef.current + drift, 0.08, 0.92);
        racerXRef.current = nextX;
        setRacerX(nextX);
      }

      // Slipstream mechanic: stay close behind a rival for bonus speed
      setRaceBoxes((boxes) => {
        const rx = racerXRef.current;
        const slipTarget = boxes.find((b) =>
          Math.abs(rx - b.x) <= BOXRACE.SLIPSTREAM_DIST && b.y > BOXRACE.SLIPSTREAM_Y_MIN && b.y < BOXRACE.SLIPSTREAM_Y_MAX,
        );
        if (slipTarget) {
          const newTicks = slipstreamTicksRef.current + 1;
          slipstreamTicksRef.current = newTicks;
          setSlipstreamTicks(newTicks);
          if (newTicks % 10 === 0) triggerAudioHook(AUDIO_HOOKS.boxrace.SLIPSTREAM_CHARGE, 100);
          if (newTicks >= BOXRACE.SLIPSTREAM_TICKS && !slipstreamActiveRef.current) {
            slipstreamActiveRef.current = true;
            setSlipstreamActive(true);
            setScore((c) => c + BOXRACE.SLIPSTREAM_SCORE);
            setMessage(`💨 SLIPSTREAM! +${BOXRACE.SLIPSTREAM_SCORE} speed burst!`);
            triggerAudioHook(AUDIO_HOOKS.boxrace.SLIPSTREAM_BURST, 300);
            runSummaryRef.current = { ...runSummaryRef.current, slipstreams: (runSummaryRef.current.slipstreams ?? 0) + 1 };
            if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setTimeout(() => {
              slipstreamActiveRef.current = false;
              setSlipstreamActive(false);
              slipstreamTicksRef.current = 0;
              setSlipstreamTicks(0);
            }, BOXRACE.SLIPSTREAM_ACTIVE_MS);
          }
        } else {
          if (!slipstreamActiveRef.current) {
            slipstreamTicksRef.current = 0;
            setSlipstreamTicks(0);
          }
        }

        const moved = boxes
          .map((b) => ({ ...b, y: b.y + (baseSpeed + b.speed) }))
          .filter((b) => b.y < 1.05);
        if (tickRef.current % boxSpawn === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: 0.1 + Math.random() * 0.7,
            y: -0.08,
            speed:
              BOXRACE.RIVAL_SPEED_MIN
              + Math.random() * (BOXRACE.RIVAL_SPEED_MAX - BOXRACE.RIVAL_SPEED_MIN)
              + (challengeModifier === 'turbo-grid' ? 0.002 : 0),
            color: BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)],
          });
        }
        return moved;
      });

      setRaceBoosts((boosts) => {
        const moved = boosts
          .map((b) => ({ ...b, y: b.y + baseSpeed }))
          .filter((b) => b.y < 1.05);
        const boostSpawn = challengeModifier === 'boost-parade' ? Math.max(24, BOXRACE.BOOST_SPAWN - 22) : BOXRACE.BOOST_SPAWN;
        if (tickRef.current % boostSpawn === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: 0.15 + Math.random() * 0.65,
            y: -0.08,
          });
        }
        return moved;
      });

      setScore((c) => {
        const next = c + 1;
        checkMilestones(next);
        return next;
      });

      setRaceBoxes((boxes) => {
        const rx = racerXRef.current;
        const hit = boxes.find((b) => {
          const dx = Math.abs(rx - b.x);
          return dx < COLLISION_THRESHOLD && b.y > BOXRACE.COLLISION_Y_MIN && b.y < BOXRACE.COLLISION_Y_MAX;
        });
        const danger = !hit && boxes.find((b) => {
          const dx = Math.abs(rx - b.x);
          return dx < COLLISION_THRESHOLD + BOXRACE.DANGER_X_MARGIN && b.y > BOXRACE.COLLISION_Y_MIN && b.y < BOXRACE.COLLISION_Y_MAX;
        });
        if (danger && Date.now() - recentBoxDangerRef.current > 350) {
          recentBoxDangerRef.current = Date.now();
          setMessage('⚠️ Incoming rival!');
          triggerAudioHook(AUDIO_HOOKS.boxrace.DANGER, 260);
          if (!reducedMotion) void Haptics.selectionAsync();
        }
        if (hit) {
          if (shields > 0) {
            setShields((s) => s - 1);
            setMessage('Crash! Shield absorbed it!');
            setHitFlash(true);
            triggerAudioHook(AUDIO_HOOKS.boxrace.HIT, 260);
            setTimeout(() => setHitFlash(false), FEEDBACK.HIT_FLASH_MS);
            if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return boxes.filter((b) => b.id !== hit.id);
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
          setHitFlash(true);
          triggerAudioHook(AUDIO_HOOKS.boxrace.HIT, 260);
          setTimeout(() => setHitFlash(false), FEEDBACK.FATAL_FLASH_MS);
          if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setRunSummary({ ...runSummaryRef.current });
          setBestScores((b) => ({ ...b, boxrace: Math.max(b.boxrace, score) }));
        }
        return boxes;
      });

      setRaceBoosts((boosts) => {
        const rx = racerXRef.current;
        const hit = boosts.find((b) => {
          const dx = Math.abs(rx - b.x);
          return dx < BOXRACE.BOOST_PICKUP_THRESHOLD && b.y > BOXRACE.BOOST_PICKUP_Y_MIN && b.y < BOXRACE.BOOST_PICKUP_Y_MAX;
        });
        if (hit) {
          setScore((c) => c + BOXRACE.BOOST_SCORE);
          setMessage(`⚡ Boost! +${BOXRACE.BOOST_SCORE}`);
          triggerAudioHook(AUDIO_HOOKS.boxrace.BOOST, 220);
          runSummaryRef.current = { ...runSummaryRef.current, boostsCollected: (runSummaryRef.current.boostsCollected ?? 0) + 1 };
          if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        return hit ? boosts.filter((b) => b.id !== hit.id) : boosts;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacter.controlBonus, isPlaying, selectedMode, slowMotionSeconds, shields, score, racerSpeed, reducedMotion]);

  const resetGameState = useCallback((mode: GameModeKey) => {
    tickRef.current = 0;
    rewardedAtGameOverRef.current = false;
    setScore(0);
    setMessage('');
    setRunEndMeta(null);
    setSlowMotionSeconds(0);
    // Surf
    setSurferX(0.5);
    surferXRef.current = 0.5;
    setWaveZones([]);
    setTrickAirborne(false);
    setTubeMultiplier(1);
    tubeMultiplierRef.current = 1;
    surfWavePhase.current = 0;
    // Skate
    setSkateAngle(0);
    setSkateSpeed(0.04);
    setSkateAirborne(false);
    setSkateTrick(null);
    setSkateRails([]);
    skateAngleRef.current = 0;
    skateSpeedRef.current = 0.04;
    skateAirborneRef.current = false;
    // Hackey
    const firstTarget = Math.floor(Math.random() * HACKEY.TARGET_COUNT);
    setHackeyTarget(firstTarget);
    setHackeyWindow(1);
    setHackeyMisses(0);
    setHackeyCombo(0);
    hackeyTargetRef.current = firstTarget;
    hackeyWindowRef.current = 1;
    hackeyMissesRef.current = 0;
    setHackeySackPos({ x: 0.5, y: 0.5 });
    // Skydive
    setSkyX(0.5);
    skyXRef.current = 0.5;
    setSkyGates([]);
    setSkyClouds([]);
    setSkyAltitude(10000);
    setSkyGatesCleared(0);
    // Box Race
    setRacerX(0.5);
    racerXRef.current = 0.5;
    setRaceBoxes([]);
    setRaceBoosts([]);
    setRacerSpeed(0.008);
    // Mastery / feedback state
    setBarrelHoldTicks(0);
    setBarrelActive(false);
    barrelActiveRef.current = false;
    barrelHoldTicksRef.current = 0;
    setStylePhase(0);
    setStyleTicks(0);
    stylePhaseRef.current = 0;
    styleTicksRef.current = 0;
    setLastTapPerfect(false);
    setLastGatePerfect(false);
    setSlipstreamTicks(0);
    setSlipstreamActive(false);
    slipstreamTicksRef.current = 0;
    slipstreamActiveRef.current = false;
    setHitFlash(false);
    setMilestoneMsg('');
    milestoneReachedRef.current = new Set();
    setRunSummary({});
    runSummaryRef.current = {};
    setDiffStage(1);
    diffStageRef.current = 1;
  }, []);

  const startGame = useCallback((mode: GameModeKey, dailyMode = false) => {
    resetGameState(mode);
    runStartBestRef.current = bestScores[mode];
    const challenge = dailyMode ? dailyChallenges[mode] : null;
    setActiveDailyChallenge(challenge);
    setSelectedMode(mode);
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
    isPlayingRef.current = true;
    hasRunStartedRef.current = true;
    setScreen('game');
    if (controlsTipTimeoutRef.current) clearTimeout(controlsTipTimeoutRef.current);
    setShowControlsTip(true);
    controlsTipTimeoutRef.current = setTimeout(() => setShowControlsTip(false), CONTROLS_TIP_DURATION_MS);
    if (challenge) {
      setMessage(`${challenge.badge} Daily: ${challenge.modifierName} • ${challenge.objectiveText}`);
    }
  }, [resetGameState, activeCharacter.shieldBonus, bestScores, dailyChallenges]);

  const restartGame = useCallback(() => {
    resetGameState(selectedMode);
    runStartBestRef.current = bestScores[selectedMode];
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
    isPlayingRef.current = true;
    hasRunStartedRef.current = true;
    if (controlsTipTimeoutRef.current) clearTimeout(controlsTipTimeoutRef.current);
    setShowControlsTip(true);
    controlsTipTimeoutRef.current = setTimeout(() => setShowControlsTip(false), CONTROLS_TIP_DURATION_MS);
    if (activeDailyChallengeRef.current) {
      setMessage(`${activeDailyChallengeRef.current.badge} Daily retry: ${activeDailyChallengeRef.current.objectiveText}`);
    }
  }, [resetGameState, selectedMode, activeCharacter.shieldBonus, bestScores]);

  // ─── Surf: PanResponder ───────────────────────────────────────────────────
  const surfPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => selectedMode === 'surf' && isPlayingRef.current,
    onMoveShouldSetPanResponder: () => selectedMode === 'surf' && isPlayingRef.current,
    onPanResponderGrant: () => {
      surfDragOriginRef.current = surferXRef.current;
    },
    onPanResponderMove: (_, gs) => {
      if (!isPlayingRef.current) return;
      const dragX = applyGestureDeadzone(gs.dx);
      const newX = clamp(
        surfDragOriginRef.current
          + dragX / SCREEN_W * Math.max(0.36, SURF_DRAG_SENSITIVITY - activeCharacter.controlBonus) * sensitivityRef.current,
        0.05,
        0.95,
      );
      surferXRef.current = newX;
      setSurferX(newX);
    },
    onPanResponderRelease: (_, gs) => {
      // Flick up = trick aerial
      if (gs.vy < FLICK_TRICK_VELOCITY && !trickAirborne) {
        setTrickAirborne(true);
        setMessage('Aerial trick! 🤙');
        const aerialBonus = activeDailyChallengeRef.current?.mode === 'surf'
          && activeDailyChallengeRef.current.modifierId === 'air-festival'
          ? 40
          : 0;
        setScore((c) => c + SURF.AERIAL_SCORE + aerialBonus);
        runSummaryRef.current = { ...runSummaryRef.current, aerials: (runSummaryRef.current.aerials ?? 0) + 1 };
        triggerAudioHook(AUDIO_HOOKS.surf.AERIAL, 260);
        if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => {
          setTrickAirborne(false);
          setMessage('');
        }, SURF.AERIAL_DURATION_MS);
      }
    },
  }), [activeCharacter.controlBonus, selectedMode, trickAirborne, reducedMotion, triggerAudioHook]);

  // ─── Skate: PanResponder ──────────────────────────────────────────────────
  const skatePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => selectedMode === 'skate' && isPlayingRef.current,
    onMoveShouldSetPanResponder: () => selectedMode === 'skate' && isPlayingRef.current,
    onPanResponderRelease: (_, gs) => {
      if (!isPlayingRef.current) return;
      if (skateAirborneRef.current) {
        // Trick tap while airborne — advance style meter to tricked(3)
        const trickScore = activeDailyChallengeRef.current?.mode === 'skate'
          && activeDailyChallengeRef.current.modifierId === 'trick-frenzy'
          ? SKATE.TRICK_SCORE + 50
          : SKATE.TRICK_SCORE;
        setScore((c) => c + trickScore);
        setMessage(`Trick confirmed! +${trickScore}`);
        triggerAudioHook(AUDIO_HOOKS.skate.TRICK_CONFIRM, 220);
        setSkateTrick(null);
        if (stylePhaseRef.current === 2) {
          stylePhaseRef.current = 3;
          setStylePhase(3);
        }
        if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        // Pump: swipe left/right gives angular velocity
        const dragX = applyGestureDeadzone(gs.dx);
        if (dragX === 0) return;
        const push = -dragX / SCREEN_W * Math.max(0.1, SKATE_PUMP_SENSITIVITY - activeCharacter.controlBonus * 0.35) * sensitivityRef.current;
        skateSpeedRef.current = clamp(skateSpeedRef.current + push, -0.12, 0.12);
        setSkateSpeed(skateSpeedRef.current);
        triggerAudioHook(AUDIO_HOOKS.skate.PUMP, 180);
        // Style Meter: pump starts the sequence (phase idle→pump)
        if (stylePhaseRef.current === 0) {
          stylePhaseRef.current = 1;
          setStylePhase(1);
          styleTicksRef.current = 0;
          setStyleTicks(0);
        }
        if (!reducedMotion) void Haptics.selectionAsync();
      }
    },
  }), [activeCharacter.controlBonus, selectedMode, reducedMotion, triggerAudioHook]);

  // ─── Skydive: PanResponder ────────────────────────────────────────────────
  const skydivePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => selectedMode === 'skydive' && isPlayingRef.current,
    onMoveShouldSetPanResponder: () => selectedMode === 'skydive' && isPlayingRef.current,
    onPanResponderGrant: () => {
      skyDragOriginRef.current = skyXRef.current;
    },
    onPanResponderMove: (_, gs) => {
      if (!isPlayingRef.current) return;
      const dragX = applyGestureDeadzone(gs.dx);
      const newX = clamp(
        skyDragOriginRef.current
          + dragX / SCREEN_W * Math.max(0.1, SKY_DRAG_SENSITIVITY - activeCharacter.controlBonus * 0.5) * sensitivityRef.current,
        0.05,
        0.95,
      );
      skyXRef.current = newX;
      setSkyX(newX);
    },
  }), [activeCharacter.controlBonus, selectedMode]);

  // ─── Box Race: PanResponder ───────────────────────────────────────────────
  const boxRacePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => selectedMode === 'boxrace' && isPlayingRef.current,
    onMoveShouldSetPanResponder: () => selectedMode === 'boxrace' && isPlayingRef.current,
    onPanResponderGrant: () => {
      raceDragOriginRef.current = racerXRef.current;
    },
    onPanResponderMove: (_, gs) => {
      if (!isPlayingRef.current) return;
      const dragX = applyGestureDeadzone(gs.dx);
      const newX = clamp(
        raceDragOriginRef.current
          + dragX / SCREEN_W * Math.max(0.12, BOX_DRAG_SENSITIVITY - activeCharacter.controlBonus * 0.45) * sensitivityRef.current,
        0.08,
        0.92,
      );
      racerXRef.current = newX;
      setRacerX(newX);
    },
  }), [activeCharacter.controlBonus, selectedMode]);

  // ─── Hackey: tap a player ─────────────────────────────────────────────────
  const hackeyTap = useCallback((playerId: number) => {
    if (!isPlayingRef.current) return;
    if (playerId === hackeyTargetRef.current) {
      const perfectWindow = activeDailyChallengeRef.current?.mode === 'hackey'
        && activeDailyChallengeRef.current.modifierId === 'focus-ring'
        ? HACKEY.PERFECT_WINDOW + 0.08
        : HACKEY.PERFECT_WINDOW;
      const isPerfect = hackeyWindowRef.current > perfectWindow;
      const perfectBonus = activeDailyChallengeRef.current?.mode === 'hackey'
        && activeDailyChallengeRef.current.modifierId === 'focus-ring'
        ? HACKEY.PERFECT_BONUS + 4
        : HACKEY.PERFECT_BONUS;
      const bonus = Math.floor(hackeyWindowRef.current * 50) + hackeyCombo * 5 + (isPerfect ? perfectBonus : 0);
      setScore((c) => c + bonus);
      const nextCombo = hackeyCombo + 1;
      setHackeyCombo(nextCombo);
      runSummaryRef.current = { ...runSummaryRef.current, maxCombo: Math.max(runSummaryRef.current.maxCombo ?? 0, nextCombo) };
      if (isPerfect) {
        runSummaryRef.current = { ...runSummaryRef.current, perfectTaps: (runSummaryRef.current.perfectTaps ?? 0) + 1 };
        setLastTapPerfect(true);
        setMessage(`⚡ PERFECT! +${bonus} (combo x${nextCombo})`);
        triggerAudioHook(AUDIO_HOOKS.hackey.TAP_PERFECT, 220);
        setTimeout(() => setLastTapPerfect(false), 500);
        if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else {
        setMessage(`Nice! +${bonus} (combo x${nextCombo})`);
        triggerAudioHook(AUDIO_HOOKS.hackey.TAP_GOOD, 200);
        if (!reducedMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (nextCombo > 0 && nextCombo % FEEDBACK.COMBO_BURST_INTERVAL === 0) {
        setMessage(`🔥 Combo burst x${nextCombo}!`);
        triggerAudioHook(AUDIO_HOOKS.hackey.COMBO_BURST, 280);
      }
      const shouldEcho = activeDailyChallengeRef.current?.mode === 'hackey'
        && activeDailyChallengeRef.current.modifierId === 'echo-target'
        && Math.random() < 0.35;
      const nextTarget = shouldEcho
        ? hackeyTargetRef.current
        : Math.floor(Math.random() * HACKEY.TARGET_COUNT);
      hackeyTargetRef.current = nextTarget;
      hackeyWindowRef.current = 1;
      setHackeyTarget(nextTarget);
      setHackeyWindow(1);
    } else {
      const newMisses = hackeyMissesRef.current + 1;
      hackeyMissesRef.current = newMisses;
      setHackeyMisses(newMisses);
      setHackeyCombo(0);
      setMessage(`Wrong player! ${HACKEY.MISS_LIMIT - newMisses} left`);
      setHitFlash(true);
      triggerAudioHook(AUDIO_HOOKS.hackey.MISS, 220);
      setTimeout(() => setHitFlash(false), FEEDBACK.HIT_FLASH_MS);
      if (!reducedMotion) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (newMisses >= HACKEY.MISS_LIMIT) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        setRunSummary({ ...runSummaryRef.current });
        setBestScores((c) => ({ ...c, hackey: Math.max(c.hackey, score) }));
      }
    }
  }, [hackeyCombo, score, reducedMotion, triggerAudioHook]);

  // ─── Ad ───────────────────────────────────────────────────────────────────
  const watchRewardAd = useCallback(() => {
    if (!rewardLoaded) {
      setMessage('Reward ad still loading. Try again shortly.');
      return;
    }
    try {
      rewardedAd.show();
      setRewardLoaded(false);
    } catch (error) {
      void appendErrorLog(error, 'WatchRewardAd');
      setMessage('Unable to show rewarded ad.');
    }
  }, [rewardLoaded, appendErrorLog]);

  // ─── Character shop ───────────────────────────────────────────────────────
  const handleCharacterAction = useCallback((character: Character) => {
    const isOwned = ownedCharacters.includes(character.id);
    if (isOwned) {
      setSelectedCharacterId(character.id);
      setMessage(`${character.name} equipped.`);
      return;
    }
    if (tokens < character.cost) {
      setMessage(`Need ${character.cost - tokens} more tokens for ${character.name}.`);
      return;
    }
    setTokens((c) => c - character.cost);
    setOwnedCharacters((c) => [...c, character.id]);
    setSelectedCharacterId(character.id);
    setMessage(`${character.name} unlocked and equipped!`);
  }, [ownedCharacters, tokens]);

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const renderSkillDots = (label: string, value: number, color: string) => (
    <View style={styles.skillRow}>
      <Text style={styles.skillLabel}>{label}</Text>
      <View style={styles.skillDots}>
        {Array.from({ length: 4 }, (_, index) => (
          <View
            key={`${label}-${index}`}
            style={[
              styles.skillDot,
              {
                backgroundColor: index < value ? color : '#193148',
                borderColor: index < value ? color : '#25435E',
              },
            ]}
          />
        ))}
      </View>
    </View>
  );

  const renderCharacterPortrait = (character: Character, variant: 'hero' | 'card' = 'card') => {
    const width = variant === 'hero' ? 168 : 104;
    const height = variant === 'hero' ? 208 : 128;
    const scale = variant === 'hero' ? 1 : 0.72;

    return (
      <View style={[styles.characterPortraitFrame, { width, height, borderColor: character.accentColor }]}>
        <View style={[styles.characterPortraitAura, { backgroundColor: character.accentColor }]} />
        <View style={[styles.characterPortraitSky, { backgroundColor: character.secondaryColor }]} />
        <View style={[styles.characterPortraitSun, { backgroundColor: character.accentColor }]} />
        <View style={[styles.characterPortraitGround, { backgroundColor: character.color }]} />
        <View style={[styles.characterPortraitBoard, { backgroundColor: character.secondaryColor }]} />
        <View style={[styles.characterPortraitFigure, { transform: [{ scale }] }]}>
          <View style={[styles.characterPortraitLeg, styles.characterPortraitLegLeft, { backgroundColor: character.secondaryColor }]} />
          <View style={[styles.characterPortraitLeg, styles.characterPortraitLegRight, { backgroundColor: character.secondaryColor }]} />
          <View style={[styles.characterPortraitArm, styles.characterPortraitArmLeft, { backgroundColor: character.color }]} />
          <View style={[styles.characterPortraitArm, styles.characterPortraitArmRight, { backgroundColor: character.color }]} />
          <View style={[styles.characterPortraitTorso, { backgroundColor: character.color }]} />
          <View style={styles.characterPortraitNeck} />
          <View style={styles.characterPortraitHead}>
            <View style={[styles.characterPortraitHair, { backgroundColor: character.secondaryColor }]} />
            <View style={styles.characterPortraitFace}>
              <View style={styles.characterPortraitEyeRow}>
                <View style={styles.characterPortraitEye} />
                <View style={styles.characterPortraitEye} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.characterPortraitBadge}>
          <Text style={styles.characterPortraitBadgeText}>{character.persona}</Text>
        </View>
      </View>
    );
  };

  const renderActionCharacter = (
    pose: 'surf' | 'skate' | 'sky' | 'race',
    character: Character,
    positionStyle: ViewStyle,
  ) => (
    <View style={[styles.actionCharacterWrap, positionStyle]}>
      <View style={[styles.actionCharacterGlow, { backgroundColor: character.accentColor }]} />
      {pose === 'sky' ? (
        <>
          <View style={[styles.actionCanopy, { backgroundColor: character.secondaryColor }]} />
          <View style={[styles.actionCanopyLine, styles.actionCanopyLineLeft]} />
          <View style={[styles.actionCanopyLine, styles.actionCanopyLineRight]} />
        </>
      ) : pose === 'skate' ? (
        <>
          <View style={[styles.actionBoard, { backgroundColor: character.accentColor }]} />
          <View style={[styles.actionSkateWheel, styles.actionSkateWheelLeft]} />
          <View style={[styles.actionSkateWheel, styles.actionSkateWheelRight]} />
        </>
      ) : (
        <View
          style={[
            pose === 'race' ? styles.actionRaceBody : styles.actionBoard,
            { backgroundColor: pose === 'race' ? character.secondaryColor : character.accentColor },
          ]}
        />
      )}
      <View style={[styles.actionLeg, styles.actionLegLeft, { backgroundColor: character.secondaryColor }]} />
      <View style={[styles.actionLeg, styles.actionLegRight, { backgroundColor: character.secondaryColor }]} />
      <View style={[styles.actionArm, styles.actionArmLeft, { backgroundColor: character.color }]} />
      <View style={[styles.actionArm, styles.actionArmRight, { backgroundColor: character.color }]} />
      <View style={[styles.actionTorso, { backgroundColor: character.color }]} />
      <View style={styles.actionNeck} />
      <View style={styles.actionHead}>
        <View style={[styles.actionHair, { backgroundColor: character.secondaryColor }]} />
        <View style={styles.actionFace}>
          <View style={styles.actionEyes}>
            <View style={styles.actionEye} />
            <View style={styles.actionEye} />
          </View>
        </View>
      </View>
    </View>
  );

  const renderChallengeBanner = () => {
    if (!activeDailyChallenge) return null;
    const progress = getObjectiveProgress(activeDailyChallenge.objectiveId, score, runSummaryRef.current);
    const isComplete = progress >= activeDailyChallenge.objectiveTarget;
    return (
      <View style={styles.challengeBanner}>
        <Text style={styles.challengeBannerTitle}>
          {activeDailyChallenge.badge} Daily • {activeDailyChallenge.modifierName}
        </Text>
        <Text style={styles.challengeBannerText}>{activeDailyChallenge.modifierText}</Text>
        <Text style={styles.challengeBannerObjective}>
          Objective: {activeDailyChallenge.objectiveText} ({Math.min(progress, activeDailyChallenge.objectiveTarget)}/{activeDailyChallenge.objectiveTarget})
          {isComplete ? ' ✓' : ''}
        </Text>
      </View>
    );
  };

  const renderSurfGame = () => {
    const waveY = 55 + Math.sin(surfWavePhase.current) * 4;
    return (
      <View style={styles.gameArea} {...surfPanResponder.panHandlers}>
        <View style={styles.surfSky} />
        <View style={styles.surfSun} />
        <View style={[styles.surfCliff, styles.surfCliffLeft]} />
        <View style={[styles.surfCliff, styles.surfCliffRight]} />
        <View style={[styles.surfOcean, { top: `${waveY}%` }]} />
        <View style={styles.surfOceanGlow} />

        <View style={[styles.waveCrease, { top: `${waveY - 2}%` }]} />
        <View style={[styles.waveFoam, { top: `${waveY - 5}%` }]} />

        <View style={styles.sweetZone}>
          {tubeMultiplier > 1 && (
            <View style={styles.sweetZoneGlow} />
          )}
        </View>

        {/* Whitewater danger zones */}
        {waveZones.map((z) => (
          <View
            key={z.id}
            style={[
              styles.whitewaterZone,
              {
                left: `${z.x * 100}%` as `${number}%`,
                width: `${z.width * 100}%` as `${number}%`,
                top: `${waveY - 8}%` as `${number}%`,
              },
            ]}
          />
        ))}

        {/* Wave shoulder — the unbroken face rolling ahead of the rider */}
        <View
          style={[
            styles.waveShoulder,
            {
              top: `${waveY - 20}%` as `${number}%`,
              left: `${Math.min(surferX * 100 + 20, 65)}%` as `${number}%`,
            },
          ]}
        />
        {/* Wave lip / breaking curl — forms above and forward of the rider */}
        <View
          style={[
            styles.waveLip,
            {
              top: `${waveY - 13}%` as `${number}%`,
              left: `${Math.max(surferX * 100 - 22, 3)}%` as `${number}%`,
            },
          ]}
        />
        {/* Surfboard — elongated shape beneath the rider */}
        <View
          style={[
            styles.gameSurfboard,
            {
              left: `${Math.max(surferX * 100 - 12, 0)}%` as `${number}%`,
              top: `${waveY - 12}%` as `${number}%`,
              transform: trickAirborne
                ? [{ rotate: '22deg' }, { scaleX: 1.08 }]
                : [{ rotate: '-3deg' }],
              backgroundColor: trickAirborne ? '#FFD46A' : '#F06A1C',
            },
          ]}
        />

        {renderActionCharacter(
          'surf',
          {
            ...activeCharacter,
            color: trickAirborne ? '#FFD46A' : activeCharacter.color,
          },
          {
            left: `${surferX * 100 - 7}%` as `${number}%`,
            top: `${waveY - 19}%` as `${number}%`,
            transform: trickAirborne ? [{ scale: 1.2 }, { rotate: '24deg' }] : undefined,
          },
        )}

        {/* HUD labels */}
        <View style={styles.surfHudOverlay}>
          {tubeMultiplier > 1 && !barrelActive && (
            <Text style={styles.tubeLabel}>🌊 TUBE x{tubeMultiplier}</Text>
          )}
          {barrelActive && (
            <Text style={[styles.tubeLabel, { color: '#FFD700', fontSize: 18 }]}>🛢 BARREL x3!</Text>
          )}
          {trickAirborne && <Text style={styles.trickLabel}>✈️ AERIAL!</Text>}
          {/* Barrel charge indicator */}
          {!barrelActive && tubeMultiplier > 1 && barrelHoldTicks > 0 && (
            <View style={styles.barrelChargeBar}>
              <View style={[styles.barrelChargeFill, { width: `${(barrelHoldTicks / SURF.BARREL_HOLD_TICKS) * 100}%` as `${number}%` }]} />
            </View>
          )}
        </View>

        {/* Controls tutorial — auto-hides after 4.5 s */}
        {showControlsTip && (
          <View style={styles.controlsTipOverlay}>
            <Text style={styles.controlsTipTitle}>🌊 Surf Controls</Text>
            <Text style={styles.controlsTipLine}>← → Drag to steer along the wave face</Text>
            <Text style={styles.controlsTipLine}>⬆ Flick UP quickly to launch an aerial (+{SURF.AERIAL_SCORE} pts)</Text>
            <Text style={styles.controlsTipLine}>⭐ Centre zone = 2× score — hold for BARREL bonus!</Text>
            <Text style={styles.controlsTipLine}>⚠ Dodge the whitewater closeout sections!</Text>
            {activeDailyChallenge?.mode === 'surf' && (
              <Text style={styles.controlsTipLine}>🌊 Daily: {activeDailyChallenge.modifierName} • {activeDailyChallenge.objectiveText}</Text>
            )}
            <Text style={styles.controlsTipDim}>Tap − / + in the HUD to adjust sensitivity</Text>
          </View>
        )}

        {!isPlaying && renderGameOver()}
      </View>
    );
  };

  const renderSkateGame = () => {
    // Map angle to position on a half-pipe visual
    const PIPE_CENTER_X = 50; // %
    const PIPE_CENTER_Y = 75; // % (bottom of pipe)
    const PIPE_RADIUS_PX_X = 38; // % width of arc
    const PIPE_RADIUS_PX_Y = 55; // % height of arc

    const skaterX = PIPE_CENTER_X + Math.sin(skateAngle) * PIPE_RADIUS_PX_X;
    const skaterY = PIPE_CENTER_Y - Math.abs(Math.cos(skateAngle)) * PIPE_RADIUS_PX_Y;
    const airY = skateAirborne ? skaterY - 15 : skaterY;

    return (
      <View style={styles.gameArea} {...skatePanResponder.panHandlers}>
        <View style={styles.skateSky} />
        <View style={styles.skateSun} />
        <View style={styles.skateCityline} />
        <View style={styles.skateCrowdGlow} />
        <View style={styles.pipeLeft} />
        <View style={styles.pipeRight} />
        <View style={styles.pipeBottom} />

        {/* Coping dots */}
        <View style={[styles.coping, { left: '8%' }]} />
        <View style={[styles.coping, { right: '8%' }]} />

        {/* Deck platforms at the top of each wall */}
        <View style={[styles.pipeDeck, { left: 0 }]} />
        <View style={[styles.pipeDeck, { right: 0 }]} />
        {/* Quarter-pipe transition curves */}
        <View style={styles.pipeTransitionLeft} />
        <View style={styles.pipeTransitionRight} />

        {/* Rails */}
        {skateRails.map((rail) => (
          <View
            key={rail.id}
            style={[
              styles.skateRail,
              rail.side === 'left' ? { left: '10%' } : { right: '10%' },
              { opacity: rail.active ? 1 : 0.3 },
            ]}
          />
        ))}

        {/* Skateboard deck with four wheels — offset mirrors the character's own positioning */}
        <View
          style={[
            styles.skateboardDeck,
            {
              left: `${skaterX - 7}%` as `${number}%`,
              top: `${airY}%` as `${number}%`,
              transform: [{ rotate: `${skateAngle * 45}deg` }],
            },
          ]}
        >
          <View style={[styles.skateboardWheelG, { left: 5 }]} />
          <View style={[styles.skateboardWheelG, { left: 17 }]} />
          <View style={[styles.skateboardWheelG, { right: 5 }]} />
          <View style={[styles.skateboardWheelG, { right: 17 }]} />
        </View>

        {renderActionCharacter('skate', activeCharacter, {
          left: `${skaterX - 6}%` as `${number}%`,
          top: `${airY - 8}%` as `${number}%`,
          transform: [{ rotate: `${skateAngle * 45}deg` }],
        })}

        {/* Trick indicator */}
        {skateTrick && (
          <View style={styles.trickBubble}>
            <Text style={styles.trickBubbleText}>🛹 {skateTrick}</Text>
            <Text style={styles.trickBubbleSub}>Tap to land!</Text>
          </View>
        )}

        {/* Hint */}
        <Text style={styles.skateHint}>Swipe ← → to pump  •  Airborne? Tap to score!</Text>

        {/* Style Meter */}
        {stylePhase > 0 && (
          <View style={styles.styleMeterWrap}>
            <Text style={styles.styleMeterLabel}>
              {stylePhase === 1 ? '🛹 Pumped!' : stylePhase === 2 ? '✈️ Airborne!' : '⚡ Trick! Now land!'}
            </Text>
            <View style={styles.styleMeterBar}>
              <View style={[styles.styleMeterFill, {
                width: `${Math.max(0, (1 - styleTicks / SKATE.STYLE_WINDOW_TICKS)) * 100}%` as `${number}%`,
                backgroundColor: styleTicks < SKATE.STYLE_WINDOW_TICKS * 0.6 ? '#A0FF80' : '#FFD700',
              }]} />
            </View>
          </View>
        )}

        {/* Controls tutorial */}
        {showControlsTip && (
          <View style={styles.controlsTipOverlay}>
            <Text style={styles.controlsTipTitle}>🛹 Half Pipe Controls</Text>
            <Text style={styles.controlsTipLine}>← → Swipe left or right to pump up the walls</Text>
            <Text style={styles.controlsTipLine}>🚀 Build speed to launch off the coping</Text>
            <Text style={styles.controlsTipLine}>✈ When airborne → TAP the screen to score</Text>
            <Text style={styles.controlsTipLine}>🎨 Pump→Launch→Trick→Land = Style Bonus!</Text>
            {activeDailyChallenge?.mode === 'skate' && (
              <Text style={styles.controlsTipLine}>🛹 Daily: {activeDailyChallenge.modifierName} • {activeDailyChallenge.objectiveText}</Text>
            )}
            <Text style={styles.controlsTipDim}>Tap − / + in the HUD to adjust sensitivity</Text>
          </View>
        )}

        {!isPlaying && renderGameOver()}
      </View>
    );
  };

  const renderHackeyGame = () => {
    const CIRCLE_R = 38; // % of game area
    const CENTER = 50;

    return (
      <View style={styles.gameArea}>
        <View style={styles.hackeyArenaGlow} />
        <View style={styles.hackeyArenaLights} />
        <View style={styles.hackeyTrack} />
        <View style={styles.hackeyOrbitRing} />
        <View style={styles.hackeyCenterSpot} />

        {/* Sack */}
        <View
          style={[
            styles.hackeySack,
            {
              left: `${hackeySackPos.x * 100 - 3}%` as `${number}%`,
              top: `${hackeySackPos.y * 100 - 3}%` as `${number}%`,
            },
          ]}
        />

        {/* Players */}
        {HACKEY_PLAYERS.map((p) => {
          const px = CENTER + Math.cos(p.angle) * CIRCLE_R;
          const py = CENTER + Math.sin(p.angle) * CIRCLE_R;
          const isTarget = p.id === hackeyTarget;
          return (
            <Pressable
              key={p.id}
              onPress={() => hackeyTap(p.id)}
              style={[
                styles.hackeyPlayer,
                {
                  left: `${px - 6}%` as `${number}%`,
                  top: `${py - 6}%` as `${number}%`,
                  backgroundColor: isTarget ? activeCharacter.color : '#2A3A50',
                  borderColor: isTarget ? activeMode.accentColor : '#1E3550',
                  transform: [{ scale: isTarget ? 1.3 : 1 }],
                },
              ]}
            >
              {isTarget && <View style={styles.hackeyTargetPulse} />}
              <View style={[styles.hackeyPlayerHead, { backgroundColor: isTarget ? '#FFD6B3' : '#D2A37B' }]} />
              <View
                style={[
                  styles.hackeyPlayerBody,
                  { backgroundColor: isTarget ? activeCharacter.color : '#556A84' },
                ]}
              />
            </Pressable>
          );
        })}

        {/* Window bar — shrinking timer */}
        <View style={styles.hackeyWindowBar}>
          <View
            style={[
              styles.hackeyWindowFill,
              {
                width: `${hackeyWindow * 100}%` as `${number}%`,
                backgroundColor:
                  hackeyWindow > HACKEY.PERFECT_WINDOW
                    ? '#A0FF80'
                    : hackeyWindow > 0.5
                    ? '#7ED8A0'
                    : hackeyWindow > 0.25
                    ? '#FFD700'
                    : '#FF4444',
              },
            ]}
          />
          {/* Perfect zone marker */}
          <View style={[styles.hackeyPerfectMarker, { left: `${HACKEY.PERFECT_WINDOW * 100}%` as `${number}%` }]} />
        </View>
        {hackeyWindow > HACKEY.PERFECT_WINDOW && (
          <Text style={styles.hackeyPerfectLabel}>⚡ PERFECT ZONE</Text>
        )}
        {lastTapPerfect && (
          <Text style={styles.hackeyPerfectFlash}>🌟 PERFECT!</Text>
        )}

        {/* Combo / Misses display */}
        <View style={styles.hackeyStats}>
          <Text style={styles.hackeyStatText}>
            Combo: {hackeyCombo}
            {hackeyCombo >= HACKEY.WILD_COMBO_THRESHOLD ? ' 🔥' : hackeyCombo >= HACKEY.FAKE_PLAYER_COMBO_THRESHOLD ? ' ⚡' : ''}
          </Text>
          <Text style={[styles.hackeyStatText, { color: '#FF6B6B' }]}>
            {'⚡'.repeat(HACKEY.MISS_LIMIT - hackeyMisses)}{'💀'.repeat(hackeyMisses)}
          </Text>
        </View>
        <Text style={styles.hackeyHint}>Tap the glowing player before the timer drains</Text>

        {showControlsTip && (
          <View style={styles.controlsTipOverlay}>
            <Text style={styles.controlsTipTitle}>🤸 Hackey Circle Controls</Text>
            <Text style={styles.controlsTipLine}>👆 Tap the highlighted player to keep the sack alive</Text>
            <Text style={styles.controlsTipLine}>⚡ Tap in the green zone for PERFECT bonus!</Text>
            <Text style={styles.controlsTipLine}>⏱ Faster taps mean bigger combo chains and score bonuses</Text>
            <Text style={styles.controlsTipLine}>💀 Three misses ends the run, so keep the rhythm</Text>
            {activeDailyChallenge?.mode === 'hackey' && (
              <Text style={styles.controlsTipLine}>🤸 Daily: {activeDailyChallenge.modifierName} • {activeDailyChallenge.objectiveText}</Text>
            )}
          </View>
        )}

        {!isPlaying && renderGameOver()}
      </View>
    );
  };

  const renderSkydiveGame = () => (
    <View style={styles.gameArea} {...skydivePanResponder.panHandlers}>
      <View style={styles.skyBg} />
      <View style={styles.skyGlow} />
      <View style={styles.skySun} />
      <View style={styles.skyCloudBandTop} />
      <View style={styles.skyHorizon} />
      <View style={styles.skyCloudBandBottom} />

      {[0.16, 0.34, 0.58, 0.8].map((left, idx) => (
        <View
          key={`wind-${idx}`}
          style={[
            styles.skyWindStreak,
            {
              left: `${left * 100}%` as `${number}%`,
              top: `${18 + idx * 16}%` as `${number}%`,
              width: `${16 + idx * 4}%` as `${number}%`,
            },
          ]}
        />
      ))}

      {/* Cloud turbulence pockets */}
      {skyClouds.map((c) => (
        <View
          key={c.id}
          style={[
            styles.skyCloud,
            {
              left: `${(c.x - c.r) * 100}%` as `${number}%`,
              top: `${c.y * 100}%` as `${number}%`,
              width: `${c.r * 2 * 100}%` as `${number}%`,
              height: `${c.r * 2 * 100}%` as `${number}%`,
              borderRadius: 999,
            },
          ]}
        />
      ))}

      {/* Ring gates */}
      {skyGates.map((g) => {
        const gapLeftPct = (g.gapX - 0.14) * 100;
        const gapRightPct = (1 - g.gapX - 0.14) * 100;
        return (
          <View
            key={g.id}
            style={[styles.gateRow, { top: `${g.y * 100}%` as `${number}%` }]}
          >
            {/* Left wall */}
            <View style={[styles.gateWall, { width: `${gapLeftPct}%` as `${number}%` }]} />
            {/* Gap */}
            <View style={styles.gateGap}>
              <View style={styles.gateCore} />
            </View>
            {/* Right wall */}
            <View style={[styles.gateWall, { width: `${gapRightPct}%` as `${number}%` }]} />
          </View>
        );
      })}

      {renderActionCharacter('sky', activeCharacter, {
        left: `${skyX * 100 - 7}%` as `${number}%`,
        top: '73%',
      })}

      {/* HUD overlay */}
      <View style={styles.skyHud}>
        <Text style={styles.skyHudText}>🪂 {skyAltitude.toLocaleString()} ft</Text>
        <Text style={styles.skyHudText}>Gates: {skyGatesCleared}</Text>
      </View>

      {lastGatePerfect && (
        <Text style={styles.skyPerfectFlash}>🎯 PERFECT THREAD!</Text>
      )}

      <Text style={styles.skyHint}>Drag ← → to steer  •  Thread the gates  •  Dodge clouds</Text>

      {/* Controls tutorial */}
      {showControlsTip && (
        <View style={styles.controlsTipOverlay}>
          <Text style={styles.controlsTipTitle}>🪂 Skydive Controls</Text>
          <Text style={styles.controlsTipLine}>← → Drag to steer your body through the air</Text>
          <Text style={styles.controlsTipLine}>🎯 Thread through ring gates for +25 pts each</Text>
          <Text style={styles.controlsTipLine}>☁ Dodge white turbulence clouds!</Text>
          {activeDailyChallenge?.mode === 'skydive' && (
            <Text style={styles.controlsTipLine}>🪂 Daily: {activeDailyChallenge.modifierName} • {activeDailyChallenge.objectiveText}</Text>
          )}
          <Text style={styles.controlsTipDim}>Tap − / + in the HUD to adjust sensitivity</Text>
        </View>
      )}

      {!isPlaying && renderGameOver()}
    </View>
  );

  const renderBoxRaceGame = () => (
    <View style={styles.gameArea} {...boxRacePanResponder.panHandlers}>
      <View style={styles.raceCrowdGlow} />
      <View style={styles.raceTrack} />
      <View style={[styles.raceEdge, { left: '8%' }]} />
      <View style={[styles.raceEdge, { right: '8%' }]} />
      <View style={[styles.raceRumbleStrip, { left: '9%' }]} />
      <View style={[styles.raceRumbleStrip, { right: '9%' }]} />
      <View style={styles.raceCheckBanner} />
      <View style={styles.raceLaneStripe} />
      <View style={[styles.raceLaneStripe, styles.raceLaneStripeBottom]} />
      <View style={styles.raceScanline} />

      {/* Boost pads */}
      {raceBoosts.map((b) => (
        <View
          key={b.id}
          style={[
            styles.boostPad,
            {
              left: `${b.x * 100 - 4}%` as `${number}%`,
              top: `${b.y * 100}%` as `${number}%`,
            },
          ]}
        >
          <Text style={styles.boostEmoji}>⚡</Text>
        </View>
      ))}

      {/* Rival boxes */}
      {raceBoxes.map((b) => (
        <View
          key={b.id}
          style={[
            styles.rivalBox,
            {
              left: `${b.x * 100 - 5}%` as `${number}%`,
              top: `${b.y * 100}%` as `${number}%`,
              backgroundColor: b.color,
            },
          ]}
        >
          <Text style={styles.rivalBoxEmoji}>📦</Text>
        </View>
      ))}

      <View
        style={[
          styles.playerBox,
          {
            left: `${racerX * 100 - 6}%` as `${number}%`,
            backgroundColor: activeCharacter.color,
          },
        ]}
      >
        <View style={styles.playerBoxGlow} />
        {renderActionCharacter('race', activeCharacter, {
          left: '3%',
          top: '-6%',
          transform: [{ scale: 0.82 }],
        })}
      </View>

      <View style={styles.raceHud}>
        <Text style={styles.raceHudText}>Speed: {(racerSpeed * 10000).toFixed(0)} km/h</Text>
      </View>
      {/* Slipstream charge indicator */}
      {slipstreamTicks > 0 && !slipstreamActive && (
        <View style={styles.slipstreamBar}>
          <View style={[styles.slipstreamFill, { width: `${(slipstreamTicks / BOXRACE.SLIPSTREAM_TICKS) * 100}%` as `${number}%` }]} />
          <Text style={styles.slipstreamLabel}>💨 Slipstream</Text>
        </View>
      )}
      {slipstreamActive && (
        <Text style={styles.slipstreamActiveText}>💨 SLIPSTREAM!</Text>
      )}
      <Text style={styles.raceHint}>Drag ← → to steer  •  Hit boosts  •  Stay behind rivals!</Text>

      {/* Controls tutorial */}
      {showControlsTip && (
        <View style={styles.controlsTipOverlay}>
          <Text style={styles.controlsTipTitle}>📦 Box Racer Controls</Text>
          <Text style={styles.controlsTipLine}>← → Drag to steer your box car</Text>
          <Text style={styles.controlsTipLine}>⚡ Drive over green boost pads for +{BOXRACE.BOOST_SCORE} pts</Text>
          <Text style={styles.controlsTipLine}>💨 Stay behind rivals to charge SLIPSTREAM!</Text>
          <Text style={styles.controlsTipLine}>💥 Dodge coloured rival boxes — shields absorb crashes!</Text>
          {activeDailyChallenge?.mode === 'boxrace' && (
            <Text style={styles.controlsTipLine}>📦 Daily: {activeDailyChallenge.modifierName} • {activeDailyChallenge.objectiveText}</Text>
          )}
          <Text style={styles.controlsTipDim}>Tap − / + in the HUD to adjust sensitivity</Text>
        </View>
      )}

      {!isPlaying && renderGameOver()}
    </View>
  );

  const renderGameOver = () => {
    const isNewBest = score > runStartBestRef.current && score > 0;
    const mastery = modeProgress[selectedMode];
    const masteryLevel = getMasteryLevel(mastery.points);
    const nextTier = getNextMasteryTier(mastery.points);
    return (
      <View style={styles.gameOverOverlay}>
        <Text style={styles.gameOverTitle}>Run Over</Text>
        <Text style={[styles.gameOverScore, isNewBest && { color: '#FFD700' }]}>{score}</Text>
        <Text style={styles.gameOverLabel}>{isNewBest ? '🏆 NEW BEST!' : 'score'}</Text>
        <Text style={styles.gameOverBest}>Best delta: {runEndMeta ? (runEndMeta.bestDelta >= 0 ? `+${runEndMeta.bestDelta}` : `${runEndMeta.bestDelta}`) : 0}</Text>
        {/* Stage reached */}
        <View style={[styles.gameOverSummaryRow, { marginTop: 10 }]}>
          <Text style={styles.gameOverSummaryLabel}>Stage reached</Text>
          <Text style={[styles.gameOverSummaryValue, { color: diffStage === 3 ? '#FF6B6B' : diffStage === 2 ? '#FFD700' : '#7ED8A0' }]}>
            {diffStage === 3 ? '🔥 Expert' : diffStage === 2 ? '⚡ Pro' : '🌱 Rookie'}
          </Text>
        </View>
        {/* Mode-specific run summary */}
        {selectedMode === 'hackey' && runSummary.maxCombo !== undefined && (
          <View style={styles.gameOverSummaryRow}>
            <Text style={styles.gameOverSummaryLabel}>Max combo</Text>
            <Text style={styles.gameOverSummaryValue}>x{runSummary.maxCombo}</Text>
          </View>
        )}
        {selectedMode === 'skydive' && runSummary.gatesCleared !== undefined && (
          <View style={styles.gameOverSummaryRow}>
            <Text style={styles.gameOverSummaryLabel}>Gates cleared</Text>
            <Text style={styles.gameOverSummaryValue}>{runSummary.gatesCleared}</Text>
          </View>
        )}
        {selectedMode === 'surf' && runSummary.barrelRides !== undefined && (
          <View style={styles.gameOverSummaryRow}>
            <Text style={styles.gameOverSummaryLabel}>Barrels ridden</Text>
            <Text style={styles.gameOverSummaryValue}>{runSummary.barrelRides}</Text>
          </View>
        )}
        {selectedMode === 'skate' && runSummary.styleBonuses !== undefined && (
          <View style={styles.gameOverSummaryRow}>
            <Text style={styles.gameOverSummaryLabel}>Style bonuses</Text>
            <Text style={styles.gameOverSummaryValue}>{runSummary.styleBonuses}</Text>
          </View>
        )}
        {selectedMode === 'boxrace' && runSummary.slipstreams !== undefined && (
          <View style={styles.gameOverSummaryRow}>
            <Text style={styles.gameOverSummaryLabel}>Slipstreams</Text>
            <Text style={styles.gameOverSummaryValue}>{runSummary.slipstreams}</Text>
          </View>
        )}
        {runEndMeta && (
          <>
            <View style={styles.gameOverSummaryRow}>
              <Text style={styles.gameOverSummaryLabel}>Run tokens</Text>
              <Text style={styles.gameOverSummaryValue}>+{runEndMeta.payoutTokens}</Text>
            </View>
            <View style={styles.gameOverSummaryRow}>
              <Text style={styles.gameOverSummaryLabel}>Mastery</Text>
              <Text style={styles.gameOverSummaryValue}>
                {MODE_MASTERIES[selectedMode][masteryLevel]} • +{runEndMeta.masteryPointsGained} pts
              </Text>
            </View>
            {activeDailyChallenge && (
              <View style={styles.gameOverChallengeWrap}>
                <Text style={styles.gameOverChallengeTitle}>
                  {activeDailyChallenge.badge} Daily • {activeDailyChallenge.modifierName}
                </Text>
                <Text style={styles.gameOverChallengeText}>
                  {activeDailyChallenge.objectiveText} ({Math.min(runEndMeta.objectiveProgress, runEndMeta.objectiveTarget)}/{runEndMeta.objectiveTarget})
                </Text>
                <Text style={styles.gameOverChallengeText}>
                  {runEndMeta.challengeCompleted
                    ? runEndMeta.challengeTokens > 0
                      ? `Cleared for +${runEndMeta.challengeTokens} bonus tokens`
                      : 'Cleared again — reward already claimed today'
                    : 'Replay CTA: run it back and finish the daily objective'}
                </Text>
              </View>
            )}
            <Text style={styles.gameOverReplayText}>
              {nextTier
                ? `Next mastery unlock at ${nextTier.points} pts: ${nextTier.rewardText}`
                : 'All mastery tiers unlocked — chase a higher best and faster daily clears.'}
            </Text>
          </>
        )}
        {message ? <Text style={styles.gameOverMsg}>{message}</Text> : null}
        <Pressable
          onPress={restartGame}
          style={[styles.gameOverBtn, { backgroundColor: activeMode.accentColor }]}
        >
          <Text style={styles.gameOverBtnText}>{activeDailyChallenge ? 'Replay This Challenge' : 'Play Again'}</Text>
        </Pressable>
        <Pressable onPress={() => setScreen('select')} style={styles.gameOverSecondary}>
          <Text style={styles.gameOverSecondaryText}>Change Sport</Text>
        </Pressable>
        {rewardLoaded && (
          <Pressable onPress={watchRewardAd} style={styles.gameOverAdBtn}>
            <Text style={styles.gameOverAdText}>🎬 Watch Ad for Bonus</Text>
          </Pressable>
        )}
      </View>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Character Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showCharacters}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCharacters(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Characters</Text>
              <Pressable onPress={() => setShowCharacters(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.modalTokens}>Tokens: {tokens}</Text>
            {message ? (
              <View style={[styles.messageBanner, { marginHorizontal: 0, marginBottom: 10 }]}>
                <Text style={styles.messageText}>{message}</Text>
              </View>
            ) : null}
            <ScrollView showsVerticalScrollIndicator={false}>
              {CHARACTERS.map((char) => {
                const isOwned = ownedCharacters.includes(char.id);
                const isSelected = selectedCharacterId === char.id;
                return (
                  <Pressable
                    key={char.id}
                    onPress={() => handleCharacterAction(char)}
                    style={[styles.charCard, isSelected && { borderColor: char.color }]}
                  >
                    <View style={[styles.charColorBar, { backgroundColor: char.color }]} />
                    <View style={styles.charArtWrap}>{renderCharacterPortrait(char)}</View>
                    <View style={styles.charCardBody}>
                      <View style={styles.charCardTop}>
                        <View style={styles.charCardIdentity}>
                          <Text style={styles.charCardName}>{char.name}</Text>
                          <Text style={styles.charCardPersona}>{char.persona}</Text>
                        </View>
                        <View style={styles.charCardBadgeColumn}>
                          {isOwned ? (
                            <View
                              style={[
                                styles.charBadge,
                                isSelected ? styles.charBadgeEquipped : styles.charBadgeOwned,
                              ]}
                            >
                              <Text style={styles.charBadgeText}>
                                {isSelected ? 'Equipped' : 'Owned'}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.charBadgeLocked}>
                              <Text style={styles.charBadgeText}>🔒 {char.cost}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={styles.charCardDesc}>{char.bonusDescription}</Text>
                      <Text style={styles.charCardMove}>{char.signatureMove}</Text>
                      <Text style={styles.charCardSub}>
                        🛡 +{char.shieldBonus} shield
                        {char.slowMotionBonus > 0
                          ? `   ⏱ +${char.slowMotionBonus}s slow motion`
                          : ''}
                      </Text>
                      <View style={styles.charSkillsPanel}>
                        {renderSkillDots('Focus', Math.min(4, 1 + Math.floor(char.slowMotionBonus / 2)), char.accentColor)}
                        {renderSkillDots('Control', Math.min(4, 1 + Math.round(char.controlBonus * 20)), char.color)}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Landing Screen ──────────────────────────────────────────────── */}
      {screen === 'landing' && (
        <SafeAreaView style={styles.screen}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroSection}>
              <View style={styles.heroBackdrop} />
              <View style={styles.heroGlow} />
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>Festival Edition</Text>
                <Text style={styles.heroTitle}>Retro Rush</Text>
                <Text style={styles.heroTagline}>Sharper controls. Bigger worlds. Hero unlocks.</Text>
                <Text style={styles.heroDesc}>
                  Ride through richer environments, unlock headline athletes, and push farther with
                  steadier touch handling across every event.
                </Text>
              </View>
              <View style={styles.heroPortraitWrap}>{renderCharacterPortrait(activeCharacter, 'hero')}</View>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureCopy}>
                <Text style={styles.featureEyebrow}>Featured athlete</Text>
                <Text style={styles.featureTitle}>{activeCharacter.name}</Text>
                <Text style={styles.featureBody}>{activeCharacter.signatureMove}</Text>
                <View style={styles.featureSkills}>
                  {renderSkillDots('Survival', Math.min(4, activeCharacter.shieldBonus), activeCharacter.color)}
                  {renderSkillDots('Control', Math.min(4, 1 + Math.round(activeCharacter.controlBonus * 20)), activeCharacter.accentColor)}
                </View>
              </View>
            </View>

            <View style={styles.statsBar}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{tokens}</Text>
                <Text style={styles.statLabel}>Tokens</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{lifetimeTokens}</Text>
                <Text style={styles.statLabel}>Lifetime</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <View style={[styles.charDot, { backgroundColor: activeCharacter.color }]} />
                <Text style={styles.statLabel}>{activeCharacter.name}</Text>
              </View>
            </View>

            <Pressable
              onPress={() => setScreen('select')}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>Select Game →</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowCharacters(true)}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>🎽  Characters & Unlocks</Text>
            </Pressable>

            <Pressable
              onPress={watchRewardAd}
              style={({ pressed }) => [
                styles.adBtn,
                !rewardLoaded && styles.adBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.adBtnText}>
                {rewardLoaded
                  ? '🎬  Watch Ad: +Tokens +Shield +Slow Motion'
                  : '⏳  Loading Reward Ad…'}
              </Text>
            </Pressable>

            <Text style={styles.sectionHeader}>Personal Bests</Text>
            <View style={styles.bestsRow}>
              {(Object.keys(GAME_MODES) as GameModeKey[]).map((key) => (
                <View
                  key={key}
                  style={[styles.bestCard, { borderColor: GAME_MODES[key].accentColor }]}
                >
                  <Text style={styles.bestEmoji}>{GAME_MODES[key].emoji}</Text>
                  <Text style={[styles.bestScore, { color: GAME_MODES[key].accentColor }]}>
                    {bestScores[key]}
                  </Text>
                  <Text style={styles.bestLabel}>{GAME_MODES[key].name}</Text>
                </View>
              ))}
            </View>

            {message ? (
              <View style={styles.messageBanner}>
                <Text style={styles.messageText}>{message}</Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      )}

      {/* ── Select Screen ───────────────────────────────────────────────── */}
      {screen === 'select' && (
        <SafeAreaView style={styles.screen}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.navRow}>
              <Pressable onPress={() => setScreen('landing')} style={styles.backBtn}>
                <Text style={styles.backBtnText}>← Back</Text>
              </Pressable>
              <Text style={styles.navTitle}>Choose Your Sport</Text>
              <View style={{ width: 64 }} />
            </View>

            {(Object.keys(GAME_MODES) as GameModeKey[]).map((key) => {
              const mode = GAME_MODES[key];
              const progress = modeProgress[key];
              const level = getMasteryLevel(progress.points);
              const nextTier = getNextMasteryTier(progress.points);
              const daily = dailyChallenges[key];
              const dailyCleared = progress.dailyCompletedDate === dayKey;
              return (
                <View
                  key={key}
                  style={[
                    styles.modeCard,
                    { borderColor: mode.accentColor, backgroundColor: mode.dimColor },
                  ]}
                >
                  <View style={[styles.modeCardBackdrop, { backgroundColor: mode.accentColor + '18' }]} />
                  <View style={styles.modeCardTop}>
                    <Text style={styles.modeEmoji}>{mode.emoji}</Text>
                    <View style={styles.modeCardInfo}>
                      <Text style={[styles.modeCardName, { color: mode.accentColor }]}>
                        {mode.name}
                      </Text>
                      <Text style={styles.modeCardDesc}>{mode.description}</Text>
                    </View>
                    <View
                      style={[styles.multiplierBadge, { backgroundColor: mode.accentColor }]}
                    >
                      <Text style={styles.multiplierText}>x{mode.tokenMultiplier}</Text>
                    </View>
                  </View>
                  <View style={styles.modeCardBottom}>
                    <Text style={styles.modeCardRule}>{mode.shortRules}</Text>
                    <Text style={styles.modeCardBest}>
                      Best: <Text style={{ color: mode.accentColor }}>{bestScores[key]}</Text>
                    </Text>
                  </View>
                  <View style={styles.modeCardScene}>
                    <View style={[styles.modeSceneOrb, { backgroundColor: mode.accentColor }]} />
                    <View style={[styles.modeSceneLine, { backgroundColor: mode.accentColor + '88' }]} />
                    <Text style={styles.modeSceneCopy}>{MODE_MASTERIES[key][level]}</Text>
                    <Text style={styles.modeSceneSub}>
                      Mastery {progress.points} pts
                      {nextTier ? ` • Next at ${nextTier.points}` : ' • Max tier'}
                    </Text>
                  </View>
                  <View style={styles.dailyCard}>
                    <Text style={[styles.dailyCardTitle, { color: mode.accentColor }]}>
                      {daily.badge} Daily: {daily.modifierName}
                    </Text>
                    <Text style={styles.dailyCardText}>{daily.objectiveText}</Text>
                    <Text style={styles.dailyCardSub}>
                      {daily.modifierText} • Reward {daily.rewardTokens + (level >= 3 ? 10 : 0)} tokens
                    </Text>
                  </View>
                  <View style={styles.modeActionRow}>
                    <Pressable
                      onPress={() => startGame(key)}
                      style={({ pressed }) => [
                        styles.startPill,
                        styles.modeActionBtn,
                        { backgroundColor: mode.accentColor },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.startPillText}>Normal Run</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => startGame(key, true)}
                      style={({ pressed }) => [
                        styles.modeActionBtn,
                        styles.dailyStartBtn,
                        dailyCleared && styles.dailyStartBtnDone,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.dailyStartBtnText}>{dailyCleared ? 'Daily Cleared' : 'Play Daily'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      )}

      {/* ── Game Screen ─────────────────────────────────────────────────── */}
      {screen === 'game' && (
        <SafeAreaView style={[styles.screen, { backgroundColor: activeMode.dimColor }]}>
          {/* HUD */}
          <View style={[styles.gameHud, { borderBottomColor: activeMode.accentColor }]}>
            <Pressable
              onPress={() => {
                if (isPlaying) {
                  setMessage('Finish your run to exit.');
                } else {
                  setScreen('select');
                }
              }}
              style={styles.hudBack}
            >
              <Text style={[styles.hudBackText, isPlaying && styles.hudBackDisabled]}>←</Text>
            </Pressable>
            <View style={styles.hudCenter}>
              <Text style={[styles.hudMode, { color: activeMode.accentColor }]}>
                {activeMode.emoji}  {activeMode.name}
              </Text>
            </View>
            <View style={styles.hudRight}>
              <Text style={styles.hudStat}>Score {score}</Text>
              <Text style={styles.hudStat}>🛡 {shields}</Text>
              {slowMotionSeconds > 0 && (
                <Text style={[styles.hudStat, { color: '#FFD700' }]}>⏱ {slowMotionSeconds}s</Text>
              )}
            </View>
          </View>

          {/* Sensitivity control row */}
          <View style={[styles.sensHudRow, { borderBottomColor: activeMode.accentColor + '55' }]}>
            <Pressable
              onPress={() => {
                const v = clamp(sensitivity - 0.25, 0.5, 2.0);
                setSensitivity(v);
                sensitivityRef.current = v;
              }}
              style={styles.sensBtnWrap}
            >
              <Text style={styles.sensBtn}>−</Text>
            </Pressable>
            <Text style={styles.sensLabel}>Sensitivity ×{sensitivity.toFixed(2)}</Text>
            <Pressable
              onPress={() => {
                const v = clamp(sensitivity + 0.25, 0.5, 2.0);
                setSensitivity(v);
                sensitivityRef.current = v;
              }}
              style={styles.sensBtnWrap}
            >
              <Text style={styles.sensBtn}>+</Text>
            </Pressable>
          </View>

          {/* Game content */}
          {selectedMode === 'surf' && renderSurfGame()}
          {selectedMode === 'skate' && renderSkateGame()}
          {selectedMode === 'hackey' && renderHackeyGame()}
          {selectedMode === 'skydive' && renderSkydiveGame()}
          {selectedMode === 'boxrace' && renderBoxRaceGame()}
          {isPlaying && renderChallengeBanner()}

          {/* Hit flash overlay */}
          {hitFlash && (
            <View
              style={styles.hitFlashOverlay}
              pointerEvents="none"
            />
          )}

          {/* Milestone toast */}
          {milestoneMsg ? (
            <View style={styles.milestoneToast} pointerEvents="none">
              <Text style={styles.milestoneToastText}>{milestoneMsg}</Text>
            </View>
          ) : null}

          {/* Difficulty stage badge */}
          {isPlaying && diffStage > 1 && (
            <View style={[styles.stageBadge, { backgroundColor: diffStage === 3 ? '#FF3333' : '#FFB830' }]} pointerEvents="none">
              <Text style={styles.stageBadgeText}>{diffStage === 3 ? '🔥 EXPERT' : '⚡ PRO'}</Text>
            </View>
          )}

          {/* In-game message strip */}
          {isPlaying && message ? (
            <View style={[styles.inGameMsg, { backgroundColor: activeMode.accentColor + '33' }]}>
              <Text style={[styles.inGameMsgText, { color: activeMode.accentColor }]}>
                {message}
              </Text>
            </View>
          ) : null}
        </SafeAreaView>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#08101E',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 32,
  },
  pressed: { opacity: 0.75 },

  // ── Landing ──────────────────────────────────────────────────────────────
  heroSection: {
    minHeight: 300,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 22,
    marginBottom: 18,
    backgroundColor: '#112742',
    borderWidth: 1,
    borderColor: '#1E4263',
    justifyContent: 'space-between',
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#09192D',
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -50,
    top: -30,
    backgroundColor: '#0E4460',
    opacity: 0.65,
  },
  heroCopy: { maxWidth: '56%', gap: 8 },
  heroKicker: {
    color: '#8FCFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroTitle: { color: '#F5FBFF', fontSize: 40, fontWeight: '900', letterSpacing: 0.8 },
  heroTagline: { color: '#9FD0F6', fontSize: 17, fontWeight: '700', lineHeight: 22 },
  heroDesc: { color: '#BED6EA', fontSize: 14, lineHeight: 21 },
  heroPortraitWrap: {
    position: 'absolute',
    right: 14,
    bottom: 14,
  },
  featureCard: {
    backgroundColor: '#0E1E30',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#21415F',
    padding: 18,
    marginBottom: 16,
  },
  featureCopy: { gap: 8 },
  featureEyebrow: {
    color: '#56B0FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  featureTitle: { color: '#F1F8FF', fontSize: 24, fontWeight: '800' },
  featureBody: { color: '#92B6D2', fontSize: 14, lineHeight: 20 },
  featureSkills: { gap: 8, marginTop: 4 },
  statsBar: {
    flexDirection: 'row', backgroundColor: '#0E1E30', borderRadius: 18,
    borderWidth: 1, borderColor: '#1E3550', paddingVertical: 16,
    marginBottom: 18, alignItems: 'center', justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center', gap: 4 },
  statValue: { color: '#E6F4FF', fontWeight: '700', fontSize: 18 },
  statLabel: { color: '#6E97BB', fontSize: 11, fontWeight: '600' },
  statDivider: { width: 1, height: 32, backgroundColor: '#1E3550' },
  charDot: { width: 18, height: 18, borderRadius: 9 },
  primaryBtn: { backgroundColor: '#56B0FF', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#06111E', fontWeight: '800', fontSize: 18, letterSpacing: 0.5 },
  secondaryBtn: {
    backgroundColor: '#0E1E30', borderWidth: 1, borderColor: '#1E3550',
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  secondaryBtnText: { color: '#CFE8FF', fontWeight: '700', fontSize: 15 },
  adBtn: {
    backgroundColor: '#1A3D25', borderWidth: 1, borderColor: '#2E7048',
    borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 20,
  },
  adBtnDisabled: { opacity: 0.5 },
  adBtnText: { color: '#7ED8A0', fontWeight: '700', fontSize: 14 },
  sectionHeader: { color: '#94B8D4', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  bestsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  bestCard: { flex: 1, backgroundColor: '#0E1E30', borderRadius: 12, borderWidth: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  bestEmoji: { fontSize: 22 },
  bestScore: { fontSize: 22, fontWeight: '800' },
  bestLabel: { color: '#5E84A2', fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // ── Select ────────────────────────────────────────────────────────────────
  navRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, justifyContent: 'space-between' },
  backBtn: { paddingVertical: 8, paddingHorizontal: 4, width: 64 },
  backBtnText: { color: '#7FB4D8', fontWeight: '700', fontSize: 15 },
  navTitle: { color: '#E6F7FF', fontWeight: '800', fontSize: 18 },
  modeCard: { borderWidth: 1.5, borderRadius: 20, padding: 16, marginBottom: 16, gap: 12, overflow: 'hidden' },
  modeCardBackdrop: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  modeCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeEmoji: { fontSize: 36 },
  modeCardInfo: { flex: 1, gap: 3 },
  modeCardName: { fontWeight: '800', fontSize: 20 },
  modeCardDesc: { color: '#8AAEC8', fontSize: 13, lineHeight: 18 },
  multiplierBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  multiplierText: { color: '#06111E', fontWeight: '800', fontSize: 13 },
  modeCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeCardRule: { color: '#6E97BB', fontSize: 13, flex: 1 },
  modeCardBest: { color: '#6E97BB', fontSize: 13, fontWeight: '600' },
  modeCardScene: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A3550',
    padding: 12,
    backgroundColor: '#081523AA',
    gap: 8,
  },
  modeSceneOrb: { width: 42, height: 42, borderRadius: 21, opacity: 0.8 },
  modeSceneLine: { height: 5, borderRadius: 999, width: '55%' },
  modeSceneCopy: { color: '#A9C5DD', fontSize: 12, fontWeight: '600' },
  modeSceneSub: { color: '#6E97BB', fontSize: 11, fontWeight: '600' },
  dailyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1D3B57',
    padding: 12,
    backgroundColor: '#081523CC',
    gap: 4,
  },
  dailyCardTitle: { fontWeight: '800', fontSize: 13 },
  dailyCardText: { color: '#D3E8FA', fontSize: 13, fontWeight: '700' },
  dailyCardSub: { color: '#6E97BB', fontSize: 11, lineHeight: 16 },
  modeActionRow: { flexDirection: 'row', gap: 10 },
  modeActionBtn: { flex: 1 },
  startPill: { borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  startPillText: { color: '#06111E', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  dailyStartBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#35506B',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0B1927',
  },
  dailyStartBtnDone: {
    backgroundColor: '#12311D',
    borderColor: '#2E7048',
  },
  dailyStartBtnText: { color: '#CFE8FF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },

  // ── HUD ───────────────────────────────────────────────────────────────────
  gameHud: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, backgroundColor: '#08101E', gap: 8,
  },
  hudBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hudBackText: { color: '#7FB4D8', fontSize: 22, fontWeight: '700' },
  hudBackDisabled: { opacity: 0.25 },
  hudCenter: { flex: 1, alignItems: 'center' },
  hudMode: { fontWeight: '800', fontSize: 15 },
  hudRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hudStat: { color: '#CFE8FF', fontWeight: '700', fontSize: 13 },

  // ── Game area ─────────────────────────────────────────────────────────────
  gameArea: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#111D30' },
  actionCharacterWrap: {
    position: 'absolute',
    width: 56,
    height: 72,
  },
  actionCharacterGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    top: 8,
    left: 8,
    opacity: 0.18,
  },
  actionBoard: {
    position: 'absolute',
    left: 6,
    bottom: 8,
    width: 44,
    height: 10,
    borderRadius: 999,
  },
  actionSkateWheel: {
    position: 'absolute',
    bottom: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0D1522',
    borderWidth: 1,
    borderColor: '#FFFFFF55',
  },
  actionSkateWheelLeft: { left: 12 },
  actionSkateWheelRight: { right: 12 },
  actionRaceBody: {
    position: 'absolute',
    left: 4,
    bottom: 2,
    width: 48,
    height: 18,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF44',
  },
  actionCanopy: {
    position: 'absolute',
    top: 0,
    left: 6,
    width: 44,
    height: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  actionCanopyLine: {
    position: 'absolute',
    top: 16,
    width: 2,
    height: 20,
    backgroundColor: '#D5E7F2',
  },
  actionCanopyLineLeft: { left: 18, transform: [{ rotate: '12deg' }] },
  actionCanopyLineRight: { right: 18, transform: [{ rotate: '-12deg' }] },
  actionLeg: {
    position: 'absolute',
    bottom: 18,
    width: 8,
    height: 22,
    borderRadius: 8,
  },
  actionLegLeft: { left: 17, transform: [{ rotate: '8deg' }] },
  actionLegRight: { right: 17, transform: [{ rotate: '-8deg' }] },
  actionArm: {
    position: 'absolute',
    top: 30,
    width: 7,
    height: 20,
    borderRadius: 7,
  },
  actionArmLeft: { left: 11, transform: [{ rotate: '28deg' }] },
  actionArmRight: { right: 11, transform: [{ rotate: '-28deg' }] },
  actionTorso: {
    position: 'absolute',
    top: 26,
    left: 16,
    width: 24,
    height: 26,
    borderRadius: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  actionNeck: {
    position: 'absolute',
    top: 21,
    left: 24,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F4C6A2',
  },
  actionHead: {
    position: 'absolute',
    top: 8,
    left: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F4C6A2',
  },
  actionHair: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 11,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  actionFace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 5,
  },
  actionEyes: { flexDirection: 'row', gap: 4 },
  actionEye: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#102030' },

  // ── Surf ──────────────────────────────────────────────────────────────────
  surfSky: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#08233A',
  },
  surfSun: {
    position: 'absolute',
    top: '14%',
    right: '12%',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FFBE7A',
    opacity: 0.85,
  },
  surfCliff: {
    position: 'absolute',
    top: '28%',
    width: '28%',
    height: '18%',
    backgroundColor: '#1D4053',
  },
  surfCliffLeft: {
    left: '-4%',
    borderTopRightRadius: 40,
    borderBottomRightRadius: 22,
  },
  surfCliffRight: {
    right: '-2%',
    borderTopLeftRadius: 46,
    borderBottomLeftRadius: 18,
  },
  surfOcean: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#0A3A6A', opacity: 0.85,
  },
  surfOceanGlow: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    bottom: '12%',
    height: '16%',
    borderRadius: 40,
    backgroundColor: '#2ECFFF22',
  },
  waveCrease: {
    position: 'absolute', left: 0, right: 0, height: 5,
    backgroundColor: '#4DD0FF', opacity: 0.7, borderRadius: 3,
  },
  waveFoam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#DDF8FF33',
  },
  sweetZone: {
    position: 'absolute', left: '35%', right: '35%', top: 0, bottom: 0,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#56B0FF22',
  },
  sweetZoneGlow: {
    ...StyleSheet.absoluteFill, backgroundColor: '#56B0FF18', borderRadius: 4,
  },
  whitewaterZone: {
    position: 'absolute', height: 36, backgroundColor: '#FFFFFFCC',
    borderRadius: 8, opacity: 0.85,
  },
  surfer: {
    position: 'absolute', width: 32, height: 32, borderRadius: 16,
    borderWidth: 3, borderColor: '#FFFFFF55',
  },
  surfHudOverlay: {
    position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', gap: 4,
  },
  tubeLabel: { color: '#56B0FF', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  trickLabel: { color: '#FFD700', fontWeight: '800', fontSize: 18 },

  // ── Skate ─────────────────────────────────────────────────────────────────
  skateSky: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#1B0F1F',
  },
  skateSun: {
    position: 'absolute',
    top: '10%',
    left: '12%',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#FF8E5B',
    opacity: 0.5,
  },
  skateCityline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '24%',
    height: '18%',
    backgroundColor: '#120914',
    borderTopWidth: 2,
    borderColor: '#5A2A2A',
  },
  skateCrowdGlow: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    bottom: '20%',
    height: '6%',
    borderRadius: 999,
    backgroundColor: '#FF6B6B33',
  },
  pipeLeft: {
    position: 'absolute', left: 0, top: '20%', bottom: 0, width: '12%',
    backgroundColor: '#2A1A0A', borderTopRightRadius: 120, borderRightWidth: 3, borderColor: '#8B5C2A',
  },
  pipeRight: {
    position: 'absolute', right: 0, top: '20%', bottom: 0, width: '12%',
    backgroundColor: '#2A1A0A', borderTopLeftRadius: 120, borderLeftWidth: 3, borderColor: '#8B5C2A',
  },
  pipeBottom: {
    position: 'absolute', left: '12%', right: '12%', bottom: 0, height: '25%',
    backgroundColor: '#1A0F07', borderTopWidth: 3, borderColor: '#6B4520',
  },
  coping: {
    position: 'absolute', top: '20%', width: 14, height: 14,
    borderRadius: 7, backgroundColor: '#CCA060',
  },
  skateRail: {
    position: 'absolute', top: '20%', width: 6, height: 60,
    backgroundColor: '#AAAAAA', borderRadius: 3,
  },
  skater: {
    position: 'absolute', width: 28, height: 28, borderRadius: 6,
    borderWidth: 2, borderColor: '#FFFFFF55',
  },
  trickBubble: {
    position: 'absolute', top: '10%', left: '20%', right: '20%',
    backgroundColor: '#1A0F07EE', borderRadius: 14, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#FF6B6B',
  },
  trickBubbleText: { color: '#FF6B6B', fontWeight: '800', fontSize: 18 },
  trickBubbleSub: { color: '#CC8866', fontSize: 12, marginTop: 2 },
  skateHint: {
    position: 'absolute', bottom: 14, left: 0, right: 0,
    textAlign: 'center', color: '#5E3A1A', fontWeight: '700', fontSize: 12,
  },

  // ── Hackey ────────────────────────────────────────────────────────────────
  hackeyArenaGlow: {
    position: 'absolute',
    top: '12%',
    left: '14%',
    right: '14%',
    height: '20%',
    borderRadius: 999,
    backgroundColor: '#8A5CFF22',
  },
  hackeyArenaLights: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '8%',
    height: 18,
    backgroundColor: '#2A144A',
    borderBottomWidth: 1,
    borderColor: '#6030A0',
  },
  hackeyTrack: {
    position: 'absolute', top: '10%', left: '8%', right: '8%', bottom: '18%',
    borderRadius: 500, borderWidth: 1, borderColor: '#3A2A60', backgroundColor: '#140D2A',
  },
  hackeyOrbitRing: {
    position: 'absolute',
    top: '19%',
    left: '19%',
    right: '19%',
    bottom: '27%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#9B74FF44',
  },
  hackeyCenterSpot: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    left: '50%',
    top: '50%',
    marginLeft: -32,
    marginTop: -32,
    backgroundColor: '#8A5CFF20',
    borderWidth: 1,
    borderColor: '#B38CFF44',
  },
  hackeySack: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E8C850', borderWidth: 2, borderColor: '#FFD700',
    zIndex: 10,
  },
  hackeyPlayer: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  hackeyTargetPulse: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#F8E4FF',
    opacity: 0.7,
  },
  hackeyPlayerHead: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginBottom: 3,
  },
  hackeyPlayerBody: {
    width: 18,
    height: 16,
    borderRadius: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  hackeyWindowBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
    backgroundColor: '#1A0D33',
  },
  hackeyWindowFill: { height: 8, borderRadius: 4 },
  hackeyStats: {
    position: 'absolute', bottom: 16, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
  },
  hackeyStatText: { color: '#CFE8FF', fontWeight: '700', fontSize: 14 },
  hackeyHint: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#8A75B6',
    fontWeight: '700',
    fontSize: 12,
  },

  // ── Game Over ─────────────────────────────────────────────────────────────
  gameOverOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,10,18,0.92)', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 32,
  },
  gameOverTitle: { color: '#94B8D4', fontSize: 16, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  gameOverScore: { color: '#E6F7FF', fontSize: 64, fontWeight: '800', lineHeight: 72 },
  gameOverLabel: { color: '#5E84A2', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  gameOverBest: { color: '#7FA8C7', fontSize: 14, marginBottom: 16 },
  gameOverMsg: { color: '#7ED8A0', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  gameOverBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  gameOverBtnText: { color: '#06111E', fontWeight: '800', fontSize: 17 },
  gameOverSecondary: { paddingVertical: 12, alignItems: 'center' },
  gameOverSecondaryText: { color: '#7FB4D8', fontWeight: '700', fontSize: 15 },
  gameOverAdBtn: { paddingVertical: 10, alignItems: 'center' },
  gameOverAdText: { color: '#7ED8A0', fontWeight: '700', fontSize: 14 },
  gameOverChallengeWrap: {
    width: '86%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#264766',
    backgroundColor: '#0B1B2BCC',
    padding: 12,
    gap: 4,
    marginTop: 8,
  },
  gameOverChallengeTitle: { color: '#E6F4FF', fontWeight: '800', fontSize: 13 },
  gameOverChallengeText: { color: '#9AC2DF', fontSize: 12, lineHeight: 17 },
  gameOverReplayText: { color: '#7FA8C7', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 4 },

  // ── In-game message ────────────────────────────────────────────────────────
  inGameMsg: { paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' },
  inGameMsgText: { fontWeight: '700', fontSize: 13 },

  // ── Character Modal ───────────────────────────────────────────────────────
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: '#0C1B2C', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 18, paddingBottom: 32, maxHeight: '85%',
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#2A4560', borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { color: '#E6F7FF', fontWeight: '800', fontSize: 20 },
  modalClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { color: '#5E84A2', fontSize: 18, fontWeight: '700' },
  modalTokens: { color: '#56B0FF', fontWeight: '700', fontSize: 14, marginBottom: 12 },
  charCard: {
    flexDirection: 'row', backgroundColor: '#0E1E30', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#1E3550', marginBottom: 10, overflow: 'hidden',
  },
  charColorBar: { width: 6 },
  charArtWrap: { paddingVertical: 10, paddingLeft: 10 },
  charCardBody: { flex: 1, padding: 12, gap: 6 },
  charCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  charCardIdentity: { flex: 1, gap: 2, paddingRight: 8 },
  charCardName: { color: '#E6F7FF', fontWeight: '700', fontSize: 15 },
  charCardPersona: { color: '#79A6C8', fontSize: 12, fontWeight: '600' },
  charCardBadgeColumn: { alignItems: 'flex-end', justifyContent: 'center' },
  charBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  charBadgeOwned: { backgroundColor: '#1E3550' },
  charBadgeEquipped: { backgroundColor: '#1B4D2A' },
  charBadgeLocked: { backgroundColor: '#2A2A40', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  charBadgeText: { color: '#CFE8FF', fontSize: 11, fontWeight: '700' },
  charCardDesc: { color: '#7FA8C7', fontSize: 12 },
  charCardMove: { color: '#D8E9F9', fontSize: 12, lineHeight: 18 },
  charCardSub: { color: '#4E7490', fontSize: 12 },
  charSkillsPanel: { gap: 6, marginTop: 2 },
  characterPortraitFrame: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#0C1621',
  },
  characterPortraitAura: {
    position: 'absolute',
    width: '80%',
    height: '55%',
    borderRadius: 999,
    top: '10%',
    right: '-8%',
    opacity: 0.2,
  },
  characterPortraitSky: {
    ...StyleSheet.absoluteFill,
    opacity: 0.9,
  },
  characterPortraitSun: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    top: 14,
    right: 14,
    opacity: 0.78,
  },
  characterPortraitGround: {
    position: 'absolute',
    left: -10,
    right: -10,
    bottom: 0,
    height: '28%',
    opacity: 0.35,
  },
  characterPortraitBoard: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    bottom: '18%',
    height: 10,
    borderRadius: 999,
    opacity: 0.9,
  },
  characterPortraitFigure: {
    position: 'absolute',
    left: '50%',
    top: '48%',
    width: 82,
    height: 110,
    marginLeft: -41,
    marginTop: -55,
  },
  characterPortraitLeg: {
    position: 'absolute',
    bottom: 18,
    width: 12,
    height: 34,
    borderRadius: 10,
  },
  characterPortraitLegLeft: { left: 24, transform: [{ rotate: '8deg' }] },
  characterPortraitLegRight: { right: 24, transform: [{ rotate: '-8deg' }] },
  characterPortraitArm: {
    position: 'absolute',
    top: 40,
    width: 10,
    height: 28,
    borderRadius: 10,
  },
  characterPortraitArmLeft: { left: 14, transform: [{ rotate: '24deg' }] },
  characterPortraitArmRight: { right: 14, transform: [{ rotate: '-24deg' }] },
  characterPortraitTorso: {
    position: 'absolute',
    top: 34,
    left: 24,
    width: 34,
    height: 38,
    borderRadius: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  characterPortraitNeck: {
    position: 'absolute',
    top: 26,
    left: 37,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F4C6A2',
  },
  characterPortraitHead: {
    position: 'absolute',
    top: 6,
    left: 26,
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: '#F4C6A2',
  },
  characterPortraitHair: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 16,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  characterPortraitFace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
  },
  characterPortraitEyeRow: { flexDirection: 'row', gap: 6 },
  characterPortraitEye: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0D2133' },
  characterPortraitBadge: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#08111CDD',
    borderWidth: 1,
    borderColor: '#29445F',
  },
  characterPortraitBadgeText: {
    color: '#E9F5FF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Shared ────────────────────────────────────────────────────────────────
  messageBanner: {
    backgroundColor: '#0E2820', borderRadius: 10, borderWidth: 1, borderColor: '#2E7048',
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14, alignItems: 'center',
  },
  messageText: { color: '#7ED8A0', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  skillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skillLabel: { color: '#95B8D4', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  skillDots: { flexDirection: 'row', gap: 5 },
  skillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },

  // ── Skydive ────────────────────────────────────────────────────────────────
  skyBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0A2A5C',
  },
  skyGlow: {
    position: 'absolute',
    top: '8%',
    left: '12%',
    right: '12%',
    height: '18%',
    borderRadius: 999,
    backgroundColor: '#7FDBFF22',
  },
  skySun: {
    position: 'absolute',
    top: '12%',
    left: '16%',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFF1A4',
    opacity: 0.55,
  },
  skyHorizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '10%',
    height: '22%',
    backgroundColor: '#2A537B44',
  },
  skyCloudBandTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '24%',
    height: '12%',
    backgroundColor: '#A2D9FF22',
  },
  skyCloudBandBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '24%',
    height: '10%',
    backgroundColor: '#88BCE933',
  },
  skyWindStreak: {
    position: 'absolute',
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D9F8FF66',
  },
  skyCloud: {
    position: 'absolute',
    backgroundColor: '#FFFFFFAA',
  },
  gateRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gateWall: {
    height: 22,
    backgroundColor: '#FF4444',
    opacity: 0.85,
    borderRadius: 4,
  },
  gateGap: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#00E5C8',
  },
  gateCore: {
    width: '68%',
    height: 4,
    borderRadius: 999,
    backgroundColor: '#5FFFE8AA',
  },
  skydiver: {
    position: 'absolute',
    top: '78%',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#FFFFFF66',
  },
  skyHud: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  skyHudText: {
    color: '#00E5C8',
    fontWeight: '800',
    fontSize: 14,
  },
  skyHint: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#1A4A7A',
    fontWeight: '700',
    fontSize: 12,
  },

  // ── Box Race ──────────────────────────────────────────────────────────────
  raceCrowdGlow: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '8%',
    height: '12%',
    borderRadius: 999,
    backgroundColor: '#FFB83022',
  },
  raceTrack: {
    ...StyleSheet.absoluteFill,
    marginHorizontal: '8%',
    backgroundColor: '#1A1000',
    borderRadius: 0,
  },
  raceEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#FFB830',
    opacity: 0.7,
  },
  raceRumbleStrip: {
    position: 'absolute',
    top: '8%',
    bottom: '8%',
    width: 4,
    backgroundColor: '#FFD58166',
    borderRadius: 4,
  },
  raceCheckBanner: {
    position: 'absolute',
    left: '14%',
    right: '14%',
    top: '8%',
    height: 10,
    borderRadius: 4,
    backgroundColor: '#FFFFFF33',
    borderWidth: 1,
    borderColor: '#FFE6AA66',
  },
  raceLaneStripe: {
    position: 'absolute',
    left: '48%',
    right: '48%',
    top: '10%',
    bottom: '54%',
    backgroundColor: '#FFE09A55',
    borderRadius: 999,
  },
  raceLaneStripeBottom: {
    top: '58%',
    bottom: '8%',
  },
  raceScanline: {
    position: 'absolute',
    left: '9%',
    right: '9%',
    top: '48%',
    height: 2,
    backgroundColor: '#FFC95E55',
  },
  boostPad: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#1A3A00',
    borderWidth: 2,
    borderColor: '#88FF44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostEmoji: { fontSize: 18 },
  rivalBox: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rivalBoxEmoji: { fontSize: 24 },
  playerBox: {
    position: 'absolute',
    top: '82%',
    width: 60,
    height: 60,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#FFFFFF99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerBoxGlow: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: -8,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#FFD16C55',
  },
  playerBoxEmoji: { fontSize: 26 },
  raceHud: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  raceHudText: {
    color: '#FFE5A6',
    fontWeight: '800',
    fontSize: 13,
  },
  raceHint: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#4A3000',
    fontWeight: '700',
    fontSize: 12,
  },

  // ── Surf — wave & board enhancements ─────────────────────────────────────
  waveShoulder: {
    position: 'absolute',
    width: 130,
    height: 55,
    borderTopLeftRadius: 65,
    borderTopRightRadius: 90,
    backgroundColor: '#0B5F9C',
    opacity: 0.72,
  },
  waveLip: {
    position: 'absolute',
    width: 70,
    height: 26,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 6,
    backgroundColor: '#4DD0FF',
    opacity: 0.65,
    transform: [{ rotate: '-8deg' }],
  },
  gameSurfboard: {
    position: 'absolute',
    width: 82,
    height: 13,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFBE7A88',
    opacity: 0.97,
  },

  // ── Skate — board & half-pipe enhancements ────────────────────────────────
  skateboardDeck: {
    position: 'absolute',
    width: 56,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#D45A10',
    borderWidth: 1,
    borderColor: '#FF9A44',
    overflow: 'visible',
  },
  skateboardWheelG: {
    position: 'absolute',
    bottom: -6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#888888',
  },
  pipeDeck: {
    position: 'absolute',
    top: '20%',
    width: '10%',
    height: '2%',
    backgroundColor: '#5C3D1A',
    borderBottomWidth: 2,
    borderColor: '#8B5C2A',
  },
  pipeTransitionLeft: {
    position: 'absolute',
    left: '9%',
    top: '55%',
    width: '7%',
    height: '20%',
    borderTopRightRadius: 80,
    backgroundColor: '#1A0F07',
    borderRightWidth: 2,
    borderColor: '#5C3010',
  },
  pipeTransitionRight: {
    position: 'absolute',
    right: '9%',
    top: '55%',
    width: '7%',
    height: '20%',
    borderTopLeftRadius: 80,
    backgroundColor: '#1A0F07',
    borderLeftWidth: 2,
    borderColor: '#5C3010',
  },

  // ── Controls tutorial overlay ──────────────────────────────────────────────
  controlsTipOverlay: {
    position: 'absolute',
    bottom: '14%',
    left: '4%',
    right: '4%',
    backgroundColor: 'rgba(6,12,22,0.90)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E3D60',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
    zIndex: 20,
  },
  controlsTipTitle: {
    color: '#E6F4FF',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 2,
  },
  controlsTipLine: {
    color: '#A8CDED',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
  },
  controlsTipDim: {
    color: '#4A7090',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 2,
  },

  // ── Sensitivity HUD row ────────────────────────────────────────────────────
  sensHudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    backgroundColor: '#0A1520',
    gap: 12,
  },
  sensBtnWrap: {
    width: 32,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A3050',
    borderRadius: 6,
  },
  sensBtn: { color: '#CFE8FF', fontWeight: '800', fontSize: 16 },
  sensLabel: { color: '#6E97BB', fontWeight: '700', fontSize: 12, flex: 1, textAlign: 'center' },

  // ── New: Hit flash, milestone, stage badge ────────────────────────────────
  hitFlashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FF000044',
    zIndex: 50,
  },
  milestoneToast: {
    position: 'absolute',
    top: '8%',
    alignSelf: 'center',
    backgroundColor: '#FFD70022',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 18,
    zIndex: 60,
  },
  milestoneToastText: { color: '#FFD700', fontWeight: '800', fontSize: 15 },
  stageBadge: {
    position: 'absolute',
    top: '3%',
    right: '3%',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    zIndex: 55,
  },
  stageBadgeText: { color: '#06111E', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },

  // ── New: Barrel charge ────────────────────────────────────────────────────
  barrelChargeBar: {
    height: 6,
    width: 100,
    backgroundColor: '#1A3050',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  barrelChargeFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },

  // ── New: Style Meter ──────────────────────────────────────────────────────
  styleMeterWrap: {
    position: 'absolute',
    bottom: '14%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 4,
    zIndex: 40,
  },
  styleMeterLabel: { color: '#E6FFCC', fontWeight: '700', fontSize: 13 },
  styleMeterBar: {
    width: 140,
    height: 8,
    backgroundColor: '#1A2E1A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  styleMeterFill: { height: '100%', borderRadius: 4 },

  // ── New: Hackey perfect ───────────────────────────────────────────────────
  hackeyPerfectMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#A0FF80',
  },
  hackeyPerfectLabel: {
    textAlign: 'center',
    color: '#A0FF80',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  hackeyPerfectFlash: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    color: '#FFD700',
    fontWeight: '900',
    fontSize: 28,
    zIndex: 60,
  },

  // ── New: Sky perfect flash ────────────────────────────────────────────────
  skyPerfectFlash: {
    position: 'absolute',
    top: '62%',
    alignSelf: 'center',
    color: '#00FFD0',
    fontWeight: '900',
    fontSize: 22,
    zIndex: 60,
  },

  // ── New: Slipstream ───────────────────────────────────────────────────────
  slipstreamBar: {
    position: 'absolute',
    bottom: '18%',
    alignSelf: 'center',
    width: 140,
    height: 12,
    backgroundColor: '#1A2030',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 40,
  },
  slipstreamFill: { height: '100%', backgroundColor: '#56B0FF', borderRadius: 6 },
  slipstreamLabel: { position: 'absolute', top: -14, alignSelf: 'center', color: '#56B0FF', fontSize: 11, fontWeight: '700' },
  slipstreamActiveText: {
    position: 'absolute',
    bottom: '22%',
    alignSelf: 'center',
    color: '#56B0FF',
    fontWeight: '900',
    fontSize: 22,
    zIndex: 60,
  },

  // ── New: Game-over summary ────────────────────────────────────────────────
  gameOverSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
    paddingVertical: 2,
  },
  gameOverSummaryLabel: { color: '#6E97BB', fontSize: 13, fontWeight: '600' },
  gameOverSummaryValue: { color: '#E6F4FF', fontSize: 13, fontWeight: '700' },
  challengeBanner: {
    position: 'absolute',
    top: '10%',
    left: '4%',
    right: '4%',
    borderRadius: 14,
    backgroundColor: '#081523EE',
    borderWidth: 1,
    borderColor: '#2A4560',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
    zIndex: 45,
  },
  challengeBannerTitle: { color: '#E6F4FF', fontWeight: '800', fontSize: 13 },
  challengeBannerText: { color: '#A9C5DD', fontSize: 12, lineHeight: 17 },
  challengeBannerObjective: { color: '#FFD700', fontWeight: '700', fontSize: 12 },
});
