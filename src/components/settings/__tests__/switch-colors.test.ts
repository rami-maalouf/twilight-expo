import { onAccentColor, switchColors } from '../switch-colors';

describe('switchColors', () => {
  it('tints the checked track with the palette accent', () => {
    const colors = switchColors('#00d4ff', false);
    expect(colors.checkedTrackColor).toBe('#00d4ff');
    expect(colors.checkedBorderColor).toBe('#00d4ff');
  });

  it('puts a dark thumb on light accents and a white thumb on dark ones', () => {
    expect(onAccentColor('#00d4ff')).toBe('#0b1a24');
    expect(onAccentColor('#2d1b2e')).toBe('#ffffff');
    expect(onAccentColor('#4f5bd5')).toBe('#ffffff');
  });

  it('keeps the unchecked track visible in light mode', () => {
    const colors = switchColors('#2d1b2e', true);
    expect(colors.uncheckedTrackColor).toBe('#e6e0e9');
    expect(colors.uncheckedBorderColor).toBe('#79747e');
  });

  it('uses gray-only disabled colors', () => {
    const colors = switchColors('#00d4ff', false);
    expect(colors.disabledCheckedTrackColor).toBe('rgba(230, 225, 229, 0.12)');
    expect(colors.disabledUncheckedThumbColor).toBe('rgba(230, 225, 229, 0.38)');
  });
});
