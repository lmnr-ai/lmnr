import SignUp from "@/components/auth/sign-up";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function SignUpPage(props: {
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
      const currentOrigin = process.env.NEXTAUTH_URL;
      if (url.origin === currentOrigin && (url.pathname === "/" || url.pathname === "")) {
        callbackUrl = "/onboarding";
      }
    } catch {}
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
