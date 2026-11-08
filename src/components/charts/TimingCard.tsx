// ports: Views/SleepDashboardView.swift (HomeTimingCard + TimingPalette)
// sleep / wake / both timing vs 7-night average and ideal, with duration-
// tinted average lines (richer = longer personal night length)
import {
  Canvas,
  Circle,
  DashPathEffect,
  Line,
  LinearGradient,
  Path,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Card } from '@/components/common/Card';
import { HistoryRangeChip, type DashboardHistoryRange } from '@/components/dashboard/HistoryRangeChip';
import { InsightPills, type InsightItem } from '@/components/dashboard/InsightPills';
import { SegmentedPicker } from '@/components/dashboard/SegmentedPicker';
import type { TimingAveragePoint } from '@/domain/metrics/analyzer';
import { formatClockTime24Hour, formatTimeLabel } from '@/domain/metrics/chart-data';
import {
  TimingPalette,
  durationAverageRange as durationAverageRangeFromHours,
  durationRichness,
  formatNightDelta,
  formatNightLength,
  formatSignedMinutes,
} from '@/domain/metrics/timing-helpers';
import { dayKey } from '@/domain/session-rules';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';
import { catmullRomPath } from './path-utils';
import { dayIndexes, formatAbbrevDate, formatMonthDay, xTickIndexes } from './date-scale';

export const TIMING_METRICS = ['Sleep', 'Wake', 'Both'] as const;
export type TimingMetric = (typeof TIMING_METRICS)[number];

export {
  TimingPalette,
  durationRichness,
  formatNightDelta,
  formatNightLength,
  formatSignedMinutes,
} from '@/domain/metrics/timing-helpers';

const EARLIER = TimingPalette.earlier;
const LATER = TimingPalette.later;
const SLEEP = TimingPalette.sleep;
const WAKE = TimingPalette.wake;
const CHART_HEIGHT = 220;
const MARGIN = { top: 8, bottom: 24, left: 42, right: 8 };

interface PairedNight {
  key: string;
  sleep: TimingAveragePoint;
  wake: TimingAveragePoint;
}

export function averageDurationHours(pair: PairedNight): number | null {
  const sleep = pair.sleep.movingAverageOffset;
  const wake = pair.wake.movingAverageOffset;
  if (sleep == null || wake == null) return null;
  return wake - sleep;
}

export function durationAverageRange(
  pairs: readonly PairedNight[],
  targetDurationHours: number
): { lower: number; upper: number } {
  return durationAverageRangeFromHours(
    pairs.map(averageDurationHours).filter((h): h is number => h != null),
    targetDurationHours
  );
}

function metricAccent(metric: TimingMetric): string {
  switch (metric) {
    case 'Sleep':
      return SLEEP;
    case 'Wake':
      return WAKE;
    case 'Both':
      return '#ffffff';
  }
}

function symbolRadius(symbolSize: number): number {
  return Math.sqrt(symbolSize / Math.PI);
}

