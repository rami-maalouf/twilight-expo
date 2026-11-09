// the app store / play in-app review prompt (swift RatingManager): counts
// every launch of the app's ui and asks once per version from the third.
// headless starts (session notification buttons) mount no ui and do not
// count. the store decides whether the sheet actually shows.
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { claimReviewPrompt, recordAppLaunch } from '../data/rating-store';
import { canPromptForReview } from '../domain/rating';
import { appSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';

// the launch settles first: a twilight://sleep/start link resolves
// asynchronously, and a review sheet over the first frame (or over a sleep
// start) would be rude
const SETTLE_MS = 2000;

// once per process: the root layout can remount (fast refresh, a font
// scale change recreating the activity) without the app launching again
let launchRecorded = false;

async function askForReview(): Promise<void> {
  const allowed = canPromptForReview({
    isOnboarded: useSettings.getState().isOnboarded,
    isSleeping: appSleepStore.getState().activeSession != null,
    isActive: AppState.currentState === 'active',
  });
  // swift: CFBundleShortVersionString (android versionName), both from app.json "version"
  if (!allowed || !claimReviewPrompt(Storage, Constants.expoConfig?.version ?? '')) return;
  if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
}

export function useRatingPrompt() {
  useEffect(() => {
    if (launchRecorded) return;
    launchRecorded = true;
    recordAppLaunch(Storage);
    setTimeout(() => {
      askForReview().catch((error) => {
        if (__DEV__) console.warn('[rating] review request failed', error);
      });
    }, SETTLE_MS);
  }, []);
}
