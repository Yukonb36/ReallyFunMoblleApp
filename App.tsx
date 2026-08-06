import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type GameModeKey = 'surf' | 'skate' | 'hackey';

type GameMode = {
  name: string;
  shortRules: string;
  instruction: string;
  tokenMultiplier: number;
  spawnEveryTicks: number;
  baseSpeed: number;
  obstacleColor: string;
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
    shortRules: 'Ride wave lanes and dodge reef spikes.',
    instruction:
      'Tap Left/Right to switch lanes and avoid reef spikes. Surf mode has steady wave rhythm and medium speed.',
    tokenMultiplier: 2,
    spawnEveryTicks: 8,
    baseSpeed: 4.8,
    obstacleColor: '#2E7ACD',
  },
  skate: {
    name: 'Skate Rush',
    shortRules: 'Street sprint with fast barriers.',
    instruction:
      'Skate mode is the fastest. Keep quick lane changes to avoid rails and benches with shorter reaction windows.',
    tokenMultiplier: 3,
    spawnEveryTicks: 7,
    baseSpeed: 5.8,
    obstacleColor: '#B94A48',
  },
  hackey: {
    name: 'Hackey Flow',
    shortRules: 'Rhythm dodge with surprise cones.',
    instruction:
      'Hackey mode has unpredictable spawn rhythms. Stay centered when possible and react to sudden cone patterns.',
    tokenMultiplier: 4,
    spawnEveryTicks: 6,
    baseSpeed: 5.2,
    obstacleColor: '#7A5BC8',
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
    bonusDescription: '+1 extra starting shield and longer slow motion.',
  },
  {
    id: 'street-ace',
    name: 'Street Ace',
    cost: 220,
    color: '#FF8E5B',
    shieldBonus: 2,
    slowMotionBonus: 5,
    bonusDescription: 'Extended boost duration for high-score pushes.',
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

  const [selectedMode, setSelectedMode] = useState<GameModeKey>('surf');
  const [playerLane, setPlayerLane] = useState(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState<Record<GameModeKey, number>>({
    surf: 0,
    skate: 0,
    hackey: 0,
  });
  const [isPlaying, setIsPlaying] = useState(true);

  const [tokens, setTokens] = useState(0);
  const [lifetimeTokens, setLifetimeTokens] = useState(0);
  const [ownedCharacters, setOwnedCharacters] = useState<string[]>(['rookie']);
  const [selectedCharacterId, setSelectedCharacterId] = useState('rookie');

  const [shields, setShields] = useState(1);
  const [slowMotionSeconds, setSlowMotionSeconds] = useState(0);
  const [rewardLoaded, setRewardLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [showInstructions, setShowInstructions] = useState(true);
  const [logFilePath, setLogFilePath] = useState(DEFAULT_LOG_FILE);
  const [logFolderInput, setLogFolderInput] = useState(DEFAULT_LOG_DIR);
  const [lastLogWritePath, setLastLogWritePath] = useState(DEFAULT_LOG_FILE);

  const activeMode = GAME_MODES[selectedMode];
  const activeCharacter =
    CHARACTERS.find((character) => character.id === selectedCharacterId) ?? CHARACTERS[0];

  const obstacleSpeed = useMemo(
    () => (slowMotionSeconds > 0 ? activeMode.baseSpeed * 0.6 : activeMode.baseSpeed),
    [activeMode.baseSpeed, slowMotionSeconds]
  );

  const appendErrorLog = async (error: unknown, context: string) => {
    try {
      const printableError =
        error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
      const logLine = `[${new Date().toISOString()}] [${context}] ${printableError}\n\n`;

      if (logFilePath.startsWith('content://')) {
        const folderUri = logFilePath.endsWith('/alpha-errors.txt')
          ? logFilePath.slice(0, -'/alpha-errors.txt'.length)
          : logFilePath;
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          folderUri,
          `alpha-errors-${Date.now()}`,
          'text/plain'
        );
        await FileSystem.writeAsStringAsync(fileUri, logLine, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        setLastLogWritePath(fileUri);
      } else {
        const folderPath = logFilePath.replace(/[^/]+$/, '');
        await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
        await FileSystem.writeAsStringAsync(logFilePath, logLine, {
          encoding: FileSystem.EncodingType.UTF8,
          append: true,
        });
        setLastLogWritePath(logFilePath);
      }
    } catch (logWriteError) {
      setMessage(`Could not write log file: ${String(logWriteError)}`);
    }
  };

  useEffect(() => {
    setShields(activeCharacter.shieldBonus);
  }, [activeCharacter.shieldBonus]);

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
    rewardedAd.load();

    const loadedUnsubscribe = rewardedAd.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        setRewardLoaded(true);
      }
    );

    const earnedUnsubscribe = rewardedAd.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        const bonusDuration = SLOW_MOTION_BASE_DURATION + activeCharacter.slowMotionBonus;
        setTokens((current) => current + 40);
        setLifetimeTokens((current) => current + 40);
        setShields((current) => current + 1);
        setSlowMotionSeconds((current) => Math.max(current, bonusDuration));
        setMessage('Ad reward: +40 tokens, +1 shield, slow motion activated!');
      }
    );

    const closedUnsubscribe = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      setRewardLoaded(false);
      rewardedAd.load();
    });

    const failedUnsubscribe = rewardedAd.addAdEventListener(AdEventType.ERROR, () => {
      setRewardLoaded(false);
      setMessage('Ad unavailable right now. Attempting to load again.');
      void appendErrorLog('Rewarded ad load/show error event', 'RewardedAd');
      rewardedAd.load();
    });

    return () => {
      loadedUnsubscribe();
      earnedUnsubscribe();
      closedUnsubscribe();
      failedUnsubscribe();
    };
  }, [activeCharacter.slowMotionBonus]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      tickRef.current += 1;
      setScore((current) => current + 1);

      setObstacles((current) => {
        const moved = current
          .map((obstacle) => ({ ...obstacle, y: obstacle.y + obstacleSpeed }))
          .filter((obstacle) => obstacle.y < 100);

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
        setSlowMotionSeconds((current) => Math.max(current - 1, 0));
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [activeMode.spawnEveryTicks, isPlaying, obstacleSpeed, slowMotionSeconds]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const incomingHit = obstacles.find(
      (obstacle) => obstacle.lane === playerLane && obstacle.y > 76 && obstacle.y < 94
    );

    if (!incomingHit) {
      return;
    }

    if (shields > 0) {
      setShields((current) => current - 1);
      setObstacles((current) => current.filter((obstacle) => obstacle.id !== incomingHit.id));
      setMessage('Shield absorbed the impact!');
      return;
    }

    setIsPlaying(false);
    setBestScores((current) => ({
      ...current,
      [selectedMode]: Math.max(current[selectedMode], score),
    }));
  }, [isPlaying, obstacles, playerLane, score, selectedMode, shields]);

  useEffect(() => {
    if (isPlaying || rewardedAtGameOverRef.current) {
      return;
    }

    rewardedAtGameOverRef.current = true;
    const runPayout = Math.max(5, Math.floor(score / 8) * activeMode.tokenMultiplier);

    setTokens((current) => current + runPayout);
    setLifetimeTokens((current) => current + runPayout);
    setMessage(`Run complete. You earned ${runPayout} tokens from ${activeMode.name}.`);
  }, [activeMode.name, activeMode.tokenMultiplier, isPlaying, score]);

  const moveLeft = () => {
    if (!isPlaying) {
      return;
    }

    setPlayerLane((current) => Math.max(0, current - 1));
  };

  const moveRight = () => {
    if (!isPlaying) {
      return;
    }

    setPlayerLane((current) => Math.min(LANE_COUNT - 1, current + 1));
  };

  const watchRewardAd = () => {
    if (!rewardLoaded) {
      setMessage('Reward ad still loading. Try again in a moment.');
      return;
    }

    try {
      rewardedAd.show();
      setRewardLoaded(false);
      setMessage('Watching rewarded ad...');
    } catch (error) {
      void appendErrorLog(error, 'WatchRewardAd');
      setMessage('Unable to show rewarded ad.');
    }
  };

  const simulatePaidTokenPack = () => {
    setTokens((current) => current + 300);
    setLifetimeTokens((current) => current + 300);
    setMessage('Paid pack credited: +300 tokens (dev simulation).');
  };

  const applyLogFolderPath = () => {
    const normalized = logFolderInput.trim();
    if (!normalized) {
      setMessage('Enter a folder path first.');
      return;
    }

    const withSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
    setLogFilePath(`${withSlash}alpha-errors.txt`);
    setMessage(`Log file set to: ${withSlash}alpha-errors.txt`);
  };

  const pickAndroidFolderPath = async () => {
    if (Platform.OS !== 'android') {
      setMessage('Folder picker is currently available on Android only in this alpha build.');
      return;
    }

    try {
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted || !permission.directoryUri) {
        setMessage('Folder selection cancelled.');
        return;
      }

      setLogFolderInput(permission.directoryUri);
      setLogFilePath(`${permission.directoryUri}/alpha-errors.txt`);
      setMessage(`Selected folder URI: ${permission.directoryUri}`);
    } catch (error) {
      void appendErrorLog(error, 'SelectLogFolder');
      setMessage('Unable to choose folder path on this device.');
    }
  };

  const writeAlphaTestLog = async () => {
    const testError = new Error('Alpha testing sample error log entry.');
    await appendErrorLog(testError, 'ManualAlphaTest');
    setMessage(`Sample error log written to ${logFilePath}`);
  };

  const changeMode = (mode: GameModeKey) => {
    if (isPlaying) {
      setMessage('Finish this run before switching sport mode.');
      return;
    }

    setSelectedMode(mode);
    setMessage(`${GAME_MODES[mode].name} selected.`);
  };

  const restart = () => {
    tickRef.current = 0;
    rewardedAtGameOverRef.current = false;

    setPlayerLane(1);
    setObstacles([]);
    setScore(0);
    setIsPlaying(true);
    setShields(activeCharacter.shieldBonus);
    setSlowMotionSeconds(0);
    setMessage('');
  };

  const handleCharacterAction = (character: Character) => {
    const isOwned = ownedCharacters.includes(character.id);

    if (isOwned) {
      setSelectedCharacterId(character.id);
      setMessage(`${character.name} equipped.`);
      return;
    }

    if (tokens < character.cost) {
      setMessage(`Not enough tokens for ${character.name}.`);
      return;
    }

    setTokens((current) => current - character.cost);
    setOwnedCharacters((current) => [...current, character.id]);
    setSelectedCharacterId(character.id);
    setMessage(`${character.name} unlocked and equipped.`);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Retro Rush Festival</Text>
        <Text style={styles.subtitle}>
          Surfing, skating, and hackey-inspired arcade challenges with progression.
        </Text>

        <View style={styles.hudRow}>
          <Text style={styles.hud}>Mode: {activeMode.name}</Text>
          <Text style={styles.hud}>Score: {score}</Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hud}>Best ({activeMode.name}): {bestScores[selectedMode]}</Text>
          <Text style={styles.hud}>Shields: {shields}</Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hud}>Tokens: {tokens}</Text>
          <Text style={styles.hud}>Lifetime: {lifetimeTokens}</Text>
        </View>

        <View style={styles.gameArea}>
          <View style={styles.laneDivider} />
          <View style={[styles.laneDivider, styles.secondDivider]} />

          {obstacles.map((obstacle) => (
            <View
              key={obstacle.id}
              style={[
                styles.obstacle,
                {
                  backgroundColor: activeMode.obstacleColor,
                  left: `${obstacle.lane * (100 / LANE_COUNT) + 7}%`,
                  top: `${obstacle.y}%`,
                },
              ]}
            />
          ))}

          <View
            style={[
              styles.player,
              {
                backgroundColor: activeCharacter.color,
                left: `${playerLane * (100 / LANE_COUNT) + 7}%`,
              },
            ]}
          />
        </View>

        <View style={styles.controlsRow}>
          <Pressable onPress={moveLeft} style={styles.button}>
            <Text style={styles.buttonText}>◀ Left</Text>
          </Pressable>
          <Pressable onPress={moveRight} style={styles.button}>
            <Text style={styles.buttonText}>Right ▶</Text>
          </Pressable>
        </View>

        <View style={styles.controlsRow}>
          <Pressable onPress={watchRewardAd} style={styles.rewardButton}>
            <Text style={styles.buttonText}>
              {rewardLoaded ? 'Watch Ad: +Tokens +Boost' : 'Loading Reward Ad...'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.controlsRow}>
          <Pressable onPress={simulatePaidTokenPack} style={styles.purchaseButton}>
            <Text style={styles.buttonText}>Buy Token Pack (+300, dev test)</Text>
          </Pressable>
        </View>

        {!isPlaying ? (
          <Pressable onPress={restart} style={styles.restartButton}>
            <Text style={styles.restartText}>Run Ended — Tap to Restart</Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Sport Modes (switch between runs)</Text>
        <View style={styles.modeList}>
          {(Object.keys(GAME_MODES) as GameModeKey[]).map((mode) => {
            const isActive = selectedMode === mode;

            return (
              <Pressable
                key={mode}
                onPress={() => changeMode(mode)}
                style={[styles.modeCard, isActive && styles.modeCardActive]}
              >
                <Text style={styles.modeName}>{GAME_MODES[mode].name}</Text>
                <Text style={styles.modeRule}>{GAME_MODES[mode].shortRules}</Text>
                <Text style={styles.modeRule}>Token multiplier: x{GAME_MODES[mode].tokenMultiplier}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Character Customization</Text>
        <View style={styles.characterList}>
          {CHARACTERS.map((character) => {
            const isOwned = ownedCharacters.includes(character.id);
            const isSelected = selectedCharacterId === character.id;

            return (
              <Pressable
                key={character.id}
                onPress={() => handleCharacterAction(character)}
                style={[styles.characterCard, isSelected && styles.characterCardSelected]}
              >
                <View style={[styles.characterBadge, { backgroundColor: character.color }]} />
                <View style={styles.characterContent}>
                  <Text style={styles.characterName}>{character.name}</Text>
                  <Text style={styles.characterDetails}>Cost: {character.cost} tokens</Text>
                  <Text style={styles.characterDetails}>{character.bonusDescription}</Text>
                  <Text style={styles.characterAction}>
                    {isOwned ? (isSelected ? 'Equipped' : 'Tap to Equip') : 'Tap to Unlock'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Alpha Settings: Error Logging</Text>
        <View style={styles.settingsCard}>
          <Text style={styles.settingsLabel}>Current log file path (.txt)</Text>
          <Text style={styles.settingsValue}>{logFilePath}</Text>
          <Text style={styles.settingsLabel}>Folder path/URI input</Text>
          <TextInput
            value={logFolderInput}
            onChangeText={setLogFolderInput}
            style={styles.pathInput}
            placeholder="file:///.../alpha-logs/"
            placeholderTextColor="#7FA1BE"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.controlsRow}>
            <Pressable onPress={applyLogFolderPath} style={styles.button}>
              <Text style={styles.buttonText}>Apply Folder Path</Text>
            </Pressable>
          </View>
          <View style={styles.controlsRow}>
            <Pressable onPress={pickAndroidFolderPath} style={styles.button}>
              <Text style={styles.buttonText}>Choose Folder (Android)</Text>
            </Pressable>
            <Pressable onPress={writeAlphaTestLog} style={styles.purchaseButton}>
              <Text style={styles.buttonText}>Write Test Log</Text>
            </Pressable>
          </View>
          <Text style={styles.settingsHint}>
            Last write location: {lastLogWritePath}
          </Text>
        </View>

        <Pressable onPress={() => setShowInstructions((current) => !current)} style={styles.helpToggle}>
          <Text style={styles.helpToggleText}>
            {showInstructions ? 'Hide Instructions' : 'Show Full Instructions'}
          </Text>
        </Pressable>

        {showInstructions ? (
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>How to Play</Text>
            <Text style={styles.instructionsText}>1. Pick a sport mode while not in an active run.</Text>
            <Text style={styles.instructionsText}>2. Use Left/Right to change lanes and avoid obstacles.</Text>
            <Text style={styles.instructionsText}>3. Survive longer to increase score and token payout.</Text>
            <Text style={styles.instructionsText}>4. Watch reward ads for tokens and in-run boosts.</Text>
            <Text style={styles.instructionsText}>5. Unlock/equip stronger characters using tokens.</Text>
            <Text style={styles.instructionsText}>6. Use paid token pack button for dev monetization flow testing.</Text>
            <Text style={styles.instructionsText}>7. Configure alpha error log path in Settings and use Write Test Log to verify.</Text>
            <Text style={styles.instructionsText}>Mode Tip: {activeMode.instruction}</Text>
            <Text style={styles.instructionsText}>
              Account Roadmap: Google Sign-In and Apple Sign-In should be added next to sync profile,
              inventory, and purchases across devices.
            </Text>
          </View>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#08101E',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    color: '#E6F7FF',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#94AEC7',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  hudRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  hud: {
    color: '#CFE1F2',
    fontSize: 14,
    fontWeight: '600',
  },
  gameArea: {
    height: 300,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D3F55',
    backgroundColor: '#111D30',
    position: 'relative',
    overflow: 'hidden',
    marginVertical: 8,
  },
  laneDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    left: '33.33%',
    backgroundColor: '#24364A',
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
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#1E3853',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  rewardButton: {
    flex: 1,
    backgroundColor: '#2A6F43',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  purchaseButton: {
    flex: 1,
    backgroundColor: '#7350B8',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#EAF6FF',
    fontWeight: '700',
    textAlign: 'center',
  },
  restartButton: {
    backgroundColor: '#7F2A40',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  restartText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#DBEFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  modeList: {
    gap: 8,
    marginBottom: 10,
  },
  modeCard: {
    borderWidth: 1,
    borderColor: '#34506A',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#12263B',
  },
  modeCardActive: {
    borderColor: '#6BC0FF',
  },
  modeName: {
    color: '#E9F6FF',
    fontWeight: '700',
    marginBottom: 4,
  },
  modeRule: {
    color: '#9EC1DF',
    fontSize: 12,
  },
  characterList: {
    gap: 8,
  },
  characterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#34506A',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#102133',
  },
  characterCardSelected: {
    borderColor: '#8AE1FF',
  },
  characterBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    marginRight: 10,
  },
  characterContent: {
    flex: 1,
  },
  characterName: {
    color: '#EAF7FF',
    fontWeight: '700',
    marginBottom: 2,
  },
  characterDetails: {
    color: '#9CB8D0',
    fontSize: 12,
  },
  characterAction: {
    color: '#9FD3A2',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsCard: {
    borderWidth: 1,
    borderColor: '#304D66',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#102032',
  },
  settingsLabel: {
    color: '#CFE8FF',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
  },
  settingsValue: {
    color: '#9DC4E7',
    fontSize: 12,
    marginBottom: 8,
  },
  pathInput: {
    borderWidth: 1,
    borderColor: '#3C607E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#EAF7FF',
    marginBottom: 8,
    fontSize: 12,
  },
  settingsHint: {
    color: '#8FB2D2',
    fontSize: 11,
    marginTop: 2,
  },
  helpToggle: {
    marginTop: 12,
    backgroundColor: '#1E3853',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  helpToggleText: {
    color: '#EAF6FF',
    fontWeight: '700',
  },
  instructionsCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#304D66',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#102032',
  },
  instructionsTitle: {
    color: '#DBF1FF',
    fontWeight: '700',
    marginBottom: 6,
  },
  instructionsText: {
    color: '#A4C5DF',
    fontSize: 12,
    marginBottom: 4,
  },
  message: {
    color: '#9FD3A2',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
  },
});
