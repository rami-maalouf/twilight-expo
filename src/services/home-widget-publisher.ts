// publishes widget snapshots without ever letting a widget failure reach the
// caller: sleep tracking must not depend on the launcher. identical snapshots
// are skipped; `refresh` re-renders the current one (elapsed time, system
// light/dark) without rebuilding it.
import type { HomeWidgetProps } from '../../widgets/home-widget-props';

export interface HomeWidgetSink {
  publish: (props: HomeWidgetProps) => void;
  reload: () => void;
}

export interface HomeWidgetPublisher {
  // true when the snapshot reached the sink
  update: (props: HomeWidgetProps) => boolean;
  refresh: () => void;
}

export function createHomeWidgetPublisher(
  sink: HomeWidgetSink,
  onError: (error: unknown) => void = () => {}
): HomeWidgetPublisher {
  let lastJson: string | null = null;
  return {
    update(props) {
      const json = JSON.stringify(props);
      if (json === lastJson) return false;
      try {
        sink.publish(props);
        lastJson = json;
        return true;
      } catch (error) {
        // forget the snapshot so the next change (or the same one) retries
        lastJson = null;
        onError(error);
        return false;
      }
    },
    refresh() {
      try {
        sink.reload();
      } catch (error) {
        onError(error);
      }
    },
  };
}
