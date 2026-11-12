// ports: Views/BlockedProfileDataExportView.swift (docs/health-connect.md 6.6):
// full backup export and import with a preview, and csv / markdown session
// export. both platforms; profiles and the scheduler do not exist in the port.
import { type SymbolViewProps } from 'expo-symbols';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/components/common/app-alert';
import { BackButton } from '@/components/common/BackButton';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { Screen } from '@/components/common/Screen';
import { ON_FILL_RIPPLE, PressableFeedback } from '@/components/common/PressableFeedback';
import { MenuPicker } from '@/components/settings/MenuPicker';
import { SettingsRow, SettingsSection, useSecondaryLabel } from '@/components/settings/SettingsList';
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
    showAlert(
      title,
      message,
      // back or the scrim runs the cancel button
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Share', onPress: () => resolve('share') },
        { text: 'Save to Device', onPress: () => resolve('device') },
      ]
    );
  });
}

function announce(outcome: ExportOutcome) {
  if (outcome.kind === 'saved') ToastAndroid.show(`Saved ${outcome.displayName}`, ToastAndroid.SHORT);
}

function ActionRow({
  title,
  subtitle,
  symbol,
  loading,
  disabled,
  onPress,
  separator,
  testID,
}: {
  title: string;
  subtitle: string;
  symbol: SymbolViewProps['name'];
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  separator?: boolean;
  testID: string;
}) {
  const theme = useTheme();
  const secondaryLabel = useSecondaryLabel();
  return (
    <SettingsRow
      testID={testID}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ busy: loading }}
      disabled={disabled}
      onPress={onPress}
      separator={separator}
      style={[styles.actionRow, disabled && !loading && styles.dimmed]}>
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
        <NativeSymbol name="chevron.right" size={13} tintColor={secondaryLabel} />
      )}
    </SettingsRow>
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

  const showError = (error: unknown) => showAlert('Data Error', errorMessage(error));

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
      showAlert('Import Backup', confirmationMessage(prepared.preview, formatExportedAt), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setIsImporting(true);
            try {
              const result = await importBackup(prepared);
              setMode(settingsStore.get('themeMode'));
              setPalette(settingsStore.get('themePalette'));
              showAlert('Import Complete', successMessage(result.preview, result.backupName));
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
        <BackButton
          testID="data-management-back"
          color={theme.textPrimary}
          // a deep link can open this screen as the root, with nothing to go back to
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
        />
        <Text style={[styles.toolbarTitle, { color: theme.textPrimary }]}>Data Management</Text>
      </View>

      <ScrollView
        testID="data-management-scroll"
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        showsVerticalScrollIndicator={false}>
        <SettingsSection
          title="Backup & Restore"
          footer="Full backups include your sleep sessions, sleep settings and appearance. A backup of your current data is created automatically before every import.">
          <ActionRow
            testID="export-full-backup"
            title="Export Full Backup"
            subtitle="Save a lossless JSON backup of all critical app data."
            symbol="archivebox.fill"
            loading={isPreparingBackup}
            disabled={isBusy}
            onPress={onExportBackup}
            separator
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
        </SettingsSection>

        <SettingsSection
          title="Sorting"
          footer="Controls the order of sessions in the export based on their start time.">
          <MenuPicker
            label="Sort order"
            title="Sort order"
            value={sortDirection}
            options={['ascending', 'descending'] as const}
            labels={SORT_LABELS}
            onChange={setSortDirection}
            testID="export-sort-order"
          />
        </SettingsSection>

        <SettingsSection
          title="Date & Time"
          footer="Choose how timestamps are exported. UTC is portable across tools. Local uses your device's time zone. All timestamps use ISO 8601.">
          <MenuPicker
            label="Time zone"
            title="Time zone"
            value={timeZone}
            options={['utc', 'local'] as const}
            labels={TIME_ZONE_LABELS}
            onChange={setTimeZone}
            testID="export-time-zone"
          />
        </SettingsSection>

        <SettingsSection
          title="Session Export Format"
          footer="CSV is ideal for spreadsheets and data tools. Markdown is structured for AI agents and analysis and includes a summary, sleep stats, and a detailed session log.">
          <MenuPicker
            label="Export format"
            title="Export format"
            value={format}
            options={['csv', 'markdown'] as const}
            labels={FORMAT_LABELS}
            onChange={setFormat}
            testID="export-format"
          />
        </SettingsSection>

        <PressableFeedback
          testID="export-sessions"
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy, busy: isGenerating }}
          disabled={isBusy}
          onPress={onExportSessions}
          rippleColor={ON_FILL_RIPPLE}
          style={[styles.exportButton, { backgroundColor: theme.actionPrimary }, isBusy && !isGenerating && styles.dimmed]}>
          {isGenerating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <NativeSymbol name="square.and.arrow.up" size={18} tintColor="#ffffff" />
          )}
          <Text style={styles.exportButtonText}>
            {format === 'csv' ? 'Export Sessions as CSV' : 'Export Sessions as Markdown'}
          </Text>
        </PressableFeedback>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  toolbarTitle: { fontSize: 22, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 22 },
  actionRow: { gap: 12 },
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
