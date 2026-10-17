// Applies every Supabase migration to an in-memory Postgres (PGlite) with
// minimal Supabase stubs (auth, storage, roles, default grants), then runs
// supabase/tests/privileges.sql as the anon / authenticated / service_role
// roles. Usage: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const testsDir = path.join(root, 'supabase', 'tests');

const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(fs.readFileSync(path.join(testsDir, 'supabase-stubs.sql'), 'utf8'));

let failures = 0;
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
const versions = files.map((file) => file.split('_')[0]);
const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);
if (duplicates.length) { failures++; console.log(`FAIL duplicate migration versions: ${duplicates.join(', ')}`); }

for (const file of files) {
  // pgcrypto is preinstalled on Supabase; gen_random_uuid() is core Postgres.
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').replace(/create extension if not exists "pgcrypto";/i, '');
  try {
    await db.exec(`begin;\n${sql}\n;commit;`);
    console.log(`OK   ${file}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${file}: ${error.message}`);
    await db.exec('rollback;').catch(() => undefined);
  }
}
if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }

// PGlite cannot catch errors inside PL/pgSQL exception blocks, so each
// `select public.zz_t(name, $q$...$q$, expectOk)` check is executed here.
const raw = fs.readFileSync(path.join(testsDir, 'privileges.sql'), 'utf8');
const cut = raw.indexOf('-- @@');
await db.exec(raw.slice(0, cut));
const statements = raw.slice(cut).split(/;\r?\n/).map((statement) => statement.trim()).filter(Boolean);
console.log('');
for (const statement of statements) {
  const check = statement.match(/^select public\.zz_t\('(.+?)', \$q\$([\s\S]*)\$q\$, (true|false)\)$/);
  if (check) {
    const [, name, query, expected] = check;
    let ok = true;
    let message = '';
    try { await db.exec(query); } catch (error) { ok = false; message = error.message; }
    const pass = ok === (expected === 'true');
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ok ? ' (should have been denied)' : `: ${message}`}`);
    continue;
  }
  if (statement.includes('select name, outcome')) continue;
  try { await db.query(statement); } catch (error) { failures++; console.log(`FAIL setup: ${error.message}\n     ${statement.slice(0, 120)}`); }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll migration and privilege checks passed.');
process.exit(failures ? 1 : 0);