export function TimingCard({
  sleepSeries,
  wakeSeries,
  targetSleepOffset,
  targetWakeOffset,
  targetDurationHours,
  width,
  metric,
  onMetricChange,
  historyRange,
  onHistoryRangeToggle,
}: {
  sleepSeries: TimingAveragePoint[];
  wakeSeries: TimingAveragePoint[];
  targetSleepOffset: number | null;
  targetWakeOffset: number | null;
  targetDurationHours: number;
  width: number;
  metric: TimingMetric;
  onMetricChange: (metric: TimingMetric) => void;
  historyRange: DashboardHistoryRange;
  onHistoryRangeToggle: () => void;
}) {
  const theme = useTheme();
  const fixed = useFixedColor();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(width);
  const chartWidth = measuredWidth > 0 ? measuredWidth : width;

  const series = metric === 'Wake' ? wakeSeries : sleepSeries;
  const targetOffset =
    metric === 'Sleep' ? targetSleepOffset : metric === 'Wake' ? targetWakeOffset : null;

  const pairedNights = useMemo(() => {
    const wakeByDate = new Map(wakeSeries.map((p) => [dayKey(p.date), p]));
    return sleepSeries.flatMap((sleep) => {
      const wake = wakeByDate.get(dayKey(sleep.date));
      if (!wake) return [];
      return [{ key: dayKey(sleep.date), sleep, wake } satisfies PairedNight];
    });
  }, [sleepSeries, wakeSeries]);

  const latestPoint = series.length > 0 ? series[series.length - 1] : null;
  const selectedPoint = selectedIndex != null ? series[selectedIndex] : latestPoint;
  const selectedPair =
    selectedIndex != null
      ? pairedNights[Math.min(selectedIndex, pairedNights.length - 1)] ?? pairedNights[pairedNights.length - 1]
      : pairedNights[pairedNights.length - 1] ?? null;

  // for Both mode, selectedIndex indexes paired nights; for Sleep/Wake it indexes series
  const effectiveSelectedPair =
    metric === 'Both'
      ? selectedIndex != null
        ? pairedNights[selectedIndex] ?? pairedNights[pairedNights.length - 1]
        : pairedNights[pairedNights.length - 1]
      : selectedPair;

  const lookbackPoint = series.length > 7 ? series[series.length - 8] : null;

  const versusAverageHours =
    selectedPoint?.movingAverageOffset != null
      ? selectedPoint.actualOffset - selectedPoint.movingAverageOffset
      : null;
  const sleepVersusAverageHours =
    effectiveSelectedPair?.sleep.movingAverageOffset != null
      ? effectiveSelectedPair.sleep.actualOffset - effectiveSelectedPair.sleep.movingAverageOffset
      : null;
  const wakeVersusAverageHours =
    effectiveSelectedPair?.wake.movingAverageOffset != null
      ? effectiveSelectedPair.wake.actualOffset - effectiveSelectedPair.wake.movingAverageOffset
      : null;
  const versusIdealHours =
    selectedPoint != null && targetOffset != null
      ? selectedPoint.actualOffset - targetOffset
      : null;
  const averageDriftHours =
    latestPoint?.movingAverageOffset != null && lookbackPoint?.movingAverageOffset != null
      ? latestPoint.movingAverageOffset - lookbackPoint.movingAverageOffset
      : null;
  const selectedNightHours =
    effectiveSelectedPair != null
      ? effectiveSelectedPair.wake.actualOffset - effectiveSelectedPair.sleep.actualOffset
      : null;
  const averageNightHours =
    effectiveSelectedPair?.sleep.movingAverageOffset != null &&
    effectiveSelectedPair?.wake.movingAverageOffset != null
      ? effectiveSelectedPair.wake.movingAverageOffset - effectiveSelectedPair.sleep.movingAverageOffset
      : null;
  const nightVersusAverageHours =
    selectedNightHours != null && averageNightHours != null
      ? selectedNightHours - averageNightHours
      : null;

  const progressText = (() => {
    if (
      targetOffset == null ||
      latestPoint?.movingAverageOffset == null ||
      lookbackPoint?.movingAverageOffset == null
    ) {
      return series.length >= 7 ? 'Need more nights' : 'Need 7 nights';
    }
    const latestDistance = Math.abs(latestPoint.movingAverageOffset - targetOffset);
    const previousDistance = Math.abs(lookbackPoint.movingAverageOffset - targetOffset);
    if (latestDistance < previousDistance - 0.04) return 'Toward ideal';
    if (latestDistance > previousDistance + 0.04) return 'Away from ideal';
    return 'Holding pattern';
  })();

  const progressColor =
    progressText === 'Toward ideal'
      ? fixed(EARLIER)
      : progressText === 'Away from ideal'
        ? fixed(LATER)
        : theme.textSecondary;

  const directionColor = (hours: number | null) => {
    if (hours == null) return theme.textSecondary;
    if (Math.abs(hours) <= 0.008) return fixed(EARLIER);
    return hours > 0 ? fixed(LATER) : fixed(EARLIER);
  };

  const pills: InsightItem[] =
    metric === 'Both'
      ? [
          {
            title: 'sleep vs avg',
            value: formatSignedMinutes(sleepVersusAverageHours),
            subtitle: 'bedtime',
            tint: directionColor(sleepVersusAverageHours),
          },
          {
            title: 'wake vs avg',
            value: formatSignedMinutes(wakeVersusAverageHours),
            subtitle: 'wake time',
            tint: directionColor(wakeVersusAverageHours),
          },
          {
            title: 'night',
            value: formatNightLength(selectedNightHours),
            subtitle: formatNightDelta(nightVersusAverageHours),
            tint: theme.actionPrimary,
          },
        ]
      : [
          {
            title: 'vs average',
            value: formatSignedMinutes(versusAverageHours),
            subtitle: 'than 7-night avg',
            tint: directionColor(versusAverageHours),
          },
          {
            title: 'vs ideal',
            value: formatSignedMinutes(versusIdealHours),
            subtitle: targetOffset == null ? 'set a goal time' : 'from your target',
            tint: directionColor(versusIdealHours),
          },
          {
            title: 'avg drift',
            value: formatSignedMinutes(averageDriftHours),
            subtitle: progressText,
            tint: progressColor,
          },
        ];

  // chart domain in inverted plotY space: (-upper)...(-lower) of offset values
  const chartDomain = (() => {
    const values: number[] = [];
    if (metric === 'Both') {
      values.push(...sleepSeries.map((p) => p.actualOffset));
      values.push(...wakeSeries.map((p) => p.actualOffset));
      values.push(...sleepSeries.map((p) => p.movingAverageOffset).filter((v): v is number => v != null));
      values.push(...wakeSeries.map((p) => p.movingAverageOffset).filter((v): v is number => v != null));
      if (targetSleepOffset != null) values.push(targetSleepOffset);
      if (targetWakeOffset != null) values.push(targetWakeOffset);
    } else {
      values.push(...series.map((p) => p.actualOffset));
      values.push(...series.map((p) => p.movingAverageOffset).filter((v): v is number => v != null));
      if (targetOffset != null) values.push(targetOffset);
    }
    if (values.length === 0) return { plotLower: -14, plotUpper: -4 };
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataRange = Math.max(0.25, dataMax - dataMin);
    const padding = Math.max(0.35, dataRange * 0.12);
    const lower = dataMin - padding;
    const upper = dataMax + padding;
    return { plotLower: -upper, plotUpper: -lower };
  })();

  const plotY = (offset: number) => -offset;
  const plotW = chartWidth - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const dates =
    metric === 'Both' ? pairedNights.map((p) => p.sleep.date) : series.map((p) => p.date);
  const xs = dayIndexes(dates);
  const maxX = xs.length > 0 ? Math.max(xs[xs.length - 1], 1) : 1;
  const xPos = (x: number) => MARGIN.left + (x / maxX) * plotW;
  const yPos = (plotValue: number) =>
    MARGIN.top +
    ((chartDomain.plotUpper - plotValue) / (chartDomain.plotUpper - chartDomain.plotLower || 1)) *
      plotH;

  const yTicks = Array.from(
    { length: 5 },
    (_, i) =>
      chartDomain.plotLower + ((chartDomain.plotUpper - chartDomain.plotLower) * i) / 4
  );
  const ticks = xTickIndexes(dates.length);

  const durationRange = durationAverageRange(pairedNights, targetDurationHours);
  const durationColors = (isSleep: boolean) => {
    const hours = pairedNights.map(averageDurationHours).filter((h): h is number => h != null);
    if (hours.length < 2) {
      const fallback = isSleep ? SLEEP : WAKE;
      return [fallback, fallback];
    }
    const strideBy = Math.max(1, Math.floor(hours.length / 24));
    const sampled: number[] = [];
    for (let i = 0; i < hours.length; i += strideBy) sampled.push(hours[i]);
    if (sampled[sampled.length - 1] !== hours[hours.length - 1]) {
      sampled.push(hours[hours.length - 1]);
    }
    return sampled.map((value) => {
      const richness = durationRichness(value, durationRange);
      return isSleep ? TimingPalette.sleepAverage(richness) : TimingPalette.wakeAverage(richness);
    });
  };

  const averageLinePath = (points: TimingAveragePoint[]) => {
    const linePts = points
      .map((p, i) =>
        p.movingAverageOffset != null
          ? { x: xPos(xs[i] ?? i), y: yPos(plotY(p.movingAverageOffset)) }
          : null
      )
      .filter((p): p is { x: number; y: number } => p != null);
    return catmullRomPath(linePts);
  };

  const nearestIndex = (px: number) => {
    const count = metric === 'Both' ? pairedNights.length : series.length;
    if (count === 0) return null;
    const target = px + MARGIN.left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
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
    .onFinalize(() => setSelectedIndex(null));

  const selectedKey =
    metric === 'Both'
      ? effectiveSelectedPair?.key
      : selectedPoint
        ? dayKey(selectedPoint.date)
        : null;

  const sleepGradColors = durationColors(true);
  const wakeGradColors = durationColors(false);
  const gradStart = vec(MARGIN.left, 0);
  const gradEnd = vec(MARGIN.left + plotW, 0);

  const bothBandPath = (() => {
    if (metric !== 'Both' || pairedNights.length === 0) return null;
    const withAvg = pairedNights
      .map((pair, i) => {
        const sleepAvg = pair.sleep.movingAverageOffset;
        const wakeAvg = pair.wake.movingAverageOffset;
        if (sleepAvg == null || wakeAvg == null) return null;
        return { x: xPos(xs[i]), sleepY: yPos(plotY(sleepAvg)), wakeY: yPos(plotY(wakeAvg)) };
      })
      .filter((p): p is { x: number; sleepY: number; wakeY: number } => p != null);
    if (withAvg.length === 0) return null;
    const builder = Skia.PathBuilder.Make();
    builder.moveTo(withAvg[0].x, withAvg[0].sleepY);
    for (const p of withAvg) builder.lineTo(p.x, p.sleepY);
    for (let i = withAvg.length - 1; i >= 0; i--) builder.lineTo(withAvg[i].x, withAvg[i].wakeY);
    builder.close();
    return builder.build();
  })();

  const header = (
    <View style={styles.headerRow}>
      <View style={styles.metricPicker}>
        <SegmentedPicker
          options={TIMING_METRICS}
          value={metric}
          onChange={(next) => {
            setSelectedIndex(null);
            onMetricChange(next);
          }}
          testIDPrefix="demo.dashboard.timing.metric"
        />
      </View>
      <HistoryRangeChip range={historyRange} onToggle={onHistoryRangeToggle} />
    </View>
  );

  if (series.length === 0) {
    return (
      <Card>
        <View style={styles.stack}>
          {header}
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Track a completed night to see when you sleep against your average.
          </Text>
        </View>
      </Card>
    );
  }

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
            {metric !== 'Both' && targetOffset != null && (
              <>
                <Line
                  p1={vec(MARGIN.left, yPos(plotY(targetOffset)))}
                  p2={vec(MARGIN.left + plotW, yPos(plotY(targetOffset)))}
                  color={`${metricAccent(metric)}B3`}
                  strokeWidth={1.2}>
                  <DashPathEffect intervals={[4, 4]} />
                </Line>
                {(() => {
                  const avgPts = series
                    .map((point, i) =>
                      point.movingAverageOffset != null
                        ? {
                            x: xPos(xs[i]),
                            avg: point.movingAverageOffset,
                            later: point.movingAverageOffset >= targetOffset,
                          }
                        : null
                    )
                    .filter(
                      (p): p is { x: number; avg: number; later: boolean } => p != null
                    );
                  if (avgPts.length === 0) return null;
                  // split into contiguous later/earlier area segments like AreaMark fills
                  const segments: { later: boolean; pts: { x: number; avg: number }[] }[] = [];
                  let active = { later: avgPts[0].later, pts: [{ x: avgPts[0].x, avg: avgPts[0].avg }] };
                  for (let i = 1; i < avgPts.length; i++) {
                    const cur = avgPts[i];
                    if (cur.later === active.later) {
                      active.pts.push({ x: cur.x, avg: cur.avg });
                    } else {
                      segments.push(active);
                      active = { later: cur.later, pts: [{ x: cur.x, avg: cur.avg }] };
                    }
                  }
                  segments.push(active);
                  const idealY = yPos(plotY(targetOffset));
                  return segments.map((segment, si) => {
                    const builder = Skia.PathBuilder.Make();
                    builder.moveTo(segment.pts[0].x, idealY);
                    for (const p of segment.pts) builder.lineTo(p.x, yPos(plotY(p.avg)));
                    builder.lineTo(segment.pts[segment.pts.length - 1].x, idealY);
                    builder.close();
                    return (
                      <Path
                        key={`ideal-area-${si}`}
                        path={builder.build()}
                        color={segment.later ? `${LATER}24` : `${EARLIER}24`}
                      />
                    );
                  });
                })()}
              </>
            )}

            {metric === 'Both' && targetSleepOffset != null && (
              <Line
                p1={vec(MARGIN.left, yPos(plotY(targetSleepOffset)))}
                p2={vec(MARGIN.left + plotW, yPos(plotY(targetSleepOffset)))}
                color={`${SLEEP}8C`}
                strokeWidth={1.1}>
                <DashPathEffect intervals={[4, 4]} />
              </Line>
            )}
            {metric === 'Both' && targetWakeOffset != null && (
              <Line
                p1={vec(MARGIN.left, yPos(plotY(targetWakeOffset)))}
                p2={vec(MARGIN.left + plotW, yPos(plotY(targetWakeOffset)))}
                color={`${WAKE}8C`}
                strokeWidth={1.1}>
                <DashPathEffect intervals={[4, 4]} />
              </Line>
            )}

            {metric === 'Both' && bothBandPath && (
              <Path path={bothBandPath}>
                <LinearGradient
                  start={vec(0, MARGIN.top)}
                  end={vec(0, MARGIN.top + plotH)}
                  colors={[`${SLEEP}2E`, `${WAKE}1F`]}
                />
              </Path>
            )}

            {metric !== 'Both' &&
              series.map((point, i) => {
                if (point.movingAverageOffset == null) return null;
                const later = point.actualOffset > point.movingAverageOffset;
                const selected = selectedKey === dayKey(point.date);
                const barW = selected ? 3 : 1.6;
                const x = xPos(xs[i]) - barW / 2;
                const y1 = yPos(plotY(point.movingAverageOffset));
                const y2 = yPos(plotY(point.actualOffset));
                return (
                  <Rect
                    key={`bar-${i}`}
                    x={x}
                    y={Math.min(y1, y2)}
                    width={barW}
                    height={Math.max(Math.abs(y2 - y1), 1)}
                    color={later ? `${LATER}C7` : `${EARLIER}C7`}
                  />
                );
              })}

            {metric !== 'Both' &&
              series.map((point, i) => {
                const laterThanAverage =
                  point.movingAverageOffset != null &&
                  point.actualOffset > point.movingAverageOffset;
                const selected = selectedKey === dayKey(point.date);
                return (
                  <Circle
                    key={`pt-${i}`}
                    cx={xPos(xs[i])}
                    cy={yPos(plotY(point.actualOffset))}
                    r={symbolRadius(selected ? 52 : 18)}
                    color={laterThanAverage ? fixed(LATER) : fixed(EARLIER)}
                  />
                );
              })}

            {metric === 'Both' &&
              sleepSeries.map((point, i) => (
                <Circle
                  key={`sleep-pt-${i}`}
                  cx={xPos(xs[i])}
                  cy={yPos(plotY(point.actualOffset))}
                  r={symbolRadius(
                    effectiveSelectedPair && dayKey(point.date) === effectiveSelectedPair.key
                      ? 44
                      : 14
                  )}
                  color={fixed(SLEEP)}
                />
              ))}
            {metric === 'Both' &&
              wakeSeries.map((point, i) => (
                <Circle
                  key={`wake-pt-${i}`}
                  cx={xPos(xs[i])}
                  cy={yPos(plotY(point.actualOffset))}
                  r={symbolRadius(
                    effectiveSelectedPair && dayKey(point.date) === effectiveSelectedPair.key
                      ? 44
                      : 14
                  )}
                  color={fixed(WAKE)}
                />
              ))}

            {(metric === 'Sleep' || metric === 'Both') && (
              <Path
                path={averageLinePath(sleepSeries)}
                style="stroke"
                strokeWidth={2.6}
                strokeCap="round">
                <LinearGradient start={gradStart} end={gradEnd} colors={sleepGradColors} />
              </Path>
            )}
            {(metric === 'Wake' || metric === 'Both') && (
              <Path
                path={averageLinePath(wakeSeries)}
                style="stroke"
                strokeWidth={2.6}
                strokeCap="round">
                <LinearGradient start={gradStart} end={gradEnd} colors={wakeGradColors} />
              </Path>
            )}

            {metric !== 'Both' && selectedPoint && selectedIndex != null && (
              <>
                <Line
                  p1={vec(xPos(xs[selectedIndex]), MARGIN.top)}
                  p2={vec(xPos(xs[selectedIndex]), MARGIN.top + plotH)}
                  color="rgba(255,255,255,0.35)"
                  strokeWidth={1}>
                  <DashPathEffect intervals={[2, 3]} />
                </Line>
                <Circle
                  cx={xPos(xs[selectedIndex])}
                  cy={yPos(plotY(selectedPoint.actualOffset))}
                  r={symbolRadius(56)}
                  color="#ffffff"
                />
              </>
            )}

            {metric === 'Both' && effectiveSelectedPair && selectedIndex != null && (
              <>
                <Line
                  p1={vec(xPos(xs[selectedIndex]), MARGIN.top)}
                  p2={vec(xPos(xs[selectedIndex]), MARGIN.top + plotH)}
                  color="rgba(255,255,255,0.35)"
                  strokeWidth={1}>
                  <DashPathEffect intervals={[2, 3]} />
                </Line>
                <Circle
                  cx={xPos(xs[selectedIndex])}
                  cy={yPos(plotY(effectiveSelectedPair.sleep.actualOffset))}
                  r={symbolRadius(48)}
                  color="#ffffff"
                />
                <Circle
                  cx={xPos(xs[selectedIndex])}
                  cy={yPos(plotY(effectiveSelectedPair.wake.actualOffset))}
                  r={symbolRadius(48)}
                  color="#ffffff"
                />
              </>
            )}
          </Canvas>

          {yTicks.map((t) => (
            <Text key={`y-${t}`} style={[styles.yLabel, { top: yPos(t) - 7 }]}>
              {formatTimeLabel(-t)}
            </Text>
          ))}
          {ticks.map((i) => (
            <Text
              key={`x-${i}`}
              style={[styles.xLabel, { left: xPos(xs[i]) - 30, color: '#8e8e93' }]}>
              {formatMonthDay(dates[i])}
            </Text>
          ))}
          <GestureDetector gesture={scrub}>
            <View
              testID="demo.dashboard.chart.timing"
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
            {selectedPoint && selectedIndex != null
              ? formatAbbrevDate(selectedPoint.date)
              : 'Latest'}
          </Text>
          {metric === 'Both' && effectiveSelectedPair ? (
            <View style={styles.footerRight}>
              <Text style={[styles.captionStrong, { color: fixed(SLEEP) }]}>
                {formatClockTime24Hour(effectiveSelectedPair.sleep.actualOffset)}
              </Text>
              <Text style={[styles.caption, { color: theme.textSecondary }]}>–</Text>
              <Text style={[styles.captionStrong, { color: fixed(WAKE) }]}>
                {formatClockTime24Hour(effectiveSelectedPair.wake.actualOffset)}
              </Text>
            </View>
          ) : (
            selectedPoint && (
              <View style={styles.footerRight}>
                <Text style={[styles.captionStrong, { color: theme.textPrimary }]}>
                  {formatClockTime24Hour(selectedPoint.actualOffset)}
                </Text>
                {versusAverageHours != null && (
                  <>
                    <Text style={[styles.caption, { color: theme.textSecondary }]}>•</Text>
                    <Text
                      style={[styles.captionStrong, { color: directionColor(versusAverageHours) }]}>
                      {formatSignedMinutes(versusAverageHours)}
                    </Text>
                  </>
                )}
              </View>
            )
          )}
        </View>
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
  chartFrame: { alignSelf: 'stretch', width: '100%', height: CHART_HEIGHT },
  metricPicker: { flex: 1, minWidth: 230, flexShrink: 0 },
  emptyText: { fontSize: 15, paddingVertical: 24 },
  yLabel: {
    position: 'absolute',
    left: 0,
    width: 38,
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
