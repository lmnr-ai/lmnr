import { createContext, useContext } from "react";

export type StatusVariant = "counts" | "ring";

// Lets /sandbox flip the Task status design without threading props through the table.
export const StatusVariantContext = createContext<StatusVariant>("ring");

export const useStatusVariant = () => useContext(StatusVariantContext);
