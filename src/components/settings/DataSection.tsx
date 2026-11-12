// ports: the "Data" section of Views/BlockedProfileView.swift
// (docs/health-connect.md 6.6). both platforms; hidden while demo data is
// active, like swift hides it for the demo profile.
import { router } from 'expo-router';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { RowLabel, SettingsRow, SettingsSection, useSecondaryLabel } from '@/components/settings/SettingsList';
import { useSettings } from '@/state/settings-state';
import { useTheme } from '@/theme/ThemeProvider';

export function DataSection() {
  const theme = useTheme();
  const secondaryLabel = useSecondaryLabel();
  const isDemoDataActive = useSettings((s) => s.isDemoDataActive);
  if (isDemoDataActive) return null;

  return (
    <SettingsSection title="Data">
      <SettingsRow testID="data-management-row" onPress={() => router.push('/data-management')}>
        <RowLabel color={theme.textPrimary}>Import & Export Data</RowLabel>
        <NativeSymbol name="externaldrive" size={16} tintColor={secondaryLabel} />
      </SettingsRow>
    </SettingsSection>
  );
}
