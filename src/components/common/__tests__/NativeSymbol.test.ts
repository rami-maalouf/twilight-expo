import { androidSymbolFor, SF_TO_ANDROID } from '@/components/common/native-symbol-map';

const USED_SF_NAMES = [
  'arrow.clockwise',
  'arrow.down',
  'arrow.down.circle.fill',
  'arrow.down.right',
  'arrow.right',
  'arrow.triangle.2.circlepath',
  'arrow.triangle.2.circlepath.circle.fill',
  'arrow.up',
  'arrow.up.circle.fill',
  'arrow.up.forward.app',
  'arrow.up.right',
  'bed.double.fill',
  'bell.fill',
  'bolt.fill',
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
  'checkmark.seal.fill',
  'chevron.left',
  'chevron.right',
  'chevron.up.chevron.down',
  'clock',
  'clock.arrow.circlepath',
  'clock.fill',
  'crown.fill',
  'dollarsign',
  'exclamationmark.circle.fill',
  'exclamationmark.triangle.fill',
  'flame.fill',
  'gearshape.fill',
  'hand.raised.fill',
  'heart.fill',
  'heart.text.square.fill',
  'info.circle',
  'info.circle.fill',
  'iphone.slash',
  'link',
  'lock.shield.fill',
  'mic.slash.fill',
  'minus',
  'moon.fill',
  'moon.stars',
  'moon.stars.fill',
  'pause.circle.fill',
  'pencil.and.scribble',
  'person.crop.circle.badge.questionmark',
  'person.text.rectangle',
  'plus',
  'scale.3d',
  'scope',
  'sparkles',
  'sparkles.rectangle.stack.fill',
  'square.and.arrow.down.fill',
  'sun.max.fill',
  'sunrise.fill',
  'target',
  'trash.fill',
  'waveform.path.ecg',
  'waveform.path.ecg.text.page.fill',
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
