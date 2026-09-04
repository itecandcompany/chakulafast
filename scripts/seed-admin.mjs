// Creates (or promotes) a real admin account.
//
// This is a normal Supabase Auth account — it works because it genuinely
// exists and the password genuinely matches, not because of any bypass. It is
// created with email_confirm already true, which is the whole reason to reach
// for this rather than the signup form: no inbox round trip, and no visit to
// /bootstrap afterwards.
//
// Usage:
//   npm run seed:admin -- <email> <password>
//   node --env-file=.env scripts/seed-admin.mjs <email> <password>
//
// Both arguments are required and neither has a default. The password used to
// fall back to a literal written here, which meant a working set of admin
// credentials for this platform was published in the repository: anyone who
// read this file could sign in as an administrator on any deployment seeded
// with the defaults.

import { createClient } from "@supabase/supabase-js";

// Arguments are checked before the environment: someone who typed the command
// wrong should be told that, not sent to hunt for a key they may already have.
const email = process.argv[2];
const password = process.argv[3];
const fullName = "Platform Admin";

if (!email || !password) {
  console.error(
    [
      "Usage: npm run seed:admin -- <email> <password>",
      "",
      "Both are required. Pick a password you have not used elsewhere; it is",
      "typed once here and never written into the repo.",
    ].join("\n"),
  );
  process.exit(1);
}

// The same rule the signup form enforces, so an account minted here cannot be
// weaker than one a customer could create for themselves.
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  console.error("Password must be at least 8 characters and contain a letter and a digit.");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    [
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      "",
      "Both live in .env, which is gitignored. The service-role key is the",
      "secret one from the Supabase dashboard under Project Settings > API keys.",
    ].join("\n"),
  );
  process.exit(1);
}

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

  // The password is deliberately not echoed. Terminal scrollback gets shared
  // in screenshots and pasted into chats, and it is already known to whoever
  // just typed it.
  console.log(
    `\nAdmin ready:\n  email: ${email}\n  role:  admin\n\n` +
      `Sign in at /auth with the password you just passed in.`,
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
