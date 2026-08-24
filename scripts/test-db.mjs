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
`;

const db = await PGlite.create();

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
console.log("\n=== row level security ===");
await asService();
await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
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

console.log(
  `\n${"=".repeat(52)}\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n${"=".repeat(52)}`,
);
process.exit(failures ? 1 : 0);
