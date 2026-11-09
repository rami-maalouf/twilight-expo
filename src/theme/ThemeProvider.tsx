// theme context: components never hardcode palette hexes (spec code style)
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, StatusBar, useColorScheme } from 'react-native';

import type { ThemeMode, ThemePalette } from '../domain/models';
import type { SettingsStore } from '../data/settings-store';
import { desaturateColor, desaturateTheme, resolveTheme, type AppTheme } from './palettes';

interface ThemeControls {
  mode: ThemeMode;
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
}

const ThemeContext = createContext<AppTheme | null>(null);
const ThemeControlsContext = createContext<ThemeControls | null>(null);
const DesaturatedContext = createContext(false);

export function ThemeProvider({
  store,
  desaturated = false,
  children,
}: {
  store: SettingsStore;
  // grayscale-while-asleep: the app root flips this while a session is active
  desaturated?: boolean;
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme() ?? 'dark';
  const [mode, setModeState] = useState<ThemeMode>(() => store.get('themeMode'));
  const [palette, setPaletteState] = useState<ThemePalette>(() => store.get('themePalette'));

  const setMode = useCallback(
    (next: ThemeMode) => {
      store.set('themeMode', next);
      setModeState(next);
    },
    [store]
  );

  const setPalette = useCallback(
    (next: ThemePalette) => {
      store.set('themePalette', next);
      setPaletteState(next);
    },
    [store]
  );

  const baseTheme = resolveTheme(mode, palette, systemScheme === 'dark' ? 'dark' : 'light');
  const theme = desaturated ? desaturateTheme(baseTheme) : baseTheme;
  const controls = useMemo(
    () => ({ mode, palette, setMode, setPalette }),
    [mode, palette, setMode, setPalette]
  );

  // native chrome (tab bar, status bar, pickers, menus) follows the app theme,
  // not only the os appearance. source:
  // https://docs.expo.dev/router/advanced/native-tabs/#white-background-flashes-when-switching-tabs-on-ios-26
  useEffect(() => {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode === 'light' ? 'light' : 'dark');
  }, [mode]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.backgroundGradientStart).catch(() => {});
    // react native 0.88 is edge-to-edge only: the status bar is transparent
    // over the themed root, so only the icon style needs setting
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle(theme.name === 'sunset' ? 'dark-content' : 'light-content', true);
    }
  }, [theme.backgroundGradientStart, theme.name]);

  return (
    <ThemeContext value={theme}>
      <ThemeControlsContext value={controls}>
        <DesaturatedContext value={desaturated}>{children}</DesaturatedContext>
      </ThemeControlsContext>
    </ThemeContext>
  );
}

// grayscale-while-asleep also covers colors that are not theme slots (chart
// rule colors, the gold moon, knob tints): components map fixed colors
// through this hook so they gray out with the rest of the app
export function useFixedColor(): (color: string) => string {
  const desaturated = useContext(DesaturatedContext);
  return desaturated ? desaturateColor : identity;
}

function identity(color: string): string {
  return color;
}

export function useTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}

export function useThemeControls(): ThemeControls {
  const controls = useContext(ThemeControlsContext);
  if (!controls) throw new Error('useThemeControls must be used inside ThemeProvider');
  return controls;
}

export function useIsDesaturated(): boolean {
  return useContext(DesaturatedContext);
}
