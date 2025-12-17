import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import SignUp from "@/components/auth/sign-up";
import { authOptions } from "@/lib/auth.ts";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function SignUpPage(props: {
  params: Promise<{}>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/projects");
  }

  const searchParams = await props.searchParams;
  let callbackUrl: string | undefined = Array.isArray(searchParams?.callbackUrl)
    ? searchParams.callbackUrl[0]
    : (searchParams?.callbackUrl ?? "/onboarding");

  if (callbackUrl) {
    try {
      const url = new URL(callbackUrl);
      if (url.pathname === "/" || url.pathname === "") {
        callbackUrl = "/onboarding";
      }
    } catch {}
  }

  return (
    <SignUp
      enableCredentials={isFeatureEnabled(Feature.EMAIL_AUTH)}
      enableGithub={isFeatureEnabled(Feature.GITHUB_AUTH)}
      enableGoogle={isFeatureEnabled(Feature.GOOGLE_AUTH)}
      enableAzure={isFeatureEnabled(Feature.AZURE_AUTH)}
      callbackUrl={callbackUrl}
    />
  );
}
