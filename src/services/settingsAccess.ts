import { isSupabaseConfigured, settingsSupabase } from '../lib/supabase'

export const SETTINGS_IDLE_TIMEOUT_MS = 15 * 60 * 1000

export type SettingsUnlockResult =
  | { ok: true }
  | { ok: false; reason: 'not-configured' | 'invalid-credentials' | 'not-authorized' }

export async function unlockSettings(password: string): Promise<SettingsUnlockResult> {
  const adminEmail = import.meta.env.VITE_SETTINGS_ADMIN_EMAIL?.trim()

  if (!isSupabaseConfigured || !settingsSupabase || !adminEmail) {
    return { ok: false, reason: 'not-configured' }
  }

  const { data, error } = await settingsSupabase.auth.signInWithPassword({
    email: adminEmail,
    password,
  })

  if (error || !data.user) {
    return { ok: false, reason: 'invalid-credentials' }
  }

  const { data: isAdmin, error: profileError } = await settingsSupabase
    .rpc('is_settings_admin')

  if (profileError || isAdmin !== true) {
    await settingsSupabase.auth.signOut()
    return { ok: false, reason: 'not-authorized' }
  }

  return { ok: true }
}

export async function lockSettings(): Promise<void> {
  if (settingsSupabase) {
    await settingsSupabase.auth.signOut()
  }
}

export function startSettingsIdleLock(onLock: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>
  const activityEvents: Array<keyof WindowEventMap> = [
    'pointerdown',
    'keydown',
    'touchstart',
    'scroll',
  ]

  const resetTimer = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void lockSettings().finally(onLock)
    }, SETTINGS_IDLE_TIMEOUT_MS)
  }

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, resetTimer, { passive: true })
  })
  resetTimer()

  return () => {
    clearTimeout(timer)
    activityEvents.forEach((eventName) => {
      window.removeEventListener(eventName, resetTimer)
    })
  }
}
