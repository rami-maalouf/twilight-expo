// ports: Views/BlockedProfileView.swift (the "Sleep Settings" form, sleep-core
// sections only): support row, the active-session lock banner, sleep goal
// with native time pickers + goal pill, app appearance (display mode + theme
// color), notifications (wind-down toggle, routine link, live activity
// toggle), community links, demo data and development.
// NFC & QR / apple health / data sections are out of scope per the spec.
import { InlineDateTimePicker } from '@/components/common/InlineDateTimePicker';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { showAlert } from '@/components/common/app-alert';
import { DemoDataStepContent } from '@/components/demo/DemoDataStepContent';
import { LiveActivitySettingRows } from '@/components/settings/LiveActivitySettingRows';
import { MenuPicker } from '@/components/settings/MenuPicker';
import { SessionLockBanner } from '@/components/settings/SessionLockBanner';
import { RowLabel, SettingsRow, SettingsSection } from '@/components/settings/SettingsList';
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow';
import { demoDataManager } from '@/data/app-db';
import * as Notifications from 'expo-notifications';
import { router, useScrollToTop } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Linking, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/common/Screen';
import type { ThemeMode, ThemePalette } from '@/domain/models';
import { appSleepStore, useSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useFixedColor, useTheme, useThemeControls } from '@/theme/ThemeProvider';
import { tabContentTop } from '@/theme/layout';

const INDIGO = '#5856d6';
const ORANGE = '#ff9500';
const RED = '#ff3b30';
const CHEVRON_GRAY = '#98989f';

// ThemeManager.ThemeMode raw values and ColorPalette.displayName
const MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Sunset',
  dark: 'Night Sky',
};
const PALETTE_LABELS: Record<ThemePalette, string> = {
  twilight: 'Twilight (Blue/Teal)',
  amethyst: 'Amethyst (Purple/Blue)',
};

