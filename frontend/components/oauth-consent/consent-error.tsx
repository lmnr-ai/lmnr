import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const ConsentError = ({ message }: { message: string }) => (
  <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Can&apos;t authorize this app</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  </div>
);
