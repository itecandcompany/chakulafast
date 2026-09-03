// Runs the ChakulaFast migrations against a real Postgres (PGlite, compiled to
// WASM) and then exercises the business logic that lives in database triggers.
//
//   npm run test:db
//
// Needs no Docker, no Supabase project and no network. Run it after touching
// anything in supabase/migrations — a broken trigger or policy is invisible to
// tsc and to the build, and otherwise only surfaces in production.
//
// Supabase supplies `auth`, `storage` and the realtime publication; those are
// stubbed below so the migrations can run unmodified. auth.uid() reads the
// same GUC Supabase uses, so the guard triggers behave exactly as they will in
// production when we impersonate a user.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);

const PRELUDE = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Same contract as Supabase's: the current user's id, or NULL when there is
-- no end-user JWT (i.e. the service role).
create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets,
  name text,
  owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $fn$ select string_to_array(name, '/') $fn$;

create publication supabase_realtime;

-- Supabase grants EXECUTE on public functions to anon/authenticated through
-- ALTER DEFAULT PRIVILEGES, which applies as each function is *created*.
-- That distinction is load-bearing: a blanket "grant execute on all functions"
-- run after the migrations would silently re-grant everything the migrations
-- deliberately revoked, and every REVOKE in the schema would go untested.
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

// pg_trgm is loaded so the trigram index and the `<%` word-similarity
// operator behind typo-tolerant search are genuinely exercised, rather than
// silently skipped by the migration's fallback path.
const db = await PGlite.create({ extensions: { pg_trgm } });

const say = (ok, msg) => console.log(`${ok ? "  PASS" : "  FAIL"}  ${msg}`);
let failures = 0;
const check = (cond, msg) => {
  if (!cond) failures++;
  say(cond, msg);
};

console.log("=== prelude (Supabase stubs) ===");
try {
  await db.exec(PRELUDE);
  console.log("  ok");
} catch (e) {
  console.log("  FAILED: " + e.message);
  process.exit(1);
}

console.log("\n=== migrations ===");
const files = fs.readdirSync(MIGRATIONS).sort();
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
  try {
    await db.exec(sql);
    console.log(`  ok    ${f}`);
  } catch (e) {
    failures++;
    console.log(`  ERROR ${f}\n        ${e.message}`);
  }
}

