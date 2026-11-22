// Runs the same migration and RLS tests as supabase/tests/run.sh, but on PGlite (PostgreSQL compiled to WebAssembly),
// for machines with no PostgreSQL installed.
//   npm install --no-save @electric-sql/pglite   (once, in a scratch folder is fine)
//   node tools/db-tests-pglite.mjs
// The psql-only "\set ON_ERROR_STOP" line is dropped; a failed check raises an error, which stops the file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// require() honours NODE_PATH, so the package can live in a scratch folder.
const { PGlite } = createRequire(import.meta.url)('@electric-sql/pglite');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = path.join(root, 'supabase', 'tests');
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(tests, 'supabase-shim.sql'), 'utf8'));
for (const f of fs.readdirSync(path.join(root, 'supabase', 'migrations')).sort()) await db.exec(fs.readFileSync(path.join(root, 'supabase', 'migrations', f), 'utf8'));
await db.exec('grant usage on schema public to public; grant temporary on database template1 to public; create table public.check_log(n serial, label text); grant all on public.check_log to public; grant usage on all sequences in schema public to public;');
let ok = true;
for (const f of ['rls.test.sql', 'admin.test.sql', 'abuse.test.sql']) {
    // PGlite cannot hand back NOTICE lines, so each passing check is logged to a table instead and printed as "ok - label".
    const sql = fs.readFileSync(path.join(tests, f), 'utf8').replace(/^\\set .*$/m, '').replace("raise notice 'ok - %', label;", 'insert into public.check_log(label) values (label);');
    try { await db.exec(sql); for (const r of (await db.query('select label from public.check_log order by n')).rows) console.log('ok - ' + r.label); console.log('PASS', f); }
    catch (e) { ok = false; console.log('FAIL', f, String(e.message).slice(0, 300)); }
    await db.exec('reset role; truncate auth.users, public.teams cascade; truncate public.check_log');
}
process.exit(ok ? 0 : 1);
