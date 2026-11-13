import { render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SettingsStore, type KeyValueStorage } from '../../../data/settings-store';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { CircularTimePicker } from '../CircularTimePicker';

// canvaskit is not loaded under jest; the drawing is not under test here
jest.mock('@shopify/react-native-skia', () => {
  const Draw = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Canvas: Draw,
    Group: Draw,
    Circle: Draw,
    Path: Draw,
    RoundedRect: Draw,
    BlurMask: Draw,
    SweepGradient: Draw,
    LinearGradient: Draw,
    vec: (x: number, y: number) => ({ x, y }),
    Skia: {
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
      PathBuilder: { Make: () => ({ addArc() {}, build: () => ({}) }) },
    },
  };
});

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItemSync: (key) => map.get(key) ?? null,
    setItemSync: (key, value) => {
      map.set(key, value);
    },
  };
}

function renderPicker(sleepMinutes: number, wakeMinutes: number) {
  return render(
    <GestureHandlerRootView>
      <ThemeProvider store={new SettingsStore(memoryKv())}>
        <CircularTimePicker sleepMinutes={sleepMinutes} wakeMinutes={wakeMinutes} onChange={() => {}} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

describe('CircularTimePicker', () => {
  test('hour markers read 12 AM, 6 AM, 12 PM, 6 PM (swift showed "18 PM")', async () => {
    await renderPicker(22 * 60, 7 * 60);
    expect(screen.queryByText('18')).toBeNull();
    expect(screen.getAllByText('6')).toHaveLength(2);
    expect(screen.getAllByText('12')).toHaveLength(2);
  });

  test('the centre shows the exact duration for 23:10 -> 06:50', async () => {
    await renderPicker(23 * 60 + 10, 6 * 60 + 50);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
  });
});
