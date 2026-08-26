import { settingsSupabase, supabase } from '../lib/supabase'

export type R2DocumentType = 'drawing' | 'inprocess' | 'qc'

export interface PrivateDocumentLocation {
  storageProvider: 'supabase' | 'r2'
  bucket: string
  path: string
}

const workerUrl = import.meta.env.VITE_DOCUMENT_WORKER_URL?.trim().replace(/\/$/, '')

export const isDocumentWorkerConfigured = Boolean(
  workerUrl && !workerUrl.includes('replace-with'),
)

function encodeObjectKey(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function sessionToken(useSettingsSession: boolean): Promise<string> {
  const client = useSettingsSession ? settingsSupabase : supabase
  if (!client) throw new Error('Supabase session is not configured')
  const { data, error } = await client.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Supabase session has expired')
  return data.session.access_token
}

async function workerError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string }
    return body.error || `Document gateway returned ${response.status}`
  } catch {
    return `Document gateway returned ${response.status}`
  }
}

export async function fetchPrivateDocument(
  location: PrivateDocumentLocation,
  options: { signal?: AbortSignal; useSettingsSession?: boolean } = {},
): Promise<Blob> {
  if (location.storageProvider === 'supabase') {
    const client = options.useSettingsSession ? settingsSupabase : supabase
    if (!client) throw new Error('Supabase Storage is not configured')
    const { data, error } = await client.storage.from(location.bucket).createSignedUrl(location.path, 5 * 60)
    if (error) throw error
    const response = await fetch(data.signedUrl, { signal: options.signal })
    if (!response.ok) throw new Error(`Supabase Storage returned ${response.status}`)
    return response.blob()
  }

  if (!isDocumentWorkerConfigured || !workerUrl) throw new Error('Private document gateway is not configured')
  const token = await sessionToken(Boolean(options.useSettingsSession))
  const response = await fetch(`${workerUrl}/v1/documents/${encodeObjectKey(location.path)}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: options.signal,
  })
  if (!response.ok) throw new Error(await workerError(response))
  return response.blob()
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes))
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export function createImmutableDocumentPath(
  itemFg: string,
  documentType: R2DocumentType,
  filename: string,
): string {
  const safeItemFg = itemFg.trim().toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!safeItemFg) throw new Error('Item FG is required')
  const extension = filename.split('.').pop()?.toLocaleLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const revisionId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : randomHex(16)
  return `${documentType}/${safeItemFg}/revisions/${revisionId}.${extension}`
}

export async function uploadPrivateDocument(path: string, file: File): Promise<void> {
  if (!isDocumentWorkerConfigured || !workerUrl) throw new Error('Private document gateway is not configured')
  const token = await sessionToken(true)
  const response = await fetch(`${workerUrl}/v1/documents/${encodeObjectKey(path)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': file.type,
      'x-original-filename': encodeURIComponent(file.name),
    },
    body: file,
  })
  if (!response.ok) throw new Error(await workerError(response))
}
