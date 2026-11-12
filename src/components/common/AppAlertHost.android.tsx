// android: renders the queued app alert as a jetpack compose material 3
// AlertDialog (28dp corners, m3 type scale, tonal surface seeded from the
// palette accent, accent text buttons, error-colored destructive actions).
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/alertdialog/
import { AlertDialog, Host, Row, Text, TextButton } from '@expo/ui/jetpack-compose';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useStore } from 'zustand';

import { useTheme } from '@/theme/ThemeProvider';
import { alertQueue, cancelButtonOf, registerAlertHost, resolveAlert, splitButtons, type AppAlertButton } from './app-alert';

const ERROR_DARK = '#ffb4ab';
const ERROR_LIGHT = '#ba1a1a';

export function AppAlertHost() {
  const theme = useTheme();
  const isLight = theme.name === 'sunset';
  const current = useStore(alertQueue, (s) => s.queue[0]);

  useEffect(() => registerAlertHost(), []);

  if (!current) return null;
  const { dismiss, confirm } = splitButtons(current);
  const cancel = cancelButtonOf(current);
  const buttonColor = (button: AppAlertButton) =>
    button.style === 'destructive' ? (isLight ? ERROR_LIGHT : ERROR_DARK) : theme.accent;
  const renderButtons = (buttons: AppAlertButton[]) => (
    <Row>
      {buttons.map((button) => (
        <TextButton
          key={button.text}
          colors={{ contentColor: buttonColor(button) }}
          onClick={() => resolveAlert(current.id, button)}>
          <Text style={{ typography: 'labelLarge' }}>{button.text}</Text>
        </TextButton>
      ))}
    </Row>
  );

  return (
    <Host
      key={current.id}
      style={styles.host}
      colorScheme={isLight ? 'light' : 'dark'}
      seedColor={theme.accent}
      pointerEvents="none">
      <AlertDialog
        properties={{ dismissOnBackPress: !!cancel, dismissOnClickOutside: !!cancel }}
        onDismissRequest={() => {
          if (cancel) resolveAlert(current.id, cancel);
        }}>
        <AlertDialog.Title>
          <Text style={{ typography: 'headlineSmall' }}>{current.title}</Text>
        </AlertDialog.Title>
        {current.message ? (
          <AlertDialog.Text>
            <Text style={{ typography: 'bodyMedium' }}>{current.message}</Text>
          </AlertDialog.Text>
        ) : null}
        {confirm.length > 0 ? <AlertDialog.ConfirmButton>{renderButtons(confirm)}</AlertDialog.ConfirmButton> : null}
        {dismiss.length > 0 ? <AlertDialog.DismissButton>{renderButtons(dismiss)}</AlertDialog.DismissButton> : null}
      </AlertDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  // the dialog opens in its own window; the host only anchors it
  host: { position: 'absolute', width: 1, height: 1, left: 0, top: 0 },
});
