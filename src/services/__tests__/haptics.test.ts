import * as Haptics from 'expo-haptics';

import { hapticPlan, type HapticEvent } from '../haptics';

const EVENTS: HapticEvent[] = ['selection', 'dial-grab', 'dial-tick', 'dial-release', 'long-press', 'tap'];

describe('hapticPlan', () => {
  it('keeps the swift impact styles on ios', () => {
    expect(hapticPlan('selection', 'ios')).toEqual({ kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium });
    expect(hapticPlan('dial-tick', 'ios')).toEqual({ kind: 'impact', style: Haptics.ImpactFeedbackStyle.Light });
    expect(hapticPlan('dial-grab', 'ios')).toEqual({ kind: 'impact', style: Haptics.ImpactFeedbackStyle.Light });
    expect(hapticPlan('dial-release', 'ios')).toEqual({ kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium });
    expect(hapticPlan('long-press', 'ios')).toEqual({ kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium });
    expect(hapticPlan('tap', 'ios')).toEqual({ kind: 'impact', style: Haptics.ImpactFeedbackStyle.Light });
  });

  it('uses native android haptic constants', () => {
    expect(hapticPlan('selection', 'android')).toEqual({ kind: 'android', type: Haptics.AndroidHaptics.Segment_Tick });
    expect(hapticPlan('dial-tick', 'android')).toEqual({ kind: 'android', type: Haptics.AndroidHaptics.Clock_Tick });
    expect(hapticPlan('dial-release', 'android')).toEqual({ kind: 'android', type: Haptics.AndroidHaptics.Confirm });
    expect(hapticPlan('long-press', 'android')).toEqual({ kind: 'android', type: Haptics.AndroidHaptics.Long_Press });
  });

  it('never plans an emulated impact on android', () => {
    for (const event of EVENTS) expect(hapticPlan(event, 'android').kind).toBe('android');
  });
});
