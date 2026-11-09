// ports: Views/BlockedProfileDataExportView.swift (docs/health-connect.md 6.6):
// full backup export and import with a preview, and csv / markdown session
// export. both platforms; profiles and the scheduler do not exist in the port.
import { type SymbolViewProps } from 'expo-symbols';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { Screen } from '@/components/common/Screen';
import { withAlpha } from '@/components/health-connect/parts';
import { MenuPicker } from '@/components/settings/MenuPicker';
import { settingsStore } from '@/data/app-db';
import { ArchiveError } from '@/domain/archive/archive-format';
import { confirmationMessage, successMessage } from '@/domain/archive/archive-merge';
import type { ExportFormat, ExportSortDirection, ExportTimeZone } from '@/domain/archive/session-export';
import {
  canSaveToDevice,
  exportFullBackup,
  exportSessions,
  importBackup,
  pickBackup,
  type ExportDestination,
  type ExportOutcome,
} from '@/services/archive/app-archive';
import { useSettings } from '@/state/settings-state';
import { useTheme, useThemeControls } from '@/theme/ThemeProvider';

const SORT_LABELS: Record<ExportSortDirection, string> = {
  ascending: 'Ascending (oldest first)',
  descending: 'Descending (newest first)',
};
const TIME_ZONE_LABELS: Record<ExportTimeZone, string> = { utc: 'UTC', local: 'Local' };
const FORMAT_LABELS: Record<ExportFormat, string> = { csv: 'CSV', markdown: 'Markdown (AI-friendly)' };
const FORMAT_FILE_LABELS: Record<ExportFormat, string> = { csv: 'CSV', markdown: 'Markdown' };

function formatExportedAt(ms: number): string {
  return new Date(ms).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ArchiveError) return error.message;
  return error instanceof Error && error.message ? error.message : 'An unknown error occurred. Please try again.';
}

// android: the share sheet has no local save target, so every export asks
// whether to save a file on the device or share it (docs/health-connect.md 13).
// ios: the share sheet already offers "Save to Files".
function chooseDestination(title: string, message: string): Promise<ExportDestination | null> {
  if (!canSaveToDevice) return Promise.resolve('share');
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Share', onPress: () => resolve('share') },
        { text: 'Save to Device', onPress: () => resolve('device') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

function announce(outcome: ExportOutcome) {
  if (outcome.kind === 'saved') ToastAndroid.show(`Saved ${outcome.displayName}`, ToastAndroid.SHORT);
}

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>;
}

function SectionFooter({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionFooter, { color: theme.textSecondary }]}>{children}</Text>;
}

function ActionRow({
  title,
  subtitle,
  symbol,
  loading,
  disabled,
  onPress,
  style,
  testID,
}: {
  title: string;
  subtitle: string;
  symbol: SymbolViewProps['name'];
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: withAlpha(theme.textPrimary, 0.12) }}
      style={[styles.actionRow, disabled && !loading && styles.dimmed, style]}>
      <View style={styles.actionIcon}>
        <NativeSymbol name={symbol} size={22} tintColor={theme.actionPrimary} />
      </View>
      <View style={styles.actionTexts}>
        <Text style={[styles.actionTitle, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.actionSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <NativeSymbol name="chevron.right" size={13} tintColor="#98989f" />
      )}
    </Pressable>
  );
}

