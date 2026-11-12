// worklets' official jest mock (https://docs.swmansion.com/react-native-worklets/docs/guides/testing).
// gesture-handler 3 reads getUIRuntimeHolder() from worklets at import time,
// which the web build that the reanimated resolver selects throws on.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// safe area mock for unit tests
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
