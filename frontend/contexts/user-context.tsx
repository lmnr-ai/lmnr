'use client'

import React, { createContext, use } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/const';

type UserContextType = {
  email: string;
  username: string;
  imageUrl: string;
  supabaseClient?: SupabaseClient;
};

export const UserContext = createContext<UserContextType>({
  email: "",
  username: "",
  imageUrl: "",
  supabaseClient: undefined,
});

type UserContextProviderProps = {
  email: string;
  username: string; // User's name, not unique
  imageUrl: string;
  children: React.ReactNode;
  supabaseAccessToken: string;
};

// This should not grow by too much, because there is one token per user
const clients: { [key: string]: SupabaseClient } = {};

export const UserContextProvider = ({
  email,
  username,
  imageUrl,
  children,
  supabaseAccessToken
}: UserContextProviderProps) => {
  const supabaseClient = clients[supabaseAccessToken] || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`
      }
    }
  });
  supabaseClient.realtime.setAuth(supabaseAccessToken);
  clients[supabaseAccessToken] = supabaseClient;

  return (
    <UserContext.Provider value={{ email, username, imageUrl, supabaseClient }}>
      {children}
    </UserContext.Provider>
  );
};

export function useUserContext() {
  return use(UserContext);
}
