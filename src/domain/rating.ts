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
