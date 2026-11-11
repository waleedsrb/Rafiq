// A number plate drawn like the real thing, so a passenger can match it at a glance.
// Always left to right, even inside Arabic.

import { Text, View } from 'react-native';

import { makeStyles } from '@/theme/theme';
import { fonts, radii } from '@/theme/tokens';

export function Plate({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' }) {
  const styles = useStyles();
  const small = size === 'sm';
  return (
    <View style={[styles.plate, small && { height: 34 }]} accessibilityLabel={plate}>
      <Text style={[styles.text, small && { fontSize: 17, paddingHorizontal: 10 }]}>{plate}</Text>
      <View style={[styles.side, small && { width: 22 }]}>
        <Text style={[styles.sideText, small && { fontSize: 11 }]}>P</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  plate: {
    flexDirection: 'row',
    direction: 'ltr',
    alignSelf: 'flex-start',
    height: 48,
    borderRadius: radii.plate,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  text: {
    fontFamily: fonts.en.bold,
    fontSize: 24,
    letterSpacing: 1.5,
    color: colors.plateInk,
    paddingHorizontal: 14,
    alignSelf: 'center',
  },
  side: { width: 30, backgroundColor: colors.plateInk, alignItems: 'center', justifyContent: 'center' },
  sideText: { fontFamily: fonts.en.bold, color: '#FFFFFF', fontSize: 14 },
}));
