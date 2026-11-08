// ports: the ConnectionState / ScreenState machines and copy of
// AppleHealthSettingsView, AppleHealthOnboardingStepView and the settings row
// in BlockedProfileView, adapted to health connect (docs/health-connect.md 5.1-5.3).
// pure: no react or expo imports.

import { READ_WINDOW_HINT } from './pull-result';

// 'unsupported' = ios, web or a build without the native module
export type HcConnectionAvailability = 'available' | 'providerUpdateRequired' | 'unavailable' | 'unsupported';

export type HcConnectionState =
  // status not read yet on a supported platform: render nothing, decide later
  | 'loading'
  | 'hidden'
  | 'demo'
  | 'unavailable'
  | 'updateRequired'
  | 'connected'
  | 'readyToEnable'
  | 'notDetermined'
  | 'denied';

export interface ConnectionInput {
  // null = status not read yet
  availability: HcConnectionAvailability | null;
  read: boolean;
  write: boolean;
  history: boolean;
  historyFeatureAvailable: boolean;
  permissionRequested: boolean;
  enabled: boolean;
  demoActive: boolean;
}

export interface ConnectionView {
  state: HcConnectionState;
  // connected with only one direction granted (2.8)
  importOnly: boolean;
  exportOnly: boolean;
  // read granted, past-data permission offered but not granted (2.4)
  historyMissing: boolean;
}

export function connectionState(input: ConnectionInput): ConnectionView {
  const view = (state: HcConnectionState): ConnectionView => {
    const connected = state === 'connected';
    return {
      state,
      importOnly: connected && input.read && !input.write,
      exportOnly: connected && input.write && !input.read,
      historyMissing: connected && input.read && !input.history && input.historyFeatureAvailable,
    };
  };
  const { availability } = input;
  if (availability === 'unsupported') return view('hidden');
  if (availability == null) return view('loading');
  // sdk unavailable: hide every integration point unless sync was already on,
  // so the user can still turn it off (2.7)
  if (availability === 'unavailable' && !input.enabled) return view('hidden');
  if (input.demoActive) return view('demo');
  if (availability === 'unavailable') return view('unavailable');
  if (availability === 'providerUpdateRequired') return view('updateRequired');
  const granted = input.read || input.write;
  if (granted) return view(input.enabled ? 'connected' : 'readyToEnable');
  return view(input.permissionRequested ? 'denied' : 'notDetermined');
}

// every surface renders only for these states (2.7)
export function isConnectionVisible(state: HcConnectionState): boolean {
  return state !== 'hidden' && state !== 'loading';
}

// dashboard empty-state pull (5.4)
export function canPullFromHealthConnect(input: ConnectionInput): boolean {
  return connectionState(input).state === 'connected' && input.read;
}

export type ConnectionTone = 'success' | 'action' | 'warning' | 'muted';

export const CONNECTION_TONE: Record<HcConnectionState, ConnectionTone> = {
  loading: 'muted',
  hidden: 'muted',
  demo: 'muted',
  unavailable: 'muted',
  updateRequired: 'warning',
  connected: 'success',
  readyToEnable: 'action',
  notDetermined: 'action',
  denied: 'warning',
};

// settings row (swift healthKitStatusLabel / healthKitSummaryText)

export const ROW_STATUS_LABEL: Record<HcConnectionState, string> = {
  loading: '',
  hidden: '',
  demo: 'Demo only',
  unavailable: 'Unavailable',
  updateRequired: 'Update required',
  connected: 'Connected',
  readyToEnable: 'Available',
  notDetermined: 'Not connected',
  denied: 'Permission denied',
};

export function rowSummary(view: ConnectionView, lastErrorMessage: string | null): string {
  switch (view.state) {
    case 'demo':
      return 'This imported demo stays local to Twilight and never syncs to Health Connect.';
    case 'connected':
      if (view.importOnly) return 'Twilight imports sleep from Health Connect. Allow write access to save your nights back.';
      if (view.exportOnly) return 'Twilight saves your nights to Health Connect. Allow read access to import sleep from other apps.';
      return 'Twilight can import sleep from Health Connect and save the nights you log in Twilight back to Health Connect.';
    case 'readyToEnable':
      return 'Permission is already granted. Tap to turn syncing back on.';
    case 'denied':
      return lastErrorMessage ?? 'Health Connect access is off for Twilight.';
    case 'notDetermined':
      return 'Connect Health Connect to import existing sleep and save nights you log in Twilight back to Health Connect.';
    case 'unavailable':
      return 'Health Connect is unavailable on this device.';
    case 'updateRequired':
      return 'Health Connect needs an update before Twilight can sync sleep.';
    default:
      return '';
  }
}

