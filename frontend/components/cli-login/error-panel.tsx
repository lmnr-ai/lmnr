import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CliLoginErrorProps {
  reason: "missing-params";
}

export default function CliLoginError({ reason }: CliLoginErrorProps) {
  const title = reason === "missing-params" ? "CLI session info missing" : "Something went wrong";
  const description =
    reason === "missing-params"
      ? "This page expects a session_id and public_key from the CLI. Re-run lmnr-cli auth login to generate a fresh link."
      : "Please retry from the CLI.";
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
