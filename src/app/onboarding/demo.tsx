import { demoDataManager } from '@/data/app-db';
import { finishOnboardingHealthSync } from '@/services/health-connect/app-health-sync';
import { useHealthSyncState } from '@/services/health-connect/health-connect-state';
import { appSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { router } from 'expo-router';
import { useState } from 'react';

import { showAlert } from '@/components/common/app-alert';
import { DemoDataStepContent } from '@/components/demo/DemoDataStepContent';
import { Screen } from '@/components/common/Screen';
import { OnboardingNavBar } from '@/components/onboarding/OnboardingNavBar';

export default function DemoDataStep() {
  const refreshSettings = useSettings((state) => state.refresh);
  const setSetting = useSettings((state) => state.setSetting);
  const healthSyncEnabled = useHealthSyncState((state) => state.enabled);
  const [isImporting, setIsImporting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // swift importIfNeeded: the health connect import finishes before the
  // dashboard opens, and before demo data pauses sync (5.2)
  const finishHealthSync = async () => {
    setIsFinishing(true);
    try {
      await finishOnboardingHealthSync(healthSyncEnabled);
    } finally {
      setIsFinishing(false);
    }
  };

  const exploreDemoData = async () => {
    if (isImporting || isFinishing) return;
    await finishHealthSync();
    setIsImporting(true);

    try {
      demoDataManager.importDemoData();
      refreshSettings();
      appSleepStore.getState().refresh();
      router.replace('/');
    } catch {
      showAlert("Couldn't Load Demo Data", 'An unknown error occurred. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const skipDemoData = async () => {
    if (isImporting || isFinishing) return;
    await finishHealthSync();
    setSetting('isOnboarded', true);
    router.replace('/');
  };

  return (
    <Screen starCount={35}>
      <OnboardingNavBar disabled={isImporting || isFinishing} />
      <DemoDataStepContent
        isImporting={isImporting}
        isFinishing={isFinishing}
        onExplore={exploreDemoData}
        onSkip={skipDemoData}
      />
    </Screen>
  );
}
