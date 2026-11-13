// ports: Views/AppleHealthSettingsView.swift, adapted to health connect
// (docs/health-connect.md 5.3). android only: on ios, web and devices without
// health connect the route redirects home, and nothing links to it.
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/components/common/app-alert';
import { BackButton } from '@/components/common/BackButton';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { Screen } from '@/components/common/Screen';
import {
  FactRow,
  FeatureRow,
  HcButton,
  HcCard,
  onToneColor,
  SectionHeader,
  StatusBadge,
  TIP_SYMBOL,
  TipCallout,
  toneColor,
  withAlpha,
} from '@/components/health-connect/parts';
import {
  CONNECTION_TONE,
  heldDeletionBody,
  heldDeletionTitle,
  heldRemovalPrompt,
  HERO_TITLE,
  heroSubtitle,
  lastSyncedLabel,
  SCREEN_STATUS_LABEL,
  screenPrimaryAction,
  screenPrimaryTitle,
  showsDisableAction,
  STATUS_SUMMARY,
  statusTips,
} from '@/domain/health/connection-state';
import {
  healthSyncEngine,
  openHealthConnect,
  openHealthConnectUpdate,
} from '@/services/health-connect/app-health-sync';
import { useHealthSyncState } from '@/services/health-connect/health-connect-state';
import { useHealthConnection } from '@/services/health-connect/use-health-connection';
import { useSleepStore } from '@/state/app-sleep-store';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';
import { DIVIDER_WIDTH } from '@/theme/divider';

const RED = '#ff3b30';
const ORANGE = '#ff9500';
const PINK = '#ff2d55';

function formatSyncTime(ms: number, sameDay: boolean): string {
  const date = new Date(ms);
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// wall clock for the "Last synced" line, re-read every 30 s and after each sync
function useClock(resetKey: unknown): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [resetKey]);
  return now;
}

