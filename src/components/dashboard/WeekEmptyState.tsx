// ports: the SleepChartView empty state with the SleepDashboardView "Pull from
// Apple Health" action, adapted to health connect (docs/health-connect.md 5.4).
// the pull shows only on android with sync on, read granted and no demo.
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { withAlpha } from '@/components/health-connect/parts';
import { healthSyncEngine } from '@/services/health-connect/app-health-sync';
import { useHealthSyncState } from '@/services/health-connect/health-connect-state';
import { useHealthConnection } from '@/services/health-connect/use-health-connection';
import { useTheme } from '@/theme/ThemeProvider';

export function WeekEmptyState() {
  const theme = useTheme();
  const { canPull } = useHealthConnection();
  const isSyncing = useHealthSyncState((s) => s.isSyncing);
  const [isPulling, setIsPulling] = useState(false);
  const loading = isPulling || isSyncing;

  const pull = async () => {
    if (loading) return;
    setIsPulling(true);
    let message = 'Twilight finished pulling from Health Connect.';
    try {
      const result = await healthSyncEngine.sync('forceResync');
      message = result.pull?.message ?? result.error?.message ?? message;
    } finally {
      setIsPulling(false);
    }
    Alert.alert('Health Connect', message);
  };

  return (
    <Card>
      <View style={styles.emptyChart} testID="week-empty-state">
        <NativeSymbol name="chart.bar.fill" size={50} tintColor={theme.accent} />
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
          {canPull ? 'No Health Connect sleep yet' : 'Your sleep story starts tonight'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          {canPull
            ? 'Pull your existing nights from Health Connect, or log tonight in Twilight.'
            : 'Log your first night to see your patterns here'}
        </Text>
        {canPull ? (
          <View style={styles.buttonClip}>
            <Pressable
              testID="week-empty-pull"
              accessibilityRole="button"
              accessibilityLabel={loading ? 'Pulling Health Connect...' : 'Pull from Health Connect'}
              accessibilityState={loading ? { busy: true, disabled: true } : { disabled: false }}
              disabled={loading}
              onPress={pull}
              android_ripple={{ color: withAlpha('#ffffff', 0.2) }}
              style={[styles.button, { backgroundColor: theme.accent }]}>
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <NativeSymbol name="heart.text.square.fill" size={16} weight="semibold" tintColor="#ffffff" />
              )}
              <Text style={styles.buttonLabel}>
                {loading ? 'Pulling Health Connect...' : 'Pull from Health Connect'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyChart: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { fontSize: 15, textAlign: 'center' },
  buttonClip: { marginTop: 8, borderRadius: 20, overflow: 'hidden' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
  },
  buttonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