if (failures) {
  console.log(`\n${failures} migration error(s) — stopping before logic tests.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Business-logic tests. These are the parts no amount of static analysis can
// verify: what the triggers actually do.
// ---------------------------------------------------------------------------
const asUser = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false);`);
const asService = () => db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
const one = async (sql) => (await db.query(sql)).rows[0];

console.log("\n=== fixtures ===");
await asService();
const owner = await one(
  `insert into auth.users (email, raw_user_meta_data)
   values ('owner@test', '{"full_name":"Owner","role":"restaurant"}'::jsonb) returning id`,
);
const customer = await one(
  `insert into auth.users (email, raw_user_meta_data)
   values ('cust@test', '{"full_name":"Asha Mrema","role":"customer"}'::jsonb) returning id`,
);
const sneaky = await one(
  `insert into auth.users (email, raw_user_meta_data)
   values ('sneak@test', '{"full_name":"Sneaky","role":"admin"}'::jsonb) returning id`,
);
console.log("  created 3 auth users");

console.log("\n=== signup trigger ===");
const ownerProfile = await one(`select role from public.profiles where id = '${owner.id}'`);
check(ownerProfile?.role === "restaurant", "restaurant signup gets role 'restaurant'");
const sneakyProfile = await one(`select role from public.profiles where id = '${sneaky.id}'`);
check(
  sneakyProfile?.role === "customer",
  `signup metadata role:"admin" is downgraded to customer (got '${sneakyProfile?.role}')`,
);
const roleRow = await one(`select role from public.user_roles where user_id = '${owner.id}'`);
check(roleRow?.role === "restaurant", "user_roles row created alongside profile");

console.log("\n=== restaurant + menu ===");
const rest = await one(`
  insert into public.restaurants (owner_id, name, slug, town, address, lat, lng, avg_prep_minutes)
  values ('${owner.id}', 'Mama Ngoma Kitchen', 'mama-ngoma', 'Moshi',
          'Kaunda Street', -3.3382, 37.3405, 20)
  returning id, status`);
check(rest.status === "pending_payment", "new listing starts as pending_payment");

await db.exec(`insert into public.restaurant_hours (restaurant_id, day_of_week, opens_at, closes_at)
  select '${rest.id}', d, '07:00', '21:00' from generate_series(0,6) d`);

const ugali = await one(`
  insert into public.menu_items (restaurant_id, name, description, price, category, prep_minutes)
  values ('${rest.id}', 'Ugali na nyama choma', 'With kachumbari', 8000, 'grills', 25)
  returning id, search_text`);
check(
  ugali.search_text === "ugali na nyama choma with kachumbari",
  "generated search_text is lower-cased name + description",
);
const soda = await one(`
  insert into public.menu_items (restaurant_id, name, price, category, prep_minutes)
  values ('${rest.id}', 'Soda baridi', 1500, 'drinks', 2) returning id`);

console.log("\n=== the 5,000 TZS gate ===");
await asUser(owner.id);
let blocked = false;
try {
  await db.exec(`update public.restaurants set status = 'active' where id = '${rest.id}'`);
} catch (e) {
  blocked = /Listing status is set by the platform/.test(e.message);
}
check(blocked, "owner CANNOT set their own listing active");

await asService();
const pay = await one(`
  insert into public.registration_payments (restaurant_id, amount, method, reference, status)
  values ('${rest.id}', 0, 'mpesa', 'ABC123', 'submitted') returning id, amount`);
check(Number(pay.amount) === 5000, `fee forced to 5000 from platform_settings (got ${pay.amount})`);

await db.exec(`update public.registration_payments set status='confirmed' where id='${pay.id}'`);
const afterPay = await one(`select status from public.restaurants where id = '${rest.id}'`);
check(afterPay.status === "active", "confirming payment activates the listing");

console.log("\n=== order pricing integrity ===");
await asUser(customer.id);
const order = await one(`
  insert into public.orders (customer_id, restaurant_id, arrival_minutes, note)
  values ('${customer.id}', '${rest.id}', 15, 'no pilipili')
  returning id, code, subtotal, expected_arrival_at`);
check(/^CF-[2-9A-HJ-NP-Z]{5}$/.test(order.code), `order code generated (${order.code})`);
check(Number(order.subtotal) === 0, "order starts with zero totals");

// The attack: claim the 8,000 TSh dish costs 1 TSh.
await db.exec(`insert into public.order_items (order_id, menu_item_id, name, unit_price, qty)
  values ('${order.id}', '${ugali.id}', 'Free food', 1, 2)`);
const line = await one(`select name, unit_price, prep_minutes, line_total
  from public.order_items where order_id = '${order.id}'`);
check(
  Number(line.unit_price) === 8000,
  `posted unit_price 1 overridden to 8000 (got ${line.unit_price})`,
);
check(line.name === "Ugali na nyama choma", "posted name overridden from the live menu");
check(Number(line.line_total) === 16000, "line_total recomputed as 8000 x 2");

await db.exec(`insert into public.order_items (order_id, menu_item_id, name, unit_price, qty)
  values ('${order.id}', '${soda.id}', 'Soda baridi', 1500, 1)`);
const totals = await one(
  `select subtotal, total, prep_minutes from public.orders where id='${order.id}'`,
);
check(Number(totals.subtotal) === 17500, `totals recomputed by trigger (got ${totals.subtotal})`);
check(
  totals.prep_minutes === 25,
  `prep_minutes = slowest dish, not the sum (got ${totals.prep_minutes})`,
);

console.log("\n=== cross-restaurant + stock guards ===");
const other = await one(`
  insert into public.restaurants (owner_id, name, slug, town, address, lat, lng)
  values ('${sneaky.id}', 'Other Place', 'other-place', 'Moshi', 'X', -3.34, 37.34)
  returning id`);
await asService();
const otherDish = await one(`insert into public.menu_items (restaurant_id, name, price)
  values ('${other.id}', 'Chips', 3000) returning id`);
await asUser(customer.id);
let mixed = false;
try {
  await db.exec(`insert into public.order_items (order_id, menu_item_id, name, unit_price, qty)
    values ('${order.id}', '${otherDish.id}', 'Chips', 3000, 1)`);
} catch (e) {
  mixed = /cannot mix dishes from different restaurants/.test(e.message);
}
check(mixed, "cannot add a dish from a different restaurant to an order");

await asService();
await db.exec(`update public.menu_items set is_available = false where id = '${soda.id}'`);
await asUser(customer.id);
let stock = false;
try {
  await db.exec(`insert into public.order_items (order_id, menu_item_id, name, unit_price, qty)
    values ('${order.id}', '${soda.id}', 'Soda', 1500, 1)`);
} catch (e) {
  stock = /out of stock/.test(e.message);
}
check(stock, "cannot order an out-of-stock dish");

console.log("\n=== order status pipeline ===");
let skipped = false;
try {
  await asUser(owner.id);
  await db.exec(`update public.orders set status = 'ready' where id = '${order.id}'`);
} catch (e) {
  skipped = /cannot move from pending to ready/.test(e.message);
}
check(skipped, "kitchen cannot jump pending -> ready");

await db.exec(`update public.orders set status='accepted' where id='${order.id}'`);
const acc = await one(
  `select status, accepted_at, preparing_at from public.orders where id='${order.id}'`,
);
check(acc.accepted_at !== null, "accepted_at stamped automatically");
check(acc.preparing_at === null, "preparing_at still null");

let tamper = false;
try {
  await db.exec(`update public.orders set subtotal = 1 where id = '${order.id}'`);
} catch (e) {
  tamper = /cannot be changed after it is placed/.test(e.message);
}
check(tamper, "kitchen cannot change the order total");

let hijack = false;
try {
  await db.exec(`update public.orders set arrival_minutes = 90 where id = '${order.id}'`);
} catch (e) {
  hijack = /cannot change the customer arrival details/.test(e.message);
}
check(hijack, "kitchen cannot move the customer's arrival time");

await db.exec(`update public.orders set status='preparing' where id='${order.id}'`);
await asUser(customer.id);
let lateCancel = false;
try {
  await db.exec(`update public.orders set status='cancelled' where id='${order.id}'`);
} catch (e) {
  lateCancel = /only be cancelled before the kitchen starts cooking/.test(e.message);
}
check(lateCancel, "customer cannot cancel once cooking has started");

const events = await one(
  `select count(*)::int c from public.order_events where order_id='${order.id}'`,
);
check(events.c === 3, `status history logged: pending, accepted, preparing (got ${events.c})`);

// Timestamps must be stamped for every writer, not only the vendor path.
// They used to be set after the guard's authorisation short-circuits, so an
// admin or a server function moving an order left them null and quietly
// broke the vendor's ready-on-time metric.
await asService();
const svcOrder = await one(`
  insert into public.orders (customer_id, restaurant_id, arrival_minutes)
  values ('${customer.id}', '${rest.id}', 20) returning id`);
await db.exec(`update public.orders set status='accepted' where id='${svcOrder.id}'`);
const svcStamped = await one(`select accepted_at from public.orders where id='${svcOrder.id}'`);
check(svcStamped.accepted_at !== null, "service-role status change still stamps accepted_at");
await db.exec(`delete from public.orders where id='${svcOrder.id}'`);
await asUser(customer.id);

console.log("\n=== ready-on-arrival maths ===");
const timing = await one(`
  select (extract(epoch from (expected_arrival_at - now()))/60)::float8 as mins_to_arrival,
         prep_minutes,
         (extract(epoch from (expected_arrival_at - make_interval(mins => prep_minutes) - now()))/60)::float8
           as mins_to_cook_start
  from public.orders where id = '${order.id}'`);
check(
  Math.round(timing.mins_to_arrival) === 15,
  `arrival is 15 min out (got ${timing.mins_to_arrival.toFixed(1)})`,
);
check(
  Math.round(timing.mins_to_cook_start) === -10,
  `cook-start already passed by 10 min: 15 arrival - 25 prep (got ${timing.mins_to_cook_start.toFixed(1)})`,
);

console.log("\n=== live arrival ping ===");
await asUser(customer.id);
await db.exec(`insert into public.order_pings (order_id, lat, lng, distance_km, eta_minutes)
  values ('${order.id}', -3.3400, 37.3400, 1.2, 4)`);
const pinged = await one(
  `select (extract(epoch from (expected_arrival_at - now()))/60)::float8 m, customer_lat
   from public.orders where id='${order.id}'`,
);
check(
  Math.round(pinged.m) === 15,
  `manual arrival is NOT overridden by a ping (still ${pinged.m.toFixed(1)} min)`,
);

await asService();
const gpsOrder = await one(`
  insert into public.orders (customer_id, restaurant_id, arrival_mode, arrival_minutes)
  values ('${customer.id}', '${rest.id}', 'gps', 30) returning id`);
await asUser(customer.id);
await db.exec(`insert into public.order_pings (order_id, lat, lng, eta_minutes)
  values ('${gpsOrder.id}', -3.34, 37.34, 6)`);
const gps = await one(
  `select (extract(epoch from (expected_arrival_at - now()))/60)::float8 m from public.orders where id='${gpsOrder.id}'`,
);
check(
  Math.round(gps.m) === 6,
  `GPS order re-timed 30 -> 6 min by the ping (got ${gps.m.toFixed(1)})`,
);

console.log("\n=== discovery search ===");
await asService();
await db.exec(`update public.menu_items set is_available = true where id = '${soda.id}'`);
const hits = await db.query(
  `select item_name, price, distance_km, is_open, restaurant_name
   from public.search_dishes('ugali', -3.3500, 37.3300, 'Moshi', null, null, null, false, true, 'price_asc', 60)`,
);
check(hits.rows.length === 1, `search('ugali') finds the dish (${hits.rows.length} row)`);
check(
  Number(hits.rows[0]?.distance_km) > 0 && Number(hits.rows[0]?.distance_km) < 5,
  `distance computed: ${Number(hits.rows[0]?.distance_km).toFixed(2)} km`,
);
const noise = await db.query(`select * from public.search_dishes('pizza')`);
check(noise.rows.length === 0, "search for a dish nobody sells returns nothing");

const sorted = await db.query(
  `select item_name, price from public.search_dishes(null, -3.35, 37.33, 'Moshi', null, null, null, false, true, 'price_asc', 60)`,
);
check(
  Number(sorted.rows[0]?.price) <= Number(sorted.rows[sorted.rows.length - 1]?.price),
  `price_asc sorts cheapest first (${sorted.rows.map((r) => r.price).join(" -> ")})`,
);

const nearby = await db.query(`select name, dish_count, min_price, is_open
  from public.restaurants_nearby(-3.35, 37.33, 'Moshi', null, false, 60)`);
check(nearby.rows.length === 1, "restaurants_nearby returns only the ACTIVE listing");
check(
  Number(nearby.rows[0]?.min_price) === 1500,
  `min_price = cheapest dish (${nearby.rows[0]?.min_price})`,
);

console.log("\n=== typo-tolerant search ===");
const typo = await db.query(`select item_name, is_fuzzy_match from public.search_dishes('ugaly')`);
check(
  typo.rows.length === 1 && typo.rows[0].item_name === "Ugali na nyama choma",
  `"ugaly" still finds the ugali (${typo.rows.length} row)`,
);
check(typo.rows[0]?.is_fuzzy_match === true, "the near-miss is flagged as a fuzzy match");

const exact = await db.query(`select is_fuzzy_match from public.search_dishes('ugali')`);
check(exact.rows[0]?.is_fuzzy_match === false, "an exact match is not flagged as fuzzy");

// Fuzzy must never outrank exact, or a typo's approximate hits bury the real
// ones and the feature reads as broken.
// "Sodda" is deliberately NOT a superstring of "soda" — otherwise it would
// match the LIKE branch and this would prove nothing about ranking. It is
// also priced below the exact match, so price_asc would put it first if
// fuzziness were not the primary sort key.
await asService();
const nearMiss = await one(
  `insert into public.menu_items (restaurant_id, name, price, category, prep_minutes)
   values ('${rest.id}', 'Sodda ya kienyeji', 500, 'drinks', 2) returning id`,
);
const ranked = await db.query(
  `select item_name, price, is_fuzzy_match
   from public.search_dishes('soda', null, null, null, null, null, null, false, true, 'price_asc', 60)`,
);
check(
  ranked.rows.length === 2,
  `fuzzy search finds both the exact and the near-miss (${ranked.rows.length})`,
);
check(
  ranked.rows[0]?.is_fuzzy_match === false && ranked.rows[1]?.is_fuzzy_match === true,
  `exact outranks fuzzy even though the fuzzy one is cheaper (${ranked.rows
    .map((r) => `${r.item_name} ${r.price}`)
    .join(" -> ")})`,
);
await db.exec(`delete from public.menu_items where id = '${nearMiss.id}'`);

// Short queries must still substring-match ("ug" -> ugali is genuinely
// useful); what they must not do is fuzzy-match, which at two characters
// pulls in nearly the whole menu.
const shortExact = await db.query(`select is_fuzzy_match from public.search_dishes('ug')`);
check(
  shortExact.rows.length > 0 && shortExact.rows.every((r) => r.is_fuzzy_match === false),
  `a 2-character query substring-matches but never fuzzy-matches (${shortExact.rows.length} rows, all exact)`,
);
const shortJunk = await db.query(`select item_name from public.search_dishes('zq')`);
check(
  shortJunk.rows.length === 0,
  `a 2-character non-match returns nothing rather than fuzzing (${shortJunk.rows.length} rows)`,
);

const suggestion = await one(`select public.suggest_dish('ugaly') s`);
check(suggestion.s === "Ugali na nyama choma", `suggest_dish('ugaly') -> '${suggestion.s}'`);
const noSuggestion = await one(`select public.suggest_dish('zzzzzz') s`);
check(noSuggestion.s === null, "no suggestion for something nobody sells");

console.log("\n=== reviews rollup ===");
await asService();
await db.exec(`update public.orders set status='ready' where id='${order.id}'`);
await db.exec(`update public.orders set status='completed' where id='${order.id}'`);
await asUser(customer.id);
await db.exec(`insert into public.reviews (order_id, customer_id, restaurant_id, stars, was_ready_on_time, comment)
  values ('${order.id}', '${customer.id}', '${rest.id}', 4, true, 'Ilikuwa tayari nilipofika')`);
const rated = await one(
  `select rating, rating_count from public.restaurants where id='${rest.id}'`,
);
check(
  Number(rated.rating) === 4 && rated.rating_count === 1,
  `rating rolled up (${rated.rating}, n=${rated.rating_count})`,
);

const feed = await db.query(
  `select reviewer_first_name, stars from public.restaurant_reviews('${rest.id}')`,
);
check(
  feed.rows[0]?.reviewer_first_name === "Asha",
  `review feed exposes first name only (got '${feed.rows[0]?.reviewer_first_name}')`,
);

console.log("\n=== opening hours ===");
const openNow = await one(`select public.is_restaurant_open('${rest.id}') o`);
check(typeof openNow.o === "boolean", `is_restaurant_open returns a boolean (${openNow.o})`);
await db.exec(
  `update public.restaurant_hours set is_closed = true where restaurant_id='${rest.id}'`,
);
const closed = await one(`select public.is_restaurant_open('${rest.id}') o`);
check(closed.o === false, "closed on every weekday reads as closed");

// ---------------------------------------------------------------------------
// Row Level Security.
//
// Everything above ran as the table owner, which bypasses RLS entirely — so
// none of it says anything about what a real client can see. These checks
// switch to the actual `anon` / `authenticated` roles, exactly as PostgREST
// does, and assert on what comes back.
//
// Supabase grants table privileges to anon/authenticated automatically via
// ALTER DEFAULT PRIVILEGES; that's replicated here so the policies are the
// only thing standing between a role and the data.
// ---------------------------------------------------------------------------
console.log("\n=== vendor analytics ===");
await asUser(owner.id);
const summary = await one(`select * from public.vendor_summary('${rest.id}', 30)`);
check(Number(summary.orders_total) === 2, `counts this kitchen's orders (${summary.orders_total})`);
check(
  Number(summary.orders_completed) === 1,
  `counts completed separately (${summary.orders_completed})`,
);
check(Number(summary.takings) === 17500, `takings sum only completed orders (${summary.takings})`);
check(
  Number(summary.rating) === 4 && summary.rating_count === 1,
  `carries the rating through (${summary.rating}, n=${summary.rating_count})`,
);
// The metric asks "was the food ready before the customer said they'd
// arrive". The completed order was marked ready seconds after it was placed,
// 15 minutes ahead of its arrival time, so 100% is the honest answer.
//
// Compared against null explicitly rather than through Number(): `Number(null)
// === 0` is true, so a missing ready_at would otherwise sail through as a
// genuine score.
check(
  summary.ready_on_time_pct !== null && Number(summary.ready_on_time_pct) === 100,
  `ready-on-time measured, not null (${summary.ready_on_time_pct}%)`,
);

const daily = await db.query(
  `select day, orders, takings from public.vendor_daily('${rest.id}', 14)`,
);
check(daily.rows.length === 14, `daily series returns one row per day (${daily.rows.length})`);
check(
  daily.rows.filter((r) => Number(r.orders) > 0).length === 1,
  "quiet days are present as zeroes rather than missing",
);
check(
  Number(daily.rows[daily.rows.length - 1].takings) === 17500,
  `today's takings land on today (${daily.rows[daily.rows.length - 1].takings})`,
);

const top = await db.query(
  `select name, qty, takings from public.vendor_top_dishes('${rest.id}', 30, 10)`,
);
check(
  top.rows.length === 2 && top.rows[0].name === "Ugali na nyama choma",
  `best seller first by quantity (${top.rows.map((r) => `${r.name} x${r.qty}`).join(", ")})`,
);

const hours = await db.query(
  `select hour, orders from public.vendor_busiest_hours('${rest.id}', 30)`,
);
check(hours.rows.length === 24, `busiest-hours covers the full day (${hours.rows.length} buckets)`);

// The gate: analytics are SECURITY DEFINER and bypass RLS, so ownership has
// to be enforced inside the function or any signed-in user could read a
// rival's takings.
let peeked = false;
try {
  await as("authenticated", sneaky.id, `select * from public.vendor_summary('${rest.id}', 30)`);
} catch (e) {
  peeked = /Not authorized to view this restaurant/.test(e.message);
}
check(peeked, "a rival restaurant cannot read another kitchen's analytics");

// A metric that only ever reports 100% measures nothing. Prove it moves: an
// order whose customer arrives *now* cannot be ready before they get there.
await asService();
const lateOrder = await one(`
  insert into public.orders (customer_id, restaurant_id, arrival_minutes)
  values ('${customer.id}', '${rest.id}', 0) returning id`);
await db.exec(`update public.orders set status='accepted'  where id='${lateOrder.id}'`);
await db.exec(`update public.orders set status='preparing' where id='${lateOrder.id}'`);
await db.exec(`update public.orders set status='ready'     where id='${lateOrder.id}'`);
await asUser(owner.id);
const afterLate = await one(
  `select ready_on_time_pct from public.vendor_summary('${rest.id}', 30)`,
);
check(
  Number(afterLate.ready_on_time_pct) === 50,
  `one on-time and one late reads 50%, so the metric discriminates (${afterLate.ready_on_time_pct}%)`,
);
await asService();
await db.exec(`delete from public.orders where id='${lateOrder.id}'`);

console.log("\n=== admin summary ===");
// Promote the sneaky user to admin so there is someone allowed to read this.
await asService();
await db.exec(`delete from public.user_roles where user_id = '${sneaky.id}'`);
await db.exec(`insert into public.user_roles (user_id, role) values ('${sneaky.id}', 'admin')`);

await asUser(sneaky.id);
const platform = await one(`select * from public.admin_summary()`);
check(
  Number(platform.total_restaurants) === 2,
  `counts every restaurant (${platform.total_restaurants})`,
);
check(
  Number(platform.active_restaurants) === 1,
  `counts only the paid-up one as active (${platform.active_restaurants})`,
);
check(
  Number(platform.fee_revenue) === 5000,
  `fee revenue is the confirmed registration fee (${platform.fee_revenue})`,
);
check(
  Number(platform.order_volume) === 17500,
  `order volume is food sold, kept separate from fee revenue (${platform.order_volume})`,
);
check(
  Number(platform.fee_revenue) !== Number(platform.order_volume),
  "platform revenue and order volume are not the same number",
);

// The gate. SECURITY DEFINER bypasses RLS, so without this check any signed-in
// customer could read the platform's revenue.
let peekedPlatform = false;
try {
  await as("authenticated", customer.id, `select * from public.admin_summary()`);
} catch (e) {
  peekedPlatform = /Not authorized to view platform statistics/.test(e.message);
}
check(peekedPlatform, "a customer cannot read platform statistics");

// Put the role back so the RLS section below still sees a non-admin rival.
await asService();
await db.exec(`delete from public.user_roles where user_id = '${sneaky.id}'`);
await db.exec(
  `insert into public.user_roles (user_id, role) values ('${sneaky.id}', 'restaurant')`,
);

console.log("\n=== row level security ===");
await asService();
await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`);

// A second customer, to prove orders aren't visible across accounts.
const other2 = await one(
  `insert into auth.users (email, raw_user_meta_data)
   values ('nosy@test', '{"full_name":"Nosy","role":"customer"}'::jsonb) returning id`,
);

/** Runs a query as a real Postgres role with a given end-user id. */
async function as(role, uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  await db.exec(`set role ${role};`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec(`reset role;`);
  }
}
async function denied(role, uid, sql) {
  try {
    await as(role, uid, sql);
    return false;
  } catch {
    return true;
  }
}

// -- guests -----------------------------------------------------------------
const anonRests = await as("anon", null, `select slug, status from public.restaurants`);
check(
  anonRests.rows.length === 1 && anonRests.rows[0].status === "active",
  `guest sees only ACTIVE restaurants (${anonRests.rows.length} of 2)`,
);
const anonMenu = await as("anon", null, `select name from public.menu_items`);
check(
  anonMenu.rows.length === 2,
  `guest sees the active restaurant's menu only (${anonMenu.rows.length} dishes)`,
);
const anonOrders = await as("anon", null, `select id from public.orders`);
check(anonOrders.rows.length === 0, "guest sees no orders at all");
const anonProfiles = await as("anon", null, `select id from public.profiles`);
check(anonProfiles.rows.length === 0, "guest sees no profiles");
check(
  await denied(
    "anon",
    null,
    `insert into public.orders (customer_id, restaurant_id, arrival_minutes)
     values ('${customer.id}', '${rest.id}', 10)`,
  ),
  "guest cannot place an order",
);

