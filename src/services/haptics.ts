// one place for app haptics. ios keeps the swift UIImpactFeedbackGenerator
// styles; android uses its native haptic constants (performHapticFeedback)
// instead of emulated impacts, so the feel matches the system's own pickers,
// menus and buttons.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticEvent =
  // display mode / theme color picked (swift: medium impact)
  | 'selection'
  // the circular time picker grabs a handle or snaps to the next 5 minutes
  | 'dial-grab'
  | 'dial-tick'
  // the circular time picker handle is released
  | 'dial-release'
  // a long-press action fired (go to sleep / wake up)
  | 'long-press'
  // a small secondary button was tapped
  | 'tap';

export type HapticPlan =
  | { kind: 'impact'; style: Haptics.ImpactFeedbackStyle }
  | { kind: 'android'; type: Haptics.AndroidHaptics };

export function hapticPlan(event: HapticEvent, platform: string): HapticPlan {
  if (platform === 'android') {
    switch (event) {
      case 'selection':
        return { kind: 'android', type: Haptics.AndroidHaptics.Segment_Tick };
      case 'dial-grab':
        return { kind: 'android', type: Haptics.AndroidHaptics.Gesture_Start };
      case 'dial-tick':
        return { kind: 'android', type: Haptics.AndroidHaptics.Clock_Tick };
      case 'dial-release':
        return { kind: 'android', type: Haptics.AndroidHaptics.Confirm };
      case 'long-press':
        return { kind: 'android', type: Haptics.AndroidHaptics.Long_Press };
      case 'tap':
        return { kind: 'android', type: Haptics.AndroidHaptics.Virtual_Key };
    }
  }
  switch (event) {
    case 'selection':
    case 'dial-release':
    case 'long-press':
      return { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium };
    case 'dial-grab':
    case 'dial-tick':
    case 'tap':
      return { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Light };
  }
}

export function playHaptic(event: HapticEvent): void {
  const plan = hapticPlan(event, Platform.OS);
  const run =
    plan.kind === 'android'
      ? Haptics.performAndroidHapticsAsync(plan.type)
      : Haptics.impactAsync(plan.style);
  run.catch(() => {});
}
