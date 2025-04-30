import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import SignUp from "@/components/auth/sign-up";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function SignInPage(props: {
  params: Promise<{}>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession();
  const callbackUrl = Array.isArray(searchParams?.callbackUrl)
    ? searchParams.callbackUrl[0]
    : (searchParams?.callbackUrl ?? "/onboarding");

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <SignUp
      enableCredentials={isFeatureEnabled(Feature.EMAIL_AUTH)}
      enableGithub={isFeatureEnabled(Feature.GITHUB_AUTH)}
      enableGoogle={isFeatureEnabled(Feature.GOOGLE_AUTH)}
      callbackUrl={callbackUrl}
    />
  );
}
