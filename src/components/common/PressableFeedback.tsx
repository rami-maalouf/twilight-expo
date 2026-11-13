// one pressable with platform press feedback: a material ripple on android
// (drawn in the foreground and clipped to the view's rounded shape) and the
// swiftui-style dim on ios. use it for every tappable control so nothing
// feels dead under the finger.
import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type FeedbackKind = 'surface' | 'icon';

export interface PressableFeedbackProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  // 'surface': bounded ripple over the whole control (buttons, rows, chips).
  // 'icon': unbounded circular ripple for icon-only buttons.
  kind?: FeedbackKind;
  // ripple color override, e.g. white on a colored fill
  rippleColor?: string;
}

const IOS_PRESSED_OPACITY = 0.55;

// ripple on a saturated fill (status buttons, save): light on any palette
export const ON_FILL_RIPPLE = 'rgba(255, 255, 255, 0.28)';

export function rippleColorFor(isLight: boolean): string {
  return isLight ? 'rgba(45, 27, 46, 0.14)' : 'rgba(255, 255, 255, 0.18)';
}

export function PressableFeedback({ style, kind = 'surface', rippleColor, disabled, ...rest }: PressableFeedbackProps) {
  const theme = useTheme();
  const color = rippleColor ?? rippleColorFor(theme.name === 'sunset');
  const isIcon = kind === 'icon';
  return (
    <Pressable
      disabled={disabled}
      android_ripple={
        disabled
          ? undefined
          : isIcon
            ? { color, borderless: true, radius: 24 }
            : { color, foreground: true }
      }
      style={(state) => [
        // a bounded ripple only follows rounded corners when the view clips
        !isIcon && Platform.OS === 'android' && styles.clip,
        typeof style === 'function' ? style(state) : style,
        Platform.OS === 'ios' && state.pressed && styles.pressedIos,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  pressedIos: { opacity: IOS_PRESSED_OPACITY },
});
