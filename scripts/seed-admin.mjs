// Creates (or promotes) a real admin account for local development.
// This is a normal Supabase Auth account — it works because it genuinely
// exists and the password genuinely matches, not because of any bypass.
//
// Usage:
//   npm run seed:admin
//   node --env-file=.env scripts/seed-admin.mjs [email] [password]
// Defaults to admin@chakulafast.test / Admin@2026! if not given.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env");
  process.exit(1);
}

const email = process.argv[2] || "admin@chakulafast.test";
const password = process.argv[3] || "Admin@2026!";
const fullName = "Platform Admin";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  let userId;

  const existing = await findUserByEmail(email);
  if (existing) {
    userId = existing.id;
    console.log(`Found existing user ${email} (${userId}) — updating password + role.`);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created user ${email} (${userId}).`);
  }

  // handle_new_user() already inserted a 'customer' profile + user_roles row.
  // user_roles is the source of truth; the sync_profile_role() trigger mirrors
  // the change onto profiles.role, so only this table needs writing.
  const { error: deleteError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: userId, role: "admin" });
  if (insertError) throw insertError;

  const { error: nameError } = await supabaseAdmin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (nameError) throw nameError;

  console.log(`\nAdmin ready:\n  email:    ${email}\n  password: ${password}\n  role:     admin`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
