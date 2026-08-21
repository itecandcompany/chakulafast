import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

/**
 * A plain-language summary of what the app actually collects, written against
 * the real schema rather than as boilerplate. Location is the sensitive part
 * and gets its own section — it's the one thing here people are right to be
 * careful about.
 *
 * This is not legal advice and is not a substitute for a policy reviewed
 * against Tanzania's Personal Data Protection Act (2022) before launch.
 */
function PrivacyPage() {
  return (
    <div className="min-h-[var(--app-100vh)] bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <h1 className="mt-6 font-display text-2xl font-extrabold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: 20 August 2026</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-display text-base font-bold">What we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Account details</strong> — your name, email
                address, phone number and the area you usually order in.
              </li>
              <li>
                <strong className="text-foreground">Orders</strong> — what you ordered, from which
                restaurant, when you said you'd arrive, and any note you left for the kitchen.
              </li>
              <li>
                <strong className="text-foreground">Location</strong> — only when you tap "Use my
                location" or "I'm on my way". See below.
              </li>
              <li>
                <strong className="text-foreground">Reviews</strong> — your rating and comment,
                shown publicly with your first name only.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-bold">Location, specifically</h2>
            <p className="mt-2 text-muted-foreground">
              We never ask for your location in the background and never track you between visits.
              It is used in exactly two places, both of which you start yourself:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                To sort restaurants by distance. This is worked out in the moment and is not stored.
              </li>
              <li>
                To estimate your arrival time while an order is being cooked, if you turn on "I'm on
                my way". These position updates are attached to that order, are visible only to that
                restaurant, and stop the moment you turn sharing off or the order finishes.
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              If you decline location access, everything still works — pick your town by hand
              instead.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold">Who can see what</h2>
            <p className="mt-2 text-muted-foreground">
              A restaurant sees only the orders placed with it: what you ordered, your first name,
              your phone number if you gave one, your note, and your arrival estimate. It cannot see
              your email, your other orders, or anything about your account. Other customers see
              only your reviews. Platform administrators can see orders and listings for support and
              moderation.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold">Payments</h2>
            <p className="mt-2 text-muted-foreground">
              Customers do not pay through ChakulaFast — you pay the restaurant directly when you
              collect your food. Restaurants pay a one-time registration fee; we store the
              transaction reference and the phone number the payment came from so it can be matched
              against our records. We never see or store card details or mobile money PINs.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold">Keeping and deleting data</h2>
            <p className="mt-2 text-muted-foreground">
              Orders are kept as a record for you and the restaurant. Live location pings are only
              useful while an order is active and can be cleared once it completes. To delete your
              account and its data, contact us and we will remove it, except where we are required
              to keep a financial record.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold">Contact</h2>
            <p className="mt-2 text-muted-foreground">
              Questions about your data, or want it deleted? Get in touch through the address listed
              on our website.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
