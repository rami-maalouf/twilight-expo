// ports: Components/Common/SleepRegularityCard.swift
// 7D/14D/28D calculation window picker, rolling SRI headline, window date
// label + week-over-week change, faint day-to-day bars (textSecondary 0.25,
// 0.7 width), actionPrimary lw3 linear rolling line broken into continuous
// segments, dashed selection rule. selection stays after release and resets
// when the series or window changes, like swift's chartXSelection.
import { Canvas, Circle, DashPathEffect, Line, Path, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Card } from '@/components/common/Card';
import { HistoryRangeChip, type DashboardHistoryRange } from '@/components/dashboard/HistoryRangeChip';
import { SegmentedPicker } from '@/components/dashboard/SegmentedPicker';
import {
  SLEEP_REGULARITY_WINDOWS,
  windowDays,
  type SleepRegularityPoint,
  type SleepRegularityWindow,
} from '@/domain/metrics/sleep-regularity';
import { addDays, dayKey } from '@/domain/session-rules';
import { useTheme } from '@/theme/ThemeProvider';
import { dayIndexes, formatMonthDay, xTickIndexes } from './date-scale';

const CHART_HEIGHT = 210;
const MARGIN = { top: 8, bottom: 24, left: 34, right: 8 };

// swift Double.rounded(): half away from zero
function roundScore(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function formatSriScore(value: number | null | undefined): string {
  return value == null ? '-' : String(roundScore(value));
}

// String(format: "%+.0f pts vs last week")
export function formatWeekChange(change: number): string {
  const sign = change < 0 || Object.is(change, -0) ? '-' : '+';
  return `${sign}${Math.abs(change).toFixed(0)} pts vs last week`;
}

export function sriScoreDomain(series: readonly SleepRegularityPoint[]): { lower: number; upper: number } {
  const values = series.flatMap((p) =>
    [p.dayToDayScore, p.rollingScore].filter((v): v is number => v != null)
  );
  const minimum = values.length > 0 ? Math.min(...values) : 0;
  return { lower: Math.min(0, Math.floor(minimum / 25) * 25), upper: 100 };
}

export function SleepRegularityCard({
  series,
  window,
  onWindowChange,
  width,
  historyRange,
  onHistoryRangeToggle,
}: {
  series: SleepRegularityPoint[];
  window: SleepRegularityWindow;
  onWindowChange: (window: SleepRegularityWindow) => void;
  width: number;
  historyRange: DashboardHistoryRange;
  onHistoryRangeToggle: () => void;
}) {
  const theme = useTheme();
  // a selection belongs to the series it was made on; a new series (window or
  // history change) drops it, like swift's onChange(of: series/window)
  const [selection, setSelection] = useState<{
    series: readonly SleepRegularityPoint[];
    index: number;
  } | null>(null);
  const selectedIndex = selection?.series === series ? selection.index : null;
  const setSelectedIndex = (index: number | null) =>
    setSelection(index == null ? null : { series, index });
  const [measuredWidth, setMeasuredWidth] = useState(width);
  const chartWidth = measuredWidth > 0 ? measuredWidth : width;

  const selected =
    selectedIndex != null && selectedIndex < series.length
      ? series[selectedIndex]
      : series.length > 0
        ? series[series.length - 1]
        : null;
  const selectedIdx = selected ? series.indexOf(selected) : -1;

  const weekChange = (() => {
    if (!selected || selected.rollingScore == null) return null;
    const previousKey = dayKey(addDays(selected.date, -7));
    const previous = series.find((p) => dayKey(p.date) === previousKey)?.rollingScore;
    return previous != null ? selected.rollingScore - previous : null;
  })();

  const windowLabel = selected
    ? `${formatMonthDay(addDays(selected.date, -(windowDays(window) - 1)))} - ${formatMonthDay(selected.date)}`
    : 'Waiting for completed sleep days';
  const hasComparisons = series.some((p) => p.dayToDayScore != null);

  const xs = dayIndexes(series.map((p) => p.date));
  const maxX = xs.length > 0 ? Math.max(xs[xs.length - 1], 1) : 1;
  const { lower, upper } = sriScoreDomain(series);
  const plotW = chartWidth - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const dayStep = plotW / Math.max(maxX + 1, 1);
  const xPos = (x: number) => MARGIN.left + dayStep / 2 + (x / Math.max(maxX, 1)) * (plotW - dayStep);
  const yPos = (score: number) => MARGIN.top + ((upper - score) / (upper - lower || 1)) * plotH;
  const barW = Math.max(1, dayStep * 0.7);

  const linePaths = (() => {
    const bySegment = new Map<number, { x: number; y: number }[]>();
    series.forEach((p, i) => {
      if (p.rollingScore == null) return;
      const pts = bySegment.get(p.segment) ?? [];
      pts.push({ x: xPos(xs[i]), y: yPos(p.rollingScore) });
      bySegment.set(p.segment, pts);
    });
    return [...bySegment.values()].map((pts) => {
      const builder = Skia.PathBuilder.Make();
      builder.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts.slice(1)) builder.lineTo(pt.x, pt.y);
      return builder.build();
    });
  })();

  const yTicks: number[] = [];
  for (let t = lower; t <= upper; t += 25) yTicks.push(t);
  const ticks = xTickIndexes(series.length, 4);

  const nearestIndex = (px: number) => {
    if (series.length === 0) return null;
    const target = px + MARGIN.left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(xPos(xs[i]) - target);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const scrub = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => setSelectedIndex(nearestIndex(e.x)))
    .onUpdate((e) => setSelectedIndex(nearestIndex(e.x)))
    .onEnd((e) => setSelectedIndex(nearestIndex(e.x)));

  const ruleColor = `${theme.textSecondary}80`;
  const barColor = `${theme.textSecondary}40`;

  return (
    <Card>
      <View style={styles.stack}>
        <View style={styles.headerRow}>
          <View style={styles.windowPicker}>
            <SegmentedPicker
              options={SLEEP_REGULARITY_WINDOWS}
              value={window}
              onChange={onWindowChange}
              testIDPrefix="metrics.sri.calculation-window"
            />
          </View>
          <View style={styles.headerSpacer} />
          <Text
            testID="metrics.sri.score"
            accessibilityLabel={`${windowDays(window)}-day SRI`}
            accessibilityValue={{
              text: selected?.rollingScore != null ? formatSriScore(selected.rollingScore) : 'Insufficient data',
            }}
            style={[styles.headline, { color: theme.actionPrimary }]}>
            {formatSriScore(selected?.rollingScore)}
          </Text>
          <HistoryRangeChip range={historyRange} onToggle={onHistoryRangeToggle} />
        </View>

        <View style={styles.captionRow}>
          <Text testID="metrics.sri.window" style={[styles.caption, { color: theme.textSecondary }]}>
            {windowLabel}
          </Text>
          {weekChange != null && (
            <Text style={[styles.caption, styles.tabular, { color: theme.textSecondary }]}>
              {formatWeekChange(weekChange)}
            </Text>
          )}
        </View>

        {hasComparisons ? (
          <View
            style={styles.chartFrame}
            onLayout={(e) => {
              const next = e.nativeEvent.layout.width;
              if (next > 0 && Math.abs(next - measuredWidth) > 0.5) setMeasuredWidth(next);
            }}>
            <Canvas style={StyleSheet.absoluteFill}>
              {series.map((p, i) => {
                if (p.dayToDayScore == null) return null;
                const top = Math.min(yPos(p.dayToDayScore), yPos(0));
                const height = Math.abs(yPos(0) - yPos(p.dayToDayScore));
                return (
                  <RoundedRect
                    key={`bar-${i}`}
                    x={xPos(xs[i]) - barW / 2}
                    y={top}
                    width={barW}
                    height={height}
                    r={1}
                    color={barColor}
                  />
                );
              })}
              {linePaths.map((path, i) => (
                <Path
                  key={`line-${i}`}
                  path={path}
                  style="stroke"
                  strokeWidth={3}
                  strokeJoin="round"
                  strokeCap="round"
                  color={theme.actionPrimary}
                />
              ))}
              {series.map((p, i) =>
                p.rollingScore == null ? null : (
                  <Circle
                    key={`pt-${i}`}
                    cx={xPos(xs[i])}
                    cy={yPos(p.rollingScore)}
                    r={1.8}
                    color={theme.actionPrimary}
                  />
                )
              )}
              {selected && selectedIdx >= 0 && (
                <Line
                  p1={vec(xPos(xs[selectedIdx]), MARGIN.top)}
                  p2={vec(xPos(xs[selectedIdx]), MARGIN.top + plotH)}
                  color={ruleColor}
                  strokeWidth={1}>
                  <DashPathEffect intervals={[3, 3]} />
                </Line>
              )}
              {selected?.rollingScore != null && selectedIdx >= 0 && (
                <Circle
                  cx={xPos(xs[selectedIdx])}
                  cy={yPos(selected.rollingScore)}
                  r={4.4}
                  color={theme.actionPrimary}
                />
              )}
            </Canvas>
            {yTicks.map((t) => (
              <Text key={`y-${t}`} style={[styles.yLabel, { top: yPos(t) - 7 }]}>
                {t}
              </Text>
            ))}
            {ticks.map((i) => (
              <Text key={`x-${i}`} style={[styles.xLabel, { left: xPos(xs[i]) - 30 }]}>
                {formatMonthDay(series[i].date)}
              </Text>
            ))}
            <GestureDetector gesture={scrub}>
              <View
                testID="metrics.sri.chart"
                style={{
                  position: 'absolute',
                  left: MARGIN.left,
                  top: 0,
                  width: plotW,
                  height: MARGIN.top + plotH,
                }}
              />
            </GestureDetector>
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Log {windowDays(window)} consecutive days of sleep to see your SRI trend.
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16, alignSelf: 'stretch' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    width: '100%',
  },
  windowPicker: { width: 188, flexGrow: 0, flexShrink: 0 },
  headerSpacer: { flexGrow: 1, minWidth: 8 },
  headline: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  captionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caption: { fontSize: 12 },
  tabular: { fontVariant: ['tabular-nums'] },
  chartFrame: { alignSelf: 'stretch', width: '100%', height: CHART_HEIGHT },
  emptyText: { fontSize: 15, paddingVertical: 24 },
  yLabel: {
    position: 'absolute',
    left: 0,
    width: 28,
    textAlign: 'right',
    fontSize: 11,
    color: '#8e8e93',
  },
  xLabel: { position: 'absolute', bottom: 0, width: 60, textAlign: 'center', fontSize: 11, color: '#8e8e93' },
});
