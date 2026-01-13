import React, { ReactNode } from "react";

import Header from "@/components/ui/header";

interface SqlLayoutProps {
  children: ReactNode;
}

const SqlLayout = ({ children }: SqlLayoutProps) => (
  <>
    <Header path="sql editor" />
    {children}
  </>
);

export default SqlLayout;
