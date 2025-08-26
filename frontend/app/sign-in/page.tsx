import SignIn from "@/components/auth/sign-in";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function SignInPage(props: {
  params: Promise<{}>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
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
    } catch { }
  }

  return (
    <SignIn
      enableCredentials={isFeatureEnabled(Feature.EMAIL_AUTH)}
      enableGithub={isFeatureEnabled(Feature.GITHUB_AUTH)}
      enableGoogle={isFeatureEnabled(Feature.GOOGLE_AUTH)}
      enableAzure={isFeatureEnabled(Feature.AZURE_AUTH)}
      callbackUrl={callbackUrl}
    />
  );
}
