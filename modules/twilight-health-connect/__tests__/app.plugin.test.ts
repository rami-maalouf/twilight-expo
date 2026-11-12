// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../app.plugin.js') as {
  applyHealthConnectManifest: (manifest: Manifest, options?: { privacyPolicyUrl?: string }) => Manifest;
  HEALTH_CONNECT_PERMISSIONS: string[];
};

type Node = { $?: Record<string, string>; [key: string]: unknown };
type Manifest = { manifest: Record<string, unknown> };

const RATIONALE = 'expo.modules.twilighthealthconnect.HealthConnectRationaleActivity';
const ALIAS = 'expo.modules.twilighthealthconnect.ViewPermissionUsageActivity';

function baseManifest(): Manifest {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }],
      queries: [
        {
          intent: [
            {
              action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
              data: [{ $: { 'android:scheme': 'https' } }],
            },
          ],
        },
      ],
      application: [{ $: { 'android:name': '.MainApplication' }, activity: [{ $: { 'android:name': '.MainActivity' } }] }],
    },
  };
}

const list = (node: unknown, key: string) => ((node as Record<string, unknown>)[key] ?? []) as Node[];
const names = (nodes: Node[]) => nodes.map((n) => n.$?.['android:name']);
const app = (m: Manifest) => list(m.manifest, 'application')[0];

describe('health connect config plugin', () => {
  it('declares the sleep and history permissions next to existing ones', () => {
    const result = plugin.applyHealthConnectManifest(baseManifest());
    expect(names(list(result.manifest, 'uses-permission'))).toEqual([
      'android.permission.INTERNET',
      'android.permission.health.READ_SLEEP',
      'android.permission.health.WRITE_SLEEP',
      'android.permission.health.READ_HEALTH_DATA_HISTORY',
    ]);
  });

  it('adds the provider package to the existing queries block', () => {
    const result = plugin.applyHealthConnectManifest(baseManifest());
    const queries = list(result.manifest, 'queries');
    expect(queries).toHaveLength(1);
    expect(list(queries[0], 'intent')).toHaveLength(1);
    expect(names(list(queries[0], 'package'))).toEqual(['com.google.android.apps.healthdata']);
  });

  it('registers the rationale activity for android 13 and lower', () => {
    const result = plugin.applyHealthConnectManifest(baseManifest());
    const activity = list(app(result), 'activity').find((a) => a.$?.['android:name'] === RATIONALE);
    expect(activity?.$).toEqual({ 'android:name': RATIONALE, 'android:exported': 'true' });
    const filter = list(activity, 'intent-filter')[0];
    expect(names(list(filter, 'action'))).toEqual(['androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE']);
    expect(names(list(app(result), 'activity'))).toEqual(['.MainActivity', RATIONALE]);
  });

  it('registers the android 14 permission usage alias', () => {
    const result = plugin.applyHealthConnectManifest(baseManifest());
    const alias = list(app(result), 'activity-alias')[0];
    expect(alias.$).toEqual({
      'android:name': ALIAS,
      'android:exported': 'true',
      'android:targetActivity': RATIONALE,
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    });
    const filter = list(alias, 'intent-filter')[0];
    expect(names(list(filter, 'action'))).toEqual(['android.intent.action.VIEW_PERMISSION_USAGE']);
    expect(names(list(filter, 'category'))).toEqual(['android.intent.category.HEALTH_PERMISSIONS']);
  });

  it('is idempotent', () => {
    const once = plugin.applyHealthConnectManifest(baseManifest(), { privacyPolicyUrl: 'https://example.com/p' });
    const twice = plugin.applyHealthConnectManifest(structuredClone(once), {
      privacyPolicyUrl: 'https://example.com/p',
    });
    expect(twice).toEqual(once);
  });

  it('writes the privacy policy url only when configured, and only https', () => {
    const withUrl = plugin.applyHealthConnectManifest(baseManifest(), { privacyPolicyUrl: 'https://example.com/p' });
    expect(list(app(withUrl), 'meta-data')).toEqual([
      { $: { 'android:name': 'twilight.healthconnect.PRIVACY_POLICY_URL', 'android:value': 'https://example.com/p' } },
    ]);
    const without = plugin.applyHealthConnectManifest(structuredClone(withUrl));
    expect(list(app(without), 'meta-data')).toEqual([]);
    expect(() => plugin.applyHealthConnectManifest(baseManifest(), { privacyPolicyUrl: 'http://example.com' })).toThrow(
      /https/
    );
  });

  it('creates the manifest sections when they are missing', () => {
    const result = plugin.applyHealthConnectManifest({ manifest: {} });
    expect(names(list(result.manifest, 'uses-permission'))).toEqual(plugin.HEALTH_CONNECT_PERMISSIONS);
    expect(names(list(list(result.manifest, 'queries')[0], 'package'))).toEqual(['com.google.android.apps.healthdata']);
    expect(names(list(app(result), 'activity'))).toEqual([RATIONALE]);
  });
});
