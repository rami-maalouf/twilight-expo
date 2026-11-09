// the app store / play in-app review prompt (swift RatingManager): counts
// every launch of the app's ui and asks once per version from the third.
// headless starts (session notification buttons) mount no ui and do not
// count. the store decides whether the sheet actually shows.
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';
import { useEffect } from 'react';

import { recordAppLaunch } from '../data/rating-store';
import { appSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';

// once per process: the root layout can remount (fast refresh, a font
// scale change recreating the activity) without the app launching again
let launchRecorded = false;

async function requestReview(): Promise<void> {
  if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
}

export function useRatingPrompt() {
  const isOnboarded = useSettings((s) => s.isOnboarded);
  useEffect(() => {
    if (launchRecorded) return;
    launchRecorded = true;
    // swift: CFBundleShortVersionString (android versionName), both from app.json "version"
    const version = Constants.expoConfig?.version ?? '';
    // not over onboarding, and not at bedtime: a launch from a start sleep
    // shortcut or tile has already started the session by now (the
    // external actions run in an earlier effect)
    const canPrompt = isOnboarded && appSleepStore.getState().activeSession == null;
    if (recordAppLaunch(Storage, version, { canPrompt })) {
      requestReview().catch((error) => {
        if (__DEV__) console.warn('[rating] review request failed', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
