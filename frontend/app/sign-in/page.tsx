import { type Metadata } from "next";
import { redirect } from "next/navigation";

import SignIn from "@/components/auth/sign-in";
import { getServerSession } from "@/lib/auth-session";
import { sanitizeCallbackUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign In - Laminar",
  description: "Sign in to your Laminar account.",
};

export default async function SignInPage(props: {
  params: Promise<Record<string, never>>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession();
  if (session) {
    redirect("/projects");
  }

  const searchParams = await props.searchParams;
  const callbackUrl = sanitizeCallbackUrl(searchParams?.callbackUrl);

  return <SignIn callbackUrl={callbackUrl} />;
}
