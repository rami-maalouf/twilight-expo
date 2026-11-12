import fs from 'fs';
import path from 'path';

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

// every sf name written as a literal in app source: symbol name props,
// `icon: '...'` entries and `cond ? 'a.b' : 'c.d'` pairs
function sfNamesInSource(): Set<string> {
  const names = new Set<string>();
  const sfName = String.raw`[a-z][a-z0-9]*(?:\.[a-z0-9]+)+`;
  const patterns = [
    new RegExp(String.raw`<(?:SymbolView|NativeSymbol)[^>]*?\bname=(?:"(${sfName})"|\{'(${sfName})'\})`, 'g'),
    new RegExp(String.raw`\b(?:icon|name)\s*[:=]\s*'(${sfName})'`, 'g'),
    new RegExp(String.raw`\?\s*'(${sfName})'\s*:\s*'(${sfName})'`, 'g'),
  ];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (entry.name.endsWith('.tsx')) {
        const source = fs.readFileSync(full, 'utf8');
        for (const pattern of patterns) {
          for (const match of source.matchAll(pattern)) {
            for (const group of match.slice(1)) if (group) names.add(group);
          }
        }
      }
    }
  };
  walk(path.join(__dirname, '..', '..', '..'));
  return names;
}

describe('NativeSymbol mapping', () => {
  it('maps every sf name used in the app to a material symbol', () => {
    for (const name of USED_SF_NAMES) {
      expect(SF_TO_ANDROID[name]).toBeDefined();
      expect(androidSymbolFor(name)).not.toBe('help');
    }
  });

  it('maps every sf name found in the app source', () => {
    const names = sfNamesInSource();
    expect(names.size).toBeGreaterThan(30);
    const unmapped = [...names].filter((name) => SF_TO_ANDROID[name] == null);
    expect(unmapped).toEqual([]);
  });

  it('falls back to help for unknown names', () => {
    expect(androidSymbolFor('not.a.real.symbol' as never)).toBe('help');
  });
});

describe('filled symbols', () => {
  it('has a solid glyph for every .fill mapping (rerun scripts/generate-filled-symbols.py)', () => {
    const filled = require('../filled-symbols.json') as Record<string, number>;
    const missing = Object.entries(SF_TO_ANDROID)
      .filter(([sf, android]) => sf.endsWith('.fill') && filled[android] == null)
      .map(([sf]) => sf);
    expect(missing).toEqual([]);
  });
});
