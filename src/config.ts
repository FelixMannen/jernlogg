// Supabase anon key is designed to be public (it ships to every browser); access is governed by RLS.
// Env vars override the defaults below.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://rrksgwfgdixgpamrmayc.supabase.co'
export const SUPABASE_KEY: string =
  import.meta.env.VITE_SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJya3Nnd2ZnZGl4Z3BhbXJtYXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwODk5MTEsImV4cCI6MjEwNjY2NTkxMX0.i4CZeolOpipNBqFFIVHIo8HQCt-ANO3h6epPvOkdpQ4'
