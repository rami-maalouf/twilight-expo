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
const { withMainActivity, withAndroidManifest } = require('expo/config-plugins');

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

module.exports = function withLaunchIntentHygiene(config) {
  config = withFontScaleConfig(config);
  return withMainActivity(config, (config) => {
    let { contents } = config.modResults;
    if (config.modResults.language !== 'kt') {
      throw new Error('plugins/android-launch-intent expects a kotlin MainActivity');
    }
    if (contents.includes(MARK)) return config;
    if (!contents.includes('import android.content.Intent')) {
      contents = insertBefore(contents, 'import android.os.Bundle', 'import android.content.Intent\n');
    }
    contents = insertBefore(contents, '    super.onCreate(', GUARD);
    contents = insertBefore(contents, '  /**\n   * Returns the name of the main component', `${NEW_INTENT}\n`);
    config.modResults.contents = contents;
    return config;
  });
};
