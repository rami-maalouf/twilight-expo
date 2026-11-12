// home-screen widgets are android-only in this port (ios keeps its live
// activity and has no widget target); everything here is a no-op elsewhere
import type { HomeWidgetProps } from '../../widgets/home-widget-props';

export const HOME_WIDGETS_SUPPORTED = false;

export function publishHomeWidgets(_props: HomeWidgetProps): void {}
