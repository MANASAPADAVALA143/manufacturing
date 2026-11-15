import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb } from './db';
import { buildConfigSql } from '../../scripts/sqlConfig';

describe('migrations', () => {
  it('apply cleanly on a fresh database', async () => {
    const db = await freshDb();
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from pg_tables where schemaname = 'public'`);
    expect(rows[0].n).toBeGreaterThan(45);
    const rls = await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(rls.rows.map((r) => r.tablename)).toEqual([]);
  });

  it('generated config matches the TypeScript registry', () => {
    const committed = readFileSync(join(__dirname, '..', 'migrations', '20261113000350_config.sql'), 'utf8');
    expect(committed.replace(/\r\n/g, '\n')).toBe(buildConfigSql());
  });
});
