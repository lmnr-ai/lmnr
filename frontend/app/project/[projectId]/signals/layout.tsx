import { redirect } from "next/navigation";
import { type PropsWithChildren } from "react";

import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";

const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string }> }>) => {
  const params = await props.params;
  const isSignalsEnabled = isFeatureEnabled(Feature.CLOUD);

  if (!isSignalsEnabled) {
    redirect(`/project/${params.projectId}/traces`);
  }

  return props.children;
};

export default Layout;
