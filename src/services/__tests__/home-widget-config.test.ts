// the android widget config (app.json + plugins/android-widgets) and the js
// side must agree on widget names, drawable names and palette colors
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import appJson from '../../../app.json';
import { PALETTES } from '../../theme/palettes';
import {
  SLEEP_MODE_WIDGET,
  SLEEP_OVERVIEW_WIDGET,
  SLEEP_STATUS_WIDGET,
} from '../../../widgets/home-widget-props';
import { widgetColors } from '../home-widget-snapshot';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SKY_GRADIENTS, skyDrawableXml } = require('../../../plugins/android-widgets/sky.cjs');

type PluginEntry =
  | string
  | [string, { widgets?: { name: string; ios?: unknown; android?: { initialLayout?: string; previewImage?: string } }[] }];

function androidWidgets() {
  const entry = (appJson.expo.plugins as PluginEntry[]).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === './plugins/android-widgets/index.cjs'
  );
  if (!Array.isArray(entry)) throw new Error('android widgets plugin entry missing');
  return entry[1].widgets ?? [];
}

describe('android widget config', () => {
  test('app.json registers exactly the widgets the app publishes, android-only', () => {
    const widgets = androidWidgets();
    expect(widgets.map((w) => w.name).sort()).toEqual(
      [SLEEP_MODE_WIDGET, SLEEP_OVERVIEW_WIDGET, SLEEP_STATUS_WIDGET].sort()
    );
    for (const widget of widgets) {
      // ios: null keeps them out of the ios widget extension
      expect(widget.ios).toBeNull();
      expect(widget.android?.initialLayout).toMatch(/^widgets\/.+\.android\.tsx$/);
    }
  });

  test('every widget has a picker preview image shipped with the plugin', () => {
    for (const widget of androidWidgets()) {
      const preview = widget.android?.previewImage;
      expect(preview).toMatch(/^twilight_widget_preview_/);
      expect(
        existsSync(join(__dirname, '../../../plugins/android-widgets/res/drawable-nodpi', `${preview}.png`))
      ).toBe(true);
    }
  });

  test('the bare expo-widgets entry (ios live activity) is untouched', () => {
    expect(appJson.expo.plugins).toContain('expo-widgets');
  });

  test('every sky the snapshot names is generated, with the palette gradient', () => {
    for (const theme of Object.values(PALETTES)) {
      const sky = SKY_GRADIENTS[widgetColors(theme).sky];
      expect(sky).toEqual(
        expect.objectContaining({
          top: theme.backgroundGradientStart,
          bottom: theme.backgroundGradientEnd,
        })
      );
    }
    expect(SKY_GRADIENTS.twilight_widget_sky_active).toBeDefined();
  });

  test('sky drawables are rounded gradients, starry only at night', () => {
    const night = skyDrawableXml(SKY_GRADIENTS.twilight_widget_sky_twilight, '24dp');
    expect(night).toContain('android:startColor="#0a1520"');
    expect(night).toContain('android:radius="24dp"');
    expect(night).toContain('@drawable/twilight_widget_stars');
    expect(skyDrawableXml(SKY_GRADIENTS.twilight_widget_sky_sunset, '24dp')).not.toContain('stars');
  });
});
