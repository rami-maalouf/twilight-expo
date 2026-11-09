// RatingManager parity: third launch, once per version, again after an update
import { shouldRequestReview } from '../../domain/rating';
import { recordAppLaunch } from '../rating-store';
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

function launches(kv: KeyValueStorage, version: string, count: number, canPrompt = true): boolean[] {
  return Array.from({ length: count }, () => recordAppLaunch(kv, version, { canPrompt }));
}

describe('shouldRequestReview', () => {
  test('needs three launches and a version not prompted yet', () => {
    expect(shouldRequestReview(2, null, '1.0.0')).toBe(false);
    expect(shouldRequestReview(3, null, '1.0.0')).toBe(true);
    expect(shouldRequestReview(10, '1.0.0', '1.0.0')).toBe(false);
    expect(shouldRequestReview(10, '1.0.0', '1.1.0')).toBe(true);
  });
});

describe('recordAppLaunch', () => {
  test('prompts on the third launch and never again for the same version', () => {
    const kv = memoryKv();
    expect(launches(kv, '1.0.0', 6)).toEqual([false, false, true, false, false, false]);
  });

  test('prompts again on the first launch after a version bump', () => {
    const kv = memoryKv();
    launches(kv, '1.0.0', 3);
    expect(launches(kv, '1.1.0', 2)).toEqual([true, false]);
  });

  test('a deferred prompt (onboarding on screen) still counts the launch and asks later', () => {
    const kv = memoryKv();
    expect(launches(kv, '1.0.0', 4, false)).toEqual([false, false, false, false]);
    expect(launches(kv, '1.0.0', 2)).toEqual([true, false]);
  });

  test('a corrupt counter starts over instead of throwing', () => {
    const kv = memoryKv();
    kv.setItemSync('twilight.rating.launchCount', 'oops');
    expect(launches(kv, '1.0.0', 3)).toEqual([false, false, true]);
  });
});
