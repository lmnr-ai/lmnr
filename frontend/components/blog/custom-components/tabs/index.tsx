import { Children, isValidElement, type ReactNode } from "react";

import TabsClient from "./tabs-client";

interface TabProps {
  label: string;
  children?: ReactNode;
}

// Marker only: Tabs reads its props and renders the content itself.
export function Tab(_: TabProps) {
  return null;
}

export function Tabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children)
    .filter(isValidElement<TabProps>)
    .map(({ props }) => ({ label: props.label, content: props.children }));
  return <TabsClient tabs={tabs} />;
}
