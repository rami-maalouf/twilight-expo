// material 3 switch colors with the palette accent as the "primary" role.
// the thumb on a checked track uses the accent's on-color (dark on light
// accents, white on dark ones); unchecked and disabled colors are the m3
// baseline surface / outline roles for the current light or dark scheme.
export interface SwitchColorSet {
  checkedTrackColor: string;
  checkedBorderColor: string;
  checkedThumbColor: string;
  uncheckedTrackColor: string;
  uncheckedBorderColor: string;
  uncheckedThumbColor: string;
  disabledCheckedTrackColor: string;
  disabledCheckedBorderColor: string;
  disabledCheckedThumbColor: string;
  disabledUncheckedTrackColor: string;
  disabledUncheckedBorderColor: string;
  disabledUncheckedThumbColor: string;
}

function relativeLuminance(hex: string): number {
  const v = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((v >> 16) & 0xff) + 0.7152 * channel((v >> 8) & 0xff) + 0.0722 * channel(v & 0xff);
}

export function onAccentColor(accent: string): string {
  return relativeLuminance(accent) > 0.35 ? '#0b1a24' : '#ffffff';
}

export function switchColors(accent: string, isLight: boolean): SwitchColorSet {
  const onSurface = isLight ? '29, 27, 32' : '230, 225, 229';
  const surface = isLight ? '#fef7ff' : '#141218';
  const outline = isLight ? '#79747e' : '#938f99';
  return {
    checkedTrackColor: accent,
    checkedBorderColor: accent,
    checkedThumbColor: onAccentColor(accent),
    uncheckedTrackColor: isLight ? '#e6e0e9' : '#36343b',
    uncheckedBorderColor: outline,
    uncheckedThumbColor: outline,
    disabledCheckedTrackColor: `rgba(${onSurface}, 0.12)`,
    disabledCheckedBorderColor: 'rgba(0, 0, 0, 0)',
    disabledCheckedThumbColor: surface,
    disabledUncheckedTrackColor: `rgba(${onSurface}, 0.04)`,
    disabledUncheckedBorderColor: `rgba(${onSurface}, 0.12)`,
    disabledUncheckedThumbColor: `rgba(${onSurface}, 0.38)`,
  };
}
