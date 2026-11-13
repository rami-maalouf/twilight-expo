// adapts node:sqlite (jest runtime) to the SqlDatabase interface the repo uses,
// so tests exercise the exact sql the app runs on expo-sqlite
import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlParam } from '@/data/db';

export function memoryDb(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  return {
    execSync: (sql: string) => {
      db.exec(sql);
    },
    runSync: (sql: string, params: SqlParam[]) => {
      db.prepare(sql).run(...params);
    },
    getAllSync: <T>(sql: string, params: SqlParam[]) => db.prepare(sql).all(...params) as T[],
    getFirstSync: <T>(sql: string, params: SqlParam[]) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
    // same contract as expo-sqlite: commit on return, roll back on throw
    withTransactionSync: (task: () => void) => {
      db.exec('begin');
      try {
        task();
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
    },
  };
}
