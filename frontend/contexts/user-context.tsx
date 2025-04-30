"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import React, { createContext, use } from "react";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/const";

type UserContextType = {
  id: string;
  email: string;
  username: string;
  imageUrl: string;
  supabaseClient?: SupabaseClient;
};

export const UserContext = createContext<UserContextType>({
  id: "",
  email: "",
  username: "",
  imageUrl: "",
  supabaseClient: undefined,
});

type UserContextProviderProps = {
  id: string;
  email: string;
  username: string; // User's name, not unique
  imageUrl: string;
  children: React.ReactNode;
  supabaseAccessToken: string;
};

// This should not grow by too much, because there is one token per user
const clients: { [key: string]: SupabaseClient } = {};

export const UserContextProvider = ({
  id,
  email,
  username,
  imageUrl,
  children,
  supabaseAccessToken,
}: UserContextProviderProps) => {
  const supabaseClient =
    clients[supabaseAccessToken] ||
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
      },
    });
  supabaseClient.realtime.setAuth(supabaseAccessToken);
  clients[supabaseAccessToken] = supabaseClient;

  return (
    <UserContext.Provider value={{ id, email, username, imageUrl, supabaseClient }}>{children}</UserContext.Provider>
  );
};

export function useUserContext() {
  return use(UserContext);
}
