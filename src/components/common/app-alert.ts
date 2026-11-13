// app alerts. ios keeps the native UIAlertController (Alert.alert, like the
// swift .alert modifiers). android shows a jetpack compose material 3
// AlertDialog colored from the active palette (AppAlertHost, mounted once at
// the root), instead of the legacy appcompat dialog. without a mounted host
// (headless task, tests) android falls back to Alert.alert.
import { Alert, Platform } from 'react-native';
import { createStore } from 'zustand/vanilla';

export interface AppAlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AppAlert {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
}

interface AlertQueueState {
  queue: AppAlert[];
  hosts: number;
}

export const alertQueue = createStore<AlertQueueState>(() => ({ queue: [], hosts: 0 }));

let nextId = 1;

const DEFAULT_BUTTONS: AppAlertButton[] = [{ text: 'OK' }];

export function showAlert(title: string, message?: string, buttons?: AppAlertButton[]): void {
  const list = buttons && buttons.length > 0 ? buttons : DEFAULT_BUTTONS;
  if (Platform.OS !== 'android' || alertQueue.getState().hosts === 0) {
    Alert.alert(title, message, list);
    return;
  }
  const alert: AppAlert = { id: nextId++, title, message, buttons: list };
  alertQueue.setState((s) => ({ queue: [...s.queue, alert] }));
}

// the host shows queue[0]; a button press or a dismiss removes it and then
// runs the button's handler (which may queue the next alert)
export function resolveAlert(id: number, button?: AppAlertButton): void {
  alertQueue.setState((s) => ({ queue: s.queue.filter((a) => a.id !== id) }));
  button?.onPress?.();
}

// dismissing by back or scrim runs the cancel button like ios' cancel role;
// an alert without a cancel button cannot be dismissed that way
export function cancelButtonOf(alert: AppAlert): AppAlertButton | undefined {
  return alert.buttons.find((b) => b.style === 'cancel');
}

// material puts the dismissive action left of the confirming one: cancel
// buttons go to the dismiss slot, the rest (in order) to the confirm slot
export function splitButtons(alert: AppAlert): { dismiss: AppAlertButton[]; confirm: AppAlertButton[] } {
  return {
    dismiss: alert.buttons.filter((b) => b.style === 'cancel'),
    confirm: alert.buttons.filter((b) => b.style !== 'cancel'),
  };
}

export function registerAlertHost(): () => void {
  alertQueue.setState((s) => ({ hosts: s.hosts + 1 }));
  return () => alertQueue.setState((s) => ({ hosts: Math.max(0, s.hosts - 1) }));
}
