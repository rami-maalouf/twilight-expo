// ports: Views/Onboarding/WelcomeStepView.swift (step 1; android adds the
// health connect step as step 2 when health connect is available, the nfc
// step is out of scope per the spec)
import { router } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';

import { NativeSymbol as SymbolView } from '@/components/common/NativeSymbol';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FadeInSlide } from '@/components/common/FadeInSlide';
import { GlowingMoonView } from '@/components/common/GlowingMoonView';
import { Screen } from '@/components/common/Screen';
import { isConnectionVisible } from '@/domain/health/connection-state';
import { showsHealthConnectOnboarding } from '@/services/health-connect/app-health-sync';
import { useHealthConnection } from '@/services/health-connect/use-health-connection';
import { useFixedColor, useTheme } from '@/theme/ThemeProvider';

const TRUST_CARDS: { icon: SymbolViewProps['name']; title: string; color: string }[] = [
  { icon: 'dollarsign', title: 'No subscription', color: '#4cd964' },
  { icon: 'mic.slash.fill', title: 'No recording', color: '#af52de' },
  { icon: 'iphone.slash', title: '100% offline', color: '#5ac8fa' },
  { icon: 'lock.fill', title: 'On-device only', color: '#ff5a5f' },
];

// swift's fourth card, where health connect can sync
const HEALTH_CONNECT_CARD: (typeof TRUST_CARDS)[number] = {
  icon: 'heart.text.square.fill',
  title: 'Health Connect sync',
  color: '#ff5a5f',
};

export default function WelcomeStep() {
  const theme = useTheme();
  const fixed = useFixedColor();
  const { state: healthState } = useHealthConnection();
  const cards =
    isConnectionVisible(healthState) && healthState !== 'demo'
      ? [...TRUST_CARDS.slice(0, 3), HEALTH_CONNECT_CARD]
      : TRUST_CARDS;

  return (
    <Screen starCount={45}>
      <View style={styles.container}>
        <View style={styles.spacer} />
        <FadeInSlide delay={0}>
          <View style={styles.moonWrap}>
            <GlowingMoonView accentColor={theme.accent} size={100} />
          </View>
        </FadeInSlide>
        <FadeInSlide delay={0.3}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            A calmer way to track sleep
          </Text>
        </FadeInSlide>
        <FadeInSlide delay={0.5}>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Most sleep apps track everything. Twilight tracks only what you need and can control:
            your sleep and wake times. That&apos;s it.
          </Text>
        </FadeInSlide>
        <FadeInSlide delay={0.7} style={styles.cards}>
          <View style={styles.cardRow}>
            {cards.slice(0, 2).map((card) => (
              <TrustCard key={card.title} card={card} theme={theme} fixed={fixed} />
            ))}
          </View>
          <View style={styles.cardRow}>
            {cards.slice(2).map((card) => (
              <TrustCard key={card.title} card={card} theme={theme} fixed={fixed} />
            ))}
          </View>
        </FadeInSlide>
        <View style={styles.spacer} />
        <FadeInSlide delay={1.1}>
          <Pressable
            testID="get-started"
            onPress={async () =>
              router.push((await showsHealthConnectOnboarding()) ? '/onboarding/health-connect' : '/onboarding/schedule')
            }
            style={[styles.primaryButton, { backgroundColor: theme.actionPrimary }]}>
            <Text style={styles.primaryLabel}>Get Started</Text>
          </Pressable>
        </FadeInSlide>
      </View>
    </Screen>
  );
}

function TrustCard({
  card,
  theme,
  fixed,
}: {
  card: (typeof TRUST_CARDS)[number];
  theme: ReturnType<typeof useTheme>;
  fixed: (c: string) => string;
}) {
  return (
    <View style={[styles.trustCard, { backgroundColor: theme.cardBackground, borderColor: `${fixed(card.color)}44` }]}>
      <View style={[styles.trustIconGlow, { backgroundColor: `${fixed(card.color)}4d` }]}>
        <SymbolView name={card.icon} size={16} weight="semibold" tintColor={fixed(card.color)} />
      </View>
      <Text style={[styles.trustTitle, { color: theme.textPrimary }]}>{card.title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 28, gap: 24 },
  spacer: { flex: 1 },
  moonWrap: { alignItems: 'center' },
  title: { fontSize: 34, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 17, textAlign: 'center', paddingHorizontal: 16 },
  cards: { gap: 12, paddingHorizontal: 4 },
  cardRow: { flexDirection: 'row', gap: 10 },
  trustCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  trustIconGlow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustTitle: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  primaryButton: {
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: 17, fontWeight: '600', color: '#ffffff' },
});
