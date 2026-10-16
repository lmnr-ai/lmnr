import { type Metadata } from "next";
import React from "react";

import SQLTemplates from "@/components/sql";

export const metadata: Metadata = {
  title: "SQL Editor",
};

const SQLPage = () => <SQLTemplates />;

export default SQLPage;
