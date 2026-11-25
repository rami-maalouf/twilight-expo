import { iconButtonInsets } from '../IconButton';

describe('iconButtonInsets', () => {
  test('a 20dp icon in a 48dp target overhangs 14dp vertically', () => {
    expect(iconButtonInsets(20)).toEqual({ marginVertical: -14 });
  });

  test('an edge button also hangs into that side padding', () => {
    expect(iconButtonInsets(16, 'end')).toEqual({ marginVertical: -16, marginRight: -16 });
    expect(iconButtonInsets(24, 'start')).toEqual({ marginVertical: -12, marginLeft: -12 });
  });

  test('icons at or above the target size do not overhang', () => {
    expect(iconButtonInsets(48)).toEqual({ marginVertical: -0 });
    expect(iconButtonInsets(56).marginVertical).toBeCloseTo(0);
  });
});
