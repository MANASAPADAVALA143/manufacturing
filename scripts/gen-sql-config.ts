import { writeFileSync } from 'node:fs';
import { buildConfigSql } from './sqlConfig';

const target = 'supabase/migrations/20261113000350_config.sql';
writeFileSync(target, buildConfigSql());
console.log(`Wrote ${target}`);
