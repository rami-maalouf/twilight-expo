// ports Utils/RatingManager.swift checkIfShouldRequestReview: ask for a
// review once per app version, from the third launch on
export const REVIEW_MIN_LAUNCHES = 3;

export function shouldRequestReview(
  launchCount: number,
  lastVersionPromptedForReview: string | null,
  currentVersion: string
): boolean {
  return lastVersionPromptedForReview !== currentVersion && launchCount >= REVIEW_MIN_LAUNCHES;
}

// port addition: never over onboarding or at bedtime, and only while the app
// is in front (swift asks only in a foregroundActive scene)
export function canPromptForReview({
  isOnboarded,
  isSleeping,
  isActive,
}: {
  isOnboarded: boolean;
  isSleeping: boolean;
  isActive: boolean;
}): boolean {
  return isOnboarded && !isSleeping && isActive;
}
