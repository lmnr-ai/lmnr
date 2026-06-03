import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CliLoginErrorProps {
  reason: "missing-params" | "invalid-session" | "expired-session" | "claimed-session";
}

const COPY: Record<CliLoginErrorProps["reason"], { title: string; description: string }> = {
  "missing-params": {
    title: "CLI session info missing",
    description:
      "This page expects a session_id and public_key from the CLI. Re-run `lmnr-cli auth login` to generate a fresh link.",
  },
  "invalid-session": {
    title: "CLI session not found",
    description:
      "This session_id doesn't match any pending CLI grant. The link may have been mistyped or generated against a different deployment. Re-run `lmnr-cli auth login` to generate a fresh link.",
  },
  "expired-session": {
    title: "CLI session expired",
    description:
      "This CLI grant expired before you authorized it. CLI sessions are valid for 10 minutes. Re-run `lmnr-cli auth login` to generate a fresh link.",
  },
  "claimed-session": {
    title: "CLI session already used",
    description:
      "This CLI grant has already been approved or claimed. Re-run `lmnr-cli auth login` if you need a new session.",
  },
};

export default function CliLoginError({ reason }: CliLoginErrorProps) {
  const { title, description } = COPY[reason];
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/projects">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
