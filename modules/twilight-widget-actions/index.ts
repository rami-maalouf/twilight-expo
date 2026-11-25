// android natives for surfaces outside the app: pending start/stop actions
// recorded by widget, quick settings tile, launcher shortcut and session
// notification buttons (TwilightWidgetActions.kt), the session mirror the
// tile and shortcuts show (TwilightSleepControls.kt), the widgets' minute re-render ticker
// (TwilightWidgetTicker.kt) and the session notification
// (./session-notification.ts). absent on ios and web.
import { requireOptionalNativeModule } from 'expo';

export interface PendingWidgetAction {
  action: string;
  // epoch ms when the button was pressed
  at: number;
  // 'widget' (the app was opened, run now) or 'notification' (ran in the
  // background, applies at `at`); older builds stored no origin
  origin?: string;
}

interface TwilightWidgetActionsNative {
  consumePendingAction(): PendingWidgetAction | null;
  setTicking(enabled: boolean): void;
  setSleepControlsState(sleepingSinceMs: number | null): Promise<void>;
}

const native = requireOptionalNativeModule<TwilightWidgetActionsNative>('TwilightWidgetActions');

export function consumePendingWidgetAction(): PendingWidgetAction | null {
  try {
    return native?.consumePendingAction() ?? null;
  } catch {
    return null;
  }
}

// the session as the quick settings tile and the launcher shortcuts show it
// (TwilightSleepControls.kt): its start, or null while awake
export function setSleepControlsState(sleepingSinceMs: number | null): void {
  native?.setSleepControlsState(sleepingSinceMs).catch(() => {
    // the tile and shortcuts catch up on the next session change or launch
  });
}

export function setWidgetTicking(enabled: boolean): void {
  try {
    native?.setTicking(enabled);
  } catch {
    // the widgets just refresh less often
  }
}
