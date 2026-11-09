// The bell on a checkpoint: tap it to follow (the bell fills in, gives a little ring and
// a confirming buzz), tap again to stop following.

import { Pressable, StyleSheet } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { selectFeel, successFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors } from '@/theme/tokens';

export function FollowBell({ following, onToggle }: { following: boolean; onToggle: () => void }) {
  const { t } = useT();
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);

  function press() {
    if (following) {
      selectFeel();
    } else {
      successFeel();
      // A small pop and a ring: the bell swings a few times and settles.
      scale.value = withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 12, stiffness: 260 }));
      tilt.value = withSequence(
        withTiming(-16, { duration: 70, reduceMotion: ReduceMotion.System }),
        withTiming(14, { duration: 90, reduceMotion: ReduceMotion.System }),
        withTiming(-9, { duration: 90, reduceMotion: ReduceMotion.System }),
        withTiming(5, { duration: 80, reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 80, reduceMotion: ReduceMotion.System }),
      );
    }
    onToggle();
  }

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: following }}
      accessibilityLabel={t(following ? 'followingCheckpoint' : 'followCheckpoint')}
      onPress={press}
      hitSlop={8}
      style={({ pressed }) => [styles.circle, following && styles.on, pressed && { opacity: 0.7 }]}
    >
      <Animated.View style={style}>
        <Icon name={following ? 'bellFill' : 'bell'} size={20} color={following ? colors.onInk : colors.ink} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.ink },
});
