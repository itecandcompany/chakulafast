// Seeds a testable marketplace: five real-feeling Moshi kitchens with owner
// accounts, menus, opening hours and confirmed registration payments, plus a
// demo customer.
//
// Written as a Node script rather than SQL because the restaurants need real
// Supabase Auth users to own them — you can sign in as any of them and see
// the vendor dashboard with its own data, which a pure SQL seed can't give you.
//
// Idempotent: re-running updates the existing rows instead of duplicating.
//
// Usage:
//   npm run seed:demo
//   node --env-file=.env scripts/seed-demo.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env");
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD || "Demo@2026!";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Real coordinates around central Moshi, spread over a few km so distance
// sorting and the radius filter both have something to actually do.
const RESTAURANTS = [
  {
    slug: "mama-ngoma-kitchen",
    name: "Mama Ngoma Kitchen",
    email: "mamangoma@chakulafast.test",
    owner: "Neema Ngoma",
    description:
      "Home-style Tanzanian cooking near the clock tower. Everything is cooked to order, nothing sits under a lamp.",
    phone: "0754 100 201",
    address: "Kaunda Street, near the clock tower",
    lat: -3.3382,
    lng: 37.3405,
    avgPrep: 20,
    hours: { opens: "07:00", closes: "21:00", closedDays: [] },
    menu: [
      ["Ugali na maharage", "Ugali with red beans and greens.", 3000, "local", 12],
      ["Ugali na nyama choma", "Ugali with grilled beef and kachumbari.", 8000, "grills", 25],
      ["Wali maharage", "Rice and beans with a side of spinach.", 3500, "local", 10],
      ["Pilau ya nyama", "Beef pilau cooked with cardamom and cloves.", 6000, "local", 20],
      ["Chapati", "Soft layered chapati, made fresh.", 1000, "snacks", 8],
      ["Chai ya tangawizi", "Ginger tea with milk.", 1000, "drinks", 5],
    ],
  },
  {
    slug: "kilimanjaro-grill-house",
    name: "Kilimanjaro Grill House",
    email: "kilimanjarogrill@chakulafast.test",
    owner: "Baraka Massawe",
    description:
      "Charcoal grills and mishkaki, open late. Order ahead on match nights or you'll be waiting.",
    phone: "0754 100 202",
    address: "Rindi Lane, opposite the stadium",
    lat: -3.3467,
    lng: 37.3358,
    avgPrep: 30,
    hours: { opens: "11:00", closes: "23:00", closedDays: [] },
    menu: [
      ["Nyama choma (½ kg)", "Half a kilo of grilled goat with kachumbari.", 12000, "grills", 35],
      ["Mishkaki ya nyama", "Six beef skewers over charcoal.", 6000, "grills", 20],
      ["Kuku choma robo", "Quarter grilled chicken, peri sauce on the side.", 9000, "grills", 30],
      ["Ugali", "Plain ugali, one portion.", 1500, "local", 10],
      ["Chips kavu", "Plain fried chips.", 3000, "fast_food", 12],
      ["Soda baridi", "Chilled soft drink, 500ml.", 1500, "drinks", 2],
    ],
  },
  {
    slug: "hotel-chagga-bites",
    name: "Hotel Chagga Bites",
    email: "chaggabites@chakulafast.test",
    owner: "Upendo Kimaro",
    description:
      "Hotel restaurant serving breakfast all morning and a proper lunch buffet. Popular with office workers.",
    phone: "0754 100 203",
    address: "Boma Road, Hotel Chagga ground floor",
    lat: -3.3301,
    lng: 37.3441,
    avgPrep: 15,
    hours: { opens: "06:30", closes: "20:00", closedDays: [0] },
    menu: [
      ["Ugali samaki", "Ugali with fried tilapia from Nyumba ya Mungu.", 9500, "local", 22],
      ["Wali kuku", "Rice with chicken stew.", 7000, "local", 18],
      ["Chips mayai", "The classic omelette-and-chips.", 4000, "fast_food", 12],
      ["Mandazi (3)", "Three mandazi, fried this morning.", 1500, "breakfast", 5],
      ["Uji wa ulezi", "Millet porridge, served hot.", 1500, "breakfast", 5],
      ["Juisi ya embe", "Fresh mango juice.", 2500, "drinks", 5],
      ["Kachumbari", "Tomato and onion salad side.", 1000, "snacks", 5],
    ],
  },
  {
    slug: "mbuyuni-fast-food",
    name: "Mbuyuni Fast Food",
    email: "mbuyuni@chakulafast.test",
    owner: "Frank Mushi",
    description:
      "Quick chips, burgers and shawarma next to Mbuyuni market. Cheapest ugali in town.",
    phone: "0754 100 204",
    address: "Mbuyuni Market, stall 14",
    lat: -3.3524,
    lng: 37.3299,
    avgPrep: 12,
    hours: { opens: "09:00", closes: "22:30", closedDays: [] },
    menu: [
      ["Ugali na mchuzi", "Ugali with beef stew. Big portion, small price.", 2500, "local", 10],
      ["Chips mayai", "Chips omelette with pilipili on the side.", 3500, "fast_food", 10],
      ["Burger ya nyama", "Beef burger with chips.", 6500, "fast_food", 15],
      ["Shawarma ya kuku", "Chicken shawarma wrap.", 5000, "fast_food", 12],
      ["Sambusa (2)", "Two beef sambusa.", 1000, "snacks", 5],
      ["Maji ya chupa", "Bottled water, 500ml.", 700, "drinks", 1],
    ],
  },
  {
    slug: "union-cafe-moshi",
    name: "Union Café Moshi",
    email: "unioncafe@chakulafast.test",
    owner: "Sarah Lyimo",
    description:
      "Kilimanjaro coffee, cakes and a short lunch menu. Quiet enough to actually work in.",
    phone: "0754 100 205",
    address: "Old Moshi Road, near Union Coffee",
    lat: -3.3255,
    lng: 37.3512,
    avgPrep: 10,
    hours: { opens: "07:30", closes: "18:00", closedDays: [0] },
    menu: [
      ["Kahawa ya Kilimanjaro", "Locally grown single-origin, brewed to order.", 3000, "drinks", 6],
      ["Ugali special", "Ugali with spinach, avocado and beans.", 5500, "local", 15],
      ["Pilau ya mboga", "Vegetable pilau with cashews.", 5000, "local", 18],
      ["Keki ya ndizi", "Banana cake, one slice.", 2500, "desserts", 3],
      ["Aisikirimu", "Two scoops of vanilla ice cream.", 3000, "desserts", 3],
      ["Chai ya maziwa", "Milk tea.", 1200, "breakfast", 5],
    ],
  },
];

