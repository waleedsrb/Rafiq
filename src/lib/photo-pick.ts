// Taking or choosing one photo: the ID check and the profile photo both use this.
//
// On a phone it first asks "Take a photo / Choose from photos" in our own pop-up, waits for
// that pop-up to finish leaving (iOS can't open the camera or photos on top of it, see #48),
// then opens the camera or the photo library. The web has no camera picker, so it goes
// straight to files.

import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { choose, dialogsClosed } from '@/lib/dialog';

export type Picked = { uri: string; base64: string; mimeType: string };

/** 'denied' = the person said no to camera or photos access; null = they cancelled. */
export type PickResult = Picked | 'denied' | null;

export async function pickPhoto(from: 'camera' | 'library', opts: { square?: boolean } = {}): Promise<PickResult> {
  const perm =
    from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: opts.square ? 0.5 : 0.6,
    base64: true,
    // A face photo: let the person crop it to a square, like every app's profile photo.
    ...(opts.square ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}),
  };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = res.canceled ? null : res.assets[0];
  if (!asset?.base64) return null;
  return { uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/**
 * Ask camera or photos, then pick. `extra` adds more rows to the same pop-up
 * (e.g. "Remove photo"); choosing one of those resolves its value instead.
 */
export async function askForPhoto<E extends string = never>(o: {
  title: string;
  labels: { take: string; choose: string; cancel: string };
  square?: boolean;
  extra?: { label: string; value: E; icon?: string }[];
}): Promise<PickResult | E> {
  if (Platform.OS === 'web' && !o.extra?.length) return pickPhoto('library', { square: o.square });
  const from = await choose<'camera' | 'library' | E>({
    title: o.title,
    options: [
      ...(Platform.OS === 'web' ? [] : [{ label: o.labels.take, value: 'camera' as const, icon: 'camera' }]),
      { label: o.labels.choose, value: 'library' as const, icon: 'image' },
      ...(o.extra ?? []),
    ],
    cancel: o.labels.cancel,
  });
  if (!from) return null;
  if (from !== 'camera' && from !== 'library') return from as E;
  const source = from as 'camera' | 'library';
  // Let the pop-up finish leaving first.
  await dialogsClosed();
  return pickPhoto(source, { square: o.square });
}
