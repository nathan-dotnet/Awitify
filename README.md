# Awitify

An offline-first local music player starter built with Expo + React Native + TypeScript. The UI uses Awitify's midnight/blue palette: `#1E6BD7`, `#1E31D7`, `#141419`, `#FFFFFF`, `#B3B3B3`, and `#535353`.

## Included in this starter

- Home, Search, Library, and Settings tabs
- Import audio files with Android's document picker and copy them into app-owned storage
- SQLite-backed local music metadata and liked songs
- Local search, mini-player, full player, play/pause, previous/next, and a basic queue panel
- Expo Audio background-playback config and lock-screen metadata/control hooks
- No backend, account, streaming API, or online catalog

## Run it

Requires Node.js LTS and Android Studio/Android SDK for a native Android build.

```bash
npm install
npx expo start
```

For Android background playback and lock-screen controls, use a development or production build rather than relying on Expo Go:

```bash
npx expo run:android
```

If you use EAS Build, configure an Android development profile in `eas.json` and build the native app. Test on a physical Android phone with the screen locked, with another app in foreground, and from the notification/lock screen.

## Notes before release

This is a working starter, not a release-certified music player. The current import flow treats file names as song titles and labels artist/album as unknown/local files; full metadata parsing, playlists, history, deletion management, artwork, robust queue persistence, and comprehensive automated tests remain to be implemented. Validate Expo Audio's exact lock-screen controls and foreground-service behavior on the Android SDK/device combination you target. Background playback cannot be fully validated in a browser preview.
