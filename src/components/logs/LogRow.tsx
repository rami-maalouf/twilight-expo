// ports: Views/Logs/SleepLogsView.swift - one list row
// day headline, "start -> end" subheadline, duration badge (accent text like
// the original's button-tinted label), swipe to delete (a full swipe
// deletes on release, like swift's default swipe actions)
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SleepSession } from '@/domain/models';
import { resolveEndTimeZone, sessionDurationSeconds, wakeDay } from '@/domain/session-rules';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';
import { DELETE_ACTION_WIDTH, isFullSwipe } from './log-swipe';
import { formatDayDate, formatTime } from '@/utils/locale-format';
import { showAlert } from '@/components/common/app-alert';

// "Wed, Jul 15" like DateFormatters.formatDay's EEE d MMM template rendered
// by ios ("Wed, Jul 15" per the reference screenshot)
export function formatDayLabel(session: SleepSession): string {
  const day = wakeDay(session);
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day));
  return formatDayDate(date, { timeZone: 'UTC' });
}

export function formatClockTime(epochMs: number, timeZone: string): string {
  return formatTime(epochMs, { timeZone });
}

function formatDurationBadge(durationSeconds: number): string {
  const h = Math.trunc(durationSeconds / 3600);
  const m = Math.trunc((durationSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const RED = '#ff3b30';

function DeleteAction({
  onDelete,
  translation,
  rowWidth,
  onFullSwipeChange,
  isFirst,
  isLast,
}: {
  onDelete: () => void;
  translation: SharedValue<number>;
  rowWidth: number;
  onFullSwipeChange: (beyond: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const fixed = useFixedColor();
  const animated = useAnimatedStyle(() => ({
    // hidden while the row is closed, so the red never fringes the rounded
    // corners of the first and last rows
    opacity: translation.value < -0.5 ? 1 : 0,
    // the button grows with the drag like the ios full-swipe button
    width: Math.max(DELETE_ACTION_WIDTH, -translation.value),
  }));
  useAnimatedReaction(
    () => isFullSwipe(translation.value, rowWidth),
    (beyond, previous) => {
      if (beyond !== previous) scheduleOnRN(onFullSwipeChange, beyond);
    },
    [rowWidth]
  );
  return (
    <Animated.View
      style={[
        styles.deleteAction,
        { backgroundColor: fixed(RED) },
        isFirst && { borderTopRightRadius: 10 },
        isLast && { borderBottomRightRadius: 10 },
        animated,
      ]}>
      <Pressable
        onPress={onDelete}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.deletePress}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </Animated.View>
  );
}

export function LogRow({
  session,
  onPress,
  onDelete,
  isFirst,
  isLast,
}: {
  session: SleepSession;
  onPress: () => void;
  onDelete: () => void;
  isFirst?: boolean;
  isLast: boolean;
}) {
  const theme = useTheme();
  const isLight = theme.name === 'sunset';
  const rowBg = isLight ? 'rgba(255, 255, 255, 0.75)' : '#1c1c1e';
  const badgeBg = isLight ? 'rgba(0, 0, 0, 0.06)' : '#2c2c2e';
  const timesColor = isLight ? '#5c4b5e' : '#98989f';
  // the list insets rows by 16dp on each side
  const rowWidth = useWindowDimensions().width - 32;
  const fullSwipe = useRef(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <ReanimatedSwipeable
      friction={1}
      rightThreshold={40}
      onSwipeableWillOpen={() => {
        if (fullSwipe.current && !deleting) {
          setDeleting(true);
          onDelete();
        }
      }}
      containerStyle={[
        styles.swipeContainer,
        isFirst && styles.cardTop,
        isLast && styles.cardBottom,
      ]}
      // one background behind row + separator, so a hairline that rounds to
      // zero pixels cannot leave a gap showing the delete action behind it
      childrenContainerStyle={[
        { backgroundColor: rowBg },
        isFirst && styles.cardTop,
        isLast && styles.cardBottom,
      ]}
      renderRightActions={(_progress, translation) => (
        <DeleteAction
          onDelete={onDelete}
          translation={translation}
          rowWidth={rowWidth}
          onFullSwipeChange={(beyond) => {
            fullSwipe.current = beyond;
          }}
          isFirst={isFirst}
          isLast={isLast}
        />
      )}>
      <Pressable
        onPress={onPress}
        onLongPress={() => {
          if (Platform.OS === 'android') {
            showAlert('Delete Sleep Log', 'Are you sure you want to delete this sleep log?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: onDelete },
            ]);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`${formatDayLabel(session)}, ${formatClockTime(session.startTime, session.startTimeZone)} to ${session.endTime != null ? formatClockTime(session.endTime, resolveEndTimeZone(session)) : ''}, ${formatDurationBadge(sessionDurationSeconds(session))}`}
        accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') {
            onDelete();
          }
        }}
        android_ripple={{
          color: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)',
        }}
        style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.day, { color: theme.textPrimary }]}>{formatDayLabel(session)}</Text>
          <Text style={[styles.times, { color: timesColor }]}>
            {formatClockTime(session.startTime, session.startTimeZone)}
            {'  \u2192  '}
            {session.endTime != null && formatClockTime(session.endTime, resolveEndTimeZone(session))}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: theme.accent }]}>
            {formatDurationBadge(sessionDurationSeconds(session))}
          </Text>
        </View>
      </Pressable>
      {!isLast && (
        <View style={styles.separator} />
      )}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: { overflow: 'hidden' },
  cardTop: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  cardBottom: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  texts: { flex: 1, gap: 3 },
  day: { fontSize: 17, fontWeight: '600' },
  times: { fontSize: 15 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 17, fontVariant: ['tabular-nums'] },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(84, 84, 88, 0.6)',
    marginLeft: 16,
  },
  deleteAction: { width: DELETE_ACTION_WIDTH, overflow: 'hidden' },
  // the label stays at the leading edge of the growing button, like ios
  deletePress: { flex: 1, width: DELETE_ACTION_WIDTH, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
