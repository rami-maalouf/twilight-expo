// ports: the "Data" section of Views/BlockedProfileView.swift
// (docs/health-connect.md 6.6). both platforms; hidden while demo data is
// active, like swift hides it for the demo profile.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { withAlpha } from '@/components/health-connect/parts';
import { useSettings } from '@/state/settings-state';
import { useTheme } from '@/theme/ThemeProvider';

export function DataSection() {
  const theme = useTheme();
  const isDemoDataActive = useSettings((s) => s.isDemoDataActive);
  if (isDemoDataActive) return null;
  const rowBg = theme.name === 'sunset' ? 'rgba(255, 255, 255, 0.75)' : '#1c1c1e';

  return (
    <View>
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>DATA</Text>
      <View style={[styles.clip, { backgroundColor: rowBg }]}>
        <Pressable
          testID="data-management-row"
          accessibilityRole="button"
          onPress={() => router.push('/data-management')}
          android_ripple={{ color: withAlpha(theme.textPrimary, 0.12) }}
          style={styles.row}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Import & Export Data</Text>
          <View style={styles.spacer} />
          <NativeSymbol name="externaldrive" size={16} tintColor="#98989f" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { fontSize: 13, marginBottom: 6, marginLeft: 16 },
  clip: { borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontSize: 17 },
  spacer: { flex: 1 },
});
