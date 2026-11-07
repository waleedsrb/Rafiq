// The status mark for a checkpoint: a tinted circle with an icon, plus the status word.
// Status is always icon + word, never colour alone (design system rule).

import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ltr, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { minutesAgo, type CheckpointStatus } from '@/lib/checkpoints';
import { useT } from '@/lib/session';
import { colors } from '@/theme/tokens';

export const STATUS_LOOK: Record<CheckpointStatus, { color: string; soft: string; icon: IconName | null; word: StringKey }> = {
  open: { color: colors.statusOpen, soft: colors.statusOpenSoft, icon: 'check', word: 'statusOpen' },
  crowded: { color: colors.statusCrowded, soft: colors.statusCrowdedSoft, icon: null, word: 'statusCrowded' },
  closed: { color: colors.statusClosed, soft: colors.statusClosedSoft, icon: 'x', word: 'statusClosed' },
};

/** 40pt circle; grey with a dash when there is no recent report. */
export function StatusCircle({ status, size = 40 }: { status: CheckpointStatus | null; size?: number }) {
  const look = status ? STATUS_LOOK[status] : null;
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: look ? look.soft : colors.sunken },
      ]}
    >
      {look?.icon ? (
        <Icon name={look.icon} size={size * 0.38} color={look.color} />
      ) : (
        <Text style={[styles.mark, { color: look ? look.color : colors.inkSecondary }]}>{look ? '!' : '–'}</Text>
      )}
    </View>
  );
}

/** The status word in its colour, or "No recent reports". */
export function StatusWord({ status }: { status: CheckpointStatus | null }) {
  const { t } = useT();
  const { f } = useFont();
  return (
    <Text style={[styles.word, { fontFamily: f.medium, color: status ? STATUS_LOOK[status].color : colors.inkSecondary }]}>
      {status ? t(STATUS_LOOK[status].word) : t('noRecentReports')}
    </Text>
  );
}

/** One row of checkpoint_overview(). */
export type Overview = {
  id: string;
  name_ar: string;
  name_en: string;
  status: CheckpointStatus | null;
  reports_30m: number;
  last_report_at: string | null;
};

/** "8 min ago" / "قبل 8 د", or "just now". */
export function useAgo() {
  const { t, lang } = useT();
  return (iso: string, now: Date) => {
    const m = minutesAgo(new Date(iso), now);
    if (m < 1) return t('justNow');
    return lang === 'ar' ? `قبل ${ltr(m)} ${t('minAgo')}` : `${ltr(m)} ${t('minAgo')}`;
  };
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  mark: { fontSize: 16, fontWeight: '700' },
  word: { fontSize: 14 },
});
