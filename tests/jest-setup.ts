// worklets' official jest mock (https://docs.swmansion.com/react-native-worklets/docs/guides/testing).
// gesture-handler 3 reads getUIRuntimeHolder() from worklets at import time,
// which the web build that the reanimated resolver selects throws on.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// safe area mock for unit tests
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// expo-observe is a native module; tests check behavior, not telemetry
jest.mock('expo-observe', () => {
  const React = require('react');
  const markInteractive = jest.fn();
  return {
    Observe: { configure: jest.fn(), reportError: jest.fn(), logEvent: jest.fn(), dispatchEvents: jest.fn() },
    ObserveRoot: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children),
    ObserveErrorBoundary: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children),
    useObserve: () => ({ markInteractive }),
  };
});
