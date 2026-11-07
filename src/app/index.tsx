// Placeholder start screen. It exists to prove the plumbing works:
// fonts load, tokens apply, and Arabic lays out right-to-left.
// Sign up replaces it in the next PR.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deviceLanguage, isRTL, t } from '@/i18n';
import { colors, fonts, radii, sizes, space } from '@/theme/tokens';

export default function Start() {
  const lang = deviceLanguage();
  const f = fonts[lang];
  const direction = isRTL(lang) ? 'rtl' : 'ltr';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.body, { direction }]}>
        <Text style={[styles.title, { fontFamily: f.bold }]}>{t('appName', lang)}</Text>
        <Text style={[styles.tagline, { fontFamily: f.regular }]}>{t('tagline', lang)}</Text>
        <Text style={[styles.note, { fontFamily: f.regular }]}>{t('comingSoon', lang)}</Text>
      </View>
      <Pressable accessibilityRole="button" style={styles.button}>
        <Text style={[styles.buttonText, { fontFamily: f.medium }]}>{t('getStarted', lang)}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface, padding: space.lg },
  body: { flex: 1, justifyContent: 'center', gap: space.sm },
  title: { fontSize: 56, color: colors.ink, textAlign: 'auto' },
  tagline: { fontSize: 20, color: colors.ink },
  note: { fontSize: 15, color: colors.inkSecondary, marginTop: space.md },
  button: {
    height: sizes.button,
    borderRadius: radii.capsule,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.onInk, fontSize: 17 },
});
