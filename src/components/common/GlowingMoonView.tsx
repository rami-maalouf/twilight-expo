// ports: Components/Common/GlowingMoonView.swift
// sf symbol moon with 3 breathing glow layers (native shadow = blur that follows the icon alpha)
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useFixedColor } from '@/theme/ThemeProvider';

const GLOW_LAYERS = [
  { radius: 40, opacity: 0.15 },
  { radius: 25, opacity: 0.25 },
  { radius: 12, opacity: 0.4 },
];

function GlowLayer({
  radius,
  opacity,
  breath,
  color,
  size,
}: {
  radius: number;
  opacity: number;
  breath: { value: number };
  color: string;
  size: number;
}) {
  // the original animates a blur radius. a native shadow (a blur that follows
  // the icon alpha) is re-rendered whenever any prop on its view changes, so the
  // shadows stay static and wrappers animate: scale on the outer view, and a
  // cross-fade from the tight (0.6r) to the wide (1.5r) shadow for the blur.
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1.0, 1.15]) }],
  }));
  const tightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [opacity * 0.5, 0]),
  }));
  const wideStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0, opacity * 1.6]),
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center, scaleStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, tightStyle]}>
        <View style={[styles.glow, { shadowColor: color, shadowRadius: radius * 0.6 }]}>
          <MoonIcon color={color} size={size} />
        </View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, wideStyle]}>
        <View style={[styles.glow, { shadowColor: color, shadowRadius: radius * 1.5 }]}>
          <MoonIcon color={color} size={size} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function MoonIcon({ color, size }: { color: string; size: number }) {
  return (
    <NativeSymbol
      name="moon.stars.fill"
      size={size}
      tintColor={color}
      resizeMode="scaleAspectFit"
    />
  );
}

export function GlowingMoonView({
  accentColor = '#ffd700',
  size = 80,
}: {
  accentColor?: string;
  size?: number;
}) {
  const fixed = useFixedColor();
  const moonColor = fixed(accentColor);
  const breath = useSharedValue(0);

  useEffect(() => {
    // easeInOut 3.0s repeatForever autoreverse
    breath.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [breath]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1.0, 1.05]) }],
  }));

  // the container is sized generously so glow layers are not clipped
  const box = size * 2;
  return (
    <View style={[styles.center, { width: box, height: box }]}>
      {GLOW_LAYERS.map((layer) => (
        <GlowLayer
          key={layer.radius}
          radius={layer.radius}
          opacity={layer.opacity}
          breath={breath}
          color={moonColor}
          size={size}
        />
      ))}
      <Animated.View style={iconStyle}>
        <MoonIcon color={moonColor} size={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } },
});
