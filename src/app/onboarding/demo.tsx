import { demoDataManager } from '@/data/app-db';
import { appSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useTheme } from '@/theme/ThemeProvider';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FadeInSlide } from '@/components/common/FadeInSlide';
import { Screen } from '@/components/common/Screen';

const DETAILS: { icon: SymbolViewProps['name']; text: string }[] = [
  { icon: 'sparkles', text: 'See Twilight with real charts and trends right away' },
  { icon: 'chart.bar.xaxis', text: "Get a feel for Twilight's insights before tracking your own nights" },
];

export default function DemoDataStep() {
  const theme = useTheme();
  const refreshSettings = useSettings((state) => state.refresh);
  const setSetting = useSettings((state) => state.setSetting);
  const [isImporting, setIsImporting] = useState(false);

  const exploreDemoData = () => {
    if (isImporting) return;
    setIsImporting(true);

    try {
      demoDataManager.importDemoData();
      refreshSettings();
      appSleepStore.getState().refresh();
      router.replace('/');
    } catch {
      Alert.alert("Couldn't Load Demo Data", 'An unknown error occurred. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const skipDemoData = () => {
    setSetting('isOnboarded', true);
    router.replace('/');
  };

  return (
    <Screen starCount={35}>
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
            <View style={[styles.detailCard, { backgroundColor: theme.cardBackground, borderColor: 'rgba(255, 255, 255, 0.08)' }]}>
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
          disabled={isImporting}
          onPress={exploreDemoData}
          style={[styles.primaryButton, { backgroundColor: theme.actionPrimary, opacity: isImporting ? 0.7 : 1 }]}>
          {isImporting ? <ActivityIndicator color="#ffffff" /> : <SymbolView name="sparkles" size={17} tintColor="#ffffff" />}
          <Text style={styles.primaryLabel}>{isImporting ? 'Loading your future data...' : 'Explore my data'}</Text>
        </Pressable>
        <Pressable testID="skip-demo-data" disabled={isImporting} onPress={skipDemoData} hitSlop={8}>
          <Text style={[styles.skipLabel, { color: theme.textSecondary }]}>Skip for now</Text>
        </Pressable>
      </FadeInSlide>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28 },
  spacer: { flex: 1 },
  content: { alignItems: 'stretch', gap: 20 },
  hero: { width: 96, height: 96, borderRadius: 48, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 17, textAlign: 'center', lineHeight: 23 },
  detailCard: { gap: 14, borderRadius: 22, borderWidth: 1, padding: 18 },
  detailTitle: { fontSize: 17, fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailText: { flex: 1, fontSize: 15, lineHeight: 20 },
  actionArea: { position: 'absolute', right: 16, bottom: 28, left: 16, alignItems: 'center', gap: 14 },
  primaryButton: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 30, paddingVertical: 16 },
  primaryLabel: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  skipLabel: { fontSize: 15, fontWeight: '600' },
});