const CUSTOMER = {
  email: "customer@chakulafast.test",
  name: "Asha Mrema",
  phone: "0754 100 100",
};

async function findUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

/** Creates the auth user if needed, then forces its role and password. */
async function ensureUser({ email, fullName, phone, role, town = "Moshi" }) {
  const existing = await findUserByEmail(email);
  let userId;

  if (existing) {
    userId = existing.id;
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      // handle_new_user() reads these to build the profile and the role row.
      user_metadata: { full_name: fullName, phone, town, role },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  // Re-assert the role for a user that already existed with a different one.
  await supabase.from("user_roles").delete().eq("user_id", userId);
  const { error: roleError } = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (roleError) throw roleError;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, town })
    .eq("id", userId);
  if (profileError) throw profileError;

  return userId;
}

async function seedRestaurant(spec) {
  const ownerId = await ensureUser({
    email: spec.email,
    fullName: spec.owner,
    phone: spec.phone,
    role: "restaurant",
  });

  const { data: existing } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const payload = {
    owner_id: ownerId,
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    phone: spec.phone,
    town: "Moshi",
    address: spec.address,
    lat: spec.lat,
    lng: spec.lng,
    avg_prep_minutes: spec.avgPrep,
    is_accepting_orders: true,
  };

  let restaurantId = existing?.id;

  if (restaurantId) {
    // The service role has no JWT, so guard_restaurant_update() lets this
    // through — including `status`, which a vendor could never set itself.
    const { error } = await supabase
      .from("restaurants")
      .update({ ...payload, status: "active" })
      .eq("id", restaurantId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("restaurants")
      .insert({ ...payload, status: "pending_payment" })
      .select("id")
      .single();
    if (error) throw error;
    restaurantId = data.id;
  }

  // Opening hours: replace the whole week so re-running can't leave a stale
  // day behind (a missing day reads as "closed").
  await supabase.from("restaurant_hours").delete().eq("restaurant_id", restaurantId);
  const { error: hoursError } = await supabase.from("restaurant_hours").insert(
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      restaurant_id: restaurantId,
      day_of_week: day,
      opens_at: spec.hours.opens,
      closes_at: spec.hours.closes,
      is_closed: spec.hours.closedDays.includes(day),
    })),
  );
  if (hoursError) throw hoursError;

  // Menu: same reasoning — rebuild it so edits to this file take effect.
  await supabase.from("menu_items").delete().eq("restaurant_id", restaurantId);
  const { error: menuError } = await supabase.from("menu_items").insert(
    spec.menu.map(([name, description, price, category, prep], index) => ({
      restaurant_id: restaurantId,
      name,
      description,
      price,
      category,
      prep_minutes: prep,
      is_available: true,
      sort_order: index,
    })),
  );
  if (menuError) throw menuError;

  // A confirmed registration payment, which is what makes the listing live —
  // going through the same table the real flow uses rather than flipping
  // `status` directly, so the seeded data exercises the actual mechanism.
  const { data: paid } = await supabase
    .from("registration_payments")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "confirmed")
    .maybeSingle();

  if (!paid) {
    const { data: payment, error: paymentError } = await supabase
      .from("registration_payments")
      .insert({
        restaurant_id: restaurantId,
        amount: 0, // overwritten from platform_settings by a trigger
        method: "mpesa",
        reference: `SEED${spec.slug.slice(0, 6).toUpperCase()}`,
        msisdn: spec.phone,
        status: "submitted",
        note: "Seeded demo payment",
      })
      .select("id")
      .single();
    if (paymentError) throw paymentError;

    const { error: confirmError } = await supabase
      .from("registration_payments")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (confirmError) throw confirmError;
  }

  return { restaurantId, dishes: spec.menu.length };
}

async function main() {
  console.log(`Seeding demo data into ${SUPABASE_URL}\n`);

  let totalDishes = 0;
  for (const spec of RESTAURANTS) {
    const { dishes } = await seedRestaurant(spec);
    totalDishes += dishes;
    console.log(`  ✓ ${spec.name.padEnd(26)} ${dishes} dishes  ${spec.email}`);
  }

  await ensureUser({
    email: CUSTOMER.email,
    fullName: CUSTOMER.name,
    phone: CUSTOMER.phone,
    role: "customer",
  });
  console.log(`  ✓ ${"Demo customer".padEnd(26)}            ${CUSTOMER.email}`);

  console.log(
    [
      ``,
      `Done — ${RESTAURANTS.length} restaurants in Moshi, ${totalDishes} dishes.`,
      ``,
      `Every seeded account uses the password: ${PASSWORD}`,
      ``,
      `Try it:`,
      `  1. Open the app and search "ugali" — five kitchens, 2,500 to 9,500 TSh.`,
      `  2. Sort by price, then by distance.`,
      `  3. Add a dish, say you'll arrive in 15 minutes, place the order.`,
      `  4. Sign in as ${RESTAURANTS[0].email} to watch it land on the kitchen board.`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
