// android home-screen widget natives: pending start/stop actions recorded by
// widget buttons (TwilightWidgetActions.kt) and the minute re-render ticker
// used while a session runs (TwilightWidgetTicker.kt). absent on ios and web.
import { requireOptionalNativeModule } from 'expo';

export interface PendingWidgetAction {
  action: string;
  // epoch ms when the widget button was pressed
  at: number;
}

interface TwilightWidgetActionsNative {
  consumePendingAction(): PendingWidgetAction | null;
  setTicking(enabled: boolean): void;
}

const native = requireOptionalNativeModule<TwilightWidgetActionsNative>('TwilightWidgetActions');

export function consumePendingWidgetAction(): PendingWidgetAction | null {
  try {
    return native?.consumePendingAction() ?? null;
  } catch {
    return null;
  }
}

export function setWidgetTicking(enabled: boolean): void {
  try {
    native?.setTicking(enabled);
  } catch {
    // the widgets just refresh less often
  }
}
