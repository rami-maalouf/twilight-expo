// expo-symbols: a string name is an SF Symbol and renders only on ios.
// android/web need a Material Symbols name. this wrapper keeps existing
// call sites on sf names and maps them. source:
// https://docs.expo.dev/versions/v58.0.0/sdk/symbols/
import bold from 'expo-symbols/androidWeights/bold';
import medium from 'expo-symbols/androidWeights/medium';
import regular from 'expo-symbols/androidWeights/regular';
import semiBold from 'expo-symbols/androidWeights/semiBold';
import { loadAsync } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform, PixelRatio, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import FILLED_SYMBOLS from './filled-symbols.json';
import { androidSymbolFor } from './native-symbol-map';

export { androidSymbolFor, SF_TO_ANDROID } from './native-symbol-map';

function resolveWeight(weight: SymbolViewProps['weight']): SymbolViewProps['weight'] {
  if (weight == null || typeof weight === 'object') return weight;
  const android =
    weight === 'bold' || weight === 'heavy' || weight === 'black'
      ? bold
      : weight === 'semibold'
        ? semiBold
        : weight === 'medium'
          ? medium
          : regular;
  return { ios: weight, android };
}

// sf ".fill" names render solid on android from a FILL 1 subset of material
// symbols (scripts/generate-filled-symbols.py); expo-symbols only ships the
// outlined font. loaded once on first use; the outlined glyph shows until then.
const FILLED_FONT = 'TwilightSymbolsFilled';
let filledFont: Promise<void> | null = null;
let filledFontReady = false;

function useFilledFont(enabled: boolean): boolean {
  const [ready, setReady] = useState(filledFontReady);
  useEffect(() => {
    if (!enabled || filledFontReady) return;
    filledFont ??= loadAsync({ [FILLED_FONT]: require('../../../assets/fonts/MaterialSymbolsFilled.ttf') }).then(() => {
      filledFontReady = true;
    });
    let live = true;
    filledFont.then(() => live && setReady(true)).catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled]);
  return ready;
}

export function filledCodepointFor(name: SymbolViewProps['name']): number | undefined {
  if (typeof name !== 'string' || !name.endsWith('.fill')) return undefined;
  return (FILLED_SYMBOLS as Record<string, number>)[androidSymbolFor(name)];
}

export function NativeSymbol({ name, weight, size, style, tintColor, ...rest }: SymbolViewProps) {
  const resolvedName =
    typeof name === 'string'
      ? { ios: name, android: androidSymbolFor(name), web: androidSymbolFor(name) }
      : name;
  const sizeVal = size ?? 24;
  const fontScale = Platform.OS === 'android' ? PixelRatio.getFontScale() : 1;
  const effectiveSize = sizeVal / fontScale;
  const filled = Platform.OS === 'android' ? filledCodepointFor(name) : undefined;
  const filledReady = useFilledFont(filled != null);
  if (filled != null && filledReady) {
    return (
      <View
        collapsable={false}
        testID={rest.testID}
        style={[{ width: sizeVal, height: sizeVal, overflow: 'visible' }, style]}>
        <Text
          aria-hidden
          allowFontScaling={false}
          style={{
            fontFamily: FILLED_FONT,
            color: typeof tintColor === 'string' ? tintColor : undefined,
            fontSize: sizeVal,
            lineHeight: sizeVal,
          }}>
          {String.fromCharCode(filled)}
        </Text>
      </View>
    );
  }
  return (
    <SymbolView
      name={resolvedName}
      weight={resolveWeight(weight)}
      size={effectiveSize}
      style={[{ width: sizeVal, height: sizeVal, overflow: 'visible' }, style]}
      tintColor={tintColor}
      {...rest}
    />
  );
}