// -- customers --------------------------------------------------------------
const mine = await as("authenticated", customer.id, `select id from public.orders`);
check(mine.rows.length === 2, `customer sees their own 2 orders (${mine.rows.length})`);
const theirs = await as("authenticated", other2.id, `select id from public.orders`);
check(theirs.rows.length === 0, "a different customer sees none of them");

const otherProfile = await as(
  "authenticated",
  other2.id,
  `select id from public.profiles where id = '${customer.id}'`,
);
check(otherProfile.rows.length === 0, "customer cannot read another customer's profile");

check(
  await denied(
    "authenticated",
    other2.id,
    `insert into public.orders (customer_id, restaurant_id, arrival_minutes)
     values ('${customer.id}', '${rest.id}', 10)`,
  ),
  "customer cannot place an order in someone else's name",
);

const custPayments = await as(
  "authenticated",
  customer.id,
  `select id from public.registration_payments`,
);
check(custPayments.rows.length === 0, "customer cannot see registration payments");

// -- vendors ----------------------------------------------------------------
const vendorOrders = await as("authenticated", owner.id, `select id from public.orders`);
check(
  vendorOrders.rows.length === 2,
  `vendor sees orders for their kitchen (${vendorOrders.rows.length})`,
);
const rivalOrders = await as("authenticated", sneaky.id, `select id from public.orders`);
check(rivalOrders.rows.length === 0, "a rival restaurant sees none of them");

