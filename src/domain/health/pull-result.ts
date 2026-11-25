// ports: HealthKitSleepPullResult + HealthKitSleepSyncError copy, adapted to
// health connect (docs/health-connect.md 5.5). fixes swift defects 4 and 5.

export interface PullResult {
  // foreign health connect sleep sessions seen (swift sampleCount)
  sampleCount: number;
  nightCount: number;
  insertedCount: number;
  updatedCount: number;
  rehydratedCount: number;
  message: string;
}

export const READ_WINDOW_HINT =
  'Health Connect shares sleep from other apps back to 30 days before you connected. Allow past data access in Health Connect to import older nights.';

export function buildPullResult(input: {
  recordCount: number;
  nightCount: number;
  inserted: number;
  updated: number;
  rehydrated: number;
  historyGranted: boolean;
}): PullResult {
  const imported = input.inserted + input.rehydrated;
  let message: string;
  if (imported > 0) {
    message = `Imported ${imported} night(s) from Health Connect (${input.recordCount} session(s)).`;
  } else if (input.updated > 0) {
    message = `Updated ${input.updated} night(s) from Health Connect (${input.recordCount} session(s)).`;
  } else if (input.recordCount === 0) {
    message =
      'Health Connect returned no sleep from other apps. If your sleep app writes to Health Connect, check that it may write sleep and that Twilight may read sleep.';
    if (!input.historyGranted) message += ` ${READ_WINDOW_HINT}`;
  } else {
    message = `Found ${input.recordCount} Health Connect sleep session(s) in ${input.nightCount} night(s), but Twilight already has matching nights or they overlapped local sleep.`;
  }
  return {
    sampleCount: input.recordCount,
    nightCount: input.nightCount + input.rehydrated,
    insertedCount: input.inserted,
    updatedCount: input.updated,
    rehydratedCount: input.rehydrated,
    message,
  };
}

export type HealthSyncErrorCode =
  | 'unavailable'
  | 'updateRequired'
  | 'permission'
  | 'invalidInterval'
  | 'missingZone'
  | 'invalid'
  | 'deleteFailed'
  | 'rateLimit'
  | 'remote';

export const HEALTH_SYNC_ERROR_COPY: Record<HealthSyncErrorCode, string> = {
  unavailable: 'Health Connect is unavailable on this device.',
  updateRequired: 'Health Connect needs an update before Twilight can sync sleep.',
  permission: 'Twilight needs Health Connect permission to sync sleep sessions.',
  invalidInterval: 'This sleep session has an invalid sleep/wake interval.',
  missingZone:
    'This sleep log is missing the time zone it was recorded in. Edit and save the log before syncing it to Health Connect.',
  invalid: 'Health Connect rejected this sleep session.',
  deleteFailed: "Twilight couldn't remove the matching Health Connect sleep entry.",
  rateLimit: 'Health Connect is busy. Twilight will try again the next time you open the app.',
  remote: "Twilight couldn't reach Health Connect. Try again in a moment.",
};

export type HealthSyncSkipReason = 'off' | 'permission' | 'demo';

export const HEALTH_SYNC_SKIP_COPY: Record<HealthSyncSkipReason, string> = {
  off: 'Health Connect sync is turned off.',
  permission: 'Twilight does not have Health Connect permission.',
  demo: 'Demo data does not sync with Health Connect.',
};
