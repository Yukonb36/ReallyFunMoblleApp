# ReallyFunMoblleApp

Pulse Drift is a cross-platform mobile arcade game (Android + iOS) built with Expo + React Native.

## What was built

- **Original gameplay twist:** lane-dodging survival inspired by mainstream endless runners, but with a tactical system:
  - 3-lane obstacle dodging
  - built-in shield mechanics
  - optional rewarded-ad boosts that grant shield + slow motion
- **Rewarded ad support:** Google Mobile Ads integration using test ad units for safe development/testing.
- **Cross-platform setup:** Android and iOS configuration included.
- **Immediate testing flow:** Expo local testing + EAS internal distribution build profiles.

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm run start
   ```
3. Run on device/emulator:
   ```bash
   npm run android
   npm run ios
   ```

## Rewarded ads behavior

- Tap **Watch Reward Ad** when loaded.
- Completing the rewarded ad grants:
  - `+1 Shield`
  - `20s Slow Motion`

> The app is configured with Google **test** app IDs and test rewarded ad unit IDs. Replace them with your own production IDs before store release.

## SDK-style downloadable test builds (internal distribution)

This repo includes `eas.json` profiles so you can generate installable builds quickly.

### Android downloadable build

```bash
npm run build:android:preview
```

### iOS internal test build

```bash
npm run build:ios:preview
```

After each build completes, Expo/EAS provides a downloadable artifact/install link for immediate mobile testing.

## Project scripts

- `npm run start` — start Expo dev server
- `npm run android` — launch Android target
- `npm run ios` — launch iOS target
- `npm run web` — run web target
- `npm run typecheck` — run TypeScript checks
- `npm run build:android:preview` — create Android internal-distribution build
- `npm run build:ios:preview` — create iOS internal-distribution build

## Notes before production release

- Replace all test ad IDs with production IDs from AdMob.
- Configure real bundle/package identifiers.
- Test rewarded flow on physical Android and iOS devices.