// settings screen (AppleHealthSettingsView)

export const SCREEN_STATUS_LABEL: Record<HcConnectionState, string> = {
  ...ROW_STATUS_LABEL,
  readyToEnable: 'Ready to enable',
};

export const HERO_TITLE: Record<HcConnectionState, string> = {
  loading: '',
  hidden: '',
  demo: 'Demo data stays local',
  unavailable: 'Health Connect is unavailable',
  updateRequired: 'Health Connect needs an update',
  connected: 'Health Connect is connected',
  readyToEnable: 'Health Connect is ready',
  notDetermined: 'Connect Health Connect',
  denied: 'Health Connect needs permission',
};

export const HERO_SUBTITLE: Record<HcConnectionState, string> = {
  loading: '',
  hidden: '',
  demo: 'This onboarding sample is for exploration only. Twilight keeps it local and will not sync it with Health Connect.',
  unavailable:
    'This device no longer offers Health Connect, so Twilight keeps sleep tracking local. You can turn syncing off below.',
  updateRequired: 'Install the latest Health Connect from Google Play so Twilight can keep syncing sleep.',
  connected:
    'Twilight can import sleep from Health Connect and save the nights you log in Twilight back to Health Connect.',
  readyToEnable:
    'Twilight already has Health Connect access. Turn syncing back on to import sleep and save Twilight nights back.',
  notDetermined:
    'Give Twilight permission once to import existing Health Connect sleep and save nights you log in Twilight back to Health Connect.',
  denied: 'Twilight cannot sync sleep until sleep access is allowed in Health Connect.',
};

// a partial grant must not promise the missing direction (2.8)
export function heroSubtitle(view: ConnectionView): string {
  if (view.state === 'connected' && (view.importOnly || view.exportOnly)) return rowSummary(view, null);
  return HERO_SUBTITLE[view.state];
}

export const STATUS_SUMMARY: Record<HcConnectionState, string> = {
  loading: '',
  hidden: '',
  demo: 'The imported demo is intentionally excluded from Health Connect syncing, even if permission is already granted.',
  unavailable: 'Health Connect is unavailable on this device.',
  updateRequired: 'Health Connect needs an update before Twilight can sync sleep.',
  connected:
    'Health Connect nights import into Twilight, and Twilight-owned nights export back. Deleting an imported night removes it from Twilight, but Health Connect keeps the original. Pull again anytime to refresh.',
  readyToEnable: 'Permission is already granted. Turning sync back on will not show the Health Connect prompt again.',
  notDetermined:
    'Twilight needs permission before it can read sleep from Health Connect and write Twilight nights back.',
  denied:
    'Health Connect access is off for Twilight. Open Health Connect and allow sleep access for Twilight to reconnect.',
};

export type TipIcon = 'bolt' | 'settings' | 'check' | 'sparkles' | 'history' | 'info' | 'edit';

export interface Tip {
  id: string;
  icon: TipIcon;
  text: string;
}

export const TIP_COPY = {
  ready: 'Permission is already granted, so turning sync back on is immediate.',
  denied: 'In Health Connect, open App permissions, choose Twilight, and allow sleep access.',
  connected:
    'Sync runs when you open the app, finish a night, or tap Pull. It is not a live background mirror of Health Connect.',
  demo: 'If you want Health Connect sync later, exit the demo and keep going in Twilight with your own sleep logs.',
  importOnly: 'Twilight can read sleep but cannot save nights. Allow write access in Health Connect to export your nights.',
  exportOnly:
    'Twilight can save nights but cannot read sleep. Allow read access in Health Connect to import nights from other apps.',
  history: READ_WINDOW_HINT,
  adopted: "Edits to nights imported from other apps stay in Twilight. Health Connect keeps the other app's original.",
  updateRequired: 'Google Play opens the Health Connect listing. Come back to Twilight when the update is installed.',
} as const;

