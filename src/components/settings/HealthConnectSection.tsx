// ports: the "Apple Health" section of Views/BlockedProfileView.swift, adapted
// to health connect (docs/health-connect.md 5.3). renders only on android
// when health connect is visible (2.7); ios never shows it.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { withAlpha } from '@/components/health-connect/parts';
import { isConnectionVisible, ROW_STATUS_LABEL, rowSummary } from '@/domain/health/connection-state';
import { useHealthSyncState } from '@/services/health-connect/health-connect-state';
import { useHealthConnection } from '@/services/health-connect/use-health-connection';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';

const RED = '#ff3b30';
const GREEN = '#34c759';
const ORANGE = '#ff9500';

export function HealthConnectSection() {
  const theme = useTheme();
  const fixed = useFixedColor();
  const connection = useHealthConnection();
  const lastErrorMessage = useHealthSyncState((s) => s.lastError?.message ?? null);
  if (!isConnectionVisible(connection.state)) return null;

  const isLight = theme.name === 'sunset';
  const rowBg = isLight ? 'rgba(255, 255, 255, 0.75)' : '#1c1c1e';
  // swift healthKitStatusColor
  const statusColor =
    connection.state === 'connected' || connection.state === 'readyToEnable'
      ? fixed(GREEN)
      : connection.state === 'denied' || connection.state === 'updateRequired'
        ? fixed(ORANGE)
        : '#98989f';

  return (
    <View>
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>HEALTH CONNECT</Text>
      <View style={[styles.clip, { backgroundColor: rowBg }]}>
        <Pressable
          testID="health-connect-row"
          accessibilityRole="button"
          onPress={() => router.push('/health-connect')}
          android_ripple={{ color: withAlpha(theme.textPrimary, 0.12) }}
          style={styles.row}>
          <View style={styles.titleRow}>
            <NativeSymbol name="heart.text.square.fill" size={22} tintColor={fixed(RED)} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>Health Connect</Text>
            <View style={styles.spacer} />
            <Text testID="health-connect-row-status" style={[styles.status, { color: statusColor }]}>
              {ROW_STATUS_LABEL[connection.state]}
            </Text>
            <NativeSymbol name="chevron.right" size={13} tintColor="#98989f" />
          </View>
          <Text style={[styles.summary, { color: theme.textSecondary }]}>
            {rowSummary(connection, lastErrorMessage)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { fontSize: 13, marginBottom: 6, marginLeft: 16 },
  clip: { borderRadius: 10, overflow: 'hidden' },
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17 },
  spacer: { flex: 1 },
  status: { fontSize: 12, fontWeight: '600' },
  summary: { fontSize: 12, lineHeight: 16 },
});
