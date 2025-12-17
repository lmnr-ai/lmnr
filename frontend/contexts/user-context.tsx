"use client";

import React, { createContext, PropsWithChildren, useContext } from "react";

export type User = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

export const UserContext = createContext<User | undefined>(undefined);

type UserContextProviderProps = {
  user: User;
};

export const UserContextProvider = ({ user, children }: PropsWithChildren<UserContextProviderProps>) => {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};

export function useUserContext() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUserContext must be used within a UserContextProvider");
  }
  return context;
}
