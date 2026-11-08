// "Repeats Sunday to Thursday" / "Repeats every Sun, Tue" for a trip that belongs to a weekly pattern.

import { describeDays, weekdayName } from '@/lib/recurring';
import { useT } from '@/lib/session';

export function useRepeatsText() {
  const { t, lang } = useT();
  return (weekdays: number[]): string => {
    const d = describeDays(weekdays);
    if (d.kind === 'daily') return t('repeatsDaily');
    if (d.kind === 'workWeek') return t('repeatsWorkWeek');
    return `${t('repeatsOn')} ${d.days.map((n) => weekdayName(n, lang)).join(lang === 'ar' ? '، ' : ', ')}`;
  };
}
