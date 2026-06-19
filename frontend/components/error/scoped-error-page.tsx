"use client";

import ErrorPage from "@/components/error/error-page";

export default function ScopedErrorPage({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorPage
      error={error}
      backAction={() => {
        window.location.href = "/projects";
      }}
      backLabel="Back"
    />
  );
}
