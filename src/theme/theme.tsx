// Light, dark, or follow the phone (Settings > Appearance).
//
// Why a hook and not a constant: StyleSheet.create runs once when a file loads,
// like taking a photo of the colours. Switching to dark later wouldn't retake it.
// So screens ask for their colours while they draw:
//
//   const { c } = useTheme();                       // inline colours
//   const useStyles = makeStyles((c) => ({ ... })); // a style sheet per look
//
// The pick is saved on this phone only (not the profile): two phones can differ.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';

import { DEFAULT_PREF, nativeOverride, palettes, parsePref, resolveScheme, type AppearancePref, type Palette, type Scheme } from './palettes';

export type { AppearancePref, Palette, Scheme } from './palettes';

const KEY = 'rafiq.appearance';

type Theme = {
  /** The colours to draw with right now. */
  c: Palette;
  scheme: Scheme;
  dark: boolean;
  /** What the person picked in Settings. */
  pref: AppearancePref;
  setPref: (pref: AppearancePref) => void;
};

const fallback: Theme = { c: palettes.light, scheme: 'light', dark: false, pref: DEFAULT_PREF, setPref: () => {} };
const ThemeContext = createContext<Theme>(fallback);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<AppearancePref | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .catch(() => null)
      .then((saved) => setPrefState(parsePref(saved)));
  }, []);

  // Tell iOS and Android first, so the keyboard, Liquid Glass, blur, alerts and
  // the status bar all draw in the same look as the screens.
  useEffect(() => {
    // (The web build has no such switch; there the page follows the browser.)
    if (pref && Platform.OS !== 'web') Appearance.setColorScheme(nativeOverride(pref));
  }, [pref]);

  // With an override set, this is the override; with 'unspecified', the phone's own look.
  const phone = useColorScheme();
  const scheme = resolveScheme(pref ?? DEFAULT_PREF, phone);
  const c = palettes[scheme];

  // The window behind every screen (seen during transitions and keyboard moves).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.surface).catch(() => {});
  }, [c.surface]);

  const setPref = useCallback((next: AppearancePref) => {
    setPrefState(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const value = useMemo<Theme>(
    () => ({ c, scheme, dark: scheme === 'dark', pref: pref ?? DEFAULT_PREF, setPref }),
    [c, scheme, pref, setPref],
  );

  // Hold the first frame until the saved pick is read (a few ms, under the splash),
  // so a dark-mode person never sees a light flash.
  if (!pref) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * A style sheet that follows the look. Built once per look and reused:
 *
 *   const useStyles = makeStyles((c) => ({ row: { borderColor: c.hairline } }));
 *   function Row() { const styles = useStyles(); ... }
 */
type Styles = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<T extends Styles>(build: (c: Palette) => T): () => Readonly<T> {
  const built: Partial<Record<Scheme, Readonly<T>>> = {};
  return function useStyles() {
    const { scheme } = useTheme();
    return (built[scheme] ??= StyleSheet.create(build(palettes[scheme])));
  };
}
