// ports: TwilightApp.swift (TabView) - standard system tab bar, tinted accent
// native tabs follow the app theme (not only os appearance). source:
// https://docs.expo.dev/router/advanced/native-tabs/
// https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationTheme } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/theme/ThemeProvider';

export default function TabLayout() {
  const theme = useTheme();
  const isLight = theme.name === 'sunset';
  const navTheme = isLight
    ? {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: theme.accent,
          background: theme.backgroundGradientStart,
          card: theme.backgroundGradientEnd,
          text: theme.textPrimary,
          border: theme.backgroundGradientEnd,
          notification: theme.accent,
        },
      }
    : {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: theme.accent,
          background: theme.backgroundGradientStart,
          card: theme.backgroundGradientEnd,
          text: theme.textPrimary,
          border: theme.backgroundGradientEnd,
          notification: theme.accent,
        },
      };
  const contentStyle = { backgroundColor: theme.backgroundGradientStart };

  return (
    <NavigationTheme value={navTheme}>
      <NativeTabs
        tintColor={theme.accent}
        backgroundColor={theme.backgroundGradientEnd}
        indicatorColor={isLight ? 'rgba(45, 27, 46, 0.12)' : 'rgba(255, 255, 255, 0.12)'}
        rippleColor={theme.accent}
        iconColor={{ default: theme.textSecondary, selected: theme.accent }}
        labelStyle={{
          default: { color: theme.textSecondary },
          selected: { color: theme.accent },
        }}>
        <NativeTabs.Trigger name="index" contentStyle={contentStyle}>
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="metrics" contentStyle={contentStyle}>
          <NativeTabs.Trigger.Label>Metrics</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="chart.xyaxis.line" md="monitoring" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="logs" contentStyle={contentStyle}>
          <NativeTabs.Trigger.Label>Logs</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="list.bullet.clipboard" md="assignment" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" contentStyle={contentStyle}>
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </NavigationTheme>
  );
}
