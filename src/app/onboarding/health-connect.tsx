// ports: Views/Onboarding/AppleHealthOnboardingStepView.swift, adapted to
// health connect (docs/health-connect.md 5.2). android only: welcome routes
// here only when health connect is visible, so ios never reaches this step.
import { Redirect, router } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FadeInSlide } from '@/components/common/FadeInSlide';
import { NativeSymbol } from '@/components/common/NativeSymbol';
import { Screen } from '@/components/common/Screen';
import { HcButton, onToneColor, toneColor, withAlpha } from '@/components/health-connect/parts';
import {
  CONNECTION_TONE,
  ONBOARDING_BENEFITS,
  onboardingCopy,
  onboardingPrimaryAction,
  onboardingState,
} from '@/domain/health/connection-state';
import {
  healthSyncEngine,
  openHealthConnect,
  openHealthConnectUpdate,
} from '@/services/health-connect/app-health-sync';
import { useHealthSyncState } from '@/services/health-connect/health-connect-state';
import { useHealthConnection } from '@/services/health-connect/use-health-connection';
import { useTheme } from '@/theme/ThemeProvider';

const BENEFIT_ICONS: Record<(typeof ONBOARDING_BENEFITS)[number]['id'], SymbolViewProps['name']> = {
  import: 'square.and.arrow.down.fill',
  autosync: 'arrow.triangle.2.circlepath',
  privacy: 'lock.fill',
};

export default function HealthConnectStep() {
  const theme = useTheme();
  const connection = useHealthConnection();
  const lastErrorMessage = useHealthSyncState((s) => s.lastError?.message ?? null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [actionHeight, setActionHeight] = useState(0);

  if (connection.state === 'hidden') return <Redirect href="/onboarding/schedule" />;

  const state = onboardingState(connection.state);
  const tone = state === 'unavailable' ? 'muted' : CONNECTION_TONE[state];
  const accent = toneColor(theme, tone);
  const copy = onboardingCopy(state, { isConnecting, lastErrorMessage });
  const action = onboardingPrimaryAction(state);
  const toSchedule = () => router.push('/onboarding/schedule');

  const onPrimary = async () => {
    switch (action) {
      case 'enable':
        if (isConnecting) return;
        setIsConnecting(true);
        try {
          // request, enable on any grant, then the first full import (swift enableSync)
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
        toSchedule();
    }
  };

  // connected and unavailable continue like swift's NavigationLink; enable
  // uses the action color with a heart; denied and update use the warning fill
  const filled = action === 'continue' ? (state === 'connected' ? theme.success : theme.actionPrimary) : accent;
  const label = action === 'continue' ? (state === 'connected' ? '#000000' : '#ffffff') : onToneColor(tone);

  return (
    <Screen starCount={30}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: actionHeight + 24 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.spacer} />
        <FadeInSlide delay={0} slideOffset={20}>
          <View
            testID={`hc-onboarding-${state}`}
            style={[styles.hero, { backgroundColor: withAlpha(accent, 0.16) }]}>
            <NativeSymbol name="heart.text.square.fill" size={44} weight="semibold" tintColor={accent} />
          </View>
        </FadeInSlide>
        <FadeInSlide delay={0.1} slideOffset={20}>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{copy.title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{copy.subtitle}</Text>
          </View>
        </FadeInSlide>
        {copy.benefitsTitle ? (
          <FadeInSlide delay={0.22} slideOffset={24}>
            <View
              style={[
                styles.benefits,
                { backgroundColor: theme.cardBackground, borderColor: withAlpha(accent, 0.22) },
              ]}>
              <Text style={[styles.benefitsTitle, { color: theme.textPrimary }]}>{copy.benefitsTitle}</Text>
              {ONBOARDING_BENEFITS.map((benefit) => (
                <View key={benefit.id} style={styles.benefitRow}>
                  <View style={[styles.benefitIcon, { backgroundColor: withAlpha(accent, 0.16) }]}>
                    <NativeSymbol name={BENEFIT_ICONS[benefit.id]} size={16} weight="semibold" tintColor={accent} />
                  </View>
                  <Text style={[styles.benefitText, { color: theme.textPrimary }]}>{benefit.title}</Text>
                </View>
              ))}
            </View>
          </FadeInSlide>
        ) : null}
        {copy.statusNote ? (
          <FadeInSlide delay={0.3} slideOffset={24}>
            <View
              style={[
                styles.note,
                {
                  backgroundColor: withAlpha(theme.textPrimary, 0.05),
                  borderColor: withAlpha(theme.textPrimary, 0.08),
                },
              ]}>
              <NativeSymbol
                name={state === 'denied' ? 'gearshape.fill' : 'info.circle.fill'}
                size={16}
                tintColor={accent}
              />
              <Text style={[styles.noteText, { color: theme.textSecondary }]}>{copy.statusNote}</Text>
            </View>
          </FadeInSlide>
        ) : null}
        <View style={styles.spacer} />
      </ScrollView>

      <FadeInSlide delay={0.38} slideOffset={18} style={styles.actionArea}>
        <View onLayout={(event) => setActionHeight(event.nativeEvent.layout.height)} style={styles.actions}>
          <HcButton
            testID="hc-onboarding-primary"
            title={copy.primary}
            color={filled}
            labelColor={label}
            icon={action === 'enable' ? 'heart.fill' : undefined}
            loading={isConnecting}
            onPress={onPrimary}
          />
          {copy.showsSkip ? (
            <HcButton
              testID="hc-onboarding-skip"
              title="Continue without Health Connect"
              variant="text"
              color={theme.textSecondary}
              disabled={isConnecting}
              onPress={toSchedule}
            />
          ) : null}
        </View>
      </FadeInSlide>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 70, gap: 18 },
  spacer: { flexGrow: 1 },
  hero: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: 8, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 17, lineHeight: 23, textAlign: 'center' },
  benefits: { gap: 12, padding: 18, borderRadius: 22, borderWidth: 1 },
  benefitsTitle: { fontSize: 17, fontWeight: '600' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 15, lineHeight: 20 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderWidth: 1 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18 },
  actionArea: { position: 'absolute', left: 16, right: 16, bottom: 28 },
  actions: { gap: 8 },
});
