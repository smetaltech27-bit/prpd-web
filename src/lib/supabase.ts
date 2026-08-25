import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(
  supabaseUrl && publishableKey && !publishableKey.includes('replace-with'),
)

export const supabase: SupabaseClient | null =
  supabaseUrl && publishableKey && !publishableKey.includes('replace-with')
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'prpd-app-auth',
      },
    })
  : null

export const settingsSupabase: SupabaseClient | null =
  supabaseUrl && publishableKey && !publishableKey.includes('replace-with')
    ? createClient(supabaseUrl, publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'prpd-settings-auth',
        },
      })
    : null
