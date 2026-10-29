// npm run test:db — applies supabase/migrations + seed.sql to an in-process Postgres (PGlite)
// with minimal Supabase stubs (auth.uid, storage), then checks RLS and server functions.
// Runs the real CampusFix migrations + seed in PGlite (Postgres in WASM) with minimal Supabase stubs,
// then exercises RLS and the SECURITY DEFINER functions as different users.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const ROOT = new URL('../supabase', import.meta.url).pathname
const db = new PGlite()
const R = []
const ok = (n, c, x = '') => R.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`)

const STUBS = `
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to authenticated;
`
await db.exec(STUBS)
for (const f of ['20261029000001_schema.sql', '20261029000002_functions.sql', '20261029000003_rls_and_storage.sql', '20261029000004_rewards_admin_notifications.sql', '../seed.sql']) {
  let sql = readFileSync(`${ROOT}/${f.startsWith('..') ? f.slice(3) : 'migrations/' + f}`, 'utf8')
  sql = sql.replace(/create extension if not exists pgcrypto;/, '') // gen_random_uuid() is core since PG13
  try {
    await db.exec(sql)
    ok(`apply ${f}`, true)
  } catch (e) {
    ok(`apply ${f}`, false, e.message)
    console.log(R.join('\n'))
    process.exit(1)
  }
}

const users = {}
for (const [k, email, name] of [
  ['A', 'alex.student@campusfix.demo', 'Alex Rivera'],
  ['B', 'jordan@campusfix.demo', 'Jordan Lee'],
  ['S', 'taylor.facilities@campusfix.demo', 'Taylor Brooks'],
]) {
  const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { display_name: name }])
  users[k] = r.rows[0].id
}
await db.query(`update public.profiles set role = 'staff' where id = $1`, [users.S])
const prof = await db.query(`select display_name, role from public.profiles order by display_name`)
ok('signup trigger creates student profiles', prof.rows.length === 3 && prof.rows.filter((p) => p.role === 'student').length === 2)

/** Run fn as a signed-in user (role authenticated + JWT sub), inside a transaction. */
async function as(who, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [users[who]])
    await tx.exec('set local role authenticated')
    return fn(tx)
  })
}
async function fails(who, fn) {
  try {
    await as(who, fn)
    return null
  } catch (e) {
    return e.message
  }
}
const WOODLAND = '00000000-0000-4000-8001-000000000001'
const LARES = '00000000-0000-4000-8001-000000000002'
const CAMPUS = '00000000-0000-4000-8000-000000000001'

// --- seed visible
const seedCount = await as('A', (tx) => tx.query(`select count(*)::int n from public.issue_feed`))
ok('seed: student sees sample issues via issue_feed', seedCount.rows[0].n === 17, String(seedCount.rows[0].n))
const hv = await as('A', (tx) => tx.query(`select name, health_score from public.building_health order by name`))
const h = Object.fromEntries(hv.rows.map((r) => [r.name, r.health_score]))
ok('building_health view matches app (Woodland 75, Athletic 73, Rydal null)', h['Woodland Building'] === 75 && h['Athletic Building'] === 73 && h['Rydal Building'] === null, JSON.stringify(h))

// --- student creates issue; trigger forces safe defaults even if client lies
const ins = await as('A', (tx) =>
  tx.query(
    `insert into public.issues (reporter_id, campus_id, building_id, floor, room, title, description, category, priority, verification_status)
     values ($1, $2, $3, 'First Floor', 'Room 112', 'Leaking sink in restroom', 'Water drips under the sink constantly.', 'plumbing', 'low', 'pending')
     returning id, ref_number, verification_status, repair_status, priority, reporter_id`,
    [users.A, CAMPUS, WOODLAND],
  ),
)
const issueA = ins.rows[0]
ok('student insert works; ref number after seed', issueA.ref_number >= 2000, `ref ${issueA.ref_number}`)
const sneaky = await fails('A', (tx) =>
  tx.query(
    `insert into public.issues (reporter_id, campus_id, building_id, title, description, category, verification_status, repair_status, priority)
     values ($1, $2, $3, 'Fake verified', 'Trying to self verify this one.', 'other', 'verified', 'resolved', 'critical') returning verification_status, priority`,
    [users.A, CAMPUS, WOODLAND],
  ),
)
// BEFORE trigger forces pending/reported/low, so the insert succeeds as a normal pending report:
const forced = await as('A', (tx) => tx.query(`select verification_status, repair_status, priority from public.issues where title = 'Fake verified'`))
ok('client cannot insert a verified/resolved/critical report (forced to defaults)', sneaky === null && forced.rows[0]?.verification_status === 'pending' && forced.rows[0]?.priority === 'low' && forced.rows[0]?.repair_status === 'reported', JSON.stringify(forced.rows[0]))
const impersonate = await as('A', (tx) =>
  tx.query(`insert into public.issues (reporter_id, campus_id, building_id, title, description, category) values ($1,$2,$3,'Spoofed reporter','Pretending to be Jordan here.','other') returning reporter_id`, [users.B, CAMPUS, WOODLAND]),
)
ok('reporter_id is forced to the caller', impersonate.rows[0].reporter_id === users.A)

const pts = await as('A', (tx) => tx.query(`select available, pending from public.my_points_summary where user_id = $1`, [users.A]))
ok('new reports create pending points only', pts.rows[0].pending === 150 && pts.rows[0].available === 0, JSON.stringify(pts.rows[0]))

// --- privilege checks
ok('student cannot update issues', !!(await fails('A', (tx) => tx.query(`update public.issues set repair_status = 'resolved' where id = $1`, [issueA.id]))))
ok('student cannot write points ledger', !!(await fails('A', (tx) => tx.query(`insert into public.points_transactions (user_id, action_type, points, status, idempotency_key) values ($1,'adjustment',9999,'available','x')`, [users.A]))))
ok('student cannot change own role', !!(await fails('A', (tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [users.A]))))
const rename = await as('A', (tx) => tx.query(`update public.profiles set display_name = 'Alex R.' where id = $1 returning display_name`, [users.A]))
ok('student can rename self', rename.rows[0]?.display_name === 'Alex R.')
ok('student cannot verify issues', /Only facilities staff/.test(await fails('A', (tx) => tx.query(`select public.verify_issue($1, 'verified', 'high')`, [issueA.id]))))
ok('student cannot change repair status via RPC', /Only facilities staff/.test(await fails('A', (tx) => tx.query(`select public.set_repair_status($1, 'resolved')`, [issueA.id]))))
const otherLedger = await as('B', (tx) => tx.query(`select count(*)::int n from public.points_transactions where user_id = $1`, [users.A]))
ok("students can't read others' ledger", otherLedger.rows[0].n === 0)

// --- supporters
await as('B', (tx) => tx.query(`insert into public.issue_supporters (issue_id, user_id) values ($1, $2)`, [issueA.id, users.B]))
ok('supporting twice is rejected', !!(await fails('B', (tx) => tx.query(`insert into public.issue_supporters (issue_id, user_id) values ($1, $2)`, [issueA.id, users.B]))))
ok('cannot support own report', !!(await fails('A', (tx) => tx.query(`insert into public.issue_supporters (issue_id, user_id) values ($1, $2)`, [issueA.id, users.A]))))

// --- staff verify → points released once
await as('S', (tx) => tx.query(`select public.verify_issue($1, 'verified', 'high', true, 'Thanks')`, [issueA.id]))
ok('verifying twice is rejected', /already been reviewed/.test(await fails('S', (tx) => tx.query(`select public.verify_issue($1, 'verified', 'high')`, [issueA.id]))))
let p = (await as('A', (tx) => tx.query(`select available, pending from public.my_points_summary where user_id = $1`, [users.A]))).rows[0]
ok('verify releases +50 to available', p.available === 50 && p.pending === 100, JSON.stringify(p))
await as('S', (tx) => tx.query(`select public.set_repair_status($1, 'in_progress', 'Plumber booked')`, [issueA.id]))
await as('S', (tx) => tx.query(`select public.set_repair_status($1, 'resolved', 'Fixed')`, [issueA.id]))
await as('S', (tx) => tx.query(`select public.set_repair_status($1, 'in_progress', 'Reopened')`, [issueA.id]))
await as('S', (tx) => tx.query(`select public.set_repair_status($1, 'resolved', 'Fixed again')`, [issueA.id]))
p = (await as('A', (tx) => tx.query(`select available from public.my_points_summary where user_id = $1`, [users.A]))).rows[0]
ok('resolve bonus +20 awarded exactly once (even after reopen)', p.available === 70, JSON.stringify(p))
const hist = await as('A', (tx) => tx.query(`select kind, new_status from public.issue_status_history where issue_id = $1 order by created_at`, [issueA.id]))
ok('status history recorded', hist.rows.length === 6, hist.rows.map((r) => r.new_status).join('→'))
const hw = (await as('A', (tx) => tx.query(`select health_score from public.building_health where building_id = $1`, [WOODLAND]))).rows[0]
ok('Woodland health gets +2 recovery after fix', hw.health_score === 77, String(hw.health_score))

// --- reject voids points
const rej = await as('A', (tx) => tx.query(`select id from public.issues where title = 'Spoofed reporter'`))
await as('S', (tx) => tx.query(`select public.verify_issue($1, 'rejected', null, true, 'Not a real issue')`, [rej.rows[0].id]))
const vis = await as('B', (tx) => tx.query(`select count(*)::int n from public.issues where id = $1`, [rej.rows[0].id]))
ok('rejected report hidden from other students', vis.rows[0].n === 0)
p = (await as('A', (tx) => tx.query(`select pending from public.my_points_summary where user_id = $1`, [users.A]))).rows[0]
ok('rejection voids its pending points', p.pending === 50, JSON.stringify(p))

// --- merge duplicate: B's report merged into A's
const dupe = await as('B', (tx) =>
  tx.query(`insert into public.issues (reporter_id, campus_id, building_id, title, description, category) values ($1,$2,$3,'Sink dripping','Same sink, still dripping a lot.','plumbing') returning id`, [users.B, CAMPUS, WOODLAND]),
)
await as('B', (tx) => tx.query(`delete from public.issue_supporters where issue_id = $1 and user_id = $2`, [issueA.id, users.B]))
await as('S', (tx) => tx.query(`select public.merge_issue($1, $2)`, [dupe.rows[0].id, issueA.id]))
const bPts = (await as('B', (tx) => tx.query(`select coalesce(sum(points) filter (where status <> 'void'),0)::int n from public.points_transactions where user_id = $1 and issue_id = $2`, [users.B, dupe.rows[0].id]))).rows[0].n
const bSup = (await as('B', (tx) => tx.query(`select count(*)::int n from public.issue_supporters where issue_id = $1 and user_id = $2`, [issueA.id, users.B]))).rows[0].n
ok('merge voids duplicate points and adds reporter as supporter', bPts === 0 && bSup === 1, `points ${bPts}, supporter ${bSup}`)

// --- staff self-review: allowed, no points
const own = await as('S', (tx) =>
  tx.query(`insert into public.issues (reporter_id, campus_id, building_id, title, description, category) values ($1,$2,$3,'Lobby floor muddy','Mud all over the lobby entrance.','cleaning') returning id`, [users.S, CAMPUS, LARES]),
)
await as('S', (tx) => tx.query(`select public.verify_issue($1, 'verified', 'low')`, [own.rows[0].id]))
await as('S', (tx) => tx.query(`select public.set_repair_status($1, 'resolved')`, [own.rows[0].id]))
const sPts = (await as('S', (tx) => tx.query(`select coalesce(sum(points) filter (where status = 'available'),0)::int a, coalesce(sum(points) filter (where status = 'pending'),0)::int p from public.points_transactions where user_id = $1`, [users.S]))).rows[0]
ok('staff self-review allowed but earns no points', sPts.a === 0 && sPts.p === 0, JSON.stringify(sPts))

// --- redemption is atomic and balance-checked
const reward = '00000000-0000-4000-8003-000000000001'
ok('cannot redeem without enough points', /Not enough points/.test(await fails('A', (tx) => tx.query(`select public.redeem_reward($1)`, [reward]))))
await db.query(`insert into public.points_transactions (user_id, action_type, points, status, idempotency_key) values ($1,'adjustment',480,'available','test-topup')`, [users.A])
await as('A', (tx) => tx.query(`select public.redeem_reward($1)`, [reward]))
p = (await as('A', (tx) => tx.query(`select available, redeemed from public.my_points_summary where user_id = $1`, [users.A]))).rows[0]
ok('redeem deducts 500 atomically', p.available === 50 && p.redeemed === 500, JSON.stringify(p))
ok('second redeem blocked by balance', /Not enough points/.test(await fails('A', (tx) => tx.query(`select public.redeem_reward($1)`, [reward]))))

// --- storage policy
ok('upload into own folder allowed', (await fails('A', (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('issue-photos', $1)`, [`${users.A}/p.jpg`]))) === null)
ok("upload into someone else's folder blocked", !!(await fails('A', (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('issue-photos', $1)`, [`${users.B}/p.jpg`]))))

// --- Phase 3: support / confirmation points, refunds, notifications
await db.query(`insert into auth.users (email, raw_user_meta_data) values ('casey.admin@campusfix.demo', '{"display_name":"Casey Morgan"}') returning id`).then((r) => (users.ADM = r.rows[0].id))
await db.query(`update public.profiles set role = 'admin' where id = $1`, [users.ADM])
let fid
const ledger = async (who, action) =>
  (await as(who, (tx) => tx.query(`select coalesce(sum(points),0)::int n, count(*)::int c from public.points_transactions where user_id = $1 and action_type = $2 and status = 'available' and issue_id = $3`, [users[who], action, fid]))).rows[0]
const fresh = await as('A', (tx) =>
  tx.query(`insert into public.issues (reporter_id, campus_id, building_id, title, description, category) values ($1,$2,$3,'Broken desk hinge','Desk hinge snapped in Lares 204.','furniture') returning id`, [users.A, CAMPUS, LARES]),
)
fid = fresh.rows[0].id
await as('B', (tx) => tx.query(`insert into public.issue_supporters (issue_id, user_id) values ($1,$2)`, [fid, users.B]))
ok('no support points while pending', (await ledger('B', 'verified_support')).c === 0)
await as('S', (tx) => tx.query(`select public.verify_issue($1, 'verified', 'low')`, [fid]))
ok('supporters get +5 when report is verified', (await ledger('B', 'verified_support')).n === 5)
await as('B', (tx) => tx.query(`delete from public.issue_supporters where issue_id = $1 and user_id = $2`, [fid, users.B]))
await as('B', (tx) => tx.query(`insert into public.issue_supporters (issue_id, user_id) values ($1,$2)`, [fid, users.B]))
ok('unsupport/resupport cannot farm support points', (await ledger('B', 'verified_support')).n === 5)
await as('S', (tx) => tx.query(`insert into public.issue_supporters (issue_id, user_id) values ($1,$2)`, [fid, users.S]))
ok('supporting a verified issue awards +5 immediately', (await ledger('S', 'verified_support')).n === 5)
await as('S', (tx) => tx.query(`select public.set_repair_status($1, 'resolved')`, [fid]))
await as('A', (tx) => tx.query(`select public.confirm_resolution($1, true)`, [fid]))
await as('A', (tx) => tx.query(`select public.confirm_resolution($1, false)`, [fid]))
ok('reporter confirmation +10 once', (await ledger('A', 'resolution_confirmed')).n === 10)
await as('ADM', (tx) => tx.query(`select public.confirm_resolution($1, true)`, [fid]))
ok('uninvolved users earn nothing for confirming', (await ledger('ADM', 'resolution_confirmed')).c === 0)
const notes = await as('A', (tx) => tx.query(`select kind, new_status from public.my_notifications where issue_id = $1 order by created_at`, [fid]))
ok('notifications feed shows others’ updates on followed issues', notes.rows.map((r) => r.new_status).join(',') === 'verified,resolved', notes.rows.map((r) => r.new_status ?? r.kind).join(','))
const othersNotes = await as('B', (tx) => tx.query(`select count(*)::int n from public.my_notifications where issue_id = $1`, [issueA.id]))
ok('notifications limited to issues the user follows', othersNotes.rows[0].n === 0)

// admin: redemption status + refund once, non-admins blocked
const red = (await as('A', (tx) => tx.query(`select id from public.redemptions where user_id = $1`, [users.A]))).rows[0].id
ok('students cannot cancel/refund redemptions', /Only administrators/.test(await fails('A', (tx) => tx.query(`select public.set_redemption_status($1, 'cancelled')`, [red]))))
const before3 = (await as('A', (tx) => tx.query(`select available from public.my_points_summary where user_id = $1`, [users.A]))).rows[0].available
await as('ADM', (tx) => tx.query(`select public.set_redemption_status($1, 'cancelled')`, [red]))
ok('second status change rejected', /already cancelled/.test(await fails('ADM', (tx) => tx.query(`select public.set_redemption_status($1, 'cancelled')`, [red]))))
const after3 = (await as('A', (tx) => tx.query(`select available from public.my_points_summary where user_id = $1`, [users.A]))).rows[0].available
ok('cancel refunds points once', after3 === before3 + 500, `${before3}→${after3}`)
ok('admin can read whole ledger', (await as('ADM', (tx) => tx.query(`select count(distinct user_id)::int n from public.points_transactions`))).rows[0].n >= 3)
ok('admin can edit rewards; students cannot', (await fails('ADM', (tx) => tx.query(`update public.rewards set points_required = 450 where id = $1`, [reward]))) === null &&
  (await as('A', (tx) => tx.query(`update public.rewards set points_required = 1 where id = $1 returning id`, [reward]))).rows.length === 0)
ok('admin can deactivate a building; students cannot', (await as('ADM', (tx) => tx.query(`update public.buildings set active = false where id = $1 returning id`, [LARES]))).rows.length === 1 &&
  (await as('A', (tx) => tx.query(`update public.buildings set active = true where id = $1 returning id`, [LARES]))).rows.length === 0)

console.log(R.join('\n'))
console.log(`\n${R.filter((r) => r.startsWith('PASS')).length}/${R.length} passed`)
process.exitCode = R.some((r) => r.startsWith('FAIL')) ? 1 : 0
