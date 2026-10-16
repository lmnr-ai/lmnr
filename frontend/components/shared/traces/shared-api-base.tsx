"use client";

import { createContext, useContext } from "react";

// Base path of the public shared-trace API the shared trace view reads from.
// Blog embeds point it at a rewrite to Laminar Cloud (see next.config.ts) so
// blog traces load from cloud regardless of the DB this deployment uses.
export const SharedTraceApiBaseContext = createContext("/api/shared/traces");

export const useSharedTraceApiBase = () => useContext(SharedTraceApiBaseContext);
