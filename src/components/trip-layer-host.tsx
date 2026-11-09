// Draws the trip card over whatever page you're on when something calls openTrip()
// (see src/lib/trip-layer.ts). Mounted once, in the root layout.
//
// It's a Modal, so it sits above the tab bar too. When a step needs a real page (the ID
// check, Account for a photo, a results page), the page opens underneath and the card
// steps aside; back on the page you started from, it comes back as you left it.

import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogLayer } from '@/components/dialog-host';
import { TripDetails } from '@/components/trip-details';
import { dayIndex } from '@/lib/trip-search';
import { clearTrip, currentTrip, subscribeTrip } from '@/lib/trip-layer';

export function TripLayerHost() {
  const req = useSyncExternalStore(subscribeTrip, currentTrip, currentTrip);
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // Shown before (and now coming back): no opening morph the second time.
  const [seen, setSeen] = useState(false);
  const back = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!req) return;
    setOpenedAt(pathname);
    setClosing(false);
    setSeen(false);
  }, [req?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const parked = !!req && openedAt !== null && pathname !== openedAt;
  useEffect(() => {
    if (parked) setSeen(true);
  }, [parked]);

  if (!req) return null;
  return (
    <Modal
      visible={!parked}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (back.current ? back.current() : setClosing(true))}
    >
      {/* A Modal is its own native window, so gestures and pop-ups need their own roots inside it. */}
      {/* Its own safe-area root too: inside a tab, the inherited insets count the tab bar
          as "unsafe", which pushed the card's buttons and bar about 50pt too high. */}
      <SafeAreaProvider style={StyleSheet.absoluteFill}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <TripDetails
          key={req.key}
          id={req.id}
          from={req.from}
          settled={seen}
          closing={closing}
          onRequestClose={() => setClosing(true)}
          onClosed={clearTrip}
          backRef={back}
          onFindOthers={(trip) => {
            // Other trips that day: the results page, and the card folds away.
            router.push({
              pathname: '/trips/results',
              params: { origin: trip.origin, destination: trip.destination, day: String(Math.max(0, dayIndex(trip.departs_at, new Date()))) },
            });
            clearTrip();
          }}
        />
        <DialogLayer />
      </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}
