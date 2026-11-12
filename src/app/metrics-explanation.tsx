// ports: Views/Components/Dashboard/MetricsExplanationView.swift
// "Analytics Guide" sheet (detents 0.6/large with drag indicator)
import { router } from 'expo-router';
import { type SymbolViewProps } from 'expo-symbols';

import { NativeSymbol as SymbolView } from '@/components/common/NativeSymbol';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableFeedback } from '@/components/common/PressableFeedback';
import { Screen } from '@/components/common/Screen';
import { SheetCloseButton } from '@/components/common/SheetCloseButton';
import { useTheme } from '@/theme/ThemeProvider';

const SRI_RESEARCH_URL = 'https://www.nature.com/articles/s41598-017-03171-4';

// the sri copy drops swift's "including imported Apple Health sleep envelopes"
// clause: this port has no health import.
const ITEMS: {
  icon: SymbolViewProps['name'];
  title: string;
  definition: string;
  calculation: string;
  link?: { label: string; url: string };
}[] = [
  {
    icon: 'moon.zzz.fill',
    title: 'Sleep Regularity Index (SRI)',
    definition:
      'How often your sleep or wake state matches 24 hours later. 100 means identical timing; 0 means half the compared time matches. Negative scores are possible. This measures timing, not whether you get enough sleep.',
    calculation:
      'SRI = 200 × matching fraction − 100.\n\nThe line shows SRI for the selected 7, 14, or 28 completed days ending on each date. It combines 6, 13, or 27 comparisons, respectively, of sleep/wake states exactly 24 hours apart. The faint bars show those individual day-to-day comparisons.\n\nDays run noon to noon in your current time zone. A rolling point needs every adjacent-day comparison in its selected window. Missing logs and daylight-saving transition days leave gaps. Changing 90D to All changes the visible history, not the calculation window.\n\nTwilight treats logged sessions, including naps, as sleep and the rest of a recorded day as awake. It cannot detect unlogged naps or awakenings within a session. Days without logs are unknown. Sessions over 24 hours are excluded. This is a log-based estimate; the selected duration is a display window, not a clinical threshold.',
    link: { label: 'Read the original SRI research', url: SRI_RESEARCH_URL },
  },
  {
    icon: 'clock.fill',
    title: 'Average Sleep',
    definition: 'The average duration of your sleep sessions over the selected period.',
    calculation: 'Total sleep hours ÷ Number of tracked nights',
  },
  {
    icon: 'bed.double.fill',
    title: 'Sleep Consistency',
    definition: 'How consistent your bedtime is relative to your average bedtime.',
    calculation:
      'We calculate the standard deviation of your bedtimes. You lose 40 points for every hour of deviation from your average.',
  },
  {
    icon: 'sun.max.fill',
    title: 'Wake Consistency',
    definition: 'How consistent your wake-up time is relative to your average wake-up time.',
    calculation:
      'Similar to sleep consistency, we look at the deviation of your wake times. 40 points deducted per hour of deviation.',
  },
  {
    icon: 'target',
    title: 'Accuracy',
    definition: 'How closely you are adhering to your set Goal Times.',
    calculation:
      'We measure the difference between your actual times and your goal times. You lose 30 points for every hour of difference (averaged between sleep and wake).',
  },
];

export default function MetricsExplanationScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Screen starCount={20}>
      <View style={[styles.toolbar, { paddingTop: insets.top + 14 }]}>
        <View style={styles.toolbarSpacer} />
        <Text style={[styles.navTitle, { color: theme.textPrimary }]}>Analytics Guide</Text>
        <SheetCloseButton onPress={() => router.back()} iconColor={theme.textPrimary} doneColor={theme.actionPrimary} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 48) },
        ]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Understanding Your Data</Text>
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          We believe in transparency. Here&apos;s exactly how we calculate your sleep metrics so
          you know what you&apos;re tracking.
        </Text>
        <View style={styles.divider} />
        {ITEMS.flatMap((item) => [
          <View key={item.title} style={styles.item}>
            <View style={styles.itemHeader}>
              <View style={[styles.iconCircle, { backgroundColor: `${theme.actionPrimary}1a` }]}>
                <SymbolView name={item.icon} size={20} tintColor={theme.actionPrimary} />
              </View>
              <Text style={[styles.itemTitle, { color: theme.textPrimary }]}>{item.title}</Text>
            </View>
            <View style={styles.itemBody}>
              <Text style={[styles.sectionCaption, { color: theme.textSecondary }]}>
                WHAT IS IT?
              </Text>
              <Text style={[styles.definition, { color: theme.textPrimary }]}>
                {item.definition}
              </Text>
              <Text style={[styles.sectionCaption, styles.calcCaption, { color: theme.textSecondary }]}>
                HOW IT&apos;S CALCULATED
              </Text>
              <Text style={[styles.calculation, { color: theme.textSecondary }]}>
                {item.calculation}
              </Text>
            </View>
          </View>,
          ...(item.link
            ? [
                <PressableFeedback
                  key={`${item.title}-link`}
                  testID="metrics.sri.research-link"
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(item.link!.url)}>
                  <Text style={[styles.link, { color: theme.accent }]}>{item.link.label}</Text>
                </PressableFeedback>,
              ]
            : []),
        ])}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  toolbarSpacer: { width: 48 },
  navTitle: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  intro: { fontSize: 17 },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  item: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    gap: 12,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 17, fontWeight: '600' },
  itemBody: { paddingLeft: 44, gap: 8 },
  sectionCaption: { fontSize: 12, fontWeight: '700' },
  calcCaption: { paddingTop: 4 },
  definition: { fontSize: 15 },
  link: { fontSize: 15 },
  calculation: {
    fontSize: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    overflow: 'hidden',
  },
});
