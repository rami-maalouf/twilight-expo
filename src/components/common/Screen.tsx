// every screen: zstack [ theme gradient ignoresSafeArea, starfield(40), content ]
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StarfieldView } from './StarfieldView';
import { useTheme } from '@/theme/ThemeProvider';

export function Screen({
  children,
  starCount = 40,
  showShootingStars = true,
  withStatusScrim = true,
}: {
  children: React.ReactNode;
  starCount?: number;
  showShootingStars?: boolean;
  withStatusScrim?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View collapsable={false} style={styles.root}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <StarfieldView starCount={starCount} showShootingStars={showShootingStars} />
      {withStatusScrim && insets.top > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.statusBarScrim,
            {
              height: insets.top,
              backgroundColor: theme.backgroundGradientStart,
            },
          ]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statusBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    opacity: 0.96,
  },
});
