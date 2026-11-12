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
  'info.circle',
  'iphone.slash',
  'link',
  'mic.slash.fill',
  'minus',
  'moon.fill',
  'moon.stars',
  'moon.stars.fill',
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

// every sf name written as a literal in app source (.ts and .tsx under src/
// and widgets/), in single, double or back quotes: symbol element name
// props, `icon:` entries, dotted `name:` / `systemImage:` values, the first
// argument of row / icon / symbol helpers, and `cond ? 'a.b' : 'c.d'` pairs
function sfNamesInSource(): Set<string> {
  const names = new Set<string>();
  const anyName = String.raw`[a-z][a-z0-9]*(?:\.[a-z0-9]+)*`;
  const dotted = String.raw`[a-z][a-z0-9]*(?:\.[a-z0-9]+)+`;
  const q = String.raw`['"\x60]`;
  const patterns = [
    new RegExp(String.raw`<(?:SymbolView|NativeSymbol)[^>]*?\bname=(?:"(${anyName})"|\{${q}(${anyName})${q}\})`, 'g'),
    new RegExp(String.raw`\bicon\s*:\s*${q}(${anyName})${q}`, 'g'),
    new RegExp(String.raw`\b(?:name|systemImage)\s*[:=]\s*\{?${q}(${dotted})${q}`, 'g'),
    new RegExp(String.raw`\b\w*(?:Row|Icon|Symbol)\(\s*${q}(${anyName})${q}`, 'g'),
    new RegExp(String.raw`\?\s*${q}(${dotted})${q}\s*:\s*${q}(${dotted})${q}`, 'g'),
  ];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(full, 'utf8');
        for (const pattern of patterns) {
          for (const match of source.matchAll(pattern)) {
            for (const group of match.slice(1)) if (group) names.add(group);
          }
        }
      }
    }
  };
  const root = path.join(__dirname, '..', '..', '..', '..');
  walk(path.join(root, 'src'));
  walk(path.join(root, 'widgets'));
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
    // the hand list documents known names; the scan must find all of them
    expect(USED_SF_NAMES.filter((name) => !names.has(name))).toEqual([]);
    const unmapped = [...names].filter((name) => SF_TO_ANDROID[name] == null);
    expect(unmapped).toEqual([]);
  });

  it('falls back to help for unknown names', () => {
    expect(androidSymbolFor('not.a.real.symbol' as never)).toBe('help');
  });
});

// codepoints the font's unicode cmap maps to a glyph (formats 4 and 12)
function fontCodepoints(file: string): Set<number> {
  const font = fs.readFileSync(file);
  const tables = font.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (font.toString('latin1', record, record + 4) === 'cmap') cmap = font.readUInt32BE(record + 8);
  }
  const points = new Set<number>();
  if (cmap < 0) return points;
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4);
    const format = font.readUInt16BE(sub);
    if (format === 4) {
      const segments = font.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const ranges = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const end = font.readUInt16BE(ends + s * 2);
        const start = font.readUInt16BE(starts + s * 2);
        const delta = font.readInt16BE(deltas + s * 2);
        const rangeOffset = font.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const glyph =
            rangeOffset === 0
              ? (c + delta) & 0xffff
              : font.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2);
          if (glyph !== 0) points.add(c);
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < font.readUInt32BE(sub + 12); g++) {
        const group = sub + 16 + g * 12;
        for (let c = font.readUInt32BE(group); c <= font.readUInt32BE(group + 4); c++) points.add(c);
      }
    }
  }
  return points;
}

describe('filled symbols', () => {
  it('the generated font has a glyph for every codepoint in filled-symbols.json', () => {
    const filled = require('../filled-symbols.json') as Record<string, number>;
    const points = fontCodepoints(path.join(__dirname, '..', '..', '..', '..', 'assets', 'fonts', 'MaterialSymbolsFilled.ttf'));
    expect(points.size).toBeGreaterThan(0);
    const missing = Object.entries(filled)
      .filter(([, codepoint]) => !points.has(codepoint))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('has a solid glyph for every .fill mapping (rerun scripts/generate-filled-symbols.py)', () => {
    const filled = require('../filled-symbols.json') as Record<string, number>;
    const missing = Object.entries(SF_TO_ANDROID)
      .filter(([sf, android]) => sf.endsWith('.fill') && filled[android] == null)
      .map(([sf]) => sf);
    expect(missing).toEqual([]);
  });
});
