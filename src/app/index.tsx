// Start screen for signed-out people. The intro animation and welcome slides
// come later; for now it's the name, the promise and one button.

import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Screen } from '@/components/ui';
import { isRTL } from '@/i18n';
import { useT } from '@/lib/session';
import { track } from '@/lib/track';
import { colors, fonts, space } from '@/theme/tokens';

export default function Start() {
  const { t, lang } = useT();

  return (
    <Screen
      footer={
        <Button
          label={t('getStarted')}
          onPress={() => {
            track('signup_started');
            router.push('/sign-up/phone');
          }}
        />
      }
    >
      <View style={styles.center}>
        <Text style={[styles.wordmark, { fontFamily: fonts[lang].bold, textAlign: isRTL(lang) ? 'right' : 'left' }]}>
          {t('appName')}
        </Text>
        <Body>{t('tagline')}</Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: space.sm },
  wordmark: { fontSize: 56, color: colors.ink },
});
