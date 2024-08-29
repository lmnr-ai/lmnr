'use client'

import React, { createContext, use } from 'react';

type UserContextType = {
  email: string;
  username: string;
  imageUrl: string;
  supabaseAccessToken: string;
};

export const UserContext = createContext<UserContextType>({
  email: "",
  username: "",
  imageUrl: "",
  supabaseAccessToken: ""
});

type UserContextProviderProps = {
  email: string;
  username: string; // User's name, not unique
  imageUrl: string;
  children: React.ReactNode;
  supabaseAccessToken: string;
};

export const UserContextProvider = ({ email, username, imageUrl, children, supabaseAccessToken }: UserContextProviderProps) => {
  return (
    <UserContext.Provider value={{ email, username, imageUrl, supabaseAccessToken }}>
      {children}
    </UserContext.Provider>
  );
};

export function useUserContext() {
  return use(UserContext);
}