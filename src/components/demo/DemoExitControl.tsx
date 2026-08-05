import { demoDataManager } from '@/data/app-db';
import { appSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useTheme } from '@/theme/ThemeProvider';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

export function DemoExitControl() {
  const theme = useTheme();
  const isDemoDataActive = useSettings((state) => state.isDemoDataActive);
  const refreshSettings = useSettings((state) => state.refresh);
  const [isExiting, setIsExiting] = useState(false);

  if (!isDemoDataActive) return null;

  const exitDemoData = () => {
    if (isExiting) return;
    setIsExiting(true);

    try {
      demoDataManager.exitDemoData();
      refreshSettings();
      appSleepStore.getState().refresh();
    } catch {
      Alert.alert("Couldn't Exit Demo", 'An unknown error occurred. Please try again.');
    } finally {
      setIsExiting(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        accessibilityLabel="Exit demo"
        disabled={isExiting}
        onPress={() =>
          Alert.alert(
            'Exit Demo?',
            'This removes the sample history and restores your sleep schedule from before demo mode.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Exit Demo', style: 'destructive', onPress: exitDemoData },
            ]
          )
        }
        style={[styles.button, { backgroundColor: theme.cardBackground, borderColor: 'rgba(255, 255, 255, 0.16)' }]}>
        {isExiting ? (
          <ActivityIndicator color={theme.textPrimary} size="small" />
        ) : (
          <SymbolView name="xmark.circle.fill" size={17} tintColor={theme.accent} />
        )}
        <Text style={[styles.label, { color: theme.textPrimary }]}>{isExiting ? 'Exiting...' : 'Exit Demo'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 52, right: 16, zIndex: 20 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  label: { fontSize: 15, fontWeight: '600' },
});
