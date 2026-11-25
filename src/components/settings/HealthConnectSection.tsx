// ports: the "Apple Health" section of Views/BlockedProfileView.swift, adapted
// to health connect (docs/health-connect.md 5.3). renders only on android
// when health connect is visible (2.7); ios never shows it.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { SettingsRow, SettingsSection, useSecondaryLabel } from '@/components/settings/SettingsList';
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
  const secondaryLabel = useSecondaryLabel();
  const connection = useHealthConnection();
  const lastErrorMessage = useHealthSyncState((s) => s.lastError?.message ?? null);
  if (!isConnectionVisible(connection.state)) return null;

  // swift healthKitStatusColor
  const statusColor =
    connection.state === 'connected' || connection.state === 'readyToEnable'
      ? fixed(GREEN)
      : connection.state === 'denied' || connection.state === 'updateRequired'
        ? fixed(ORANGE)
        : secondaryLabel;

  return (
    <SettingsSection title="Health Connect">
      <SettingsRow testID="health-connect-row" style={styles.row} onPress={() => router.push('/health-connect')}>
        <View style={styles.titleRow}>
          <NativeSymbol name="heart.text.square.fill" size={22} tintColor={fixed(RED)} />
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            Health Connect
          </Text>
          <Text testID="health-connect-row-status" style={[styles.status, { color: statusColor }]} numberOfLines={1}>
            {ROW_STATUS_LABEL[connection.state]}
          </Text>
          <NativeSymbol name="chevron.right" size={13} tintColor={secondaryLabel} />
        </View>
        <Text style={[styles.summary, { color: theme.textSecondary }]}>
          {rowSummary(connection, lastErrorMessage)}
        </Text>
      </SettingsRow>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'column', alignItems: 'stretch', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17, flexShrink: 1, flexGrow: 1 },
  status: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  summary: { fontSize: 12, lineHeight: 16 },
});
