// shown in place of the whole app when a render error escapes every screen.
// expo-observe's root boundary sits outside ThemeProvider, so this screen
// carries the default twilight palette itself and uses no theme hooks.
import { LinearGradient } from 'expo-linear-gradient';
import * as Updates from 'expo-updates';
import { DevSettings, Pressable, StyleSheet, Text, View } from 'react-native';

import { roundedFont } from '@/theme/fonts';

const GRADIENT = ['#0a1520', '#0f2a3d'] as const;
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#8b9dc3';
const ACCENT = '#00d4ff';

function restart() {
  // a fresh javascript start rebuilds every store from the on-device database
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  Updates.reloadAsync().catch(() => DevSettings.reload());
}

export function AppCrashFallback() {
  return (
    <LinearGradient colors={GRADIENT} style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.moon} accessibilityElementsHidden importantForAccessibility="no">
          ☾
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text style={styles.body}>
          Twilight hit an unexpected problem. Your sleep logs are safe on this device. Restart the app to pick
          up where you left off.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={restart}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonLabel}>Restart Twilight</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  moon: { fontSize: 56, color: ACCENT, marginBottom: 8 },
  title: { ...roundedFont('700'), fontSize: 26, color: TEXT_PRIMARY, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, color: TEXT_SECONDARY, textAlign: 'center', maxWidth: 340 },
  button: {
    marginTop: 12,
    minHeight: 50,
    paddingHorizontal: 28,
    borderRadius: 25,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { ...roundedFont('600'), fontSize: 17, color: '#0a1520' },
});
