// ports BlockedProfileView.swift's lock section, shown above Sleep Goal while
// a session is active (isBlocking): an orange lock (title2) and the red
// subheadline, centered.
import { StyleSheet, Text, View } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { useSleepStore } from '@/state/app-sleep-store';
import { useFixedColor } from '@/theme/ThemeProvider';
import { SettingsSection } from './SettingsList';

const ORANGE = '#ff9500';
const RED = '#ff3b30';
export const SESSION_LOCK_COPY = 'A session is currently active, profile editing is disabled.';

export function SessionLockBanner() {
  const isSleeping = useSleepStore((s) => s.activeSession != null);
  const fixed = useFixedColor();
  if (!isSleeping) return null;
  return (
    <SettingsSection testID="session-lock-banner">
      <View style={styles.row} accessible accessibilityLabel={SESSION_LOCK_COPY}>
        <NativeSymbol name="lock.fill" size={22} tintColor={fixed(ORANGE)} />
        <Text style={[styles.text, { color: fixed(RED) }]}>{SESSION_LOCK_COPY}</Text>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  text: { fontSize: 15, flexShrink: 1 },
});
