import { demoDataManager } from '@/data/app-db';
import { appSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { DemoDataStepContent } from '@/components/demo/DemoDataStepContent';
import { Screen } from '@/components/common/Screen';

export default function DemoDataStep() {
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
      <DemoDataStepContent
        isImporting={isImporting}
        onExplore={exploreDemoData}
        onSkip={skipDemoData}
      />
    </Screen>
  );
}
