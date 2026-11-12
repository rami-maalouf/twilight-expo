import { Alert, Platform } from 'react-native';

import { alertQueue, cancelButtonOf, registerAlertHost, resolveAlert, showAlert, splitButtons } from '../app-alert';

describe('app alerts', () => {
  const originalOS = Platform.OS;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertQueue.setState({ queue: [], hosts: 0 });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
    alertSpy.mockRestore();
  });

  it('uses the native alert on ios', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    registerAlertHost();
    showAlert('Pause...', 'joke');
    expect(alertSpy).toHaveBeenCalledWith('Pause...', 'joke', [{ text: 'OK' }]);
    expect(alertQueue.getState().queue).toHaveLength(0);
  });

  it('falls back to the native alert on android without a mounted host', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    showAlert('Pause...', 'joke');
    expect(alertSpy).toHaveBeenCalled();
  });

  it('queues alerts for the android host and resolves them in order', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const unregister = registerAlertHost();
    const onDelete = jest.fn();
    showAlert('Remove Demo Data', 'body', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Exit Demo', style: 'destructive', onPress: onDelete },
    ]);
    showAlert('Second');
    expect(alertSpy).not.toHaveBeenCalled();
    const [first, second] = alertQueue.getState().queue;
    expect(splitButtons(first).dismiss.map((b) => b.text)).toEqual(['Cancel']);
    expect(splitButtons(first).confirm.map((b) => b.text)).toEqual(['Exit Demo']);
    expect(cancelButtonOf(first)?.text).toBe('Cancel');
    expect(cancelButtonOf(second)).toBeUndefined();

    resolveAlert(first.id, splitButtons(first).confirm[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(alertQueue.getState().queue.map((a) => a.title)).toEqual(['Second']);
    unregister();
    expect(alertQueue.getState().hosts).toBe(0);
  });
});
