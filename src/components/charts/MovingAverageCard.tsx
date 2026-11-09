// ports: Views/SleepDashboardView.swift (HomeMovingAverageCard)
// trend card with 7-Night / Monthly window toggle, green/red 0.22 area
// segments split at target, actionPrimary lw3 catmullRom line, dashed
// target rule, scrub selection, dynamic y domain clamped 0-12 (min span 0.9)
import { Canvas, Circle, DashPathEffect, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { Card } from '@/components/common/Card';
import { HistoryRangeChip, type DashboardHistoryRange } from '@/components/dashboard/HistoryRangeChip';
import { InsightPills, type InsightItem } from '@/components/dashboard/InsightPills';
import { SegmentedPicker } from '@/components/dashboard/SegmentedPicker';
import type { MovingAveragePoint } from '@/domain/metrics/analyzer';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';
import { catmullRomPath } from './path-utils';
import { dayIndexes, formatAbbrevDate, formatMonthDay, xTickIndexes } from './date-scale';

const GREEN = '#34c759';
const RED = '#ff3b30';
const ORANGE = '#ff9500';
const CHART_HEIGHT = 220;
const MARGIN = { top: 8, bottom: 24, left: 38, right: 8 };

export const MOVING_AVERAGE_WINDOWS = ['7-Night', 'Monthly'] as const;
export type MovingAverageWindowLabel = (typeof MOVING_AVERAGE_WINDOWS)[number];

export function nightCountForWindow(window: MovingAverageWindowLabel): number {
  return window === 'Monthly' ? 30 : 7;
}

function fmtHours(value: number | null): string {
  return value == null ? '-' : `${value.toFixed(1)}h`;
}

function fmtSignedHours(value: number | null): string {
  if (value == null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}h`;
}

// ports the card's chartDomain computed property exactly
export function movingAverageDomain(
  values: readonly number[],
  target: number
): { lower: number; upper: number } {
  if (values.length === 0) return { lower: 6, upper: 9 };
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataRange = Math.max(0.01, dataMax - dataMin);
  const padding = Math.max(0.18, dataRange * 0.12);
  let lower = Math.max(0, dataMin - padding);
  let upper = Math.min(12, dataMax + padding);
  if (target < lower) lower = Math.max(0, target - 0.14);
  else if (target > upper) upper = Math.min(12, target + 0.14);
  if (upper - lower < 0.9) {
    const midpoint = (upper + lower) / 2;
    lower = Math.max(0, midpoint - 0.45);
    upper = Math.min(12, midpoint + 0.45);
  }
  return { lower, upper };
}

// ports areaSegments: split at target crossings with interpolated points
interface AreaSegment {
  above: boolean;
  points: { x: number; hours: number }[];
}

export function buildAreaSegments(
  values: readonly { x: number; hours: number }[],
  target: number
): AreaSegment[] {
  if (values.length === 0) return [];
  const zone = (h: number) => h >= target;
  const segments: AreaSegment[] = [];
  let activeZone = zone(values[0].hours);
  let activePoints = [values[0]];

  for (let i = 1; i < values.length; i++) {
    const previous = values[i - 1];
    const current = values[i];
    if (zone(previous.hours) === zone(current.hours) || Math.abs(current.hours - previous.hours) < 1e-6) {
      activePoints.push(current);
      continue;
    }
    const ratio = Math.min(Math.max((target - previous.hours) / (current.hours - previous.hours), 0), 1);
    const crossingX = previous.x + (current.x - previous.x) * ratio;
    const crossing = { x: crossingX, hours: target };
    activePoints.push(crossing);
    segments.push({ above: activeZone, points: activePoints });
    activeZone = zone(current.hours);
    activePoints = [crossing, current];
  }
  segments.push({ above: activeZone, points: activePoints });
  return segments;
}

export function MovingAverageCard({
  series,
  targetDurationHours,
  width,
  window,
  onWindowChange,
  historyRange,
  onHistoryRangeToggle,
}: {
  series: MovingAveragePoint[];
  targetDurationHours: number;
  width: number;
  window: MovingAverageWindowLabel;
  onWindowChange: (window: MovingAverageWindowLabel) => void;
  historyRange: DashboardHistoryRange;
  onHistoryRangeToggle: () => void;
}) {
  const theme = useTheme();
  const fixed = useFixedColor();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(width);
  const chartWidth = measuredWidth > 0 ? measuredWidth : width;
  const nightCount = nightCountForWindow(window);

  const plotted = series.filter((p) => p.movingAverageHours != null);
  const values = plotted.map((p) => p.movingAverageHours!);
  const xs = dayIndexes(plotted.map((p) => p.date));
  const maxX = xs.length > 0 ? Math.max(xs[xs.length - 1], 1) : 1;

  const latest = plotted.length > 0 ? plotted[plotted.length - 1] : null;
  const lookback =
    plotted.length > nightCount ? plotted[plotted.length - nightCount - 1] : null;
  const selected = selectedIndex != null ? plotted[selectedIndex] : latest;

  const lookbackDelta =
    latest?.movingAverageHours != null && lookback?.movingAverageHours != null
      ? latest.movingAverageHours - lookback.movingAverageHours
      : null;
  const targetDelta =
    latest?.movingAverageHours != null ? latest.movingAverageHours - targetDurationHours : null;
  const range =
    values.length > 0 ? `${Math.min(...values).toFixed(1)}-${Math.max(...values).toFixed(1)}h` : '-';

  const needMoreNightsText = `Need >${nightCount * 2} nights`;
  const trendDirection =
    lookbackDelta == null
      ? needMoreNightsText
      : lookbackDelta > 0.05
        ? 'Improving'
        : lookbackDelta < -0.05
          ? 'Declining'
          : 'Stable';
  const trendColor =
    lookbackDelta == null
      ? theme.textSecondary
      : lookbackDelta > 0.05
        ? fixed(GREEN)
        : lookbackDelta < -0.05
          ? fixed(RED)
          : fixed(ORANGE);
  const targetColor =
    targetDelta == null ? theme.textSecondary : targetDelta >= 0 ? fixed(GREEN) : fixed(ORANGE);

  const lookbackLabel = `vs ${nightCount}d ago`;
  const pills: InsightItem[] = [
    {
      title: lookbackLabel,
      value: fmtSignedHours(lookbackDelta),
      subtitle: trendDirection,
      tint: trendColor,
    },
    {
      title: 'vs target',
      value: fmtSignedHours(targetDelta),
      subtitle: targetDelta == null ? '-' : targetDelta >= 0 ? 'Above target' : 'Below target',
      tint: targetColor,
    },
    { title: 'range', value: range, subtitle: 'selected span', tint: theme.actionPrimary },
  ];

  const { lower, upper } = movingAverageDomain(values, targetDurationHours);
  const plotW = chartWidth - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const xPos = (x: number) => MARGIN.left + (x / maxX) * plotW;
  const yPos = (h: number) => MARGIN.top + ((upper - h) / (upper - lower || 1)) * plotH;

  const linePoints = plotted.map((p, i) => ({ x: xPos(xs[i]), y: yPos(p.movingAverageHours!) }));
  const segments = buildAreaSegments(
    plotted.map((p, i) => ({ x: xs[i], hours: p.movingAverageHours! })),
    targetDurationHours
  );

  const areaPath = (segment: AreaSegment) => {
    const builder = Skia.PathBuilder.Make();
    const pts = segment.points;
    builder.moveTo(xPos(pts[0].x), yPos(targetDurationHours));
    for (const p of pts) builder.lineTo(xPos(p.x), yPos(p.hours));
    builder.lineTo(xPos(pts[pts.length - 1].x), yPos(targetDurationHours));
    builder.close();
    return builder.build();
  };

  const yTicks = Array.from({ length: 4 }, (_, i) => lower + ((upper - lower) * i) / 3);
  const ticks = xTickIndexes(plotted.length);

  const nearestIndex = (px: number) => {
    if (plotted.length === 0) return null;
    const target = px + MARGIN.left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < plotted.length; i++) {
      const d = Math.abs(xPos(xs[i]) - target);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const scrub = usePanGesture({
    minDistance: 0,
    activeOffsetX: [-8, 8],
    failOffsetY: [-8, 8],
    runOnJS: true,
    onBegin: (e) => setSelectedIndex(nearestIndex(e.x)),
    onUpdate: (e) => setSelectedIndex(nearestIndex(e.x)),
    onFinalize: () => setSelectedIndex(null),
  });

  const header = (
    <View style={styles.headerRow}>
      <View style={styles.windowPicker}>
        <SegmentedPicker
          options={MOVING_AVERAGE_WINDOWS}
          value={window}
          onChange={(next) => {
            setSelectedIndex(null);
            onWindowChange(next);
          }}
          testIDPrefix="demo.dashboard.trend.window"
        />
      </View>
      <View style={styles.headerSpacer} />
      <Text style={[styles.headline, { color: theme.actionPrimary }]}>
        {fmtHours(latest?.movingAverageHours ?? null)}
      </Text>
      <HistoryRangeChip range={historyRange} onToggle={onHistoryRangeToggle} />
    </View>
  );

  if (plotted.length === 0) {
    return (
      <Card>
        <View style={styles.stack}>
          {header}
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Track at least {nightCount} nights to unlock your rolling average trend.
          </Text>
        </View>
      </Card>
    );
  }

  const selectedHours = selected?.movingAverageHours ?? null;
  const selectedDelta = selectedHours != null ? selectedHours - targetDurationHours : null;
  const lookbackTrendText =
    lookbackDelta == null
      ? '-'
      : `${fmtSignedHours(lookbackDelta)} ${lookbackLabel}`;

  return (
    <Card>
      <View style={styles.stack}>
        {header}

        <InsightPills items={pills} />

        <View
          style={styles.chartFrame}
          onLayout={(e) => {
            const next = e.nativeEvent.layout.width;
            if (next > 0 && Math.abs(next - measuredWidth) > 0.5) setMeasuredWidth(next);
          }}>
          <Canvas style={StyleSheet.absoluteFill}>
            {segments.map((segment, i) => (
              <Path
                key={`seg-${i}`}
                path={areaPath(segment)}
                color={segment.above ? fixed('rgba(52, 199, 89, 0.22)') : fixed('rgba(255, 59, 48, 0.22)')}
              />
            ))}
            <Path
              path={catmullRomPath(linePoints)}
              style="stroke"
              strokeWidth={3}
              color={theme.actionPrimary}
            />
            <Line
              p1={vec(MARGIN.left, yPos(targetDurationHours))}
              p2={vec(MARGIN.left + plotW, yPos(targetDurationHours))}
              color="rgba(142, 142, 147, 0.8)"
              strokeWidth={1.2}>
              <DashPathEffect intervals={[4, 4]} />
            </Line>
            {selected && selectedIndex != null && (
              <Line
                p1={vec(linePoints[selectedIndex].x, MARGIN.top)}
                p2={vec(linePoints[selectedIndex].x, MARGIN.top + plotH)}
                color="rgba(255, 255, 255, 0.4)"
                strokeWidth={1}>
                <DashPathEffect intervals={[2, 3]} />
              </Line>
            )}
            {selected && selectedHours != null && (
              <Circle
                cx={linePoints[selectedIndex ?? linePoints.length - 1].x}
                cy={yPos(selectedHours)}
                r={4.2}
                color="#ffffff"
              />
            )}
          </Canvas>
          {yTicks.map((t) => (
            <Text key={`y-${t}`} style={[styles.yLabel, { top: yPos(t) - 7 }]}>
              {t.toFixed(1)}h
            </Text>
          ))}
          {ticks.map((i) => (
            <Text
              key={`x-${i}`}
              style={[styles.xLabel, { left: xPos(xs[i]) - 30, color: '#8e8e93' }]}>
              {formatMonthDay(plotted[i].date)}
            </Text>
          ))}
          <GestureDetector gesture={scrub}>
            <View
              testID="demo.dashboard.chart.trend"
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

        <View style={styles.footerRow}>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            {selected && selectedIndex != null ? formatAbbrevDate(selected.date) : 'Latest'}
          </Text>
          {selectedHours != null && (
            <View style={styles.footerRight}>
              <Text style={[styles.captionStrong, { color: theme.textPrimary }]}>
                Avg {fmtHours(selectedHours)}
              </Text>
              <Text style={[styles.caption, { color: theme.textSecondary }]}>•</Text>
              <Text
                style={[
                  styles.captionStrong,
                  { color: (selectedDelta ?? 0) >= 0 ? fixed(GREEN) : fixed(ORANGE) },
                ]}>
                {fmtSignedHours(selectedDelta)} vs target
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.caption, { color: theme.textSecondary }]}>{lookbackTrendText}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, alignSelf: 'stretch' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    width: '100%',
  },
  windowPicker: { maxWidth: 188, flex: 1, minWidth: 0, flexShrink: 1 },
  headerSpacer: { flexGrow: 1, minWidth: 8 },
  chartFrame: { alignSelf: 'stretch', width: '100%', height: CHART_HEIGHT },
  headline: { fontSize: 17, fontWeight: '600' },
  emptyText: { fontSize: 15, paddingVertical: 24 },
  yLabel: {
    position: 'absolute',
    left: 0,
    width: 34,
    textAlign: 'right',
    fontSize: 11,
    color: '#8e8e93',
  },
  xLabel: { position: 'absolute', bottom: 0, width: 60, textAlign: 'center', fontSize: 11 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caption: { fontSize: 12 },
  captionStrong: { fontSize: 12, fontWeight: '600' },
});
