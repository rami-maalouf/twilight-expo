import { androidSymbolFor, SF_TO_ANDROID } from '@/components/common/native-symbol-map';

const USED_SF_NAMES = [
  'arrow.down',
  'arrow.down.circle.fill',
  'arrow.down.right',
  'arrow.right',
  'arrow.up',
  'arrow.up.circle.fill',
  'arrow.up.right',
  'bed.double.fill',
  'bell.fill',
  'bubble.left.and.bubble.right.fill',
  'calendar',
  'calendar.badge.clock',
  'calendar.badge.exclamationmark',
  'camera.fill',
  'chart.bar.fill',
  'chart.bar.xaxis',
  'chart.line.uptrend.xyaxis.circle.fill',
  'chart.xyaxis.line',
  'checkmark.circle.fill',
  'chevron.right',
  'chevron.up.chevron.down',
  'clock',
  'clock.fill',
  'crown.fill',
  'dollarsign',
  'exclamationmark.circle.fill',
  'exclamationmark.triangle.fill',
  'flame.fill',
  'heart.fill',
  'heart.text.square.fill',
  'info.circle',
  'iphone.slash',
  'link',
  'mic.slash.fill',
  'minus',
  'moon.fill',
  'moon.stars',
  'moon.stars.fill',
  'person.text.rectangle',
  'plus',
  'scale.3d',
  'scope',
  'sparkles',
  'sun.max.fill',
  'sunrise.fill',
  'target',
  'waveform.path.ecg',
  'xmark.circle.fill',
] as const;

describe('NativeSymbol mapping', () => {
  it('maps every sf name used in the app to a material symbol', () => {
    for (const name of USED_SF_NAMES) {
      expect(SF_TO_ANDROID[name]).toBeDefined();
      expect(androidSymbolFor(name)).not.toBe('help');
    }
  });

  it('falls back to help for unknown names', () => {
    expect(androidSymbolFor('not.a.real.symbol' as never)).toBe('help');
  });
});
