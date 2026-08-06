import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
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

const LANE_COUNT = 3;
const TICK_MS = 120;
const SLOW_MOTION_BASE_DURATION = 18;
const DEFAULT_LOG_DIR = `${FileSystem.documentDirectory ?? ''}alpha-logs/`;
const DEFAULT_LOG_FILE = `${DEFAULT_LOG_DIR}alpha-errors.txt`;

const rewardedAd = RewardedAd.createForAdRequest(TestIds.REWARDED, {
  requestNonPersonalizedAdsOnly: true,
});

type ScreenKey = 'landing' | 'select' | 'game';
type GameModeKey = 'surf' | 'skate' | 'hackey';

type GameMode = {
  name: string;
  emoji: string;
  shortRules: string;
  description: string;
  instruction: string;
  tokenMultiplier: number;
  spawnEveryTicks: number;
  baseSpeed: number;
  obstacleColor: string;
  accentColor: string;
  dimColor: string;
};

type Obstacle = {
  id: number;
  lane: number;
  y: number;
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

const GAME_MODES: Record<GameModeKey, GameMode> = {
  surf: {
    name: 'Surf Sprint',
    emoji: '🏄',
    shortRules: 'Ride wave lanes and dodge reef spikes.',
    description: 'Catch the swell and outrun the reef. Steady rhythm, medium speed.',
    instruction:
      'Tap Left/Right to switch lanes and avoid reef spikes. Surf mode has steady wave rhythm and medium speed.',
    tokenMultiplier: 2,
    spawnEveryTicks: 8,
    baseSpeed: 4.8,
    obstacleColor: '#2E7ACD',
    accentColor: '#56B0FF',
    dimColor: '#0D2A45',
  },
  skate: {
    name: 'Skate Rush',
    emoji: '🛹',
    shortRules: 'Street sprint with fast barriers.',
    description: 'Fastest mode. Quick lane switches to dodge rails and benches.',
    instruction:
      'Skate mode is the fastest. Keep quick lane changes to avoid rails and benches with shorter reaction windows.',
    tokenMultiplier: 3,
    spawnEveryTicks: 7,
    baseSpeed: 5.8,
    obstacleColor: '#B94A48',
    accentColor: '#FF6B6B',
    dimColor: '#330D0D',
  },
  hackey: {
    name: 'Hackey Flow',
    emoji: '🤸',
    shortRules: 'Rhythm dodge with surprise cones.',
    description: 'Unpredictable spawns. Stay centered and react fast.',
    instruction:
      'Hackey mode has unpredictable spawn rhythms. Stay centered when possible and react to sudden cone patterns.',
    tokenMultiplier: 4,
    spawnEveryTicks: 6,
    baseSpeed: 5.2,
    obstacleColor: '#7A5BC8',
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

export default function App() {
  const tickRef = useRef(0);
  const rewardedAtGameOverRef = useRef(false);

  const [screen, setScreen] = useState<ScreenKey>('landing');
  const [selectedMode, setSelectedMode] = useState<GameModeKey>('surf');
  const [playerLane, setPlayerLane] = useState(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState<Record<GameModeKey, number>>({
    surf: 0,
    skate: 0,
    hackey: 0,
  });
  const [isPlaying, setIsPlaying] = useState(false);

  const [tokens, setTokens] = useState(0);
  const [lifetimeTokens, setLifetimeTokens] = useState(0);
  const [ownedCharacters, setOwnedCharacters] = useState<string[]>(['rookie']);
  const [selectedCharacterId, setSelectedCharacterId] = useState('rookie');

  const [shields, setShields] = useState(1);
  const [slowMotionSeconds, setSlowMotionSeconds] = useState(0);
  const [rewardLoaded, setRewardLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [showCharacters, setShowCharacters] = useState(false);
  const [logFilePath] = useState(DEFAULT_LOG_FILE);

  const activeMode = GAME_MODES[selectedMode];
  const activeCharacter =
    CHARACTERS.find((c) => c.id === selectedCharacterId) ?? CHARACTERS[0];

  const obstacleSpeed = useMemo(
    () => (slowMotionSeconds > 0 ? activeMode.baseSpeed * 0.6 : activeMode.baseSpeed),
    [activeMode.baseSpeed, slowMotionSeconds]
  );

  const appendErrorLog = async (error: unknown, context: string) => {
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
      // silently swallow log errors in production UI
    }
  };

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
      if (previousHandler) {
        errorUtils?.setGlobalHandler?.(previousHandler);
      }
    };
  }, [logFilePath]);

  useEffect(() => {
    setShields(activeCharacter.shieldBonus);
  }, [activeCharacter.shieldBonus]);

  useEffect(() => {
    rewardedAd.load();
    const loadedUnsub = rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setRewardLoaded(true);
    });
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
    return () => {
      loadedUnsub();
      earnedUnsub();
      closedUnsub();
      failedUnsub();
    };
  }, [activeCharacter.slowMotionBonus]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      tickRef.current += 1;
      setScore((c) => c + 1);
      setObstacles((current) => {
        const moved = current
          .map((o) => ({ ...o, y: o.y + obstacleSpeed }))
          .filter((o) => o.y < 100);
        if (tickRef.current % activeMode.spawnEveryTicks === 0) {
          moved.push({
            id: Date.now() + Math.random(),
            lane: Math.floor(Math.random() * LANE_COUNT),
            y: 0,
          });
        }
        return moved;
      });
      if (slowMotionSeconds > 0 && tickRef.current % 8 === 0) {
        setSlowMotionSeconds((c) => Math.max(c - 1, 0));
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [activeMode.spawnEveryTicks, isPlaying, obstacleSpeed, slowMotionSeconds]);

  useEffect(() => {
    if (!isPlaying) return;
    const hit = obstacles.find(
      (o) => o.lane === playerLane && o.y > 76 && o.y < 94
    );
    if (!hit) return;
    if (shields > 0) {
      setShields((c) => c - 1);
      setObstacles((c) => c.filter((o) => o.id !== hit.id));
      setMessage('Shield absorbed the impact!');
      return;
    }
    setIsPlaying(false);
    setBestScores((c) => ({
      ...c,
      [selectedMode]: Math.max(c[selectedMode], score),
    }));
  }, [isPlaying, obstacles, playerLane, score, selectedMode, shields]);

  useEffect(() => {
    if (isPlaying || rewardedAtGameOverRef.current) return;
    rewardedAtGameOverRef.current = true;
    const runPayout = Math.max(5, Math.floor(score / 8) * activeMode.tokenMultiplier);
    setTokens((c) => c + runPayout);
    setLifetimeTokens((c) => c + runPayout);
    setMessage(`Run complete! +${runPayout} tokens from ${activeMode.name}.`);
  }, [activeMode.name, activeMode.tokenMultiplier, isPlaying, score]);

  const moveLeft = () => {
    if (!isPlaying) return;
    setPlayerLane((c) => Math.max(0, c - 1));
  };

  const moveRight = () => {
    if (!isPlaying) return;
    setPlayerLane((c) => Math.min(LANE_COUNT - 1, c + 1));
  };

  const watchRewardAd = () => {
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
  };

  const startGame = (mode: GameModeKey) => {
    tickRef.current = 0;
    rewardedAtGameOverRef.current = false;
    setSelectedMode(mode);
    setPlayerLane(1);
    setObstacles([]);
    setScore(0);
    setMessage('');
    setSlowMotionSeconds(0);
    const char = CHARACTERS.find((c) => c.id === selectedCharacterId) ?? CHARACTERS[0];
    setShields(char.shieldBonus);
    setIsPlaying(true);
    setScreen('game');
  };

  const restartGame = () => {
    tickRef.current = 0;
    rewardedAtGameOverRef.current = false;
    setPlayerLane(1);
    setObstacles([]);
    setScore(0);
    setMessage('');
    setSlowMotionSeconds(0);
    setShields(activeCharacter.shieldBonus);
    setIsPlaying(true);
  };

  const handleCharacterAction = (character: Character) => {
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
  };

  // ─── Landing Screen ────────────────────────────────────────────────────────

  const LandingScreen = () => (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.heroEmoji}>🤙</Text>
          <Text style={styles.heroTitle}>Retro Rush</Text>
          <Text style={styles.heroTagline}>Pick your sport. Earn your run.</Text>
          <Text style={styles.heroDesc}>
            Three extreme sport arcade games — surf, skate, and hackey flow — with characters,
            tokens, and high scores to chase.
          </Text>
        </View>

        {/* Stats bar */}
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

        {/* Primary CTA */}
        <Pressable
          onPress={() => setScreen('select')}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Select Game  →</Text>
        </Pressable>

        {/* Characters button */}
        <Pressable
          onPress={() => setShowCharacters(true)}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>🎽  Characters & Unlocks</Text>
        </Pressable>

        {/* Reward ad */}
        <Pressable
          onPress={watchRewardAd}
          style={({ pressed }) => [
            styles.adBtn,
            !rewardLoaded && styles.adBtnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.adBtnText}>
            {rewardLoaded ? '🎬  Watch Ad: +Tokens +Shield +Slow Motion' : '⏳  Loading Reward Ad…'}
          </Text>
        </Pressable>

        {/* Best scores summary */}
        <Text style={styles.sectionHeader}>Personal Bests</Text>
        <View style={styles.bestsRow}>
          {(Object.keys(GAME_MODES) as GameModeKey[]).map((key) => (
            <View key={key} style={[styles.bestCard, { borderColor: GAME_MODES[key].accentColor }]}>
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
  );

  // ─── Select Screen ─────────────────────────────────────────────────────────

  const SelectScreen = () => (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
                  <Text style={[styles.modeCardName, { color: mode.accentColor }]}>{mode.name}</Text>
                  <Text style={styles.modeCardDesc}>{mode.description}</Text>
                </View>
                <View style={[styles.multiplierBadge, { backgroundColor: mode.accentColor }]}>
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
  );

  // ─── Game Screen ───────────────────────────────────────────────────────────

  const GameScreen = () => (
    <SafeAreaView style={[styles.screen, { backgroundColor: activeMode.dimColor }]}>
      {/* HUD */}
      <View style={[styles.gameHud, { borderBottomColor: activeMode.accentColor }]}>
        <Pressable
          onPress={() => {
            if (!isPlaying) setScreen('select');
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
          {slowMotionSeconds > 0 ? (
            <Text style={[styles.hudStat, { color: '#FFD700' }]}>⏱ {slowMotionSeconds}s</Text>
          ) : null}
        </View>
      </View>

      {/* Game area */}
      <View style={styles.gameArea}>
        <View style={styles.laneDivider} />
        <View style={[styles.laneDivider, styles.secondDivider]} />

        {obstacles.map((o) => (
          <View
            key={o.id}
            style={[
              styles.obstacle,
              {
                backgroundColor: activeMode.obstacleColor,
                left: `${o.lane * (100 / LANE_COUNT) + 7}%` as `${number}%`,
                top: `${o.y}%` as `${number}%`,
              },
            ]}
          />
        ))}

        <View
          style={[
            styles.player,
            {
              backgroundColor: activeCharacter.color,
              left: `${playerLane * (100 / LANE_COUNT) + 7}%` as `${number}%`,
            },
          ]}
        />

        {/* Game Over overlay */}
        {!isPlaying ? (
          <View style={styles.gameOverOverlay}>
            <Text style={styles.gameOverTitle}>Run Over</Text>
            <Text style={styles.gameOverScore}>{score}</Text>
            <Text style={styles.gameOverLabel}>score</Text>
            <Text style={styles.gameOverBest}>
              Best: {bestScores[selectedMode]}
            </Text>
            {message ? <Text style={styles.gameOverMsg}>{message}</Text> : null}
            <Pressable
              onPress={restartGame}
              style={[styles.gameOverBtn, { backgroundColor: activeMode.accentColor }]}
            >
              <Text style={styles.gameOverBtnText}>Play Again</Text>
            </Pressable>
            <Pressable
              onPress={() => setScreen('select')}
              style={styles.gameOverSecondary}
            >
              <Text style={styles.gameOverSecondaryText}>Change Sport</Text>
            </Pressable>
            {rewardLoaded ? (
              <Pressable onPress={watchRewardAd} style={styles.gameOverAdBtn}>
                <Text style={styles.gameOverAdText}>🎬 Watch Ad for Bonus</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* In-game message strip */}
      {isPlaying && message ? (
        <View style={[styles.inGameMsg, { backgroundColor: activeMode.accentColor + '33' }]}>
          <Text style={[styles.inGameMsgText, { color: activeMode.accentColor }]}>{message}</Text>
        </View>
      ) : null}

      {/* Controls — large tap zones */}
      {isPlaying ? (
        <View style={styles.controlsArea}>
          <Pressable onPress={moveLeft} style={({ pressed }) => [styles.tapZone, pressed && styles.tapZonePressed]}>
            <Text style={styles.tapZoneText}>◀ LEFT</Text>
          </Pressable>
          <Pressable onPress={moveRight} style={({ pressed }) => [styles.tapZone, pressed && styles.tapZonePressed]}>
            <Text style={styles.tapZoneText}>RIGHT ▶</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );

  // ─── Character Modal ───────────────────────────────────────────────────────

  const CharacterModal = () => (
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
                  style={[
                    styles.charCard,
                    isSelected && { borderColor: char.color },
                  ]}
                >
                  <View style={[styles.charColorBar, { backgroundColor: char.color }]} />
                  <View style={styles.charCardBody}>
                    <View style={styles.charCardTop}>
                      <Text style={styles.charCardName}>{char.name}</Text>
                      {isOwned ? (
                        <View style={[styles.charBadge, isSelected ? styles.charBadgeEquipped : styles.charBadgeOwned]}>
                          <Text style={styles.charBadgeText}>{isSelected ? 'Equipped' : 'Owned'}</Text>
                        </View>
                      ) : (
                        <View style={styles.charBadgeLocked}>
                          <Text style={styles.charBadgeText}>🔒 {char.cost}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.charCardDesc}>{char.bonusDescription}</Text>
                    <Text style={styles.charCardSub}>
                      🛡 +{char.shieldBonus} shield{char.slowMotionBonus > 0 ? `   ⏱ +${char.slowMotionBonus}s slow motion` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ─── Root render ───────────────────────────────────────────────────────────

  return (
    <>
      <CharacterModal />
      {screen === 'landing' && <LandingScreen />}
      {screen === 'select' && <SelectScreen />}
      {screen === 'game' && <GameScreen />}
    </>
  );
}

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
  pressed: {
    opacity: 0.75,
  },

  // ── Landing ──────────────────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  heroEmoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#E6F7FF',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTagline: {
    color: '#56B0FF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 12,
  },
  heroDesc: {
    color: '#7FA8C7',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#0E1E30',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E3550',
    paddingVertical: 14,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#E6F4FF',
    fontWeight: '700',
    fontSize: 18,
  },
  statLabel: {
    color: '#6E97BB',
    fontSize: 11,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#1E3550',
  },
  charDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  primaryBtn: {
    backgroundColor: '#56B0FF',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#06111E',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    backgroundColor: '#0E1E30',
    borderWidth: 1,
    borderColor: '#1E3550',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: {
    color: '#CFE8FF',
    fontWeight: '700',
    fontSize: 15,
  },
  adBtn: {
    backgroundColor: '#1A3D25',
    borderWidth: 1,
    borderColor: '#2E7048',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  adBtnDisabled: {
    opacity: 0.5,
  },
  adBtnText: {
    color: '#7ED8A0',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeader: {
    color: '#94B8D4',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  bestsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  bestCard: {
    flex: 1,
    backgroundColor: '#0E1E30',
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  bestEmoji: {
    fontSize: 22,
  },
  bestScore: {
    fontSize: 22,
    fontWeight: '800',
  },
  bestLabel: {
    color: '#5E84A2',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Select Screen ─────────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: 64,
  },
  backBtnText: {
    color: '#7FB4D8',
    fontWeight: '700',
    fontSize: 15,
  },
  navTitle: {
    color: '#E6F7FF',
    fontWeight: '800',
    fontSize: 18,
  },
  modeCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  modeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeEmoji: {
    fontSize: 36,
  },
  modeCardInfo: {
    flex: 1,
    gap: 3,
  },
  modeCardName: {
    fontWeight: '800',
    fontSize: 20,
  },
  modeCardDesc: {
    color: '#8AAEC8',
    fontSize: 13,
    lineHeight: 18,
  },
  multiplierBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  multiplierText: {
    color: '#06111E',
    fontWeight: '800',
    fontSize: 13,
  },
  modeCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeCardRule: {
    color: '#6E97BB',
    fontSize: 13,
    flex: 1,
  },
  modeCardBest: {
    color: '#6E97BB',
    fontSize: 13,
    fontWeight: '600',
  },
  startPill: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  startPillText: {
    color: '#06111E',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },

  // ── Game Screen ──────────────────────────────────────────────────────────
  gameHud: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    backgroundColor: '#08101E',
    gap: 8,
  },
  hudBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudBackText: {
    color: '#7FB4D8',
    fontSize: 22,
    fontWeight: '700',
  },
  hudBackDisabled: {
    opacity: 0.25,
  },
  hudCenter: {
    flex: 1,
    alignItems: 'center',
  },
  hudMode: {
    fontWeight: '800',
    fontSize: 15,
  },
  hudRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  hudStat: {
    color: '#CFE8FF',
    fontWeight: '700',
    fontSize: 13,
  },
  gameArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#111D30',
  },
  laneDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    left: '33.33%',
    backgroundColor: '#1E3550',
  },
  secondDivider: {
    left: '66.66%',
  },
  obstacle: {
    position: 'absolute',
    width: '19%',
    height: 24,
    borderRadius: 6,
  },
  player: {
    position: 'absolute',
    width: '19%',
    height: 28,
    borderRadius: 8,
    bottom: '8%',
  },
  gameOverOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,10,18,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 32,
  },
  gameOverTitle: {
    color: '#94B8D4',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  gameOverScore: {
    color: '#E6F7FF',
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 72,
  },
  gameOverLabel: {
    color: '#5E84A2',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  gameOverBest: {
    color: '#7FA8C7',
    fontSize: 14,
    marginBottom: 16,
  },
  gameOverMsg: {
    color: '#7ED8A0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  gameOverBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  gameOverBtnText: {
    color: '#06111E',
    fontWeight: '800',
    fontSize: 17,
  },
  gameOverSecondary: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  gameOverSecondaryText: {
    color: '#7FB4D8',
    fontWeight: '700',
    fontSize: 15,
  },
  gameOverAdBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  gameOverAdText: {
    color: '#7ED8A0',
    fontWeight: '700',
    fontSize: 14,
  },
  inGameMsg: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  inGameMsgText: {
    fontWeight: '700',
    fontSize: 13,
  },
  controlsArea: {
    flexDirection: 'row',
    height: 110,
  },
  tapZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C1A2A',
    borderTopWidth: 1,
    borderColor: '#1E3550',
  },
  tapZonePressed: {
    backgroundColor: '#1A3050',
  },
  tapZoneText: {
    color: '#4A7FA0',
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 1,
  },

  // ── Character Modal ───────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#0C1B2C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#2A4560',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    color: '#E6F7FF',
    fontWeight: '800',
    fontSize: 20,
  },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: '#5E84A2',
    fontSize: 18,
    fontWeight: '700',
  },
  modalTokens: {
    color: '#56B0FF',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 12,
  },
  charCard: {
    flexDirection: 'row',
    backgroundColor: '#0E1E30',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#1E3550',
    marginBottom: 10,
    overflow: 'hidden',
  },
  charColorBar: {
    width: 6,
  },
  charCardBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  charCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCardName: {
    color: '#E6F7FF',
    fontWeight: '700',
    fontSize: 15,
  },
  charBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  charBadgeOwned: {
    backgroundColor: '#1E3550',
  },
  charBadgeEquipped: {
    backgroundColor: '#1B4D2A',
  },
  charBadgeLocked: {
    backgroundColor: '#2A2A40',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  charBadgeText: {
    color: '#CFE8FF',
    fontSize: 11,
    fontWeight: '700',
  },
  charCardDesc: {
    color: '#7FA8C7',
    fontSize: 12,
  },
  charCardSub: {
    color: '#4E7490',
    fontSize: 12,
  },

  // ── Shared ────────────────────────────────────────────────────────────────
  messageBanner: {
    backgroundColor: '#0E2820',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E7048',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 0,
    marginBottom: 14,
    alignItems: 'center',
  },
  messageText: {
    color: '#7ED8A0',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
});
