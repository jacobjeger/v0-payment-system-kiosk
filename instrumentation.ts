import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Only enable in production
      enabled: process.env.NODE_ENV === "production",

      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      tracesSampleRate: 0.1,

      // Set environment
      environment: process.env.NODE_ENV,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: process.env.NODE_ENV === "production",
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}
