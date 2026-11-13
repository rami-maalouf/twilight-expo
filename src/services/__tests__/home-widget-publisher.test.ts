// widget publishing never throws into the app, skips identical snapshots,
// retries after a failure, and forces a re-render on refresh
import { createHomeWidgetPublisher } from '../home-widget-publisher';
import { initialHomeWidgetProps } from '../home-widget-snapshot';

function clock() {
  let t = 1_000;
  return () => (t += 1);
}

describe('createHomeWidgetPublisher', () => {
  test('publishes changes once and skips identical snapshots', () => {
    const publish = jest.fn();
    const publisher = createHomeWidgetPublisher(publish, undefined, clock());
    const props = initialHomeWidgetProps();
    expect(publisher.update(props)).toBe(true);
    expect(publisher.update({ ...props })).toBe(false);
    expect(publisher.update({ ...props, sleeping: true })).toBe(true);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1][0].sleeping).toBe(true);
  });

  test('every publish carries a new render key so expo-widgets re-renders', () => {
    const publish = jest.fn();
    const publisher = createHomeWidgetPublisher(publish, undefined, clock());
    publisher.refresh();
    expect(publish).not.toHaveBeenCalled();
    publisher.update(initialHomeWidgetProps());
    publisher.refresh();
    publisher.refresh();
    const keys = publish.mock.calls.map(([props]) => props.renderKey);
    expect(keys).toEqual([1001, 1002, 1003]);
    expect(publish.mock.calls[2][0].bedtime).toBe('10:00 PM');
  });

  test('a failing sink is contained and the snapshot is retried', () => {
    const publish = jest.fn().mockImplementationOnce(() => {
      throw new Error('launcher gone');
    });
    const onError = jest.fn();
    const publisher = createHomeWidgetPublisher(publish, onError, clock());
    const props = initialHomeWidgetProps();
    expect(publisher.update(props)).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(publisher.update(props)).toBe(true);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  test('refresh failures are contained', () => {
    const onError = jest.fn();
    const publish = jest.fn();
    const publisher = createHomeWidgetPublisher(publish, onError, clock());
    publisher.update(initialHomeWidgetProps());
    publish.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(() => publisher.refresh()).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
