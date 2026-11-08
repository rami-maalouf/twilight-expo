// ports: Views/BlockedProfileView.swift (the "Sleep Settings" form, sleep-core
// sections only): support row, sleep goal with native time pickers + goal
// pill, app appearance (display mode + theme color), notifications (wind-down
// toggle, routine link, live activity toggle), community links.
// NFC & QR / apple health / data sections are out of scope per the spec.
import { InlineDateTimePicker } from '@/components/common/InlineDateTimePicker';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { DemoDataStepContent } from '@/components/demo/DemoDataStepContent';
import { LiveActivitySettingRows } from '@/components/settings/LiveActivitySettingRows';
import { MenuPicker } from '@/components/settings/MenuPicker';
import { demoDataManager } from '@/data/app-db';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Screen } from '@/components/common/Screen';
import type { ThemeMode, ThemePalette } from '@/domain/models';
import { appSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useFixedColor, useTheme, useThemeControls } from '@/theme/ThemeProvider';

const INDIGO = '#5856d6';
const ORANGE = '#ff9500';
const RED = '#ff3b30';

const MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Sunset',
  dark: 'Night Sky',
};
const PALETTE_LABELS: Record<ThemePalette, string> = {
  twilight: 'Twilight (Blue/Teal)',
  amethyst: 'Amethyst (Purple/Blue)',
};

function goalLabel(sleepMinutes: number, wakeMinutes: number): string {
  let diff = wakeMinutes - sleepMinutes;
  if (diff < 0) diff += 24 * 60;
  const hours = Math.trunc(diff / 60);
  const minutes = diff % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function minutesToDate(minutes: number): Date {
  return new Date(2000, 0, 1, Math.trunc(minutes / 60), minutes % 60);
}

function Row({
  children,
  rowBg,
  style,
}: {
  children: React.ReactNode;
  rowBg: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, { backgroundColor: rowBg }, style]}>{children}</View>;
}

function SectionHeader({ title, color }: { title: string; color: string }) {
  return <Text style={[styles.sectionHeader, { color }]}>{title.toUpperCase()}</Text>;
}

