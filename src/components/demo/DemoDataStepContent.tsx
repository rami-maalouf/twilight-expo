// ports: Views/Onboarding/DemoSleepDataStepView.swift (shared content)
import { type SymbolViewProps } from 'expo-symbols';

import { NativeSymbol as SymbolView } from '@/components/common/NativeSymbol';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { FadeInSlide } from '@/components/common/FadeInSlide';
import { useTheme } from '@/theme/ThemeProvider';

const DETAILS: { icon: SymbolViewProps['name']; text: string }[] = [
  { icon: 'sparkles', text: 'See Twilight with real charts and trends right away' },
  { icon: 'chart.bar.xaxis', text: "Get a feel for Twilight's insights before tracking your own nights" },
];

export function DemoDataStepContent({
  isImporting,
  isFinishing = false,
  onExplore,
  onSkip,
}: {
  isImporting: boolean;
  // onboarding waits for the health connect import before it finishes
  isFinishing?: boolean;
  onExplore: () => void;
  onSkip: () => void;
}) {
  const theme = useTheme();
  const busy = isImporting || isFinishing;

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <View style={styles.spacer} />
        <View style={styles.content}>
          <FadeInSlide delay={0} slideOffset={20}>
            <View style={[styles.hero, { backgroundColor: `${theme.actionPrimary}38` }]}>
              <SymbolView name="chart.xyaxis.line" size={36} weight="semibold" tintColor={theme.actionPrimary} />
            </View>
          </FadeInSlide>
          <FadeInSlide delay={0.1} slideOffset={20}>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Get a glimpse of your future stats</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Here&apos;s how Twilight will look if you stay consistent and get good sleep for the next 100 days.
              </Text>
            </View>
          </FadeInSlide>
          <FadeInSlide delay={0.22} slideOffset={24}>
            <View
              style={[
                styles.detailCard,
                { backgroundColor: theme.cardBackground, borderColor: 'rgba(255, 255, 255, 0.08)' },
              ]}>
              <Text style={[styles.detailTitle, { color: theme.textPrimary }]}>Why try it?</Text>
              {DETAILS.map((detail) => (
                <View key={detail.text} style={styles.detailRow}>
                  <SymbolView name={detail.icon} size={15} weight="semibold" tintColor={theme.actionPrimary} />
                  <Text style={[styles.detailText, { color: theme.textPrimary }]}>{detail.text}</Text>
                </View>
              ))}
            </View>
          </FadeInSlide>
        </View>
        <View style={styles.spacer} />
      </View>

      <FadeInSlide delay={0.34} slideOffset={18} style={styles.actionArea}>
        <Pressable
          testID="explore-demo-data"
          disabled={busy}
          onPress={onExplore}
          style={[
            styles.primaryButton,
            { backgroundColor: theme.actionPrimary, opacity: busy ? 0.7 : 1 },
          ]}>
          {isImporting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <SymbolView name="sparkles" size={17} tintColor="#ffffff" />
          )}
          <Text style={styles.primaryLabel}>
            {isImporting ? 'Loading your future data...' : 'Explore my data'}
          </Text>
        </Pressable>
        <Pressable testID="skip-demo-data" disabled={busy} onPress={onSkip} hitSlop={8} style={styles.skipRow}>
          {isFinishing ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
          <Text style={[styles.skipLabel, { color: theme.textSecondary }]}>
            {isFinishing ? 'Importing sleep...' : 'Skip for now'}
          </Text>
        </Pressable>
      </FadeInSlide>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28 },
  spacer: { flex: 1 },
  content: { alignItems: 'stretch', gap: 20 },
  hero: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 17, textAlign: 'center', lineHeight: 23 },
  detailCard: { gap: 14, borderRadius: 22, borderWidth: 1, padding: 18 },
  detailTitle: { fontSize: 17, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailText: { flex: 1, fontSize: 15, lineHeight: 20 },
  actionArea: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    left: 16,
    alignItems: 'center',
    gap: 14,
  },
  primaryButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 30,
    paddingVertical: 16,
  },
  primaryLabel: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  skipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipLabel: { fontSize: 15, fontWeight: '600' },
});
