// ports: Views/SleepDashboardView.swift - the home dashboard
// greeting (tap to shuffle) + info button, date line, view-mode segmented
// picker, per-mode analytics cards (Week | Trend | Time | SRI | Score),
// status card with streak, fadeInSlide entrances
import { router, useFocusEffect } from 'expo-router';
import { NativeSymbol as SymbolView } from '@/components/common/NativeSymbol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Card } from '@/components/common/Card';
import { FadeInSlide } from '@/components/common/FadeInSlide';
import { Screen } from '@/components/common/Screen';
import { InsightPills } from '@/components/dashboard/InsightPills';
import { SegmentedPicker } from '@/components/dashboard/SegmentedPicker';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { useForegroundRefresh } from '@/services/use-foreground-refresh';
import { AlignmentCard } from '@/components/charts/AlignmentCard';
import {
  MovingAverageCard,
  type MovingAverageWindowLabel,
} from '@/components/charts/MovingAverageCard';
import { SleepRegularityCard } from '@/components/charts/SleepRegularityCard';
import { TimingCard, type TimingMetric } from '@/components/charts/TimingCard';
import { WeekChart, type WeekChartDay } from '@/components/charts/WeekChart';
import { getGreeting, getShuffledGreeting } from '@/copy/greetings';
import { isDemoMode } from '@/demo/demo-mode';
import {
  SleepMetricsAnalyzer,
  type AlignmentScorePoint,
  type MovingAveragePoint,
  type TimingAveragePoint,
} from '@/domain/metrics/analyzer';
import type { SleepRegularityWindow } from '@/domain/metrics/sleep-regularity';
import {
  averageWeekDurationSeconds,
  formatAvgDuration,
  processWeekData,
  trackedDataPoints,
  weekAccuracy,
  weekSleepConsistency,
  weekWakeConsistency,
} from '@/domain/metrics/week-data';
import type { CalendarDay } from '@/domain/models';
import { addDays, dayKey, zonedParts } from '@/domain/session-rules';
import { useSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';

const VIEW_MODES = ['Week', 'Trend', 'Time', 'SRI', 'Score'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const INDIGO = '#5856d6';
const ORANGE = '#ff9500';
const GREEN = '#34c759';

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

function nowMinutesAndToday(): { minutes: number; today: CalendarDay } {
  const p = zonedParts(Date.now(), deviceTimeZone());
  return {
    minutes: p.hour * 60 + p.minute,
    today: { year: p.year, month: p.month, day: p.day },
  };
}

export default function DashboardScreen() {
  const theme = useTheme();
  const fixed = useFixedColor();
  const { width } = useWindowDimensions();

  const activeSession = useSleepStore((s) => s.activeSession);
  const sessions = useSleepStore((s) => s.sessions);
  const toggleSleep = useSleepStore((s) => s.toggleSleep);
  const refresh = useSleepStore((s) => s.refresh);

  const isSleeping = activeSession != null;
  const optimalSleepMinutes = useSettings((s) => s.optimalSleepMinutes);
  const optimalWakeMinutes = useSettings((s) => s.optimalWakeMinutes);

  const [viewMode, setViewMode] = useState<ViewMode>(isDemoMode ? 'Trend' : 'Week');
  const [historyRange, setHistoryRange] = useState<'90D' | 'All'>('90D');
  const [movingAverageWindow, setMovingAverageWindow] =
    useState<MovingAverageWindowLabel>('7-Night');
  const [timingMetric, setTimingMetric] = useState<TimingMetric>('Sleep');
  const [sriWindow, setSriWindow] = useState<SleepRegularityWindow>('7D');
  const [greeting, setGreeting] = useState(() => {
    const { minutes } = nowMinutesAndToday();
    return getGreeting(minutes, optimalSleepMinutes, optimalWakeMinutes, isSleeping);
  });

  const updateGreeting = useCallback(() => {
    const { minutes } = nowMinutesAndToday();
    setGreeting(getGreeting(minutes, optimalSleepMinutes, optimalWakeMinutes, isSleeping));
  }, [optimalSleepMinutes, optimalWakeMinutes, isSleeping]);

  // swift recomputes the greeting on scene activation and whenever the
  // session or the schedule changes, from any surface (dashboard, widget link)
  const greetingFor = useRef(updateGreeting);
  useEffect(() => {
    if (greetingFor.current === updateGreeting) return;
    greetingFor.current = updateGreeting;
    updateGreeting();
  }, [updateGreeting]);
  useForegroundRefresh(updateGreeting);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const shuffleGreeting = () => {
    const { minutes } = nowMinutesAndToday();
    setGreeting((current) =>
      getShuffledGreeting(current, minutes, optimalSleepMinutes, optimalWakeMinutes, isSleeping)
    );
  };

  const toggleHistoryRange = () => setHistoryRange((r) => (r === '90D' ? 'All' : '90D'));

  // analytics data
  const {
    weekData,
    weekDays,
    insights,
    streak,
    changePercent,
    lastSession,
    sevenNightSeries,
    thirtyNightSeries,
    sleepTimingSeries,
    wakeTimingSeries,
    alignmentSeries,
    targetDurationHours,
    targetSleepOffset,
    targetWakeOffset,
    today,
    analyzer,
  } = useMemo(() => {
    const { today } = nowMinutesAndToday();
    const analyzer = new SleepMetricsAnalyzer(sessions, {
      optimalSleepMinutes,
      optimalWakeMinutes,
      today,
    });
    const weekData = processWeekData(sessions);
    const tracked = trackedDataPoints(weekData);

    const weekDays: WeekChartDay[] = weekData.map((d, index) => {
      const previous = tracked.filter(
        (t) => weekData.indexOf(t) < index && t.durationSeconds > 0
      );
      const prev = previous[previous.length - 1];
      return {
        dayLabel: d.dayLabel,
        dateLabel: new Date(Date.UTC(d.day.year, d.day.month - 1, d.day.day)).toLocaleDateString(
          'en-US',
          { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
        ),
        startOffset: d.startOffset,
        endOffset: d.endOffset,
        durationSeconds: d.durationSeconds,
        changePercent:
          prev && prev.durationSeconds > 0 && d.durationSeconds > 0
            ? ((d.durationSeconds - prev.durationSeconds) / prev.durationSeconds) * 100
            : null,
      };
    });

    const avg = formatAvgDuration(averageWeekDurationSeconds(weekData));
    const insights = [
      {
        title: 'avg sleep',
        value: `${avg.hours}h ${avg.minutes}m`,
        subtitle: 'last 7 nights',
        tint: theme.actionPrimary,
      },
      {
        title: 'sleep cons.',
        value: `${weekSleepConsistency(weekData)}%`,
        subtitle: 'bedtime rhythm',
        tint: fixed(INDIGO),
      },
      {
        title: 'wake cons.',
        value: `${weekWakeConsistency(weekData)}%`,
        subtitle: 'wake rhythm',
        tint: fixed(ORANGE),
      },
      {
        title: 'accuracy',
        value: `${weekAccuracy(weekData, optimalSleepMinutes, optimalWakeMinutes)}%`,
        subtitle: 'target match',
        tint: fixed(GREEN),
      },
    ];

    let changePercent: number | null = null;
    if (tracked.length >= 2) {
      const latest = tracked[tracked.length - 1];
      const previous = tracked[tracked.length - 2];
      changePercent =
        previous.durationSeconds > 0
          ? ((latest.durationSeconds - previous.durationSeconds) / previous.durationSeconds) * 100
          : null;
    }

    const allRecords = analyzer.recordsIn('All');
    return {
      weekData,
      weekDays,
      insights,
      streak: analyzer.currentStreak(),
      changePercent,
      lastSession: sessions.length > 0 ? sessions[0] : null,
      sevenNightSeries: analyzer.movingAverageSeries(allRecords, 7),
      thirtyNightSeries: analyzer.movingAverageSeries(allRecords, 30),
      sleepTimingSeries: analyzer.timingMovingAverageSeries(allRecords, 'bedtimeOffset', 7),
      wakeTimingSeries: analyzer.timingMovingAverageSeries(allRecords, 'wakeOffset', 7),
      alignmentSeries: analyzer.sleepAlignmentSeries(allRecords),
      targetDurationHours: analyzer.targetDurationHours,
      targetSleepOffset: analyzer.targetSleepOffset,
      targetWakeOffset: analyzer.targetWakeOffset,
      today,
      analyzer,
    };
  }, [sessions, optimalSleepMinutes, optimalWakeMinutes, theme, fixed]);

  // the history range sets visible days; the window sets the calculation span
  const sriSeries = useMemo(
    () => analyzer.sleepRegularitySeries(historyRange === '90D' ? '90D' : 'All', sriWindow),
    [analyzer, historyRange, sriWindow]
  );

  const rangeStartKey = dayKey(addDays(today, -89));
  const inRange = <T extends { date: CalendarDay }>(points: T[]): T[] =>
    historyRange === '90D' ? points.filter((p) => dayKey(p.date) >= rangeStartKey) : points;

  const visibleSevenNight: MovingAveragePoint[] = inRange(sevenNightSeries);
  const visibleThirtyNight: MovingAveragePoint[] = inRange(thirtyNightSeries);
  const visibleSleepTiming: TimingAveragePoint[] = inRange(sleepTimingSeries);
  const visibleWakeTiming: TimingAveragePoint[] = inRange(wakeTimingSeries);
  const visibleAlignment: AlignmentScorePoint[] = inRange(alignmentSeries);
  const activeMovingAverage =
    movingAverageWindow === 'Monthly' ? visibleThirtyNight : visibleSevenNight;

  const onToggle = () => {
    const result = toggleSleep();
    const startedSession = result.started;
    if (startedSession) {
      void import('@/services/live-activity').then(({ startSleepActivity }) =>
        startSleepActivity(startedSession)
      );
    }
    if (result.joke) {
      Alert.alert('Pause...', result.joke);
    }
  };

  const dateLine = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const chartWidth = width - 16 * 2 - 16 * 2;
  const hasWeekData = trackedDataPoints(weekData).length > 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.greetingRow}>
            <Pressable onPress={shuffleGreeting} hitSlop={6}>
              <Text style={[styles.greeting, { color: theme.textPrimary }]}>
                {greeting || (isSleeping ? 'Good Night 🌙' : 'Good Morning ☀️')}
              </Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => router.push('/metrics-explanation')}
              testID="metrics-info">
              <SymbolView name="info.circle" size={16} tintColor={theme.textSecondary} />
            </Pressable>
          </View>
          <Text style={[styles.date, { color: theme.textSecondary }]}>{dateLine}</Text>
        </View>

        <FadeInSlide delay={0.05}>
          <View style={styles.analytics}>
            <SegmentedPicker
              options={VIEW_MODES}
              value={viewMode}
              onChange={setViewMode}
              testIDPrefix="demo.dashboard.mode"
            />

            {viewMode === 'Week' &&
              (hasWeekData ? (
                <Card>
                  <InsightPills items={insights} />
                  <View style={styles.chartSpacer} />
                  <WeekChart
                    days={weekDays}
                    optimalSleepMinutes={optimalSleepMinutes}
                    optimalWakeMinutes={optimalWakeMinutes}
                    width={chartWidth}
                    height={255}
                  />
                </Card>
              ) : (
                <Card>
                  <View style={styles.emptyChart}>
                    <SymbolView name="chart.bar.fill" size={50} tintColor={theme.accent} />
                    <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                      Your sleep story starts tonight
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                      Log your first night to see your patterns here
                    </Text>
                  </View>
                </Card>
              ))}
            {viewMode === 'Trend' && (
              <MovingAverageCard
                series={activeMovingAverage}
                targetDurationHours={targetDurationHours}
                width={chartWidth}
                window={movingAverageWindow}
                onWindowChange={setMovingAverageWindow}
                historyRange={historyRange}
                onHistoryRangeToggle={toggleHistoryRange}
              />
            )}
            {viewMode === 'Time' && (
              <TimingCard
                sleepSeries={visibleSleepTiming}
                wakeSeries={visibleWakeTiming}
                targetSleepOffset={targetSleepOffset}
                targetWakeOffset={targetWakeOffset}
                targetDurationHours={targetDurationHours}
                width={chartWidth}
                metric={timingMetric}
                onMetricChange={setTimingMetric}
                historyRange={historyRange}
                onHistoryRangeToggle={toggleHistoryRange}
              />
            )}
            {viewMode === 'SRI' && (
              <SleepRegularityCard
                series={sriSeries}
                window={sriWindow}
                onWindowChange={setSriWindow}
                width={chartWidth}
                historyRange={historyRange}
                onHistoryRangeToggle={toggleHistoryRange}
              />
            )}
            {viewMode === 'Score' && (
              <AlignmentCard
                series={visibleAlignment}
                title="Sleep Alignment Score"
                includesTimingAndPhase
                width={chartWidth}
                historyRange={historyRange}
                onHistoryRangeToggle={toggleHistoryRange}
              />
            )}
          </View>
        </FadeInSlide>

        <FadeInSlide delay={0.12}>
          <StatusCard
            isSleeping={isSleeping}
            lastSession={lastSession}
            changePercent={changePercent}
            streak={streak}
            onToggle={onToggle}
          />
        </FadeInSlide>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 70,
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
    alignItems: 'stretch',
  },
  header: { gap: 2 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greeting: { fontSize: 34, fontWeight: '700' },
  date: { fontSize: 15 },
  analytics: { gap: 16, alignSelf: 'stretch' },
  chartSpacer: { height: 12 },
  emptyChart: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { fontSize: 15, textAlign: 'center' },
});