// BlockedProfileView.calculateDuration: "8 hr" / "8 hr 30 min"
export function goalLabel(sleepMinutes: number, wakeMinutes: number): string {
  let diff = wakeMinutes - sleepMinutes;
  if (diff < 0) diff += 24 * 60;
  const hours = Math.trunc(diff / 60);
  const minutes = diff % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function minutesToDate(minutes: number): Date {
  return new Date(2000, 0, 1, Math.trunc(minutes / 60), minutes % 60);
}

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  useScrollToTop(scrollRef);
  const fixed = useFixedColor();
  const { mode, palette, setMode, setPalette } = useThemeControls();
  const optimalSleepMinutes = useSettings((s) => s.optimalSleepMinutes);
  const optimalWakeMinutes = useSettings((s) => s.optimalWakeMinutes);
  const windDownEnabled = useSettings((s) => s.windDownReminderEnabled);
  const setSetting = useSettings((s) => s.setSetting);
  const refreshSettings = useSettings((s) => s.refresh);
  const isDemoDataActive = useSettings((s) => s.isDemoDataActive);
  // swift isBlocking: the toggles lock while a session is active
  const isSleeping = useSleepStore((s) => s.activeSession != null);
  const [showingDemoDataOnboarding, setShowingDemoDataOnboarding] = useState(false);
  const [isImportingDemoData, setIsImportingDemoData] = useState(false);
  const [isExitingDemoData, setIsExitingDemoData] = useState(false);

  const isLight = theme.name === 'sunset';
  const pickerVariant = isLight ? ('light' as const) : ('dark' as const);

  const importDemoFromSettings = () => {
    if (isImportingDemoData) return;
    setIsImportingDemoData(true);
    try {
      demoDataManager.importDemoData();
      refreshSettings();
      appSleepStore.getState().refresh();
      setShowingDemoDataOnboarding(false);
    } catch {
      showAlert("Couldn't Load Demo Data", 'An unknown error occurred. Please try again.');
    } finally {
      setIsImportingDemoData(false);
    }
  };

  const exitDemoFromSettings = () => {
    if (isExitingDemoData) return;
    showAlert(
      'Remove Demo Data',
      'This deletes the imported sample history and restores the sleep data and profile you were using before demo mode.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit Demo',
          style: 'destructive',
          onPress: () => {
            setIsExitingDemoData(true);
            try {
              demoDataManager.exitDemoData();
              refreshSettings();
              appSleepStore.getState().refresh();
            } catch {
              showAlert("Couldn't Exit Demo", 'An unknown error occurred. Please try again.');
            } finally {
              setIsExitingDemoData(false);
            }
          },
        },
      ]
    );
  };

  const linkRow = (icon: SymbolViewProps['name'], label: string, url: string, isLast: boolean) => (
    <SettingsRow
      key={label}
      accessibilityRole="link"
      accessibilityLabel={label}
      separator={!isLast}
      onPress={() => {
        Linking.openURL(url).catch(() => {});
      }}>
      <NativeSymbol name={icon} size={22} tintColor={theme.textPrimary} />
      <RowLabel color={theme.textPrimary}>{label}</RowLabel>
      <NativeSymbol name="arrow.up.right" size={12} tintColor={CHEVRON_GRAY} />
    </SettingsRow>
  );

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: tabContentTop(insets.top) }]}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
          Sleep Settings
        </Text>

        {/* support row (visual only: the tip jar it opened is out of scope) */}
        <SettingsSection>
          <SettingsRow>
            <NativeSymbol name="heart.fill" size={20} tintColor={fixed(RED)} />
            <RowLabel color={theme.textPrimary}>Indie-built. Community-supported</RowLabel>
            <NativeSymbol name="chevron.right" size={13} tintColor={CHEVRON_GRAY} />
          </SettingsRow>
        </SettingsSection>

        <SessionLockBanner />

        <SettingsSection title="Sleep Goal">
          <View style={styles.goalBody}>
            <View style={styles.goalColumns}>
              <View style={styles.goalColumn}>
                <View style={styles.goalLabelRow}>
                  <NativeSymbol name="moon.fill" size={15} tintColor={fixed(INDIGO)} />
                  <Text style={[styles.goalLabel, { color: fixed(INDIGO) }]}>Bedtime</Text>
                </View>
                <InlineDateTimePicker
                  title="Bedtime"
                  value={minutesToDate(optimalSleepMinutes)}
                  mode="time"
                  themeVariant={pickerVariant}
                  accentColor={theme.accent}
                  onValueChange={(date) => {
                    setSetting('optimalSleepMinutes', date.getHours() * 60 + date.getMinutes());
                  }}
                  style={styles.timePicker}
                />
              </View>
              <View style={styles.goalColumn}>
                <View style={styles.goalLabelRow}>
                  <NativeSymbol name="sun.max.fill" size={15} tintColor={fixed(ORANGE)} />
                  <Text style={[styles.goalLabel, { color: fixed(ORANGE) }]}>Wake Up</Text>
                </View>
                <InlineDateTimePicker
                  title="Wake Up"
                  value={minutesToDate(optimalWakeMinutes)}
                  mode="time"
                  themeVariant={pickerVariant}
                  accentColor={theme.accent}
                  onValueChange={(date) => {
                    setSetting('optimalWakeMinutes', date.getHours() * 60 + date.getMinutes());
                  }}
                  style={styles.timePicker}
                />
              </View>
            </View>
            <View style={styles.goalPill}>
              <NativeSymbol name="clock" size={14} tintColor="#ffffff" />
              <Text style={styles.goalPillText}>Goal: {goalLabel(optimalSleepMinutes, optimalWakeMinutes)}</Text>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title="App Appearance">
          <MenuPicker
            label="Display Mode"
            value={mode}
            options={['system', 'light', 'dark'] as const}
            labels={MODE_LABELS}
            title="Display Mode"
            onChange={setMode}
            separator
            testID="display-mode"
          />
          <MenuPicker
            label="Theme Color"
            value={palette}
            options={['twilight', 'amethyst'] as const}
            labels={PALETTE_LABELS}
            title="Theme Color"
            onChange={setPalette}
            testID="theme-color"
          />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingsSwitchRow
            testID="wind-down-toggle"
            title="Wind-Down Reminder"
            description="Get reminded 3 hours before bedtime of optimal sleep habits like dimming the screen, using lamps, and eating and drinking"
            value={windDownEnabled}
            disabled={isSleeping}
            separator
            onValueChange={(value) => setSetting('windDownReminderEnabled', value)}
          />
          <SettingsRow testID="sleep-tips-link" separator onPress={() => router.push('/sleep-tips')}>
            <Text style={[styles.routineLink, { color: theme.accent }]}>View wind-down routine</Text>
            <NativeSymbol name="arrow.right" size={12} tintColor={theme.accent} />
          </SettingsRow>
          <LiveActivitySettingRows />
        </SettingsSection>

        <SettingsSection title="Community" footer="Would love to hear your feedback & suggestions!">
          {linkRow('bubble.left.and.bubble.right.fill', 'Join our Discord', 'https://discord.gg/9tj7J5MESv', false)}
          {linkRow('link', 'Follow us on LinkedIn', 'https://www.linkedin.com/company/orbitlabsdotstudio', false)}
          {linkRow('camera.fill', 'Follow us on Instagram', 'https://www.instagram.com/orbitlabs.studio', true)}
        </SettingsSection>

        {/* ports the swift "Demo Data" section, shown only while the sample is active */}
        {isDemoDataActive ? (
          <SettingsSection title="Demo Data">
            <SettingsRow separator style={styles.demoDataRow}>
              <Text style={[styles.demoDataBody, { color: theme.textPrimary }]}>
                This sample was loaded from onboarding so you could explore the app with real sleep patterns.
              </Text>
              <Text style={[styles.demoDataCaption, { color: theme.textSecondary }]}>
                The dates are shifted for privacy. Exiting the sample removes the imported history and restores the
                sleep data you had before demo mode.
              </Text>
            </SettingsRow>
            <SettingsRow testID="exit-demo-data" disabled={isExitingDemoData} onPress={exitDemoFromSettings}>
              <RowLabel color={fixed(RED)}>Exit Demo and Continue in App</RowLabel>
            </SettingsRow>
          </SettingsSection>
        ) : (
          // port addition: release builds hide Development, so sample data stays reachable here
          <SettingsSection
            title="Sample Data"
            footer="Optional 100-night history for exploring charts. Your real logs stay separate.">
            <SettingsRow testID="load-sample-data" onPress={() => setShowingDemoDataOnboarding(true)}>
              <RowLabel color={theme.textPrimary}>Load Sample Sleep History</RowLabel>
            </SettingsRow>
          </SettingsSection>
        )}

        {__DEV__ && (
          <SettingsSection title="Development">
            <SettingsRow testID="open-demo-onboarding" separator onPress={() => setShowingDemoDataOnboarding(true)}>
              <RowLabel color={theme.textPrimary}>Open Onboarding Demo Data</RowLabel>
            </SettingsRow>
            <SettingsRow
              testID="restart-onboarding"
              separator
              onPress={() => {
                setSetting('isOnboarded', false);
                router.push('/onboarding');
              }}>
              <RowLabel color={fixed(RED)}>Restart Onboarding</RowLabel>
            </SettingsRow>
            <SettingsRow
              testID="reset-sleep-data"
              separator
              onPress={() => appSleepStore.getState().resetAllSessions()}>
              <RowLabel color={fixed(RED)}>Reset Sleep Data</RowLabel>
            </SettingsRow>
            {/* port addition: inspect the scheduled wind-down reminder */}
            <SettingsRow
              testID="show-scheduled"
              onPress={async () => {
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                showAlert(
                  `${scheduled.length} scheduled`,
                  scheduled.map((n) => `${n.identifier}: ${JSON.stringify(n.trigger)}`).join('\n') || 'none'
                );
              }}>
              <RowLabel color={theme.textPrimary}>Show Scheduled Notifications</RowLabel>
            </SettingsRow>
          </SettingsSection>
        )}
      </ScrollView>

      <Modal
        visible={showingDemoDataOnboarding}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowingDemoDataOnboarding(false)}>
        <Screen starCount={35}>
          <DemoDataStepContent
            isImporting={isImportingDemoData}
            onExplore={importDemoFromSettings}
            onSkip={() => setShowingDemoDataOnboarding(false)}
          />
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 22 },
  title: { fontSize: 34, fontWeight: '700' },
  goalBody: { gap: 16, paddingHorizontal: 16, paddingVertical: 16 },
  goalColumns: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  goalColumn: { gap: 8, alignItems: 'flex-start', flexShrink: 1 },
  goalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalLabel: { fontSize: 17, fontWeight: '600' },
  timePicker: Platform.OS === 'ios' ? { marginLeft: -8 } : {},
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(38, 38, 38, 1)',
  },
  goalPillText: { fontSize: 15, fontWeight: '500', color: '#ffffff' },
  // swift: .font(.subheadline) "View wind-down routine"
  routineLink: { fontSize: 15, flexShrink: 1 },
  demoDataRow: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  demoDataBody: { fontSize: 15 },
  demoDataCaption: { fontSize: 12 },
});
