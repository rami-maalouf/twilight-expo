// publishes widget snapshots without ever letting a widget failure reach the
// caller: sleep tracking must not depend on the launcher. identical snapshots
// are skipped; `refresh` re-renders the last one (elapsed time, system
// light/dark). expo-widgets only re-renders a widget when its stored props
// change, so every publish carries a fresh `renderKey`.
import type { HomeWidgetProps } from '../../widgets/home-widget-props';

export interface HomeWidgetPublisher {
  // true when the snapshot reached the sink
  update: (props: HomeWidgetProps) => boolean;
  refresh: () => void;
}

export function createHomeWidgetPublisher(
  publish: (props: HomeWidgetProps) => void,
  onError: (error: unknown) => void = () => {},
  now: () => number = Date.now
): HomeWidgetPublisher {
  let lastJson: string | null = null;
  let last: HomeWidgetProps | null = null;

  const send = (props: HomeWidgetProps): boolean => {
    try {
      publish({ ...props, renderKey: now() });
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  };

  return {
    update(props) {
      const json = JSON.stringify(props);
      if (json === lastJson) return false;
      last = props;
      // forget a failed snapshot so the next change (or the same one) retries
      lastJson = send(props) ? json : null;
      return lastJson != null;
    },
    refresh() {
      if (last) send(last);
    },
  };
}
