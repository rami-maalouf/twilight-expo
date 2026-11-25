// config plugin for the twilight health connect module (docs/health-connect.md 2.8).
// adds to the app manifest: the sleep permissions, the optional history
// permission, the <queries> entry for the health connect provider, the
// rationale activity (android 13 and lower) and the android 14+
// VIEW_PERMISSION_USAGE activity-alias. idempotent: running prebuild twice
// leaves one copy of each entry.
const { withAndroidManifest } = require('expo/config-plugins');

const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';
const RATIONALE_ACTIVITY = 'expo.modules.twilighthealthconnect.HealthConnectRationaleActivity';
const USAGE_ALIAS = 'expo.modules.twilighthealthconnect.ViewPermissionUsageActivity';
const PRIVACY_POLICY_META_DATA = 'twilight.healthconnect.PRIVACY_POLICY_URL';
const PERMISSIONS = [
  'android.permission.health.READ_SLEEP',
  'android.permission.health.WRITE_SLEEP',
  'android.permission.health.READ_HEALTH_DATA_HISTORY',
];

function ensureArray(object, key) {
  if (!Array.isArray(object[key])) object[key] = [];
  return object[key];
}

function upsertByName(list, entry) {
  const name = entry.$['android:name'];
  const index = list.findIndex((item) => item.$ && item.$['android:name'] === name);
  if (index === -1) list.push(entry);
  else list[index] = entry;
}

function applyHealthConnectManifest(manifest, options = {}) {
  const root = manifest.manifest;

  const permissions = ensureArray(root, 'uses-permission');
  for (const name of PERMISSIONS) {
    if (!permissions.some((p) => p.$ && p.$['android:name'] === name)) {
      permissions.push({ $: { 'android:name': name } });
    }
  }

  const queries = ensureArray(root, 'queries');
  if (queries.length === 0) queries.push({});
  const hasProvider = queries.some((q) =>
    (q.package ?? []).some((p) => p.$ && p.$['android:name'] === PROVIDER_PACKAGE)
  );
  if (!hasProvider) ensureArray(queries[0], 'package').push({ $: { 'android:name': PROVIDER_PACKAGE } });

  const application = ensureArray(root, 'application');
  if (application.length === 0) application.push({ $: {} });
  const app = application[0];

  upsertByName(ensureArray(app, 'activity'), {
    $: { 'android:name': RATIONALE_ACTIVITY, 'android:exported': 'true' },
    'intent-filter': [
      { action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }] },
    ],
  });

  upsertByName(ensureArray(app, 'activity-alias'), {
    $: {
      'android:name': USAGE_ALIAS,
      'android:exported': 'true',
      'android:targetActivity': RATIONALE_ACTIVITY,
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
        category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
      },
    ],
  });

  const metaData = ensureArray(app, 'meta-data');
  const metaIndex = metaData.findIndex((m) => m.$ && m.$['android:name'] === PRIVACY_POLICY_META_DATA);
  if (metaIndex !== -1) metaData.splice(metaIndex, 1);
  if (options.privacyPolicyUrl) {
    if (!/^https:\/\//.test(options.privacyPolicyUrl)) {
      throw new Error('twilight-health-connect: privacyPolicyUrl must start with https://');
    }
    metaData.push({ $: { 'android:name': PRIVACY_POLICY_META_DATA, 'android:value': options.privacyPolicyUrl } });
  }

  return manifest;
}

function withTwilightHealthConnect(config, options = {}) {
  return withAndroidManifest(config, (next) => {
    next.modResults = applyHealthConnectManifest(next.modResults, options);
    return next;
  });
}

module.exports = withTwilightHealthConnect;
module.exports.applyHealthConnectManifest = applyHealthConnectManifest;
module.exports.HEALTH_CONNECT_PERMISSIONS = PERMISSIONS;
