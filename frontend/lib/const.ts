// these are used client side, so process.env is not available
export const SUPABASE_URL = ""
export const SUPABASE_ANON_KEY = ""

// by default, if SUPABASE_URL and SUPABASE_ANON_KEY are not set, we disable realtime
export const USE_REALTIME = SUPABASE_URL != null 
    && SUPABASE_ANON_KEY != null && SUPABASE_ANON_KEY.length > 0 && SUPABASE_URL.length > 0;