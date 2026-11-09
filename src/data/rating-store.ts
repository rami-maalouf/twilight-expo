// ports RatingManager.swift's @AppStorage("launchCount") and
// @AppStorage("lastVersionPromptedForReview") over the kv store
import { shouldRequestReview } from '../domain/rating';
import type { KeyValueStorage } from './settings-store';

const LAUNCH_COUNT_KEY = 'twilight.rating.launchCount';
const LAST_VERSION_KEY = 'twilight.rating.lastVersionPromptedForReview';

function readLaunchCount(kv: KeyValueStorage): number {
  const count = Number(kv.getItemSync(LAUNCH_COUNT_KEY));
  return Number.isInteger(count) && count > 0 ? count : 0;
}

// swift incrementLaunchCount, first half: counts this launch
export function recordAppLaunch(kv: KeyValueStorage): number {
  const launchCount = readLaunchCount(kv) + 1;
  kv.setItemSync(LAUNCH_COUNT_KEY, String(launchCount));
  return launchCount;
}

// swift checkIfShouldRequestReview: when the review is due, marks the
// version as prompted before asking (like swift, a prompt the store decides
// not to show still counts). a launch that never claims (onboarding on
// screen, asleep) leaves the prompt due for the next launch.
export function claimReviewPrompt(kv: KeyValueStorage, currentVersion: string): boolean {
  if (!shouldRequestReview(readLaunchCount(kv), kv.getItemSync(LAST_VERSION_KEY), currentVersion)) {
    return false;
  }
  kv.setItemSync(LAST_VERSION_KEY, currentVersion);
  return true;
}