export function statusTips(view: ConnectionView, options: { hasAdoptedImports: boolean }): Tip[] {
  const tips: Tip[] = [];
  switch (view.state) {
    case 'readyToEnable':
      tips.push({ id: 'ready', icon: 'bolt', text: TIP_COPY.ready });
      break;
    case 'denied':
      tips.push({ id: 'denied', icon: 'settings', text: TIP_COPY.denied });
      break;
    case 'updateRequired':
      tips.push({ id: 'update', icon: 'info', text: TIP_COPY.updateRequired });
      break;
    case 'demo':
      tips.push({ id: 'demo', icon: 'sparkles', text: TIP_COPY.demo });
      break;
    case 'connected':
      tips.push({ id: 'connected', icon: 'check', text: TIP_COPY.connected });
      if (view.importOnly) tips.push({ id: 'importOnly', icon: 'settings', text: TIP_COPY.importOnly });
      if (view.exportOnly) tips.push({ id: 'exportOnly', icon: 'settings', text: TIP_COPY.exportOnly });
      if (view.historyMissing) tips.push({ id: 'history', icon: 'history', text: TIP_COPY.history });
      if (options.hasAdoptedImports) tips.push({ id: 'adopted', icon: 'edit', text: TIP_COPY.adopted });
      break;
    default:
      break;
  }
  return tips;
}

// 'syncNow': write-only access cannot pull, so the button runs an outbound sync
export type ScreenPrimaryAction = 'pull' | 'syncNow' | 'enable' | 'openHealthConnect' | 'update';

export function screenPrimaryAction(view: Pick<ConnectionView, 'state' | 'exportOnly'>): ScreenPrimaryAction | null {
  switch (view.state) {
    case 'connected':
      return view.exportOnly ? 'syncNow' : 'pull';
    case 'readyToEnable':
    case 'notDetermined':
      return 'enable';
    case 'denied':
      return 'openHealthConnect';
    case 'updateRequired':
      return 'update';
    default:
      return null;
  }
}

export function screenPrimaryTitle(
  view: Pick<ConnectionView, 'state' | 'exportOnly'>,
  flags: { isConnecting: boolean; isSyncing: boolean }
): string | null {
  switch (view.state) {
    case 'connected':
      if (view.exportOnly) return flags.isSyncing ? 'Syncing...' : 'Sync now';
      return flags.isSyncing ? 'Pulling Health Connect sleep...' : 'Pull from Health Connect';
    case 'readyToEnable':
      return flags.isConnecting ? 'Turning on sync...' : 'Turn on Health Connect sync';
    case 'notDetermined':
      return flags.isConnecting ? 'Connecting...' : 'Connect Health Connect';
    case 'denied':
      return 'Open Health Connect';
    case 'updateRequired':
      return 'Update Health Connect';
    default:
      return null;
  }
}

// swift shows "turn off" only when connected; the port also offers it while
// sync is on but cannot run (revoked, unavailable, update required), so the
// switch is never stuck on
export function showsDisableAction(state: HcConnectionState, enabled: boolean): boolean {
  return enabled && state !== 'demo' && isConnectionVisible(state);
}

// held remote deletions card (2.6)
export function heldDeletionTitle(count: number): string {
  return `Health Connect removed ${count} Twilight night${count === 1 ? '' : 's'}`;
}

export function heldDeletionBody(count: number): string {
  return count === 1
    ? 'This night was deleted in Health Connect. Twilight still has it and will not send it back unless you edit it.'
    : 'These nights were deleted in Health Connect. Twilight still has them and will not send them back unless you edit them.';
}

// "Open Health Connect" / "Update Health Connect" could not start any screen
export const OPEN_FAILED = {
  title: 'Health Connect',
  settings:
    "Twilight couldn't open Health Connect. Find it in your phone's Settings under Security and privacy, then Privacy, and check that the app is turned on.",
  store: "Twilight couldn't open Google Play. Update Health Connect from Google Play, then come back to Twilight.",
} as const;

// confirmation for "Remove from Twilight"
export function heldRemovalPrompt(count: number): { title: string; message: string } {
  return count === 1
    ? {
        title: 'Remove this night from Twilight?',
        message: 'It is already gone from Health Connect. This deletes it from your Twilight journal too.',
      }
    : {
        title: `Remove ${count} nights from Twilight?`,
        message: 'They are already gone from Health Connect. This deletes them from your Twilight journal too.',
      };
}

// onboarding step (AppleHealthOnboardingStepView, 5.2)

