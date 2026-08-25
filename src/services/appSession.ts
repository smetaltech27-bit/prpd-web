import { supabase } from '../lib/supabase'

export type AppSessionState = 'demo' | 'ready' | 'error'

let pendingSession: Promise<AppSessionState> | null = null

async function createOrRestoreSession(): Promise<AppSessionState> {
  if (!supabase) return 'demo'

  const { data, error } = await supabase.auth.getSession()
  if (error) return 'error'
  if (data.session) return 'ready'

  const { error: anonymousError } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: 'PRPD Operator' } },
  })

  return anonymousError ? 'error' : 'ready'
}

export function ensureAppSession(): Promise<AppSessionState> {
  if (!pendingSession) {
    pendingSession = createOrRestoreSession().finally(() => {
      window.setTimeout(() => { pendingSession = null }, 0)
    })
  }
  return pendingSession
}
