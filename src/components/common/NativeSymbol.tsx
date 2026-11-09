// expo-symbols: a string name is an SF Symbol and renders only on ios.
// android/web need a Material Symbols name. this wrapper keeps existing
// call sites on sf names and maps them. source:
// https://docs.expo.dev/versions/v58.0.0/sdk/symbols/
import bold from 'expo-symbols/androidWeights/bold';
import medium from 'expo-symbols/androidWeights/medium';
import regular from 'expo-symbols/androidWeights/regular';
import semiBold from 'expo-symbols/androidWeights/semiBold';
import { Platform, PixelRatio } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

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

export function NativeSymbol({ name, weight, size, style, ...rest }: SymbolViewProps) {
  const resolvedName =
    typeof name === 'string'
      ? { ios: name, android: androidSymbolFor(name), web: androidSymbolFor(name) }
      : name;
  const sizeVal = size ?? 24;
  const fontScale = Platform.OS === 'android' ? PixelRatio.getFontScale() : 1;
  const effectiveSize = sizeVal / fontScale;
  return (
    <SymbolView
      name={resolvedName}
      weight={resolveWeight(weight)}
      size={effectiveSize}
      style={[{ width: sizeVal, height: sizeVal, overflow: 'visible' }, style]}
      {...rest}
    />
  );
}
