import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const LANE_COUNT = 3;
const TICK_MS = 120;
const BASE_SPEED = 5;
const SPAWN_EVERY_TICKS = 7;
const SLOW_MOTION_DURATION = 20;

type Obstacle = {
  id: number;
  lane: number;
  y: number;
};

const rewardedAd = RewardedAd.createForAdRequest(TestIds.REWARDED, {
  requestNonPersonalizedAdsOnly: true,
});

export default function App() {
  const tickRef = useRef(0);
  const [playerLane, setPlayerLane] = useState(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [shields, setShields] = useState(1);
  const [slowMotionSeconds, setSlowMotionSeconds] = useState(0);
  const [rewardLoaded, setRewardLoaded] = useState(false);
  const [rewardMessage, setRewardMessage] = useState('');

  const obstacleSpeed = useMemo(
    () => (slowMotionSeconds > 0 ? BASE_SPEED * 0.6 : BASE_SPEED),
    [slowMotionSeconds]
  );

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
        setShields((current) => current + 1);
        setSlowMotionSeconds((current) => Math.max(current, SLOW_MOTION_DURATION));
        setRewardMessage('Reward unlocked: +1 Shield and Slow Motion!');
      }
    );

    const closedUnsubscribe = rewardedAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        setRewardLoaded(false);
        rewardedAd.load();
      }
    );

    const failedUnsubscribe = rewardedAd.addAdEventListener(
      AdEventType.ERROR,
      () => {
        setRewardLoaded(false);
        setRewardMessage('Ad unavailable. Loading another reward ad...');
        rewardedAd.load();
      }
    );

    return () => {
      loadedUnsubscribe();
      earnedUnsubscribe();
      closedUnsubscribe();
      failedUnsubscribe();
    };
  }, []);

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

        if (tickRef.current % SPAWN_EVERY_TICKS === 0) {
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
  }, [isPlaying, obstacleSpeed, slowMotionSeconds]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const incomingHit = obstacles.find(
      (obstacle) => obstacle.lane === playerLane && obstacle.y > 78 && obstacle.y < 95
    );

    if (!incomingHit) {
      return;
    }

    if (shields > 0) {
      setShields((current) => current - 1);
      setObstacles((current) => current.filter((obstacle) => obstacle.id !== incomingHit.id));
      setRewardMessage('Shield absorbed damage!');
      return;
    }

    setIsPlaying(false);
    setBestScore((current) => Math.max(current, score));
  }, [isPlaying, obstacles, playerLane, score, shields]);

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

  const showRewardAd = () => {
    if (!rewardLoaded) {
      setRewardMessage('Reward ad still loading. Try again in a moment.');
      return;
    }

    rewardedAd.show();
    setRewardLoaded(false);
    setRewardMessage('Watching ad...');
  };

  const restart = () => {
    setPlayerLane(1);
    setObstacles([]);
    setScore(0);
    tickRef.current = 0;
    setIsPlaying(true);
    setShields(1);
    setSlowMotionSeconds(0);
    setRewardMessage('');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Pulse Drift</Text>
      <Text style={styles.subtitle}>
        Swipe-free lane dodge with shield bursts and ad-powered boosts
      </Text>

      <View style={styles.hudRow}>
        <Text style={styles.hud}>Score: {score}</Text>
        <Text style={styles.hud}>Best: {bestScore}</Text>
      </View>

      <View style={styles.hudRow}>
        <Text style={styles.hud}>Shields: {shields}</Text>
        <Text style={styles.hud}>Slow Motion: {slowMotionSeconds}s</Text>
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
        <Pressable onPress={showRewardAd} style={styles.rewardButton}>
          <Text style={styles.buttonText}>
            {rewardLoaded ? 'Watch Reward Ad (+Shield +SlowMo)' : 'Loading Reward Ad...'}
          </Text>
        </Pressable>
      </View>

      {rewardMessage ? <Text style={styles.rewardMessage}>{rewardMessage}</Text> : null}

      {!isPlaying ? (
        <Pressable onPress={restart} style={styles.restartButton}>
          <Text style={styles.restartText}>Game Over — Tap to Restart</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#08101E',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    color: '#E6F7FF',
    fontSize: 34,
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
  },
  hud: {
    color: '#CFE1F2',
    fontSize: 16,
    fontWeight: '600',
  },
  gameArea: {
    flex: 1,
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
    backgroundColor: '#FF4D6D',
    borderRadius: 6,
  },
  player: {
    position: 'absolute',
    width: '19%',
    height: 28,
    backgroundColor: '#40E0D0',
    borderRadius: 8,
    bottom: '6%',
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
  buttonText: {
    color: '#EAF6FF',
    fontWeight: '700',
    textAlign: 'center',
  },
  rewardMessage: {
    color: '#9FD3A2',
    textAlign: 'center',
    marginBottom: 10,
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
});
