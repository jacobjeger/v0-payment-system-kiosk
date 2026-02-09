import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // Adjust this value in production
  tracesSampleRate: 0.1,

  // Set environment
  environment: process.env.NODE_ENV,

  // Capture unhandled promise rejections
  integrations: [
    Sentry.browserTracingIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    // Random browser extensions
    "top.GLOBALS",
    // Chrome extensions
    "chrome-extension://",
    // Network errors
    "Network request failed",
    "Failed to fetch",
    "Load failed",
  ],
});
