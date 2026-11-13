// ports: Views/Logs/SleepLogsView.swift - the sleep logs tab
// large title, + toolbar button, valid sessions newest first, swipe to delete,
// tap to edit (editor sheet lands in task 13)
import { NativeSymbol as SymbolView } from '@/components/common/NativeSymbol';
import { useCallback, useRef } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useScrollToTop } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogRow } from '@/components/logs/LogRow';
import { PressableFeedback } from '@/components/common/PressableFeedback';
import { Screen } from '@/components/common/Screen';
import type { SleepSession } from '@/domain/models';
import { useSleepStore } from '@/state/app-sleep-store';
import { useTheme } from '@/theme/ThemeProvider';

export default function LogsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const sessions = useSleepStore((s) => s.sessions);
  const deleteSession = useSleepStore((s) => s.deleteSession);
  const refresh = useSleepStore((s) => s.refresh);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const openEditor = (session: SleepSession | null) => {
    router.push(session ? { pathname: '/log-editor', params: { id: session.id } } : '/log-editor');
  };

  return (
    <Screen>
      <FlatList
        ref={listRef}
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + (Platform.OS === 'android' ? 16 : 12) }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Sleep Logs</Text>
            <PressableFeedback
              testID="add-log"
              accessibilityRole="button"
              accessibilityLabel="Add sleep log"
              onPress={() => openEditor(null)}
              style={[styles.addButton, { backgroundColor: theme.name === 'sunset' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(28, 28, 30, 0.7)' }]}>
              <SymbolView name="plus" size={22} tintColor={theme.accent} />
            </PressableFeedback>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No sleep logs yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Track a night or add one with +
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={[index === 0 && styles.cardTop, index === sessions.length - 1 && styles.cardBottom, styles.cardBody]}>
            <LogRow
              session={item}
              isFirst={index === 0}
              isLast={index === sessions.length - 1}
              onPress={() => openEditor(item)}
              onDelete={() => deleteSession(item.id)}
            />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ios large title
  title: { fontSize: 34, fontWeight: '700' },
  cardBody: { overflow: 'hidden' },
  cardTop: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  cardBottom: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptySubtitle: { fontSize: 14 },
});