const ownPay = await as("authenticated", owner.id, `select id from public.registration_payments`);
check(ownPay.rows.length === 1, "vendor sees their own registration payment");
const rivalPay = await as(
  "authenticated",
  sneaky.id,
  `select id from public.registration_payments`,
);
check(rivalPay.rows.length === 0, "vendor cannot see another restaurant's payment");

const rivalEdit = await as(
  "authenticated",
  sneaky.id,
  `update public.menu_items set price = 1 where id = '${ugali.id}' returning id`,
);
const priceAfter = await one(`select price from public.menu_items where id = '${ugali.id}'`);
check(
  rivalEdit.rows.length === 0 && Number(priceAfter.price) === 8000,
  `vendor cannot edit another restaurant's menu (${rivalEdit.rows.length} rows, price still ${priceAfter.price})`,
);

// The load-bearing one: a vendor must not be able to confirm its own payment.
const selfConfirm = await as(
  "authenticated",
  owner.id,
  `update public.registration_payments set status = 'confirmed'
   where restaurant_id = '${rest.id}' returning id`,
);
check(
  selfConfirm.rows.length === 0,
  "vendor cannot confirm their own payment (0 rows affected by RLS)",
);

console.log("\n=== kitchen capacity (order throttling) ===");
await asService();

// Opt-in by default: a restaurant that has never touched the setting must
// behave exactly as it did before this feature existed.
const unlimited = await one(`select * from public.check_kitchen_slot('${other.id}', 20, 30)`);
check(
  unlimited.available === true && Number(unlimited.capacity) === 0,
  "capacity 0 leaves the kitchen unthrottled",
);