export default function SettingsScreen() {
  const theme = useTheme();
  const fixed = useFixedColor();
  const { mode, palette, setMode, setPalette } = useThemeControls();
  const optimalSleepMinutes = useSettings((s) => s.optimalSleepMinutes);
  const optimalWakeMinutes = useSettings((s) => s.optimalWakeMinutes);
  const windDownEnabled = useSettings((s) => s.windDownReminderEnabled);
  const setSetting = useSettings((s) => s.setSetting);
  const refreshSettings = useSettings((s) => s.refresh);
  const isDemoDataActive = useSettings((s) => s.isDemoDataActive);
  const [showingDemoDataOnboarding, setShowingDemoDataOnboarding] = useState(false);
  const [isImportingDemoData, setIsImportingDemoData] = useState(false);
  const [isExitingDemoData, setIsExitingDemoData] = useState(false);

  const isLight = theme.name === 'sunset';
  const rowBg = isLight ? 'rgba(255, 255, 255, 0.75)' : '#1c1c1e';
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
      Alert.alert("Couldn't Load Demo Data", 'An unknown error occurred. Please try again.');
    } finally {
      setIsImportingDemoData(false);
    }
  };

  const exitDemoFromSettings = () => {
    if (isExitingDemoData) return;
    Alert.alert(
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
              Alert.alert("Couldn't Exit Demo", 'An unknown error occurred. Please try again.');
            } finally {
              setIsExitingDemoData(false);
            }
          },
        },
      ]
    );
  };

  const linkRow = (
    icon: SymbolViewProps['name'],
    label: string,
    url: string,
    isLast: boolean
  ) => (
    <Pressable key={label} onPress={() => Linking.openURL(url)}>
      <Row rowBg={rowBg} style={!isLast && styles.rowWithSeparator}>
        <NativeSymbol name={icon} size={22} tintColor={theme.textPrimary} />
        <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
        <View style={styles.spacer} />
        <NativeSymbol name="arrow.up.right" size={12} tintColor="#98989f" />
      </Row>
    </Pressable>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Sleep Settings</Text>

        {/* support row */}
        <View style={styles.section}>
          <Row rowBg={rowBg}>
            <NativeSymbol name="heart.fill" size={20} tintColor={fixed(RED)} />
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
              Indie-built. Community-supported
            </Text>
            <View style={styles.spacer} />
            <NativeSymbol name="chevron.right" size={13} tintColor="#98989f" />
          </Row>
        </View>

        {/* sleep goal */}
        <View style={styles.section}>
          <SectionHeader title="Sleep Goal" color={theme.textSecondary} />
          <Row rowBg={rowBg} style={styles.goalRow}>
            <View style={styles.goalColumns}>
              <View style={styles.goalColumn}>
                <View style={styles.goalLabelRow}>
                  <NativeSymbol name="moon.fill" size={15} tintColor={fixed(INDIGO)} />
                  <Text style={[styles.goalLabel, { color: fixed(INDIGO) }]}>Bedtime</Text>
                </View>
                <InlineDateTimePicker
                  value={minutesToDate(optimalSleepMinutes)}
                  mode="time"
                  themeVariant={pickerVariant}
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
                  value={minutesToDate(optimalWakeMinutes)}
                  mode="time"
                  themeVariant={pickerVariant}
                  onValueChange={(date) => {
                    setSetting('optimalWakeMinutes', date.getHours() * 60 + date.getMinutes());
                  }}
                  style={styles.timePicker}
                />
              </View>
            </View>
            <View style={styles.goalPill}>
              <NativeSymbol name="clock" size={14} tintColor="#ffffff" />
              <Text style={styles.goalPillText}>
                Goal: {goalLabel(optimalSleepMinutes, optimalWakeMinutes)}
              </Text>
            </View>
          </Row>
        </View>

        {/* app appearance */}
        <View style={styles.section}>
          <SectionHeader title="App Appearance" color={theme.textSecondary} />
          <MenuPicker
            label="Display Mode"
            value={mode}
            options={['system', 'light', 'dark'] as const}
            labels={MODE_LABELS}
            title="Display Mode"
            onChange={setMode}
            rowBg={rowBg}
            style={styles.rowWithSeparator}
            testID="display-mode"
          />
          <MenuPicker
            label="Theme Color"
            value={palette}
            options={['twilight', 'amethyst'] as const}
            labels={PALETTE_LABELS}
            title="Theme Color"
            onChange={setPalette}
            rowBg={rowBg}
            testID="theme-color"
          />
        </View>

        {/* notifications */}
        <View style={styles.section}>
          <SectionHeader title="Notifications" color={theme.textSecondary} />
          <Row rowBg={rowBg} style={[styles.toggleRow, styles.rowWithSeparator]}>
            <View style={styles.toggleTexts}>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
                Wind-Down Reminder
              </Text>
              <Text style={styles.rowDescription}>
                Get reminded 3 hours before bedtime of optimal sleep habits like dimming the
                screen, using lamps, and eating and drinking
              </Text>
            </View>
            <Switch
              value={windDownEnabled}
              onValueChange={(v) => setSetting('windDownReminderEnabled', v)}
              trackColor={{ true: theme.actionPrimary }}
            />
          </Row>
          <Pressable onPress={() => router.push('/sleep-tips')} testID="sleep-tips-link">
            <Row rowBg={rowBg} style={styles.rowWithSeparator}>
              <Text style={[styles.routineLink, { color: theme.accent }]}>
                View wind-down routine
              </Text>
              <NativeSymbol name="arrow.right" size={12} tintColor={theme.accent} />
            </Row>
          </Pressable>
          <LiveActivitySettingRows rowBg={rowBg} />
        </View>

        {/* community */}
        <View style={styles.section}>
          <SectionHeader title="Community" color={theme.textSecondary} />
          {linkRow('bubble.left.and.bubble.right.fill', 'Join our Discord', 'https://discord.gg/9tj7J5MESv', false)}
          {linkRow('link', 'Follow us on LinkedIn', 'https://www.linkedin.com/company/orbitlabsdotstudio', false)}
          {linkRow('camera.fill', 'Follow us on Instagram', 'https://www.instagram.com/orbitlabs.studio', true)}
          <Text style={[styles.sectionFooter, { color: theme.textSecondary }]}>
            Would love to hear your feedback & suggestions!
          </Text>
        </View>

        {/* ports the swift "Demo Data" section, shown only while the sample is active */}
        {isDemoDataActive ? (
          <View style={styles.section}>
            <SectionHeader title="Demo Data" color={theme.textSecondary} />
            <Row rowBg={rowBg} style={[styles.demoDataRow, styles.rowWithSeparator]}>
              <Text style={[styles.demoDataBody, { color: theme.textPrimary }]}>
                This sample was loaded from onboarding so you could explore the app with real sleep
                patterns.
              </Text>
              <Text style={[styles.demoDataCaption, { color: theme.textSecondary }]}>
                The dates are shifted for privacy. Exiting the sample removes the imported history
                and restores the sleep data you had before demo mode.
              </Text>
            </Row>
            <Pressable
              testID="exit-demo-data"
              disabled={isExitingDemoData}
              onPress={exitDemoFromSettings}>
              <Row rowBg={rowBg}>
                <Text style={[styles.rowLabel, { color: fixed(RED) }]}>
                  Exit Demo and Continue in App
                </Text>
              </Row>
            </Pressable>
          </View>
        ) : (
          // port addition: release builds hide Development, so sample data stays reachable here
          <View style={styles.section}>
            <SectionHeader title="Sample Data" color={theme.textSecondary} />
            <Pressable
              testID="load-sample-data"
              onPress={() => setShowingDemoDataOnboarding(true)}>
              <Row rowBg={rowBg}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
                  Load Sample Sleep History
                </Text>
              </Row>
            </Pressable>
            <Text style={[styles.sectionFooter, { color: theme.textSecondary }]}>
              Optional 100-night history for exploring charts. Your real logs stay separate.
            </Text>
          </View>
        )}

        {__DEV__ && (
          <View style={styles.section}>
            <SectionHeader title="Development" color={theme.textSecondary} />
            <Pressable
              testID="open-demo-onboarding"
              onPress={() => setShowingDemoDataOnboarding(true)}>
              <Row rowBg={rowBg} style={styles.rowWithSeparator}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
                  Open Onboarding Demo Data
                </Text>
              </Row>
            </Pressable>
            <Pressable
              testID="restart-onboarding"
              onPress={() => {
                setSetting('isOnboarded', false);
                router.push('/onboarding');
              }}>
              <Row rowBg={rowBg} style={styles.rowWithSeparator}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
                  Restart Onboarding
                </Text>
              </Row>
            </Pressable>
            <Pressable
              testID="show-scheduled"
              onPress={async () => {
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                Alert.alert(
                  `${scheduled.length} scheduled`,
                  scheduled
                    .map((n) => `${n.identifier}: ${JSON.stringify(n.trigger)}`)
                    .join('\n') || 'none'
                );
              }}>
              <Row rowBg={rowBg}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
                  Show Scheduled Notifications
                </Text>
              </Row>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showingDemoDataOnboarding}
        animationType="slide"
        presentationStyle="pageSheet"
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
  content: { paddingTop: 70, paddingHorizontal: 16, paddingBottom: 120, gap: 22 },
  title: { fontSize: 34, fontWeight: '700' },
  section: { gap: 0 },
  sectionHeader: { fontSize: 13, marginBottom: 6, marginLeft: 16 },
  sectionFooter: { fontSize: 13, marginTop: 6, marginLeft: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowWithSeparator: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(84, 84, 88, 0.6)',
  },
  rowLabel: { fontSize: 17 },
  rowDescription: { fontSize: 12, color: '#98989f', marginTop: 2 },
  spacer: { flex: 1 },
  goalRow: { flexDirection: 'column', alignItems: 'stretch', gap: 16, paddingVertical: 16 },
  goalColumns: { flexDirection: 'row', justifyContent: 'space-between' },
  goalColumn: { gap: 8, alignItems: 'flex-start' },
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
  toggleRow: { alignItems: 'center' },
  toggleTexts: { flex: 1 },
  demoDataRow: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  demoDataBody: { fontSize: 15 },
  demoDataCaption: { fontSize: 12 },
  routineLink: { fontSize: 15 },
});
