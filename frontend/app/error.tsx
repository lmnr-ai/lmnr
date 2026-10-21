"use client"; // Error components must be Client Components

import ErrorPage from "@/components/error/error-page";

export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage error={error} backAction={() => window.history.back()} backLabel="Back" />;
}