// Now the kitchen declares it can cook one order at a time.
await db.exec(`update public.restaurants
  set kitchen_capacity = 1, avg_prep_minutes = 20 where id = '${other.id}'`);

const firstSlot = await one(`insert into public.orders (customer_id, restaurant_id, arrival_minutes)
  values ('${customer.id}', '${other.id}', 30) returning id`);
check(!!firstSlot.id, "the first pre-order fits an empty kitchen");

const fullSlot = await one(`select * from public.check_kitchen_slot('${other.id}', 20, 30)`);
check(
  fullSlot.available === false && Number(fullSlot.busy) === 1,
  `a second order wanting the same window is refused (busy ${fullSlot.busy}/${fullSlot.capacity})`,
);
check(
  Number(fullSlot.suggested_minutes) > 30,
  `and a later arrival is offered instead of a flat no (${fullSlot.suggested_minutes} min)`,
);

// check_kitchen_slot() is advice the UI shows; this is the rule. Two customers
// loading the last slot at once would both be told yes, so the INSERT itself
// has to be the thing that says no.
let overbooked = false;
try {
  await db.exec(`insert into public.orders (customer_id, restaurant_id, arrival_minutes)
    values ('${customer.id}', '${other.id}', 30)`);
} catch (e) {
  overbooked = /KITCHEN_FULL/.test(e.message);
}
check(overbooked, "the database refuses the overbooked order, not just the UI");

