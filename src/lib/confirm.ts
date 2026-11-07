import { Alert, Platform } from 'react-native';

/** A yes/no question before something that can't be undone. */
export function confirm(title: string, body: string, yes: string, no: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
