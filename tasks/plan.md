# Implementation Plan: Android native port

## Overview

Twilight already boots on Android (checkpoint 9, boot-scope only). This pass keeps the same screens, routes, domain, and Skia charts, and swaps chrome to native Android widgets where Expo UI / system components exist.

iOS stays untouched in behavior. Live Activity stays iOS-only.

## Architecture Decisions

- Keep custom Twilight visuals (gradient, starfield, Skia charts, circular picker) as RN on both platforms.
- Prefer universal `@expo/ui` when it covers the control (Picker, Host). Drop to `@expo/ui/jetpack-compose` only for Material widgets the universal layer does not expose (SegmentedButton).
- Platform files live under `src/components/` (never `src/app/`) because Expo Router does not support `.android.tsx` route files.
- Icons: `expo-symbols` SF string names render nothing on Android. Wrap them with a Material mapping.

## Sources

- Expo UI universal: https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/
- Jetpack SegmentedButton: https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/segmentedbutton/
- Expo Symbols (Android Material names): https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
- Native tabs already pass `md` icons in `src/app/(tabs)/_layout.tsx`

## Task List

### Phase 1: Icons + native pickers
- NativeSymbol SF -> Material map
- SegmentedPicker.android.tsx (Compose SegmentedButton)
- Settings MenuPicker.android.tsx (universal Picker) + hide Live Activity

### Phase 2: Visual Android gaps
- GlowingMoon uses Material moon instead of a circle
- Card elevation on Android
- Android sheet presentation fallback

### Phase 3: Device verification
- Boot fable5_api_36, `bunx expo run:android`, walk tabs with Argent