// Advice nobody can act on is worse than none: book the exact slot it named.
const suggested = Number(fullSlot.suggested_minutes);
const laterSlot = await one(`insert into public.orders (customer_id, restaurant_id, arrival_minutes)
  values ('${customer.id}', '${other.id}', ${suggested}) returning id`);
check(!!laterSlot.id, `the slot the system suggested is genuinely bookable (${suggested} min)`);

await db.exec(`update public.orders set status = 'cancelled'
  where id in ('${firstSlot.id}', '${laterSlot.id}')`);
const freed = await one(`select * from public.check_kitchen_slot('${other.id}', 20, 30)`);
check(
  freed.available === true,
  "a cancelled order releases the kitchen instead of holding the slot forever",
);

// kitchen_load() counts other people's orders, so it is SECURITY DEFINER and
// must not be reachable from a browser.
check(
  await denied(
    "authenticated",
    customer.id,
    `select public.kitchen_load('${other.id}', now(), now() + interval '1 hour')`,
  ),
  "a customer cannot count another kitchen's live orders",
);

await asService();
await db.exec(`update public.restaurants set kitchen_capacity = 0 where id = '${other.id}'`);

console.log("\n=== first-admin bootstrap ===");

await asService();
// Read the claim the migration seeded rather than repeating the address here.
// Hard-coding it would let the test keep passing against an email the
// migration no longer uses — the one failure this section must never have.
const seededClaim = (
  await one(`select bootstrap_admin_email e from public.platform_settings where id`)
).e;
check(
  typeof seededClaim === "string" && seededClaim.includes("@"),
  `the migration seeds a bootstrap claim (${seededClaim})`,
);

// The claimant's mailbox. Set first so the "already owned" case below is
// testing the admin-exists guard and nothing else.
await db.exec(`update auth.users set email = '${seededClaim}' where id = '${sneaky.id}'`);

// Set up the closed case explicitly instead of relying on whatever roles
// earlier sections happened to leave behind — a guard this load-bearing
// should not be tested against inherited state.
await db.exec(`insert into public.user_roles (user_id, role)
  values ('${owner.id}', 'admin') on conflict (user_id, role) do nothing`);
const shutWhileAdminExists = await one(`select public.bootstrap_available() a`);
check(
  shutWhileAdminExists.a === false,
  "bootstrap reports itself unavailable while an admin exists",
);