export default function DataManagementScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { setMode, setPalette } = useThemeControls();
  const isDemoDataActive = useSettings((s) => s.isDemoDataActive);
  const [sortDirection, setSortDirection] = useState<ExportSortDirection>('ascending');
  const [timeZone, setTimeZone] = useState<ExportTimeZone>('utc');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [isPreparingBackup, setIsPreparingBackup] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const isBusy = isPreparingBackup || isImporting || isGenerating;

  // demo data never leaves or enters through this screen (4.4)
  if (isDemoDataActive) return <Redirect href="/settings" />;

  const rowBg = theme.name === 'sunset' ? 'rgba(255, 255, 255, 0.75)' : '#1c1c1e';
  const showError = (error: unknown) => Alert.alert('Data Error', errorMessage(error));

  const onExportBackup = async () => {
    const destination = await chooseDestination(
      'Export Full Backup',
      'Save the backup file on this device, or share it with another app.'
    );
    if (!destination) return;
    setIsPreparingBackup(true);
    try {
      announce(await exportFullBackup(destination));
    } catch (error) {
      showError(error);
    } finally {
      setIsPreparingBackup(false);
    }
  };

  const onImportBackup = async () => {
    setIsImporting(true);
    try {
      const prepared = await pickBackup();
      if (!prepared) return;
      Alert.alert('Import Backup', confirmationMessage(prepared.preview, formatExportedAt), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setIsImporting(true);
            try {
              const result = await importBackup(prepared);
              setMode(settingsStore.get('themeMode'));
              setPalette(settingsStore.get('themePalette'));
              Alert.alert('Import Complete', successMessage(result.preview, result.backupName));
            } catch (error) {
              showError(error);
            } finally {
              setIsImporting(false);
            }
          },
        },
      ]);
    } catch (error) {
      showError(error);
    } finally {
      setIsImporting(false);
    }
  };

  const onExportSessions = async () => {
    const destination = await chooseDestination(
      'Export Sessions',
      `Save the ${FORMAT_FILE_LABELS[format]} file on this device, or share it with another app.`
    );
    if (!destination) return;
    setIsGenerating(true);
    try {
      announce(await exportSessions({ format, sortDirection, timeZone, destination }));
    } catch (error) {
      showError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Screen starCount={34}>
      <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          testID="data-management-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          // a deep link can open this screen as the root, with nothing to go back to
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          android_ripple={{ color: withAlpha(theme.textPrimary, 0.16), borderless: true, radius: 22 }}
          style={styles.backButton}>
          <NativeSymbol name="chevron.left" size={24} tintColor={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.toolbarTitle, { color: theme.textPrimary }]}>Data Management</Text>
      </View>

      <ScrollView
        testID="data-management-scroll"
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        showsVerticalScrollIndicator={false}>
        <View>
          <SectionHeader title="Backup & Restore" />
          <View style={[styles.group, { backgroundColor: rowBg }]}>
            <ActionRow
              testID="export-full-backup"
              title="Export Full Backup"
              subtitle="Save a lossless JSON backup of all critical app data."
              symbol="archivebox.fill"
              loading={isPreparingBackup}
              disabled={isBusy}
              onPress={onExportBackup}
              style={styles.separator}
            />
            <ActionRow
              testID="import-backup"
              title="Import Backup"
              subtitle="Preview the incoming data, then confirm before anything changes."
              symbol="square.and.arrow.down.fill"
              loading={isImporting}
              disabled={isBusy}
              onPress={onImportBackup}
            />
          </View>
          <SectionFooter>
            Full backups include your sleep sessions, sleep settings and appearance. A backup of your current data is
            created automatically before every import.
          </SectionFooter>
        </View>

        <View>
          <SectionHeader title="Sorting" />
          <MenuPicker
            label="Sort order"
            title="Sort order"
            value={sortDirection}
            options={['ascending', 'descending'] as const}
            labels={SORT_LABELS}
            onChange={setSortDirection}
            rowBg={rowBg}
            testID="export-sort-order"
          />
          <SectionFooter>Controls the order of sessions in the export based on their start time.</SectionFooter>
        </View>

        <View>
          <SectionHeader title="Date & Time" />
          <MenuPicker
            label="Time zone"
            title="Time zone"
            value={timeZone}
            options={['utc', 'local'] as const}
            labels={TIME_ZONE_LABELS}
            onChange={setTimeZone}
            rowBg={rowBg}
            testID="export-time-zone"
          />
          <SectionFooter>
            Choose how timestamps are exported. UTC is portable across tools. Local uses your device&apos;s time zone. All
            timestamps use ISO 8601.
          </SectionFooter>
        </View>

        <View>
          <SectionHeader title="Session Export Format" />
          <MenuPicker
            label="Export format"
            title="Export format"
            value={format}
            options={['csv', 'markdown'] as const}
            labels={FORMAT_LABELS}
            onChange={setFormat}
            rowBg={rowBg}
            testID="export-format"
          />
          <SectionFooter>
            CSV is ideal for spreadsheets and data tools. Markdown is structured for AI agents and analysis and includes a
            summary, sleep stats, and a detailed session log.
          </SectionFooter>
        </View>

        <Pressable
          testID="export-sessions"
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy, busy: isGenerating }}
          disabled={isBusy}
          onPress={onExportSessions}
          android_ripple={{ color: withAlpha('#ffffff', 0.2) }}
          style={[styles.exportButton, { backgroundColor: theme.actionPrimary }, isBusy && !isGenerating && styles.dimmed]}>
          {isGenerating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <NativeSymbol name="square.and.arrow.up" size={18} tintColor="#ffffff" />
          )}
          <Text style={styles.exportButtonText}>
            {format === 'csv' ? 'Export Sessions as CSV' : 'Export Sessions as Markdown'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  toolbarTitle: { fontSize: 22, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 22 },
  sectionHeader: { fontSize: 13, marginBottom: 6, marginLeft: 16 },
  sectionFooter: { fontSize: 13, lineHeight: 18, marginTop: 6, marginHorizontal: 16 },
  group: { borderRadius: 10, overflow: 'hidden' },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(84, 84, 88, 0.6)' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionIcon: { width: 28, alignItems: 'center' },
  actionTexts: { flex: 1, gap: 4 },
  actionTitle: { fontSize: 17 },
  actionSubtitle: { fontSize: 12, lineHeight: 16 },
  dimmed: { opacity: 0.5 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  exportButtonText: { fontSize: 17, fontWeight: '600', color: '#ffffff' },
});
