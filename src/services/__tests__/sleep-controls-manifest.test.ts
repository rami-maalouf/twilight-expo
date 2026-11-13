// the quick settings tile and launcher shortcut declarations in the local
// module's manifest. regression guard: without ACTIVE_TILE, android ignores
// requestListeningState, so the tile kept "Start Sleep / Off" after a session
// started from the tile itself or the app until the tile was rebound
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAIN = join(__dirname, '../../../modules/twilight-widget-actions/android/src/main');
const manifest = readFileSync(join(MAIN, 'AndroidManifest.xml'), 'utf8');
const strings = readFileSync(join(MAIN, 'res/values/twilight_sleep_controls_strings.xml'), 'utf8');

// the element with its children (up to </tag>) or just its self-closing tag
function element(tag: string, name: string): string {
  const open = manifest.match(
    new RegExp(`<${tag}\\s[^>]*android:name="expo\\.modules\\.twilightwidgetactions\\.${name}"[^>]*>`)
  );
  if (!open || open.index == null) throw new Error(`${tag} ${name} missing from the module manifest`);
  if (open[0].endsWith('/>')) return open[0];
  return manifest.slice(open.index, manifest.indexOf(`</${tag}>`, open.index));
}

function string(name: string): string | undefined {
  return strings.match(new RegExp(`<string name="${name}">([^<]*)</string>`))?.[1];
}

describe('quick settings tile declaration', () => {
  const tile = element('service', 'TwilightSleepTileService');

  test('is bindable only by the system as a quick settings tile', () => {
    expect(tile).toContain('android:exported="true"');
    expect(tile).toContain('android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"');
    expect(tile).toContain('<action android:name="android.service.quicksettings.action.QS_TILE" />');
  });

  test('is an active tile, so every session change the app publishes reaches the shade', () => {
    expect(tile).toMatch(
      /<meta-data\s+android:name="android\.service\.quicksettings\.ACTIVE_TILE"\s+android:value="true"\s*\/>/
    );
  });

  test('uses the swift control copy', () => {
    expect(tile).toContain('android:label="@string/twilight_tile_name"');
    expect(string('twilight_tile_name')).toBe('Twilight Sleep Mode');
    expect([string('twilight_tile_start'), string('twilight_tile_wake')]).toEqual(['Start Sleep', 'Wake Up']);
    expect([string('twilight_tile_off'), string('twilight_tile_on')]).toEqual(['Off', 'On']);
  });
});

describe('launcher shortcut trampoline', () => {
  const trampoline = element('activity', 'TwilightSleepShortcutActivity');

  test('is private, invisible and never kept in recents or history', () => {
    expect(trampoline).toContain('android:exported="false"');
    expect(trampoline).toContain('android:theme="@android:style/Theme.NoDisplay"');
    expect(trampoline).toContain('android:noHistory="true"');
    expect(trampoline).toContain('android:excludeFromRecents="true"');
  });

  test('uses the swift app shortcut titles', () => {
    expect(string('twilight_shortcut_start_long')).toBe('Start Sleep Mode');
    expect(string('twilight_shortcut_wake')).toBe('Wake Up');
  });
});
