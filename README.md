# ReallyFunMoblleApp

Retro Rush Festival is a cross-platform mobile arcade game (Android + iOS) built with Expo + React Native.

It is inspired by classic multi-sport arcade collections (surfing/skating/hackey style) and adds progression + monetization loops suitable for modern mobile testing.

## What is included

- **Three playable retro-inspired modes**
  - **Surf Sprint** (steady lane rhythm)
  - **Skate Rush** (faster obstacle pace)
  - **Hackey Flow** (more frequent spawns)
- **Character customization + progression**
  - Starter and premium characters with gameplay perks
  - Character unlocks purchased using in-game tokens
- **Token economy sources**
  - Earned from completing runs
  - Earned from rewarded ads
  - Added through a dev monetization token-pack simulation button
- **Rewarded ads integration**
  - Uses `react-native-google-mobile-ads`
  - Configured with Google test IDs for safe development
- **Full in-app instructions panel**
  - Core controls, progression flow, mode-specific guidance, and account roadmap note
- **Alpha error logging settings**
  - Runtime error logs appended to on-device `.txt` file
  - Configurable path/URI from in-app settings screen

## Full gameplay instructions

1. Start a run in one of the sport modes.
2. Use **Left** and **Right** buttons to switch lanes.
3. Avoid incoming obstacles.
4. If you have shields, impacts consume shields first.
5. Survive longer to increase score and earn more tokens on run end.
6. Use **Watch Ad** for bonus tokens + temporary gameplay benefits.
7. Spend tokens on better characters to improve survivability.
8. Restart after run end and continue progression.

### Mode switching

- Sport mode switching is limited to between runs.
- This keeps each run fair and mode-specific.

### Character unlock/equip flow

- Tap a locked character to buy with tokens.
- Tap an owned character to equip.
- Character perks include starting shield and slow-motion bonus duration improvements.

## Monetization/testing flow

### Rewarded ads

- Tap **Watch Ad: +Tokens +Boost** when ad is loaded.
- Reward grants:
  - tokens
  - shield
  - slow-motion boost

### Paid revenue simulation (dev)

- Tap **Buy Token Pack (+300, dev test)** to simulate paid currency top-up.
- For production, replace this with real in-app purchases:
  - Google Play Billing (Android)
  - StoreKit (iOS)

## Alpha testing error logs (.txt)

- Open **Alpha Settings: Error Logging** in-app.
- Current default log path:
  - `file:///.../alpha-logs/alpha-errors.txt` (app documents directory)
- You can:
  - manually enter a folder path/URI and tap **Apply Folder Path**
  - choose an Android folder URI via **Choose Folder (Android)**
  - tap **Write Test Log** to verify file output immediately

### Notes / current limitations

- Android folder picker may return `content://` URIs; logs are written as SAF text files.
- iOS folder picker is not included in this alpha build; use manual path input or default path.
- This logging path flow is for alpha debugging and can be replaced before beta/end-user testing.

## User accounts roadmap (Google/Apple)

Current build includes account-readiness guidance in-app and in docs.

Next recommended implementation phase:
- Google Sign-In for Android
- Sign in with Apple for iOS
- Persist cloud profile:
  - tokens
  - owned characters
  - purchase history
  - leaderboard/progression data

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm run start
   ```
3. Run on emulator/device:
   ```bash
   npm run android
   npm run ios
   ```

## Type checks

```bash
npm run typecheck
```

## Android build compatibility (pinned)

The Android pipeline uses a pinned toolchain to avoid Kotlin metadata mismatch regressions.

| Layer | Pinned value |
| --- | --- |
| Expo SDK | `~57.0.10` |
| `expo-build-properties` | `57.0.8` |
| Kotlin (via `expo-build-properties`) | `2.1.20` |
| `react-native-google-mobile-ads` | `16.0.3` |
| Generated Gradle wrapper (`expo prebuild`) | `9.3.1` |

Preflight check:

```bash
npm run validate:android-toolchain
```

Safe upgrade workflow:
1. Update toolchain versions intentionally (do not use `^` for these pinned Android deps).
2. Run `npx expo prebuild --platform android --clean`.
3. Run `npm run validate:android-toolchain`.
4. Run Android build (`cd android && ./gradlew assembleDebug`) before merging.

## SDK-style downloadable internal test builds

This repository includes `eas.json` build profiles for installable testing artifacts.

### Android internal build

```bash
npm run build:android:preview
```

### iOS internal build

```bash
npm run build:ios:preview
```

After build completion, Expo/EAS provides downloadable install links/artifacts for immediate mobile testing.

## Project scripts

- `npm run start` — start Expo dev server
- `npm run android` — launch Android target
- `npm run ios` — launch iOS target
- `npm run web` — launch web target
- `npm run typecheck` — run TypeScript checks
- `npm run build:android:preview` — create Android internal-distribution build
- `npm run build:ios:preview` — create iOS internal-distribution build

## Production checklist

- Replace all ad test IDs with production AdMob IDs.
- Implement real IAP and server-side purchase validation.
- Add Google/Apple account auth and secure cloud save.
- Add anti-cheat safeguards for economy values.
- Test on physical Android and iOS devices.
