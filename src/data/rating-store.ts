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

// swift incrementLaunchCount: counts this launch and, when the review
// should be requested, marks the version as prompted before asking (like
// swift, a prompt the store decides not to show still counts). canPrompt
// false (onboarding on screen, asleep) counts the launch and defers the ask.
export function recordAppLaunch(
  kv: KeyValueStorage,
  currentVersion: string,
  { canPrompt }: { canPrompt: boolean }
): boolean {
  const launchCount = readLaunchCount(kv) + 1;
  kv.setItemSync(LAUNCH_COUNT_KEY, String(launchCount));
  if (!canPrompt || !shouldRequestReview(launchCount, kv.getItemSync(LAST_VERSION_KEY), currentVersion)) {
    return false;
  }
  kv.setItemSync(LAST_VERSION_KEY, currentVersion);
  return true;
}
