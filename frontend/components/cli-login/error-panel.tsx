import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CliLoginErrorProps {
  reason: "missing-params";
}

const COPY: Record<CliLoginErrorProps["reason"], { title: string; description: string }> = {
  "missing-params": {
    title: "CLI session info missing",
    description:
      "This page expects loopback parameters from the CLI. Re-run `lmnr-cli setup` to generate a fresh link, or use `lmnr-cli setup --no-browser` for the manual flow.",
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
