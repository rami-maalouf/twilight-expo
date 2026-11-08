// widget publishing never throws into the app, skips identical snapshots and
// retries after a failure
import { createHomeWidgetPublisher } from '../home-widget-publisher';
import { initialHomeWidgetProps } from '../home-widget-snapshot';

function sink() {
  return { publish: jest.fn(), reload: jest.fn() };
}

describe('createHomeWidgetPublisher', () => {
  test('publishes changes once and skips identical snapshots', () => {
    const s = sink();
    const publisher = createHomeWidgetPublisher(s);
    const props = initialHomeWidgetProps();
    expect(publisher.update(props)).toBe(true);
    expect(publisher.update({ ...props })).toBe(false);
    expect(publisher.update({ ...props, sleeping: true })).toBe(true);
    expect(s.publish).toHaveBeenCalledTimes(2);
  });

  test('a failing sink is contained and the snapshot is retried', () => {
    const s = sink();
    const onError = jest.fn();
    s.publish.mockImplementationOnce(() => {
      throw new Error('launcher gone');
    });
    const publisher = createHomeWidgetPublisher(s, onError);
    const props = initialHomeWidgetProps();
    expect(() => publisher.update(props)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(publisher.update(props)).toBe(true);
    expect(s.publish).toHaveBeenCalledTimes(2);
  });

  test('refresh re-renders and contains reload failures', () => {
    const s = sink();
    const onError = jest.fn();
    s.reload.mockImplementation(() => {
      throw new Error('no native module');
    });
    const publisher = createHomeWidgetPublisher(s, onError);
    expect(() => publisher.refresh()).not.toThrow();
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
