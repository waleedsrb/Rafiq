// The signed-out landing page. The root launch gate owns cold-start motion,
// so returning here or resuming from the background never replays the intro.
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RafiqMark, MARK_RATIO } from '@/components/rafiq-mark';
import { Button, useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Intro() {
  const { dark: themeDark } = useTheme();
  const styles = useStyles();
  const { t } = useT();
  const { f } = useFont();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [uiHeight, setUiHeight] = useState(270);
  const H = 360 * height / width;
  const centerY = Math.max(110, Math.min(H * 0.414, H - (uiHeight + insets.bottom + 42) * 360 / width - 70));
  const markHeight = 615 * 0.225 * width / 360;
  return (
    <View style={styles.root}>
      <StatusBar style={themeDark ? 'light' : 'dark'} />
      <View style={{ position: 'absolute', top: centerY * width / 360 - markHeight / 2, left: (width - markHeight * MARK_RATIO) / 2 }}>
        <RafiqMark size={markHeight} />
      </View>
      <View onLayout={(event) => setUiHeight(event.nativeEvent.layout.height)} style={[styles.ui, { bottom: insets.bottom + 16 }]}>
        <Text style={[styles.name, { fontFamily: f.bold }]}>{t('appName')}</Text>
        <Text style={[styles.line, { fontFamily: f.regular }]}>{t('slide1Title')}</Text>
        <Button
          label={t('getStarted')}
          onPress={() => router.push('/welcome')}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sign-up/phone')}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.secondaryText, { fontFamily: f.medium }]}>{t('haveAccount')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  ui: { position: 'absolute', left: space.lg, right: space.lg, gap: 10 },
  name: { fontSize: 40, lineHeight: 48, color: colors.ink, textAlign: 'center', letterSpacing: -0.4 },
  line: { fontSize: 16, lineHeight: 24, color: colors.inkSecondary, textAlign: 'center', marginBottom: 18 },
  secondary: { minHeight: 44, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, color: colors.ink },
}));
