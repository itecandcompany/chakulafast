# ChakulaFast

**Order ahead. Eat the moment you arrive.**

A two-sided food marketplace for Tanzania. Customers search for a _dish_ — not a
restaurant — see every kitchen nearby that has it with prices side by side, and
pre-order with an arrival time. The kitchen gets a ticket that says when to
_start cooking_, so the food is ready as the customer walks in rather than
starting when they get there.

Restaurants and hotels pay a **one-time 5,000 TZS registration fee** to be
listed. There is no commission on orders — customers pay the restaurant
directly at the counter.

Built on the same stack and conventions as the `fundiconec-with-open-code`
reference project: TanStack Start + React 19 + Tailwind v4 + shadcn/ui, with
Supabase (Postgres, Auth, RLS, Realtime, Storage) as the entire backend.

---

## Quick start

You need Node 20+ and a free Supabase project.

```bash
npm install
```

### 1. Create a Supabase project

Go to [supabase.com/dashboard](https://supabase.com/dashboard), create a
project, then open **Project Settings → API** and copy three values.

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable                                                     | Where to find it                                   |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | Project URL                                        |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | `anon` / publishable key                           |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | `service_role` key — **server only, never commit** |

Both the plain and `VITE_`-prefixed copies are needed: the plain ones are read
by server functions, the `VITE_` ones are inlined into the browser bundle.

### 2. Apply the database schema

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase db push
```

No CLI? Open the SQL editor in the dashboard and run each file in
`supabase/migrations/` **in filename order**. They're numbered by timestamp and
must be applied in sequence.

Either way, you can check the schema before it touches your project:

```bash
npm run test:db
```

That boots a real Postgres in WebAssembly, applies every migration, then
exercises the parts no type checker can see — that a customer can't rewrite a
price, that a restaurant can't publish itself without paying, that the status
pipeline only moves one step at a time. No Docker, no network, ~15 seconds.

### 3. Seed an admin and demo data

```bash
npm run seed:admin
```

```bash
npm run seed:demo
```

`seed:demo` creates five real-feeling Moshi kitchens with menus, opening hours
and confirmed registration payments, plus a demo customer. Every seeded account
uses the password `Demo@2026!`:

| Account                 | Email                                             |
| ----------------------- | ------------------------------------------------- |
| Admin                   | `admin@chakulafast.test` (password `Admin@2026!`) |
| Customer                | `customer@chakulafast.test`                       |
| Mama Ngoma Kitchen      | `mamangoma@chakulafast.test`                      |
| Kilimanjaro Grill House | `kilimanjarogrill@chakulafast.test`               |
| Hotel Chagga Bites      | `chaggabites@chakulafast.test`                    |
| Mbuyuni Fast Food       | `mbuyuni@chakulafast.test`                        |
| Union Café Moshi        | `unioncafe@chakulafast.test`                      |

> Turn **off** "Confirm email" under Authentication → Providers → Email while
> developing, or new signups can't sign in until they click a link.

### 4. Run it

```bash
npm run dev
```

Then search for **ugali** — five kitchens, 2,500 to 9,500 TSh. Sort by price,
then by distance. Add one, say you'll arrive in 15 minutes, place the order,
and sign in as `mamangoma@chakulafast.test` in another browser to watch the
ticket land on the kitchen board in real time.

---

## The idea, in one screen

```
Customer                          Database                        Kitchen
────────                          ────────                        ───────
searches "ugali"        →   search_dishes(q, lat, lng, …)
                            one query: dish + price +
                            distance + prep time + open?
picks one, says
"I'll be there in 15"   →   orders.expected_arrival_at
                            orders.prep_minutes  ◄── slowest dish
                                    │
                                    ▼
                            arrival − prep = start cooking at   →   ticket counts
                                                                    down, then
                                                                    flashes
                                                                    COOK NOW
walks in                →   status: ready                       →   food is on
                                                                    the counter
```

That subtraction is the whole product. Everything else — search, filters,
payments, the admin console — exists to make it possible.

### When the kitchen can't take any more

That subtraction assumes the kitchen is free to start cooking at the moment it
computes. During a rush it isn't, and a promise made on a full line is exactly
how food ends up late.

So a restaurant can declare `kitchen_capacity` — how many orders may be cooking
at once. An order occupies the kitchen for the span
`[arrival − prep, arrival]`, two orders contend when those spans overlap, and
once capacity is reached checkout offers the next workable time instead of
adding to the pile:

```
Kitchen capacity 3, all three already cooking at 13:00

customer asks for 13:00   →   check_kitchen_slot()  →  full, earliest 13:20
                              "They can have it hot at 13:20"  [ Arrive 13:20 ]
```

`check_kitchen_slot()` is advice for the checkout screen; a trigger on
`orders` is the rule, so two customers taking the last slot at the same instant
can't both win. Capacity `0` — the default — means unlimited, so nothing
changes for a restaurant that never sets it.

This is the pattern commercial kitchen display systems call _order throttling_.
The arrival half of the problem (knowing the customer is close) is what
Chick-fil-A and McDonald's "Ready on Arrival" solve with geofencing, and what
`order_pings` does here.

---

## Architecture

```
src/
├── routes/                     file-based routes → src/routeTree.gen.ts (generated)
│   ├── __root.tsx              shell: head tags, i18n, auth, PWA, toasts
│   ├── index.tsx               landing + dish search entry        (public)
│   ├── search.tsx              results, filters, list/map toggle  (public)
│   ├── r.$slug.tsx             restaurant page + menu + reviews   (public)
│   ├── cart.tsx                basket + arrival time + place order
│   ├── orders.tsx              live status, cancel, "I'm on my way"
│   ├── account.tsx             profile, language, role shortcuts
│   ├── auth.tsx                sign in / sign up (customer or restaurant)
│   ├── privacy.tsx
│   ├── vendor.*.tsx            order board · menu · profile · billing · setup
│   └── admin.*.tsx             overview · restaurants · payments · orders · users
├── components/
│   ├── ui/                     shadcn/ui primitives
│   ├── customer/               dish cards, filters, arrival picker, tracker
│   ├── vendor/                 kitchen ticket, menu dialog, hours editor
│   ├── admin/                  sidebar
│   ├── AppTabBar.tsx           bottom tabs on mobile, left rail on desktop
│   └── RestaurantMap.tsx       SSR-safe wrapper around RestaurantMapInner (Leaflet)
├── lib/
│   ├── auth.tsx                session + profile context
│   ├── search.ts               the discovery RPC wrappers
│   ├── cart.ts                 zustand basket, persisted, one restaurant
│   ├── orderStatus.ts          pipeline, colours, the cook-now maths
│   ├── geo.ts                  haversine, OSRM routing, TSh formatting
│   ├── hours.ts                opening hours in Africa/Dar_es_Salaam
│   ├── i18n.tsx                English / Kiswahili, typed keys
│   ├── payments/               provider interface + manual + gateway stub
│   ├── *.functions.ts          server functions (service-role work)
│   └── errorMessages.ts        allow-list before any error reaches a user
├── integrations/supabase/      anon client · service-role client · middleware · types
└── styles.css                  Tailwind v4 theme tokens
supabase/migrations/            schema, RLS, triggers, RPCs
scripts/                        seed-admin · seed-demo · gen-icons · test-db
```

### Roles

`user_roles` is the source of truth; `profiles.role` is a mirror kept in sync by
a trigger and read only for rendering UI.

| Role         | Sees                                                      |
| ------------ | --------------------------------------------------------- |
| `customer`   | search, restaurant pages, basket, own orders              |
| `restaurant` | own listing, own menu, own orders, own billing            |
| `admin`      | everything, plus approve/suspend and payment confirmation |

Self-signup can only produce `customer` or `restaurant` —
`handle_new_user()` rejects anything else from signup metadata, so putting
`role: "admin"` in a `signUp()` call gets you a customer account. Admins are made
with the service role (`npm run seed:admin`).

### Security model

Two layers, deliberately:

- **RLS** answers _"may this user touch this row at all?"_ Every table has it
  on. Guests (`anon`) can read exactly two things: active restaurants and their
  menus.
- **Guard triggers** answer _"may they change this column, to this value, right
  now?"_ This is what stops a customer zeroing their bill or a restaurant
  marking itself active without paying. See
  `20260820090300_guard_triggers.sql`.

Some consequences worth knowing:

- Order line prices are **overwritten from the live menu** by
  `prepare_order_item()`. A client that posts `unit_price: 1` gets charged the
  real price.
- Order totals are computed by trigger from the line items, never accepted from
  the client.
- A restaurant cannot change its own `status`. The only path from
  `pending_payment` to `active` is a confirmed payment row.
- Route guards (the redirects in `vendor.tsx` / `admin.tsx`) are a convenience,
  not a boundary. Forcing your way to `/admin` shows an empty console.

### Database

| Table                                        | Purpose                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `profiles`, `user_roles`                     | accounts and authorisation                               |
| `restaurants`, `restaurant_hours`            | listings, location, opening times                        |
| `menu_items`                                 | dishes: price, category, photo, prep time, availability  |
| `orders`, `order_items`, `order_events`      | pre-orders, line snapshots, status history               |
| `order_pings`                                | live "I'm on my way" position updates                    |
| `registration_payments`, `platform_settings` | the 5,000 TZS fee                                        |
| `reviews`                                    | ratings, and whether the food was actually ready on time |

Key functions: `search_dishes()`, `restaurants_nearby()`, `active_towns()`,
`restaurant_reviews()`, `is_restaurant_open()`, `has_role()`, `haversine_km()`.

Search is a substring match over a generated `search_text` column, backed by a
trigram index — so "ugali" finds both _Ugali na maharage_ and _Nyama choma na
ugali_.

---

## The registration fee

Default flow (`PAYMENT_PROVIDER=manual`):

1. Restaurant signs up and creates a listing → `pending_payment`, invisible to customers.
2. It pays by mobile money and records the transaction reference from the SMS.
3. An admin checks the reference against the till statement in **Admin →
   Payments** and marks it received.
4. `activate_restaurant_on_payment()` flips the listing to `active`; the menu
   goes live. The vendor's billing page updates in real time.

Change the amount or the payment instructions in `platform_settings` — no
migration needed.

### Plugging in M-Pesa / Tigo Pesa / Airtel Money

`src/lib/payments/provider.ts` defines the whole contract. `manual.ts`
implements it with a human; `mobileMoney.ts` is a documented stub with the four
steps and the environment variables it needs. Set
`PAYMENT_PROVIDER=mobile_money` once it's implemented — nothing else changes,
because confirmation still flows through `registration_payments` and the same
activation trigger.

An aggregator (Selcom, ClickPesa, Flutterwave, Pesapal) is usually far less work
than three direct integrations: one set of credentials, one webhook, all
networks.

---

## Notifications

Implemented today, browser-only: a synthesised chime plus the Notification API.
The vendor board rings when a pre-order arrives; the customer's order list rings
when it's marked ready. Both need one click first — browsers block audio and
notifications until the user interacts with the page, which is what the "Enable
alerts" button is for.

SMS and web push are stubbed at `dispatchExternal()` in
`src/lib/notifications.ts`, with the trigger points already wired up. Both belong
in a Supabase Edge Function so the API key never reaches the browser.

---

## Scripts

| Command              | Does                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | Vite dev server on :5173                                           |
| `npm run build`      | production build (nitro `vercel` preset → `.vercel/output`)        |
| `npm run typecheck`  | `tsc --noEmit`                                                     |
| `npm run test:db`    | runs the migrations against a real Postgres and tests the triggers |
| `npm run lint`       | ESLint                                                             |
| `npm run format`     | Prettier                                                           |
| `npm run seed:admin` | create/promote an admin account                                    |
| `npm run seed:demo`  | five Moshi restaurants, menus, hours, a customer                   |
| `npm run gen:icons`  | regenerate the PWA icon set and OG image                           |

## Deployment

Push to a Git repo and import it into Vercel. The nitro `vercel` preset in
`vite.config.ts` emits `.vercel/output`, which Vercel picks up automatically —
don't set an `outputDirectory`.

Set all the `.env` variables in **Project Settings → Environment Variables**,
including `SUPABASE_SERVICE_ROLE_KEY` (server-side only — it must never appear
in a `VITE_`-prefixed variable).

Add your deployed URL to **Authentication → URL Configuration** in Supabase so
email confirmation and OAuth redirect back correctly.

---

## Launch checklist — Supabase dashboard

The app enforces what it can in code: RLS on every table, guard triggers on
every privileged column, server-side password rules, rate limits on every admin
mutation, and `enforceEmailConfirmed` on every server function. The rest lives
in the Supabase dashboard and **cannot be set from this repo**.

Before taking real orders:

| Setting                                   | Where                 | Why                                                                                                                                                                                        |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Custom SMTP**                           | Auth → Emails         | The default shared sender is rate-limited to a few messages an hour. This project already hit `over_email_send_rate_limit` during testing — on launch day it would block signups entirely. |
| **Leaked-password protection**            | Auth → Policies       | Off by default. Checks new passwords against HaveIBeenPwned.                                                                                                                               |
| **Minimum password length ≥ 8**           | Auth → Policies       | The client checks this too, but the client can be bypassed.                                                                                                                                |
| **CAPTCHA on signup/signin**              | Auth → Bot protection | Without it, signup is an open endpoint that sends email.                                                                                                                                   |
| **Shorter JWT expiry + refresh rotation** | Auth → Sessions       | Limits the damage from a stolen token.                                                                                                                                                     |
| **MFA for admin accounts**                | Auth → MFA            | An admin can confirm payments and change roles.                                                                                                                                            |

Also confirm after the first deploy:

```bash
curl -sI https://your-domain | grep -iE "content-security-policy|strict-transport"
```

Both headers are set in `vercel.json`. If the CSP blocks something, the browser
console names the directive — do not widen it past the origin that failed.

## Known scope

Deliberate choices, so they don't read as oversights:

- **Customers don't pay in the app.** They pay the restaurant at the counter.
  The platform's only revenue is the registration fee. Adding in-app payment
  would mean handling settlement to restaurants, which is a different product.
- **The vendor dashboard and admin console are English-only.** Both are operator
  tools; the customer-facing app is fully English/Kiswahili. Dish names and
  descriptions are never translated — they belong to whoever typed them.
- **Reviews show a first name only**, because `profiles` is readable only by its
  owner and admins. `restaurant_reviews()` exposes that one field and nothing
  else.
- **The privacy policy is a plain-language summary**, not legal advice. Have it
  reviewed against Tanzania's Personal Data Protection Act (2022) before launch.
- **Location is never requested automatically.** A prompt that fires before the
  visitor asks for anything is the fastest route to a permanent block, and every
  location feature has a manual town-picker fallback.