export type OnboardingState = 'connected' | 'readyToEnable' | 'notDetermined' | 'denied' | 'unavailable' | 'updateRequired';

export function onboardingState(state: HcConnectionState): OnboardingState {
  switch (state) {
    case 'connected':
    case 'readyToEnable':
    case 'notDetermined':
    case 'denied':
    case 'updateRequired':
      return state;
    default:
      // demo cannot be active before onboarding finishes; hidden never shows the step
      return 'unavailable';
  }
}

export interface OnboardingCopy {
  title: string;
  subtitle: string;
  benefitsTitle: string | null;
  statusNote: string | null;
  primary: string;
  // "Continue without Health Connect"
  showsSkip: boolean;
}

export const ONBOARDING_BENEFITS = [
  { id: 'import', title: 'Import existing Health Connect sleep history' },
  { id: 'autosync', title: 'Save Twilight nights back to Health Connect' },
  { id: 'privacy', title: 'Only sleep data, and you can change this later' },
] as const;

export function onboardingCopy(
  state: OnboardingState,
  flags: { isConnecting: boolean; lastErrorMessage: string | null }
): OnboardingCopy {
  const importing = 'Importing sleep...';
  switch (state) {
    case 'connected':
      return {
        title: 'Health Connect connected',
        subtitle: flags.isConnecting
          ? 'Importing your Health Connect sleep history into Twilight...'
          : 'Your Health Connect sleep history is in Twilight. Twilight can import more nights and save the ones you log here back to Health Connect.',
        benefitsTitle: 'What you get',
        statusNote: null,
        primary: flags.isConnecting ? importing : 'Continue',
        showsSkip: false,
      };
    case 'readyToEnable':
      return {
        title: 'Sync with Health Connect',
        subtitle: 'Permission is already granted. Turn syncing on whenever you want.',
        benefitsTitle: 'Why connect?',
        statusNote: 'Twilight only uses sleep session data for this sync.',
        primary: flags.isConnecting ? importing : 'Turn on Health Connect sync',
        showsSkip: true,
      };
    case 'notDetermined':
      return {
        title: 'Sync with Health Connect',
        subtitle:
          'Import your Health Connect sleep history now, and save nights you log in Twilight back to Health Connect. Continue to review the Health Connect permission request.',
        benefitsTitle: 'Why connect?',
        statusNote: 'Twilight only uses sleep session data for this sync.',
        primary: flags.isConnecting ? importing : 'Continue',
        showsSkip: false,
      };
    case 'denied':
      return {
        title: 'Health Connect needs permission',
        subtitle: 'Access is off for Twilight. Enable it in Health Connect or continue without it.',
        benefitsTitle: 'Why connect?',
        statusNote: flags.lastErrorMessage ?? 'Health Connect access is currently off for Twilight.',
        primary: 'Open Health Connect',
        showsSkip: true,
      };
    case 'updateRequired':
      return {
        title: 'Update Health Connect',
        subtitle: 'Install the latest Health Connect from Google Play to sync sleep, or continue without it.',
        benefitsTitle: 'Why connect?',
        statusNote: null,
        primary: 'Update Health Connect',
        showsSkip: true,
      };
    case 'unavailable':
      return {
        title: "Health Connect isn't available here",
        subtitle: 'Twilight still works normally without Health Connect syncing.',
        benefitsTitle: null,
        statusNote: null,
        primary: 'Continue',
        showsSkip: false,
      };
  }
}

export type OnboardingPrimaryAction = 'continue' | 'enable' | 'openHealthConnect' | 'update';

export function onboardingPrimaryAction(state: OnboardingState): OnboardingPrimaryAction {
  switch (state) {
    case 'readyToEnable':
    case 'notDetermined':
      return 'enable';
    case 'denied':
      return 'openHealthConnect';
    case 'updateRequired':
      return 'update';
    default:
      return 'continue';
  }
}

// "Last synced ..." line; same-day times show only the clock
export function lastSyncedLabel(atMs: number | null, nowMs: number, format: (ms: number, sameDay: boolean) => string): string | null {
  if (atMs == null) return null;
  if (nowMs - atMs < 60_000) return 'Last synced just now';
  const sameDay = new Date(atMs).toDateString() === new Date(nowMs).toDateString();
  return `Last synced ${sameDay ? 'today at ' : ''}${format(atMs, sameDay)}`;
}
