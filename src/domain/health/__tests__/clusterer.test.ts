// ports: twilightTests/HealthKitSleepSyncTests.swift (HealthKitSleepNightClustererTests)
// plus the health connect record mapping (docs/health-connect.md 2.1, 2.2, 7.1)
import {
  clusterNights,
  nightKeyFor,
  orphanedOwnRecords,
  recordToSamples,
  STAGE_TYPE,
  stageKind,
  tagForRecordingMethod,
} from '../clusterer';
import type { HealthRecord, HealthStage } from '../types';

const APP = 'com.rami.twilight.port';
const WATCH = 'com.watch.sleep';
const H = 3600_000;
const date = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h, min);

let seq = 0;
function rec(
  startMs: number,
  endMs: number,
  opts: Partial<HealthRecord> & { stages?: HealthStage[] } = {}
): HealthRecord {
  seq += 1;
  return {
    recordId: opts.recordId ?? `r${seq}`,
    dataOrigin: opts.dataOrigin ?? WATCH,
    clientRecordId: opts.clientRecordId ?? null,
    clientRecordVersion: opts.clientRecordVersion ?? 1,
    startMs,
    endMs,
    startOffsetSec: opts.startOffsetSec ?? 0,
    endOffsetSec: opts.endOffsetSec ?? 0,
    lastModifiedMs: 0,
    recordingMethod: opts.recordingMethod ?? 'automaticallyRecorded',
    stages: opts.stages ?? [{ startMs, endMs, type: STAGE_TYPE.SLEEPING }],
  };
}

const cluster = (records: HealthRecord[]) => clusterNights(records, { deviceZone: 'UTC', ownPackage: APP });

