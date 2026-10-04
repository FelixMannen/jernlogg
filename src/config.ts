// Supabase anon/publishable key is designed to be public (it ships to every browser).
// Env vars override the defaults below.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || ''
