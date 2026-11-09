// launch-intent hygiene for twilight:// links on android (MainActivity is
// singleTask):
// - a task is relaunched with the intent that first opened it when the
//   process died in the background, so last night's twilight://sleep/stop
//   would be replayed as the "initial url". a restored activity
//   (savedInstanceState present) drops that stale link.
// - a link that brings an existing task back after process death arrives
//   through onNewIntent before react native is running and would be lost.
//   keeping it as the activity intent lets Linking.getInitialURL() see it.
// - fontScale added to configChanges so system font scale change does not
//   destroy/recreate MainActivity or mount a second react root.
// - alertDialogTheme configured to Material 3 with 28dp corners so app alerts
//   follow Material 3 instead of legacy AppCompat styles.
const { withMainActivity, withAndroidManifest, withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

const MARK = '// twilight: launch intent hygiene';
const GUARD = `    ${MARK}\n    if (savedInstanceState != null) intent?.data = null\n`;
const NEW_INTENT = `
  ${MARK}
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }
`;

function insertBefore(contents, anchor, text) {
  const index = contents.indexOf(anchor);
  if (index === -1) throw new Error(`plugins/android-launch-intent: "${anchor.trim()}" not found in MainActivity`);
  return `${contents.slice(0, index)}${text}${contents.slice(index)}`;
}

function withFontScaleConfig(config) {
  return withAndroidManifest(config, (cfg) => {
    const mainActivity = cfg.modResults.manifest.application?.[0]?.activity?.find(
      (a) => a.$?.['android:name'] === '.MainActivity'
    );
    if (mainActivity && mainActivity.$) {
      const current = mainActivity.$['android:configChanges'] || '';
      if (!current.includes('fontScale')) {
        mainActivity.$['android:configChanges'] = current ? `${current}|fontScale` : 'fontScale';
      }
    }
    return cfg;
  });
}

function withM3AlertTheme(config) {
  return withAndroidStyles(config, (cfg) => {
    AndroidConfig.Styles.setStylesItem({
      parent: { name: 'AppTheme' },
      xml: cfg.modResults,
      item: { $: { name: 'alertDialogTheme' }, _: '@style/M3AlertDialogTheme' },
    });
    AndroidConfig.Styles.setStylesItem({
      parent: { name: 'AppTheme' },
      xml: cfg.modResults,
      item: { $: { name: 'materialAlertDialogTheme' }, _: '@style/M3AlertDialogTheme' },
    });
    const styles = cfg.modResults.resources.style || [];
    if (!styles.some((s) => s.$?.name === 'M3AlertDialogTheme')) {
      styles.push({
        $: {
          name: 'M3AlertDialogTheme',
          parent: 'ThemeOverlay.Material3.MaterialAlertDialog',
        },
        item: [
          { $: { name: 'shapeAppearanceCornerExtraLarge' }, _: '@style/ShapeAppearance.M3.Corner.Dialog' },
          { $: { name: 'shapeAppearanceCornerMedium' }, _: '@style/ShapeAppearance.M3.Corner.Dialog' },
          { $: { name: 'cornerSize' }, _: '28dp' },
          { $: { name: 'colorPrimary' }, _: '#00D4FF' },
          { $: { name: 'colorAccent' }, _: '#00D4FF' },
        ],
      });
    }
    if (!styles.some((s) => s.$?.name === 'ShapeAppearance.M3.Corner.Dialog')) {
      styles.push({
        $: {
          name: 'ShapeAppearance.M3.Corner.Dialog',
          parent: '',
        },
        item: [
          { $: { name: 'cornerSize' }, _: '28dp' },
        ],
      });
    }
    cfg.modResults.resources.style = styles;
    return cfg;
  });
}

function withLaunchIntentHygiene(config) {
  config = withFontScaleConfig(config);
  config = withM3AlertTheme(config);
  return withMainActivity(config, (cfg) => {
    let { contents } = cfg.modResults;
    if (cfg.modResults.language !== 'kt') {
      throw new Error('plugins/android-launch-intent expects a kotlin MainActivity');
    }
    if (contents.includes(MARK)) return cfg;
    if (!contents.includes('import android.content.Intent')) {
      contents = insertBefore(contents, 'import android.os.Bundle', 'import android.content.Intent\n');
    }
    contents = insertBefore(contents, '    super.onCreate(', GUARD);
    contents = insertBefore(contents, '  /**\n   * Returns the name of the main component', `${NEW_INTENT}\n`);
    cfg.modResults.contents = contents;
    return cfg;
  });
}

withLaunchIntentHygiene.withFontScaleConfig = withFontScaleConfig;
withLaunchIntentHygiene.withM3AlertTheme = withM3AlertTheme;

module.exports = withLaunchIntentHygiene;
