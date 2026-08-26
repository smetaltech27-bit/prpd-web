#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadataPath = path.join(projectRoot, 'supabase', 'seed', 'generated', 'document_assets.csv')
const wranglerPath = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      field = ''
    } else field += character
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''))
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function download(entry) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      wranglerPath,
      'r2', 'object', 'get', `${entry.storage_bucket}/${entry.storage_path}`,
      '--pipe',
      '--remote',
    ], {
      cwd: projectRoot,
      env: { ...process.env, WRANGLER_LOG: 'error', WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const chunks = []
    let errorOutput = ''
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => { errorOutput += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(errorOutput.trim().slice(-1500) || `Wrangler exited with code ${code}`))
    })
  })
}

async function main() {
  const rows = parseCsv(await readFile(metadataPath, 'utf8'))
  const samples = []
  for (const type of ['drawing', 'inprocess', 'qc']) {
    const typed = rows.filter((row) => row.document_type === type)
    for (const index of [0, Math.floor(typed.length / 2), typed.length - 1]) samples.push(typed[index])
  }
  const results = await Promise.all(samples.map(async (entry) => {
    const contents = await download(entry)
    const checksum = createHash('sha256').update(contents).digest('hex')
    return {
      type: entry.document_type,
      path: entry.storage_path,
      sizeBytes: contents.length,
      sizeMatches: contents.length === Number(entry.size_bytes),
      checksumMatches: checksum === entry.checksum_sha256,
    }
  }))
  console.log(JSON.stringify(results, null, 2))
  if (results.some((result) => !result.sizeMatches || !result.checksumMatches)) {
    throw new Error('One or more R2 samples did not match the local manifest')
  }
  console.log(`Verified ${results.length} R2 samples across Drawing, Inprocess, and QC`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