describe('clusterer (swift ports)', () => {
  test('testCollapsesStageSamplesIntoOneNight', () => {
    const s = date(2026, 8, 10, 23);
    const nights = cluster([rec(s, s + 2 * H), rec(s + 2 * H, s + 4 * H), rec(s + 4 * H, s + 7 * H)]);
    expect(nights).toHaveLength(1);
    expect(nights[0].startMs).toBe(s);
    expect(nights[0].endMs).toBe(s + 7 * H);
  });

  test('testCollapsesStageSamplesIntoOneNight (stages inside one record)', () => {
    const s = date(2026, 8, 10, 23);
    const nights = cluster([
      rec(s, s + 7 * H, {
        stages: [
          { startMs: s, endMs: s + 2 * H, type: STAGE_TYPE.LIGHT },
          { startMs: s + 2 * H, endMs: s + 4 * H, type: STAGE_TYPE.DEEP },
          { startMs: s + 4 * H, endMs: s + 7 * H, type: STAGE_TYPE.REM },
        ],
      }),
    ]);
    expect(nights).toHaveLength(1);
    expect([nights[0].startMs, nights[0].endMs]).toEqual([s, s + 7 * H]);
  });

  test('testGapOverThreeHoursSplitsNights', () => {
    const a = date(2026, 8, 10, 1);
    const b = date(2026, 8, 10, 8);
    expect(cluster([rec(a, a + 2 * H), rec(b, b + 2 * H)])).toHaveLength(2);
  });

  test('a gap of exactly three hours does not split', () => {
    const a = date(2026, 8, 10, 1);
    expect(cluster([rec(a, a + 2 * H), rec(a + 5 * H, a + 6 * H)])).toHaveLength(1);
  });

  test('testIgnoresTwilightAuthoredSamples (own package)', () => {
    const s = date(2026, 8, 10, 23);
    const nights = cluster([
      rec(s, s + 7 * H, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.abc' }),
      rec(s + 24 * H, s + 31 * H),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0].startMs).toBe(s + 24 * H);
  });

  test('hc difference: a foreign package record with the twilight prefix is NOT ignored (2.2)', () => {
    const s = date(2026, 8, 10, 23);
    const nights = cluster([rec(s, s + 7 * H, { clientRecordId: 'twilight.sleep-session.fake' })]);
    expect(nights).toHaveLength(1);
    expect(nights[0].source).toBe(WATCH);
  });

  test('testPrefersAsleepEnvelopeOverInBed', () => {
    const s = date(2026, 8, 10, 22);
    const asleep = s + H;
    const nights = cluster([
      rec(s, s + 9 * H, { stages: [{ startMs: asleep, endMs: asleep + 7 * H, type: STAGE_TYPE.SLEEPING }] }),
    ]);
    expect(nights).toHaveLength(1);
    expect([nights[0].startMs, nights[0].endMs]).toEqual([asleep, asleep + 7 * H]);
  });

  test('testRehydratesOrphanedTwilightSamples', () => {
    const s = date(2026, 8, 10, 23);
    const orphans = orphanedOwnRecords(
      [
        rec(s, s + 7 * H, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.old-night' }),
        rec(s + 24 * H, s + 31 * H, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.already-local' }),
      ],
      { ownPackage: APP, existingSessionIds: new Set(['already-local']), deletedSessionIds: new Set() }
    );
    expect(orphans.map((o) => o.sessionId)).toEqual(['old-night']);
    expect(orphans[0].startMs).toBe(s);
  });
});

describe('orphan rehydration rules', () => {
  const s = date(2026, 8, 10, 23);
  const opts = (deleted: string[] = []) => ({
    ownPackage: APP,
    existingSessionIds: new Set<string>(),
    deletedSessionIds: new Set(deleted),
  });

  test('ledger ids, demo ids, foreign prefixed records and short records are never rehydrated', () => {
    const orphans = orphanedOwnRecords(
      [
        rec(s, s + 7 * H, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.deleted' }),
        rec(s, s + 7 * H, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.rami-demo-session-3' }),
        rec(s, s + 7 * H, { dataOrigin: WATCH, clientRecordId: 'twilight.sleep-session.foreign' }),
        rec(s, s + 4 * 60_000, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.short' }),
        rec(s, s + 7 * H, { dataOrigin: APP, clientRecordId: 'other-prefix.kept-out' }),
        rec(s, s + 7 * H, { dataOrigin: APP, clientRecordId: 'twilight.sleep-session.ok', recordingMethod: 'manualEntry' }),
      ],
      opts(['deleted'])
    );
    expect(orphans.map((o) => o.sessionId)).toEqual(['ok']);
  });

  test('tags follow the recording method (5.6)', () => {
    expect(tagForRecordingMethod('manualEntry')).toBe('Manual Log');
    expect(tagForRecordingMethod('activelyRecorded')).toBe('Sleep Mode');
    expect(tagForRecordingMethod('unknown')).toBe('Sleep Mode');
  });
});

describe('record-to-sample mapping (2.1)', () => {
  const s = date(2026, 8, 10, 23);

  test.each([
    [STAGE_TYPE.UNKNOWN, 'asleep'],
    [STAGE_TYPE.AWAKE, 'awake'],
    [STAGE_TYPE.SLEEPING, 'asleep'],
    [STAGE_TYPE.OUT_OF_BED, 'awake'],
    [STAGE_TYPE.LIGHT, 'asleep'],
    [STAGE_TYPE.DEEP, 'asleep'],
    [STAGE_TYPE.REM, 'asleep'],
    [STAGE_TYPE.AWAKE_IN_BED, 'awake'],
    [42, 'asleep'],
  ])('stage %i maps to %s', (type, kind) => {
    expect(stageKind(type)).toBe(kind);
  });

  test('staged record: one asleep sample per asleep stage plus in-bed over the session', () => {
    const samples = recordToSamples(
      rec(s, s + 8 * H, {
        stages: [
          { startMs: s, endMs: s + H, type: STAGE_TYPE.AWAKE_IN_BED },
          { startMs: s + H, endMs: s + 4 * H, type: STAGE_TYPE.LIGHT },
          { startMs: s + 4 * H, endMs: s + 5 * H, type: STAGE_TYPE.AWAKE },
          { startMs: s + 5 * H, endMs: s + 8 * H, type: STAGE_TYPE.REM },
        ],
      })
    );
    expect(samples.map((x) => [x.kind, x.startMs - s, x.endMs - s])).toEqual([
      ['asleep', H, 4 * H],
      ['asleep', 5 * H, 8 * H],
      ['inBed', 0, 8 * H],
    ]);
  });

  test('no stages = asleep over the session interval', () => {
    expect(recordToSamples(rec(s, s + 8 * H, { stages: [] })).map((x) => x.kind)).toEqual(['asleep']);
  });

  test('awake-only stages = in bed over the session interval', () => {
    const samples = recordToSamples(rec(s, s + 8 * H, { stages: [{ startMs: s, endMs: s + 8 * H, type: STAGE_TYPE.AWAKE }] }));
    expect(samples.map((x) => x.kind)).toEqual(['inBed']);
  });

  test('a no-stage record and a staged record of one source within 3 h form one night covering both', () => {
    const nights = cluster([
      rec(s, s + 3 * H, { stages: [] }),
      rec(s + 4 * H, s + 8 * H, { stages: [{ startMs: s + 4 * H, endMs: s + 8 * H, type: STAGE_TYPE.DEEP }] }),
    ]);
    expect(nights).toHaveLength(1);
    expect([nights[0].startMs, nights[0].endMs]).toEqual([s, s + 8 * H]);
    expect(nights[0].recordIds).toHaveLength(2);
  });

  test('an awake-only record next to an asleep record of the same source does not widen the envelope', () => {
    const nights = cluster([
      rec(s - H, s + 9 * H, { stages: [{ startMs: s - H, endMs: s + 9 * H, type: STAGE_TYPE.AWAKE }] }),
      rec(s, s + 8 * H),
    ]);
    expect(nights).toHaveLength(1);
    expect([nights[0].startMs, nights[0].endMs]).toEqual([s, s + 8 * H]);
  });

  test('nights shorter than 5 minutes are dropped', () => {
    expect(cluster([rec(s, s + 4 * 60_000)])).toHaveLength(0);
  });

  test('a short stage inside a long in-bed record does not split the night', () => {
    const nights = cluster([
      rec(s, s + 10 * H, {
        stages: [
          { startMs: s + H / 2, endMs: s + H, type: STAGE_TYPE.LIGHT },
          { startMs: s + 6 * H, endMs: s + 10 * H, type: STAGE_TYPE.DEEP },
        ],
      }),
    ]);
    // swift measured the gap from the previous sample (s+1h -> s+6h = 5 h)
    expect(nights).toHaveLength(1);
    expect([nights[0].startMs, nights[0].endMs]).toEqual([s + H / 2, s + 10 * H]);
  });

  test('sources cluster separately', () => {
    expect(cluster([rec(s, s + 7 * H), rec(s, s + 7 * H, { dataOrigin: 'com.other' })])).toHaveLength(2);
  });
});

describe('night key (3.5)', () => {
  test('wake day comes from the end offset and does not move with the device zone', () => {
    // wakes 06:00 in kolkata on aug 11 = 00:30 utc
    const end = Date.UTC(2026, 7, 11, 0, 30);
    const start = end - 7 * H;
    const inParis = nightKeyFor(WATCH, start, end, 19800, 'Europe/Paris');
    const inLa = nightKeyFor(WATCH, start, end, 19800, 'America/Los_Angeles');
    expect(inParis).toBe(inLa);
    expect(inParis).toBe(`${WATCH}|2026-08-11|${Math.floor(start / 1000)}`);
  });

  test('null offset falls back to the device zone', () => {
    const end = Date.UTC(2026, 7, 11, 2, 0);
    expect(nightKeyFor(WATCH, end - 7 * H, end, null, 'America/Los_Angeles')).toContain('|2026-08-10|');
  });

  test('a night spanning midnight keys on the wake day', () => {
    const nights = cluster([rec(date(2026, 8, 10, 23), date(2026, 8, 11, 7))]);
    expect(nights[0].nightKey).toContain('|2026-08-11|');
  });

  test('a nap and a night on the same wake day get distinct keys', () => {
    const nights = cluster([rec(date(2026, 8, 10, 23), date(2026, 8, 11, 7)), rec(date(2026, 8, 11, 14), date(2026, 8, 11, 15))]);
    expect(nights).toHaveLength(2);
    expect(nights[0].nightKey).not.toBe(nights[1].nightKey);
  });
});
