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

const rewardedAd = RewardedAd.createForAdRequest(TestIds.REWARDED, {
  requestNonPersonalizedAdsOnly: true,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type ScreenKey = 'landing' | 'select' | 'game';
type GameModeKey = 'surf' | 'skate' | 'hackey';

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
  shieldBonus: number;
  slowMotionBonus: number;
  bonusDescription: string;
};

// ── Surf game state ───
type WaveZone = { id: number; x: number; width: number }; // x: 0-1, width: 0-1

// ── Skate game state ──
// angle: radians, 0 = bottom of pipe, +/- PI/2 = top of wall
type SkateRail = { id: number; side: 'left' | 'right'; active: boolean };

// ── Hackey game state ─
type HackeyPlayer = { id: number; angle: number }; // angle in circle (radians)

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
};

const CHARACTERS: Character[] = [
  {
    id: 'rookie',
    name: 'Rookie Rider',
    cost: 0,
    color: '#40E0D0',
    shieldBonus: 1,
    slowMotionBonus: 0,
    bonusDescription: 'Balanced starter character.',
  },
  {
    id: 'wave-pro',
    name: 'Wave Pro',
    cost: 120,
    color: '#56A3FF',
    shieldBonus: 2,
    slowMotionBonus: 3,
    bonusDescription: '+1 extra shield & longer slow motion.',
  },
  {
    id: 'street-ace',
    name: 'Street Ace',
    cost: 220,
    color: '#FF8E5B',
    shieldBonus: 2,
    slowMotionBonus: 5,
    bonusDescription: 'Extended boost for high-score pushes.',
  },
  {
    id: 'freestyle-legend',
    name: 'Freestyle Legend',
    cost: 420,
    color: '#E8C850',
    shieldBonus: 3,
    slowMotionBonus: 7,
    bonusDescription: 'Elite unlock with max survivability perks.',
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [logFilePath] = useState(DEFAULT_LOG_FILE);

  // ── navigation / meta ─────────────────────────────────────────────────────
  const [screen, setScreen] = useState<ScreenKey>('landing');
  const [selectedMode, setSelectedMode] = useState<GameModeKey>('surf');
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState<Record<GameModeKey, number>>({
    surf: 0, skate: 0, hackey: 0,
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

  // ══════════════════════════════════════════════════════════════════════════
  //  SURF GAME LOOP
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

  // ─── Start / Restart ──────────────────────────────────────────────────────
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
  }, []);

  const startGame = useCallback((mode: GameModeKey) => {
    resetGameState(mode);
    setSelectedMode(mode);
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
    isPlayingRef.current = true;
    setScreen('game');
  }, [resetGameState, activeCharacter.shieldBonus]);

  const restartGame = useCallback(() => {
    resetGameState(selectedMode);
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [resetGameState, selectedMode, activeCharacter.shieldBonus]);

  // ─── Surf: PanResponder ───────────────────────────────────────────────────
  const surfPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => selectedMode === 'surf' && isPlayingRef.current,
    onMoveShouldSetPanResponder: () => selectedMode === 'surf' && isPlayingRef.current,
    onPanResponderMove: (_, gs) => {
      if (!isPlayingRef.current) return;
      const newX = clamp(surferXRef.current + gs.dx / SCREEN_W, 0.05, 0.95);
      surferXRef.current = newX;
      setSurferX(newX);
    },
    onPanResponderRelease: (_, gs) => {
      // Flick up = trick aerial
      if (gs.vy < -0.8 && !trickAirborne) {
        setTrickAirborne(true);
        setMessage('Aerial trick! 🤙');
        setScore((c) => c + 80);
        setTimeout(() => {
          setTrickAirborne(false);
          setMessage('');
        }, 1200);
      }
    },
  }), [selectedMode, trickAirborne]);

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
        const push = -gs.dx / SCREEN_W * 0.3;
        skateSpeedRef.current = clamp(skateSpeedRef.current + push, -0.15, 0.15);
        setSkateSpeed(skateSpeedRef.current);
      }
    },
  }), [selectedMode]);

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

  const renderSurfGame = () => {
    const waveY = 55 + Math.sin(surfWavePhase.current) * 4;
    return (
      <View style={styles.gameArea} {...surfPanResponder.panHandlers}>
        {/* Ocean background gradient suggestion */}
        <View style={[styles.surfOcean, { top: `${waveY}%` }]} />

        {/* Wave crest line */}
        <View style={[styles.waveCrease, { top: `${waveY - 2}%` }]} />

        {/* Sweet zone indicator */}
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

        {/* Surfer */}
        <View
          style={[
            styles.surfer,
            {
              left: `${surferX * 100 - 4}%` as `${number}%`,
              top: `${waveY - 14}%` as `${number}%`,
              backgroundColor: trickAirborne ? '#FFD700' : activeCharacter.color,
              transform: trickAirborne ? [{ scale: 1.4 }, { rotate: '30deg' }] : [],
            },
          ]}
        />

        {/* HUD labels */}
        <View style={styles.surfHudOverlay}>
          {tubeMultiplier > 1 && (
            <Text style={styles.tubeLabel}>🌊 TUBE x{tubeMultiplier}</Text>
          )}
          {trickAirborne && <Text style={styles.trickLabel}>✈️ AERIAL!</Text>}
        </View>

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
        {/* Pipe walls */}
        <View style={styles.pipeLeft} />
        <View style={styles.pipeRight} />
        <View style={styles.pipeBottom} />

        {/* Coping dots */}
        <View style={[styles.coping, { left: '8%' }]} />
        <View style={[styles.coping, { right: '8%' }]} />

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

        {/* Skater */}
        <View
          style={[
            styles.skater,
            {
              left: `${skaterX - 3}%` as `${number}%`,
              top: `${airY - 4}%` as `${number}%`,
              backgroundColor: activeCharacter.color,
              transform: [{ rotate: `${skateAngle * 45}deg` }],
            },
          ]}
        />

        {/* Trick indicator */}
        {skateTrick && (
          <View style={styles.trickBubble}>
            <Text style={styles.trickBubbleText}>🛹 {skateTrick}</Text>
            <Text style={styles.trickBubbleSub}>Tap to land!</Text>
          </View>
        )}

        {/* Hint */}
        <Text style={styles.skateHint}>Swipe ← → to pump</Text>

        {!isPlaying && renderGameOver()}
      </View>
    );
  };

  const renderHackeyGame = () => {
    const CIRCLE_R = 38; // % of game area
    const CENTER = 50;

    return (
      <View style={styles.gameArea}>
        {/* Background circle track */}
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
              <Text style={styles.hackeyPlayerEmoji}>{isTarget ? '🤸' : '🧍'}</Text>
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
                    <View style={styles.charCardBody}>
                      <View style={styles.charCardTop}>
                        <Text style={styles.charCardName}>{char.name}</Text>
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
                      <Text style={styles.charCardDesc}>{char.bonusDescription}</Text>
                      <Text style={styles.charCardSub}>
                        🛡 +{char.shieldBonus} shield
                        {char.slowMotionBonus > 0
                          ? `   ⏱ +${char.slowMotionBonus}s slow motion`
                          : ''}
                      </Text>
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
              <Text style={styles.heroEmoji}>🤙</Text>
              <Text style={styles.heroTitle}>Retro Rush</Text>
              <Text style={styles.heroTagline}>Pick your sport. Earn your run.</Text>
              <Text style={styles.heroDesc}>
                Three extreme sport arcade games — surf the wave face, pump the half pipe, and
                keep the hacky sack alive — with characters, tokens, and high scores to chase.
              </Text>
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

          {/* Game content */}
          {selectedMode === 'surf' && renderSurfGame()}
          {selectedMode === 'skate' && renderSkateGame()}
          {selectedMode === 'hackey' && renderHackeyGame()}

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
  heroSection: { alignItems: 'center', paddingVertical: 28 },
  heroEmoji: { fontSize: 52, marginBottom: 8 },
  heroTitle: { color: '#E6F7FF', fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  heroTagline: { color: '#56B0FF', fontSize: 16, fontWeight: '600', marginTop: 6, marginBottom: 12 },
  heroDesc: { color: '#7FA8C7', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  statsBar: {
    flexDirection: 'row', backgroundColor: '#0E1E30', borderRadius: 14,
    borderWidth: 1, borderColor: '#1E3550', paddingVertical: 14,
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
  modeCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 16, gap: 10 },
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

  // ── Surf ──────────────────────────────────────────────────────────────────
  surfOcean: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#0A3A6A', opacity: 0.85,
  },
  waveCrease: {
    position: 'absolute', left: 0, right: 0, height: 5,
    backgroundColor: '#4DD0FF', opacity: 0.7, borderRadius: 3,
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
  hackeyPlayerEmoji: { fontSize: 22 },
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
    flexDirection: 'row', backgroundColor: '#0E1E30', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1E3550', marginBottom: 10, overflow: 'hidden',
  },
  charColorBar: { width: 6 },
  charCardBody: { flex: 1, padding: 12, gap: 4 },
  charCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  charCardName: { color: '#E6F7FF', fontWeight: '700', fontSize: 15 },
  charBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  charBadgeOwned: { backgroundColor: '#1E3550' },
  charBadgeEquipped: { backgroundColor: '#1B4D2A' },
  charBadgeLocked: { backgroundColor: '#2A2A40', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  charBadgeText: { color: '#CFE8FF', fontSize: 11, fontWeight: '700' },
  charCardDesc: { color: '#7FA8C7', fontSize: 12 },
  charCardSub: { color: '#4E7490', fontSize: 12 },

  // ── Shared ────────────────────────────────────────────────────────────────
  messageBanner: {
    backgroundColor: '#0E2820', borderRadius: 10, borderWidth: 1, borderColor: '#2E7048',
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 14, alignItems: 'center',
  },
  messageText: { color: '#7ED8A0', fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
