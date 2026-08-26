#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readLocalEnvironment() {
  const contents = await readFile(path.join(projectRoot, '.env.local'), 'utf8')
  return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const separator = trimmed.indexOf('=')
    if (separator < 1) return []
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    return [[trimmed.slice(0, separator).trim(), value]]
  }))
}

async function main() {
  const environment = await readLocalEnvironment()
  const supabaseUrl = environment.VITE_SUPABASE_URL
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY
  const workerUrl = 'https://prpd-document-gateway.prpd-web.workers.dev'
  if (!supabaseUrl || !publishableKey) throw new Error('Supabase environment is incomplete')

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: signIn, error: signInError } = await supabase.auth.signInAnonymously()
  if (signInError || !signIn.session?.access_token) throw signInError || new Error('Anonymous session was not created')
  const token = signIn.session.access_token

  try {
    const checks = []
    for (const documentType of ['drawing', 'inprocess', 'qc']) {
      const { data, error } = await supabase.rpc('search_document_assets', {
        p_query: 'TM4207A',
        p_document_type: documentType,
        p_limit: 5,
      })
      if (error) throw error
      const asset = data?.find((row) => row.item_fg === 'TM4207A')
      if (!asset) throw new Error(`No active ${documentType} document found for TM4207A`)
      const objectUrl = `${workerUrl}/v1/documents/${asset.storage_path.split('/').map(encodeURIComponent).join('/')}`
      const response = await fetch(objectUrl, {
        headers: {
          authorization: `Bearer ${token}`,
          origin: 'https://smetaltech27-bit.github.io',
        },
      })
      if (!response.ok) throw new Error(`${documentType} gateway returned ${response.status}`)
      const contents = Buffer.from(await response.arrayBuffer())
      checks.push({
        documentType,
        itemFg: asset.item_fg,
        sizeBytes: contents.length,
        sizeMatches: contents.length === Number(asset.size_bytes),
        checksumMatches: createHash('sha256').update(contents).digest('hex') === asset.checksum_sha256,
      })
    }

    const { data: orphanRows, error: orphanError } = await supabase.rpc('search_document_assets', {
      p_query: '11207RB',
      p_document_type: 'drawing',
      p_limit: 5,
    })
    if (orphanError) throw orphanError
    const result = { checks, orphanSearchRows: orphanRows?.length ?? 0 }
    console.log(JSON.stringify(result, null, 2))
    if (checks.some((check) => !check.sizeMatches || !check.checksumMatches)) {
      throw new Error('A live document did not match Supabase metadata')
    }
    if ((orphanRows?.length ?? 0) !== 0) throw new Error('Orphan Item FG was exposed by document search')
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