export default function HealthConnectScreen() {
  const theme = useTheme();
  const fixed = useFixedColor();
  const insets = useSafeAreaInsets();
  const connection = useHealthConnection();
  const isSyncing = useHealthSyncState((s) => s.isSyncing);
  const lastError = useHealthSyncState((s) => s.lastError);
  const lastPullResult = useHealthSyncState((s) => s.lastPullResult);
  const lastSuccessAt = useHealthSyncState((s) => s.lastSuccessAt);
  const enabled = useHealthSyncState((s) => s.enabled);
  const held = useHealthSyncState((s) => s.heldRemoteDeletions);
  const hasAdoptedImports = useSleepStore((s) => s.sessions.some((session) => session.health?.adopted === true));
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const now = useClock(lastSuccessAt);

  const { state } = connection;
  if (state === 'hidden') return <Redirect href="/" />;

  const tone = CONNECTION_TONE[state];
  const accent = toneColor(theme, tone);
  const busy = isSyncing || isPulling;
  const primary = screenPrimaryAction(connection);
  const primaryTitle = screenPrimaryTitle(connection, { isConnecting, isSyncing: busy });
  const tips = statusTips(connection, { hasAdoptedImports });
  const syncedLabel = state === 'connected' && now != null ? lastSyncedLabel(lastSuccessAt, now, formatSyncTime) : null;
  // write-only access never pulls, so an older pull result would be stale
  const pullMessage = state === 'connected' && !connection.exportOnly ? lastPullResult?.message : null;
  const isLight = theme.name === 'sunset';

  const runPrimary = async () => {
    switch (primary) {
      case 'pull':
      case 'syncNow':
        if (busy) return;
        setIsPulling(true);
        try {
          await healthSyncEngine.sync(primary === 'pull' ? 'forceResync' : 'full');
        } finally {
          setIsPulling(false);
        }
        return;
      case 'enable':
        if (isConnecting) return;
        setIsConnecting(true);
        try {
          await healthSyncEngine.enableSync();
        } finally {
          setIsConnecting(false);
        }
        return;
      case 'openHealthConnect':
        await openHealthConnect();
        return;
      case 'update':
        await openHealthConnectUpdate();
        return;
      default:
        return;
    }
  };

  const confirmRemoveHeld = () => {
    const prompt = heldRemovalPrompt(held.length);
    showAlert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => healthSyncEngine.removeHeldRemoteDeletions() },
    ]);
  };

  return (
    <Screen starCount={34}>
      <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]}>
        <BackButton
          testID="health-connect-back"
          color={theme.textPrimary}
          // a deep link can open this screen as the root, with nothing to go back to
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
        />
        <Text style={[styles.toolbarTitle, { color: theme.textPrimary }]}>Health Connect</Text>
      </View>

      {state === 'loading' ? (
        <View style={styles.loading} />
      ) : (
        <>
          <ScrollView
            testID="health-connect-scroll"
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>
            {/* hero */}
            <HcCard glow={accent} testID={`health-connect-state-${state}`}>
              <View style={styles.heroRow}>
                <View style={[styles.heroIcon, { backgroundColor: withAlpha(accent, 0.18) }]}>
                  <NativeSymbol name="heart.text.square.fill" size={30} weight="semibold" tintColor={accent} />
                </View>
                <View style={styles.heroTexts}>
                  <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>{HERO_TITLE[state]}</Text>
                  <StatusBadge label={SCREEN_STATUS_LABEL[state]} color={accent} />
                </View>
              </View>
              <Text style={[styles.body, { color: theme.textSecondary }]}>{heroSubtitle(connection)}</Text>
              <View
                style={[
                  styles.privacyNote,
                  {
                    backgroundColor: withAlpha(theme.textPrimary, 0.05),
                    borderColor: withAlpha(theme.textPrimary, 0.08),
                  },
                ]}>
                <NativeSymbol name="lock.shield.fill" size={16} tintColor={withAlpha(theme.textPrimary, 0.8)} />
                <Text style={[styles.caption, styles.flex, { color: theme.textSecondary }]}>
                  Your sleep logs stay in Twilight whether or not you connect Health Connect. This screen only controls
                  syncing for completed nights.
                </Text>
              </View>
            </HcCard>

            {/* held remote deletions (2.6) */}
            {held.length > 0 && state !== 'demo' ? (
              <HcCard glow={fixed(ORANGE)} testID="health-connect-held">
                <SectionHeader
                  icon="trash.fill"
                  title={heldDeletionTitle(held.length)}
                  subtitle={heldDeletionBody(held.length)}
                  accent={fixed(ORANGE)}
                />
                <View style={styles.heldActions}>
                  <HcButton
                    testID="health-connect-keep-held"
                    title="Keep in Twilight"
                    variant="tonal"
                    color={theme.textPrimary}
                    onPress={() => healthSyncEngine.keepHeldRemoteDeletions()}
                  />
                  <HcButton
                    testID="health-connect-remove-held"
                    title="Remove from Twilight"
                    variant="text"
                    color={fixed(RED)}
                    onPress={confirmRemoveHeld}
                  />
                </View>
              </HcCard>
            ) : null}

            {state === 'demo' ? (
              <HcCard glow={theme.textSecondary}>
                <SectionHeader
                  icon="person.crop.circle.badge.questionmark"
                  title="Why sync is disabled"
                  subtitle="The onboarding sample is meant to show Twilight's charts, logs, and trends without mixing demo history into your real Health Connect record."
                  accent={accent}
                />
                <View style={styles.facts}>
                  <FactRow
                    accent={accent}
                    title="Dates are shifted for privacy"
                    subtitle="Only the sleep and wake timing patterns are carried forward."
                  />
                  <FactRow
                    accent={accent}
                    title="Nothing exports to Health Connect"
                    subtitle="This sample stays inside Twilight until you remove it."
                  />
                  <FactRow
                    accent={accent}
                    title="Your data comes back"
                    subtitle="Use Exit Demo in the Demo Data section of Settings to remove the sample and restore the sleep data you had before demo mode."
                  />
                </View>
              </HcCard>
            ) : (
              <>
                <HcCard glow={theme.actionPrimary}>
                  <SectionHeader
                    icon="sparkles.rectangle.stack.fill"
                    title="Why connect it"
                    subtitle="Make Health Connect feel like a natural extension of Twilight instead of another place you need to manage manually."
                    accent={accent}
                  />
                  <View style={styles.features}>
                    <FeatureRow
                      icon="square.and.arrow.down.fill"
                      color={theme.actionPrimary}
                      title="Import existing Health Connect sleep"
                      subtitle="When you connect or pull, Twilight imports past nights from Health Connect so your log can start complete."
                    />
                    <FeatureRow
                      icon="arrow.triangle.2.circlepath.circle.fill"
                      color={fixed(ORANGE)}
                      title="Save Twilight nights back to Health Connect"
                      subtitle="Nights you record in Twilight export to Health Connect when sync runs. Pull again to pick up newer nights from your watch or other apps."
                    />
                    <FeatureRow
                      icon="pencil.and.scribble"
                      color={fixed(PINK)}
                      title="Twilight-owned edits update Health Connect"
                      subtitle="Twilight-owned nights you edit or delete are updated in Health Connect when sync runs. Deleting an imported night removes it from Twilight only."
                    />
                  </View>
                </HcCard>

                <HcCard glow={fixed(RED)}>
                  <SectionHeader
                    icon="hand.raised.fill"
                    title="What Twilight can access"
                    subtitle="Only the Health Connect sleep data Twilight needs to import nights and write Twilight-owned ones back."
                    accent={accent}
                  />
                  <View style={styles.facts}>
                    <FactRow
                      accent={accent}
                      title="Reads sleep sessions from Health Connect"
                      subtitle="That is how Twilight imports past nights and, when you pull, newer sleep from your watch or other apps."
                    />
                    <FactRow
                      accent={accent}
                      title="Writes the nights you track or log in Twilight"
                      subtitle="Twilight exports completed nights it owns and can update or delete only those Health Connect entries."
                    />
                    <FactRow
                      accent={accent}
                      title="You stay in control"
                      subtitle="Turn syncing off here at any time without removing your Twilight logs. Health Connect manages the permissions themselves."
                    />
                  </View>
                </HcCard>
              </>
            )}

            {/* current status */}
            <HcCard glow={accent} testID="health-connect-status">
              <SectionHeader
                icon="waveform.path.ecg.text.page.fill"
                title="Current status"
                subtitle="This is the live state of Twilight's Health Connect connection right now."
                accent={accent}
              />
              <View style={styles.statusRow}>
                <Text style={[styles.statusLabel, { color: theme.textPrimary }]}>Status</Text>
                <StatusBadge label={SCREEN_STATUS_LABEL[state]} color={accent} />
              </View>
              <Text style={[styles.body, { color: theme.textSecondary }]}>{STATUS_SUMMARY[state]}</Text>
              {tips.map((tip) => (
                <TipCallout
                  key={tip.id}
                  testID={`health-connect-tip-${tip.id}`}
                  icon={TIP_SYMBOL[tip.icon]}
                  text={tip.text}
                  accent={accent}
                />
              ))}
              {pullMessage || syncedLabel ? (
                <View style={[styles.meta, { borderTopColor: withAlpha(theme.textPrimary, 0.1) }]}>
                  {pullMessage ? (
                    <View style={styles.metaRow} testID="health-connect-last-pull">
                      <NativeSymbol name="info.circle.fill" size={14} tintColor={theme.textSecondary} />
                      <Text style={[styles.caption, styles.flex, { color: theme.textSecondary }]}>{pullMessage}</Text>
                    </View>
                  ) : null}
                  {syncedLabel ? (
                    <View style={styles.metaRow} testID="health-connect-last-synced">
                      <NativeSymbol name="clock" size={14} tintColor={theme.textSecondary} />
                      <Text style={[styles.caption, styles.flex, { color: theme.textSecondary }]}>{syncedLabel}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </HcCard>

            {/* real errors only; informational pulls stay above (fixes swift defect 4) */}
            {lastError && state !== 'demo' ? (
              <HcCard glow={fixed(RED)} testID="health-connect-error">
                <View style={styles.sectionTitleRow}>
                  <NativeSymbol name="exclamationmark.triangle.fill" size={18} tintColor={fixed(RED)} />
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Something needs attention</Text>
                </View>
                <Text style={[styles.body, { color: theme.textSecondary }]}>{lastError.message}</Text>
              </HcCard>
            ) : null}

            {__DEV__ && state === 'connected' ? (
              <HcButton
                testID="health-connect-dev-invalidate-token"
                title="Invalidate Health Connect token (dev)"
                variant="text"
                color={theme.textSecondary}
                onPress={() => {
                  const done = healthSyncEngine.invalidateChangesTokenForTesting();
                  showAlert('Health Connect', done ? 'Token replaced. The next sync re-reads everything.' : 'No token yet.');
                }}
              />
            ) : null}
          </ScrollView>

          {primaryTitle || showsDisableAction(state, enabled) ? (
            // swift: the action area sits below the scroll view, not over it
            <LinearGradient
              colors={['rgba(0,0,0,0)', isLight ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.22)']}
              style={[styles.actionArea, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              {primaryTitle ? (
                <HcButton
                  testID="health-connect-primary"
                  title={primaryTitle}
                  color={accent}
                  labelColor={onToneColor(tone)}
                  icon={
                    primary === 'pull' || primary === 'syncNow'
                      ? 'arrow.clockwise'
                      : primary === 'enable'
                        ? 'heart.fill'
                        : primary === 'update'
                          ? 'arrow.down.circle.fill'
                          : 'arrow.up.forward.app'
                  }
                  loading={primary === 'pull' || primary === 'syncNow' ? busy : primary === 'enable' && isConnecting}
                  onPress={runPrimary}
                />
              ) : null}
              {showsDisableAction(state, enabled) ? (
                <HcButton
                  testID="health-connect-disable"
                  title="Turn off Health Connect sync"
                  variant="tonal"
                  color={theme.textPrimary}
                  icon="pause.circle.fill"
                  disabled={isConnecting}
                  onPress={() => void healthSyncEngine.disableSync()}
                />
              ) : null}
              {state === 'connected' ? (
                <HcButton
                  testID="health-connect-open"
                  title="Open Health Connect"
                  variant="text"
                  color={theme.accent}
                  icon="arrow.up.forward.app"
                  onPress={() => void openHealthConnect()}
                />
              ) : null}
            </LinearGradient>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  toolbarTitle: { fontSize: 22, fontWeight: '600' },
  loading: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 18 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  heroTexts: { flex: 1, gap: 10 },
  heroTitle: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
  flex: { flex: 1 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  heldActions: { gap: 4 },
  features: { gap: 12 },
  facts: { gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel: { fontSize: 15, fontWeight: '600' },
  meta: { gap: 8, paddingTop: 12, borderTopWidth: DIVIDER_WIDTH },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  actionArea: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
});
