#!/usr/bin/env bash
# The test app talks to the local Supabase over plain http://10.0.2.2:54321 (the emulator's
# name for the CI machine). Android blocks plain http in release builds unless the app
# says otherwise, so the generated manifest gets that one flag. Run after `expo prebuild`.
set -euo pipefail
manifest=android/app/src/main/AndroidManifest.xml
grep -q 'usesCleartextTraffic' "$manifest" \
  && sed -i 's/android:usesCleartextTraffic="false"/android:usesCleartextTraffic="true"/' "$manifest" \
  || sed -i 's/<application /<application android:usesCleartextTraffic="true" /' "$manifest"
grep -q 'android:usesCleartextTraffic="true"' "$manifest"
echo "cleartext http allowed in $manifest"
