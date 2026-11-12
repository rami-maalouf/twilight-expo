// swift's inline navigation bar on the onboarding steps after welcome
// (NavigationStack + .navigationBarTitleDisplayMode(.inline), no title): only
// the back control. ios keeps the 44pt bar with the chevron; android uses a
// material 3 small top app bar height (64dp) with the arrow_back icon button.
import { router } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/common/BackButton';
import { useTheme } from '@/theme/ThemeProvider';

const IS_ANDROID = Platform.OS === 'android';
export const ONBOARDING_BAR_HEIGHT = IS_ANDROID ? 64 : 44;

export function OnboardingNavBar({ disabled }: { disabled?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + ONBOARDING_BAR_HEIGHT }]}>
      <BackButton
        testID="onboarding-back"
        color={theme.textPrimary}
        disabled={disabled}
        onPress={() => {
          if (router.canGoBack()) router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { justifyContent: 'center', paddingHorizontal: IS_ANDROID ? 4 : 8 },
});
