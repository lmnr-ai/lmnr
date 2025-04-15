import { createClient } from "@supabase/supabase-js";

export const createSupabaseClient = (accessToken: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    realtime: {
      accessToken: () => Promise.resolve(accessToken),
    },
  });
