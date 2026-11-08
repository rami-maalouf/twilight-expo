// pending start/stop actions recorded by the android home-screen widgets
// (see android/.../TwilightWidgetActions.kt). absent on ios and web.
import { requireOptionalNativeModule } from 'expo';

export interface PendingWidgetAction {
  action: string;
  // epoch ms when the widget button was pressed
  at: number;
}

interface TwilightWidgetActionsNative {
  consumePendingAction(): PendingWidgetAction | null;
}

const native = requireOptionalNativeModule<TwilightWidgetActionsNative>('TwilightWidgetActions');

export function consumePendingWidgetAction(): PendingWidgetAction | null {
  try {
    return native?.consumePendingAction() ?? null;
  } catch {
    return null;
  }
}
