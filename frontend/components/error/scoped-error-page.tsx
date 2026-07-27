"use client";

import ErrorPage from "@/components/error/error-page";
import { withBasePath } from "@/lib/utils";

export default function ScopedErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorPage
      error={error}
      retry={reset}
      backAction={() => {
        window.location.href = withBasePath("/projects");
      }}
      backLabel="Back"
    />
  );
}
