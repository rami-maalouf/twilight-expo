// android home-screen widgets (expo-widgets + jetpack compose / glance).
// the widget modules call createWidget() at load, which needs the native
// ExpoWidgets module; load them lazily so a missing module becomes a caught
// publish error instead of an import-time crash.
import type { Widget } from 'expo-widgets';

import type { HomeWidgetProps } from '../../widgets/home-widget-props';

export const HOME_WIDGETS_SUPPORTED = true;

let widgets: Widget<HomeWidgetProps>[] | null = null;

function load(): Widget<HomeWidgetProps>[] {
  if (!widgets) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    widgets = [
      require('../../widgets/sleep-status.android').default,
      require('../../widgets/sleep-mode.android').default,
      require('../../widgets/sleep-overview.android').default,
    ] as Widget<HomeWidgetProps>[];
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
  return widgets;
}

// every widget is attempted; the first failure is rethrown afterwards
function each(run: (widget: Widget<HomeWidgetProps>) => void): void {
  let failure: unknown = null;
  for (const widget of load()) {
    try {
      run(widget);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure != null) throw failure;
}

export function publishHomeWidgets(props: HomeWidgetProps): void {
  each((widget) => widget.updateSnapshot(props));
}
