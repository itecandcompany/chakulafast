import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// eslint-disable-next-line react-refresh/only-export-components
function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        {/* Shown in production too, behind a disclosure.
         *
         * This used to be DEV-only, which meant every production failure
         * reached the operator as "an unexpected error occurred" and nothing
         * else — undiagnosable without asking the person on the other end to
         * open devtools, which is not a reasonable thing to ask a restaurant
         * owner in the middle of service.
         *
         * Collapsed by default so a customer is not handed a stack trace, and
         * open in one click for anyone reporting a fault. This is a client-side
         * error object: it holds nothing the browser did not already have. */}
        {error.message && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Show technical details
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-destructive">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy this when reporting the problem — it names the actual fault.
            </p>
          </details>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
