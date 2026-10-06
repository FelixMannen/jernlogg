import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from '../config'

/** ?local=1 switches to a localStorage backend for tests (kept for the whole tab session). */
export const isLocal: boolean = (() => {
  try {
    const params = new URLSearchParams(location.search)
    if (params.get('local') === '1') sessionStorage.setItem('jernlogg.local', '1')
    if (params.get('local') === '0') sessionStorage.removeItem('jernlogg.local')
    return sessionStorage.getItem('jernlogg.local') === '1' || !SUPABASE_URL || !SUPABASE_KEY
  } catch {
    return false
  }
})()

export const supabase: SupabaseClient | null = isLocal
  ? null
  : createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'jernlogg.auth' },
    })
