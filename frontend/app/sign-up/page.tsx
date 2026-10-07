import { type Metadata } from "next";
import { redirect } from "next/navigation";

import SignUp from "@/components/auth/sign-up";
import { getServerSession } from "@/lib/auth-session";
import { sanitizeCallbackUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign Up - Laminar",
  description: "Create a free Laminar account. Start tracing and evaluating your AI agents in minutes.",
};

export default async function SignUpPage(props: {
  params: Promise<Record<string, never>>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession();
  if (session) {
    redirect("/projects");
  }

  const searchParams = await props.searchParams;
  const callbackUrl = sanitizeCallbackUrl(searchParams?.callbackUrl);

  return <SignUp callbackUrl={callbackUrl} />;
}
