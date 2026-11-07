// Placeholder home. PR 3 (post a trip) and PR 4 (find a seat) fill it in.

import { Body, Button, Screen, Title } from '@/components/ui';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { t } = useT();
  const { profile } = useSession();
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  return (
    <Screen footer={<Button variant="plain" label={t('signOut')} onPress={() => supabase.auth.signOut()} />}>
      <Title>
        {t('welcome')} {firstName}
      </Title>
      <Body muted>{t('homeSoon')}</Body>
    </Screen>
  );
}
