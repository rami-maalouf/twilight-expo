// eslint-disable-next-line @typescript-eslint/no-require-imports
const withLaunchIntentHygiene = require('../../../plugins/android-launch-intent.cjs');

describe('plugins/android-launch-intent', () => {
  it('appends fontScale to android:configChanges in AndroidManifest', async () => {
    const rawConfig = {
      name: 'Twilight',
      slug: 'twilight',
      _internal: { projectRoot: '.' },
      mods: {},
    };
    const pluginResult = withLaunchIntentHygiene(rawConfig);
    const manifestAction = pluginResult.mods?.android?.manifest;
    expect(manifestAction).toBeDefined();

    const mockConfig = {
      modResults: {
        manifest: {
          application: [
            {
              activity: [
                {
                  $: {
                    'android:name': '.MainActivity',
                    'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize',
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const evaluated = await manifestAction(mockConfig);
    const mainActivity = evaluated.modResults.manifest.application[0].activity[0];
    expect(mainActivity.$['android:configChanges']).toContain('fontScale');
    expect(mainActivity.$['android:configChanges']).toBe(
      'keyboard|keyboardHidden|orientation|screenSize|fontScale'
    );
  });

  it('configures M3AlertDialogTheme with 28dp corners in styles.xml', async () => {
    const rawConfig = {
      name: 'Twilight',
      slug: 'twilight',
      _internal: { projectRoot: '.' },
      mods: {},
    };
    const pluginResult = withLaunchIntentHygiene(rawConfig);
    const stylesAction = pluginResult.mods?.android?.styles;
    expect(stylesAction).toBeDefined();

    const mockStyles = {
      modResults: {
        resources: {
          style: [
            {
              $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
              item: [],
            },
          ],
        },
      },
    };

    const evaluated = await stylesAction(mockStyles);
    const appTheme = evaluated.modResults.resources.style.find(
      (s: any) => s.$?.name === 'AppTheme'
    );
    expect(appTheme.item.some((i: any) => i.$?.name === 'alertDialogTheme')).toBe(true);

    const m3Dialog = evaluated.modResults.resources.style.find(
      (s: any) => s.$?.name === 'M3AlertDialogTheme'
    );
    expect(m3Dialog).toBeDefined();
    expect(m3Dialog.item.some((i: any) => i.$?.name === 'cornerSize' && i._ === '28dp')).toBe(true);
  });
});
