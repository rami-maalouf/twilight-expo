// ports: Views/SleepDashboardView.swift (DashboardHistoryRangeChip)
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type DashboardHistoryRange = '90D' | 'All';

export function HistoryRangeChip({
  range,
  onToggle,
}: {
  range: DashboardHistoryRange;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID="demo.dashboard.history-range"
      accessibilityLabel={range === '90D' ? 'Show all chart history' : 'Show past 90 days'}
      onPress={onToggle}
      style={[styles.chip, { borderColor: `${theme.actionPrimary}59` }]}>
      <SymbolView name="calendar" size={11} weight="semibold" tintColor={theme.textPrimary} />
      <Text style={[styles.label, { color: theme.textPrimary }]}>{range}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 58,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.55)',
  },
  label: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
