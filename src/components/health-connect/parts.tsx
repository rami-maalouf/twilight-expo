// shared pieces of the health connect screens. ports the card, badge, row,
// tip and button helpers of AppleHealthSettingsView and
// AppleHealthOnboardingStepView, with material ripples on android.
import { type SymbolViewProps } from 'expo-symbols';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import type { ConnectionTone, TipIcon } from '@/domain/health/connection-state';
import type { AppTheme } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';

export function toneColor(theme: AppTheme, tone: ConnectionTone): string {
  switch (tone) {
    case 'success':
      return theme.success;
    case 'action':
      return theme.actionPrimary;
    case 'warning':
      return theme.warning;
    default:
      return theme.textSecondary;
  }
}

// readable label on a filled button of this tone (swift: black on success and warning)
export function onToneColor(tone: ConnectionTone): string {
  return tone === 'success' || tone === 'warning' ? '#000000' : '#ffffff';
}

// hex color + alpha 0..1 -> #rrggbbaa; other formats pass through
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export const TIP_SYMBOL: Record<TipIcon, SymbolViewProps['name']> = {
  bolt: 'bolt.fill',
  settings: 'gearshape.fill',
  check: 'checkmark.seal.fill',
  sparkles: 'sparkles',
  history: 'clock.arrow.circlepath',
  info: 'info.circle.fill',
  edit: 'pencil.and.scribble',
};

export function HcCard({
  glow,
  children,
  style,
  testID,
}: {
  glow: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground, borderColor: withAlpha(glow, 0.22) },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  icon,
  title,
  subtitle,
  accent,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  subtitle?: string;
  accent: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <NativeSymbol name={icon} size={18} weight="semibold" tintColor={accent} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
      </View>
      {subtitle ? <Text style={[styles.body, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: withAlpha(color, 0.14), borderColor: withAlpha(color, 0.4) },
      ]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeLabel, { color: theme.textPrimary }]}>{label}</Text>
    </View>
  );
}

export function FeatureRow({
  icon,
  color,
  title,
  subtitle,
}: {
  icon: SymbolViewProps['name'];
  color: string;
  title: string;
  subtitle: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.featureRow, { backgroundColor: withAlpha(theme.textPrimary, 0.05) }]}>
      <View style={[styles.featureIcon, { backgroundColor: withAlpha(color, 0.16) }]}>
        <NativeSymbol name={icon} size={20} weight="semibold" tintColor={color} />
      </View>
      <View style={styles.flexText}>
        <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function FactRow({ accent, title, subtitle }: { accent: string; title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View style={styles.factRow}>
      <View style={styles.factIcon}>
        <NativeSymbol name="checkmark.circle.fill" size={18} weight="semibold" tintColor={accent} />
      </View>
      <View style={styles.flexText}>
        <Text style={[styles.factTitle, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function TipCallout({
  icon,
  text,
  accent,
  testID,
}: {
  icon: SymbolViewProps['name'];
  text: string;
  accent: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.tip,
        { backgroundColor: withAlpha(theme.textPrimary, 0.05), borderColor: withAlpha(accent, 0.3) },
      ]}>
      <View style={styles.tipIcon}>
        <NativeSymbol name={icon} size={16} weight="semibold" tintColor={accent} />
      </View>
      <Text style={[styles.caption, styles.flexText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

export type HcButtonVariant = 'filled' | 'tonal' | 'text';

export function HcButton({
  title,
  onPress,
  variant = 'filled',
  color,
  labelColor,
  icon,
  loading = false,
  disabled = false,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: HcButtonVariant;
  color: string;
  labelColor?: string;
  icon?: SymbolViewProps['name'];
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const isFilled = variant === 'filled';
  const background =
    variant === 'filled' ? color : variant === 'tonal' ? withAlpha(theme.textPrimary, 0.1) : 'transparent';
  const label = labelColor ?? (isFilled ? '#ffffff' : color);
  const inactive = disabled || loading;
  return (
    <View style={[styles.buttonClip, variant === 'text' ? styles.textButtonClip : null, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        // busy is always passed: android keeps a stale busy flag when the key is dropped
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        android_ripple={{ color: withAlpha(isFilled ? '#ffffff' : theme.textPrimary, 0.18) }}
        style={({ pressed }) => [
          variant === 'text' ? styles.textButton : isFilled ? styles.filledButton : styles.tonalButton,
          { backgroundColor: background },
          variant === 'tonal' && { borderColor: withAlpha(theme.textPrimary, 0.12) },
          Platform.OS === 'ios' && pressed && styles.pressed,
          disabled && !loading && styles.disabled,
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={label} />
        ) : icon ? (
          <NativeSymbol name={icon} size={isFilled ? 18 : 16} weight="semibold" tintColor={label} />
        ) : null}
        <Text
          style={[isFilled ? styles.filledLabel : styles.secondaryLabel, { color: label }]}
          numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 16 },
  sectionHeader: { gap: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
  flexText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeLabel: { fontSize: 12, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 14, borderRadius: 16 },
  featureIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  factIcon: { paddingTop: 1 },
  factTitle: { fontSize: 15, fontWeight: '600' },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  tipIcon: { paddingTop: 1 },
  buttonClip: { borderRadius: 30, overflow: 'hidden', alignSelf: 'stretch' },
  textButtonClip: { alignSelf: 'center', borderRadius: 20 },
  filledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  tonalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filledLabel: { fontSize: 17, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  secondaryLabel: { fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