// The advisory flag and the function have to agree; the flag only decides
// whether a button is drawn, so the refusal has to live in the function.
let closedForReal = false;
try {
  await as("authenticated", sneaky.id, `select public.bootstrap_admin()`);
} catch (e) {
  closedForReal = /BOOTSTRAP_CLOSED/.test(e.message);
}
check(closedForReal, "and the function itself refuses while the platform has an owner");

// Strip every admin to recreate a fresh, un-owned platform.
await asService();
await db.exec(`delete from public.user_roles where role = 'admin'`);
await db.exec(
  `update public.platform_settings set bootstrap_admin_email = '${seededClaim}' where id`,
);
const bootstrapOpen = await one(`select public.bootstrap_available() a`);
check(bootstrapOpen.a === true, "with no admin and an unused claim, bootstrap is available");

// The named mailbox is the whole gate: a signed-in stranger must bounce.
let wrongAccount = false;
try {
  await as("authenticated", customer.id, `select public.bootstrap_admin()`);
} catch (e) {
  wrongAccount = /BOOTSTRAP_NOT_ELIGIBLE/.test(e.message);
}
check(wrongAccount, "a signed-in stranger cannot claim the first admin seat");

// ...and anon cannot even reach the function.
check(
  await denied("anon", null, `select public.bootstrap_admin()`),
  "an anonymous visitor cannot call the bootstrap at all",
);

// The real claimant.
const claimed = await as("authenticated", sneaky.id, `select public.bootstrap_admin() v`);
check(
  claimed.rows[0].v === seededClaim,
  `the seeded account claims the admin seat (${claimed.rows[0].v})`,
);

await asService();
const promoted = await one(`select role from public.profiles where id = '${sneaky.id}'`);
check(
  promoted.role === "admin",
  `profiles.role follows user_roles through the sync trigger (${promoted.role})`,
);

// The ticket is burned, so a second call fails even for the right account.
let reused = false;
try {
  await as("authenticated", sneaky.id, `select public.bootstrap_admin()`);
} catch (e) {
  reused = /BOOTSTRAP_CLOSED/.test(e.message);
}
check(reused, "the claim cannot be used twice");

// The load-bearing one: deleting the admin must not re-open the door, or
// anyone who ever controls that mailbox owns the platform.
await asService();
await db.exec(`delete from public.user_roles where role = 'admin'`);
const stillShut = await one(`select public.bootstrap_available() a`);
check(
  stillShut.a === false,
  "removing the admin does not re-open the bootstrap — the ticket stays burned",
);

// Put the admin back for anything downstream.
await db.exec(`insert into public.user_roles (user_id, role) values ('${sneaky.id}', 'admin')`);

console.log("\n=== auto-confirm on reference match ===");
await asService();

// A second restaurant to register, owned by someone with no admin powers.
const payerUser = await one(
  `insert into auth.users (email, raw_user_meta_data)
   values ('payer@test', '{"full_name":"Payer","role":"restaurant"}'::jsonb) returning id`,
);
const payerRest = await one(`
  insert into public.restaurants (owner_id, name, slug, town, address, lat, lng)
  values ('${payerUser.id}', 'Kilimanjaro Bites', 'kili-bites', 'Moshi', 'Rau', -3.35, 37.35)
  returning id, status`);
check(payerRest.status === "pending_payment", "the new listing starts locked behind the fee");

// --- no ledger entry: nothing happens, exactly as before this feature -------
const unmatched = await one(`
  insert into public.registration_payments (restaurant_id, method, reference, status)
  values ('${payerRest.id}', 'mpesa', 'QWE123RTY', 'submitted')
  returning id, status`);
check(
  unmatched.status === "submitted",
  `an unrecognised reference waits for a human (${unmatched.status})`,
);
const stillLocked = await one(`select status from public.restaurants where id='${payerRest.id}'`);
check(
  stillLocked.status === "pending_payment",
  "and the listing stays locked — a plausible-looking reference is not payment",
);

// --- the money arrives ------------------------------------------------------
await db.exec(`insert into public.received_payments (reference, amount, msisdn)
  values ('qwe 123-rty', 5000, '255700000001')`);

// Correcting the reference to the same value re-triggers the match. Retyping
// it differently is the realistic case: off a phone screen, with punctuation.
await db.exec(`update public.registration_payments
  set reference = 'QWE123RTY' where id = '${unmatched.id}'`);

const matched = await one(
  `select status, msisdn, note from public.registration_payments where id='${unmatched.id}'`,
);
check(
  matched.status === "confirmed",
  `a reference matching received money auto-confirms (${matched.status})`,
);
check(
  matched.msisdn === "255700000001",
  `and carries the payer's number across for reconciliation (${matched.msisdn})`,
);
const activated = await one(`select status from public.restaurants where id='${payerRest.id}'`);
check(activated.status === "active", "the listing goes live with no admin involved");

// --- one payment, one listing ----------------------------------------------
const ledger = await one(
  `select claimed_by, claimed_at from public.received_payments where reference_key = 'QWE123RTY'`,
);
check(ledger.claimed_by === unmatched.id, "the ledger entry is marked spent on that registration");

const rival = await one(`
  insert into public.restaurants (owner_id, name, slug, town, address, lat, lng)
  values ('${customer.id}', 'Copycat Grill', 'copycat', 'Moshi', 'Rau', -3.35, 37.35)
  returning id`);
const doubleSpend = await one(`
  insert into public.registration_payments (restaurant_id, method, reference, status)
  values ('${rival.id}', 'mpesa', 'QWE123RTY', 'submitted') returning id, status`);
check(
  doubleSpend.status === "submitted",
  `the same reference cannot pay for a second listing (${doubleSpend.status})`,
);
const rivalStatus = await one(`select status from public.restaurants where id='${rival.id}'`);
check(rivalStatus.status === "pending_payment", "so the copycat listing stays locked");

