"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground max-w-md">
              An unexpected error occurred. Our team has been notified.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={reset}>Try again</Button>
              <Button variant="outline" onClick={() => window.location.href = "/"}>
                Go home
              </Button>
            </div>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-4">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
