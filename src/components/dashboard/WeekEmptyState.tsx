// ports: the SleepChartView empty state with the SleepDashboardView "Pull from
// Apple Health" action, adapted to health connect (docs/health-connect.md 5.4).
// the pull shows only on android with sync on, read granted and no demo.
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';

import { showAlert } from '@/components/common/app-alert';
import { Card } from '@/components/common/Card';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { ON_FILL_RIPPLE, PressableFeedback } from '@/components/common/PressableFeedback';
import { healthSyncEngine } from '@/services/health-connect/app-health-sync';
import { useHealthSyncState } from '@/services/health-connect/health-connect-state';
import { useHealthConnection } from '@/services/health-connect/use-health-connection';
import { useTheme } from '@/theme/ThemeProvider';

// swift's chart.bar.fill with its white-to-accent gradient fill
function EmptyWeekChartIcon({ color }: { color: string }) {
  return (
    <View style={styles.icon}>
      <Canvas style={styles.icon}>
        <RoundedRect x={2} y={18} width={10} height={24} r={3}>
          <LinearGradient start={vec(0, 0)} end={vec(0, 44)} colors={['rgba(255,255,255,0.6)', color]} />
        </RoundedRect>
        <RoundedRect x={17} y={2} width={10} height={40} r={3}>
          <LinearGradient start={vec(0, 0)} end={vec(0, 44)} colors={['rgba(255,255,255,0.6)', color]} />
        </RoundedRect>
        <RoundedRect x={32} y={12} width={10} height={30} r={3}>
          <LinearGradient start={vec(0, 0)} end={vec(0, 44)} colors={['rgba(255,255,255,0.6)', color]} />
        </RoundedRect>
      </Canvas>
    </View>
  );
}

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
    showAlert('Health Connect', message);
  };

  return (
    <Card>
      <View style={styles.emptyChart} testID="week-empty-state">
        <EmptyWeekChartIcon color={theme.accent} />
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
            <PressableFeedback
              testID="week-empty-pull"
              accessibilityRole="button"
              accessibilityLabel={loading ? 'Pulling Health Connect...' : 'Pull from Health Connect'}
              accessibilityState={{ busy: loading, disabled: loading }}
              disabled={loading}
              onPress={pull}
              rippleColor={ON_FILL_RIPPLE}
              style={[styles.button, { backgroundColor: theme.accent }]}>
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <NativeSymbol name="heart.text.square.fill" size={16} weight="semibold" tintColor="#ffffff" />
              )}
              <Text style={styles.buttonLabel}>
                {loading ? 'Pulling Health Connect...' : 'Pull from Health Connect'}
              </Text>
            </PressableFeedback>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyChart: { alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, paddingVertical: 20 },
  icon: { width: 44, height: 44 },
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
