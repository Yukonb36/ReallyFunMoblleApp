import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// ─── Constants ────────────────────────────────────────────────────────────────
const TICK_MS = 50; // ~20 fps game tick
const SLOW_MOTION_BASE_DURATION = 18;
const DEFAULT_LOG_DIR = `${FileSystem.documentDirectory ?? ''}alpha-logs/`;
const DEFAULT_LOG_FILE = `${DEFAULT_LOG_DIR}alpha-errors.txt`;
const { width: SCREEN_W } = Dimensions.get('window');
const DRAG_DEADZONE_PX = 10;
const SURF_DRAG_SENSITIVITY = 0.55;
const SKY_DRAG_SENSITIVITY = 0.22;
const BOX_DRAG_SENSITIVITY = 0.24;
const SKATE_PUMP_SENSITIVITY = 0.18;
const FLICK_TRICK_VELOCITY = -1.15;

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

// ─── Helper ───────────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const applyGestureDeadzone = (distance: number) =>
  Math.abs(distance) <= DRAG_DEADZONE_PX
    ? 0
    : distance - Math.sign(distance) * DRAG_DEADZONE_PX;

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
  const isPlayingRef = useRef(false);

  // ── Surf state ────────────────────────────────────────────────────────────
  const [surferX, setSurferX] = useState(0.5);          // 0-1 across wave face
  const [waveZones, setWaveZones] = useState<WaveZone[]>([]); // danger whitewater
  const [trickAirborne, setTrickAirborne] = useState(false);
  const [tubeMultiplier, setTubeMultiplier] = useState(1);
  const surferXRef = useRef(0.5);
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
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      angle: (i * Math.PI * 2) / 6,
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

  const activeMode = GAME_MODES[selectedMode];
  const activeCharacter = CHARACTERS.find((c) => c.id === selectedCharacterId) ?? CHARACTERS[0];

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
    if (isPlaying || rewardedAtGameOverRef.current) return;
    rewardedAtGameOverRef.current = true;
    const runPayout = Math.max(5, Math.floor(score / 8) * activeMode.tokenMultiplier);
    setTokens((c) => c + runPayout);
    setLifetimeTokens((c) => c + runPayout);
    setMessage(`Run complete! +${runPayout} tokens from ${activeMode.name}.`);
  }, [activeMode.name, activeMode.tokenMultiplier, isPlaying, score]);

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
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'surf') return;

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;

      // Score tick
      setScore((c) => c + tubeMultiplier);

      // Slow motion countdown (every ~8 ticks ≈ 400ms)
      if (slowMotionSeconds > 0 && tickRef.current % 8 === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      const speed = slowMotionSeconds > 0 ? 0.006 : 0.012;

      // Move / spawn whitewater zones
      setWaveZones((current) => {
        const moved = current
          .map((z) => ({ ...z, x: z.x - speed }))
          .filter((z) => z.x + z.width > 0);
        // Spawn new zone roughly every 3-4 seconds
        if (tickRef.current % (slowMotionSeconds > 0 ? 120 : 60) === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: 1.0,
            width: 0.12 + Math.random() * 0.14,
          });
        }
        return moved;
      });

      // Wave animation phase
      surfWavePhase.current += 0.04;

      // Check collision: surfer at surferXRef.current hits a zone?
      setWaveZones((zones) => {
        const hit = zones.find((z) => {
          const sx = surferXRef.current;
          return sx > z.x && sx < z.x + z.width;
        });
        if (hit && !trickAirborne) {
          if (shields > 0) {
            setShields((c) => c - 1);
            setMessage('Whitewater! Shield absorbed it!');
            return zones.filter((z) => z.id !== hit.id);
          }
          // Wipeout
          isPlayingRef.current = false;
          setIsPlaying(false);
          setBestScores((c) => ({ ...c, surf: Math.max(c.surf, score) }));
        }
        return zones;
      });

      // Sweet zone: surfer within 0.35-0.65
      const inSweet = surferXRef.current > 0.35 && surferXRef.current < 0.65;
      setTubeMultiplier(inSweet ? 2 : 1);
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, selectedMode, slowMotionSeconds, shields, trickAirborne, score]);

  // ══════════════════════════════════════════════════════════════════════════
  //  SKATE GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'skate') return;

    const GRAVITY = 0.008; // radians/tick² pulling toward 0
    const FRICTION = 0.995;
    const PIPE_RADIUS = Math.PI * 0.45; // max angle before launch
    const TRICK_NAMES = ['Grab', '180°', '360°', 'McTwist'];

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;
      setScore((c) => c + 1);

      if (slowMotionSeconds > 0 && tickRef.current % 8 === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      const curAngle = skateAngleRef.current;
      const curSpeed = skateSpeedRef.current;
      const airborne = skateAirborneRef.current;

      if (airborne) {
        // Simple ballistic arc: gravity pulls angle back toward 0
        const newSpeed = curSpeed - GRAVITY * Math.sign(curAngle) * (slowMotionSeconds > 0 ? 0.5 : 1);
        const newAngle = curAngle + newSpeed * (slowMotionSeconds > 0 ? 0.5 : 1);
        skateSpeedRef.current = newSpeed;
        skateAngleRef.current = newAngle;
        setSkateSpeed(newSpeed);
        setSkateAngle(newAngle);

        // Land when angle crosses 0
        if (Math.abs(newAngle) < 0.05 && Math.abs(newSpeed) < 0.03) {
          skateAirborneRef.current = false;
          setSkateAirborne(false);
          setMessage(`Landed! +${50 * activeCharacter.shieldBonus} pts`);
          setScore((c) => c + 50 * activeCharacter.shieldBonus);
        }
      } else {
        // In-pipe physics: gravity toward bottom
        const newSpeed = (curSpeed - GRAVITY * Math.sin(curAngle) * (slowMotionSeconds > 0 ? 0.5 : 1)) * FRICTION;
        const newAngle = curAngle + newSpeed * (slowMotionSeconds > 0 ? 0.5 : 1);
        skateSpeedRef.current = newSpeed;
        skateAngleRef.current = newAngle;
        setSkateSpeed(newSpeed);
        setSkateAngle(newAngle);

        // Launch off coping
        if (Math.abs(newAngle) > PIPE_RADIUS) {
          skateAirborneRef.current = true;
          setSkateAirborne(true);
          const trick = TRICK_NAMES[Math.floor(Math.random() * TRICK_NAMES.length)];
          setSkateTrick(trick);
          setMessage(`Airborne! Tap for ${trick}!`);
          if (skateTrickTimeoutRef.current) clearTimeout(skateTrickTimeoutRef.current);
          skateTrickTimeoutRef.current = setTimeout(() => setSkateTrick(null), 2000);
          // Spawn rail sometimes
          if (Math.random() > 0.5) {
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
  }, [isPlaying, selectedMode, slowMotionSeconds, activeCharacter.shieldBonus]);

  // ══════════════════════════════════════════════════════════════════════════
  //  HACKEY GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'hackey') return;

    const BASE_WINDOW_DRAIN = 0.018; // per tick

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;

      if (slowMotionSeconds > 0 && tickRef.current % 8 === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      const drain = (slowMotionSeconds > 0 ? 0.5 : 1) * BASE_WINDOW_DRAIN *
        (1 + hackeyCombo * 0.03); // gets faster with combo
      const newWindow = hackeyWindowRef.current - drain;

      if (newWindow <= 0) {
        // Missed! 
        const newMisses = hackeyMissesRef.current + 1;
        hackeyMissesRef.current = newMisses;
        setHackeyMisses(newMisses);
        setHackeyCombo(0);
        setMessage(`Miss! ${3 - newMisses} chances left`);

        if (newMisses >= 3) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setBestScores((c) => ({ ...c, hackey: Math.max(c.hackey, score) }));
          return;
        }

        // Next target
        const nextTarget = Math.floor(Math.random() * 6);
        hackeyTargetRef.current = nextTarget;
        hackeyWindowRef.current = 1;
        setHackeyTarget(nextTarget);
        setHackeyWindow(1);
      } else {
        hackeyWindowRef.current = newWindow;
        setHackeyWindow(newWindow);
        setScore((c) => c + 1);
      }

      // Animate sack position toward target player
      const targetPlayer = HACKEY_PLAYERS[hackeyTargetRef.current];
      const cx = 0.5 + Math.cos(targetPlayer.angle) * 0.35;
      const cy = 0.5 + Math.sin(targetPlayer.angle) * 0.35;
      setHackeySackPos((prev) => ({
        x: prev.x + (cx - prev.x) * 0.1,
        y: prev.y + (cy - prev.y) * 0.1,
      }));
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, selectedMode, slowMotionSeconds, hackeyCombo, score, HACKEY_PLAYERS]);

  // ══════════════════════════════════════════════════════════════════════════
  //  SKYDIVE GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'skydive') return;

    const GATE_GAP = 0.28 + activeCharacter.controlBonus * 0.12; // fraction of width that is "safe" in each gate

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;
      setScore((c) => c + 1);

      if (slowMotionSeconds > 0 && tickRef.current % 8 === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      const speed = slowMotionSeconds > 0 ? 0.008 : 0.016;

      // Descend altitude
      setSkyAltitude((a) => Math.max(0, a - 50));

      // Move gates down the screen and spawn new ones
      setSkyGates((gates) => {
        const moved = gates
          .map((g) => ({ ...g, y: g.y + speed }))
          .filter((g) => g.y < 1.15);
        if (tickRef.current % 55 === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            y: -0.1,
            gapX: 0.1 + Math.random() * 0.6,
          });
        }
        return moved;
      });

      // Move clouds
      setSkyClouds((clouds) => {
        const moved = clouds
          .map((c) => ({ ...c, y: c.y + speed * 0.5 }))
          .filter((c) => c.y < 1.1);
        if (tickRef.current % 30 === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: Math.random(),
            y: -0.05,
            r: 0.07 + Math.random() * 0.08,
          });
        }
        return moved;
      });

      // Collision checks
      setSkyGates((gates) => {
        const sx = skyXRef.current;
        const hit = gates.find((g) => {
          // Gate is at y ~0.8 (near player who is at 0.82)
          if (g.y < 0.76 || g.y > 0.88) return false;
          const leftWall = g.gapX - GATE_GAP / 2;
          const rightWall = g.gapX + GATE_GAP / 2;
          return sx < leftWall || sx > rightWall;
        });
        const cleared = gates.find((g) => g.y > 0.76 && g.y < 0.88 &&
          sx >= g.gapX - GATE_GAP / 2 && sx <= g.gapX + GATE_GAP / 2);
        if (cleared) {
          setSkyGatesCleared((c) => c + 1);
          setScore((c) => c + 25);
        }
        if (hit) {
          if (shields > 0) {
            setShields((s) => s - 1);
            setMessage('Clipped the gate! Shield saved you!');
            return gates.filter((g) => g.id !== hit.id);
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
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
            return clouds.filter((c) => c.id !== hit.id);
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
          setBestScores((b) => ({ ...b, skydive: Math.max(b.skydive, score) }));
        }
        return clouds;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacter.controlBonus, isPlaying, selectedMode, slowMotionSeconds, shields, score]);

  // ══════════════════════════════════════════════════════════════════════════
  //  BOX RACE GAME LOOP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isPlaying || selectedMode !== 'boxrace') return;

    const BOX_COLORS = ['#FF4444', '#FF9900', '#CC44FF', '#FF66AA', '#44DDAA'];
    const COLLISION_THRESHOLD = 0.1 - activeCharacter.controlBonus * 0.18;
    const BOOST_PICKUP_THRESHOLD = 0.1;

    const interval = setInterval(() => {
      if (!isPlayingRef.current) return;
      tickRef.current += 1;

      if (slowMotionSeconds > 0 && tickRef.current % 8 === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }

      // Increase racer speed over time
      setRacerSpeed((s) => Math.min(s + 0.0004, 0.025));
      const baseSpeed = slowMotionSeconds > 0 ? 0.01 : racerSpeed;

      // Move rival boxes toward player and spawn new ones
      setRaceBoxes((boxes) => {
        const moved = boxes
          .map((b) => ({ ...b, y: b.y + (baseSpeed + b.speed) }))
          .filter((b) => b.y < 1.05);
        if (tickRef.current % 35 === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: 0.1 + Math.random() * 0.7,
            y: -0.08,
            speed: 0.005 + Math.random() * 0.008,
            color: BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)],
          });
        }
        return moved;
      });

      // Move boost pads
      setRaceBoosts((boosts) => {
        const moved = boosts
          .map((b) => ({ ...b, y: b.y + baseSpeed }))
          .filter((b) => b.y < 1.05);
        if (tickRef.current % 80 === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            x: 0.15 + Math.random() * 0.65,
            y: -0.08,
          });
        }
        return moved;
      });

      setScore((c) => c + 1);

      // Collision with rival boxes
      setRaceBoxes((boxes) => {
        const rx = racerXRef.current;
        const hit = boxes.find((b) => {
          const dx = Math.abs(rx - b.x);
          return dx < COLLISION_THRESHOLD && b.y > 0.8 && b.y < 0.96;
        });
        if (hit) {
          if (shields > 0) {
            setShields((s) => s - 1);
            setMessage('Crash! Shield absorbed it!');
            return boxes.filter((b) => b.id !== hit.id);
          }
          isPlayingRef.current = false;
          setIsPlaying(false);
          setBestScores((b) => ({ ...b, boxrace: Math.max(b.boxrace, score) }));
        }
        return boxes;
      });

      // Pick up boost pads
      setRaceBoosts((boosts) => {
        const rx = racerXRef.current;
        const hit = boosts.find((b) => {
          const dx = Math.abs(rx - b.x);
          return dx < BOOST_PICKUP_THRESHOLD && b.y > 0.8 && b.y < 0.96;
        });
        if (hit) {
          setScore((c) => c + 30);
          setMessage('⚡ Boost! +30');
        }
        return hit ? boosts.filter((b) => b.id !== hit.id) : boosts;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacter.controlBonus, isPlaying, selectedMode, slowMotionSeconds, shields, score, racerSpeed]);

  const resetGameState = useCallback((mode: GameModeKey) => {
    tickRef.current = 0;
    rewardedAtGameOverRef.current = false;
    setScore(0);
    setMessage('');
    setSlowMotionSeconds(0);
    // Surf
    setSurferX(0.5);
    surferXRef.current = 0.5;
    setWaveZones([]);
    setTrickAirborne(false);
    setTubeMultiplier(1);
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
    const firstTarget = Math.floor(Math.random() * 6);
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
  }, []);

  const startGame = useCallback((mode: GameModeKey) => {
    resetGameState(mode);
    setSelectedMode(mode);
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
    isPlayingRef.current = true;
    setScreen('game');
    if (controlsTipTimeoutRef.current) clearTimeout(controlsTipTimeoutRef.current);
    setShowControlsTip(true);
    controlsTipTimeoutRef.current = setTimeout(() => setShowControlsTip(false), 4500);
  }, [resetGameState, activeCharacter.shieldBonus]);

  const restartGame = useCallback(() => {
    resetGameState(selectedMode);
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
    isPlayingRef.current = true;
    if (controlsTipTimeoutRef.current) clearTimeout(controlsTipTimeoutRef.current);
    setShowControlsTip(true);
    controlsTipTimeoutRef.current = setTimeout(() => setShowControlsTip(false), 4500);
  }, [resetGameState, selectedMode, activeCharacter.shieldBonus]);

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
        setScore((c) => c + 80);
        setTimeout(() => {
          setTrickAirborne(false);
          setMessage('');
        }, 1200);
      }
    },
  }), [activeCharacter.controlBonus, selectedMode, trickAirborne]);

  // ─── Skate: PanResponder ──────────────────────────────────────────────────
  const skatePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => selectedMode === 'skate' && isPlayingRef.current,
    onMoveShouldSetPanResponder: () => selectedMode === 'skate' && isPlayingRef.current,
    onPanResponderRelease: (_, gs) => {
      if (!isPlayingRef.current) return;
      if (skateAirborneRef.current) {
        // Trick tap while airborne
        setScore((c) => c + 100);
        setMessage('Trick landed! +100');
        setSkateTrick(null);
      } else {
        // Pump: swipe left/right gives angular velocity
        const dragX = applyGestureDeadzone(gs.dx);
        if (dragX === 0) return;
        const push = -dragX / SCREEN_W * Math.max(0.1, SKATE_PUMP_SENSITIVITY - activeCharacter.controlBonus * 0.35) * sensitivityRef.current;
        skateSpeedRef.current = clamp(skateSpeedRef.current + push, -0.12, 0.12);
        setSkateSpeed(skateSpeedRef.current);
      }
    },
  }), [activeCharacter.controlBonus, selectedMode]);

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
      const bonus = Math.floor(hackeyWindowRef.current * 50) + hackeyCombo * 5;
      setScore((c) => c + bonus);
      setHackeyCombo((c) => c + 1);
      setMessage(`Nice! +${bonus} (combo x${hackeyCombo + 1})`);
      const nextTarget = Math.floor(Math.random() * 6);
      hackeyTargetRef.current = nextTarget;
      hackeyWindowRef.current = 1;
      setHackeyTarget(nextTarget);
      setHackeyWindow(1);
    } else {
      const newMisses = hackeyMissesRef.current + 1;
      hackeyMissesRef.current = newMisses;
      setHackeyMisses(newMisses);
      setHackeyCombo(0);
      setMessage(`Wrong player! ${3 - newMisses} left`);
      if (newMisses >= 3) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        setBestScores((c) => ({ ...c, hackey: Math.max(c.hackey, score) }));
      }
    }
  }, [hackeyCombo, score]);

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
          {tubeMultiplier > 1 && (
            <Text style={styles.tubeLabel}>🌊 TUBE x{tubeMultiplier}</Text>
          )}
          {trickAirborne && <Text style={styles.trickLabel}>✈️ AERIAL!</Text>}
        </View>

        {/* Controls tutorial — auto-hides after 4.5 s */}
        {showControlsTip && (
          <View style={styles.controlsTipOverlay}>
            <Text style={styles.controlsTipTitle}>🌊 Surf Controls</Text>
            <Text style={styles.controlsTipLine}>← → Drag to steer along the wave face</Text>
            <Text style={styles.controlsTipLine}>⬆ Flick UP quickly to launch an aerial (+80 pts)</Text>
            <Text style={styles.controlsTipLine}>⭐ Centre zone = 2× score multiplier</Text>
            <Text style={styles.controlsTipLine}>⚠ Dodge the whitewater closeout sections!</Text>
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

        {/* Controls tutorial */}
        {showControlsTip && (
          <View style={styles.controlsTipOverlay}>
            <Text style={styles.controlsTipTitle}>🛹 Half Pipe Controls</Text>
            <Text style={styles.controlsTipLine}>← → Swipe left or right to pump up the walls</Text>
            <Text style={styles.controlsTipLine}>🚀 Build speed to launch off the coping</Text>
            <Text style={styles.controlsTipLine}>✈ When airborne → TAP the screen to score</Text>
            <Text style={styles.controlsTipLine}>🏅 Land cleanly for bonus points!</Text>
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
                  hackeyWindow > 0.5
                    ? '#7ED8A0'
                    : hackeyWindow > 0.25
                    ? '#FFD700'
                    : '#FF4444',
              },
            ]}
          />
        </View>

        {/* Combo / Misses display */}
        <View style={styles.hackeyStats}>
          <Text style={styles.hackeyStatText}>Combo: {hackeyCombo}</Text>
          <Text style={[styles.hackeyStatText, { color: '#FF6B6B' }]}>
            {'⚡'.repeat(3 - hackeyMisses)}{'💀'.repeat(hackeyMisses)}
          </Text>
        </View>

        {!isPlaying && renderGameOver()}
      </View>
    );
  };

  const renderSkydiveGame = () => (
    <View style={styles.gameArea} {...skydivePanResponder.panHandlers}>
      <View style={styles.skyBg} />
      <View style={styles.skyGlow} />
      <View style={styles.skySun} />
      <View style={styles.skyHorizon} />

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
            <View style={styles.gateGap} />
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

      <Text style={styles.skyHint}>Drag ← → to steer  •  Thread the gates  •  Dodge clouds</Text>

      {/* Controls tutorial */}
      {showControlsTip && (
        <View style={styles.controlsTipOverlay}>
          <Text style={styles.controlsTipTitle}>🪂 Skydive Controls</Text>
          <Text style={styles.controlsTipLine}>← → Drag to steer your body through the air</Text>
          <Text style={styles.controlsTipLine}>🎯 Thread through ring gates for +25 pts each</Text>
          <Text style={styles.controlsTipLine}>☁ Dodge white turbulence clouds!</Text>
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
      <View style={styles.raceLaneStripe} />
      <View style={[styles.raceLaneStripe, styles.raceLaneStripeBottom]} />

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
        {renderActionCharacter('race', activeCharacter, {
          left: '3%',
          top: '-6%',
          transform: [{ scale: 0.82 }],
        })}
      </View>

      <Text style={styles.raceHint}>Drag ← → to steer  •  Hit boosts  •  Dodge rivals</Text>

      {/* Controls tutorial */}
      {showControlsTip && (
        <View style={styles.controlsTipOverlay}>
          <Text style={styles.controlsTipTitle}>📦 Box Racer Controls</Text>
          <Text style={styles.controlsTipLine}>← → Drag to steer your box car</Text>
          <Text style={styles.controlsTipLine}>⚡ Drive over green boost pads for +30 pts</Text>
          <Text style={styles.controlsTipLine}>💥 Dodge coloured rival boxes — shields absorb crashes!</Text>
          <Text style={styles.controlsTipDim}>Tap − / + in the HUD to adjust sensitivity</Text>
        </View>
      )}

      {!isPlaying && renderGameOver()}
    </View>
  );

  const renderGameOver = () => (
    <View style={styles.gameOverOverlay}>
      <Text style={styles.gameOverTitle}>Run Over</Text>
      <Text style={styles.gameOverScore}>{score}</Text>
      <Text style={styles.gameOverLabel}>score</Text>
      <Text style={styles.gameOverBest}>Best: {bestScores[selectedMode]}</Text>
      {message ? <Text style={styles.gameOverMsg}>{message}</Text> : null}
      <Pressable
        onPress={restartGame}
        style={[styles.gameOverBtn, { backgroundColor: activeMode.accentColor }]}
      >
        <Text style={styles.gameOverBtnText}>Play Again</Text>
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
              return (
                <Pressable
                  key={key}
                  onPress={() => startGame(key)}
                  style={({ pressed }) => [
                    styles.modeCard,
                    { borderColor: mode.accentColor, backgroundColor: mode.dimColor },
                    pressed && styles.pressed,
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
                    <Text style={styles.modeSceneCopy}>{activeCharacter.persona}</Text>
                  </View>
                  <View style={[styles.startPill, { backgroundColor: mode.accentColor }]}>
                    <Text style={styles.startPillText}>TAP TO PLAY</Text>
                  </View>
                </Pressable>
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
  startPill: { borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  startPillText: { color: '#06111E', fontWeight: '800', fontSize: 13, letterSpacing: 1 },

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
  hackeySack: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E8C850', borderWidth: 2, borderColor: '#FFD700',
    zIndex: 10,
  },
  hackeyPlayer: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
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
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#00E5C8',
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
  playerBoxEmoji: { fontSize: 26 },
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
});
