// ports: Views/SleepDashboardView.swift - the status card (sleep/wake actions)
// sleeping: "😴 mode activated" + wake up button (warning bg).
// awake: last night's sleep (26 bold duration, day-over-day %) or the
// "Start tonight!" empty state, + go to sleep button (actionPrimary bg).
// captions keep "Tap to ..." and drop the NFC clause (out of scope).
// compact spacing matches Swift Aug 11 status-card compaction.
import { NativeSymbol as SymbolView } from '@/components/common/NativeSymbol';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { formatDurationHm } from '@/domain/metrics/chart-data';
import type { SleepSession } from '@/domain/models';
import { sessionDurationSeconds } from '@/domain/session-rules';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';

const GREEN = '#34c759';
const RED = '#ff3b30';

function BigActionButton({
  label,
  color,
  onPress,
  testID,
}: {
  label: string;
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.actionButton, { backgroundColor: color }]}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export function StatusCard({
  isSleeping,
  lastSession,
  changePercent,
  streak,
  onToggle,
}: {
  isSleeping: boolean;
  lastSession: SleepSession | null;
  changePercent: number | null;
  streak: number;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const fixed = useFixedColor();
  const green = fixed(GREEN);
  const red = fixed(RED);

  return (
    <Card contentStyle={styles.cardContent}>
      <View style={styles.stack}>
        {isSleeping ? (
          <>
            <Text style={[styles.sleepingTitle, { color: theme.textPrimary }]}>
              😴 mode activated
            </Text>
            <BigActionButton label="Wake Up" color={theme.warning} onPress={onToggle} />
            <Text style={[styles.caption, { color: theme.textSecondary }]}>Tap to wake up</Text>
          </>
        ) : (
          <>
            <View style={styles.leftAligned}>
              {lastSession ? (
                <View style={styles.lastNight}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.lastNightTitle, { color: theme.textPrimary }]}>
                      Last Night&apos;s Sleep
                    </Text>
                    {streak > 0 && (
                      <View style={styles.streakPill}>
                        <Text style={styles.streakFlame}>🔥</Text>
                        <Text style={[styles.streakCount, { color: theme.textPrimary }]}>
                          {streak}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.durationRow}>
                    <Text style={[styles.duration, { color: theme.textPrimary }]}>
                      {formatDurationHm(sessionDurationSeconds(lastSession))}
                    </Text>
                    {changePercent != null && (
                      <View style={styles.changeRow}>
                        <SymbolView
                          name={changePercent >= 0 ? 'arrow.up.right' : 'arrow.down.right'}
                          size={11}
                          weight="bold"
                          tintColor={changePercent >= 0 ? green : red}
                        />
                        <Text
                          style={[styles.changeText, { color: changePercent >= 0 ? green : red }]}>
                          {Math.abs(Math.trunc(changePercent))}%
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.titleRow}>
                    <SymbolView name="moon.stars.fill" size={20} tintColor={theme.actionPrimary} />
                    <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                      Start tonight!
                    </Text>
                  </View>
                  <Text style={[styles.caption, { color: theme.textSecondary }]}>
                    Track your first night to see insights
                  </Text>
                </View>
              )}
            </View>
            <BigActionButton
              label="Go to Sleep"
              color={theme.actionPrimary}
              onPress={onToggle}
              testID="demo.dashboard.go-to-sleep"
            />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardContent: { paddingHorizontal: 14, paddingVertical: 12 },
  stack: { gap: 10, alignItems: 'center' },
  leftAligned: { alignSelf: 'stretch' },
  sleepingTitle: { fontSize: 15, fontWeight: '600' },
  actionButton: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  // headline bold white
  actionLabel: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  caption: { fontSize: 12 },
  lastNight: { gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lastNightTitle: { fontSize: 15, fontWeight: '600' },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.35)',
  },
  streakFlame: { fontSize: 13 },
  streakCount: { fontSize: 16, fontWeight: '700' },
  durationRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  duration: { fontSize: 26, fontWeight: '700' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  changeText: { fontSize: 13, fontWeight: '600' },
  emptyState: { gap: 2 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
});
