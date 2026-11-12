// RatingManager parity: third launch, once per version, again after an update
import { canPromptForReview, shouldRequestReview } from '../../domain/rating';
import { claimReviewPrompt, recordAppLaunch } from '../rating-store';
import type { KeyValueStorage } from '../settings-store';

function memoryKv(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemSync: (key) => map.get(key) ?? null,
    setItemSync: (key, value) => {
      map.set(key, value);
    },
  };
}

// each launch counts, then claims the prompt unless the launch cannot ask
function launches(kv: KeyValueStorage, version: string, count: number, canPrompt = true): boolean[] {
  return Array.from({ length: count }, () => {
    recordAppLaunch(kv);
    return canPrompt && claimReviewPrompt(kv, version);
  });
}

describe('shouldRequestReview', () => {
  test('needs three launches and a version not prompted yet', () => {
    expect(shouldRequestReview(2, null, '1.0.0')).toBe(false);
    expect(shouldRequestReview(3, null, '1.0.0')).toBe(true);
    expect(shouldRequestReview(10, '1.0.0', '1.0.0')).toBe(false);
    expect(shouldRequestReview(10, '1.0.0', '1.1.0')).toBe(true);
  });
});

describe('canPromptForReview', () => {
  const ok = { isOnboarded: true, isSleeping: false, isActive: true };

  test('asks only onboarded, awake and in front', () => {
    expect(canPromptForReview(ok)).toBe(true);
    expect(canPromptForReview({ ...ok, isOnboarded: false })).toBe(false);
    expect(canPromptForReview({ ...ok, isSleeping: true })).toBe(false);
    expect(canPromptForReview({ ...ok, isActive: false })).toBe(false);
  });

  test('never over an app alert', () => {
    expect(canPromptForReview({ ...ok, isAlertShowing: true })).toBe(false);
    expect(canPromptForReview({ ...ok, isAlertShowing: false })).toBe(true);
  });
});

describe('recordAppLaunch / claimReviewPrompt', () => {
  test('counts every launch', () => {
    const kv = memoryKv();
    expect([recordAppLaunch(kv), recordAppLaunch(kv), recordAppLaunch(kv)]).toEqual([1, 2, 3]);
    expect(kv.map.get('twilight.rating.launchCount')).toBe('3');
  });

  test('prompts on the third launch and never again for the same version', () => {
    const kv = memoryKv();
    expect(launches(kv, '1.0.0', 6)).toEqual([false, false, true, false, false, false]);
    expect(kv.map.get('twilight.rating.lastVersionPromptedForReview')).toBe('1.0.0');
  });

  test('prompts again on the first launch after a version bump', () => {
    const kv = memoryKv();
    launches(kv, '1.0.0', 3);
    expect(launches(kv, '1.1.0', 2)).toEqual([true, false]);
  });

  test('a deferred prompt (onboarding on screen, asleep) still counts the launch and asks later', () => {
    const kv = memoryKv();
    expect(launches(kv, '1.0.0', 4, false)).toEqual([false, false, false, false]);
    expect(kv.map.has('twilight.rating.lastVersionPromptedForReview')).toBe(false);
    expect(launches(kv, '1.0.0', 2)).toEqual([true, false]);
  });

  test('a corrupt counter starts over instead of throwing', () => {
    const kv = memoryKv();
    kv.setItemSync('twilight.rating.launchCount', 'oops');
    expect(launches(kv, '1.0.0', 3)).toEqual([false, false, true]);
  });
});