// --- underpayment -----------------------------------------------------------
await db.exec(`insert into public.received_payments (reference, amount)
  values ('CHEAP001', 100)`);
const cheap = await one(`
  insert into public.registration_payments (restaurant_id, method, reference, status)
  values ('${rival.id}', 'mpesa', 'CHEAP001', 'submitted') returning id, status`);
check(
  cheap.status === "submitted",
  `money below the 5,000 fee does not activate anything (${cheap.status})`,
);

// --- a short string must not sweep the ledger -------------------------------
await db.exec(`insert into public.received_payments (reference, amount) values ('AB12', 9000)`);
const tooShort = await one(`
  insert into public.registration_payments (restaurant_id, method, reference, status)
  values ('${rival.id}', 'mpesa', 'AB12', 'submitted') returning id, status`);
check(
  tooShort.status === "submitted",
  "a reference too short to be a transaction ID never matches",
);

// --- who may touch what ----------------------------------------------------
// The ledger is the secret this whole mechanism rests on: a vendor who could
// read unclaimed references would just copy one.
const peekLedger = await as(
  "authenticated",
  customer.id,
  `select id from public.received_payments`,
);
check(peekLedger.rows.length === 0, "a vendor cannot read the received-payments ledger");

check(
  await denied(
    "authenticated",
    customer.id,
    `insert into public.received_payments (reference, amount) values ('FORGED0001', 9000)`,
  ),
  "a vendor cannot record money into the ledger",
);

// Correcting a mistyped reference is the whole reason vendors got an UPDATE
// policy, so it has to actually work.
const corrected = await as(
  "authenticated",
  customer.id,
  `update public.registration_payments set reference = 'NEWREF999'
     where id = '${cheap.id}' returning reference`,
);
check(corrected.rows.length === 1, "a vendor can correct their own mistyped reference");

// ...and that policy must not have handed them a way to confirm themselves.
let selfPromoted = false;
let selfPromoteRows = -1;
try {
  const r = await as(
    "authenticated",
    customer.id,
    `update public.registration_payments set status = 'confirmed'
       where id = '${cheap.id}' returning id`,
  );
  selfPromoteRows = r.rows.length;
} catch (e) {
  selfPromoted = /Only the payment reference and method can be corrected/.test(e.message);
}
const cheapAfter = await one(
  `select status from public.registration_payments where id = '${cheap.id}'`,
);
check(
  (selfPromoted || selfPromoteRows === 0) && cheapAfter.status === "submitted",
  `the new UPDATE policy did not hand vendors self-confirmation (still ${cheapAfter.status})`,
);

console.log("\n=== admin audit log ===");
await asService();

await db.exec(`select public.log_admin_action('${sneaky.id}', 'restaurant.suspended',
  'restaurant', '${other.id}', 'Other Place', 'Selling outside declared hours')`);

const entry = await one(`select actor_name, action, subject_label, detail
  from public.admin_actions order by created_at desc limit 1`);
check(
  entry.action === "restaurant.suspended" && entry.subject_label === "Other Place",
  `an action is recorded with its subject named at the time (${entry.action})`,
);
check(
  entry.detail === "Selling outside declared hours",
  "the reason the admin typed is kept with it",
);
check(entry.actor_name != null, `the actor is resolved to a name (${entry.actor_name})`);

// The label has to outlive the thing it describes, or the log answers
// "who deleted this?" with "deleted restaurant". Needs a listing with no
// order history -- the orders FK is RESTRICT, which is what makes the
// console offer suspend instead of delete once a kitchen has traded.
const doomedOwner = await one(
  `insert into auth.users (email, raw_user_meta_data)
   values ('doomed@test', '{"full_name":"Doomed","role":"restaurant"}'::jsonb) returning id`,
);
const doomed = await one(`
  insert into public.restaurants (owner_id, name, slug, town, address, lat, lng)
  values ('${doomedOwner.id}', 'Closing Soon', 'closing-soon', 'Moshi', 'Y', -3.35, 37.35)
  returning id`);
await db.exec(`select public.log_admin_action('${sneaky.id}', 'restaurant.deleted',
  'restaurant', '${doomed.id}', 'Closing Soon', 'Owner asked to be removed')`);
await db.exec(`delete from public.restaurants where id = '${doomed.id}'`);
const survived = await one(`select subject_label, subject_id from public.admin_actions
  where action = 'restaurant.deleted' order by created_at desc limit 1`);
check(
  survived.subject_label === "Closing Soon",
  "the entry still names the restaurant after it is deleted",
);

// Append-only, against the service role itself -- RLS already stops clients.
let edited = false;
try {
  await db.exec(`update public.admin_actions set detail = 'something else'`);
} catch (e) {
  edited = /append-only/.test(e.message);
}
check(edited, "an existing entry cannot be rewritten, even by the service role");

// A client writing its own audit trail would make the log worthless.
check(
  await denied(
    "authenticated",
    customer.id,
    `select public.log_admin_action('${customer.id}', 'x', 'user', null, 'x', null)`,
  ),
  "a signed-in user cannot write to the audit log",
);
check(
  await denied(
    "authenticated",
    customer.id,
    `insert into public.admin_actions (action, subject_type) values ('x', 'user')`,
  ),
  "and cannot insert into the table directly",
);

// Reading is admin-only: the log names people and carries suspension reasons.
const readable = await as("authenticated", sneaky.id, `select id from public.admin_actions`);
check(readable.rows.length >= 1, "an admin can read the log");
const hidden = await as("authenticated", customer.id, `select id from public.admin_actions`);
check(hidden.rows.length === 0, "a customer sees none of it");

console.log(
  `\n${"=".repeat(52)}\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n${"=".repeat(52)}`,
);
process.exit(failures ? 1 : 0);
