// Turns the normal app config into the end-to-end test build, on the CI machine only
// (nothing here is committed back). Run before `expo prebuild`, from the repo root.
//
//  - No over-the-air updates: the test must run the JavaScript it just built, not
//    whatever was last published to the preview branch.
//  - A placeholder Google Maps key: without any key, Android's map crashes the app as soon
//    as a map appears. With a wrong key it simply draws an empty grid, which is fine here.
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'app.json';
const app = JSON.parse(readFileSync(file, 'utf8'));
app.expo.updates = { ...app.expo.updates, enabled: false };
app.expo.android = {
  ...app.expo.android,
  config: { ...app.expo.android?.config, googleMaps: { apiKey: 'e2e-placeholder-no-maps' } },
};
writeFileSync(file, `${JSON.stringify(app, null, 2)}\n`);
console.log('app.json prepared for the end-to-end build');
