// the back control of the onboarding steps after welcome (swift's inline
// navigation bar back button)
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OnboardingNavBar } from '@/components/onboarding/OnboardingNavBar';
import { SettingsStore, type KeyValueStorage } from '@/data/settings-store';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true) };
// a getter: the factory runs on the hoisted import, before mockRouter exists
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 0 } };

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return { getItemSync: (k) => map.get(k) ?? null, setItemSync: (k, v) => void map.set(k, v) };
}

function renderBar(disabled?: boolean) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider store={new SettingsStore(memoryKv())}>
        <OnboardingNavBar disabled={disabled} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await cleanup();
});

describe('onboarding nav bar', () => {
  test('back goes to the previous step', async () => {
    const { getByLabelText } = await renderBar();
    const back = getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
    await fireEvent.press(back);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('nothing to go back to: no navigation', async () => {
    mockRouter.canGoBack.mockReturnValueOnce(false);
    const { getByLabelText } = await renderBar();
    await fireEvent.press(getByLabelText('Back'));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('disabled while the step is busy', async () => {
    const { getByLabelText } = await renderBar(true);
    const back = getByLabelText('Back');
    expect(back.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(back);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
