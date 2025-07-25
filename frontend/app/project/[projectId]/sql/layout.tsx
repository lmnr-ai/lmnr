import React, { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import Header from "@/components/ui/header";

interface SqlLayoutProps {
  children: ReactNode;
}

const SqlLayout = ({ children }: SqlLayoutProps) => (
  <>
    <Header path="SQL Editor">
      <Badge variant="outlinePrimary">Beta</Badge>
    </Header>
    {children}
  </>
);

export default SqlLayout;
