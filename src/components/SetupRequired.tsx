/**
 * Shown instead of the app when there are no Supabase credentials.
 *
 * ChakulaFast is a database-backed marketplace — without a project to talk
 * to there is no honest way to render it. The previous behaviour was a throw
 * during render, which surfaced as the generic "something went wrong" error
 * boundary and read as a bug rather than an unfinished setup. This says what
 * is missing and exactly how to fix it.
 *
 * Deliberately styled with plain inline-ish utility classes and no data
 * fetching of its own, so it renders correctly even when everything else in
 * the app would fail.
 */
export default function SetupRequired() {
  const steps = [
    {
      title: "Create a Supabase project",
      body: (
        <>
          Free tier is plenty. From{" "}
          <span className="font-medium text-foreground">Project Settings → API</span> copy the
          project URL, the <code className="rounded bg-muted px-1">anon</code> key and the{" "}
          <code className="rounded bg-muted px-1">service_role</code> key.
        </>
      ),
    },
    {
      title: "Fill in .env",
      body: (
        <>
          Copy <code className="rounded bg-muted px-1">.env.example</code> to{" "}
          <code className="rounded bg-muted px-1">.env</code> and paste those three values in. Both
          the plain and <code className="rounded bg-muted px-1">VITE_</code>-prefixed copies are
          needed — the plain ones are read by server functions, the prefixed ones are inlined into
          the browser bundle.
        </>
      ),
    },
    {
      title: "Apply the schema",
      body: (
        <>
          <code className="rounded bg-muted px-1">supabase link --project-ref &lt;ref&gt;</code>{" "}
          then <code className="rounded bg-muted px-1">supabase db push</code>. No CLI? Paste each
          file in <code className="rounded bg-muted px-1">supabase/migrations/</code> into the SQL
          editor, in filename order.
        </>
      ),
    },
    {
      title: "Seed some food",
      body: (
        <>
          <code className="rounded bg-muted px-1">npm run seed:admin</code> then{" "}
          <code className="rounded bg-muted px-1">npm run seed:demo</code> — five Moshi kitchens
          with real menus, so search has something to find.
        </>
      ),
    },
    {
      title: "Restart the dev server",
      body: (
        <>Vite inlines environment variables at startup, so a reload alone will not pick them up.</>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-base font-bold text-primary-foreground shadow-elegant">
          C
        </div>

        <h1 className="mt-5 font-display text-2xl font-extrabold leading-tight">
          ChakulaFast needs a database
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The app is built and running — it just has no Supabase project to talk to yet.
          Restaurants, menus, orders and sign-in all live there, so there is nothing meaningful to
          show until it is connected. Five minutes of setup:
        </p>

        <ol className="mt-6 space-y-4">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Full instructions, the schema tour and the demo account list are in{" "}
          <code className="rounded bg-background px-1">README.md</code>. The database logic is
          testable without any of this —{" "}
          <code className="rounded bg-background px-1">npm run test:db</code> runs Postgres
          in-process.
        </p>
      </div>
    </div>
  );
}
