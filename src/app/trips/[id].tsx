// Trip details on a screen of its own: for links that open a trip from outside the app
// (a notification, a shared link). Inside the app, trips open as a layer over the page
// you're on instead (openTrip in src/lib/trip-layer.ts). Both draw the same card.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TripDetails } from '@/components/trip-details';
import { goBack } from '@/lib/nav';
import { dayIndex } from '@/lib/trip-search';
import { makeStyles } from '@/theme/theme';

export default function TripPage() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [closing, setClosing] = useState(false);
  if (!id) return null;
  return (
    <GestureHandlerRootView style={styles.page}>
      <View style={StyleSheet.absoluteFill}>
        <TripDetails
          id={id}
          from={null}
          closing={closing}
          onRequestClose={() => setClosing(true)}
          onClosed={goBack}
          onFindOthers={(trip) =>
            router.replace({
              pathname: '/trips/results',
              params: { origin: trip.origin, destination: trip.destination, day: String(Math.max(0, dayIndex(trip.departs_at, new Date()))) },
            })
          }
        />
      </View>
    </GestureHandlerRootView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.surface },
}));
