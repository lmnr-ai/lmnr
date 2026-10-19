"use client";

import { type ReactNode, useState } from "react";

import TabBar, { type TabBarItem } from "../tab-bar";

export default function TabsClient({ tabs }: { tabs: (TabBarItem & { content?: ReactNode })[] }) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  if (!tab) return null;

  return (
    <div className="not-typeset my-8 flex flex-col gap-3">
      <TabBar items={tabs} active={active} onSelect={setActive} />
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-secondary-foreground [&>*]:my-0">
        {tab.content}
      </div>
    </div>
  );
}
